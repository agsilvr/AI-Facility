import type { Room, RoomId, Wing, WingId } from "../core/types";

// World geometry in unscaled pixels. The view scales the whole world to fit.

export const WORLD_W = 960;
export const SURFACE_H = 120;
export const LEVEL_H = 150;
export const LEVEL_GAP = 26;
export const SHAFT = { x: 440, w: 80 };
const MARGIN = 24;
const ROOM_GAP = 12;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LevelLayout {
  wingId: WingId;
  index: number;
  rect: Rect;
  /** Y coordinate agents walk on along this level. */
  floorY: number;
}

export interface RoomLayout {
  roomId: RoomId;
  rect: Rect;
  floorY: number;
  /** Index of the level the room sits on; -1 is the surface. */
  level: number;
}

export interface FacilityLayout {
  height: number;
  levels: LevelLayout[];
  rooms: Map<RoomId, RoomLayout>;
  shaft: Rect;
}

/**
 * A fingerprint of everything the layout depends on. Every snapshot from the
 * server carries fresh copies of the wings and rooms, so views compare this
 * instead of object identity to avoid rebuilding the map on every update.
 */
export function layoutKey(wings: Wing[], rooms: Room[]) {
  return JSON.stringify([wings.map((w) => w.id), rooms.map((r) => [r.id, r.wingId, r.kind])]);
}

export function buildLayout(wings: Wing[], rooms: Room[]): FacilityLayout {
  const levels: LevelLayout[] = [];
  const roomLayouts = new Map<RoomId, RoomLayout>();

  // The dock sits on the surface; it is where finished work leaves the facility.
  const dockW = 150;
  const dock = rooms.find((r) => r.kind === "dock");
  if (dock) {
    const rect = { x: SHAFT.x + SHAFT.w / 2 - dockW / 2, y: SURFACE_H - 78, w: dockW, h: 70 };
    roomLayouts.set(dock.id, { roomId: dock.id, rect, floorY: rect.y + rect.h - 6, level: -1 });
  }

  wings.forEach((wing, index) => {
    const y = SURFACE_H + LEVEL_GAP + index * (LEVEL_H + LEVEL_GAP);
    const rect = { x: MARGIN, y, w: WORLD_W - MARGIN * 2, h: LEVEL_H };
    const floorY = y + LEVEL_H - 20;
    levels.push({ wingId: wing.id, index, rect, floorY });

    const own = rooms.filter((r) => r.wingId === wing.id && r.kind !== "dock");
    const leftCount = Math.ceil(own.length / 2);
    const left = own.slice(0, leftCount);
    const right = own.slice(leftCount);
    placeRow(left, MARGIN + 8, SHAFT.x - 8, y + 26, floorY, index, roomLayouts);
    placeRow(right, SHAFT.x + SHAFT.w + 8, WORLD_W - MARGIN - 8, y + 26, floorY, index, roomLayouts);
  });

  const last = levels[levels.length - 1];
  const height = (last ? last.rect.y + last.rect.h : SURFACE_H) + 40;
  const shaft = { x: SHAFT.x, y: SURFACE_H - 10, w: SHAFT.w, h: height - SURFACE_H - 20 };
  return { height, levels, rooms: roomLayouts, shaft };
}

function placeRow(
  rooms: Room[],
  from: number,
  to: number,
  top: number,
  floorY: number,
  level: number,
  out: Map<RoomId, RoomLayout>,
) {
  if (rooms.length === 0) return;
  const w = (to - from - ROOM_GAP * (rooms.length - 1)) / rooms.length;
  rooms.forEach((room, i) => {
    const rect = { x: from + i * (w + ROOM_GAP), y: top, w, h: floorY - top + 4 };
    out.set(room.id, { roomId: room.id, rect, floorY, level });
  });
}

export function contains(rect: Rect, x: number, y: number) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
