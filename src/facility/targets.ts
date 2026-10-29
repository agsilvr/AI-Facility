import type { FacilityState } from "../core/types";
import type { FacilityLayout } from "./layout";
import type { Target } from "./movement";

/** Where an agent should stand: its current room, spaced out from room-mates. */
export function targetFor(state: FacilityState, layout: FacilityLayout, agentId: string): Target | null {
  const agent = state.agents.find((a) => a.id === agentId);
  const room = agent && layout.rooms.get(agent.roomId);
  if (!agent || !room) return null;
  const mates = state.agents.filter((a) => a.roomId === agent.roomId);
  const slot = mates.findIndex((a) => a.id === agentId);
  const spacing = Math.min(30, (room.rect.w - 40) / Math.max(1, mates.length));
  return {
    x: room.rect.x + 24 + slot * spacing + spacing / 2,
    y: room.floorY,
    level: room.level,
  };
}
