import type { AgentId, ApprovalId, FacilityState } from "./types";

/** Whether the facility is running, and how fast the demo crew works. */
export interface Control {
  running: boolean;
  speed: number;
  /** Explicit saved policy, not inferred from the global run switch. */
  automaticProducts?: boolean;
  /** Demo: simulated crew with canned output. Live: real models do the work. Shown on screen either way. */
  mode: "demo" | "live";
}

/**
 * What the screens need from the facility. The server's Ledger satisfies it
 * directly; the browser uses RemoteFacility, which talks to the server.
 */
export interface FacilityPort {
  getState(): FacilityState;
  subscribe(listener: () => void): () => void;
  decide(approvalId: ApprovalId, approve: boolean): void;
  setAgentPaused(agentId: AgentId, paused: boolean): void;
}
