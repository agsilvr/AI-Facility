import { describe, expect, it } from "vitest";
import { agents, rooms, wings } from "../core/seed";
import type { Agent } from "../core/types";
import { buildLayout } from "../facility/layout";
import type { Target } from "../facility/movement";
import { plateOfLevel } from "./coords";
import type { Pose } from "./crew";
import { CrewMotion } from "./motion";
import { roomBounds } from "./rooms";

const layout = buildLayout(wings, rooms);
const agent: Agent = { ...agents[0], status: "idle" };

function targetIn(roomId: string): Target {
  const rl = layout.rooms.get(roomId)!;
  return { x: rl.rect.x + rl.rect.w / 2, y: rl.floorY, level: rl.level };
}

/** Run a crew member from one room to another and record every pose. */
function walk(from: string, to: string) {
  const motion = new CrewMotion(layout);
  const poses: Pose[] = [motion.advance(agent, targetIn(from), 1 / 30)];
  for (let i = 0; i < 30 * 60; i++) poses.push(motion.advance(agent, targetIn(to), 1 / 30));
  return poses;
}

function roomAt(p: Pose) {
  return rooms.find((r) => {
    const b = roomBounds(layout.rooms.get(r.id)!);
    return p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && Math.abs(p.y - b.floor) < 0.01;
  })?.id;
}

describe("crew motion in 3D", () => {
  it("walks between rooms on a level without passing through any other room", () => {
    const poses = walk("etsy-lab", "etsy-comms");
    for (const p of poses) expect([undefined, "etsy-lab", "etsy-comms"]).toContain(roomAt(p));
    const end = poses[poses.length - 1];
    expect(roomAt(end)).toBe("etsy-comms");
    expect(end.walking).toBe(false);
  });

  it("takes the lift between levels and ends up standing in the new room", () => {
    const poses = walk("etsy-lab", "command");
    expect(poses.some((p) => p.riding)).toBe(true);
    for (let i = 1; i < poses.length; i++) {
      const a = poses[i - 1];
      const b = poses[i];
      // No teleporting: every frame is a short step.
      expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeLessThan(1.5);
      expect([undefined, "etsy-lab", "command"]).toContain(roomAt(b));
    }
    const end = poses[poses.length - 1];
    expect(roomAt(end)).toBe("command");
    expect(end.y).toBe(plateOfLevel(0).y);
    expect(end.riding).toBe(false);
  });

  it("faces the viewer when idle and its work when working", () => {
    const motion = new CrewMotion(layout);
    expect(motion.advance(agent, targetIn("vault"), 0.1).heading).toBe(0);
    expect(motion.advance({ ...agent, status: "working" }, targetIn("vault"), 0.1).heading).toBe(Math.PI);
    expect(motion.positionOf(agent.id)).toBeDefined();
    expect(motion.positionOf("nobody")).toBeUndefined();
  });
});
