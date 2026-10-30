import { describe, expect, it } from "vitest";
import { rooms, wings } from "../core/seed";
import type { Room, Wing } from "../core/types";
import { AISLE, buildLayout, contains, DOOR_W, layoutKey, roomAt, roomWidth, STAND_Y, type Rect } from "./layout";
import { placeWalker, route, step, type Target } from "./movement";

const layout = buildLayout(wings, rooms);
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("floor plan", () => {
  it("places every room inside the facility, on one side of the hall or the other, without overlaps", () => {
    const all = [...layout.rooms.values()];
    expect(all).toHaveLength(rooms.length);
    for (const r of all) {
      expect(r.rect.x).toBeGreaterThanOrEqual(0);
      expect(r.rect.y).toBeGreaterThanOrEqual(0);
      expect(r.rect.x + r.rect.w).toBeLessThanOrEqual(layout.width);
      expect(r.rect.y + r.rect.h).toBeLessThanOrEqual(layout.height);
      expect(overlaps(r.rect, layout.hall)).toBe(false);
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i].rect, all[j].rect)).toBe(false);
  });

  it("opens every room onto the hall through a door in the wall facing it", () => {
    for (const r of layout.rooms.values()) {
      expect(contains(r.floor, r.door.inside.x, r.door.inside.y)).toBe(true);
      expect(contains(layout.hall, r.door.outside.x, r.door.outside.y)).toBe(true);
      expect(r.door.outside.y).toBe(layout.laneY);
      // The door is straight across from the hall, and the doorway fits inside the wall.
      expect(r.door.outside.x).toBe(r.door.inside.x);
      expect(r.door.inside.x - DOOR_W / 2).toBeGreaterThan(r.rect.x);
      expect(r.door.inside.x + DOOR_W / 2).toBeLessThan(r.rect.x + r.rect.w);
      const corridor = layout.corridors!.find((c) => contains(c, r.door.inside.x, r.door.outside.y));
      expect(corridor).toBeDefined();
    }
  });

  it("branches service rooms around the command bridge without forcing a rectangle", () => {
    const command = layout.rooms.get("command")!;
    expect(command.rect.y).toBeLessThan(layout.rooms.get("vault")!.rect.y);
    expect(layout.rooms.get("vault")!.rect.x).toBeLessThan(command.rect.x);
    expect(layout.rooms.get("security")!.rect.x).toBeGreaterThan(command.rect.x + command.rect.w);
    for (const room of layout.rooms.values()) if (room !== command) expect(room.rect.w * room.rect.h).toBeLessThan(command.rect.w * command.rect.h);
    expect(layout.center.x).toBe(command.rect.x + command.rect.w / 2);
    expect(layout.corridors!.length).toBeGreaterThan(1);
  });

  it("reads left to right from research through design, checks, publishing and outbox", () => {
    const ids = ["etsy-lab", "etsy-studio", "etsy-qc", "etsy-factory", "dock"];
    const xs = ids.map((id) => layout.rooms.get(id)!.door.outside.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    const sides = ids.map((id) => layout.rooms.get(id)!.side);
    expect(sides).toContain("top"); expect(sides).toContain("bottom");
  });

  it("keeps every room's connecting spur out of other rooms", () => {
    for (const room of layout.rooms.values()) {
      const x = room.door.inside.x;
      const edge = room.side === "top" ? room.rect.y + room.rect.h : room.rect.y;
      const spur = { x: x - 15, y: Math.min(edge, layout.laneY), w: 30, h: Math.abs(edge - layout.laneY) };
      for (const other of layout.rooms.values()) if (other !== room) expect(overlaps(spur, other.rect), `${room.roomId} crosses ${other.roomId}`).toBe(false);
    }
  });

  it("adds a new business without moving any room relative to the Command Center", () => {
    const newWing: Wing = { id: "candles", name: "Candle Wing", color: "#f472b6", budgetMonthly: 5, workflows: [] };
    const newRooms: Room[] = [{ id: "candles-factory", wingId: "candles", name: "Factory Line", kind: "factory", theme: "goods" }];
    const bigger = buildLayout([...wings, newWing], [...rooms, ...newRooms]);
    const shift = bigger.center.x - layout.center.x;
    for (const [id, r] of layout.rooms) expect(bigger.rooms.get(id)!.rect).toEqual({ ...r.rect, x: r.rect.x + shift });
    expect(bigger.width).toBeGreaterThan(layout.width);
    // The third business goes on the right, after the first.
    expect(bigger.rooms.get("candles-factory")!.rect.x).toBeGreaterThan(layout.width);
  });

  it("gives every room workstations on the stand line, clear of the walkway from its door", () => {
    for (const r of layout.rooms.values()) {
      for (const st of r.stations) {
        expect(st.y).toBe(r.floor.y + STAND_Y);
        expect(contains(r.floor, st.x, st.y)).toBe(true);
        if (r.side === "bottom") expect(Math.abs(st.x - r.door.inside.x)).toBeGreaterThan(AISLE);
      }
      if (r.kind !== "sealed") expect(r.stations.length).toBeGreaterThan(0);
    }
  });

  it("finds the room a point is in", () => {
    const lab = layout.rooms.get("etsy-lab")!;
    expect(roomAt(layout, lab.door.inside)?.roomId).toBe("etsy-lab");
    expect(roomAt(layout, lab.door.outside)).toBeUndefined();
  });

  it("has the same key for fresh copies of the same wings and rooms, so the map isn't rebuilt", () => {
    const copy = JSON.parse(JSON.stringify({ wings, rooms }));
    expect(layoutKey(copy.wings, copy.rooms)).toBe(layoutKey(wings, rooms));
    expect(layoutKey(wings, rooms.slice(1))).not.toBe(layoutKey(wings, rooms));
  });
});

/** Walk from one room to a spot in another, recording every position. */
function walk(fromRoom: string, toRoom: string) {
  const spot = (id: string): Target => {
    const f = layout.rooms.get(id)!.floor;
    return { roomId: id, x: f.x + 20, y: f.y + 40 };
  };
  let w = placeWalker(spot(fromRoom));
  const trail = [{ x: w.x, y: w.y }];
  for (let i = 0; i < 4000 && (i === 0 || w.moving || w.path.length); i++) {
    w = step(layout, w, spot(toRoom), 1 / 30);
    trail.push({ x: w.x, y: w.y });
  }
  return { trail, end: w, target: spot(toRoom) };
}

describe("rooms", () => {
  it("gives the shared core a command center, security checkpoint, vault and shipping dock", () => {
    const core = rooms.filter((r) => r.wingId === "core").map((r) => r.kind);
    expect(core).toEqual(expect.arrayContaining(["command", "security", "vault", "dock"]));
  });

  it("gives the Etsy wing research, design, quality control and print publishing", () => {
    const etsy = rooms.filter((r) => r.wingId === "etsy");
    expect(etsy.map((r) => r.kind)).toEqual(expect.arrayContaining(["lab", "studio", "qc", "factory", "comms"]));
    expect(etsy.find((r) => r.kind === "factory")?.theme).toBe("prints");
  });

  it("still lays out a room whose kind it doesn't know, such as one from older saved data", () => {
    const old = [...rooms, { id: "old-bay", wingId: "etsy", name: "Old Bay", kind: "bay" } as unknown as Room];
    const plan = buildLayout(wings, old);
    expect(plan.rooms.get("old-bay")?.rect.w).toBe(roomWidth("bay"));
  });
});

describe("walking", () => {
  it("goes out of the door, along the hall and in through the other door", () => {
    const { trail, end, target } = walk("etsy-lab", "command");
    expect(end).toMatchObject({ x: target.x, y: target.y, moving: false });
    for (const p of trail) {
      // Always on a room floor, in a doorway, or in the hall: never inside a wall or in the dirt.
      const inRoom = [...layout.rooms.values()].some((r) => contains(r.floor, p.x, p.y));
      const inDoorway = [...layout.rooms.values()].some((r) => Math.abs(p.x - r.door.inside.x) < 1 && p.y >= Math.min(r.door.inside.y, r.door.outside.y) && p.y <= Math.max(r.door.inside.y, r.door.outside.y));
      expect(inRoom || inDoorway || contains(layout.hall, p.x, p.y)).toBe(true);
      // And only ever through the two rooms involved.
      const room = roomAt(layout, p);
      if (room) expect(["etsy-lab", "command"]).toContain(room.roomId);
    }
  });

  it("only moves straight up, down, left or right", () => {
    const { trail } = walk("vault", "etsy-factory");
    for (let i = 1; i < trail.length; i++) {
      const dx = trail[i].x - trail[i - 1].x;
      const dy = trail[i].y - trail[i - 1].y;
      // Within one frame a corner can be turned, but a leg itself is never diagonal.
      if (dx !== 0 && dy !== 0) expect(Math.abs(dx) + Math.abs(dy)).toBeLessThanOrEqual(48 / 30 + 1e-9);
    }
  });

  it("crosses a room directly when the new spot is in the same room", () => {
    const f = layout.rooms.get("etsy-studio")!.floor;
    const points = route(layout, { x: f.x + 10, y: f.y + 30 }, { roomId: "etsy-studio", x: f.x + 60, y: f.y + 50 });
    expect(points).toEqual([{ x: f.x + 60, y: f.y + 30 }, { x: f.x + 60, y: f.y + 50 }]);
  });

  it("faces the way it walks, and the given way at rest", () => {
    const f = layout.rooms.get("vault")!.floor;
    const start = placeWalker({ roomId: "vault", x: f.x + 10, y: f.y + 40 });
    const right = step(layout, start, { roomId: "vault", x: f.x + 80, y: f.y + 40 }, 0.1);
    expect(right.facing).toBe("right");
    expect(step(layout, start, start.goal!, 0.1, "up").facing).toBe("up");
  });
});
