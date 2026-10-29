import { completedCount } from "../core/ledger";
import type { Agent, FacilityState } from "../core/types";
import { contains, HALL_H, MARGIN, TILE, type FacilityLayout } from "./layout";
import type { Walker } from "./movement";
import { crewSprite, frame, hash, P, rect, SPRITE_H, SPRITE_W, tag, text, textWidth } from "./pixels";
import { animateRoom, hazard, paintRoom } from "./rooms";
import { pendingApprovals, roomNeedsAttention, tasksInRoom, type Selection } from "./status";

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
    if (rl) paintRoom(ctx, room, rl, wingColor(state, room.wingId));
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
  for (let i = 0; i < (EARTH_TILE * EARTH_TILE) / 18; i++) {
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

/** The station's outer hull: the metal shell everything is built inside. */
function paintHull(ctx: CanvasRenderingContext2D, layout: FacilityLayout) {
  const x0 = layout.hall.x - 6;
  const x1 = layout.hall.x + layout.hall.w + 6;
  const y0 = MARGIN - 8;
  const y1 = layout.height - MARGIN + 8;
  rect(ctx, x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4, P.ink);
  rect(ctx, x0, y0, x1 - x0, y1 - y0, P.hull1);
  rect(ctx, x0, y0, x1 - x0, 1, P.steel1);
  for (let y = y0 + 8; y < y1; y += 16) rect(ctx, x0, y, x1 - x0, 1, P.hull0);
  for (let x = x0 + 8; x < x1; x += 32) {
    for (let y = y0 + 4; y < y1; y += 16) rect(ctx, x + ((y >> 4) % 2) * 16, y, 1, 1, P.hull2);
  }
}

/** The main hall: a metal floor with a lit walking lane and each wing's name painted on it. */
function paintHall(ctx: CanvasRenderingContext2D, layout: FacilityLayout, state: FacilityState) {
  const h = layout.hall;
  for (let x = h.x; x < h.x + h.w; x += TILE) {
    for (let y = h.y; y < h.y + h.h; y += TILE) {
      rect(ctx, x, y, TILE, TILE, ((x - h.x + y - h.y) / TILE) % 2 ? P.steel0 : "#40465e");
      rect(ctx, x, y, TILE, 1, "rgba(255,255,255,0.06)");
      rect(ctx, x, y, 1, TILE, "rgba(0,0,0,0.2)");
    }
  }
  // Walls at either end of the hall.
  rect(ctx, h.x - 6, h.y, 6, h.h, P.wall0);
  rect(ctx, h.x + h.w, h.y, 6, h.h, P.wall0);
  // Dashed guide line along the lane.
  for (let x = h.x + 4; x < h.x + h.w - 4; x += 12) rect(ctx, x, layout.laneY + 6, 6, 1, "rgba(255,255,255,0.12)");

  for (const wing of layout.wings) {
    const w = state.wings.find((x) => x.id === wing.wingId);
    const color = wingColor(state, wing.wingId);
    // Edge strips in the wing's colour, and its name on the floor.
    rect(ctx, wing.x0, h.y + 1, wing.x1 - wing.x0, 2, color);
    rect(ctx, wing.x0, h.y + h.h - 3, wing.x1 - wing.x0, 2, color);
    const name = (w?.name ?? wing.wingId).toUpperCase();
    rect(ctx, wing.x0 + 4, h.y + 6, textWidth(name) + 6, 9, P.ink);
    text(ctx, name, wing.x0 + 7, h.y + 8, color);
    // A bulkhead where one wing ends and the next begins.
    if (wing !== layout.wings[layout.wings.length - 1]) {
      const bx = wing.x1 + 20;
      rect(ctx, bx, h.y, 4, HALL_H, P.steel1);
      rect(ctx, bx + 1, h.y, 1, HALL_H, P.steel2);
      hazard(ctx, bx - 6, h.y, 6, 3);
      hazard(ctx, bx - 6, h.y + HALL_H - 3, 6, 3);
    }
  }
}

// ---------------------------------------------------------------------------
// Every frame.

export function drawFacility(ctx: CanvasRenderingContext2D, scene: Scene, background: HTMLCanvasElement) {
  const { state, layout, time } = scene;
  ctx.drawImage(background, 0, 0);

  // Lane lights chasing along the hall: ambient, to show the station is powered.
  const chase = Math.floor(time * 40) % 48;
  for (let x = layout.hall.x + chase; x < layout.hall.x + layout.hall.w; x += 48) rect(ctx, x, layout.laneY + 6, 6, 1, "rgba(120,200,255,0.5)");

  const completed = completedCount(state);
  const pending = pendingApprovals(state);
  for (const room of state.rooms) {
    const rl = layout.rooms.get(room.id);
    if (!rl) continue;
    animateRoom(ctx, room, rl, { time, state, busy: tasksInRoom(state, room.id), completed, pending }, wingColor(state, room.wingId));
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
    if (roomNeedsAttention(state, room)) {
      const on = Math.sin(time * 6) > 0;
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

  // Name above the head, and what they're up to above that.
  tag(ctx, agent.name.toUpperCase(), x, y - SPRITE_H - 10, selected ? P.yellow : P.white);
  const task = agent.taskId ? state.tasks.find((t) => t.id === agent.taskId) : undefined;
  const top = y - SPRITE_H - 16;
  if (agent.status === "paused") {
    tag(ctx, "II", x, top - 4, P.ink, P.yellow);
  } else if (agent.status === "working" && task) {
    rect(ctx, x - 9, top, 18, 4, P.ink);
    rect(ctx, x - 8, top + 1, Math.max(1, Math.round(16 * task.progress)), 2, agent.sprite.suit);
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
    const inside = Math.abs(x - w.x) <= SPRITE_W / 2 + 1 && y <= w.y + 2 && y >= w.y - SPRITE_H - 10;
    if (inside && (!best || w.y > best.y)) best = { id, y: w.y };
  }
  if (best) return { kind: "agent", id: best.id };
  for (const [id, room] of layout.rooms) if (contains(room.rect, x, y)) return { kind: "room", id };
  return null;
}
