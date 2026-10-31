import { P, rect, text, textWidth } from "../pixels";
import { commandScreen } from "../status";
import { blink, block, chair, deskScreen, ellipse, glow, hazard, plant, screen, shadow, tiles, type RoomArt, type Spaces } from "./kit";

// The Command Center: the heart of the facility and the biggest room. A
// raised bridge of consoles under a wall-wide screen that shows what needs the
// owner, how each crew member is getting on and each wing's budget, with a
// carpet from the door up to the Warden's chair, a briefing table on one side
// and a hologram map of the facility on the other.

const NAVY = "#9e8764";
const NAVY2 = "#a88e68";
const BRIDGE = "#847758";
const RUNNER = "#74886a";

/** The wall screen, centred over the bridge. */
function mainScreen(s: Spaces) {
  const w = Math.min(244, s.wall.w - 180);
  return { x: Math.round(s.cx - w / 2), y: s.wall.y + 4, w, h: 17 };
}

const bridgeTop = (s: Spaces) => s.floor.y + 4;
const bridgeBottom = (s: Spaces) => s.floor.y + 50;

/** The pause lever's panel, at the right end of the wall. */
const leverPanel = (s: Spaces) => ({ x: s.wall.x + s.wall.w - 26 });

/** Wall space between the screen and the lever, for the crew board. */
function crewBoard(s: Spaces) {
  const sc = mainScreen(s);
  const x = sc.x + sc.w + 12;
  return { x, w: Math.min(90, leverPanel(s).x - 8 - x) };
}

export const command: RoomArt = {
  icon: ["0001000", "0011100", "1111111", "0111110", "0011100", "0110110", "0100010"],

  floor(ctx, s) {
    const f = s.floor;
    tiles(ctx, f, 16, NAVY, NAVY2, "rgba(0,0,0,0.25)");
    for (let x = f.x + 32; x < f.x + f.w; x += 32) rect(ctx, x, f.y, 1, f.h, "rgba(56,189,248,0.08)");
    // The seal of the facility, set in the floor in front of the bridge.
    const ey = f.y + 92;
    ellipse(ctx, s.cx, ey, 54, 24, "#8d9c77");
    ellipse(ctx, s.cx, ey, 51, 22, "#667c5c");
    ellipse(ctx, s.cx, ey, 40, 17, "#87966f");
    ellipse(ctx, s.cx, ey, 38, 16, "#748463");
    for (const dx of [-46, 46]) rect(ctx, s.cx + dx - 2, ey - 1, 4, 3, s.accent);
    // The raised bridge along the back, its front edge lit.
    const top = bridgeTop(s);
    const bottom = bridgeBottom(s);
    rect(ctx, f.x + 6, top, f.w - 12, bottom - top, BRIDGE);
    for (let x = f.x + 6; x < f.x + f.w - 6; x += 16) rect(ctx, x, top, 1, bottom - top, "rgba(0,0,0,0.2)");
    rect(ctx, f.x + 6, bottom, f.w - 12, 2, s.accent);
    rect(ctx, f.x + 6, bottom + 2, f.w - 12, 3, "#0d1428");
    // The carpet from the door up to the Warden's console, with chevrons pointing the way.
    const rx = s.cx - 12;
    rect(ctx, rx, bottom - 6, 24, f.y + f.h - bottom + 6, RUNNER);
    rect(ctx, rx, bottom - 6, 1, f.y + f.h - bottom + 6, "#4f8fd8");
    rect(ctx, rx + 23, bottom - 6, 1, f.y + f.h - bottom + 6, "#4f8fd8");
    for (let y = bottom + 8; y < f.y + f.h - 8; y += 12) {
      for (let i = 0; i < 5; i++) {
        rect(ctx, s.cx - 1 - i, y + i, 2, 1, "#2f5596");
        rect(ctx, s.cx - 1 + i, y + i, 2, 1, "#2f5596");
      }
    }
  },

  wall(ctx, s) {
    const w = s.wall;
    rect(ctx, w.x, w.y, w.w, w.h, "#8a8e72");
    for (let x = w.x + 16; x < w.x + w.w; x += 32) rect(ctx, x, w.y + 3, 1, w.h - 5, "#74795e");
    for (let x = w.x + 8; x < w.x + w.w; x += 32) rect(ctx, x, w.y + 19, 2, 1, "#aaa482");
    // The big screen's bezel; what's on it is drawn live.
    const sc = mainScreen(s);
    rect(ctx, sc.x - 4, sc.y - 2, sc.w + 8, sc.h + 4, "#0a0e1c");
    rect(ctx, sc.x - 4, sc.y - 2, sc.w + 8, 1, "#33416b");
    screen(ctx, sc.x, sc.y, sc.w, sc.h);
    // Corner brackets in the core's colour.
    for (const x of [sc.x - 4, sc.x + sc.w]) {
      for (const y of [sc.y - 2, sc.y + sc.h + 1]) {
        rect(ctx, x, y, 4, 1, s.accent);
        rect(ctx, x + (x < sc.x ? 0 : 3), Math.min(y, y - 2), 1, 3, s.accent);
      }
    }
    // A banner for every wing of the facility, in a row left of the screen.
    s.wings.forEach((wing, i) => {
      const x = sc.x - 12 - (s.wings.length - i) * 13;
      const color = wing.sealed ? P.stone1 : wing.color;
      rect(ctx, x - 1, w.y + 3, 10, 17, P.ink);
      rect(ctx, x, w.y + 3, 8, 15, color);
      rect(ctx, x, w.y + 3, 8, 1, "rgba(255,255,255,0.4)");
      rect(ctx, x + 3, w.y + 17, 2, 2, P.ink);
      rect(ctx, x, w.y + 18, 3, 1, color);
      rect(ctx, x + 5, w.y + 18, 3, 1, color);
      text(ctx, wing.name[0] ?? "?", x + 2, w.y + 7, P.ink);
    });
    // The crew board (lit live) and the pause lever's panel.
    const board = crewBoard(s);
    if (board.w > 20) rect(ctx, board.x - 1, w.y + 4, board.w + 2, 15, "#0a0e1c");
    const lever = leverPanel(s);
    rect(ctx, lever.x - 1, w.y + 3, 22, 17, P.ink);
    rect(ctx, lever.x, w.y + 4, 20, 15, "#3a2a2e");
    hazard(ctx, lever.x, w.y + 4, 20, 2);
  },

  furnish(ctx, s) {
    const f = s.floor;
    // Consoles at every workstation; the Warden's in the middle is the biggest.
    s.rl.stations.forEach((st, i) => {
      const w = i === 0 ? 50 : 30;
      const x = st.x - w / 2;
      block(ctx, x, f.y + 12, w, 8, 6, { top: "#b09a75", front: "#7a6b50", edge: "#c4ae80" });
      const screens = i === 0 ? 3 : 2;
      const sw = i === 0 ? 13 : 11;
      for (let k = 0; k < screens; k++) deskScreen(ctx, x + 3 + k * (sw + 3), f.y + 4, sw, 7, "#081a2c");
    });
    // Server towers in the back corners.
    for (const x of [f.x + 10, f.x + f.w - 24]) {
      block(ctx, x, f.y + 4, 14, 5, 34, { top: "#2a3150", front: "#151a2c" });
    }

    // A railing along the front of the bridge, open where the carpet climbs up its steps.
    const rail = bridgeBottom(s) - 3;
    for (let x = f.x + 8; x < f.x + f.w - 8; x += 1) {
      if (Math.abs(x - s.cx) < 14) continue;
      rect(ctx, x, rail, 1, 1, "#7d8fc0");
      if ((x - f.x) % 12 === 0) rect(ctx, x, rail, 2, 5, "#c4ae80");
    }
    for (let i = 0; i < 3; i++) rect(ctx, s.cx - 12, bridgeBottom(s) - 4 + i * 3, 24, 1, "#2f5596");

    // Left: the briefing table, where the daily briefing is put together, on a rug.
    const lx = Math.round((s.left.x0 + s.left.x1) / 2);
    const ty = f.y + 82;
    rect(ctx, lx - 52, ty - 18, 104, 44, "#8b9672");
    rect(ctx, lx - 50, ty - 16, 100, 40, "#a8b18a");
    rect(ctx, lx - 50, ty - 16, 100, 1, "#c8d0a6");
    rect(ctx, lx - 50, ty + 23, 100, 1, "#c8d0a6");
    for (let i = 0; i < 4; i++) chair(ctx, lx - 33 + i * 22, ty - 12, "#84956c");
    shadow(ctx, lx - 42, ty + 16, 84, 3);
    ellipse(ctx, lx, ty + 6, 44, 11, P.ink);
    ellipse(ctx, lx, ty + 6, 43, 10, "#3b2a1f");
    ellipse(ctx, lx, ty + 5, 42, 9, "#6b4a2f");
    ellipse(ctx, lx, ty + 4, 40, 7, "#7d5837");
    for (let i = 0; i < 4; i++) {
      rect(ctx, lx - 30 + i * 18, ty + 1, 7, 5, P.paper);
      rect(ctx, lx - 29 + i * 18, ty + 2, 4, 1, P.grey);
    }
    for (let i = 0; i < 4; i++) chair(ctx, lx - 33 + i * 22, ty + 16, "#84956c");

    // Right: the hologram table. The map of the facility over it is drawn live.
    const hx = Math.round((s.right.x0 + s.right.x1) / 2);
    const hy = f.y + 96;
    shadow(ctx, hx - 26, hy + 9, 52, 3);
    ellipse(ctx, hx, hy, 28, 10, P.ink);
    ellipse(ctx, hx, hy, 27, 9, "#2b3556");
    ellipse(ctx, hx, hy - 1, 24, 7, "#0b2a44");
    ellipse(ctx, hx, hy - 1, 20, 5, "#0f3a5c");
    for (const dx of [-30, 30]) plant(ctx, hx + dx - 4, hy - 30);

    // A coffee station in the front left corner, a water cooler in the front right.
    block(ctx, f.x + 8, f.y + f.h - 24, 22, 6, 10, { top: "#6b4a2f", front: "#3d2a1a" });
    rect(ctx, f.x + 11, f.y + f.h - 30, 7, 8, P.ink);
    rect(ctx, f.x + 12, f.y + f.h - 29, 5, 6, P.steel1);
    for (const dx of [21, 25]) rect(ctx, f.x + dx, f.y + f.h - 23, 3, 3, P.white);
    const wx = f.x + f.w - 18;
    block(ctx, wx, f.y + f.h - 20, 10, 4, 10, { top: "#d9d4c5", front: "#a49f90" });
    rect(ctx, wx + 1, f.y + f.h - 30, 8, 10, "#7fd1ff");
    rect(ctx, wx + 2, f.y + f.h - 29, 2, 8, "rgba(255,255,255,0.5)");
    plant(ctx, f.x + 36, f.y + f.h - 18);
    plant(ctx, f.x + f.w - 32, f.y + f.h - 18);
    glow(ctx, s.cx, f.y + 10, 150, 28, "#38bdf8", 0.05);
    glow(ctx, hx, hy - 8, 34, 18, "#38bdf8", 0.06);
  },

  animate(ctx, s, f) {
    const fl = s.floor;
    const sc = mainScreen(s);
    rect(ctx, sc.x, sc.y, sc.w, sc.h, P.screen);
    // Left of the screen: what's waiting for the owner.
    const third = Math.floor(sc.w / 3);
    const status = commandScreen(f.state);
    const color = status.tone === "blocked" ? P.red : ["review", "paused", "waiting"].includes(status.tone) ? P.yellow : P.green;
    text(ctx, status.headline, sc.x + 4, sc.y + 2, color);
    text(ctx, status.detail, sc.x + 4, sc.y + 10, P.white);
    rect(ctx, sc.x + third, sc.y + 2, 1, sc.h - 4, "#1c3550");
    // Middle: each crew member's colour and how far through their task they are.
    const crew = f.state.agents;
    const cols = 3;
    const cw = Math.floor((third - 6) / cols);
    crew.slice(0, 6).forEach((agent, i) => {
      const task = agent.taskId ? f.state.tasks.find((t) => t.id === agent.taskId) : undefined;
      const x = sc.x + third + 4 + (i % cols) * cw;
      const y = sc.y + 3 + Math.floor(i / cols) * 7;
      rect(ctx, x, y, 3, 4, agent.sprite.suit);
      rect(ctx, x + 5, y + 1, cw - 9, 2, "#1c2a40");
      const progress = agent.status === "working" ? (task?.progress ?? 0) : 0;
      rect(ctx, x + 5, y + 1, Math.round((cw - 9) * progress), 2, agent.status === "paused" ? P.yellow : P.green);
    });
    rect(ctx, sc.x + third * 2, sc.y + 2, 1, sc.h - 4, "#1c3550");
    // Right: each open wing's spend this month against its budget.
    const open = f.state.wings.filter((w) => !w.sealed);
    const bx = sc.x + third * 2 + 4;
    const bw = sc.w - third * 2 - 8;
    open.slice(0, 2).forEach((wing, i) => {
      const y = sc.y + 3 + i * 7;
      const spend = f.state.spend[wing.id] ?? 0;
      const share = wing.budgetMonthly > 0 ? Math.min(1, spend / wing.budgetMonthly) : 1;
      text(ctx, wing.name[0] ?? "?", bx, y - 1, wing.color);
      rect(ctx, bx + 5, y + 1, bw - 5, 2, "#1c2a40");
      rect(ctx, bx + 5, y + 1, Math.max(1, Math.round((bw - 5) * share)), 2, share > 0.8 ? P.red : wing.color);
    });
    // A slow scan line, so the screen reads as a screen.
    rect(ctx, sc.x, sc.y + Math.floor((f.time * 8) % sc.h), sc.w, 1, "rgba(120,200,255,0.08)");

    // Console screens show each station's crew at work, and a quiet glow otherwise.
    s.rl.stations.forEach((st, i) => {
      const w = i === 0 ? 50 : 30;
      const x = st.x - w / 2;
      const screens = i === 0 ? 3 : 2;
      const sw = i === 0 ? 13 : 11;
      for (let k = 0; k < screens; k++) {
        const sx = x + 3 + k * (sw + 3);
        for (let r = 0; r < 3; r++) {
          const len = 2 + Math.floor(((f.time * (f.working ? 3 : 0.4) + r * 2 + k + i) % (sw - 3)));
          rect(ctx, sx + 1, fl.y + 5 + r * 2, len, 1, r === 0 ? s.accent : "#2b7a9c");
        }
      }
    });
    // The crew board: a light for each crew member, green at work, yellow when paused.
    const board = crewBoard(s);
    if (board.w > 20) {
      const per = Math.max(1, Math.floor(board.w / 8));
      f.state.agents.forEach((agent, i) => {
        if (i >= per * 2) return;
        const x = board.x + (i % per) * 8;
        const y = s.wall.y + 6 + Math.floor(i / per) * 6;
        rect(ctx, x, y, 3, 3, agent.sprite.suit);
        const lamp = agent.status === "working" ? P.green : agent.status === "paused" ? P.yellow : "#2b3350";
        rect(ctx, x + 4, y + 1, 2, 2, lamp);
      });
    }
    // The pause lever: down when every crew member is paused.
    const lever = leverPanel(s);
    const all = f.state.agents.length > 0 && f.state.agents.every((a) => a.status === "paused");
    rect(ctx, lever.x + 9, s.wall.y + 8, 2, 9, P.ink);
    rect(ctx, lever.x + 7, all ? s.wall.y + 14 : s.wall.y + 7, 6, 3, P.red);
    rect(ctx, lever.x + 3, s.wall.y + 9, 2, 2, all ? P.yellow : P.green);
    // Server tower lights.
    for (const [n, x] of [[0, fl.x + 10], [1, fl.x + fl.w - 24]]) {
      for (let r = 0; r < 6; r++) rect(ctx, x + 3 + (r % 2) * 6, fl.y + 12 + r * 4, 2, 1, blink(f.time, 2 + r, r * 3 + n) ? P.green : "#12402a");
    }
    // The hologram: the facility's wings floating over the table, turning slowly.
    const hx = Math.round((s.right.x0 + s.right.x1) / 2);
    const hy = fl.y + 80;
    const wings = f.state.wings;
    const turn = Math.cos(f.time * 0.9);
    wings.forEach((wing, i) => {
      const off = (i - (wings.length - 1) / 2) * 12;
      const x = Math.round(hx + off * turn);
      const h = wing.sealed ? 4 : 8 + i * 2;
      ctx.globalAlpha = 0.75;
      rect(ctx, x - 4, hy - h, 8, h, wing.sealed ? "#4b5563" : wing.color);
      rect(ctx, x - 4, hy - h, 8, 1, P.white);
      ctx.globalAlpha = 1;
    });
    rect(ctx, hx - 20, hy + 2 + Math.floor((f.time * 6) % 8) - 4, 40, 1, "rgba(120,220,255,0.35)");
    for (let i = 0; i < 3; i++) rect(ctx, hx - 16 + i * 16, hy + 6, 1, 6, "rgba(120,220,255,0.25)");
    const label = "FACILITY";
    text(ctx, label, hx - textWidth(label) / 2, hy - 26, "rgba(160,230,255,0.8)");
  },
};
