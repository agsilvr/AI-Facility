import type { Room, RoomId, RoomKind, Wing, WingId } from "../core/types";

// The facility's floor plan, in world pixels (one pixel of pixel art). It is
// one underground station seen from above: a long main hall runs left to
// right, and every room opens onto it through a door, with rooms along both
// sides. Each wing is a district of the hall, in wing order, so a new
// business adds a district at the right-hand end and nothing else moves.

export const TILE = 16;
/** Height of a room's back wall as seen from above (the face you see). */
export const WALL = 24;
/** Thickness of the side and front walls. */
export const RIM = 4;
/** Floor depth of every room. */
export const ROOM_FLOOR_H = 6 * TILE;
export const ROOM_H = WALL + ROOM_FLOOR_H + RIM;
export const HALL_H = 3 * TILE;
export const DOOR_W = 2 * TILE;
/** Dirt and rock around the station. */
export const MARGIN = 4 * TILE;
const ROOM_GAP = TILE / 2;
const WING_GAP = 3 * TILE;

/** Floor width of each kind of room, in tiles. Busy rooms get more space. */
const ROOM_TILES: Record<RoomKind, number> = {
  command: 12,
  security: 9,
  vault: 9,
  lab: 10,
  studio: 9,
  factory: 14,
  comms: 8,
  dock: 10,
  sealed: 8,
};

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
  /** The whole room, walls included. */
  rect: Rect;
  /** Where the crew can stand. */
  floor: Rect;
  door: Door;
  /** Rooms above the hall have their door at the bottom; rooms below, at the top. */
  side: "top" | "bottom";
}

export interface WingLayout {
  wingId: WingId;
  /** Left and right edges of the wing's stretch of the hall. */
  x0: number;
  x1: number;
}

export interface FacilityLayout {
  width: number;
  height: number;
  hall: Rect;
  /** The y the crew walk along in the hall. */
  laneY: number;
  rooms: Map<RoomId, RoomLayout>;
  wings: WingLayout[];
}

/**
 * A fingerprint of everything the layout and the room artwork depend on. Every
 * snapshot from the server carries fresh copies of the wings and rooms, so the
 * view compares this instead of object identity to avoid rebuilding the map on
 * every update.
 */
export function layoutKey(wings: Wing[], rooms: Room[]) {
  return JSON.stringify([wings.map((w) => [w.id, w.color, !!w.sealed]), rooms.map((r) => [r.id, r.wingId, r.kind, r.theme ?? ""])]);
}

export function roomWidth(kind: RoomKind | string) {
  const tiles = ROOM_TILES[kind as RoomKind] ?? 9;
  return tiles * TILE + RIM * 2;
}

export function buildLayout(wings: Wing[], rooms: Room[]): FacilityLayout {
  const topY = MARGIN;
  const hallY = topY + ROOM_H;
  const bottomY = hallY + HALL_H;
  const laneY = hallY + HALL_H / 2 + 4;
  const roomLayouts = new Map<RoomId, RoomLayout>();
  const wingLayouts: WingLayout[] = [];

  let cursor = MARGIN + TILE;
  for (const wing of wings) {
    const own = rooms.filter((r) => r.wingId === wing.id);
    // Alternate sides so both rows of a district stay about the same length.
    const rows: Record<"top" | "bottom", Room[]> = { top: [], bottom: [] };
    own.forEach((room, i) => rows[i % 2 === 0 ? "top" : "bottom"].push(room));
    let widest = 0;
    for (const side of ["top", "bottom"] as const) {
      let x = cursor;
      for (const room of rows[side]) {
        const w = roomWidth(room.kind);
        const rect = { x, y: side === "top" ? topY : bottomY, w, h: ROOM_H };
        roomLayouts.set(room.id, placeRoom(room, wing.id, rect, side, laneY));
        x += w + ROOM_GAP;
      }
      widest = Math.max(widest, x - ROOM_GAP - cursor);
    }
    widest = Math.max(widest, 8 * TILE);
    wingLayouts.push({ wingId: wing.id, x0: cursor, x1: cursor + widest });
    cursor += widest + WING_GAP;
  }

  const hallEnd = cursor - WING_GAP + TILE;
  const hall = { x: MARGIN, y: hallY, w: hallEnd - MARGIN, h: HALL_H };
  return {
    width: hallEnd + MARGIN,
    height: bottomY + ROOM_H + MARGIN,
    hall,
    laneY,
    rooms: roomLayouts,
    wings: wingLayouts,
  };
}

function placeRoom(room: Room, wingId: WingId, rect: Rect, side: "top" | "bottom", laneY: number): RoomLayout {
  const floor = { x: rect.x + RIM, y: rect.y + WALL, w: rect.w - RIM * 2, h: ROOM_FLOOR_H };
  const cx = Math.round(rect.x + rect.w / 2);
  const inside = side === "top" ? { x: cx, y: floor.y + floor.h - 6 } : { x: cx, y: floor.y + 10 };
  return { roomId: room.id, wingId, rect, floor, door: { inside, outside: { x: cx, y: laneY } }, side };
}

export function contains(rect: Rect, x: number, y: number) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** The room whose floor a point is on, if any. */
export function roomAt(layout: FacilityLayout, p: Point): RoomLayout | undefined {
  for (const room of layout.rooms.values()) if (contains(room.floor, p.x, p.y)) return room;
  return undefined;
}
