import type { FacilityState, FactoryTheme, Room, RoomKind } from "../core/types";
import { DOOR_W, RIM, WALL, type Rect, type RoomLayout } from "./layout";
import { frame, hash, P, rect, tag, text, textWidth } from "./pixels";

// How each room looks. paintRoom draws the parts that never change (walls,
// floor, furniture) once into the map's background; animateRoom draws what
// moves or reflects the ledger (screens, crates, items on the factory line)
// every frame on top. Live parts show only what the ledger records; the rest
// is ambient motion like blinking lights and bubbles.

export interface RoomFrame {
  time: number;
  state: FacilityState;
  /** Tasks being worked on or waiting in this room. */
  busy: number;
  /** Finished tasks ever, across the facility. */
  completed: number;
  /** Approvals waiting for the owner. */
  pending: number;
}

interface Look {
  floor: [string, string];
  /** Light colour, used for lamps and screens. */
  light: string;
}

const LOOKS: Record<RoomKind, Look> = {
  command: { floor: ["#1d2a44", "#22314f"], light: P.blue },
  security: { floor: ["#2a2c33", "#30323a"], light: P.red },
  vault: { floor: ["#3a2e17", "#43351b"], light: P.gold },
  lab: { floor: ["#c9d6d8", "#b9c8cb"], light: P.teal },
  studio: { floor: ["#6e4a2c", "#7a5333"], light: P.pink },
  factory: { floor: ["#4a4a4f", "#525257"], light: P.orange },
  comms: { floor: ["#4a1f26", "#55252d"], light: P.red },
  dock: { floor: ["#3c4152", "#444a5d"], light: P.yellow },
  sealed: { floor: ["#1c1c20", "#202024"], light: P.darkRed },
};

const PLAIN: Look = { floor: ["#2e3142", "#343848"], light: P.grey };

function lookOf(kind: string): Look {
  return LOOKS[kind as RoomKind] ?? PLAIN;
}

/** Where the drawing for a room goes: the wall face along the back and the floor. */
interface Spaces {
  wall: Rect;
  floor: Rect;
  /**
   * Free stretch of the back wall to the right of the name plate and, for
   * rooms whose door is in the back wall, to the right of the door. Wall
   * screens and signs go here so they never cover either.
   */
  free: { x0: number; x1: number };
}

function spaces(rl: RoomLayout): Spaces {
  const r = rl.rect;
  const wall = { x: r.x + RIM, y: r.y, w: r.w - RIM * 2, h: WALL };
  const doorEnd = rl.door.inside.x + DOOR_W / 2 + 6;
  const x0 = rl.side === "bottom" ? doorEnd : wall.x + 64;
  return { wall, floor: rl.floor, free: { x0, x1: wall.x + wall.w - 4 } };
}

/** A wall fixture of up to `width`, set at the right of the free stretch of wall. */
function onWall(s: Spaces, width: number) {
  const w = Math.min(width, s.free.x1 - s.free.x0);
  return { x: s.free.x1 - w, w };
}

// ---------------------------------------------------------------------------
// The room shell: walls, floor and door.

export function paintRoom(ctx: CanvasRenderingContext2D, room: Room, rl: RoomLayout, accent: string) {
  const look = lookOf(room.kind);
  const r = rl.rect;
  const { wall, floor } = spaces(rl);
  const sealed = room.kind === "sealed";

  // Outer walls.
  rect(ctx, r.x, r.y, r.w, r.h, P.wall0);
  frame(ctx, r.x, r.y, r.w, r.h, P.ink);

  // Floor tiles.
  for (let ty = 0; ty < floor.h; ty += 16) {
    for (let tx = 0; tx < floor.w; tx += 16) {
      const w = Math.min(16, floor.w - tx);
      const h = Math.min(16, floor.h - ty);
      rect(ctx, floor.x + tx, floor.y + ty, w, h, look.floor[((tx + ty) / 16) % 2]);
      rect(ctx, floor.x + tx, floor.y + ty, w, 1, "rgba(255,255,255,0.05)");
      rect(ctx, floor.x + tx, floor.y + ty, 1, h, "rgba(0,0,0,0.12)");
    }
  }
  // The wall casts a shadow on the floor below it.
  rect(ctx, floor.x, floor.y, floor.w, 3, "rgba(0,0,0,0.3)");

  // Back wall face with panels, a lit top edge and a skirting board.
  rect(ctx, wall.x, wall.y, wall.w, wall.h, P.wall1);
  rect(ctx, wall.x, wall.y, wall.w, 2, P.trim);
  rect(ctx, wall.x, wall.y + 2, wall.w, 1, P.wall2);
  for (let x = wall.x + 15; x < wall.x + wall.w; x += 16) rect(ctx, x, wall.y + 3, 1, wall.h - 6, P.wall0);
  rect(ctx, wall.x, wall.y + wall.h - 3, wall.w, 3, P.wall0);
  // A strip of the room's colour along the top, like a station's colour coding.
  rect(ctx, wall.x, wall.y + 3, wall.w, 1, sealed ? P.stone0 : accent);

  paintDoor(ctx, rl, look, sealed);
  if (!sealed) {
    // Name plate at the left of the back wall.
    const name = room.name.toUpperCase();
    rect(ctx, wall.x + 4, wall.y + 6, textWidth(name) + 6, 9, P.ink);
    frame(ctx, wall.x + 4, wall.y + 6, textWidth(name) + 6, 9, accent);
    text(ctx, name, wall.x + 7, wall.y + 8, P.white);
  }
  (FURNISH[room.kind as RoomKind] ?? (() => {}))(ctx, spaces(rl), accent, room.theme);
}

function paintDoor(ctx: CanvasRenderingContext2D, rl: RoomLayout, look: Look, sealed: boolean) {
  const r = rl.rect;
  const x = rl.door.inside.x - DOOR_W / 2;
  if (rl.side === "top") {
    // Doorway in the front wall, onto the hall.
    const y = r.y + r.h - RIM;
    rect(ctx, x, y, DOOR_W, RIM, look.floor[0]);
    rect(ctx, x - 2, y - 2, 2, RIM + 2, P.steel1);
    rect(ctx, x + DOOR_W, y - 2, 2, RIM + 2, P.steel1);
    if (sealed) hazard(ctx, x, y, DOOR_W, RIM);
    return;
  }
  // Rooms below the hall: the doorway is cut through the back wall face.
  rect(ctx, x, r.y, DOOR_W, WALL, look.floor[1]);
  rect(ctx, x, r.y, DOOR_W, 3, "rgba(0,0,0,0.35)");
  rect(ctx, x - 3, r.y, 3, WALL, P.steel1);
  rect(ctx, x + DOOR_W, r.y, 3, WALL, P.steel1);
  rect(ctx, x - 3, r.y, 1, WALL, P.steel2);
  if (sealed) {
    // A shut shutter with hazard stripes.
    rect(ctx, x, r.y, DOOR_W, WALL, P.steel0);
    for (let y = r.y + 2; y < r.y + WALL; y += 3) rect(ctx, x, y, DOOR_W, 1, P.hull1);
    hazard(ctx, x, r.y + WALL - 5, DOOR_W, 4);
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

// ---------------------------------------------------------------------------
// Furniture that never moves, per kind of room.

type Furnish = (ctx: CanvasRenderingContext2D, s: Spaces, accent: string, theme?: FactoryTheme) => void;

function desk(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  rect(ctx, x, y, w, 9, P.steel1);
  rect(ctx, x, y, w, 2, P.steel2);
  rect(ctx, x, y + 9, w, 3, P.steel0);
  rect(ctx, x + 1, y + 12, 2, 3, P.steel0);
  rect(ctx, x + w - 3, y + 12, 2, 3, P.steel0);
}

function monitor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  rect(ctx, x - 1, y - 1, w + 2, h + 2, P.ink);
  rect(ctx, x, y, w, h, P.screen);
}

function plant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  rect(ctx, x + 1, y + 7, 6, 5, P.brown);
  rect(ctx, x + 1, y + 7, 6, 1, P.pebble);
  rect(ctx, x + 2, y + 1, 4, 6, P.darkGreen);
  rect(ctx, x, y + 3, 3, 3, P.green);
  rect(ctx, x + 5, y + 2, 3, 3, P.green);
  rect(ctx, x + 3, y, 2, 2, P.green);
}

function crate(ctx: CanvasRenderingContext2D, x: number, y: number, size = 10, color: string = P.brown) {
  rect(ctx, x, y, size, size, color);
  rect(ctx, x, y, size, 1, "rgba(255,255,255,0.25)");
  frame(ctx, x, y, size, size, P.darkBrown);
  rect(ctx, x + 1, y + Math.floor(size / 2), size - 2, 1, P.darkBrown);
}

/** A rough pixel circle. */
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string) {
  for (let y = -radius; y <= radius; y++) {
    const half = Math.round(Math.sqrt(radius * radius - y * y));
    rect(ctx, cx - half, cy + y, half * 2 + 1, 1, color);
  }
}

/** The lab's tanks stand at the right of the back wall, where they don't hide the name plate. */
const LAB_TANKS_X = (floor: Rect) => floor.x + floor.w - 62;

const FURNISH: Partial<Record<RoomKind, Furnish>> = {
  command(ctx, s) {
    const { wall, floor } = s;
    // The big wall screen is drawn live; here its frame.
    const screen = onWall(s, 96);
    monitor(ctx, screen.x, wall.y + 5, screen.w, 15);
    // A row of consoles under the screen.
    for (let i = 0; i < 3; i++) desk(ctx, floor.x + 14 + i * ((floor.w - 40) / 2.5), floor.y + 6, 30);
    // The holotable in the middle of the room.
    disc(ctx, floor.x + floor.w / 2, floor.y + 66, 13, P.steel0);
    disc(ctx, floor.x + floor.w / 2, floor.y + 65, 11, P.steel1);
    disc(ctx, floor.x + floor.w / 2, floor.y + 65, 8, P.darkBlue);
    plant(ctx, floor.x + 3, floor.y + 80);
    plant(ctx, floor.x + floor.w - 11, floor.y + 80);
  },

  security(ctx, { wall, floor }) {
    // A wall of camera monitors.
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) monitor(ctx, wall.x + wall.w - 62 + i * 14, wall.y + 5 + j * 8, 12, 6);
    // The guard's desk.
    desk(ctx, floor.x + 8, floor.y + 6, 40);
    monitor(ctx, floor.x + 14, floor.y + 2, 10, 6);
    monitor(ctx, floor.x + 30, floor.y + 2, 10, 6);
    // The scanner gate everything passes through before the owner sees it.
    const gx = floor.x + floor.w - 50;
    rect(ctx, gx, floor.y + 40, 5, 30, P.steel1);
    rect(ctx, gx + 27, floor.y + 40, 5, 30, P.steel1);
    rect(ctx, gx, floor.y + 36, 32, 6, P.steel2);
    rect(ctx, gx + 5, floor.y + 68, 22, 3, P.ink);
    // Lockers.
    for (let i = 0; i < 3; i++) {
      rect(ctx, floor.x + 6 + i * 11, floor.y + 76, 10, 18, P.steel0);
      rect(ctx, floor.x + 7 + i * 11, floor.y + 77, 8, 16, P.steel1);
      rect(ctx, floor.x + 13 + i * 11, floor.y + 84, 1, 3, P.steel2);
    }
  },

  vault(ctx, { wall, floor }) {
    // A round vault door set in the back wall.
    const dx = wall.x + wall.w - 22;
    disc(ctx, dx, wall.y + 14, 12, P.ink);
    disc(ctx, dx, wall.y + 14, 11, P.steel1);
    disc(ctx, dx, wall.y + 14, 8, P.steel2);
    disc(ctx, dx, wall.y + 14, 2, P.steel0);
    // Gold bars on shelves.
    for (let j = 0; j < 2; j++) {
      const y = floor.y + 4 + j * 9;
      rect(ctx, floor.x + 4, y + 6, 60, 2, P.steel0);
      for (let i = 0; i < 8; i++) {
        if ((i + j * 3) % 5 === 4) continue;
        rect(ctx, floor.x + 6 + i * 7, y + 2, 6, 4, P.gold);
        rect(ctx, floor.x + 6 + i * 7, y + 2, 6, 1, P.yellow);
        rect(ctx, floor.x + 6 + i * 7, y + 5, 6, 1, P.darkGold);
      }
    }
  },

  lab(ctx, { floor }) {
    // Specimen tanks along the back wall, clear of the name plate; the liquid is drawn live.
    for (let i = 0; i < 3; i++) {
      const x = LAB_TANKS_X(floor) + i * 18;
      rect(ctx, x - 1, floor.y - 10, 14, 32, P.ink);
      rect(ctx, x, floor.y - 9, 12, 30, "#9ad1d4");
      rect(ctx, x + 1, floor.y - 8, 10, 28, "#1e3a3c");
      rect(ctx, x - 1, floor.y + 20, 14, 4, P.steel1);
      rect(ctx, x - 1, floor.y - 12, 14, 3, P.steel1);
    }
    // A bench with a microscope and flasks.
    const bx = floor.x + 4;
    desk(ctx, bx, floor.y + 6, 54);
    rect(ctx, bx + 6, floor.y + 1, 4, 7, P.steel2);
    rect(ctx, bx + 5, floor.y, 6, 2, P.ink);
    rect(ctx, bx + 18, floor.y + 2, 4, 5, P.green);
    rect(ctx, bx + 24, floor.y + 3, 4, 4, P.purple);
    rect(ctx, bx + 30, floor.y + 2, 3, 5, P.teal);
    monitor(ctx, bx + 38, floor.y - 1, 12, 8);
    // Data cabinet.
    rect(ctx, floor.x + floor.w - 14, floor.y + 60, 10, 30, P.steel0);
    for (let i = 0; i < 4; i++) rect(ctx, floor.x + floor.w - 13, floor.y + 63 + i * 7, 8, 1, P.steel2);
    plant(ctx, floor.x + 4, floor.y + 80);
  },

  studio(ctx, s) {
    const { wall, floor } = s;
    // A pinboard of sketches.
    const board = onWall(s, 50);
    const px = board.x;
    rect(ctx, px, wall.y + 5, board.w, 15, P.clay);
    frame(ctx, px, wall.y + 5, board.w, 15, P.darkBrown);
    for (let i = 0; i < Math.floor((board.w - 3) / 9); i++) {
      rect(ctx, px + 3 + i * 9, wall.y + 7 + (i % 2), 7, 9, i % 2 ? P.paper : P.white);
      rect(ctx, px + 5 + i * 9, wall.y + 10 + (i % 2), 3, 3, [P.pink, P.blue, P.yellow, P.green, P.purple][i]);
    }
    // Easels; the paintings on them are drawn live.
    for (let i = 0; i < 2; i++) {
      const x = floor.x + 12 + i * 34;
      rect(ctx, x + 2, floor.y + 8, 2, 26, P.brown);
      rect(ctx, x + 20, floor.y + 8, 2, 26, P.brown);
      rect(ctx, x + 11, floor.y + 4, 2, 30, P.darkBrown);
      rect(ctx, x, floor.y + 2, 24, 18, P.white);
      frame(ctx, x, floor.y + 2, 24, 18, P.darkBrown);
    }
    // Drafting table and paint pots.
    rect(ctx, floor.x + floor.w - 40, floor.y + 50, 32, 18, P.paper);
    frame(ctx, floor.x + floor.w - 40, floor.y + 50, 32, 18, P.brown);
    rect(ctx, floor.x + floor.w - 36, floor.y + 54, 14, 1, P.blue);
    rect(ctx, floor.x + floor.w - 36, floor.y + 58, 20, 1, P.blue);
    for (let i = 0; i < 3; i++) {
      rect(ctx, floor.x + 8 + i * 7, floor.y + 84, 6, 6, P.steel1);
      rect(ctx, floor.x + 9 + i * 7, floor.y + 84, 4, 2, [P.red, P.yellow, P.blue][i]);
    }
    plant(ctx, floor.x + floor.w - 11, floor.y + 80);
  },

  factory(ctx, { floor }, accent, theme) {
    // Workstations along the back: sewing machines for clothing, presses for
    // prints, packing benches for anything else.
    for (let i = 0; i < 4; i++) {
      const x = floor.x + 10 + i * 34;
      desk(ctx, x, floor.y + 6, 26);
      if (theme === "clothing") {
        rect(ctx, x + 6, floor.y + 1, 12, 6, P.white);
        rect(ctx, x + 6, floor.y + 1, 3, 9, P.white);
        rect(ctx, x + 15, floor.y + 6, 1, 3, P.steel2);
        rect(ctx, x + 10, floor.y + 3, 6, 1, accent);
      } else if (theme === "prints") {
        rect(ctx, x + 4, floor.y + 1, 18, 7, P.steel2);
        rect(ctx, x + 6, floor.y + 3, 14, 3, P.ink);
      } else {
        crate(ctx, x + 8, floor.y, 9);
      }
    }
    // The conveyor, in two halves either side of the walkway to the door.
    const y = floor.y + 52;
    const mid = floor.x + floor.w / 2;
    for (const [x0, x1] of [[floor.x + 4, mid - 20], [mid + 20, floor.x + floor.w - 4]]) {
      rect(ctx, x0, y - 2, x1 - x0, 14, P.steel0);
      rect(ctx, x0, y, x1 - x0, 10, P.ink);
      rect(ctx, x0, y + 12, x1 - x0, 2, P.steel1);
      for (let x = x0 + 2; x < x1 - 2; x += 10) rect(ctx, x, y + 13, 3, 3, P.steel0);
    }
    hazard(ctx, mid - 18, y - 2, 2, 14);
    hazard(ctx, mid + 16, y - 2, 2, 14);
    // The finished stock: a rack of clothes, a stack of prints, or boxes.
    const rx = floor.x + floor.w - 34;
    if (theme === "clothing") {
      rect(ctx, rx, floor.y + 74, 28, 2, P.steel2);
      rect(ctx, rx, floor.y + 74, 2, 20, P.steel2);
      rect(ctx, rx + 26, floor.y + 74, 2, 20, P.steel2);
      const colours = [P.red, P.blue, P.yellow, P.green, P.pink];
      for (let i = 0; i < 5; i++) shirt(ctx, rx + 2 + i * 5, floor.y + 76, colours[i], 5);
    } else {
      for (let i = 0; i < 3; i++) crate(ctx, rx + i * 9, floor.y + 82, 9);
    }
    for (let i = 0; i < 2; i++) crate(ctx, floor.x + 6 + i * 11, floor.y + 82, 10);
    crate(ctx, floor.x + 11, floor.y + 72, 10);
  },

  comms(ctx, { wall, floor }) {
    // Mail pigeonholes on the wall.
    const mx = wall.x + wall.w - 40;
    rect(ctx, mx, wall.y + 5, 34, 15, P.brown);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 5; i++) rect(ctx, mx + 2 + i * 6, wall.y + 7 + j * 6, 5, 5, P.darkBrown);
    // Radio desk with a microphone.
    desk(ctx, floor.x + 8, floor.y + 6, 44);
    rect(ctx, floor.x + 12, floor.y + 1, 14, 6, P.steel0);
    for (let i = 0; i < 3; i++) rect(ctx, floor.x + 14 + i * 4, floor.y + 3, 2, 2, P.orange);
    rect(ctx, floor.x + 36, floor.y, 2, 7, P.steel2);
    rect(ctx, floor.x + 35, floor.y - 1, 4, 3, P.ink);
    // Server rack; its lights blink live.
    rect(ctx, floor.x + floor.w - 16, floor.y + 2, 12, 36, P.ink);
    rect(ctx, floor.x + floor.w - 15, floor.y + 3, 10, 34, P.hull1);
    // A cable runs up the wall to the antenna on the surface.
    rect(ctx, wall.x + 40, wall.y, 2, wall.h, P.ink);
  },

  dock(ctx, { wall, floor }) {
    // The freight lift up to the surface: the only way out of the facility.
    const lx = floor.x + 6;
    rect(ctx, lx, floor.y + 4, 44, 46, P.steel0);
    hazard(ctx, lx, floor.y + 4, 44, 3);
    hazard(ctx, lx, floor.y + 47, 44, 3);
    for (let y = floor.y + 10; y < floor.y + 46; y += 5) rect(ctx, lx + 3, y, 38, 1, P.steel1);
    const sx = wall.x + wall.w - 44;
    rect(ctx, sx, wall.y + 6, 36, 11, P.ink);
    text(ctx, "^ SURFACE", sx + 2, wall.y + 9, P.yellow);
    // Pallets where outgoing work waits.
    rect(ctx, floor.x + 70, floor.y + 70, 34, 4, P.brown);
    rect(ctx, floor.x + 110, floor.y + 70, 34, 4, P.brown);
    // A parked forklift.
    const fx = floor.x + floor.w - 30;
    rect(ctx, fx, floor.y + 20, 18, 12, P.yellow);
    rect(ctx, fx + 2, floor.y + 14, 10, 7, P.ink);
    rect(ctx, fx - 6, floor.y + 18, 2, 16, P.steel2);
    rect(ctx, fx - 10, floor.y + 32, 8, 2, P.steel2);
    rect(ctx, fx + 2, floor.y + 32, 4, 4, P.ink);
    rect(ctx, fx + 12, floor.y + 32, 4, 4, P.ink);
  },

  sealed(ctx, { floor }) {
    // Dust sheets over old equipment, and the stencilled warning.
    for (let i = 0; i < 3; i++) {
      const x = floor.x + 10 + i * 36;
      rect(ctx, x, floor.y + 10, 24, 18, P.stone1);
      rect(ctx, x + 1, floor.y + 10, 22, 2, P.stone2);
      rect(ctx, x, floor.y + 26, 24, 2, P.stone0);
    }
    const word = "SEALED";
    text(ctx, word, floor.x + (floor.w - textWidth(word, 2)) / 2, floor.y + 54, "#3a3a40", 2);
    for (let i = 0; i < 40; i++) rect(ctx, floor.x + hash(i) * floor.w, floor.y + hash(i + 50) * floor.h, 1, 1, P.stone0);
  },
};

function shirt(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size = 7) {
  if (size <= 5) {
    rect(ctx, x, y, 4, 5, color);
    rect(ctx, x + 1, y, 2, 1, P.ink);
    return;
  }
  rect(ctx, x, y + 1, 7, 2, color);
  rect(ctx, x + 1, y, 5, 7, color);
  rect(ctx, x + 3, y, 1, 1, P.ink);
  rect(ctx, x + 1, y + 6, 5, 1, "rgba(0,0,0,0.3)");
}

function print(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  rect(ctx, x, y, 7, 7, P.brown);
  rect(ctx, x + 1, y + 1, 5, 5, P.white);
  rect(ctx, x + 2, y + 3, 3, 2, color);
}

// ---------------------------------------------------------------------------
// What moves, every frame.

type Animate = (ctx: CanvasRenderingContext2D, s: Spaces, f: RoomFrame, accent: string, theme?: FactoryTheme) => void;

export function animateRoom(ctx: CanvasRenderingContext2D, room: Room, rl: RoomLayout, f: RoomFrame, accent: string) {
  (ANIMATE[room.kind as RoomKind] ?? (() => {}))(ctx, spaces(rl), f, accent, room.theme);
}

const blink = (t: number, rate: number, phase = 0) => Math.sin(t * rate + phase) > 0;

const ANIMATE: Partial<Record<RoomKind, Animate>> = {
  command(ctx, s, f, accent) {
    const { wall, floor } = s;
    // The wall screen: what waits for the owner, and how far along each crew member is.
    const { x: sx, w: sw } = onWall(s, 96);
    const sy = wall.y + 5;
    rect(ctx, sx, sy, sw, 15, P.screen);
    const message = f.pending ? `${f.pending} AWAITING YOU` : "ALL CLEAR";
    text(ctx, message, sx + 3, sy + 2, f.pending ? (blink(f.time, 4) ? P.red : P.orange) : P.green);
    const crew = f.state.agents;
    const bw = Math.max(2, Math.floor((sw - 6 - crew.length) / Math.max(1, crew.length)));
    crew.forEach((agent, i) => {
      const task = agent.taskId ? f.state.tasks.find((t) => t.id === agent.taskId) : undefined;
      const x = sx + 3 + i * (bw + 1);
      rect(ctx, x, sy + 10, bw, 3, P.hull1);
      rect(ctx, x, sy + 10, Math.round(bw * (task?.progress ?? 0)), 3, agent.status === "paused" ? P.yellow : agent.sprite.suit);
    });
    // Console lights.
    for (let i = 0; i < 3; i++) {
      const x = floor.x + 14 + i * ((floor.w - 40) / 2.5);
      rect(ctx, x + 4, floor.y + 8, 22, 1, blink(f.time, 3, i) ? accent : P.steel0);
    }
    // A spinning hologram over the table.
    const cx = floor.x + floor.w / 2;
    const w = Math.round(Math.abs(Math.cos(f.time * 1.5)) * 6) + 1;
    rect(ctx, cx - w, floor.y + 52, w * 2, 10, accent);
    rect(ctx, cx - w + 1, floor.y + 54, Math.max(1, w * 2 - 2), 6, P.screen);
    rect(ctx, cx - 1, floor.y + 50, 2, 14, P.white);
  },

  security(ctx, { wall, floor }, f) {
    // Camera monitors with a rolling scan line.
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 4; i++) {
        const x = wall.x + wall.w - 62 + i * 14;
        const y = wall.y + 5 + j * 8;
        rect(ctx, x, y, 12, 6, j === 0 ? "#123024" : "#1a2a3a");
        rect(ctx, x, y + Math.floor((f.time * 6 + i + j * 2) % 6), 12, 1, "rgba(255,255,255,0.35)");
      }
    }
    // The scanner gate: red while anything waiting for the owner has a
    // blocking safety finding, green otherwise.
    const blocked = f.state.tasks.filter((t) => t.state === "awaiting_approval" && t.flags.some((x) => x.level === "block")).length;
    const checked = f.state.tasks.filter((t) => t.draft).length;
    const gx = floor.x + floor.w - 50;
    const light = blocked ? (blink(f.time, 6) ? P.red : P.darkRed) : P.green;
    rect(ctx, gx + 6, floor.y + 38, 20, 2, light);
    rect(ctx, gx + 5, floor.y + 44, 1, 22, light);
    rect(ctx, gx + 26, floor.y + 44, 1, 22, light);
    tag(ctx, blocked ? `BLOCKED ${blocked}` : `CHECKED ${checked}`, gx + 16, floor.y + 26, blocked ? P.red : P.green);
    for (const x of [floor.x + 15, floor.x + 31]) rect(ctx, x, floor.y + 3, 8, 4, blink(f.time, 2, x) ? "#123024" : "#1e4a38");
  },

  vault(ctx, { wall, floor }, f) {
    // One crate for every finished task, stacked up on the floor.
    const perRow = Math.floor((floor.w - 16) / 11);
    const shown = Math.min(f.completed, perRow * 5);
    for (let i = 0; i < shown; i++) crate(ctx, floor.x + 8 + (i % perRow) * 11, floor.y + floor.h - 16 - Math.floor(i / perRow) * 11, 10, P.gold);
    tag(ctx, `DONE ${f.completed}`, floor.x + floor.w - 30, floor.y + 4, P.yellow);
    // The door's wheel turns slowly.
    const dx = wall.x + wall.w - 22;
    const a = f.time * 0.8;
    for (let k = 0; k < 3; k++) {
      const ang = a + (k * Math.PI) / 3;
      for (let r = -6; r <= 6; r++) rect(ctx, dx + Math.round(Math.cos(ang) * r), wall.y + 14 + Math.round(Math.sin(ang) * r), 1, 1, P.steel0);
    }
  },

  lab(ctx, { floor }, f) {
    const colours = [P.green, P.purple, P.teal];
    for (let i = 0; i < 3; i++) {
      const x = LAB_TANKS_X(floor) + 1 + i * 18;
      const level = 16 + Math.round(Math.sin(f.time * 1.2 + i * 2) * 5);
      rect(ctx, x, floor.y + 20 - level, 10, level, colours[i]);
      rect(ctx, x, floor.y + 20 - level, 10, 1, P.white);
      for (let b = 0; b < 3; b++) {
        const p = (f.time * 0.6 + b / 3 + i * 0.2) % 1;
        rect(ctx, x + 2 + ((b * 3) % 7), floor.y + 19 - Math.floor(p * (level - 2)), 2, 2, "rgba(255,255,255,0.7)");
      }
    }
    // Scrolling results on the bench screen.
    const sx = floor.x + 4 + 38;
    for (let r = 0; r < 3; r++) rect(ctx, sx + 1, floor.y + 1 + r * 2, 2 + Math.round(((f.time * 2 + r * 3) % 9)), 1, P.green);
  },

  studio(ctx, { floor }, f) {
    // The paintings change colour as the designs evolve.
    for (let i = 0; i < 2; i++) {
      const x = floor.x + 13 + i * 34;
      const hue = Math.floor((f.time * 30 + i * 140) % 360);
      ctx.fillStyle = `hsl(${hue - (hue % 30)},70%,60%)`;
      ctx.fillRect(x + 2, floor.y + 5, 10, 8);
      ctx.fillStyle = `hsl(${(hue + 120) % 360 - ((hue + 120) % 30)},70%,55%)`;
      ctx.fillRect(x + 10, floor.y + 9, 10, 8);
    }
  },

  factory(ctx, { floor }, f, accent, theme) {
    // Belt stripes moving toward the stock rack.
    const y = floor.y + 52;
    const mid = floor.x + floor.w / 2;
    const shift = Math.floor(f.time * 12) % 8;
    for (const [x0, x1] of [[floor.x + 4, mid - 20], [mid + 20, floor.x + floor.w - 4]]) {
      for (let x = x0 + shift; x < x1 - 1; x += 8) rect(ctx, x, y + 1, 1, 8, P.steel0);
    }
    // One item on the line for every piece of work in this room.
    const n = Math.min(f.busy, 8);
    const colours = [accent, P.blue, P.pink, P.green, P.yellow, P.red, P.purple, P.white];
    for (let i = 0; i < n; i++) {
      const p = (f.time * 0.06 + i / Math.max(1, n)) % 1;
      let x = floor.x + 6 + p * (floor.w - 20);
      if (x > mid - 26 && x < mid + 20) x = x < mid ? mid - 26 : mid + 20;
      if (theme === "clothing") shirt(ctx, x, y + 2, colours[i]);
      else if (theme === "prints") print(ctx, x, y + 2, colours[i]);
      else crate(ctx, x, y + 1, 8);
    }
    // Workstations hum while there's work.
    for (let i = 0; i < 4; i++) {
      const x = floor.x + 10 + i * 34;
      rect(ctx, x + 22, floor.y + 8, 2, 2, f.busy > 0 && blink(f.time, 8, i) ? P.green : P.darkGreen);
    }
  },

  comms(ctx, { floor }, f) {
    // Server lights.
    for (let i = 0; i < 10; i++) {
      rect(ctx, floor.x + floor.w - 13 + (i % 2) * 4, floor.y + 6 + Math.floor(i / 2) * 6, 2, 2, blink(f.time, 3 + i, i * 7) ? P.green : P.darkGreen);
    }
    // One envelope on the desk for every message being handled.
    const n = Math.min(f.busy, 4);
    for (let i = 0; i < n; i++) {
      const x = floor.x + 40 + i * 8;
      rect(ctx, x, floor.y + 4, 7, 5, P.white);
      rect(ctx, x + 1, floor.y + 5, 5, 1, P.grey);
    }
    // Radio waves from the microphone while a message is in progress.
    if (n > 0) {
      const r = Math.floor((f.time * 10) % 8);
      rect(ctx, floor.x + 40 - r, floor.y - 2 - r, 1, 3, P.orange);
    }
  },

  dock(ctx, { floor }, f) {
    // Work on its way out waits on the pallets.
    const n = Math.min(f.busy, 8);
    for (let i = 0; i < n; i++) crate(ctx, floor.x + 72 + (i % 4) * 9 + (i >= 4 ? 40 : 0), floor.y + 60, 8);
    rect(ctx, floor.x + 26, floor.y + 6, 4, 2, blink(f.time, 3) ? P.yellow : P.darkGold);
  },

  sealed(ctx, { floor }, f) {
    rect(ctx, floor.x + floor.w - 8, floor.y + 4, 3, 3, blink(f.time, 1.2) ? P.red : P.darkRed);
  },
};
