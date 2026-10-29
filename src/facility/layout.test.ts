import { describe, expect, it } from "vitest";
import { rooms, wings } from "../core/seed";
import { buildLayout, layoutKey, SHAFT, WORLD_W } from "./layout";
import { step } from "./movement";

describe("layout", () => {
  const layout = buildLayout(wings, rooms);

  it("places every room inside the world without overlapping the shaft", () => {
    for (const room of rooms) {
      const r = layout.rooms.get(room.id)!;
      expect(r).toBeDefined();
      expect(r.rect.x).toBeGreaterThanOrEqual(0);
      expect(r.rect.x + r.rect.w).toBeLessThanOrEqual(WORLD_W);
      if (r.level >= 0) {
        const overlapsShaft = r.rect.x < SHAFT.x + SHAFT.w && r.rect.x + r.rect.w > SHAFT.x;
        expect(overlapsShaft).toBe(false);
      }
    }
  });

  it("has the same key for fresh copies of the same wings and rooms, so views aren't rebuilt", () => {
    const copy = JSON.parse(JSON.stringify({ wings, rooms }));
    expect(layoutKey(copy.wings, copy.rooms)).toBe(layoutKey(wings, rooms));
    expect(layoutKey(wings, rooms.slice(1))).not.toBe(layoutKey(wings, rooms));
  });

  it("gives each wing its own level", () => {
    expect(layout.levels.map((l) => l.wingId)).toEqual(wings.map((w) => w.id));
  });
});

describe("movement", () => {
  it("walks to the shaft, changes level, then walks to the room", () => {
    const from = layout().rooms.get("etsy-lab")!;
    const to = layout().rooms.get("command")!;
    let w = { x: from.rect.x + 20, y: from.floorY, level: from.level, facing: 1, moving: false };
    const target = { x: to.rect.x + 30, y: to.floorY, level: to.level };
    for (let i = 0; i < 2000; i++) w = step(w, target, 0.05);
    expect(w).toMatchObject({ x: target.x, y: target.y, level: target.level, moving: false });
  });
});

function layout() {
  return buildLayout(wings, rooms);
}
