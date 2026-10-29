import { describe, expect, it } from "vitest";
import { rooms, wings } from "../core/seed";
import { buildLayout } from "../facility/layout";
import {
  DROP,
  LIFT_R,
  liftPoint,
  liftStops,
  moveToward,
  PIT_X,
  plateOfLevel,
  plateOfY,
  platesFor,
  sceneX,
  SHAFT_W,
  SHAFT_X,
  walkOnPlate,
  WALL_H,
  type Point3,
} from "./coords";
import { crateSlot, roomBounds } from "./rooms";

const layout = buildLayout(wings, rooms);
const plates = platesFor(layout);
const stops = liftStops(layout);
const bounds = rooms.map((r) => ({ id: r.id, level: layout.rooms.get(r.id)!.level, ...roomBounds(layout.rooms.get(r.id)!) }));

const insideRoom = (p: Point3) => bounds.some((b) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && Math.abs(p.y - b.floor) < 0.01);

describe("3D facility geometry", () => {
  it("puts the surface first and steps each level down and toward the viewer", () => {
    expect(plates).toHaveLength(layout.levels.length + 1);
    expect(plates[0].y).toBe(0);
    for (let i = 1; i < plates.length; i++) {
      expect(plates[i].y).toBe(plates[i - 1].y - DROP);
      // Each level starts where the one above drops away.
      expect(plates[i].zBack).toBe(plates[i - 1].zFront);
    }
  });

  it("keeps the dock on the surface and every wing's rooms on its own level", () => {
    expect(roomBounds(layout.rooms.get("dock")!).floor).toBe(0);
    for (const b of bounds) expect(b.floor).toBe(plateOfLevel(b.level).y);
  });

  it("keeps rooms inside the pit, clear of the lift lane, and clear of each other", () => {
    for (const b of bounds) {
      expect(b.x0).toBeGreaterThanOrEqual(-PIT_X);
      expect(b.x1).toBeLessThanOrEqual(PIT_X);
      if (b.level >= 0) expect(b.x1 <= SHAFT_X - SHAFT_W / 2 || b.x0 >= SHAFT_X + SHAFT_W / 2).toBe(true);
    }
    for (let i = 0; i < bounds.length; i++) {
      for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i];
        const b = bounds[j];
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1 && a.floor === b.floor).toBe(false);
      }
    }
  });

  it("keeps room walls below the level above, so the rock shows over them", () => {
    expect(WALL_H).toBeLessThan(DROP);
  });

  it("has the crew stand inside rooms and walk the corridor in front of them", () => {
    for (const b of bounds) {
      const p = plateOfLevel(b.level);
      expect(p.zRoom).toBeGreaterThan(b.z0);
      expect(p.zRoom).toBeLessThan(b.z1);
      expect(p.zCorridor).toBeGreaterThan(b.z1);
      expect(p.zCorridor).toBeLessThan(p.zFront);
    }
  });

  it("centres the facility on the lift", () => {
    expect(sceneX(480)).toBe(0);
    expect(SHAFT_X).toBeCloseTo(0);
  });
});

describe("lift rides", () => {
  it("knows which level a walking height belongs to", () => {
    stops.forEach((y, i) => expect(plateOfY(y, stops)).toBe(i));
    expect(liftPoint(stops[1], stops)).toBeNull();
  });

  it("runs from one corridor down to the next without jumps, walls or climbing back up", () => {
    for (let i = 0; i + 1 < stops.length; i++) {
      const from = plates[i];
      const to = plates[i + 1];
      const path: Point3[] = [{ x: SHAFT_X, y: from.y, z: from.zCorridor }];
      for (let k = 1; k < 400; k++) path.push(liftPoint(stops[i] + ((stops[i + 1] - stops[i]) * k) / 400, stops)!);
      path.push({ x: SHAFT_X, y: to.y, z: to.zCorridor });
      for (let k = 1; k < path.length; k++) {
        const a = path[k - 1];
        const b = path[k];
        expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeLessThan(0.5);
        expect(b.y).toBeLessThanOrEqual(a.y);
        expect(b.x).toBe(SHAFT_X);
        expect(insideRoom(b)).toBe(false);
      }
      // The drop happens inside the lift tube, just past the upper level's edge.
      const dropping = path.filter((p) => p.y < from.y && p.y > to.y);
      for (const p of dropping) expect(p.z).toBeCloseTo(from.zFront + LIFT_R);
    }
  });
});

describe("walking between rooms", () => {
  it("goes out to the corridor, along it, and only then into the next room", () => {
    const p = plateOfLevel(1);
    const lab = roomBounds(layout.rooms.get("etsy-lab")!);
    const comms = roomBounds(layout.rooms.get("etsy-comms")!);
    let at: Point3 = { x: lab.cx, y: p.y, z: p.zRoom };
    const goal = { x: comms.cx, y: p.y, z: p.zRoom };
    for (let k = 0; k < 2000 && (at.x !== goal.x || at.z !== goal.z); k++) {
      at = walkOnPlate(at, goal, p.zCorridor, 0.2);
      const leaving = at.x === lab.cx;
      const arriving = at.x === goal.x;
      expect(leaving || arriving || at.z === p.zCorridor).toBe(true);
    }
    expect(at).toEqual(goal);
  });

  it("moves straight toward a point without overshooting", () => {
    const step = moveToward({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }, 1);
    expect(step.x).toBeCloseTo(0.6);
    expect(step.z).toBeCloseTo(0.8);
    expect(moveToward({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }, 10)).toEqual({ x: 3, y: 0, z: 4 });
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
