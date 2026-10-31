import type { Agent, FacilityState, ModelId } from "./types";

// These records report work; they never grant platform, approval or model permissions.
export const WORK_PHASES = {
  research: { label: "Research", roomId: "etsy-lab", agentId: "scout" },
  design: { label: "Design", roomId: "etsy-studio", agentId: "muse" },
  quality: { label: "Quality check", roomId: "etsy-qc", agentId: "pip" },
  listing: { label: "Product & listing", roomId: "etsy-factory", agentId: "quill" },
  maintenance: { label: "Facility maintenance", roomId: "command", agentId: "warden" },
} as const;
export type WorkPhase = keyof typeof WORK_PHASES;
export type WorkStatus = "running" | "waiting" | "paused" | "blocked" | "done";
export const WORK_LEASE_MS = 90_000;
export interface WorkEvent { at: number; phase: WorkPhase; status: WorkStatus; summary: string; worker: string }
export interface WorkOperation {
  id: string;
  title: string;
  phase: WorkPhase;
  status: WorkStatus;
  worker: "codex" | "claude" | "qwen";
  revision: number;
  runToken?: string;
  heartbeatAt: number;
  leaseUntil?: number;
  updatedAt: number;
  summary: string;
  context: string;
  nextStep: string;
  /** References only. Recording an identifier does not verify a platform write. */
  references: string[];
  history: WorkEvent[];
}
export interface WorkStart {
  id: string; title: string; phase: WorkPhase; worker: WorkOperation["worker"];
  expectedRevision: number; summary: string; context?: string; nextStep?: string; references?: string[];
}
export interface WorkReport {
  runToken: string; status?: WorkStatus; summary?: string; context?: string; nextStep?: string; references?: string[];
}
export function workAlive(op: WorkOperation, now = Date.now()) {
  return op.status === "running" && (op.leaseUntil ?? 0) > now;
}
export function workStatus(op: WorkOperation, now = Date.now()): WorkStatus {
  return op.status === "running" && !workAlive(op, now) ? "blocked" : op.status;
}
export function operationForAgent(state: FacilityState, agentId: string, now = Date.now()) {
  const work = [...(state.operations ?? [])].reverse().filter((op) => WORK_PHASES[op.phase].agentId === agentId && op.status !== "done");
  return work.find((op) => workAlive(op, now)) ?? work[0];
}
export function visibleAgents(state: FacilityState, now = Date.now()): Agent[] {
  return state.agents.map((agent) => {
    const op = operationForAgent(state, agent.id, now);
    if (!op || agent.status === "paused") return agent;
    if (workAlive(op, now)) return { ...agent, status: "working", roomId: WORK_PHASES[op.phase].roomId };
    return agent.status === "idle" ? { ...agent, status: "waiting" } : agent;
  });
}
export function operationModel(state: FacilityState, agentId: string): ModelId | undefined {
  return operationForAgent(state, agentId)?.worker;
}
