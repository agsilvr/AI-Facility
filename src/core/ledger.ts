import type {
  Agent,
  AgentId,
  Approval,
  ApprovalId,
  FacilityState,
  LogLevel,
  Stage,
  Task,
  TaskId,
  WingId,
} from "./types";

type Listener = () => void;

const MAX_LOG = 200;

/**
 * In-memory ledger. Every change goes through a method here so that later a
 * database-backed ledger can replace it without touching the view or agents.
 * Each change produces a new state object, which React reads as a snapshot.
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

  overBudget(wingId: WingId): boolean {
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
    this.patchTask(taskId, { state: "active", agentId, progress: 0 });
    this.patchAgent(agentId, { status: "working", taskId, roomId: stage.roomId });
    this.log(`${agent.name} started "${stage.label}" on ${task.title}`, "info", task.wingId);
  }

  /** Record work done on an active task. Returns true when the stage is finished. */
  work(taskId: TaskId, amount: number, cost: number): boolean {
    const task = this.task(taskId);
    if (!task || task.state !== "active") return false;
    const progress = Math.min(1, task.progress + amount);
    this.patchTask(taskId, { progress, cost: task.cost + cost });
    this.commit({
      ...this.state,
      spend: { ...this.state.spend, [task.wingId]: (this.state.spend[task.wingId] ?? 0) + cost },
    });
    return progress >= 1;
  }

  /** Finish the current stage: request approval, hand back to the queue, or complete. */
  finishStage(taskId: TaskId, note: string) {
    const task = this.task(taskId);
    if (!task) return;
    const stage = this.stagesOf(task)[task.stageIndex];
    if (!stage) return;
    const notes = [...task.notes, `${stage.label}: ${note}`];
    this.releaseAgent(task.agentId);

    if (stage.needsApproval) {
      const approval: Approval = {
        id: this.nextId("appr"),
        taskId,
        wingId: task.wingId,
        summary: note,
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

  decide(approvalId: ApprovalId, approve: boolean) {
    const approval = this.state.approvals.find((a) => a.id === approvalId);
    if (!approval || approval.status !== "pending") return;
    const task = this.task(approval.taskId);
    this.commit({
      ...this.state,
      approvals: this.state.approvals.map((a) =>
        a.id === approvalId
          ? { ...a, status: approve ? "approved" : "rejected", decidedAt: this.now() }
          : a,
      ),
    });
    if (!task) return;
    if (approve) {
      this.log(`Approved: ${task.title}`, "success", task.wingId);
      this.moveOn(task.id, task.notes);
    } else {
      // Rejected work goes back one stage to be redone.
      this.patchTask(task.id, {
        state: "queued",
        stageIndex: Math.max(0, task.stageIndex - 1),
        progress: 0,
      });
      this.log(`Sent back for rework: ${task.title}`, "warning", task.wingId);
    }
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
