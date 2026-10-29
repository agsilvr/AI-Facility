import type { FacilityState } from "../core/types";
import { STAND_Y, type FacilityLayout } from "./layout";
import type { Target } from "./movement";

/**
 * Where an agent should stand: at the next free workstation in their room, in
 * the order the crew are listed. If a room ever has more people than
 * workstations, the extras wait in a row nearer the front.
 */
export function targetFor(state: FacilityState, layout: FacilityLayout, agentId: string): Target | null {
  const agent = state.agents.find((a) => a.id === agentId);
  const room = agent && layout.rooms.get(agent.roomId);
  if (!agent || !room) return null;
  const mates = state.agents.filter((a) => a.roomId === agent.roomId);
  const slot = mates.findIndex((a) => a.id === agentId);
  const station = room.stations[slot];
  if (station) return { roomId: room.roomId, ...station };
  const extra = slot - room.stations.length;
  const extras = mates.length - room.stations.length;
  const f = room.floor;
  return { roomId: room.roomId, x: Math.round(f.x + (f.w * (extra + 1)) / (extras + 1)), y: f.y + STAND_Y + 16 };
}
