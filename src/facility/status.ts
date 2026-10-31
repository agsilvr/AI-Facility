import type { FacilityState, Room, RoomId, Task } from "../core/types";
import { WORK_PHASES, workAlive, workStatus } from "../core/operations";

// What each room shows comes from the ledger only, so the map always agrees
// with the sidebar.

export interface Selection {
  kind: "room" | "agent";
  id: string;
}

/** The room a task's current stage happens in. */
export function roomOfTask(state: FacilityState, task: Task): RoomId | undefined {
  const stages = state.wings.find((w) => w.id === task.wingId)?.workflows.find((w) => w.id === task.workflowId)?.stages;
  return stages?.[task.stageIndex]?.roomId;
}

/** A room needs the owner when work in it waits for approval. The command center shows all of it. */
export function roomNeedsAttention(state: FacilityState, room: Room) {
  if ((state.operations ?? []).some((op) => workStatus(op) === "blocked" && (room.kind === "command" || WORK_PHASES[op.phase].roomId === room.id))) return true;
  if (room.kind === "command") return state.approvals.some((a) => a.status === "pending");
  return state.approvals.some((a) => {
    if (a.status !== "pending") return false;
    const task = state.tasks.find((t) => t.id === a.taskId);
    return task !== undefined && roomOfTask(state, task) === room.id;
  });
}

export type RoomSignal = "running" | "blocked" | "paused" | "review" | "waiting" | "done" | "idle";
export function roomSignal(state: FacilityState, roomId: string, running = true, now = Date.now()): RoomSignal {
  const tasks = state.tasks.filter((t) => roomOfTask(state, t) === roomId);
  const ops = (state.operations ?? []).filter((op) => WORK_PHASES[op.phase].roomId === roomId);
  if (tasks.some((t) => t.state === "active") || ops.some((op) => workAlive(op, now))) return "running";
  if (ops.some((op) => workStatus(op, now) === "blocked") || tasks.some((t) => state.approvals.some((a) => a.taskId === t.id && a.status === "pending" && a.kind === "failure"))) return "blocked";
  if (ops.some((op) => op.status === "paused") || (!running && tasks.some((t) => t.state !== "done"))) return "paused";
  if (tasks.some((t) => t.state === "awaiting_approval")) return "review";
  if (ops.some((op) => op.status === "waiting") || tasks.some((t) => t.state === "queued")) return "waiting";
  if ((state.operations ?? []).some((op) => op.history.some((event) => WORK_PHASES[event.phase].roomId === roomId && event.status === "done")) || state.tasks.some((t) => {
    const stages = state.wings.find((w) => w.id === t.wingId)?.workflows.find((wf) => wf.id === t.workflowId)?.stages ?? [];
    return stages.some((stage, i) => stage.roomId === roomId && (i < t.stageIndex || t.state === "done"));
  })) return "done";
  return "idle";
}
export const SIGNAL_LABELS: Record<RoomSignal, string> = {
  running: "In progress", blocked: "Stopped", paused: "Paused", review: "Review", waiting: "Waiting", done: "Completed", idle: "Idle",
};

/** A clear approval queue is not the same as an empty or healthy operation. */
export function commandScreen(state: FacilityState, now = Date.now()) {
  const approvals = state.approvals.filter((a) => a.status === "pending");
  const failures = approvals.filter((a) => a.kind === "failure").length;
  const blocked = failures + (state.operations ?? []).filter((op) => workStatus(op, now) === "blocked").length;
  if (blocked) return { headline: "WORK STOPPED", detail: `${blocked} BLOCKED`, tone: "blocked" as const };
  const reviews = approvals.length - failures;
  if (reviews) return { headline: "NEEDS YOU", detail: `${reviews} TO REVIEW`, tone: "review" as const };
  const paused = (state.operations ?? []).filter((op) => op.status === "paused").length;
  if (paused) return { headline: "WORK ON HOLD", detail: `${paused} PAUSED`, tone: "paused" as const };
  const active = state.tasks.filter((t) => t.state === "active").length + (state.operations ?? []).filter((op) => workAlive(op, now)).length;
  if (active) return { headline: "WORK RUNNING", detail: `${active} ACTIVE`, tone: "running" as const };
  const waiting = state.tasks.filter((t) => t.state === "queued").length + (state.operations ?? []).filter((op) => op.status === "waiting").length;
  if (waiting) return { headline: "WORK WAITING", detail: `${waiting} QUEUED`, tone: "waiting" as const };
  return { headline: "UP TO DATE", detail: "NO OPEN WORK", tone: "idle" as const };
}

/** Tasks being worked on, or waiting for approval, in a room. */
export function tasksInRoom(state: FacilityState, roomId: RoomId) {
  return state.tasks.filter(
    (t) => (t.state === "active" || t.state === "awaiting_approval") && roomOfTask(state, t) === roomId,
  ).length;
}

export function pendingApprovals(state: FacilityState) {
  return state.approvals.filter((a) => a.status === "pending").length;
}
