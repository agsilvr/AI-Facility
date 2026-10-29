import { P, rect, text, textWidth } from "../pixels";
import { blink, block, deskScreen, ellipse, glow, plant, screen, shadow, type RoomArt, type Spaces } from "./kit";

// Comms, where customer messages are answered. Sound-proofed foam walls with
// an ON AIR sign that lights while someone's replying, a world map of
// messages, a radio desk with a microphone, a mail-sorting desk with
// pigeonholes, humming server racks, and a mail cart holding one envelope for
// every message being handled.

const FOAM_A = "#2a2440";
const FOAM_B = "#352d52";

function worldMap(s: Spaces) {
  const x0 = s.doorInWall ? s.cx + 24 : s.wall.x + s.wall.w - 72;
  const w = Math.min(60, s.wall.x + s.wall.w - 6 - x0);
  return { x: x0, y: s.wall.y + 4, w, h: 14 };
}

function onAir(s: Spaces) {
  const label = "ON AIR";
  const x = s.wall.x + 46;
  const fits = !s.doorInWall || x + textWidth(label) + 6 < s.cx - 22;
  return { label, x, y: s.wall.y + 7, fits };
}

function cart(s: Spaces) {
  return { x: s.right.x1 - 40, y: s.floor.y + 66, w: 34 };
}

export const comms: RoomArt = {
  icon: ["0001000", "0101010", "1001001", "0001000", "0001000", "0011100", "0111110"],

  floor(ctx, s) {
    const f = s.floor;
    // Carpet tiles with a small pattern.
    for (let y = 0; y < f.h; y += 12) {
      for (let x = 0; x < f.w; x += 12) {
        rect(ctx, f.x + x, f.y + y, Math.min(12, f.w - x), Math.min(12, f.h - y), ((x + y) / 12) % 2 ? "#17363a" : "#1b3d41");
        if (x + 6 < f.w && y + 6 < f.h) rect(ctx, f.x + x + 5, f.y + y + 5, 2, 2, "#22494e");
      }
    }
    // A cable tray across the floor, from the servers to the desks.
    const y = f.y + 48;
    rect(ctx, f.x + 4, y, f.w - 8, 4, "#10262a");
    for (const [i, c] of [P.red, P.yellow, P.blue].entries()) rect(ctx, f.x + 4, y + 1 + i, f.w - 8, 1, c);
    rect(ctx, f.x + 4, y, f.w - 8, 1, "rgba(0,0,0,0.4)");
  },

  wall(ctx, s) {
    const w = s.wall;
    // Egg-crate acoustic foam.
    for (let y = w.y + 3; y < w.y + w.h - 2; y += 3) {
      for (let x = w.x; x < w.x + w.w; x += 3) rect(ctx, x, y, 3, 3, ((x - w.x) / 3 + (y - w.y) / 3) % 2 ? FOAM_A : FOAM_B);
    }
    const m = worldMap(s);
    if (m.w > 20) {
      screen(ctx, m.x, m.y, m.w, m.h, "#0b1f2a");
      // Continents, roughly.
      for (const [dx, dy, cw, ch] of [[0.1, 3, 0.18, 5], [0.18, 8, 0.1, 5], [0.42, 2, 0.14, 4], [0.45, 6, 0.1, 6], [0.62, 2, 0.26, 6], [0.8, 10, 0.1, 3]]) {
        rect(ctx, m.x + Math.round(m.w * dx), m.y + dy, Math.max(2, Math.round(m.w * cw)), ch, "#1f5a4a");
      }
    }
    const air = onAir(s);
    if (air.fits) {
      rect(ctx, air.x - 1, air.y - 1, textWidth(air.label) + 8, 9, P.ink);
      rect(ctx, air.x, air.y, textWidth(air.label) + 6, 7, "#3a1016");
    }
  },

  furnish(ctx, s) {
    const f = s.floor;
    const [radio, mail] = s.rl.stations;
    // The radio desk: a mixing board, a microphone on an arm, headphones.
    if (radio) {
      block(ctx, radio.x - 18, f.y + 13, 36, 8, 6, { top: "#3a3550", front: "#221f33" });
      rect(ctx, radio.x - 15, f.y + 14, 16, 5, "#1a1726");
      for (let i = 0; i < 5; i++) {
        rect(ctx, radio.x - 14 + i * 3, f.y + 15, 1, 3, P.steel1);
        rect(ctx, radio.x - 14 + i * 3, f.y + 15 + (i % 3), 1, 1, P.white);
      }
      rect(ctx, radio.x + 6, f.y + 6, 1, 9, P.steel2);
      rect(ctx, radio.x + 6, f.y + 6, 6, 1, P.steel2);
      rect(ctx, radio.x + 10, f.y + 5, 4, 5, P.ink);
      rect(ctx, radio.x + 11, f.y + 6, 2, 3, P.steel1);
      rect(ctx, radio.x + 3, f.y + 14, 5, 2, P.ink);
      deskScreen(ctx, radio.x - 16, f.y + 5, 10, 6, "#10202a");
    }
    // The mail desk, with the pigeonholes standing behind it.
    if (mail) {
      block(ctx, mail.x - 17, f.y + 2, 34, 3, 9, { top: "#8a5a3b", front: "#55351f" });
      for (let i = 0; i < 6; i++) rect(ctx, mail.x - 15 + i * 5 + 1, f.y + 6, 4, 4, "#2d1b0e");
      block(ctx, mail.x - 15, f.y + 15, 30, 6, 5, { top: "#3a3550", front: "#221f33" });
      for (let i = 0; i < 3; i++) rect(ctx, mail.x - 12 + i * 8, f.y + 16, 6, 4, P.paper);
    }
    // Left of the walkway: server racks.
    for (let i = 0; i < 2; i++) {
      const x = s.left.x0 + 2 + i * 16;
      if (x + 14 > s.left.x1) break;
      block(ctx, x, f.y + 58, 14, 4, 28, { top: "#3a3550", front: "#14121c" });
      for (let r = 0; r < 6; r++) rect(ctx, x + 2, f.y + 64 + r * 4, 10, 1, "#24203a");
    }
    // Right of the walkway: the mail cart.
    const c = cart(s);
    shadow(ctx, c.x, c.y + 18, c.w, 3);
    rect(ctx, c.x - 1, c.y - 1, c.w + 2, 16, P.ink);
    rect(ctx, c.x, c.y, c.w, 14, "#5b6a8a");
    rect(ctx, c.x + 2, c.y + 2, c.w - 4, 9, "#2b3550");
    rect(ctx, c.x, c.y, c.w, 1, "#8a99bb");
    for (const x of [c.x + 3, c.x + c.w - 6]) {
      ellipse(ctx, x + 1, c.y + 16, 2, 2, P.ink);
    }
    plant(ctx, s.right.x0 + 4, f.y + 72);
    // In the middle, a dish aerial pointed up the shaft to the surface.
    const dy = f.y + 76;
    shadow(ctx, s.cx - 14, dy + 12, 28, 3);
    rect(ctx, s.cx - 3, dy + 4, 6, 9, P.steel0);
    ellipse(ctx, s.cx, dy, 16, 8, P.ink);
    ellipse(ctx, s.cx, dy, 15, 7, "#c9ced8");
    ellipse(ctx, s.cx, dy, 11, 5, "#a7adba");
    ellipse(ctx, s.cx, dy, 6, 3, "#c9ced8");
    rect(ctx, s.cx - 1, dy - 8, 2, 8, P.steel1);
    rect(ctx, s.cx - 2, dy - 10, 4, 3, P.red);
    glow(ctx, s.cx, f.y + 30, 60, 26, "#a167ff", 0.045);
  },

  animate(ctx, s, f) {
    const fl = s.floor;
    const working = f.working > 0;
    // ON AIR lights up while a reply is being written.
    const air = onAir(s);
    if (air.fits) text(ctx, air.label, air.x + 3, air.y + 1, working ? P.red : "#5a2028");
    // A dot on the map for every message in progress, pulsing.
    const m = worldMap(s);
    if (m.w > 20) {
      for (let i = 0; i < Math.min(f.busy, 6); i++) {
        const x = m.x + 4 + ((i * 17) % (m.w - 8));
        const y = m.y + 3 + ((i * 5) % (m.h - 6));
        rect(ctx, x, y, 2, 2, blink(f.time, 4, i) ? P.yellow : P.orange);
      }
    }
    // Server lights.
    for (let i = 0; i < 2; i++) {
      const x = s.left.x0 + 2 + i * 16;
      if (x + 14 > s.left.x1) break;
      for (let r = 0; r < 6; r++) rect(ctx, x + 3 + (r % 3) * 3, fl.y + 63 + r * 4, 1, 1, blink(f.time, 3 + r, r + i * 5) ? P.green : "#173a26");
    }
    // One envelope in the cart for every message being handled.
    const c = cart(s);
    for (let i = 0; i < Math.min(f.busy, 6); i++) {
      const x = c.x + 3 + (i % 3) * 10;
      const y = c.y + 2 + Math.floor(i / 3) * 4;
      rect(ctx, x, y, 8, 5, P.white);
      rect(ctx, x + 1, y + 1, 3, 1, P.grey);
      rect(ctx, x + 4, y + 2, 3, 1, P.grey);
    }
    // Sound waves from the microphone while a reply is in progress.
    const radio = s.rl.stations[0];
    if (radio && working) {
      const r = Math.floor((f.time * 10) % 6);
      rect(ctx, radio.x + 15 + r, fl.y + 4 - Math.floor(r / 2), 1, 4 + r, `rgba(255,159,28,${1 - r / 6})`);
    }
  },
};
