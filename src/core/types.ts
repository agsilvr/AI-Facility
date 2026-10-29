// The ledger is the single source of truth. Everything the facility shows is
// derived from these records, so the view can never claim work that isn't happening.

export type WingId = string;
export type RoomId = string;
export type AgentId = string;
export type TaskId = string;
export type ApprovalId = string;

/** A business, or the shared core. Each wing is one underground level. */
export interface Wing {
  id: WingId;
  name: string;
  /** Accent colour used for the wing's rooms and agents. */
  color: string;
  /** Monthly AI spend cap in US dollars. */
  budgetMonthly: number;
  /** The kinds of work this wing does, each an ordered list of stages. */
  workflows: Workflow[];
  /** Sealed wings are reserved for future businesses and show as locked. */
  sealed?: boolean;
}

export interface Workflow {
  id: string;
  label: string;
  stages: Stage[];
}

export interface Stage {
  id: string;
  label: string;
  /** Room where agents do this stage's work. */
  roomId: RoomId;
  /** Work in this stage waits for the owner's approval before it moves on. */
  needsApproval?: boolean;
}

export type RoomKind =
  | "command"
  | "vault"
  | "lab"
  | "studio"
  | "bay"
  | "comms"
  | "dock"
  | "sealed";

export interface Room {
  id: RoomId;
  wingId: WingId;
  name: string;
  kind: RoomKind;
}

export type AgentStatus = "idle" | "working" | "waiting" | "paused";

export interface Agent {
  id: AgentId;
  name: string;
  role: string;
  wingId: WingId;
  /** Stage ids this agent can work on. */
  skills: string[];
  status: AgentStatus;
  roomId: RoomId;
  taskId: TaskId | null;
  sprite: SpriteLook;
}

export interface SpriteLook {
  suit: string;
  visor: string;
}

export type TaskState = "queued" | "active" | "awaiting_approval" | "done" | "rejected";

export interface Task {
  id: TaskId;
  wingId: WingId;
  workflowId: string;
  title: string;
  stageIndex: number;
  state: TaskState;
  agentId: AgentId | null;
  /** 0..1 progress through the current stage. */
  progress: number;
  /** Dollars of AI usage spent on this task so far. */
  cost: number;
  createdAt: number;
  updatedAt: number;
  /** Short notes produced at each stage, shown in the inspector. */
  notes: string[];
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Approval {
  id: ApprovalId;
  taskId: TaskId;
  wingId: WingId;
  summary: string;
  status: ApprovalStatus;
  createdAt: number;
  decidedAt?: number;
}

export type LogLevel = "info" | "success" | "attention" | "warning";

export interface LogEntry {
  id: string;
  at: number;
  wingId: WingId | null;
  level: LogLevel;
  text: string;
}

export interface FacilityState {
  wings: Wing[];
  rooms: Room[];
  agents: Agent[];
  tasks: Task[];
  approvals: Approval[];
  log: LogEntry[];
  /** Spend this month per wing, in dollars. */
  spend: Record<WingId, number>;
}
