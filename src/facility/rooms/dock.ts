import { P, rect, text, textWidth } from "../pixels";
import { blink, block, box, glow, hazard, shadow, type RoomArt, type Spaces } from "./kit";

// The Shipping Dock: the facility's only way out to the surface. Concrete
// with painted loading lines, a freight lift with the shutter to the surface
// behind it, a lift control post, a shipping desk with a label printer, a
// forklift and racks of boxes. Work on its way out waits on the lift: one box
// for every piece of work in the room.

function lift(s: Spaces) {
  const w = Math.min(64, s.right.x1 - s.right.x0 - 2);
  return { x: s.right.x1 - w, y: s.floor.y + 52, w, h: 40 };
}

function shutter(s: Spaces) {
  const x0 = s.doorInWall ? s.cx + 24 : s.wall.x + s.wall.w - 70;
  return { x: x0, w: Math.min(64, s.wall.x + s.wall.w - 4 - x0) };
}

export const dock: RoomArt = {
  icon: ["0001000", "0011100", "0111110", "0001000", "1111111", "1000001", "1111111"],

  floor(ctx, s) {
    const f = s.floor;
    // Concrete slabs with cracks and oil stains.
    for (let y = 0; y < f.h; y += 16) {
      for (let x = 0; x < f.w; x += 16) {
        rect(ctx, f.x + x, f.y + y, Math.min(16, f.w - x), Math.min(16, f.h - y), ((x + y) / 16) % 2 ? "#5b5e66" : "#55585f");
        rect(ctx, f.x + x, f.y + y, Math.min(16, f.w - x), 1, "#474a50");
        rect(ctx, f.x + x, f.y + y, 1, Math.min(16, f.h - y), "#474a50");
      }
    }
    for (const [dx, dy] of [[0.15, 70], [0.45, 30], [0.6, 84]]) {
      rect(ctx, f.x + f.w * dx, f.y + dy, 9, 3, "rgba(15,15,20,0.3)");
      rect(ctx, f.x + f.w * dx + 3, f.y + dy - 1, 4, 5, "rgba(15,15,20,0.3)");
    }
    rect(ctx, f.x + 30, f.y + 60, 1, 6, "#3e4046");
    rect(ctx, f.x + 31, f.y + 65, 4, 1, "#3e4046");
    // Painted loading lines and arrows to the lift.
    const l = lift(s);
    rect(ctx, f.x + 2, f.y + 46, f.w - 4, 2, P.yellow);
    for (let x = s.left.x0 + 6; x < l.x - 12; x += 22) {
      for (let i = 0; i < 4; i++) rect(ctx, x + i, f.y + 70 - i, 1, i * 2 + 1, "#c9a227");
      rect(ctx, x - 6, f.y + 70, 6, 1, "#c9a227");
    }
  },

  wall(ctx, s) {
    const w = s.wall;
    rect(ctx, w.x, w.y, w.w, w.h, "#6b6e74");
    for (let x = w.x; x < w.x + w.w; x += 24) rect(ctx, x, w.y + 3, 1, w.h - 5, "#5a5d63");
    hazard(ctx, w.x, w.y + 17, w.w, 4);
    // The shutter up to the surface.
    const sh = shutter(s);
    if (sh.w > 24) {
      rect(ctx, sh.x - 3, w.y + 2, sh.w + 6, 20, "#3a3d45");
      rect(ctx, sh.x, w.y + 4, sh.w, 17, "#8a8f9e");
      for (let y = w.y + 6; y < w.y + 21; y += 3) rect(ctx, sh.x, y, sh.w, 1, "#6a6f7e");
      const label = "SURFACE";
      rect(ctx, sh.x + (sh.w - textWidth(label)) / 2 - 2, w.y + 7, textWidth(label) + 4, 9, P.ink);
      text(ctx, label, sh.x + (sh.w - textWidth(label)) / 2, w.y + 9, P.yellow);
    }
  },

  furnish(ctx, s) {
    const f = s.floor;
    const [post, desk] = s.rl.stations;
    // The lift's control post.
    if (post) {
      block(ctx, post.x - 6, f.y + 12, 12, 4, 12, { top: P.yellow, front: "#b8941f" });
      rect(ctx, post.x - 3, f.y + 18, 2, 2, P.green);
      rect(ctx, post.x + 1, f.y + 18, 2, 2, P.red);
    }
    // The shipping desk: a label printer, a parcel scale and tape.
    if (desk) {
      block(ctx, desk.x - 17, f.y + 13, 34, 8, 6, { top: "#8a8f9e", front: "#4a4e5c" });
      rect(ctx, desk.x - 14, f.y + 8, 10, 7, "#d9d4c5");
      rect(ctx, desk.x - 13, f.y + 13, 8, 4, P.white);
      rect(ctx, desk.x - 1, f.y + 14, 9, 5, P.steel2);
      rect(ctx, desk.x, f.y + 13, 7, 1, P.ink);
      box(ctx, desk.x, f.y + 6, 8, 6);
      rect(ctx, desk.x + 11, f.y + 15, 4, 4, "#c9a227");
    }
    // The freight lift: a platform with hazard edges and an arrow pointing up.
    const l = lift(s);
    shadow(ctx, l.x, l.y + l.h, l.w, 3);
    rect(ctx, l.x - 1, l.y - 1, l.w + 2, l.h + 2, P.ink);
    rect(ctx, l.x, l.y, l.w, l.h, "#3d4150");
    for (let y = l.y + 4; y < l.y + l.h - 3; y += 4) rect(ctx, l.x + 3, y, l.w - 6, 1, "#4a4f60");
    hazard(ctx, l.x, l.y, l.w, 3);
    hazard(ctx, l.x, l.y + l.h - 3, l.w, 3);
    hazard(ctx, l.x, l.y, 3, l.h);
    hazard(ctx, l.x + l.w - 3, l.y, 3, l.h);
    const ax = l.x + Math.round(l.w / 2);
    for (let i = 0; i < 6; i++) rect(ctx, ax - i, l.y + 8 + i, i * 2 + 1, 1, "#6b5a1a");
    rect(ctx, ax - 2, l.y + 14, 5, 10, "#6b5a1a");
    // Left of the walkway: a forklift and a rack of boxes.
    if (s.left.x1 - s.left.x0 > 40) {
      const fx = s.left.x0 + 6;
      const fy = f.y + 64;
      shadow(ctx, fx, fy + 20, 26, 3);
      rect(ctx, fx - 1, fy - 1, 22, 20, P.ink);
      rect(ctx, fx, fy, 20, 18, P.yellow);
      rect(ctx, fx, fy, 20, 2, "#ffe680");
      rect(ctx, fx + 3, fy + 3, 12, 8, "#2a2d36");
      rect(ctx, fx + 4, fy + 4, 4, 3, P.steel0);
      rect(ctx, fx + 20, fy + 4, 2, 14, P.steel2);
      rect(ctx, fx + 22, fy + 14, 8, 2, P.steel2);
      rect(ctx, fx + 22, fy + 8, 8, 2, P.steel2);
      for (const wx of [fx + 1, fx + 14]) rect(ctx, wx, fy + 17, 5, 3, P.ink);
      const rx = fx + 34;
      if (rx + 20 < s.left.x1) {
        block(ctx, rx, f.y + 58, 20, 3, 30, { top: "#5b6275", front: "#3a3f50" });
        for (let j = 0; j < 3; j++) {
          rect(ctx, rx, f.y + 70 + j * 9, 20, 1, "#7d859b");
          box(ctx, rx + 2, f.y + 63 + j * 9, 7, 6);
          if (j !== 1) box(ctx, rx + 11, f.y + 63 + j * 9, 7, 6);
        }
      }
    }
    glow(ctx, l.x + l.w / 2, l.y + l.h / 2, 40, 22, "#ffd84d", 0.05);
  },

  animate(ctx, s, f) {
    // Work on its way out waits on the lift.
    const l = lift(s);
    const n = Math.min(f.busy, 8);
    for (let i = 0; i < n; i++) box(ctx, l.x + 6 + (i % 4) * 13, l.y + 8 + Math.floor(i / 4) * 14, 10, 8);
    // Chasing lights up the shutter's sides, and the post's lamp, while anything's leaving.
    const sh = shutter(s);
    if (sh.w > 24) {
      const k = Math.floor(f.time * 6) % 4;
      for (const x of [sh.x - 2, sh.x + sh.w + 1]) {
        for (let i = 0; i < 4; i++) rect(ctx, x, s.wall.y + 18 - i * 4, 1, 2, n > 0 && i === k ? P.yellow : "#5a4a12");
      }
    }
    const post = s.rl.stations[0];
    if (post) rect(ctx, post.x - 1, s.floor.y + 10, 3, 3, n > 0 && blink(f.time, 5) ? P.orange : "#5a3a10");
  },
};
