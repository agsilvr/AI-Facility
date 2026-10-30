import { MODELS, route, type Load } from "./models";
import { canWorkStage } from "./capabilities";
import { checkDraft, hasBlockingFlag, serializeDraft } from "./safety";
import type {
  Agent,
  AgentId,
  Approval,
  ApprovalId,
  Draft,
  FacilityState,
  Flag,
  LogLevel,
  ModelId,
  OperatorId,
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

  /** Give a queued task to an idle agent and send the agent to the stage's room. */
  assign(taskId: TaskId, agentId: AgentId) {
    const task = this.task(taskId);
    const agent = this.agent(agentId);
    if (!task || !agent || task.state !== "queued" || agent.status !== "idle" || agent.taskId || this.overBudget(task.wingId)) return;
    const stage = this.stagesOf(task)[task.stageIndex];
    if (!stage || !canWorkStage(agent, task.wingId, stage)) return;
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
    const picked = stage.job ? route(stage.job, stage.data ?? "customer", { ...load, unavailable }) : null;
    if (picked && !picked.ok) {
      if (task.waiting !== picked.reason) {
        this.patchTask(taskId, { waiting: picked.reason });
        this.log(`${task.title}: ${picked.reason}.`, "warning", task.wingId);
      }
      return;
    }
    const model = picked?.model;
    this.patchTask(taskId, { state: "active", agentId, progress: 0, model, waiting: undefined, runToken: this.nextId("run") });
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
    const stage = this.stagesOf(task)[task.stageIndex];
    if (!stage?.action || !task.draft) return false;
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
  decide(approvalId: ApprovalId, approve: boolean): boolean {
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
    if (!task) return;
    this.rollMonth();
    this.patchTask(taskId, { cost: task.cost + cost });
    this.commit({ ...this.state,
      spend: { ...this.state.spend, [task.wingId]: (this.state.spend[task.wingId] ?? 0) + cost },
      modelSpend: model ? { ...this.state.modelSpend, [model]: (this.state.modelSpend[model] ?? 0) + cost } : this.state.modelSpend,
    });
  }

  setAgentPaused(agentId: AgentId, paused: boolean) {
    const agent = this.agent(agentId);
    if (!agent) return;
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
