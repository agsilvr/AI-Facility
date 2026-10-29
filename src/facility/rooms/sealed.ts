import { hash, P, rect, text, textWidth } from "../pixels";
import { blink, hazard, shadow, type RoomArt } from "./kit";

// A sealed room, kept for the next business. Dark and dusty, shapes under
// dust sheets, cobwebs, caution tape across the floor and a red lamp that
// blinks to show it's locked.

export const sealed: RoomArt = {
  icon: ["0011100", "0100010", "0100010", "1111111", "1110111", "1110111", "1111111"],

  floor(ctx, s) {
    const f = s.floor;
    rect(ctx, f.x, f.y, f.w, f.h, "#1c1c21");
    for (let y = 0; y < f.h; y += 16) for (let x = 0; x < f.w; x += 16) rect(ctx, f.x + x, f.y + y, 1, 1, "#26262c");
    for (let i = 0; i < f.w * 0.6; i++) rect(ctx, f.x + hash(i) * f.w, f.y + hash(i + 50) * f.h, 1, 1, i % 3 ? "#2a2a31" : "#141418");
    // Caution tape across the floor.
    for (let i = 0; i < f.w; i += 1) {
      const y = Math.round(f.y + 70 - (i / f.w) * 30);
      rect(ctx, f.x + i, y, 1, 3, Math.floor(i / 5) % 2 ? P.yellow : P.ink);
    }
    const word = "SEALED";
    text(ctx, word, f.x + (f.w - textWidth(word, 2)) / 2, f.y + 76, "#34343c", 2);
  },

  wall(ctx, s) {
    const w = s.wall;
    rect(ctx, w.x, w.y, w.w, w.h, "#24252c");
    for (let x = w.x + 12; x < w.x + w.w; x += 24) rect(ctx, x, w.y + 3, 1, w.h - 5, "#1a1b20");
    // A crack.
    for (let i = 0; i < 10; i++) rect(ctx, w.x + w.w * 0.3 + i * 2, w.y + 6 + ((i * 3) % 7), 2, 1, "#111216");
  },

  furnish(ctx, s) {
    const f = s.floor;
    // Old equipment under dust sheets, either side of the middle.
    for (const [x0, x1] of [[s.left.x0, s.left.x1], [s.right.x0, s.right.x1]]) {
      const w = Math.min(34, x1 - x0 - 6);
      if (w < 12) continue;
      const x = x0 + 4;
      shadow(ctx, x, f.y + 30, w, 3);
      rect(ctx, x - 1, f.y + 9, w + 2, 22, P.ink);
      rect(ctx, x, f.y + 10, w, 20, "#6b6a75");
      rect(ctx, x + 2, f.y + 10, w - 4, 3, "#85849a");
      for (let k = 4; k < w; k += 7) rect(ctx, x + k, f.y + 14, 1, 14, "#57566a");
      rect(ctx, x, f.y + 28, w, 2, "#4a4955");
    }
    // Cobwebs in the corners.
    for (const [x, d] of [[f.x, 1], [f.x + f.w - 1, -1]]) {
      for (let i = 0; i < 8; i++) {
        rect(ctx, x + d * i, f.y + 4, 1, 1, "rgba(200,200,210,0.35)");
        rect(ctx, x, f.y + 4 + i, 1, 1, "rgba(200,200,210,0.35)");
        rect(ctx, x + d * i, f.y + 4 + (7 - i), 1, 1, "rgba(200,200,210,0.25)");
      }
    }
    hazard(ctx, f.x + 2, f.y + f.h - 4, 12, 2);
  },

  animate(ctx, s, f) {
    rect(ctx, s.wall.x + s.wall.w - 10, s.wall.y + 6, 4, 4, blink(f.time, 1.2) ? P.red : P.darkRed);
  },
};
