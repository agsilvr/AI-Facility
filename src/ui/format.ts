import type { FacilityState, Task } from "../core/types";

export function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function timeAgo(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export function stageLabel(state: FacilityState, task: Task) {
  const stages = state.wings
    .find((w) => w.id === task.wingId)
    ?.workflows.find((w) => w.id === task.workflowId)?.stages;
  if (task.state === "done") return "Done";
  return stages?.[task.stageIndex]?.label ?? "Unknown";
}
