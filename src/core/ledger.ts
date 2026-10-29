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
  Stage,
  Task,
  TaskId,
  WingId,
} from "./types";

type Listener = () => void;

const MAX_LOG = 200;
// Finished tasks and decided approvals kept in live state; older ones are only counted.
const KEEP_FINISHED = 60;

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
        return t.state === "active" ? { ...withFlags, state: "queued", agentId: null, progress: 0 } : withFlags;
      }),
      approvals: saved.approvals.map((a) => ({ ...a, flags: a.flags ?? [] })),
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
    this.commit({ ...this.state, spend: {}, spendMonth: month });
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
    if (!task || !agent || task.state !== "queued" || agent.taskId) return;
    const stage = this.stagesOf(task)[task.stageIndex];
    if (!stage) return;
    if (stage.action && !this.mayAct(task)) {
      // Fail closed: the content no longer matches what the owner approved.
      this.patchTask(taskId, { state: "queued", stageIndex: Math.max(0, task.stageIndex - 1), approvedContent: undefined });
      this.log(`Blocked "${stage.label}" on ${task.title}: it no longer matches what you approved. Sent back for review.`, "warning", task.wingId);
      return;
    }
    this.patchTask(taskId, { state: "active", agentId, progress: 0 });
    this.patchAgent(agentId, { status: "working", taskId, roomId: stage.roomId });
    this.log(`${agent.name} started "${stage.label}" on ${task.title}`, "info", task.wingId);
  }

  /** Record work done on an active task. Returns true when the stage is finished. */
  work(taskId: TaskId, amount: number, cost: number): boolean {
    const task = this.task(taskId);
    if (!task || task.state !== "active") return false;
    this.rollMonth();
    const progress = Math.min(1, task.progress + amount);
    this.patchTask(taskId, { progress, cost: task.cost + cost });
    this.commit({
      ...this.state,
      spend: { ...this.state.spend, [task.wingId]: (this.state.spend[task.wingId] ?? 0) + cost },
    });
    return progress >= 1;
  }

  /**
   * True only when the task sits on an action stage and its draft is exactly
   * the content the owner approved. Actions must check this before running.
   */
  mayAct(task: Task): boolean {
    const stage = this.stagesOf(task)[task.stageIndex];
    if (!stage?.action || !task.draft) return false;
    return task.approvedContent !== undefined && task.approvedContent === serializeDraft(task.draft);
  }

  /**
   * Finish the current stage: request approval, hand back to the queue, or
   * complete. A stage may produce a draft; it is checked here, every time, and
   * the findings are stored with the task along with any input findings.
   */
  finishStage(taskId: TaskId, note: string, output: { draft?: Draft; inputFlags?: Flag[] } = {}) {
    const task = this.task(taskId);
    if (!task) return;
    const stage = this.stagesOf(task)[task.stageIndex];
    if (!stage) return;
    const notes = [...task.notes, `${stage.label}: ${note}`];
    const draft = output.draft ?? task.draft;
    const flags = [...(output.inputFlags ?? []), ...(draft ? checkDraft(draft) : [])];
    // An approval with nothing to look at would approve an action blind.
    if (stage.needsApproval && !draft) {
      flags.push({ level: "block", code: "no-draft", message: "There is nothing to review: this step produced no draft." });
    }
    this.releaseAgent(task.agentId);
    // Any new output invalidates an earlier approval.
    const changed = output.draft !== undefined;
    this.patchTask(taskId, { draft, flags, ...(changed ? { approvedContent: undefined } : {}) });

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
    if (approve) {
      this.patchTask(task.id, { approvedContent: approval.content ?? "null" });
      this.log(`Approved: ${task.title}`, "success", task.wingId);
      this.moveOn(task.id, task.notes);
    } else {
      // Rejected work goes back one stage to be redone.
      this.patchTask(task.id, {
        state: "queued",
        stageIndex: Math.max(0, task.stageIndex - 1),
        progress: 0,
        approvedContent: undefined,
      });
      this.log(`Sent back for rework: ${task.title}`, "warning", task.wingId);
    }
    return true;
  }

  setAgentPaused(agentId: AgentId, paused: boolean) {
    const agent = this.agent(agentId);
    if (!agent) return;
    if (paused && agent.taskId) {
      // Hand the task back to the queue so another agent can pick it up.
      this.patchTask(agent.taskId, { state: "queued", agentId: null });
    }
    this.patchAgent(agentId, { status: paused ? "paused" : "idle", taskId: null });
    this.log(`${agent.name} ${paused ? "paused" : "resumed"}`, "info", agent.wingId);
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
