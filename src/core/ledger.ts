import { MODELS, route, type Load } from "./models";
import { WORK_LEASE_MS, WORK_PHASES, workAlive, type WorkStart, type WorkReport, type WorkStatus } from "./operations";
import { canWorkStage } from "./capabilities";
import { etsyPublishHold } from "./etsy";
import { checkDraft, hasBlockingFlag, serializeDraft } from "./safety";
import type {
  Agent,
  AgentId,
  ArtworkAsset,
  Approval,
  ApprovalId,
  Draft,
  FacilityState,
  Flag,
  LogLevel,
  ModelId,
  OperatorId,
  QueueArchive,
  Stage,
  Task,
  TaskId,
  WingId,
} from "./types";

type Listener = () => void;

const MAX_LOG = 200;
// Finished tasks and decided approvals kept in live state; older ones are only counted.
const KEEP_FINISHED = 60;

/**
 * How long an approval card can wait, and how long an approval stays good
 * once given. Anything older is stale: the owner sends it back for a fresh draft.
 */
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export function completedKey(wingId: WingId, workflowId: string) {
  return `${wingId}/${workflowId}`;
}

/** Total finished tasks, optionally for one wing. */
export function completedCount(state: FacilityState, wingId?: WingId) {
  return Object.entries(state.completed)
    .filter(([key]) => !wingId || key.startsWith(`${wingId}/`))
    .reduce((sum, [, n]) => sum + n, 0);
}

export function monthKey(at: number) {
  return new Date(at).toISOString().slice(0, 7);
}

/**
 * Every change to the facility goes through a method here. The server owns the
 * ledger and saves its state; the browser only ever sees snapshots of it.
 * Each change produces a new state object, so a snapshot never changes under you.
 */
export class Ledger {
  private state: FacilityState;
  private listeners = new Set<Listener>();
  private seq = 0;
  /** Models the router skips; set by whoever runs the crew, not saved. */
  private unavailable: ModelId[] = [];
  /** Only live calls can answer after a reset; retain their wing for late usage accounting. */
  private retiredRuns = new Map<TaskId, WingId>();
  private now: () => number;

  constructor(initial: FacilityState, now: () => number = Date.now) {
    this.state = initial;
    this.now = now;
  }

  getState = (): FacilityState => this.state;

  /**
   * Prepare a saved state for a fresh start. Work that was mid-stage when the
   * facility stopped goes back to the queue rather than being assumed finished.
   */
  static recover(saved: FacilityState): FacilityState {
    const interrupted = saved.tasks.filter((t) => t.state === "active").length;
    const state: FacilityState = {
      ...saved,
      operations: (saved.operations ?? []).map((op) => op.status === "running" ? {
        ...op, status: "blocked", runToken: undefined, leaseUntil: undefined, updatedAt: Date.now(),
        summary: "Worker connection interrupted by restart. Saved handoff retained.",
        history: [...op.history, { at: Date.now(), phase: op.phase, status: "blocked", summary: "Facility restarted; reconnect from the saved handoff.", worker: op.worker }],
      } : op),
      tasks: saved.tasks.map((t) => {
        const withFlags = { ...t, flags: t.flags ?? [] };
        return t.state === "active" ? { ...withFlags, state: "queued", agentId: null, progress: 0, model: undefined, runToken: undefined } : withFlags;
      }),
      approvals: saved.approvals.map((a) => ({ ...a, flags: a.flags ?? [] })),
      modelSpend: saved.modelSpend ?? {},
      agents: saved.agents.map((a) =>
        a.status === "paused" ? { ...a, taskId: null } : { ...a, status: "idle", taskId: null },
      ),
    };
    const note = {
      id: `log-recover-${Date.now().toString(36)}`,
      at: Date.now(),
      wingId: null,
      level: "info" as const,
      text: `Facility restarted. ${interrupted} interrupted task${interrupted === 1 ? "" : "s"} returned to the queue.`,
    };
    return { ...state, log: [note, ...state.log].slice(0, MAX_LOG) };
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: FacilityState) {
    this.state = next;
    for (const l of this.listeners) l();
  }

  private nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}-${this.now().toString(36)}-${this.seq}`;
  }

  wing(id: WingId) {
    return this.state.wings.find((w) => w.id === id);
  }

  stagesOf(task: Task): Stage[] {
    const wing = this.wing(task.wingId);
    return wing?.workflows.find((w) => w.id === task.workflowId)?.stages ?? [];
  }

  /** Budgets are monthly: start the spend figures afresh when the month changes. */
  private rollMonth() {
    const month = monthKey(this.now());
    if (month === this.state.spendMonth) return;
    this.commit({ ...this.state, spend: {}, modelSpend: {}, spendMonth: month });
    this.log(`New month (${month}). Budgets reset.`);
  }

  overBudget(wingId: WingId): boolean {
    this.rollMonth();
    const wing = this.wing(wingId);
    if (!wing) return true;
    return (this.state.spend[wingId] ?? 0) >= wing.budgetMonthly;
  }

  log(text: string, level: LogLevel = "info", wingId: WingId | null = null) {
    const entry = { id: this.nextId("log"), at: this.now(), wingId, level, text };
    this.commit({ ...this.state, log: [entry, ...this.state.log].slice(0, MAX_LOG) });
  }

  createTask(wingId: WingId, workflowId: string, title: string): Task {
    const at = this.now();
    const task: Task = {
      id: this.nextId("task"),
      wingId,
      workflowId,
      title,
      stageIndex: 0,
      state: "queued",
      agentId: null,
      progress: 0,
      cost: 0,
      createdAt: at,
      updatedAt: at,
      notes: [],
      flags: [],
    };
    this.commit({ ...this.state, tasks: [...this.state.tasks, task] });
    this.log(`New task: ${title}`, "info", wingId);
    return task;
  }

  /** A single durable claim per work item, regardless of which official app runs it. */
  startOperation(input: WorkStart) {
    this.expireOperations();
    const old = this.state.operations?.find((op) => op.id === input.id);
    if ((old?.revision ?? 0) !== input.expectedRevision) throw new Error("Work changed. Read its current handoff before claiming it.");
    if (old?.status === "running") throw new Error("This work already has a live worker.");
    const phase = WORK_PHASES[input.phase];
    const agent = this.agent(phase.agentId);
    if (!agent || agent.status !== "idle" || agent.taskId || this.operationBusy(agent.id)) throw new Error("The responsible workstation is already occupied or paused.");
    if (this.overBudget(agent.wingId)) throw new Error("This wing's monthly budget is exhausted.");
    const at = this.now();
    const record = {
      id: input.id, title: input.title, phase: input.phase, worker: input.worker, status: "running" as const,
      revision: (old?.revision ?? 0) + 1, runToken: this.nextId("work-run"), heartbeatAt: at, leaseUntil: at + WORK_LEASE_MS,
      updatedAt: at, summary: input.summary, context: input.context ?? old?.context ?? "",
      nextStep: input.nextStep ?? old?.nextStep ?? "", references: input.references ?? old?.references ?? [],
      history: [...(old?.history ?? []), { at, phase: input.phase, status: "running" as const, summary: input.summary, worker: input.worker }].slice(-100),
    };
    this.commit({ ...this.state, operations: [...(this.state.operations ?? []).filter((op) => op.id !== input.id), record] });
    this.log(`${MODELS[input.worker].name} started ${phase.label}: ${input.title}`, "info", agent.wingId);
    return record;
  }

  /** Save observed results/owner feedback without starting a worker, including while paused. */
  checkpointOperation(input: WorkStart & { status: Exclude<WorkStatus, "running"> }) {
    this.expireOperations();
    const old = this.state.operations?.find((op) => op.id === input.id);
    if ((old?.revision ?? 0) !== input.expectedRevision || old?.status === "running") throw new Error("Work changed or has a live worker. Read its current handoff first.");
    const at = this.now();
    const record = { id: input.id, title: input.title, phase: input.phase, worker: input.worker, status: input.status,
      revision: (old?.revision ?? 0) + 1, heartbeatAt: at, updatedAt: at, summary: input.summary,
      context: input.context ?? old?.context ?? "", nextStep: input.nextStep ?? old?.nextStep ?? "", references: input.references ?? old?.references ?? [],
      history: [...(old?.history ?? []), { at, phase: input.phase, status: input.status, summary: input.summary, worker: input.worker }].slice(-100) };
    this.commit({ ...this.state, operations: [...(this.state.operations ?? []).filter((op) => op.id !== input.id), record] });
    this.log(`Saved handoff · ${WORK_PHASES[input.phase].label}: ${input.summary}`, "info");
    return record;
  }

  reportOperation(id: string, input: WorkReport) {
    this.expireOperations();
    const old = this.state.operations?.find((op) => op.id === id);
    if (!old || !workAlive(old, this.now()) || old.runToken !== input.runToken) throw new Error("Worker claim expired or was stopped. Read the saved handoff before continuing.");
    const at = this.now();
    const status = input.status ?? "running";
    const summary = input.summary ?? old.summary;
    const changed = status !== old.status || summary !== old.summary || input.context !== undefined || input.nextStep !== undefined || input.references !== undefined;
    const next = { ...old, status, summary, context: input.context ?? old.context, nextStep: input.nextStep ?? old.nextStep,
      references: input.references ?? old.references, heartbeatAt: at, updatedAt: changed ? at : old.updatedAt,
      runToken: status === "running" ? old.runToken : undefined, leaseUntil: status === "running" ? at + WORK_LEASE_MS : undefined,
      history: changed ? [...old.history, { at, phase: old.phase, status, summary, worker: old.worker }].slice(-100) : old.history,
    };
    this.commit({ ...this.state, operations: this.state.operations!.map((op) => op.id === id ? next : op) });
    if (changed) this.log(`${WORK_PHASES[old.phase].label} · ${status}: ${summary}`, status === "done" ? "success" : status === "blocked" ? "warning" : "info", this.agent(WORK_PHASES[old.phase].agentId)!.wingId);
    return next;
  }

  operationBusy(agentId: string) {
    return (this.state.operations ?? []).some((op) => WORK_PHASES[op.phase].agentId === agentId && workAlive(op, this.now()));
  }

  expireOperations() {
    for (const op of this.state.operations ?? []) {
      if (op.status === "running" && !workAlive(op, this.now())) this.stopOperation(op.id, "blocked", "Worker heartbeat lost. Saved work is retained; reconnect before continuing.");
    }
  }

  stopOperations(reason: string, agentId?: string) {
    for (const op of this.state.operations ?? []) {
      if (op.status === "running" && (!agentId || WORK_PHASES[op.phase].agentId === agentId)) this.stopOperation(op.id, "paused", reason);
    }
  }

  private stopOperation(id: string, status: WorkStatus, summary: string) {
    const old = this.state.operations?.find((op) => op.id === id);
    if (!old) return;
    const at = this.now();
    this.commit({ ...this.state, operations: this.state.operations!.map((op) => op.id === id ? {
      ...old, status, summary, updatedAt: at, runToken: undefined, leaseUntil: undefined,
      history: [...old.history, { at, phase: old.phase, status, summary, worker: old.worker }].slice(-100),
    } : op) });
    this.log(`${WORK_PHASES[old.phase].label} · ${status}: ${summary}`, status === "blocked" ? "warning" : "info");
  }

  /** Stop old local work, preserving its records before invalidating every run claim. */
  resetQueue(id: string, reason: string, persist: (archive: QueueArchive, next: FacilityState) => void): QueueArchive {
    const tasks = this.state.tasks.filter((task) => task.state !== "done");
    const removed = new Set(tasks.map((task) => task.id));
    const approvals = this.state.approvals.filter((approval) => removed.has(approval.taskId) || approval.status === "pending");
    const archivedApprovals = new Set(approvals.map((approval) => approval.id));
    const operations = (this.state.operations ?? []).filter((op) => op.status !== "done");
    const archive: QueueArchive = { id, at: this.now(), reason, tasks, approvals, ...(operations.length ? { operations } : {}) };
    const next: FacilityState = {
      ...this.state,
      tasks: this.state.tasks.filter((task) => !removed.has(task.id)),
      approvals: this.state.approvals.filter((approval) => !archivedApprovals.has(approval.id)),
      operations: (this.state.operations ?? []).filter((op) => op.status === "done"),
      agents: this.state.agents.map((agent) => removed.has(agent.taskId ?? "")
        ? { ...agent, taskId: null, status: agent.status === "paused" ? "paused" : "idle" }
        : agent),
    };
    // If storage fails, keep the live queue exactly as it was. No lost archive.
    persist(archive, next);
    for (const task of tasks) if (task.state === "active") this.retiredRuns.set(task.id, task.wingId);
    this.commit(next);
    this.log(`Queue reset: ${tasks.length} unfinished tasks archived. ${reason}`, "info");
    return archive;
  }

  /** Give a queued task to an idle agent and send the agent to the stage's room. */
  assign(taskId: TaskId, agentId: AgentId) {
    const task = this.task(taskId);
    const agent = this.agent(agentId);
    if (!task || !agent || task.state !== "queued" || agent.status !== "idle" || agent.taskId || this.operationBusy(agent.id) || this.overBudget(task.wingId)) return;
    if (task.artworkRequest && !task.artwork) return;
    const stage = this.stagesOf(task)[task.stageIndex];
    if (!stage || !canWorkStage(agent, task.wingId, stage)) return;
    if (stage.action === "etsy.publishListing") {
      const hold = etsyPublishHold(this.state, task, this.now());
      if (hold) {
        if (task.waiting !== hold) {
          this.patchTask(task.id, { waiting: hold });
          this.log(`${task.title}: ${hold}`, "warning", task.wingId);
        }
        return;
      }
    }
    if (stage.action && !this.mayAct(task)) {
      this.sendBackUnapproved(task, stage.label);
      return;
    }
    // Only a declared job/data class matching the agent's capability reaches
    // the router; missing labels were denied above.
    const load = this.load();
    // A single elected operator handles writing. Artwork still uses the local
    // type designer until a real image handoff is connected.
    const unavailable = [...(load.unavailable ?? [])];
    if (stage.job === "write" || stage.job === "brief") unavailable.push(this.operator().active === "claude" ? "codex" : "claude");
    if (stage.job === "design") unavailable.push("codex");
    const picked = stage.job && stage.executor !== "code" ? route(stage.job, stage.data ?? "customer", { ...load, unavailable }) : null;
    if (picked && !picked.ok) {
      if (task.waiting !== picked.reason) {
        this.patchTask(taskId, { waiting: picked.reason });
        this.log(`${task.title}: ${picked.reason}.`, "warning", task.wingId);
      }
      return;
    }
    const model = picked?.model;
    const runToken = this.nextId("run");
    if (stage.action === "etsy.publishListing") {
      // Reserve before dispatch can hand a second worker a slot. The server
      // persists this commit synchronously before any outward code can run.
      this.commit({ ...this.state, etsyPublishAttempts: [...(this.state.etsyPublishAttempts ?? []), {
        taskId, runToken, at: this.now(), content: serializeDraft(task.draft),
      }] });
    }
    this.patchTask(taskId, { state: "active", agentId, progress: 0, model, waiting: undefined, runToken });
    this.patchAgent(agentId, { status: "working", taskId, roomId: stage.roomId });
    const using = model ? ` (${MODELS[model].name})` : "";
    this.log(`${agent.name} started "${stage.label}" on ${task.title}${using}`, "info", task.wingId);
  }

  /** How busy each model is and what it has spent this month, for the router. */
  load(): Load {
    this.rollMonth();
    const busy: Load["busy"] = {};
    for (const t of this.state.tasks) if (t.state === "active" && t.model) busy[t.model] = (busy[t.model] ?? 0) + 1;
    return { busy, spent: this.state.modelSpend, unavailable: this.unavailable };
  }

  /** Record work done on an active task. Returns true when the stage is finished. */
  work(taskId: TaskId, amount: number, cost: number): boolean {
    const task = this.task(taskId);
    if (!task || !this.mayWork(task)) return false;
    this.rollMonth();
    const progress = Math.min(1, task.progress + amount);
    this.patchTask(taskId, { progress, cost: task.cost + cost });
    // A model's cap is checked when a stage starts, so one stage can take it
    // just past the cap; the next stage waits or goes to the next model.
    const modelSpend = task.model ? { ...this.state.modelSpend, [task.model]: (this.state.modelSpend[task.model] ?? 0) + cost } : this.state.modelSpend;
    this.commit({
      ...this.state,
      spend: { ...this.state.spend, [task.wingId]: (this.state.spend[task.wingId] ?? 0) + cost },
      modelSpend,
    });
    return progress >= 1;
  }

  /** Recheck authority at execution and completion, including the current run's ownership. */
  mayWork(task: Task): boolean {
    const current = this.task(task.id);
    if (!current || current.state !== "active" || !current.runToken || current.runToken !== task.runToken ||
      current.stageIndex !== task.stageIndex || current.agentId !== task.agentId || current.model !== task.model) return false;
    const agent = current.agentId ? this.agent(current.agentId) : undefined;
    const stage = this.stagesOf(current)[current.stageIndex];
    return !!agent && !!stage && agent.status === "working" && agent.taskId === current.id && canWorkStage(agent, current.wingId, stage);
  }

  /**
   * True only when the task sits on an action stage and its draft is exactly
   * the content the owner approved. Actions must check this before running.
   */
  mayAct(task: Task): boolean {
    // A stale snapshot cannot reuse an approval or a reserved attempt.
    const current = this.task(task.id);
    if (!current || current.stageIndex !== task.stageIndex || current.runToken !== task.runToken) return false;
    task = current;
    const stage = this.stagesOf(task)[task.stageIndex];
    if (!stage?.action || !task.draft) return false;
    if (stage.action === "etsy.publishListing" && etsyPublishHold(this.state, task, this.now())) return false;
    if (task.approvedAt === undefined || this.now() - task.approvedAt > APPROVAL_TTL_MS) return false;
    return task.approvedContent !== undefined && task.approvedContent === serializeDraft(task.draft);
  }

  /** Has this approval card waited too long to be approved? */
  isExpired(approval: Approval) {
    return this.now() - approval.createdAt > APPROVAL_TTL_MS;
  }

  /**
   * Finish the current stage: request approval, hand back to the queue, or
   * complete. A stage may produce a draft; it is checked here, every time, and
   * the findings are stored with the task along with any input findings.
   */
  finishStage(taskId: TaskId, note: string, output: { draft?: Draft; inputFlags?: Flag[] } = {}) {
    const task = this.task(taskId);
    if (!task || !this.mayWork(task)) return;
    const stage = this.stagesOf(task)[task.stageIndex];
    if (!stage) return;
    if (stage.action) {
      // Checked again at the moment of acting, not just when the work started.
      if (!this.mayAct(task)) {
        this.releaseAgent(task.agentId);
        this.sendBackUnapproved(task, stage.label);
        return;
      }
      // An approval is good for one action only.
      this.patchTask(taskId, { approvedContent: undefined, approvedAt: undefined });
    }
    const notes = [...task.notes, `${stage.label}: ${note}`];
    const draft = output.draft ?? task.draft;
    const flags = [...task.flags.filter((f) => f.level === "warn"), ...(output.inputFlags ?? []), ...(draft ? checkDraft(draft) : [])];
    // An approval with nothing to look at would approve an action blind.
    if (stage.needsApproval && !draft) {
      flags.push({ level: "block", code: "no-draft", message: "There is nothing to review: this step produced no draft." });
    }
    this.releaseAgent(task.agentId);
    // Any new output invalidates an earlier approval.
    const changed = output.draft !== undefined;
    this.patchTask(taskId, { draft, flags, model: undefined, ...(changed ? { approvedContent: undefined } : {}) });

    if (stage.needsApproval) {
      const approval: Approval = {
        id: this.nextId("appr"),
        taskId,
        wingId: task.wingId,
        summary: note,
        content: draft ? serializeDraft(draft) : undefined,
        flags,
        status: "pending",
        createdAt: this.now(),
      };
      this.patchTask(taskId, { state: "awaiting_approval", agentId: null, notes });
      this.commit({ ...this.state, approvals: [approval, ...this.state.approvals] });
      this.log(`Needs your approval: ${task.title}`, "attention", task.wingId);
      return;
    }
    this.moveOn(taskId, notes);
  }

  /**
   * Record the owner's decision. Approval is refused (returns false) when the
   * content has blocking findings, or when the task's draft is no longer the
   * content the owner was shown.
   */
  decide(approvalId: ApprovalId, approve: boolean, feedback?: string): boolean {
    const approval = this.state.approvals.find((a) => a.id === approvalId);
    if (!approval || approval.status !== "pending") return false;
    const task = this.task(approval.taskId);
    if (approve) {
      if (hasBlockingFlag(approval.flags)) {
        this.log(`Can't approve "${task?.title}": it has a blocking safety finding. Send it back instead.`, "warning", approval.wingId);
        return false;
      }
      if (task && (approval.content ?? "null") !== serializeDraft(task.draft)) {
        this.log(`Can't approve "${task.title}": the draft changed after it was shown to you.`, "warning", approval.wingId);
        return false;
      }
      if (this.isExpired(approval)) {
        this.log(`Can't approve "${task?.title}": it waited more than a day. Send it back for a fresh draft.`, "warning", approval.wingId);
        return false;
      }
    }
    this.commit({
      ...this.state,
      approvals: this.state.approvals.map((a) =>
        a.id === approvalId
          ? { ...a, status: approve ? "approved" : "rejected", decidedAt: this.now() }
          : a,
      ),
    });
    if (!task) return true;
    if (approval.kind === "failure") {
      // A failed stage isn't rework: the same stage simply runs again.
      this.patchTask(task.id, { state: "queued", progress: 0 });
      this.log(`Trying again: ${task.title}`, "info", task.wingId);
      return true;
    }
    if (approve) {
      this.patchTask(task.id, { approvedContent: approval.content ?? "null", approvedAt: this.now() });
      this.log(`Approved: ${task.title}`, "success", task.wingId);
      this.moveOn(task.id, task.notes);
    } else {
      // Rejected work goes back one stage to be redone.
      this.patchTask(task.id, {
        state: "queued",
        stageIndex: task.workflowId === "listing" ? Math.max(0, this.stagesOf(task).findIndex((s) => s.id === "design")) : Math.max(0, task.stageIndex - 1),
        progress: 0,
        approvedContent: undefined,
        approvedAt: undefined,
        notes: feedback?.trim() ? [...task.notes, `Owner revision feedback: ${feedback.trim().slice(0, 1000)}`] : task.notes,
        revisionFeedback: feedback?.trim().slice(0, 1000) || task.revisionFeedback,
        ...(task.workflowId === "artwork-pilot" ? { artworkRequest: undefined, artwork: undefined, draft: undefined,
          revisionFeedback: feedback?.trim().slice(0, 1000) || "Please revise the composition and polish the artwork.",
        } : {}),
      });
      this.log(`Sent back for rework: ${task.title}`, "warning", task.wingId);
    }
    return true;
  }

  /**
   * Fail closed: a stage that went wrong (a model unreachable, an answer in
   * the wrong shape) stops, frees its agent and waits in Needs you. It can't
   * be approved, only tried again.
   */
  failStage(taskId: TaskId, reason: string) {
    const task = this.task(taskId);
    if (!task || task.state !== "active") return;
    const stage = this.stagesOf(task)[task.stageIndex];
    if (!stage) return;
    const flags: Flag[] = [{ level: "block", code: "stage-failed", message: reason }];
    const approval: Approval = {
      id: this.nextId("appr"),
      taskId,
      wingId: task.wingId,
      summary: `${stage.label} stopped`,
      flags,
      status: "pending",
      kind: "failure",
      createdAt: this.now(),
    };
    this.releaseAgent(task.agentId);
    this.patchTask(taskId, { state: "awaiting_approval", agentId: null, progress: 0, model: undefined });
    this.commit({ ...this.state, approvals: [approval, ...this.state.approvals] });
    this.log(`${stage.label} stopped on ${task.title}: ${reason}`, "warning", task.wingId);
  }

  /** Record what later stages work from, and name the task after it. */
  setBrief(taskId: TaskId, brief: string, title?: string) {
    if (!this.task(taskId)) return;
    this.patchTask(taskId, { brief, ...(title ? { title } : {}) });
  }

  /** A design handoff releases the worker and remains queued across restarts. */
  requestArtwork(taskId: TaskId, prompt: string) {
    const task = this.task(taskId);
    if (!task || task.workflowId !== "artwork-pilot" || this.stagesOf(task)[task.stageIndex]?.id !== "design" || !this.mayWork(task)) return false;
    const revision = task.notes.filter((n) => n.startsWith("Artwork request:")).length + 1;
    if (revision > 3) {
      this.failStage(taskId, "Three artwork attempts reached. Review the saved versions and revise the product brief before starting another concept; no automatic generation continues.");
      return false;
    }
    this.releaseAgent(task.agentId);
    this.patchTask(taskId, { state: "queued", agentId: null, model: undefined, runToken: undefined,
      artworkRequest: { id: this.nextId("artwork"), prompt, revision }, artwork: undefined,
      waiting: "Artwork brief ready for the Codex image-generation handoff.",
      notes: [...task.notes, `Artwork request: revision ${revision} ready for generation.`] });
    this.log(`Artwork brief ready: ${task.title}`, "attention", task.wingId);
    return true;
  }

  /** Receiving a local draft never approves it, and a stale handoff cannot replace it. */
  receiveArtwork(taskId: TaskId, requestId: string, asset: ArtworkAsset) {
    const task = this.task(taskId);
    if (!task || task.workflowId !== "artwork-pilot" || task.state !== "queued" || this.stagesOf(task)[task.stageIndex]?.id !== "design" || task.artworkRequest?.id !== requestId || task.artwork) return false;
    this.patchTask(taskId, { artwork: { ...asset, requestId }, waiting: undefined, draft: undefined, approvedContent: undefined, approvedAt: undefined });
    this.log(`Generated artwork received: ${task.title}. Quality review comes next.`, "success", task.wingId);
    return true;
  }

  /** Models the router must skip, e.g. ones not connected on this Mac yet. */
  setUnavailable(models: ModelId[]) {
    this.unavailable = models;
    if (JSON.stringify(this.state.unavailable) !== JSON.stringify(models)) this.commit({ ...this.state, unavailable: models });
  }

  operator() {
    return this.state.operator ?? { active: "claude" as const, generation: 0, changedAt: 0, reason: "Primary operator", automatic: true };
  }

  /** Compare-and-swap handoff. Existing answers lose their claim before new work is dispatched. */
  handoff(active: OperatorId, expectedGeneration: number, reason: string): boolean {
    const current = this.operator();
    if (expectedGeneration !== current.generation) return false;
    if (active === current.active) return true;
    for (const task of this.state.tasks) {
      if (task.state !== "active" || (task.model !== "claude" && task.model !== "codex")) continue;
      this.releaseAgent(task.agentId);
      this.patchTask(task.id, { state: "queued", agentId: null, progress: 0, model: undefined, runToken: undefined });
    }
    this.commit({ ...this.state, operator: { ...current, active, generation: current.generation + 1, changedAt: this.now(), reason } });
    this.log(`${active === "codex" ? "Codex" : "Claude"} took command. ${reason} Shared jobs and approvals retained.`, "info");
    return true;
  }

  interruptActive() {
    for (const task of this.state.tasks) {
      if (task.state !== "active") continue;
      this.releaseAgent(task.agentId);
      this.patchTask(task.id, { state: "queued", agentId: null, progress: 0, model: undefined, runToken: undefined });
    }
  }

  /** Usage is recorded even when an answer fails or arrives after a handoff. */
  recordUsage(taskId: string, model: ModelId | undefined, cost: number) {
    if (!Number.isFinite(cost) || cost <= 0) return;
    const task = this.task(taskId);
    const wingId = task?.wingId ?? this.retiredRuns.get(taskId);
    if (!wingId) return;
    this.rollMonth();
    if (task) this.patchTask(taskId, { cost: task.cost + cost });
    this.commit({ ...this.state,
      spend: { ...this.state.spend, [wingId]: (this.state.spend[wingId] ?? 0) + cost },
      modelSpend: model ? { ...this.state.modelSpend, [model]: (this.state.modelSpend[model] ?? 0) + cost } : this.state.modelSpend,
    });
  }

  setAgentPaused(agentId: AgentId, paused: boolean) {
    const agent = this.agent(agentId);
    if (!agent) return;
    if (paused) this.stopOperations("Owner paused this workstation. Saved handoff retained.", agentId);
    if (paused && agent.taskId) {
      // Hand the task back to the queue so another agent can pick it up.
      this.patchTask(agent.taskId, { state: "queued", agentId: null, runToken: undefined, model: undefined });
    }
    this.patchAgent(agentId, { status: paused ? "paused" : "idle", taskId: null });
    this.log(`${agent.name} ${paused ? "paused" : "resumed"}`, "info", agent.wingId);
  }

  /** Fail closed: an action without a valid approval goes back to be redone and approved again. */
  private sendBackUnapproved(task: Task, label: string) {
    this.patchTask(task.id, {
      state: "queued",
      agentId: null,
      progress: 0,
      stageIndex: Math.max(0, task.stageIndex - 1),
      approvedContent: undefined,
      approvedAt: undefined,
      model: undefined,
    });
    this.log(`Blocked "${label}" on ${task.title}: it no longer matches a current approval from you. Sent back for review.`, "warning", task.wingId);
  }

  private moveOn(taskId: TaskId, notes: string[]) {
    const task = this.task(taskId);
    if (!task) return;
    const last = task.stageIndex >= this.stagesOf(task).length - 1;
    if (last) {
      this.patchTask(taskId, { state: "done", agentId: null, progress: 1, notes });
      const key = completedKey(task.wingId, task.workflowId);
      const completed = { ...this.state.completed, [key]: (this.state.completed[key] ?? 0) + 1 };
      this.commit({ ...this.state, completed });
      this.prune();
      this.log(`Completed: ${task.title}`, "success", task.wingId);
    } else {
      this.patchTask(taskId, {
        state: "queued",
        agentId: null,
        stageIndex: task.stageIndex + 1,
        progress: 0,
        notes,
      });
    }
  }

  /** Keep live state small: drop the oldest finished tasks and decided approvals. */
  private prune() {
    const done = this.state.tasks.filter((t) => t.state === "done");
    if (done.length <= KEEP_FINISHED) return;
    const drop = new Set(
      done
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .slice(0, done.length - KEEP_FINISHED)
        .map((t) => t.id),
    );
    const decided = this.state.approvals.filter((a) => a.status !== "pending");
    const keepDecided = new Set(decided.slice(0, KEEP_FINISHED).map((a) => a.id));
    this.commit({
      ...this.state,
      tasks: this.state.tasks.filter((t) => !drop.has(t.id)),
      approvals: this.state.approvals.filter(
        (a) => a.status === "pending" || (keepDecided.has(a.id) && !drop.has(a.taskId)),
      ),
    });
  }

  private releaseAgent(agentId: AgentId | null) {
    if (!agentId) return;
    const agent = this.agent(agentId);
    if (!agent || agent.status === "paused") return;
    this.patchAgent(agentId, { status: "idle", taskId: null });
  }

  task(id: TaskId) {
    return this.state.tasks.find((t) => t.id === id);
  }

  agent(id: AgentId) {
    return this.state.agents.find((a) => a.id === id);
  }

  private patchTask(id: TaskId, patch: Partial<Task>) {
    const updatedAt = this.now();
    this.commit({
      ...this.state,
      tasks: this.state.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt } : t)),
    });
  }

  private patchAgent(id: AgentId, patch: Partial<Agent>) {
    this.commit({
      ...this.state,
      agents: this.state.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  }
}
