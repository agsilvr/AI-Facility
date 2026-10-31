import type { FacilityState, ModelId } from "./types";
import { currentResearch, readResearch, RESEARCH_SOURCES } from "./research";
import { workAlive, workStatus } from "./operations";

/** Current facts only. Old activity messages are not present-tense state. */
export function operationalFacts(state: FacilityState, now: number, connected = true) {
  const operations = state.operations ?? [];
  const pending = state.approvals.filter((a) => a.status === "pending" && state.tasks.some((t) => t.id === a.taskId && t.state === "awaiting_approval"));
  return {
    running: connected ? state.tasks.filter((t) => t.state === "active").length + operations.filter((op) => workAlive(op, now)).length : 0,
    queued: state.tasks.filter((t) => t.state === "queued").length,
    approvals: pending.filter((a) => a.kind !== "failure").length,
    stopped: pending.filter((a) => a.kind === "failure").length + operations.filter((op) => workStatus(op, now) === "blocked" || (!connected && op.status === "running")).length,
    paused: operations.filter((op) => workStatus(op, now) === "paused").length,
    completed24h: state.tasks.filter((t) => t.state === "done" && t.updatedAt <= now && now - t.updatedAt < 86_400_000).length,
    maintenance: connected ? operations.filter((op) => op.phase === "maintenance" && workAlive(op, now)).length : 0,
  };
}

export function factualBriefing(state: FacilityState, now: number) {
  const f = operationalFacts(state, now);
  return `${f.completed24h} internal jobs completed in the last 24 hours. ${f.running} running, ${f.queued} queued, ${f.approvals} awaiting approval, ${f.stopped} stopped and ${f.paused} shared work items paused. Revenue and profit are unknown: accounting is not connected. Internal completions are not sales.`;
}

export function modelConnection(state: FacilityState, id: ModelId, now: number, connected: boolean) {
  if (!connected) return "Offline";
  if (id === "deepseek") return "Reader not connected";
  if (state.unavailable?.includes(id)) return "Unavailable";
  if (state.tasks.some((t) => t.model === id && t.state === "active") || state.operations?.some((op) => op.worker === id && workAlive(op, now))) return "In use";
  if (id === "typeset") return "Local code";
  if (id === "qwen") return "Ready · local check";
  return "Sign-in unverified";
}

export function researchReadiness(state: FacilityState, now: number) {
  const notebooks = state.tasks.filter((t) => t.workflowId === "research-test");
  const open = notebooks.find((t) => t.state !== "done");
  if (open) return { label: open.state === "awaiting_approval" ? "Stopped" : "Queued / running", detail: open.waiting || "Open the research job for its current stage." };
  const valid = notebooks.some((t) => t.state === "done" && !t.flags.some((f) => f.level === "block") && currentResearch(readResearch(t.brief), now));
  return valid
    ? { label: "Saved evidence analyzed", detail: "Automatic repeats wait for a changed evidence pack. Product demand remains unverified." }
    : { label: "Evidence check needed", detail: `Sources checked ${RESEARCH_SOURCES[0].checkedAt}. Historical notebooks are retained; only current, validated evidence can feed new products.` };
}
