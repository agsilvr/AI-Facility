import { P, rect, tag, text } from "../pixels";
import { blink, block, disc, ellipse, glow, shadow, type RoomArt, type Spaces } from "./kit";

// The Vault: where finished work is banked. Riveted steel walls with a huge
// round vault door, a gold-and-marble floor, a counting desk, a wall of
// deposit boxes, and one gold bar on the stack for every finished task.

const GOLD_A = "#3b2f14";
const GOLD_B = "#48391a";

/** The vault door sits at the right of the back wall, clear of any doorway. */
const doorX = (s: Spaces) => s.wall.x + s.wall.w - 20;

/** Where the gold stack is: the floor left of the walkway. */
function hoard(s: Spaces) {
  return { x0: s.left.x0 + 4, x1: s.left.x1 - 2, base: s.floor.y + s.floor.h - 8 };
}

function goldBar(ctx: CanvasRenderingContext2D, x: number, y: number) {
  rect(ctx, x - 1, y - 1, 9, 6, P.darkGold);
  rect(ctx, x, y, 7, 4, P.gold);
  rect(ctx, x + 1, y, 5, 1, P.yellow);
  rect(ctx, x, y + 3, 7, 1, "#b0821c");
}

export const vault: RoomArt = {
  icon: ["0011100", "0100010", "1001001", "1011101", "1001001", "0100010", "0011100"],

  floor(ctx, s) {
    const f = s.floor;
    // Polished marble in two golds, with the odd glint.
    for (let y = 0; y < f.h; y += 8) {
      for (let x = 0; x < f.w; x += 8) {
        rect(ctx, f.x + x, f.y + y, Math.min(8, f.w - x), Math.min(8, f.h - y), ((x + y) / 8) % 2 ? GOLD_B : GOLD_A);
      }
    }
    for (let i = 0; i < f.w; i += 23) rect(ctx, f.x + i, f.y + ((i * 7) % f.h), 2, 1, "rgba(255,230,150,0.18)");
    // A deep red carpet down the walkway.
    const top = s.doorInWall ? f.y : f.y + 40;
    const bottom = s.doorInWall ? f.y + 44 : f.y + f.h;
    rect(ctx, s.cx - 11, top, 22, bottom - top, "#5c1520");
    rect(ctx, s.cx - 11, top, 1, bottom - top, P.gold);
    rect(ctx, s.cx + 10, top, 1, bottom - top, P.gold);
  },

  wall(ctx, s) {
    const w = s.wall;
    rect(ctx, w.x, w.y, w.w, w.h, "#3a3d4c");
    // Riveted steel plates with a gold trim.
    for (let x = w.x; x < w.x + w.w; x += 16) {
      rect(ctx, x, w.y + 3, 1, w.h - 5, "#2a2c37");
      for (const y of [w.y + 5, w.y + 18]) rect(ctx, x + 3, y, 1, 1, "#7b8095");
    }
    rect(ctx, w.x, w.y + 20, w.w, 1, P.gold);
    // The vault door: a great round door with bolts round the edge.
    const dx = doorX(s);
    const dy = w.y + 12;
    disc(ctx, dx, dy, 13, P.ink);
    disc(ctx, dx, dy, 12, "#8890ad");
    disc(ctx, dx, dy, 10, "#5c637d");
    disc(ctx, dx, dy, 8, "#727a96");
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      rect(ctx, dx + Math.round(Math.cos(a) * 11) - 1, dy + Math.round(Math.sin(a) * 11) - 1, 2, 2, P.gold);
    }
    disc(ctx, dx, dy, 2, P.gold);
  },

  furnish(ctx, s) {
    const f = s.floor;
    const [desk] = s.rl.stations;
    // The counting desk with scales, a ledger and coins.
    if (desk) {
      block(ctx, desk.x - 16, f.y + 13, 32, 8, 6, { top: "#6b4a2f", front: "#3d2a1a" });
      rect(ctx, desk.x - 12, f.y + 8, 1, 6, P.steel2);
      rect(ctx, desk.x - 15, f.y + 8, 7, 1, P.steel2);
      rect(ctx, desk.x - 16, f.y + 9, 3, 1, P.gold);
      rect(ctx, desk.x - 10, f.y + 9, 3, 1, P.gold);
      rect(ctx, desk.x - 4, f.y + 14, 9, 6, "#7a1f2c");
      rect(ctx, desk.x, f.y + 14, 1, 6, P.gold);
      for (let i = 0; i < 3; i++) rect(ctx, desk.x + 8 + i * 3, f.y + 18 - i * 2, 3, 2 + i * 2, P.gold);
    }
    // A wall of deposit boxes behind the walkway's far side.
    const bx = s.right.x0 + 4;
    const bw = Math.min(56, s.right.x1 - bx - 2);
    if (bw > 20) {
      block(ctx, bx, f.y + 4, bw, 4, 24, { top: "#6a7088", front: "#4a5066" });
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < Math.floor((bw - 2) / 9); i++) {
          const x = bx + 2 + i * 9;
          const y = f.y + 10 + j * 7;
          rect(ctx, x, y, 8, 6, "#5a6078");
          rect(ctx, x, y, 8, 1, "#7a809a");
          rect(ctx, x + 6, y + 3, 1, 1, P.gold);
        }
      }
    }
    // The prize: a gem on a velvet pedestal behind a rope.
    const px = Math.round((s.right.x0 + s.right.x1) / 2);
    const py = f.y + 66;
    shadow(ctx, px - 8, py + 14, 16, 3);
    block(ctx, px - 7, py, 14, 4, 12, { top: "#d9d4c5", front: "#a49f90" });
    rect(ctx, px - 5, py, 10, 3, "#7a1f2c");
    for (const dx of [-16, 14]) {
      rect(ctx, dx + px, py + 2, 2, 14, P.gold);
      rect(ctx, dx + px - 1, py + 1, 4, 2, P.yellow);
    }
    for (let i = 0; i < 30; i++) rect(ctx, px - 14 + i, py + 4 + Math.round(Math.sin((i / 30) * Math.PI) * 4), 1, 1, "#9c1f30");
    // Money bags.
    for (const [x, y] of [[s.right.x1 - 12, f.y + 82], [s.right.x1 - 22, f.y + 86]]) {
      shadow(ctx, x - 1, y + 9, 10, 2);
      ellipse(ctx, x + 4, y + 5, 5, 4, P.ink);
      ellipse(ctx, x + 4, y + 5, 4, 3, "#a88a5a");
      rect(ctx, x + 2, y - 1, 4, 3, "#a88a5a");
      text(ctx, "$", x + 3, y + 3, P.darkGold);
    }
    glow(ctx, (hoard(s).x0 + hoard(s).x1) / 2, hoard(s).base - 10, 40, 18, "#ffd84d", 0.05);
  },

  animate(ctx, s, f) {
    // One gold bar for every finished task, stacked in rows.
    const h = hoard(s);
    const perRow = Math.max(1, Math.floor((h.x1 - h.x0) / 9));
    const shown = Math.min(f.completed, perRow * 5);
    for (let i = 0; i < shown; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      goldBar(ctx, h.x0 + col * 9 + (row % 2) * 4, h.base - row * 5);
    }
    tag(ctx, `BANKED ${f.completed}`, (h.x0 + h.x1) / 2, h.base - 5 * 5 - 12, P.yellow);
    // The door's wheel turns slowly; the gem catches the light.
    const dx = doorX(s);
    const dy = s.wall.y + 12;
    const a = f.time * 0.6;
    for (let k = 0; k < 3; k++) {
      const ang = a + (k * Math.PI) / 3;
      for (let r = -6; r <= 6; r++) rect(ctx, dx + Math.round(Math.cos(ang) * r), dy + Math.round(Math.sin(ang) * r), 1, 1, P.steel0);
    }
    const px = Math.round((s.right.x0 + s.right.x1) / 2);
    const py = s.floor.y + 66;
    rect(ctx, px - 2, py - 5, 5, 4, "#4fd1ff");
    rect(ctx, px - 1, py - 6, 3, 1, "#4fd1ff");
    rect(ctx, px - 1, py - 4, 1, 1, P.white);
    if (blink(f.time, 1.5)) {
      rect(ctx, px + 3, py - 8, 1, 3, P.white);
      rect(ctx, px + 2, py - 7, 3, 1, P.white);
    }
  },
};
