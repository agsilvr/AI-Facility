import type { FacilityState, Room, RoomId, Task } from "../core/types";

// What each room shows comes from the ledger only, so the 2D map and the 3D
// facility always agree with each other and with the sidebar.

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
  if (room.kind === "command") return state.approvals.some((a) => a.status === "pending");
  return state.approvals.some((a) => {
    if (a.status !== "pending") return false;
    const task = state.tasks.find((t) => t.id === a.taskId);
    return task !== undefined && roomOfTask(state, task) === room.id;
  });
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
