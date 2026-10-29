import { P, rect, tag, text, textWidth } from "../pixels";
import { blink, block, deskScreen, glow, hazard, screen, shadow, type RoomArt, type Spaces } from "./kit";

// Security: the checkpoint every draft passes through before the owner sees
// it. A body-scanner arch over the walkway, a wall of camera monitors, a
// guard's desk, an X-ray belt, and a quarantine cage that holds one red file
// for every draft blocked by the safety checks.

const STEEL = "#22252e";

/** The arch stands over the walkway from the door, so everyone walks through it. */
const arch = (s: Spaces) => ({ x0: s.cx - 19, x1: s.cx + 19, top: s.floor.y + 4, bottom: s.floor.y + 34 });

function cage(s: Spaces) {
  const w = Math.min(60, s.right.x1 - s.right.x0 - 4);
  return { x: s.right.x1 - w - 2, y: s.floor.y + 54, w, h: 34 };
}

function cctv(s: Spaces) {
  const x0 = s.doorInWall ? s.cx + 24 : s.wall.x + s.wall.w - 64;
  const cols = Math.max(1, Math.min(4, Math.floor((s.wall.x + s.wall.w - 4 - x0) / 13)));
  return { x0, cols };
}

export const security: RoomArt = {
  icon: ["0111110", "1111111", "1101011", "1110111", "0111110", "0011100", "0001000"],

  floor(ctx, s) {
    const f = s.floor;
    // Steel grating.
    rect(ctx, f.x, f.y, f.w, f.h, "#1b1e25");
    for (let x = f.x; x < f.x + f.w; x += 4) rect(ctx, x, f.y, 1, f.h, "#262a33");
    for (let y = f.y; y < f.y + f.h; y += 4) rect(ctx, f.x, y, f.w, 1, "#262a33");
    // A solid walkway from the door through the scanner, edged in yellow.
    const top = s.doorInWall ? f.y : f.y + 36;
    const bottom = s.doorInWall ? f.y + 46 : f.y + f.h;
    rect(ctx, s.cx - 14, top, 28, bottom - top, "#2b2f3a");
    rect(ctx, s.cx - 14, top, 2, bottom - top, P.yellow);
    rect(ctx, s.cx + 12, top, 2, bottom - top, P.yellow);
    // The inspection square where people stop to be checked.
    hazard(ctx, s.cx - 22, f.y + 36, 44, 3);
  },

  wall(ctx, s) {
    const w = s.wall;
    rect(ctx, w.x, w.y, w.w, w.h, STEEL);
    for (let x = w.x + 12; x < w.x + w.w; x += 24) rect(ctx, x, w.y + 3, 1, w.h - 6, "#191b22");
    // A red warning band.
    for (let x = w.x; x < w.x + w.w; x += 6) rect(ctx, x, w.y + 17, 3, 3, (x / 6) % 2 ? P.darkRed : P.ink);
    // The wall of camera monitors; the pictures are drawn live.
    const { x0, cols } = cctv(s);
    rect(ctx, x0 - 2, w.y + 3, cols * 13 + 3, 17, "#0b0c10");
    for (let j = 0; j < 2; j++) for (let i = 0; i < cols; i++) screen(ctx, x0 + i * 13, w.y + 4 + j * 8, 11, 6, "#0f2a20");
  },

  furnish(ctx, s) {
    const f = s.floor;
    const [guard, watch] = s.rl.stations;
    // The guard's desk, with two screens and the red phone.
    if (guard) {
      block(ctx, guard.x - 18, f.y + 13, 36, 8, 6, { top: "#3a3f4f", front: "#20232c" });
      deskScreen(ctx, guard.x - 15, f.y + 5, 11, 7, "#0f2a20");
      deskScreen(ctx, guard.x - 2, f.y + 5, 11, 7, "#0f2a20");
      rect(ctx, guard.x + 11, f.y + 14, 5, 3, P.red);
      rect(ctx, guard.x + 12, f.y + 13, 3, 1, P.darkRed);
    }
    // The camera console under the monitor wall, with a joystick.
    if (watch) {
      block(ctx, watch.x - 15, f.y + 13, 30, 8, 6, { top: "#3a3f4f", front: "#20232c" });
      rect(ctx, watch.x - 2, f.y + 13, 3, 3, P.ink);
      rect(ctx, watch.x - 1, f.y + 10, 1, 4, P.steel2);
      rect(ctx, watch.x - 2, f.y + 9, 3, 2, P.red);
      for (let i = 0; i < 4; i++) rect(ctx, watch.x + 4 + i * 3, f.y + 15, 2, 2, [P.green, P.yellow, P.red, P.blue][i]);
    }

    // The scanner arch over the walkway.
    const a = arch(s);
    for (const x of [a.x0, a.x1 - 6]) {
      shadow(ctx, x, a.bottom, 6, 3);
      rect(ctx, x - 1, a.top - 1, 8, a.bottom - a.top + 2, P.ink);
      rect(ctx, x, a.top, 6, a.bottom - a.top, "#5b6275");
      rect(ctx, x, a.top, 2, a.bottom - a.top, "#7d859b");
      rect(ctx, x + 1, a.bottom - 4, 4, 2, P.ink);
    }
    rect(ctx, a.x0 - 1, a.top - 1, a.x1 - a.x0 + 2, 7, P.ink);
    rect(ctx, a.x0, a.top, a.x1 - a.x0, 5, "#6b7388");
    rect(ctx, a.x0, a.top, a.x1 - a.x0, 1, "#9aa3ba");

    // Left: the X-ray belt that every file goes through.
    if (s.left.x1 - s.left.x0 >= 50) {
      const x0 = s.left.x0 + 4;
      const x1 = s.left.x1 - 2;
      const y = f.y + 66;
      shadow(ctx, x0, y + 12, x1 - x0, 3);
      rect(ctx, x0 - 1, y - 1, x1 - x0 + 2, 13, P.ink);
      rect(ctx, x0, y, x1 - x0, 11, "#3a3f4f");
      rect(ctx, x0, y + 2, x1 - x0, 6, "#16181e");
      const mid = Math.round((x0 + x1) / 2);
      block(ctx, mid - 12, y - 10, 24, 6, 16, { top: "#c9ccd6", front: "#8f94a3" });
      for (let i = 0; i < 5; i++) rect(ctx, mid - 10 + i * 4, y + 2, 2, 10, "rgba(20,20,26,0.8)");
      screen(ctx, mid - 7, y - 8, 14, 4, "#10202a");
      rect(ctx, x0 + 3, y + 3, 7, 4, "#5b7fa8");
      rect(ctx, x1 - 11, y + 3, 7, 4, "#5b7fa8");
    }

    // Right: the quarantine cage.
    const c = cage(s);
    shadow(ctx, c.x, c.y + c.h, c.w, 3);
    rect(ctx, c.x, c.y, c.w, c.h, "#2a1418");
    hazard(ctx, c.x, c.y + c.h - 3, c.w, 3);
    for (let x = c.x; x < c.x + c.w; x += 4) rect(ctx, x, c.y, 1, c.h, "#8a8f9e");
    rect(ctx, c.x, c.y, c.w, 2, "#a3a8b8");
    rect(ctx, c.x, c.y + c.h - 1, c.w, 1, "#5d6170");
    rect(ctx, c.x - 1, c.y, 1, c.h, P.ink);
    rect(ctx, c.x + c.w, c.y, 1, c.h, P.ink);
    const label = "QUARANTINE";
    if (textWidth(label) + 4 <= c.w) {
      rect(ctx, c.x + (c.w - textWidth(label)) / 2 - 2, c.y - 9, textWidth(label) + 4, 9, P.ink);
      text(ctx, label, c.x + (c.w - textWidth(label)) / 2, c.y - 7, P.red);
    }
    glow(ctx, s.cx, f.y + 20, 40, 24, "#ff4d5e", 0.035);
  },

  animate(ctx, s, f) {
    const fl = s.floor;
    const blocked = f.state.tasks.filter((t) => t.state === "awaiting_approval" && t.flags.some((x) => x.level === "block")).length;
    const checked = f.state.tasks.filter((t) => t.draft).length;

    // Camera pictures with rolling scan lines.
    const { x0, cols } = cctv(s);
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < cols; i++) {
        const x = x0 + i * 13;
        const y = s.wall.y + 4 + j * 8;
        rect(ctx, x, y, 11, 6, (i + j) % 2 ? "#0f2a20" : "#14283a");
        rect(ctx, x + 2 + ((i * 3 + j) % 6), y + 2, 3, 3, "rgba(160,220,190,0.35)");
        rect(ctx, x, y + Math.floor((f.time * 5 + i + j * 3) % 6), 11, 1, "rgba(255,255,255,0.3)");
      }
    }

    // The arch's beams: red and flashing while anything waiting has a blocking finding.
    const a = arch(s);
    const beam = blocked ? (blink(f.time, 6) ? P.red : P.darkRed) : P.green;
    for (let k = 0; k < 4; k++) {
      const y = a.top + 8 + ((k * 6 + Math.floor(f.time * 10)) % 24);
      ctx.globalAlpha = 0.55;
      rect(ctx, a.x0 + 6, y, a.x1 - a.x0 - 12, 1, beam);
      ctx.globalAlpha = 1;
    }
    rect(ctx, a.x0 + 14, a.top + 1, a.x1 - a.x0 - 28, 2, beam);
    tag(ctx, blocked ? `BLOCKED ${blocked}` : `CHECKED ${checked}`, s.cx, fl.y + 44, blocked ? P.red : P.green);

    // One red file in the cage for every blocked draft, and a beacon while there are any.
    const c = cage(s);
    const shown = Math.min(blocked, Math.floor((c.w - 6) / 8) * 2);
    for (let i = 0; i < shown; i++) {
      const x = c.x + 4 + (i % Math.floor((c.w - 6) / 8)) * 8;
      const y = c.y + c.h - 14 - Math.floor(i / Math.floor((c.w - 6) / 8)) * 10;
      rect(ctx, x, y, 6, 8, P.paper);
      rect(ctx, x, y, 6, 2, P.red);
      rect(ctx, x + 1, y + 4, 4, 1, P.grey);
    }
    const on = blocked > 0 && blink(f.time, 8);
    rect(ctx, c.x + c.w - 6, c.y - 6, 4, 4, on ? P.red : "#4a1c22");
    if (on) rect(ctx, c.x + c.w - 9, c.y - 5, 10, 2, "rgba(255,77,94,0.35)");

    // The guard's screens.
    const guard = s.rl.stations[0];
    if (guard) {
      for (const dx of [-15, -2]) rect(ctx, guard.x + dx + 1, fl.y + 6 + Math.floor((f.time * 3) % 5), 9, 1, "rgba(120,255,180,0.5)");
    }
  },
};
