import type { FactoryTheme } from "../../core/types";
import { P, rect, text, textWidth } from "../pixels";
import { barrel, blink, block, box, crate, glow, hazard, pipe, shadow, type RoomArt, type Spaces } from "./kit";

// The Factory Line, where the work gets made. Each business sets what its
// factory makes (its theme): clothing gets sewing machines, bolts of fabric
// and a rack of shirts; prints get presses and framed proofs; anything else
// gets packing benches. Diamond-plate floor, corrugated walls, pipes, sodium
// lamps, and a conveyor across the front that carries one item for every
// piece of work in the room, moving only while someone is working.

const ITEM_COLOURS = [P.orange, P.blue, P.pink, P.green, P.yellow, P.red, P.purple, P.white];

const theme = (s: Spaces): FactoryTheme => s.room.theme ?? "goods";

/** The conveyor's two halves, either side of the walkway. */
function belts(s: Spaces) {
  return { y: s.floor.y + 54, parts: [[s.floor.x + 4, s.cx - 18], [s.cx + 18, s.floor.x + s.floor.w - 4]] as const };
}

function shirt(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  rect(ctx, x - 1, y, 9, 4, P.ink);
  rect(ctx, x, y - 1, 7, 9, P.ink);
  rect(ctx, x, y + 1, 7, 2, color);
  rect(ctx, x + 1, y, 5, 7, color);
  rect(ctx, x + 3, y, 1, 1, P.ink);
  rect(ctx, x + 1, y + 6, 5, 1, "rgba(0,0,0,0.25)");
}

function printSheet(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  rect(ctx, x - 1, y - 1, 9, 9, P.ink);
  rect(ctx, x, y, 7, 7, P.white);
  rect(ctx, x + 1, y + 2, 5, 3, color);
}

/** A workstation's machine, sitting on its table. */
function machine(ctx: CanvasRenderingContext2D, kind: FactoryTheme, x: number, y: number, accent: string) {
  if (kind === "clothing") {
    // A sewing machine: the arm, the needle head and a spool of thread.
    rect(ctx, x - 7, y - 1, 15, 8, P.ink);
    rect(ctx, x - 6, y, 13, 3, P.white);
    rect(ctx, x - 6, y, 3, 6, P.white);
    rect(ctx, x + 4, y + 2, 3, 4, "#dfe3ea");
    rect(ctx, x - 6, y + 3, 10, 1, accent);
    rect(ctx, x + 5, y + 6, 1, 2, P.steel2);
    rect(ctx, x - 4, y - 3, 3, 3, P.red);
  } else if (kind === "prints") {
    // A screen-printing press.
    rect(ctx, x - 9, y - 1, 19, 8, P.ink);
    rect(ctx, x - 8, y, 17, 6, P.steel2);
    rect(ctx, x - 6, y + 1, 13, 4, "#1d2230");
    rect(ctx, x - 1, y - 4, 3, 4, P.steel1);
  } else {
    // A packing bench with a tape gun.
    box(ctx, x - 6, y - 1, 12, 7);
    rect(ctx, x + 7, y + 1, 4, 3, P.red);
  }
}

export const factory: RoomArt = {
  icon: ["0010100", "0111110", "1101011", "1100011", "1101011", "0111110", "0010100"],

  floor(ctx, s) {
    const f = s.floor;
    // Diamond-plate steel.
    rect(ctx, f.x, f.y, f.w, f.h, "#b4a78a");
    for (let y = f.y + 2; y < f.y + f.h; y += 6) {
      for (let x = f.x + ((y - f.y) % 12 === 2 ? 1 : 4); x < f.x + f.w; x += 6) {
        rect(ctx, x, y, 2, 1, "#c4b79a");
        rect(ctx, x, y + 1, 2, 1, "#958d73");
      }
    }
    // Painted lines: along the front of the workstations and either side of the walkway.
    rect(ctx, f.x + 2, f.y + 46, f.w - 4, 2, P.yellow);
    for (const x of [s.cx - 16, s.cx + 14]) rect(ctx, x, s.doorInWall ? f.y : f.y + 46, 2, s.doorInWall ? 46 : f.h - 46, P.yellow);
    // Oil drips.
    for (const [dx, dy] of [[0.2, 80], [0.74, 86]]) {
      rect(ctx, f.x + f.w * dx, f.y + dy, 6, 2, "rgba(10,10,15,0.35)");
      rect(ctx, f.x + f.w * dx + 2, f.y + dy - 1, 3, 4, "rgba(10,10,15,0.35)");
    }
  },

  wall(ctx, s) {
    const w = s.wall;
    // Corrugated steel.
    for (let x = w.x; x < w.x + w.w; x += 2) rect(ctx, x, w.y, 1, w.h, (x / 2) % 2 ? "#a89b7c" : "#9d9075");
    for (let x = w.x; x < w.x + w.w; x += 8) rect(ctx, x, w.y + 18, 4, 3, (x / 8) % 2 ? P.orange : P.ink);
    // Pipes along the top, with valves.
    pipe(ctx, w.x, w.y + 5, w.w, "#b86b2c", "#7a4318");
    for (let x = w.x + 30; x < w.x + w.w - 10; x += 60) {
      rect(ctx, x, w.y + 3, 5, 2, P.red);
      rect(ctx, x + 2, w.y + 8, 1, 10, "#7a4318");
    }
    // What the line makes, lit up, then stock for it on the wall.
    const label = theme(s) === "clothing" ? "CLOTHING" : theme(s) === "prints" ? "PRINTS" : "GOODS";
    const lx = s.doorInWall ? s.cx + 24 : w.x + 80;
    rect(ctx, lx - 1, w.y + 10, textWidth(label) + 8, 9, P.ink);
    rect(ctx, lx, w.y + 11, textWidth(label) + 6, 7, "#2a1a0c");
    text(ctx, label, lx + 3, w.y + 12, P.orange);
    const shelfX = lx + textWidth(label) + 14;
    const shelfEnd = w.x + w.w - 6;
    if (theme(s) === "clothing") {
      // Bolts of fabric on a shelf.
      for (let x = shelfX, i = 0; x + 6 < shelfEnd && i < 10; x += 7, i++) {
        rect(ctx, x, w.y + 10, 6, 8, ["#e85d75", "#3f8fd8", "#f7d94c", "#4cc38a", "#8c5bd6", "#f6a33b"][i % 6]);
        rect(ctx, x, w.y + 10, 6, 1, "rgba(255,255,255,0.35)");
        rect(ctx, x + 2, w.y + 13, 2, 2, "rgba(0,0,0,0.3)");
      }
    } else if (theme(s) === "prints") {
      for (let x = shelfX, i = 0; x + 10 < shelfEnd && i < 6; x += 12, i++) printSheet(ctx, x, w.y + 10, ITEM_COLOURS[i]);
    } else {
      for (let x = shelfX; x + 8 < shelfEnd; x += 10) rect(ctx, x, w.y + 11, 2, 6, P.steel2);
    }
    rect(ctx, shelfX - 2, w.y + 18, Math.max(0, shelfEnd - shelfX), 2, P.steel1);
  },

  furnish(ctx, s) {
    const f = s.floor;
    const kind = theme(s);
    // A machine on a table at every workstation.
    for (const st of s.rl.stations) {
      block(ctx, st.x - 13, f.y + 14, 26, 8, 6, { top: "#6b7082", front: "#3b3f4c" });
      machine(ctx, kind, st.x, f.y + 7, s.accent);
    }
    // The conveyor.
    const { y, parts } = belts(s);
    for (const [x0, x1] of parts) {
      if (x1 - x0 < 12) continue;
      shadow(ctx, x0, y + 14, x1 - x0, 3);
      rect(ctx, x0 - 1, y - 3, x1 - x0 + 2, 17, P.ink);
      rect(ctx, x0, y - 2, x1 - x0, 3, P.steel1);
      rect(ctx, x0, y + 1, x1 - x0, 9, "#1c1e24");
      rect(ctx, x0, y + 10, x1 - x0, 3, P.steel0);
      for (let x = x0 + 3; x < x1 - 3; x += 9) rect(ctx, x, y + 11, 3, 2, "#2a2d36");
      hazard(ctx, x0, y - 2, 3, 15);
      hazard(ctx, x1 - 3, y - 2, 3, 15);
    }
    // Under the line: raw stock on the left, finished stock on the right.
    const lx0 = s.left.x0 + 2;
    if (kind === "clothing") {
      // Rolls of fabric and a rack of thread spools.
      for (let i = 0; i < 3; i++) {
        const x = lx0 + i * 12;
        shadow(ctx, x, f.y + 90, 11, 2);
        rect(ctx, x, f.y + 76, 11, 14, P.ink);
        rect(ctx, x + 1, f.y + 77, 9, 12, ["#3f8fd8", "#e85d75", "#4cc38a"][i]);
        rect(ctx, x + 1, f.y + 77, 9, 2, "rgba(255,255,255,0.3)");
        rect(ctx, x + 4, f.y + 80, 3, 3, "#d9d4c5");
      }
      const sx = lx0 + 40;
      if (sx + 22 < s.left.x1) {
        block(ctx, sx, f.y + 78, 22, 4, 8, { top: "#8a5a3b", front: "#55351f" });
        for (let i = 0; i < 5; i++) rect(ctx, sx + 2 + i * 4, f.y + 74, 3, 5, ITEM_COLOURS[i]);
      }
    } else {
      for (let i = 0; i < 3; i++) barrel(ctx, lx0 + i * 12, f.y + 76, i === 1 ? "#3f6fd8" : "#c0392b");
    }
    const rx1 = s.right.x1 - 2;
    if (kind === "clothing") {
      // A rail of finished shirts, and a folded pile.
      const rx0 = Math.max(s.right.x0 + 2, rx1 - 50);
      shadow(ctx, rx0, f.y + 92, rx1 - rx0, 2);
      rect(ctx, rx0, f.y + 74, rx1 - rx0, 2, P.steel2);
      rect(ctx, rx0, f.y + 74, 2, 18, P.steel2);
      rect(ctx, rx1 - 2, f.y + 74, 2, 18, P.steel2);
      for (let x = rx0 + 4, i = 0; x < rx1 - 8; x += 8, i++) shirt(ctx, x, f.y + 77, ITEM_COLOURS[i % ITEM_COLOURS.length]);
      for (let i = 0; i < 4; i++) rect(ctx, s.right.x0 + 4, f.y + 86 - i * 3, 12, 3, ITEM_COLOURS[(i + 3) % ITEM_COLOURS.length]);
    } else if (kind === "prints") {
      for (let i = 0; i < 4; i++) printSheet(ctx, rx1 - 10 - i * 10, f.y + 80, ITEM_COLOURS[i]);
    } else {
      for (let i = 0; i < 3; i++) crate(ctx, rx1 - 12 - i * 12, f.y + 80, 10);
    }
    box(ctx, s.right.x0 + 20, f.y + 82, 12, 8);
    // Sodium lamps overhead.
    for (const x of [f.x + f.w * 0.25, f.x + f.w * 0.75]) glow(ctx, x, f.y + 30, 44, 26, "#ff9f1c", 0.05);
  },

  animate(ctx, s, f) {
    const kind = theme(s);
    const { y, parts } = belts(s);
    const running = f.working > 0;
    // The belt's slats move while the line is running.
    const shift = running ? Math.floor(f.time * 14) % 8 : 0;
    for (const [x0, x1] of parts) {
      for (let x = x0 + 2 + shift; x < x1 - 3; x += 8) rect(ctx, x, y + 2, 1, 7, "#30333d");
    }
    // One item on the line for every piece of work in this room.
    const n = Math.min(f.busy, 8);
    const [[a0, a1], [b0, b1]] = parts;
    const length = a1 - a0 + (b1 - b0);
    for (let i = 0; i < n; i++) {
      const p = ((running ? f.time * 0.05 : 0) + i / Math.max(1, n)) % 1;
      const d = p * (length - 10);
      const x = d < a1 - a0 - 8 ? a0 + 2 + d : b0 + 2 + (d - (a1 - a0));
      if (kind === "clothing") shirt(ctx, x, y + 2, ITEM_COLOURS[i]);
      else if (kind === "prints") printSheet(ctx, x, y + 2, ITEM_COLOURS[i]);
      else box(ctx, x, y + 2, 8, 6);
    }
    // Machines at work: a needle going up and down, a light on.
    s.rl.stations.forEach((st, i) => {
      rect(ctx, st.x + 9, s.floor.y + 16, 2, 2, running && blink(f.time, 6, i) ? P.green : "#1d3a2a");
      if (kind === "clothing" && running) rect(ctx, st.x + 5, s.floor.y + 13 + (Math.floor(f.time * 12 + i) % 2), 1, 2, P.white);
    });
  },
};
