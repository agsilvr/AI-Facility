import { describe, expect, it } from "vitest";
import { rooms, wings } from "../core/seed";
import { buildLayout } from "../facility/layout";
import { BACK_Z, FRONT_Z, SHAFT_SCENE, sceneX, sceneY, WALK_Z } from "./coords";
import { crateSlot, roomBounds } from "./rooms";

const layout = buildLayout(wings, rooms);

describe("3D facility geometry", () => {
  it("keeps the dock on the surface and every level underground", () => {
    const dock = layout.rooms.get("dock")!;
    expect(sceneY(dock.floorY)).toBeGreaterThan(-1);
    for (const level of layout.levels) expect(sceneY(level.rect.y)).toBeLessThan(0);
  });

  it("stacks levels in wing order, each below the last", () => {
    const tops = layout.levels.map((l) => sceneY(l.rect.y));
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeLessThan(tops[i - 1]);
  });

  it("keeps rooms clear of the lift shaft and of each other", () => {
    const shaft = [SHAFT_SCENE.x - SHAFT_SCENE.w / 2, SHAFT_SCENE.x + SHAFT_SCENE.w / 2];
    const under = rooms.filter((r) => layout.rooms.get(r.id)!.level >= 0).map((r) => roomBounds(layout.rooms.get(r.id)!));
    for (const b of under) {
      expect(b.x1 <= shaft[0] || b.x0 >= shaft[1]).toBe(true);
      expect(b.h).toBeGreaterThan(5);
    }
    for (let i = 0; i < under.length; i++) {
      for (let j = i + 1; j < under.length; j++) {
        const a = under[i];
        const b = under[j];
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.floor < b.top && b.floor < a.top;
        expect(overlap).toBe(false);
      }
    }
  });

  it("walks the crew inside the rooms, between the back wall and the open front", () => {
    expect(WALK_Z).toBeGreaterThan(BACK_Z);
    expect(WALK_Z).toBeLessThan(FRONT_Z);
  });

  it("centres the facility on the origin", () => {
    expect(sceneX(480)).toBe(0);
    expect(SHAFT_SCENE.x).toBeCloseTo(0);
  });
});

describe("vault crates", () => {
  it("fills rows along the floor before stacking a new layer", () => {
    expect(crateSlot(0, 5)).toEqual({ col: 0, row: 0, layer: 0 });
    expect(crateSlot(4, 5)).toEqual({ col: 4, row: 0, layer: 0 });
    expect(crateSlot(5, 5)).toEqual({ col: 0, row: 1, layer: 0 });
    expect(crateSlot(15, 5)).toEqual({ col: 0, row: 0, layer: 1 });
  });

  it("never puts two crates in the same place", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 48; i++) {
      const s = crateSlot(i, 7);
      const key = `${s.col}/${s.row}/${s.layer}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
