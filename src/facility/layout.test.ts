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
      if (r.side === "top") expect(r.rect.y + r.rect.h).toBe(layout.hall.y);
      else expect(r.rect.y).toBe(layout.hall.y + layout.hall.h);
    }
  });

  it("puts the core in the middle, with the first business to its right and the next to its left", () => {
    expect(layout.wings.map((w) => [w.wingId, w.slot])).toEqual([
      ["expansion", -1],
      ["core", 0],
      ["etsy", 1],
    ]);
    for (let i = 1; i < layout.wings.length; i++) expect(layout.wings[i].x0).toBeGreaterThan(layout.wings[i - 1].x1);
    for (const r of layout.rooms.values()) {
      const wing = layout.wings.find((w) => w.wingId === r.wingId)!;
      expect(r.rect.x).toBeGreaterThanOrEqual(wing.x0);
      expect(r.rect.x + r.rect.w).toBeLessThanOrEqual(wing.x1);
    }
  });

  it("puts the Command Center at the heart of the core, biggest room, with the core's other rooms across the hall", () => {
    const command = layout.rooms.get("command")!;
    const core = layout.wings.find((w) => w.wingId === "core")!;
    expect(command.side).toBe("top");
    expect(command.rect.x + command.rect.w / 2).toBeCloseTo((core.x0 + core.x1) / 2, 0);
    expect(layout.center.x).toBeCloseTo(command.rect.x + command.rect.w / 2);
    for (const r of layout.rooms.values()) if (r !== command) expect(r.rect.w * r.rect.h).toBeLessThan(command.rect.w * command.rect.h);
    const across = ["vault", "security", "dock"].map((id) => layout.rooms.get(id)!);
    expect(across.map((r) => r.side)).toEqual(["bottom", "bottom", "bottom"]);
    expect(across.map((r) => r.rect.x)).toEqual([...across.map((r) => r.rect.x)].sort((a, b) => a - b));
  });

  it("lays a business out in the order its work flows, finishing next to the core", () => {
    // Research, then design, then the factory, which is the Etsy room nearest the core.
    const x = (id: string) => layout.rooms.get(id)!.rect.x;
    const etsy = rooms.filter((r) => r.wingId === "etsy").map((r) => r.id);
    expect(Math.min(...etsy.map(x))).toBe(x("etsy-factory"));
    expect(x("etsy-lab")).toBeGreaterThan(x("etsy-factory"));
    expect(x("etsy-studio")).toBeGreaterThan(x("etsy-comms"));
  });

  it("lines up both rows of a district, so each district is a tidy block", () => {
    for (const wing of layout.wings) {
      for (const side of ["top", "bottom"] as const) {
        const row = [...layout.rooms.values()].filter((r) => r.wingId === wing.wingId && r.side === side);
        if (!row.length) continue;
        expect(Math.min(...row.map((r) => r.rect.x))).toBe(wing.x0);
        expect(Math.max(...row.map((r) => r.rect.x + r.rect.w))).toBe(wing.x1);
      }
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
    expect(bigger.wings.find((w) => w.wingId === "candles")!.slot).toBe(2);
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

  it("gives the Etsy wing a research lab and a factory line that makes clothing", () => {
    const etsy = rooms.filter((r) => r.wingId === "etsy");
    expect(etsy.map((r) => r.kind)).toEqual(expect.arrayContaining(["lab", "studio", "factory", "comms"]));
    expect(etsy.find((r) => r.kind === "factory")?.theme).toBe("clothing");
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
