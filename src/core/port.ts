import type { AgentId, ApprovalId, FacilityState } from "./types";

/** Whether the facility is running, and how fast the demo crew works. */
export interface Control {
  running: boolean;
  speed: number;
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
