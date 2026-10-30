import type { Agent, FacilityState, ModelId, Task } from "../core/types";
export function agentModel(state: FacilityState, agent: Agent): ModelId | null {
  const task = state.tasks.find((t) => t.id === agent.taskId);
  if (task?.model) return task.model;
  if (agent.skills.some((s) => s.startsWith("research"))) return "qwen";
  if (agent.skills.includes("design")) return "typeset";
  if (agent.skills.some((s) => ["brief", "list", "reply"].includes(s)))
    return state.operator?.active ?? "claude";
  return null;
}
export function failureSummary(message: string) {
  if (/Printify isn't connected/i.test(message))
    return {
      title: "Publishing is not connected",
      detail:
        "Your draft is saved. Connect Printify before publishing this product.",
    };
  if (/Claude Code|claude.*unavailable/i.test(message))
    return {
      title: "Claude could not finish this step",
      detail:
        "Your work is saved. Use Codex as the temporary operator, then retry this job when ready.",
    };
  if (/Codex.*unavailable/i.test(message))
    return {
      title: "Codex needs attention",
      detail:
        "Check sign-in and usage availability in the official Codex app, then retry this step.",
    };
  if (/Ollama|Qwen/i.test(message))
    return {
      title: "Local research is waiting",
      detail:
        "Check that Ollama is running with Qwen installed, then retry the job.",
    };
  return {
    title: "This step needs attention",
    detail: message.startsWith("Unexpected error")
      ? "The step stopped safely. Your earlier work is saved."
      : message.slice(0, 180),
  };
}
export function taskState(state: FacilityState, task: Task) {
  if (task.state === "done") return "Completed";
  if (task.state === "active") return "Working";
  if (task.state === "queued")
    return task.waiting ? "Waiting for model" : "Queued";
  return state.approvals.some(
    (a) =>
      a.taskId === task.id && a.status === "pending" && a.kind === "failure",
  )
    ? "Stopped safely"
    : "Ready for review";
}
export const ROOM_DESCRIPTIONS: Record<string, string> = {
  command:
    "Set priorities, follow the work, and hand command between Claude and Codex.",
  security:
    "Approval protection, model data access, and the facility's activity record.",
  vault:
    "Monthly model usage and budget limits. Sales and profit connections are still to come.",
  "etsy-lab":
    "Explore product directions with Qwen and trace each recommendation to its source.",
  "etsy-studio":
    "Create and revise artwork. Local typography is connected; the image-generation handoff comes next.",
  "etsy-qc":
    "Check artwork file integrity before listing preparation. Supplier print checks and your creative review are still required.",
  "etsy-factory":
    "Prepare product details and listing copy for your creative review.",
  "etsy-comms":
    "Customer care workspace. Live customer messaging is not connected yet.",
  dock: "Approved products wait here for the publishing connection. Nothing is published yet.",
};
