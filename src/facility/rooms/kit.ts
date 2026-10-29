import type { FacilityState, Room, Wing } from "../../core/types";
import { AISLE, type Rect, type RoomLayout } from "../layout";
import { frame, P, rect } from "../pixels";

// The shared kit every room is built from: what a room's artwork is given,
// and small pieces of furniture drawn the same way everywhere. Objects are
// seen from above at a slight angle, so each has a lit top, a darker front
// face, a dark outline and a soft shadow on the floor.

/** What a room shows each frame. Everything here comes from the ledger. */
export interface RoomFrame {
  time: number;
  state: FacilityState;
  /** Tasks being worked on or waiting in this room. */
  busy: number;
  /** Crew working in this room right now; machines only run while someone is. */
  working: number;
  /** Finished tasks ever, across the facility. */
  completed: number;
  /** Approvals waiting for the owner. */
  pending: number;
}

/** Where a room's drawing goes, worked out once from its layout. */
export interface Spaces {
  room: Room;
  rl: RoomLayout;
  /** The back wall's face. */
  wall: Rect;
  floor: Rect;
  /** The room's colour: its wing's colour. */
  accent: string;
  /** Middle of the room, where the door is. */
  cx: number;
  /** Floor either side of the walkway from the door, which is kept clear. */
  left: { x0: number; x1: number };
  right: { x0: number; x1: number };
  /** Rooms below the hall have their door in the back wall, so wall fixtures keep to the sides. */
  doorInWall: boolean;
  /** Every wing, for rooms that show the whole facility, like the Command Center. */
  wings: Wing[];
}

export function spacesOf(room: Room, rl: RoomLayout, accent: string, wall: Rect, wings: Wing[]): Spaces {
  const cx = rl.door.inside.x;
  const f = rl.floor;
  return {
    room,
    rl,
    wall,
    floor: f,
    accent,
    cx,
    left: { x0: f.x + 2, x1: cx - AISLE - 4 },
    right: { x0: cx + AISLE + 4, x1: f.x + f.w - 2 },
    doorInWall: rl.side === "bottom",
    wings,
  };
}

/** Every room kind's artwork, in its own file. */
export interface RoomArt {
  /** 7x7 sign icon, rows of "1"s and "0"s, shown on the name plate. */
  icon: string[];
  /** Paint the floor. */
  floor(ctx: CanvasRenderingContext2D, s: Spaces): void;
  /** Paint the back wall's face. */
  wall(ctx: CanvasRenderingContext2D, s: Spaces): void;
  /** Furniture that never moves, painted once. */
  furnish(ctx: CanvasRenderingContext2D, s: Spaces): void;
  /** What moves, or shows the ledger, every frame. */
  animate?(ctx: CanvasRenderingContext2D, s: Spaces, f: RoomFrame): void;
}

export const blink = (t: number, rate: number, phase = 0) => Math.sin(t * rate + phase) > 0;

/** A soft shadow on the floor under an object. */
export function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h = 3) {
  rect(ctx, x + 1, y, w, h, "rgba(0,0,0,0.28)");
}

/**
 * A solid object seen from above: a top face, then its front face below it,
 * outlined, with a shadow. (x, y) is the top-left of the top face.
 */
export function block(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, top: number, front: number, colors: { top: string; front: string; edge?: string }) {
  shadow(ctx, x, y + top + front, w, 2);
  rect(ctx, x - 1, y - 1, w + 2, top + front + 2, P.ink);
  rect(ctx, x, y, w, top, colors.top);
  rect(ctx, x, y, w, 1, colors.edge ?? "rgba(255,255,255,0.22)");
  rect(ctx, x, y + top, w, front, colors.front);
  rect(ctx, x, y + top, w, 1, "rgba(0,0,0,0.25)");
}

/** A desk or bench: a work surface with a front panel. */
export function desk(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, top: string = P.steel1, front: string = P.steel0) {
  block(ctx, x, y, w, 8, 5, { top, front });
}

/** A screen standing on a desk, or set in a wall. */
export function screen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, glass: string = P.screen) {
  rect(ctx, x - 1, y - 1, w + 2, h + 2, P.ink);
  rect(ctx, x, y, w, h, glass);
  rect(ctx, x, y, w, 1, "rgba(255,255,255,0.12)");
}

/** A desk screen on a little stand. */
export function deskScreen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, glass: string = P.screen) {
  rect(ctx, x + Math.floor(w / 2) - 1, y + h, 2, 2, P.steel2);
  screen(ctx, x, y, w, h, glass);
}

/** An office chair, seen from behind, for someone working at a desk. */
export function chair(ctx: CanvasRenderingContext2D, cx: number, y: number, color: string) {
  shadow(ctx, cx - 4, y + 8, 8, 2);
  rect(ctx, cx - 4, y - 1, 9, 10, P.ink);
  rect(ctx, cx - 3, y, 7, 5, color);
  rect(ctx, cx - 3, y, 7, 1, "rgba(255,255,255,0.3)");
  rect(ctx, cx - 3, y + 5, 7, 3, P.steel0);
}

export function plant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shadow(ctx, x, y + 12, 8, 2);
  rect(ctx, x, y + 7, 8, 6, P.ink);
  rect(ctx, x + 1, y + 7, 6, 5, P.clay);
  rect(ctx, x + 1, y + 7, 6, 1, P.pebble);
  rect(ctx, x + 2, y + 1, 4, 6, P.darkGreen);
  rect(ctx, x, y + 3, 3, 3, P.green);
  rect(ctx, x + 5, y + 2, 3, 3, P.green);
  rect(ctx, x + 3, y - 1, 2, 3, P.green);
  rect(ctx, x + 1, y + 3, 1, 1, "#9ff5c1");
}

export function crate(ctx: CanvasRenderingContext2D, x: number, y: number, size = 10, color: string = P.brown, dark: string = P.darkBrown) {
  shadow(ctx, x, y + size, size, 2);
  rect(ctx, x, y, size, size, color);
  rect(ctx, x, y, size, 1, "rgba(255,255,255,0.3)");
  frame(ctx, x, y, size, size, dark);
  rect(ctx, x + 1, y + Math.floor(size / 2), size - 2, 1, dark);
  rect(ctx, x + Math.floor(size / 2), y + 1, 1, size - 2, dark);
}

/** A cardboard shipping box with tape across the top. */
export function box(ctx: CanvasRenderingContext2D, x: number, y: number, w = 10, h = 8) {
  shadow(ctx, x, y + h, w, 2);
  rect(ctx, x - 1, y - 1, w + 2, h + 2, "#3a2614");
  rect(ctx, x, y, w, h, "#c08a52");
  rect(ctx, x, y + h - 3, w, 3, "#9c6b3c");
  rect(ctx, x + Math.floor(w / 2) - 1, y, 2, h - 3, "#e6d3a8");
}

export function barrel(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  shadow(ctx, x, y + 12, 10, 2);
  rect(ctx, x, y + 1, 10, 11, P.ink);
  rect(ctx, x + 1, y, 8, 13, P.ink);
  rect(ctx, x + 1, y + 1, 8, 11, color);
  rect(ctx, x + 1, y + 4, 8, 1, "rgba(0,0,0,0.3)");
  rect(ctx, x + 1, y + 8, 8, 1, "rgba(0,0,0,0.3)");
  rect(ctx, x + 2, y + 1, 2, 10, "rgba(255,255,255,0.25)");
}

/** A rough pixel ellipse, filled. */
export function ellipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string) {
  for (let y = -ry; y <= ry; y++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    rect(ctx, cx - half, cy + y, half * 2 + 1, 1, color);
  }
}

export function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ellipse(ctx, cx, cy, r, r, color);
}

/**
 * A pool of light in stepped rings, the way old games did it: brightest in the
 * middle, fading out in bands. Added on top, so it brightens what's under it.
 */
export function glow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, strength = 0.07) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = strength;
  for (let k = 0; k < 4; k++) {
    const s = 1 - k * 0.22;
    ellipse(ctx, Math.round(cx), Math.round(cy), Math.round(rx * s), Math.round(ry * s), color);
  }
  ctx.restore();
}

/** Darken the edges of a floor so the middle of the room feels lit. */
export function vignette(ctx: CanvasRenderingContext2D, f: Rect, strength = 0.18) {
  for (let i = 0; i < 4; i++) {
    const a = `rgba(0,0,0,${(strength * (4 - i)) / 4})`;
    rect(ctx, f.x, f.y + f.h - 1 - i * 2, f.w, 2, a);
    rect(ctx, f.x + i * 2, f.y, 2, f.h, a);
    rect(ctx, f.x + f.w - 2 - i * 2, f.y, 2, f.h, a);
  }
}

/** Yellow and black diagonal stripes. */
export function hazard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      rect(ctx, x + i, y + j, 1, 1, ((i + j) >> 2) % 2 === 0 ? P.yellow : P.ink);
    }
  }
}

/** Floor tiles in two alternating colours, with a lit edge and a grout line. */
export function tiles(ctx: CanvasRenderingContext2D, f: Rect, size: number, a: string, b: string, grout = "rgba(0,0,0,0.18)") {
  for (let ty = 0; ty < f.h; ty += size) {
    for (let tx = 0; tx < f.w; tx += size) {
      const w = Math.min(size, f.w - tx);
      const h = Math.min(size, f.h - ty);
      rect(ctx, f.x + tx, f.y + ty, w, h, ((tx + ty) / size) % 2 ? b : a);
      rect(ctx, f.x + tx, f.y + ty, w, 1, "rgba(255,255,255,0.06)");
      rect(ctx, f.x + tx, f.y + ty, 1, h, grout);
    }
  }
}

/** A horizontal pipe along a wall, with joints. */
export function pipe(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, dark: string) {
  rect(ctx, x, y - 1, w, 5, P.ink);
  rect(ctx, x, y, w, 3, color);
  rect(ctx, x, y, w, 1, "rgba(255,255,255,0.3)");
  for (let jx = x + 10; jx < x + w - 4; jx += 22) rect(ctx, jx, y - 1, 3, 5, dark);
}
