import { hash, P, rect } from "../pixels";
import { block, ellipse, glow, plant, shadow, type RoomArt, type Spaces } from "./kit";

// The Design Studio, where the designers make the products. Warm wooden
// boards and a rainbow rug, cream walls with a mood board, easels at the
// workstations whose canvases change while someone is painting, a drafting
// table, a dress form, a sofa, and paint splashed about.

const SPLASH = [P.pink, P.blue, P.yellow, P.green, P.purple, P.orange];

/** Easels stand at every workstation except the drafting table. */
const easels = (s: Spaces) => s.rl.stations.filter((_, i) => i !== 2);

function easel(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shadow(ctx, x - 9, y + 25, 18, 2);
  rect(ctx, x - 9, y + 10, 2, 16, P.darkBrown);
  rect(ctx, x + 7, y + 10, 2, 16, P.darkBrown);
  rect(ctx, x - 1, y + 4, 2, 22, "#6b3f1f");
  rect(ctx, x - 12, y - 1, 24, 18, P.ink);
  rect(ctx, x - 11, y, 22, 16, P.white);
  rect(ctx, x - 12, y + 17, 24, 2, "#6b3f1f");
}

export const studio: RoomArt = {
  icon: ["0000011", "0000111", "0001110", "0011100", "0111000", "1110000", "1100000"],

  floor(ctx, s) {
    const f = s.floor;
    // Wooden boards, each a slightly different shade, with staggered joins.
    const shades = ["#8b5a33", "#7e5130", "#96633a", "#845632"];
    for (let row = 0, y = f.y; y < f.y + f.h; row++, y += 6) {
      let x = f.x - Math.floor(hash(row) * 30);
      let i = 0;
      while (x < f.x + f.w) {
        const len = 24 + Math.floor(hash(row * 13 + i) * 24);
        const x0 = Math.max(f.x, x);
        const x1 = Math.min(f.x + f.w, x + len);
        rect(ctx, x0, y, x1 - x0, 6, shades[(row + i) % shades.length]);
        rect(ctx, x0, y, x1 - x0, 1, "rgba(255,220,170,0.12)");
        rect(ctx, x1 - 1, y, 1, 6, "#4f3019");
        x += len;
        i++;
      }
      rect(ctx, f.x, y + 5, f.w, 1, "#5a381e");
    }
    // A big round rug in rings of colour, in the middle of the room.
    const ry = f.y + 72;
    const rings = ["#b98375", "#d0ac75", "#ded09a", "#9aaa7a", "#8aa6a6", "#a193ab"];
    rings.forEach((c, i) => ellipse(ctx, s.cx, ry, 40 - i * 6, 14 - i * 2, c));
    // Splashes of paint.
    for (let i = 0; i < 9; i++) {
      const x = f.x + 6 + Math.floor(hash(i + 3.3) * (f.w - 12));
      const y = f.y + 46 + Math.floor(hash(i + 8.8) * (f.h - 52));
      const c = SPLASH[i % SPLASH.length];
      rect(ctx, x, y, 3, 2, c);
      rect(ctx, x + 1, y - 1, 1, 4, c);
      rect(ctx, x + 4, y + 1, 1, 1, c);
    }
  },

  wall(ctx, s) {
    const w = s.wall;
    // Cream wallpaper over wooden panelling.
    rect(ctx, w.x, w.y, w.w, w.h, "#e2d3b2");
    for (let x = w.x + 3; x < w.x + w.w; x += 6) rect(ctx, x, w.y + 3, 1, 12, "#d6c59f");
    rect(ctx, w.x, w.y + 15, w.w, 7, "#7a4f2b");
    rect(ctx, w.x, w.y + 15, w.w, 1, "#9b6a3c");
    for (let x = w.x + 8; x < w.x + w.w; x += 16) rect(ctx, x, w.y + 16, 1, 6, "#5f3c20");
    // The mood board: photos and swatches pinned to cork.
    const x0 = s.doorInWall ? s.cx + 24 : w.x + w.w - 74;
    const bw = Math.min(64, w.x + w.w - 18 - x0);
    if (bw > 20) {
      rect(ctx, x0 - 1, w.y + 3, bw + 2, 14, "#5f3c20");
      rect(ctx, x0, w.y + 4, bw, 12, "#c0905a");
      for (let i = 0; i < Math.floor((bw - 2) / 8); i++) {
        const x = x0 + 2 + i * 8;
        const y = w.y + 5 + (i % 2) * 2;
        rect(ctx, x, y, 6, 7, i % 3 === 0 ? P.white : SPLASH[i % SPLASH.length]);
        if (i % 3 === 0) rect(ctx, x + 1, y + 2, 4, 3, SPLASH[(i + 2) % SPLASH.length]);
        rect(ctx, x + 2, y - 1, 2, 1, P.red);
      }
    }
    // A colour-swatch strip at the far right.
    const sx = w.x + w.w - 14;
    for (let i = 0; i < 6; i++) rect(ctx, sx, w.y + 4 + i * 2, 10, 2, SPLASH[i]);
  },

  furnish(ctx, s) {
    const f = s.floor;
    for (const st of easels(s)) easel(ctx, st.x, f.y + 6);
    // The drafting table, tilted, with a lamp and a sketch.
    const table = s.rl.stations[2];
    if (table) {
      block(ctx, table.x - 14, f.y + 10, 28, 12, 5, { top: "#efe6cf", front: "#8b5a33" });
      rect(ctx, table.x - 10, f.y + 13, 12, 1, P.blue);
      rect(ctx, table.x - 10, f.y + 16, 16, 1, P.blue);
      rect(ctx, table.x - 4, f.y + 12, 1, 8, P.blue);
      rect(ctx, table.x + 8, f.y + 4, 2, 8, P.steel1);
      rect(ctx, table.x + 6, f.y + 3, 6, 3, P.yellow);
    }
    // Left of the walkway: a sofa and a low table of sketchbooks.
    if (s.left.x1 - s.left.x0 > 48) {
      const x = s.left.x0 + 4;
      block(ctx, x, f.y + 60, 40, 6, 10, { top: "#6d3fa0", front: "#4a2870" });
      rect(ctx, x, f.y + 58, 40, 4, "#7d4fb5");
      rect(ctx, x + 1, f.y + 66, 18, 4, "#7d4fb5");
      rect(ctx, x + 21, f.y + 66, 18, 4, "#7d4fb5");
      block(ctx, x + 6, f.y + 82, 28, 5, 4, { top: "#9b6a3c", front: "#5f3c20" });
      rect(ctx, x + 9, f.y + 82, 8, 4, P.pink);
      rect(ctx, x + 20, f.y + 83, 8, 4, P.teal);
    }
    // Right of the walkway: the dress form, paint pots and a plant.
    if (s.right.x1 - s.right.x0 > 48) {
      const dx = s.right.x1 - 22;
      shadow(ctx, dx - 6, f.y + 90, 12, 2);
      rect(ctx, dx - 1, f.y + 80, 2, 10, P.darkBrown);
      rect(ctx, dx - 5, f.y + 89, 10, 2, P.darkBrown);
      rect(ctx, dx - 6, f.y + 62, 12, 18, P.ink);
      rect(ctx, dx - 5, f.y + 63, 10, 16, "#e9dcc0");
      rect(ctx, dx - 5, f.y + 70, 10, 9, "#e85d75");
      rect(ctx, dx - 6, f.y + 76, 12, 3, "#e85d75");
      rect(ctx, dx - 2, f.y + 60, 4, 3, "#e9dcc0");
      for (let i = 0; i < 3; i++) {
        const px = s.right.x0 + 6 + i * 9;
        shadow(ctx, px, f.y + 88, 7, 2);
        rect(ctx, px, f.y + 81, 7, 7, P.steel1);
        rect(ctx, px, f.y + 81, 7, 2, [P.red, P.yellow, P.blue][i]);
      }
      plant(ctx, s.right.x0 + 34, f.y + 74);
    }
    glow(ctx, s.cx, f.y + 50, 70, 30, "#ffd27a", 0.05);
  },

  animate(ctx, s, f) {
    // The canvases: a painting takes shape while a designer works on it.
    easels(s).forEach((st, i) => {
      const x = st.x - 11;
      const y = s.floor.y + 6;
      const painter = f.state.agents.find((a) => a.roomId === s.room.id && a.status === "working");
      const t = painter ? f.time : i * 3;
      const hue = Math.floor((t * 25 + i * 140) % 360);
      const a = `hsl(${hue - (hue % 30)},70%,60%)`;
      const b = `hsl(${(hue + 150) % 360 - ((hue + 150) % 30)},70%,55%)`;
      rect(ctx, x + 2, y + 2, 10, 7, a);
      rect(ctx, x + 9, y + 7, 11, 7, b);
      rect(ctx, x + 4, y + 10, 4, 4, P.yellow);
    });
  },
};
