import type { FacilityState } from "../core/types";
import type { FacilityLayout } from "./layout";
import type { Target } from "./movement";

/** Where an agent should stand: in their room, along the row of workstations, spaced out from room-mates. */
export function targetFor(state: FacilityState, layout: FacilityLayout, agentId: string): Target | null {
  const agent = state.agents.find((a) => a.id === agentId);
  const room = agent && layout.rooms.get(agent.roomId);
  if (!agent || !room) return null;
  const mates = state.agents.filter((a) => a.roomId === agent.roomId);
  const slot = mates.findIndex((a) => a.id === agentId);
  const f = room.floor;
  return {
    roomId: room.roomId,
    x: Math.round(f.x + (f.w * (slot + 1)) / (mates.length + 1)),
    y: f.y + 40,
  };
}
