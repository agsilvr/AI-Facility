import type { Room, RoomKind, Wing } from "../../core/types";
import { DOOR_W, RIM, WALL, type RoomLayout } from "../layout";
import { frame, GLYPH_H, P, rect, text, textWidth } from "../pixels";
import { command } from "./command";
import { comms } from "./comms";
import { dock } from "./dock";
import { factory } from "./factory";
import { hazard, spacesOf, tiles, vignette, type RoomArt, type RoomFrame, type Spaces } from "./kit";
import { lab } from "./lab";
import { sealed } from "./sealed";
import { security } from "./security";
import { studio } from "./studio";
import { vault } from "./vault";
import { qc } from "./qc";

export type { RoomFrame };

// How each room looks. Every kind of room has its own file with its own
// floor, walls, furniture and sign, so you can tell what a room is for at a
// glance. paintRoom draws the parts that never change once, into the map's
// background; animateRoom draws what moves or shows the ledger every frame.

const ART: Record<RoomKind, RoomArt> = { command, security, vault, lab, qc, studio, factory, comms, dock, sealed };

/** For a kind of room this version doesn't know, such as one from older saved data. */
const PLAIN: RoomArt = {
  icon: ["0000000", "0111110", "0100010", "0100010", "0100010", "0111110", "0000000"],
  floor: (ctx, s) => tiles(ctx, s.floor, 16, "#2e3142", "#343848"),
  wall: (ctx, s) => rect(ctx, s.wall.x, s.wall.y, s.wall.w, s.wall.h, P.wall1),
  furnish: () => {},
};

const artOf = (room: Room) => ART[room.kind as RoomKind] ?? PLAIN;

function spaces(room: Room, rl: RoomLayout, accent: string, wings: Wing[]): Spaces {
  const r = rl.rect;
  return spacesOf(room, rl, accent, { x: r.x + RIM, y: r.y, w: r.w - RIM * 2, h: WALL }, wings);
}

export function paintRoom(ctx: CanvasRenderingContext2D, room: Room, rl: RoomLayout, accent: string, wings: Wing[]) {
  const art = artOf(room);
  const s = spaces(room, rl, accent, wings);
  const r = rl.rect;
  const { wall, floor } = s;

  // The outer walls, seen from above: a thick top edge with a lit rim.
  rect(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, P.ink);
  rect(ctx, r.x, r.y, r.w, r.h, "#74664c");
  rect(ctx, r.x, r.y, r.w, 1, "#c2ad7b");
  rect(ctx, r.x, r.y + r.h - 1, r.w, 1, "#534c37");

  art.floor(ctx, s);
  art.wall(ctx, s);
  // The ceiling edge above the wall, a skirting board below it, and a strip of the wing's colour.
  rect(ctx, wall.x, wall.y, wall.w, 2, "#c4ae81");
  rect(ctx, wall.x, wall.y + 2, wall.w, 1, room.kind === "sealed" ? P.stone0 : accent);
  rect(ctx, wall.x, wall.y + wall.h - 2, wall.w, 2, "rgba(0,0,0,0.35)");
  // The wall casts a shadow onto the floor.
  rect(ctx, floor.x, floor.y, floor.w, 2, "rgba(0,0,0,0.35)");
  rect(ctx, floor.x, floor.y + 2, floor.w, 2, "rgba(0,0,0,0.15)");

  art.furnish(ctx, s);
  vignette(ctx, floor);
  paintDoor(ctx, rl, room.kind === "sealed");
  if (room.kind !== "sealed") namePlate(ctx, s, art.icon);
}

export function animateRoom(ctx: CanvasRenderingContext2D, room: Room, rl: RoomLayout, f: RoomFrame, accent: string, wings: Wing[]) {
  artOf(room).animate?.(ctx, spaces(room, rl, accent, wings), f);
}

/** The room's sign: its icon and name, at the left of the back wall. */
function namePlate(ctx: CanvasRenderingContext2D, s: Spaces, icon: string[]) {
  const name = s.room.name.toUpperCase();
  const w = 7 + 4 + textWidth(name) + 6;
  const x = s.wall.x + 4;
  const y = s.wall.y + 5;
  // Keep clear of a door in the back wall: drop the icon, then move the sign right of the door.
  const doorLeft = s.cx - DOOR_W / 2 - 4;
  const withIcon = !s.doorInWall || x + w < doorLeft;
  const px = withIcon || x + w - 11 < doorLeft ? x : s.cx + DOOR_W / 2 + 6;
  const pw = withIcon ? w : w - 11;
  rect(ctx, px - 1, y - 1, pw + 2, GLYPH_H + 8, P.ink);
  rect(ctx, px, y, pw, GLYPH_H + 6, "#0f1220");
  frame(ctx, px, y, pw, GLYPH_H + 6, s.accent);
  let tx = px + 3;
  if (withIcon) {
    icon.forEach((row, j) => [...row].forEach((bit, i) => bit === "1" && rect(ctx, px + 2 + i, y + 2 + j, 1, 1, s.accent)));
    tx = px + 12;
    rect(ctx, px + 10, y + 2, 1, 7, "#2a3050");
  }
  text(ctx, name, tx, y + 3, P.white);
}

function paintDoor(ctx: CanvasRenderingContext2D, rl: RoomLayout, sealed: boolean) {
  const r = rl.rect;
  const x = rl.door.inside.x - DOOR_W / 2;
  if (rl.side === "top") {
    // A doorway through the front wall onto the hall, its sliding doors open.
    const y = r.y + r.h - RIM;
    rect(ctx, x, y, DOOR_W, RIM, "#3d4256");
    rect(ctx, x, y + 1, DOOR_W, 1, "rgba(255,255,255,0.12)");
    for (const px of [x - 4, x + DOOR_W]) {
      rect(ctx, px, y - 3, 4, RIM + 3, P.steel1);
      rect(ctx, px, y - 3, 4, 1, P.steel2);
      rect(ctx, px + 1, y - 1, 2, 1, sealed ? P.red : P.green);
    }
    if (sealed) hazard(ctx, x, y, DOOR_W, RIM);
    return;
  }
  // Rooms below the hall: the doorway is cut through the back wall face.
  rect(ctx, x, r.y, DOOR_W, WALL, "#2b3044");
  rect(ctx, x, r.y, DOOR_W, 4, "rgba(0,0,0,0.4)");
  for (let i = 0; i < 3; i++) rect(ctx, x + 4, r.y + 8 + i * 5, DOOR_W - 8, 1, "rgba(255,255,255,0.05)");
  for (const px of [x - 4, x + DOOR_W]) {
    rect(ctx, px, r.y, 4, WALL, P.steel1);
    rect(ctx, px, r.y, 1, WALL, P.steel2);
    rect(ctx, px + 1, r.y + 4, 2, 1, sealed ? P.red : P.green);
  }
  if (sealed) {
    // A shut shutter with hazard stripes.
    rect(ctx, x, r.y, DOOR_W, WALL, P.steel0);
    for (let y = r.y + 2; y < r.y + WALL; y += 3) rect(ctx, x, y, DOOR_W, 1, P.hull1);
    hazard(ctx, x, r.y + WALL - 5, DOOR_W, 4);
  }
}
