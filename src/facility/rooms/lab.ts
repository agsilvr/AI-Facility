import { P, rect } from "../pixels";
import { blink, block, deskScreen, disc, glow, hazard, plant, shadow, type RoomArt, type Spaces } from "./kit";

// The Research Lab, where the researchers study what's selling. Clean white
// tiles, glowing specimen tanks, a microscope bench, an analysis screen that
// plots the current research as it goes, a whiteboard of trend lines and
// shelves of reference binders.

const TANK_COLOURS = [P.green, P.purple, P.teal];

/** The three tanks stand at the last workstation, against the back wall. */
function tanks(s: Spaces) {
  const st = s.rl.stations[2] ?? { x: s.right.x1 - 24 };
  return [-1, 0, 1].map((k) => st.x - 6 + k * 15);
}

export const lab: RoomArt = {
  icon: ["0011100", "0001000", "0001000", "0011100", "0111110", "1101011", "1111111"],

  floor(ctx, s) {
    const f = s.floor;
    for (let y = 0; y < f.h; y += 8) {
      for (let x = 0; x < f.w; x += 8) {
        rect(ctx, f.x + x, f.y + y, Math.min(8, f.w - x), Math.min(8, f.h - y), ((x + y) / 8) % 2 ? "#d3dde0" : "#e1e9eb");
        rect(ctx, f.x + x, f.y + y, 1, Math.min(8, f.h - y), "#b4c4c8");
      }
      rect(ctx, f.x, f.y + y, f.w, 1, "#b4c4c8");
    }
    // A hazard square under the tanks.
    const xs = tanks(s);
    const x0 = xs[0] - 4;
    const x1 = xs[2] + 16;
    hazard(ctx, x0, s.floor.y + 2, x1 - x0, 2);
    hazard(ctx, x0, s.floor.y + 30, x1 - x0, 2);
  },

  wall(ctx, s) {
    const w = s.wall;
    rect(ctx, w.x, w.y, w.w, w.h, "#c3cfd2");
    for (let x = w.x + 20; x < w.x + w.w; x += 20) rect(ctx, x, w.y + 3, 1, w.h - 5, "#a9b7bb");
    rect(ctx, w.x, w.y + 16, w.w, 2, P.teal);
    // A whiteboard of trend lines, between the sign and the tanks.
    const bx = w.x + 76;
    const bw = Math.min(46, tanks(s)[0] - 10 - bx);
    if (bw > 24 && !(s.doorInWall && bx + bw > s.cx - 20)) {
      rect(ctx, bx - 1, w.y + 4, bw + 2, 14, "#7d8a8e");
      rect(ctx, bx, w.y + 5, bw, 12, P.white);
      rect(ctx, bx + 2, w.y + 15, bw - 4, 1, P.ink);
      rect(ctx, bx + 2, w.y + 7, 1, 9, P.ink);
      let y = 13;
      for (let x = 0; x < bw - 6; x += 2) {
        y = Math.max(7, Math.min(14, y + (((x * 7) % 5) - 2.2 > 0 ? -1 : 0)));
        rect(ctx, bx + 4 + x, w.y + y, 2, 1, P.red);
      }
      rect(ctx, bx + bw - 6, w.y + 6, 3, 2, P.green);
    }
  },

  furnish(ctx, s) {
    const f = s.floor;
    const [bench, analysis] = s.rl.stations;
    // The microscope bench, with a rack of test tubes and flasks.
    if (bench) {
      const x = bench.x - 18;
      block(ctx, x, f.y + 13, 36, 8, 6, { top: "#e8eef0", front: "#9fb0b5" });
      rect(ctx, x + 6, f.y + 6, 4, 9, "#3a3f55");
      rect(ctx, x + 5, f.y + 5, 6, 2, P.ink);
      rect(ctx, x + 4, f.y + 14, 8, 2, "#3a3f55");
      rect(ctx, x + 15, f.y + 10, 10, 2, P.brown);
      for (let i = 0; i < 4; i++) rect(ctx, x + 16 + i * 2, f.y + 7, 1, 4, [P.green, P.pink, P.blue, P.yellow][i]);
      rect(ctx, x + 28, f.y + 9, 4, 5, "rgba(120,220,255,0.7)");
      rect(ctx, x + 29, f.y + 7, 2, 2, P.paper);
    }
    // The analysis computer; its chart is drawn live.
    if (analysis) {
      block(ctx, analysis.x - 15, f.y + 13, 30, 8, 6, { top: "#e8eef0", front: "#9fb0b5" });
      deskScreen(ctx, analysis.x - 11, f.y + 2, 22, 10, "#0b1d22");
      rect(ctx, analysis.x - 6, f.y + 16, 12, 3, "#3a3f55");
    }
    // The specimen tanks: glass tubes standing against the wall.
    for (const x of tanks(s)) {
      shadow(ctx, x - 1, f.y + 28, 14, 3);
      rect(ctx, x - 1, f.y - 12, 14, 41, P.ink);
      rect(ctx, x, f.y - 11, 12, 3, P.steel2);
      rect(ctx, x, f.y - 8, 12, 30, "#a8dadc");
      rect(ctx, x + 1, f.y - 8, 10, 30, "#1c3a3e");
      rect(ctx, x, f.y + 22, 12, 6, P.steel1);
      rect(ctx, x, f.y + 22, 12, 1, P.steel2);
      rect(ctx, x + 2, f.y + 24, 2, 2, P.green);
    }

    // Left of the walkway: shelves of reference binders and a sample freezer.
    if (s.left.x1 - s.left.x0 > 40) {
      const x = s.left.x0 + 2;
      block(ctx, x, f.y + 56, 30, 3, 26, { top: "#8a5a3b", front: "#55351f" });
      const colours = [P.red, P.blue, P.yellow, P.green, P.purple, P.orange];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) rect(ctx, x + 2 + i * 4 + (j % 2), f.y + 61 + j * 8, 3, 6, colours[(i + j * 2) % colours.length]);
      const fx = x + 36;
      if (fx + 22 < s.left.x1) {
        block(ctx, fx, f.y + 62, 22, 5, 20, { top: "#f0f4f5", front: "#c3ccd0" });
        rect(ctx, fx + 3, f.y + 70, 8, 4, "#0b1d22");
        rect(ctx, fx + 4, f.y + 71, 3, 1, P.blue);
        rect(ctx, fx + 18, f.y + 70, 1, 8, P.steel1);
      }
    }
    // Right of the walkway: a centrifuge and a trolley of beakers.
    if (s.right.x1 - s.right.x0 > 40) {
      const cxr = s.right.x0 + 12;
      shadow(ctx, cxr - 9, f.y + 76, 18, 3);
      disc(ctx, cxr, f.y + 68, 9, P.ink);
      disc(ctx, cxr, f.y + 68, 8, "#dfe6e8");
      disc(ctx, cxr, f.y + 67, 5, "#8a97a3");
      disc(ctx, cxr, f.y + 67, 2, P.steel0);
      const tx = s.right.x0 + 28;
      block(ctx, tx, f.y + 70, 26, 6, 6, { top: "#c0c8cc", front: "#7d878d" });
      for (let i = 0; i < 4; i++) {
        rect(ctx, tx + 2 + i * 6, f.y + 66, 4, 6, "rgba(160,230,255,0.75)");
        rect(ctx, tx + 2 + i * 6, f.y + 69, 4, 3, [P.green, P.purple, P.orange, P.teal][i]);
      }
      plant(ctx, s.right.x1 - 10, f.y + 78);
    }
    glow(ctx, tanks(s)[1] + 6, f.y + 10, 30, 20, "#2ec4b6", 0.06);
  },

  animate(ctx, s, f) {
    const fl = s.floor;
    // The tanks' liquid, gently bubbling.
    tanks(s).forEach((x, i) => {
      const level = 22 + Math.round(Math.sin(f.time * 1.2 + i * 2) * 3);
      rect(ctx, x + 1, fl.y + 22 - level, 10, level, TANK_COLOURS[i]);
      rect(ctx, x + 1, fl.y + 22 - level, 10, 1, P.white);
      rect(ctx, x + 2, fl.y + 22 - level, 2, level, "rgba(255,255,255,0.25)");
      for (let b = 0; b < 3; b++) {
        const p = (f.time * 0.5 + b / 3 + i * 0.2) % 1;
        rect(ctx, x + 4 + ((b * 3) % 5), fl.y + 20 - Math.floor(p * (level - 3)), 2, 2, "rgba(255,255,255,0.7)");
      }
    });
    // The analysis screen plots the research under way, as far as it has got.
    const analysis = s.rl.stations[1];
    if (analysis) {
      const researcher = f.state.agents.find((a) => a.roomId === s.room.id && a.status === "working");
      const task = researcher?.taskId ? f.state.tasks.find((t) => t.id === researcher.taskId) : undefined;
      const x0 = analysis.x - 10;
      const y0 = fl.y + 3;
      rect(ctx, x0, y0 + 7, 20, 1, "#1d4a52");
      const points = Math.round(18 * (task?.progress ?? 0));
      let y = 6;
      for (let i = 0; i < points; i++) {
        y = Math.max(1, Math.min(7, y + ((i * 5) % 3 === 0 ? -1 : (i * 3) % 4 === 0 ? 1 : 0)));
        rect(ctx, x0 + 1 + i, y0 + y, 1, 1, P.green);
      }
      if (!task) rect(ctx, x0 + 1, y0 + 3, 4, 1, blink(f.time, 2) ? "#2b7a6c" : "#123a34");
    }
    const bench = s.rl.stations[0];
    if (bench) rect(ctx, bench.x - 12, fl.y + 15, 1, 1, blink(f.time, 3) ? P.green : P.darkGreen);
  },
};
