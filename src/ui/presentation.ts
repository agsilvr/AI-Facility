import type {
  Agent,
  FacilityState,
  ModelId,
  OperatorId,
  Task,
} from "../core/types";
import { operationModel, workStatus, type WorkOperation } from "../core/operations";
export function agentModel(state: FacilityState, agent: Agent): ModelId | null {
  const external = operationModel(state, agent.id);
  if (external) return external;
  const task = state.tasks.find((t) => t.id === agent.taskId);
  if (task?.model) return task.model;
  if (agent.skills.some((s) => s.startsWith("research"))) return "qwen";
  if (agent.skills.includes("design")) return "typeset";
  if (agent.skills.includes("brief")) return null;
  if (agent.skills.some((s) => ["list", "reply"].includes(s)))
    return state.operator?.active ?? "claude";
  return null;
}
export function needsLogin(message: string) {
  // Only explicit authentication failures belong in Login needed. Credits,
  // rate limits and unavailable connections need different recovery actions.
  return /(?:not|aren.t) (?:logged|signed) in|(?:log|sign)[ -]?in required|please (?:log|sign)[ -]?in|authentication[_ -](?:error|required|failed)|invalid (?:api key|authentication|credentials)|unauthori[sz]ed|expired (?:token|session)|run (?:\/login|claude auth login|codex login)/i.test(
    message,
  );
}
export const JOB_CATEGORIES = [
  { id: "all", label: "All jobs" },
  { id: "approval", label: "Approval" },
  { id: "login", label: "Login needed" },
  { id: "blocked", label: "Blocked" },
  { id: "active", label: "In progress" },
  { id: "waiting", label: "Waiting" },
  { id: "paused", label: "Paused" },
  { id: "done", label: "Done" },
] as const;
export type JobFilter = (typeof JOB_CATEGORIES)[number]["id"];
export type JobCategory = Exclude<(typeof JOB_CATEGORIES)[number]["id"], "all">;
export function operationCategory(work: WorkOperation, now = Date.now()): JobCategory {
  const status = workStatus(work, now);
  return status === "running" ? "active" : status === "paused" ? "paused" : status === "done" ? "done" : status === "blocked" ? "blocked" : "waiting";
}
export function jobCategory(state: FacilityState, task: Task): JobCategory {
  if (task.state === "done") return "done";
  if (task.state === "active") return "active";
  const pending = state.approvals.find(
    (a) => a.taskId === task.id && a.status === "pending",
  );
  if (pending && pending.kind !== "failure") return "approval";
  if (
    needsLogin(
      [task.waiting, ...(pending?.flags.map((f) => f.message) ?? [])].join(" "),
    )
  )
    return "login";
  if (pending?.kind === "failure") return "blocked";
  return "waiting";
}
export function taskTone(state: FacilityState, task: Task) {
  const category = jobCategory(state, task);
  return category === "done"
    ? "sage"
    : ["blocked", "login", "approval"].includes(category)
      ? "amber"
      : "";
}
export function failureSummary(
  message: string,
  operator: OperatorId = "claude",
) {
  if (needsLogin(message))
    return {
      title: "Sign-in required",
      detail:
        "Sign in through the model’s official app, then retry this step. Saved work is retained.",
    };
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
        operator === "codex"
          ? "Codex is now the active operator. Retry this step to continue from the saved work."
          : "Switch to Codex in Command, then retry this step. Saved work is retained.",
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
  if (task.state === "queued" && !task.waiting && !state.approvals.some((a) => a.taskId === task.id && a.status === "pending")) return "Queued";
  const category = jobCategory(state, task);
  if (category === "active")
    return task.state === "active" ? "Running" : "Queued";
  return JOB_CATEGORIES.find((c) => c.id === category)!.label;
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
    "Create and revise artwork through the Codex image handoff. Open Lab to start a research-to-artwork pilot.",
  "etsy-qc":
    "Check artwork file integrity before listing preparation. Supplier print checks and your creative review are still required.",
  "etsy-factory":
    "Prepare product details and listing copy for your creative review.",
  "etsy-comms":
    "Customer care workspace. Live customer messaging is not connected yet.",
  dock: "Approved products wait here for the publishing connection. Nothing is published yet.",
};
