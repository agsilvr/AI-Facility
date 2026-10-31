import { completedCount } from "../core/ledger";
import type { Agent, FacilityState } from "../core/types";
import { contains, HALL_H, MARGIN, TILE, type FacilityLayout, type Rect } from "./layout";
import type { Walker } from "./movement";
import { crewSprite, frame, hash, P, rect, SPRITE_H, SPRITE_W, tag, text, textWidth } from "./pixels";
import { animateRoom, paintRoom } from "./rooms";
import { glow, hazard, plant } from "./rooms/kit";
import { pendingApprovals, roomNeedsAttention, roomSignal, tasksInRoom, type Selection } from "./status";
import { operationForAgent } from "../core/operations";

export type { Selection };

// Draws the facility: an underground station in packed dirt and rock, seen
// from above in pixel art. The parts that never change are painted once into
// a background picture; each frame adds what moves, all from the ledger.
// Coordinates are world pixels; the view scales them up with smoothing off.

export interface Scene {
  state: FacilityState;
  layout: FacilityLayout;
  walkers: Map<string, Walker>;
  selection: Selection | null;
  hovered: Selection | null;
  time: number;
  running?: boolean;
  connected?: boolean;
}

const WING_FALLBACK = "#94a3b8";

function wingColor(state: FacilityState, wingId: string) {
  const wing = state.wings.find((w) => w.id === wingId);
  return wing?.sealed ? P.stone2 : (wing?.color ?? WING_FALLBACK);
}

// ---------------------------------------------------------------------------
// The background, painted once.

export function paintBackground(layout: FacilityLayout, state: FacilityState): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d")!;
  paintEarth(ctx, layout);
  paintHull(ctx, layout);
  paintHall(ctx, layout, state);
  for (const room of state.rooms) {
    const rl = layout.rooms.get(room.id);
    if (rl) paintRoom(ctx, room, rl, wingColor(state, room.wingId), state.wings);
  }
  return canvas;
}

// The dirt is one square tile repeated forever, so the ground around the
// facility and the ground the facility is dug into are the same ground.
const EARTH_TILE = 256;
let earthTileCanvas: HTMLCanvasElement | null = null;

/** Packed dirt in wavy layers, with grain and pebbles. Seamless on every edge. */
function earthTile(): HTMLCanvasElement {
  if (earthTileCanvas) return earthTileCanvas;
  const canvas = document.createElement("canvas");
  canvas.width = EARTH_TILE;
  canvas.height = EARTH_TILE;
  const ctx = canvas.getContext("2d")!;
  const bands = [P.dirt1, P.dirt2, P.dirt1, P.dirt0];
  const bandH = EARTH_TILE / bands.length;
  for (let x = 0; x < EARTH_TILE; x += 4) {
    // The wobble repeats exactly once across the tile, so the edges meet.
    const wobble = Math.round(Math.sin((x / EARTH_TILE) * Math.PI * 2) * 6 + Math.sin((x / EARTH_TILE) * Math.PI * 6) * 3);
    for (let y = 0; y < EARTH_TILE; y += 4) {
      const band = Math.floor((((y + wobble) % EARTH_TILE) + EARTH_TILE) % EARTH_TILE / bandH);
      rect(ctx, x, y, 4, 4, bands[band]);
    }
  }
  // Speckle, so the dirt has grain.
  for (let i = 0; i < (EARTH_TILE * EARTH_TILE) / 60; i++) {
    const r = hash(i * 3.1);
    rect(ctx, Math.floor(hash(i) * EARTH_TILE), Math.floor(hash(i + 0.5) * EARTH_TILE), 1, 1, r > 0.66 ? P.dirt3 : r > 0.33 ? P.dirt0 : P.clay);
  }
  // Pebbles, kept off the edges so none is cut in half.
  for (let i = 0; i < (EARTH_TILE * EARTH_TILE) / 900; i++) {
    const x = Math.floor(hash(i + 7.7) * (EARTH_TILE - 2));
    const y = Math.floor(hash(i + 3.3) * (EARTH_TILE - 3));
    rect(ctx, x, y, 2, 2, P.pebble);
    rect(ctx, x, y + 2, 2, 1, P.dirt0);
  }
  earthTileCanvas = canvas;
  return canvas;
}

/** The dirt as a fill, lined up with world position (0, 0). */
export function earthPattern(ctx: CanvasRenderingContext2D) {
  return ctx.createPattern(earthTile(), "repeat")!;
}

/** The ground the facility is dug into: dirt, then stones, the odd glowing crystal and a fossil or two. */
function paintEarth(ctx: CanvasRenderingContext2D, layout: FacilityLayout) {
  const { width, height } = layout;
  ctx.fillStyle = earthPattern(ctx);
  ctx.fillRect(0, 0, width, height);
  // Stones: chunky lumps with a lit top and a shadow.
  for (let i = 0; i < (width * height) / 9000; i++) {
    const x = Math.floor(hash(i + 11.1) * width);
    const y = Math.floor(hash(i + 22.2) * height);
    const w = 6 + Math.floor(hash(i + 33.3) * 10);
    const h = 4 + Math.floor(hash(i + 44.4) * 6);
    rect(ctx, x + 1, y, w - 2, h, P.stone1);
    rect(ctx, x, y + 1, w, h - 2, P.stone1);
    rect(ctx, x + 1, y, w - 3, 1, P.stone2);
    rect(ctx, x + 1, y + h, w - 2, 1, P.dirt0);
    rect(ctx, x + 2, y + h - 2, w - 4, 1, P.stone0);
  }
  // Crystals.
  for (let i = 0; i < (width * height) / 30000; i++) {
    const x = Math.floor(hash(i + 55.5) * width);
    const y = Math.floor(hash(i + 66.6) * height);
    const c = hash(i + 77.7) > 0.5 ? P.blue : P.purple;
    rect(ctx, x + 1, y, 1, 4, c);
    rect(ctx, x, y + 1, 3, 2, c);
    rect(ctx, x + 1, y + 1, 1, 1, P.white);
  }
  // A couple of fossils in the top and bottom layers.
  for (const [i, y] of [[0, MARGIN / 2 - 6], [1, height - MARGIN / 2]]) {
    const x = Math.floor(hash(i + 88.8) * (width - 40)) + 20;
    for (let k = 0; k < 5; k++) rect(ctx, x + k * 3, y + (k % 2), 2, 4 - (k % 2), P.paper);
    rect(ctx, x - 3, y + 1, 3, 2, P.paper);
  }
}

/** Each district's block of rooms, from its tallest room's top to its deepest room's bottom. */
function districtBlocks(layout: FacilityLayout): (Rect & { wingId: string })[] {
  return layout.wings.map((wing) => {
    const own = [...layout.rooms.values()].filter((r) => r.wingId === wing.wingId);
    const top = Math.min(layout.hall.y, ...own.map((r) => r.rect.y));
    const bottom = Math.max(layout.hall.y + layout.hall.h, ...own.map((r) => r.rect.y + r.rect.h));
    return { wingId: wing.wingId, x: wing.x0 - 6, y: top - 6, w: wing.x1 - wing.x0 + 12, h: bottom - top + 12 };
  });
}

/**
 * The station's outer hull: a metal shell around each district and the hall,
 * so the core, with the tall Command Center, stands out in the middle. Vent
 * pipes run up through the dirt towards the surface.
 */
function paintHull(ctx: CanvasRenderingContext2D, layout: FacilityLayout) {
  if (layout.corridors) {
    for (const c of layout.corridors) { rect(ctx, c.x - 4, c.y - 4, c.w + 8, c.h + 8, P.ink); rect(ctx, c.x - 2, c.y - 2, c.w + 4, c.h + 4, "#827253"); }
    for (const r of layout.rooms.values()) {
      rect(ctx, r.rect.x - 5, r.rect.y - 5, r.rect.w + 10, r.rect.h + 10, "#403c2b");
      rect(ctx, r.rect.x - 3, r.rect.y - 3, r.rect.w + 6, r.rect.h + 6, "#9b855d");
      // Ivy, warm timber beams and potted plants give the station a lived-in edge.
      for (let x = r.rect.x + 12; x < r.rect.x + r.rect.w - 8; x += 34) {
        rect(ctx, x, r.rect.y - 5, 12, 3, "#738653"); rect(ctx, x + 4, r.rect.y - 8, 5, 4, "#84965f");
      }
      if (r.kind !== "sealed") plant(ctx, r.rect.x - 14, r.rect.y + r.rect.h - 20);
    }
    return;
  }
  const h = layout.hall;
  const shells = [...districtBlocks(layout), { wingId: "", x: h.x - 6, y: h.y - 6, w: h.w + 12, h: h.h + 12 }];
  for (const b of shells) rect(ctx, b.x - 2, b.y - 2, b.w + 4, b.h + 4, P.ink);
  for (const b of shells) {
    rect(ctx, b.x, b.y, b.w, b.h, P.hull1);
    rect(ctx, b.x, b.y, b.w, 1, P.steel1);
    for (let y = b.y + 8; y < b.y + b.h; y += 16) rect(ctx, b.x, y, b.w, 1, P.hull0);
    for (let x = b.x + 8; x < b.x + b.w; x += 32) {
      for (let y = b.y + 4; y < b.y + b.h; y += 16) rect(ctx, x + ((y >> 4) % 2) * 16, y, 1, 1, P.hull2);
    }
  }
  for (const b of districtBlocks(layout)) {
    for (const x of [b.x + 14, b.x + b.w - 20]) {
      rect(ctx, x - 1, 0, 8, b.y - 1, P.ink);
      rect(ctx, x, 0, 6, b.y - 1, P.steel0);
      rect(ctx, x + 1, 0, 1, b.y - 1, P.steel1);
      for (let y = b.y - 24; y > 0; y -= 40) rect(ctx, x - 2, y, 10, 3, P.steel1);
    }
  }
}

/** The main hall: metal floor plates, wall lamps, each district's name and signs pointing to Command. */
function paintHall(ctx: CanvasRenderingContext2D, layout: FacilityLayout, state: FacilityState) {
  if (layout.corridors) {
    for (const c of layout.corridors) {
      ctx.save(); ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();
      rect(ctx, c.x, c.y, c.w, c.h, "#b1a37d");
      for (let y = c.y; y < c.y + c.h; y += 9) {
        rect(ctx, c.x, y, c.w, 1, "#897e5d");
        for (let x = c.x + ((y / 9) % 2) * 14; x < c.x + c.w; x += 28) rect(ctx, x, y, 1, 9, "#9b8e69");
      }
      ctx.restore();
    }
    const route = [["etsy-lab", "01 RESEARCH"], ["etsy-studio", "02 DESIGN"], ["etsy-qc", "03 CHECK"], ["etsy-factory", "04 LISTING"], ["dock", "05 OUTBOX"]];
    for (const [id, label] of route) {
      const r = layout.rooms.get(id); if (!r) continue;
      const cx = r.door.outside.x;
      tag(ctx, label, cx, layout.laneY - 4, "#f3ebcf", "#687754");
      rect(ctx, cx - 17, layout.hall.y - 3, 7, 3, "#e8d6a3");
      glow(ctx, cx - 14, layout.hall.y + 4, 19, 12, "#ffe0a3", .04);
    }
    tag(ctx, "BRIDGE", 928, 281, "#ece5c5", "#667a51");
    tag(ctx, "TREASURY", 516, 288, "#eee2b3", "#81764f");
    tag(ctx, "SECURITY", 1320, 288, "#e2e8d0", "#667a59");
    return;
  }
  const h = layout.hall;
  for (let x = h.x; x < h.x + h.w; x += TILE) {
    for (let y = h.y; y < h.y + h.h; y += TILE) {
      const w = Math.min(TILE, h.x + h.w - x);
      rect(ctx, x, y, w, TILE, ((x - h.x + y - h.y) / TILE) % 2 ? "#363c52" : "#3b4259");
      rect(ctx, x, y, w, 1, "rgba(255,255,255,0.06)");
      rect(ctx, x, y, 1, TILE, "rgba(0,0,0,0.2)");
      rect(ctx, x + 2, y + 2, 1, 1, "#525a78");
      rect(ctx, x + w - 3, y + TILE - 3, 1, 1, "#262a3c");
    }
  }
  // The walking lane, a little brighter, with a guide line down the middle.
  rect(ctx, h.x, layout.laneY - 6, h.w, 14, "rgba(255,255,255,0.03)");
  for (let x = h.x + 4; x < h.x + h.w - 4; x += 12) rect(ctx, x, layout.laneY + 6, 6, 1, "rgba(255,255,255,0.12)");
  // Shadows under the hall's walls, and the end walls.
  rect(ctx, h.x, h.y, h.w, 3, "rgba(0,0,0,0.3)");
  rect(ctx, h.x - 6, h.y, 6, h.h, P.wall0);
  rect(ctx, h.x + h.w, h.y, 6, h.h, P.wall0);

  const core = layout.wings.find((w) => w.slot === 0);
  for (const wing of layout.wings) {
    const w = state.wings.find((x) => x.id === wing.wingId);
    const color = wingColor(state, wing.wingId);
    // Edge strips in the district's colour, and its name on the floor.
    rect(ctx, wing.x0, h.y + 3, wing.x1 - wing.x0, 1, color);
    rect(ctx, wing.x0, h.y + h.h - 2, wing.x1 - wing.x0, 1, color);
    const name = (w?.name ?? wing.wingId).toUpperCase();
    const nx = wing.slot < 0 ? wing.x0 + 6 : wing.x1 - textWidth(name) - 12;
    rect(ctx, nx, h.y + 7, textWidth(name) + 6, 9, P.ink);
    text(ctx, name, nx + 3, h.y + 9, color);
    // A sign pointing the way to Command, at the end of the district nearest the core.
    if (core && wing.slot !== 0) {
      const label = wing.slot > 0 ? "< COMMAND" : "COMMAND >";
      const sx = wing.slot > 0 ? wing.x0 + 6 : wing.x1 - textWidth(label) - 12;
      rect(ctx, sx, h.y + h.h - 15, textWidth(label) + 6, 9, "#0f1220");
      text(ctx, label, sx + 3, h.y + h.h - 13, P.blue);
    }
    // Wall lamps along the hall, each throwing a pool of light.
    for (let x = wing.x0 + 24; x < wing.x1 - 8; x += 64) {
      rect(ctx, x - 3, h.y, 6, 2, "#fff3c4");
      glow(ctx, x, h.y + 6, 22, 9, "#ffe9a8", 0.05);
    }
  }
  // Bulkheads where one district ends and the next begins.
  for (let i = 1; i < layout.wings.length; i++) {
    const bx = Math.round((layout.wings[i - 1].x1 + layout.wings[i].x0) / 2) - 2;
    rect(ctx, bx - 1, h.y, 6, HALL_H, P.ink);
    rect(ctx, bx, h.y, 4, HALL_H, P.steel1);
    rect(ctx, bx + 1, h.y, 1, HALL_H, P.steel2);
    hazard(ctx, bx - 8, h.y, 20, 3);
    hazard(ctx, bx - 8, h.y + HALL_H - 3, 20, 3);
  }
  // The facility's seal on the floor in front of the Command Center.
  if (core) {
    const cx = Math.round(layout.center.x);
    const cy = h.y + h.h / 2;
    for (const [r, c] of [[20, "#2a3f6e"], [18, "#30395a"], [12, "#2a3f6e"], [10, "#353d5a"]] as const) {
      for (let y = -Math.min(r, h.h / 2 - 3); y <= Math.min(r, h.h / 2 - 3); y++) {
        const half = Math.round(r * 1.6 * Math.sqrt(Math.max(0, 1 - (y * y) / (r * r))));
        rect(ctx, cx - half, cy + y, half * 2 + 1, 1, c);
      }
    }
    rect(ctx, cx - 1, cy - 6, 3, 13, "#38bdf8");
    rect(ctx, cx - 6, cy - 1, 13, 3, "#38bdf8");
  }
}

// ---------------------------------------------------------------------------
// Every frame.

export function drawFacility(ctx: CanvasRenderingContext2D, scene: Scene, background: HTMLCanvasElement) {
  const { state, layout, time } = scene;
  ctx.drawImage(background, 0, 0);

  // Lane lights chasing along the hall: ambient, to show the station is powered.
  const chase = Math.floor(time * 40) % 48;
  for (let x = layout.hall.x + chase; !layout.corridors && x < layout.hall.x + layout.hall.w; x += 48) rect(ctx, x, layout.laneY + 6, 6, 1, "rgba(120,200,255,0.5)");

  const completed = completedCount(state);
  const pending = pendingApprovals(state);
  for (const room of state.rooms) {
    const rl = layout.rooms.get(room.id);
    if (!rl) continue;
    const working = state.agents.filter((a) => a.roomId === room.id && a.status === "working").length;
    animateRoom(ctx, room, rl, { time: working ? time : 0, state, busy: tasksInRoom(state, room.id), working, completed, pending }, wingColor(state, room.wingId), state.wings);
  }

  // Crew, nearest the viewer drawn last.
  const crew = state.agents
    .map((agent) => ({ agent, walker: scene.walkers.get(agent.id) }))
    .filter((c): c is { agent: Agent; walker: Walker } => !!c.walker)
    .sort((a, b) => a.walker.y - b.walker.y);
  for (const { agent, walker } of crew) drawCrew(ctx, scene, agent, walker);

  // Rooms that need the owner flash red with a "!".
  for (const room of state.rooms) {
    const rl = layout.rooms.get(room.id);
    if (!rl) continue;
    const r = rl.rect;
    if (room.kind !== "sealed") {
      const signal = scene.connected === false ? "paused" : roomSignal(state, room.id, scene.running ?? true);
      const colors = { running: P.green, blocked: P.red, paused: P.yellow, review: P.orange, waiting: P.yellow, done: P.green, idle: P.stone2 };
      const labels = { running: "WORKING", blocked: "STOPPED", paused: "PAUSED", review: "REVIEW", waiting: "WAITING", done: "DONE", idle: "IDLE" };
      tag(ctx, labels[signal], r.x + r.w / 2, r.y + r.h + 4, colors[signal], P.ink);
      if (signal === "running") {
        frame(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, colors.running);
        const gear = Math.floor(time * 3) % 4;
        for (let i = 0; i < 4; i++) rect(ctx, r.x + 6 + i * 4, r.y + 5, 2, 2, i === gear ? P.white : P.darkGreen);
      }
    }
    if (roomNeedsAttention(state, room)) {
      const on = true;
      frame(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, on ? P.red : P.darkRed);
      frame(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, on ? P.darkRed : P.ink);
      if (room.kind !== "command") bubble(ctx, r.x + r.w - 14, r.y - 10 + Math.round(Math.sin(time * 4) * 1.5));
    }
    const selected = scene.selection?.kind === "room" && scene.selection.id === room.id;
    const hovered = scene.hovered?.kind === "room" && scene.hovered.id === room.id;
    if (selected) marchingAnts(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, time);
    else if (hovered) frame(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, "rgba(255,255,255,0.45)");
  }
}

function drawCrew(ctx: CanvasRenderingContext2D, scene: Scene, agent: Agent, w: Walker) {
  const { time, state } = scene;
  const x = Math.round(w.x);
  const y = Math.round(w.y);
  const step = w.moving ? ((Math.floor(time * 8) % 2) as 0 | 1) : 0;
  const bob = !w.moving && agent.status === "working" ? Math.round(Math.abs(Math.sin(time * 5))) : 0;
  // Shadow under the feet.
  rect(ctx, x - 5, y - 1, 10, 2, "rgba(0,0,0,0.35)");
  ctx.drawImage(crewSprite(agent.sprite, w.facing, step), x - SPRITE_W / 2, y - SPRITE_H + 1 - bob);

  const selected = scene.selection?.kind === "agent" && scene.selection.id === agent.id;
  const hovered = scene.hovered?.kind === "agent" && scene.hovered.id === agent.id;
  if (selected || hovered) brackets(ctx, x - SPRITE_W / 2 - 2, y - SPRITE_H - 1, SPRITE_W + 4, SPRITE_H + 3, selected ? P.white : "rgba(255,255,255,0.5)");

  // The name at their feet, so it never hides their workstation, and what they're up to over their head.
  tag(ctx, agent.name.toUpperCase(), x, y + 2, selected ? P.yellow : P.white);
  const task = agent.taskId ? state.tasks.find((t) => t.id === agent.taskId) : undefined;
  const operation = operationForAgent(state, agent.id);
  const top = y - SPRITE_H - 6;
  if (agent.status === "paused") {
    tag(ctx, "II", x, top - 4, P.ink, P.yellow);
  } else if (agent.status === "working" && (task || operation)) {
    rect(ctx, x - 9, top, 18, 4, P.ink);
    if (task?.progress) rect(ctx, x - 8, top + 1, Math.round(16 * task.progress), 2, agent.sprite.suit);
    else rect(ctx, x - 8 + Math.floor(time * 5) % 13, top + 1, 3, 2, agent.sprite.suit);
  } else if (agent.status === "idle" && !w.moving) {
    const p = (time * 0.6) % 1;
    text(ctx, "z", x + 5, top - Math.round(p * 6), `rgba(200,210,230,${1 - p})`);
  }
}

/** A red speech bubble with a "!", the facility's "this needs you" sign. */
function bubble(ctx: CanvasRenderingContext2D, x: number, y: number) {
  rect(ctx, x - 1, y - 1, 11, 11, P.ink);
  rect(ctx, x, y, 9, 9, P.red);
  rect(ctx, x + 2, y + 9, 3, 2, P.red);
  rect(ctx, x + 2, y + 11, 1, 1, P.ink);
  text(ctx, "!", x + 3, y + 2, P.white);
}

function brackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
    rect(ctx, Math.min(cx, cx + dx * 3), cy, 4, 1, color);
    rect(ctx, cx, Math.min(cy, cy + dy * 3), 1, 4, color);
  }
}

function marchingAnts(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, time: number) {
  const offset = Math.floor(time * 12) % 6;
  const dash = (i: number) => ((i + offset) % 6 < 3 ? P.white : P.ink);
  for (let i = 0; i < w; i++) {
    rect(ctx, x + i, y, 1, 1, dash(i));
    rect(ctx, x + w - 1 - i, y + h - 1, 1, 1, dash(i));
  }
  for (let i = 0; i < h; i++) {
    rect(ctx, x + w - 1, y + i, 1, 1, dash(i));
    rect(ctx, x, y + h - 1 - i, 1, 1, dash(i));
  }
}

/** What's at a point on the map: crew first (they stand in front of rooms), then rooms. */
export function hitTest(layout: FacilityLayout, walkers: Map<string, Walker>, x: number, y: number): Selection | null {
  let best: { id: string; y: number } | null = null;
  for (const [id, w] of walkers) {
    const inside = Math.abs(x - w.x) <= SPRITE_W / 2 + 1 && y <= w.y + 11 && y >= w.y - SPRITE_H - 2;
    if (inside && (!best || w.y > best.y)) best = { id, y: w.y };
  }
  if (best) return { kind: "agent", id: best.id };
  for (const [id, room] of layout.rooms) if (contains(room.rect, x, y)) return { kind: "room", id };
  return null;
}
