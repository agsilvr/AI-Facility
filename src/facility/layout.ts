import type { Room, RoomId, RoomKind, Wing, WingId } from "../core/types";

// The facility's floor plan, in world pixels (one pixel of pixel art). It is
// one underground station seen from above: a long main hall runs left to
// right, and every room opens onto it through a door, with rooms along both
// sides.
//
// The plan is sorted so it reads at a glance:
// - The shared core sits in the middle, with the Command Center at its heart
//   and the core's other rooms (vault, security, dock) across the hall from it.
// - Each business is a district beside the core: the first to its right, the
//   next to its left, and so on outwards.
// - Inside a business district the rooms follow the order its work flows, so
//   work starts at the far end and finishes next to the core, where it's
//   approved and shipped.
// - Every district is a tidy block: both its rows of rooms end at the same
//   place, with the rooms stretched a little to line up.

export const TILE = 16;
/** Height of a room's back wall as seen from above (the face you see). */
export const WALL = 24;
/** Thickness of the side and front walls. */
export const RIM = 4;
export const HALL_H = 3 * TILE;
export const DOOR_W = 2 * TILE;
/** Dirt and rock around the station. */
export const MARGIN = 4 * TILE;
/** How far into a room, from the back wall, the crew stand at their workstations. */
export const STAND_Y = 40;
/** Half the width of the walkway kept clear from a room's door to its workstations. */
export const AISLE = 14;
const ROOM_GAP = TILE / 2;
const WING_GAP = 3 * TILE;
const MIN_DISTRICT = 8 * TILE;

/** Floor size of each kind of room, in tiles: width, then depth. The Command Center is the big one. */
const ROOM_SIZE: Record<RoomKind, [number, number]> = {
  command: [28, 8],
  security: [11, 6],
  vault: [9, 6],
  lab: [11, 6],
  studio: [11, 6],
  factory: [16, 6],
  comms: [10, 6],
  dock: [11, 6],
  sealed: [9, 6],
};
const DEFAULT_SIZE: [number, number] = [9, 6];

/**
 * Where people work in each kind of room, as fractions of the floor's width.
 * The room artwork puts a workstation at each one, so the crew always stand
 * at a desk, an easel or a machine. The first ones are used first.
 */
const STATIONS: Record<RoomKind, number[]> = {
  command: [0.5, 0.34, 0.66, 0.2, 0.8],
  security: [0.2, 0.8],
  vault: [0.22],
  lab: [0.18, 0.4, 0.76],
  studio: [0.24, 0.76, 0.6],
  factory: [0.14, 0.32, 0.68, 0.86],
  comms: [0.22, 0.78],
  dock: [0.78, 0.22],
  sealed: [0.5],
};

/** The core's rooms that sit across the hall from the Command Center, left to right. */
const CORE_ORDER: RoomKind[] = ["vault", "security", "dock"];

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Door {
  /** Just inside the room, in the doorway. */
  inside: Point;
  /** In the main hall, on the walking lane, in front of the door. */
  outside: Point;
}

export interface RoomLayout {
  roomId: RoomId;
  wingId: WingId;
  kind: RoomKind;
  /** The whole room, walls included. */
  rect: Rect;
  /** Where the crew can stand. */
  floor: Rect;
  door: Door;
  /** Rooms above the hall have their door at the bottom; rooms below, at the top. */
  side: "top" | "bottom";
  /** Where people stand to work, in order of use. Always on the stand line, never in the aisle. */
  stations: Point[];
}

export interface WingLayout {
  wingId: WingId;
  /** Left and right edges of the wing's stretch of the hall. */
  x0: number;
  x1: number;
  /** Where the district is, relative to the core: 0 is the core, 1 the first on the right, -1 the first on the left. */
  slot: number;
}

export interface FacilityLayout {
  width: number;
  height: number;
  hall: Rect;
  /** The y the crew walk along in the hall. */
  laneY: number;
  rooms: Map<RoomId, RoomLayout>;
  /** Districts from left to right. */
  wings: WingLayout[];
  /** The middle of the Command Center: where the map opens. */
  center: Point;
}

/**
 * A fingerprint of everything the layout and the room artwork depend on. Every
 * snapshot from the server carries fresh copies of the wings and rooms, so the
 * view compares this instead of object identity to avoid rebuilding the map on
 * every update.
 */
export function layoutKey(wings: Wing[], rooms: Room[]) {
  return JSON.stringify([
    wings.map((w) => [w.id, w.name, w.color, !!w.sealed, w.workflows.map((f) => f.stages.map((s) => s.roomId))]),
    rooms.map((r) => [r.id, r.wingId, r.name, r.kind, r.theme ?? ""]),
  ]);
}

function sizeOf(kind: RoomKind | string): [number, number] {
  return ROOM_SIZE[kind as RoomKind] ?? DEFAULT_SIZE;
}

/** The narrowest a room of this kind is, walls included. Rooms may be stretched wider to line up. */
export function roomWidth(kind: RoomKind | string) {
  return sizeOf(kind)[0] * TILE + RIM * 2;
}

export function roomHeight(kind: RoomKind | string) {
  return WALL + sizeOf(kind)[1] * TILE + RIM;
}

/** The core is the wing with the Command Center in it, or failing that the first wing. */
export function coreWingId(wings: Wing[], rooms: Room[]): WingId | undefined {
  return rooms.find((r) => r.kind === "command")?.wingId ?? wings[0]?.id;
}

/** Districts in order from the core outwards: 0 is the core, then 1, -1, 2, -2... */
function slotOf(index: number) {
  if (index === 0) return 0;
  return index % 2 === 1 ? (index + 1) / 2 : -index / 2;
}

/**
 * A business's rooms in the order its work flows through them: by first use in
 * its workflows, with rooms no workflow uses at the end.
 */
export function flowOrder(wing: Wing, own: Room[]): Room[] {
  const used = wing.workflows.flatMap((f) => f.stages.map((s) => s.roomId));
  const rank = (r: Room) => {
    const i = used.indexOf(r.id);
    return i === -1 ? used.length + own.indexOf(r) : i;
  };
  return [...own].sort((a, b) => rank(a) - rank(b));
}

interface Rows {
  top: Room[];
  bottom: Room[];
}

/** Which rooms go on which side of the hall, each row listed left to right. */
function districtRows(wing: Wing, own: Room[], slot: number): Rows {
  if (slot === 0) {
    const rank = (r: Room) => {
      const i = CORE_ORDER.indexOf(r.kind);
      return i === -1 ? CORE_ORDER.length : i;
    };
    const heart = own.filter((r) => r.kind === "command");
    const rest = own.filter((r) => r.kind !== "command").sort((a, b) => rank(a) - rank(b));
    return heart.length ? { top: heart, bottom: rest } : alternate(rest);
  }
  // Work flows towards the core: the first room is at the far end.
  const rows = alternate(flowOrder(wing, own));
  if (slot > 0) {
    rows.top.reverse();
    rows.bottom.reverse();
  }
  return rows;
}

function alternate(list: Room[]): Rows {
  const rows: Rows = { top: [], bottom: [] };
  list.forEach((room, i) => rows[i % 2 === 0 ? "top" : "bottom"].push(room));
  return rows;
}

function rowWidth(row: Room[]) {
  return row.reduce((sum, r) => sum + roomWidth(r.kind), 0) + Math.max(0, row.length - 1) * ROOM_GAP;
}

/** Room widths for a row stretched to fill a district, extra pixels shared out by size. */
function stretch(row: Room[], width: number): number[] {
  const base = row.map((r) => roomWidth(r.kind));
  const extra = width - rowWidth(row);
  const total = base.reduce((a, b) => a + b, 0);
  const widths = base.map((w) => w + Math.floor((extra * w) / total));
  // Rounding leftovers go to the last room, so the row ends exactly at the district's edge.
  if (widths.length) widths[widths.length - 1] += width - (widths.reduce((a, b) => a + b, 0) + (row.length - 1) * ROOM_GAP);
  return widths;
}

export function buildLayout(wings: Wing[], rooms: Room[]): FacilityLayout {
  const coreId = coreWingId(wings, rooms);
  const ordered = [...wings.filter((w) => w.id === coreId), ...wings.filter((w) => w.id !== coreId)];
  const districts = ordered.map((wing, i) => {
    const slot = slotOf(i);
    const rows = districtRows(wing, rooms.filter((r) => r.wingId === wing.id), slot);
    const width = Math.max(MIN_DISTRICT, rowWidth(rows.top), rowWidth(rows.bottom));
    return { wing, slot, rows, width };
  });
  districts.sort((a, b) => a.slot - b.slot);

  const allRooms = districts.flatMap((d) => [...d.rows.top, ...d.rows.bottom]);
  const tallest = (row: "top" | "bottom") =>
    Math.max(roomHeight("sealed"), ...districts.flatMap((d) => d.rows[row].map((r) => roomHeight(r.kind))));
  const hallY = MARGIN + tallest("top");
  const bottomY = hallY + HALL_H;
  const laneY = hallY + HALL_H / 2 + 4;

  const roomLayouts = new Map<RoomId, RoomLayout>();
  const wingLayouts: WingLayout[] = [];
  let cursor = MARGIN + TILE;
  for (const d of districts) {
    for (const side of ["top", "bottom"] as const) {
      const row = d.rows[side];
      const widths = stretch(row, d.width);
      let x = cursor;
      row.forEach((room, i) => {
        const h = roomHeight(room.kind);
        const rect = { x, y: side === "top" ? hallY - h : bottomY, w: widths[i], h };
        roomLayouts.set(room.id, placeRoom(room, rect, side, laneY));
        x += widths[i] + ROOM_GAP;
      });
    }
    wingLayouts.push({ wingId: d.wing.id, x0: cursor, x1: cursor + d.width, slot: d.slot });
    cursor += d.width + WING_GAP;
  }

  const hallEnd = cursor - WING_GAP + TILE;
  const hall = { x: MARGIN, y: hallY, w: hallEnd - MARGIN, h: HALL_H };
  const width = hallEnd + MARGIN;
  const height = bottomY + tallest("bottom") + MARGIN;
  const heart = allRooms.find((r) => r.kind === "command");
  const heartRect = heart && roomLayouts.get(heart.id)?.rect;
  const center = heartRect ? { x: heartRect.x + heartRect.w / 2, y: hallY } : { x: width / 2, y: height / 2 };
  return { width, height, hall, laneY, rooms: roomLayouts, wings: wingLayouts, center };
}

function placeRoom(room: Room, rect: Rect, side: "top" | "bottom", laneY: number): RoomLayout {
  const floor = { x: rect.x + RIM, y: rect.y + WALL, w: rect.w - RIM * 2, h: rect.h - WALL - RIM };
  const cx = Math.round(rect.x + rect.w / 2);
  const inside = side === "top" ? { x: cx, y: floor.y + floor.h - 6 } : { x: cx, y: floor.y + 10 };
  const fractions = STATIONS[room.kind] ?? [0.25, 0.75];
  const stations = fractions
    .map((f) => ({ x: Math.round(floor.x + floor.w * f), y: floor.y + STAND_Y }))
    // In a room entered from the back, the walkway from the door runs down the middle.
    .filter((p) => side === "top" || Math.abs(p.x - cx) > AISLE + 6);
  return { roomId: room.id, wingId: room.wingId, kind: room.kind, rect, floor, door: { inside, outside: { x: cx, y: laneY } }, side, stations };
}

export function contains(rect: Rect, x: number, y: number) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** The room whose floor a point is on, if any. */
export function roomAt(layout: FacilityLayout, p: Point): RoomLayout | undefined {
  for (const room of layout.rooms.values()) if (contains(room.floor, p.x, p.y)) return room;
  return undefined;
}
