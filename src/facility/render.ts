import type { Agent, FacilityState, Room, RoomKind, Wing } from "../core/types";
import { WORLD_W, type FacilityLayout, type Rect } from "./layout";
import type { Walker } from "./movement";

// Canvas renderer for the underground facility. Everything is drawn from code
// (no image files), in a chunky pixel style. The world is drawn at 1x and the
// view applies a scale transform before calling drawFacility.

export interface Selection {
  kind: "room" | "agent";
  id: string;
}

export interface Scene {
  state: FacilityState;
  layout: FacilityLayout;
  walkers: Map<string, Walker>;
  selection: Selection | null;
  time: number;
}

const PX = 2;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// Deterministic noise so the rock texture doesn't flicker between frames.
function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

let rockCache: { key: string; canvas: HTMLCanvasElement } | null = null;

function rockTexture(width: number, height: number) {
  const key = `${width}x${height}`;
  if (rockCache?.key === key) return rockCache.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, "#2a1f17");
  grad.addColorStop(0.4, "#1d1612");
  grad.addColorStop(1, "#0d0b0a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < (width * height) / 90; i++) {
    const x = Math.floor(hash(i) * width);
    const y = Math.floor(hash(i + 9999) * height);
    const shade = hash(i + 4242);
    ctx.fillStyle = shade > 0.7 ? "rgba(120,96,72,0.25)" : shade > 0.35 ? "rgba(0,0,0,0.35)" : "rgba(80,64,50,0.2)";
    const size = shade > 0.92 ? PX * 3 : PX;
    ctx.fillRect(x - (x % PX), y - (y % PX), size, size);
  }
  // A few glowing crystal veins for atmosphere.
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(hash(i + 31) * width);
    const y = 140 + Math.floor(hash(i + 77) * (height - 140));
    ctx.fillStyle = hash(i + 5) > 0.5 ? "rgba(56,189,248,0.35)" : "rgba(168,85,247,0.3)";
    ctx.fillRect(x, y, PX * 2, PX);
    ctx.fillRect(x + PX, y - PX, PX, PX * 3);
  }
  rockCache = { key, canvas };
  return canvas;
}

function drawSurface(ctx: CanvasRenderingContext2D, time: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, 100);
  sky.addColorStop(0, "#020617");
  sky.addColorStop(1, "#1e1b4b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_W, 104);
  for (let i = 0; i < 60; i++) {
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.8 + i));
    ctx.fillStyle = `rgba(255,255,255,${(0.3 + hash(i) * 0.5) * twinkle})`;
    ctx.fillRect(Math.floor(hash(i + 1) * WORLD_W), Math.floor(hash(i + 2) * 80), PX, PX);
  }
  // Distant hills and the ground line.
  ctx.fillStyle = "#111827";
  for (let x = 0; x < WORLD_W; x += PX * 4) {
    const h = 14 + Math.sin(x * 0.012) * 8 + Math.sin(x * 0.041) * 4;
    ctx.fillRect(x, 104 - h, PX * 4, h);
  }
  px(ctx, 0, 104, WORLD_W, 6, "#365314");
  px(ctx, 0, 110, WORLD_W, 4, "#3f2e1f");
}

function drawShaft(ctx: CanvasRenderingContext2D, shaft: Rect, time: number) {
  px(ctx, shaft.x, shaft.y, shaft.w, shaft.h, "#0b1220");
  px(ctx, shaft.x, shaft.y, 4, shaft.h, "#334155");
  px(ctx, shaft.x + shaft.w - 4, shaft.y, 4, shaft.h, "#334155");
  for (let y = shaft.y + 6; y < shaft.y + shaft.h; y += 14) {
    px(ctx, shaft.x + 4, y, shaft.w - 8, 2, "#1e293b");
  }
  // Cable lights running down the shaft.
  const cx = shaft.x + shaft.w / 2;
  px(ctx, cx - 1, shaft.y, 2, shaft.h, "#475569");
  const pulse = (time * 90) % shaft.h;
  px(ctx, cx - 2, shaft.y + pulse, 4, 6, "#38bdf8");
}

const ROOM_TINT: Record<RoomKind, string> = {
  command: "#0c1a2b",
  vault: "#1a1408",
  lab: "#0b1f17",
  studio: "#1c0f24",
  bay: "#1f1606",
  comms: "#220d0d",
  dock: "#111827",
  sealed: "#121212",
};

function drawRoomFurniture(
  ctx: CanvasRenderingContext2D,
  room: Room,
  r: Rect,
  floorY: number,
  scene: Scene,
  accent: string,
) {
  const t = scene.time;
  const { state } = scene;
  switch (room.kind) {
    case "command": {
      // Big wall screen with a live activity graph.
      const sx = r.x + 14;
      const sw = r.w - 28;
      px(ctx, sx, r.y + 22, sw, 46, "#020617");
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, r.y + 22.5, sw - 1, 45);
      ctx.beginPath();
      for (let i = 0; i <= 30; i++) {
        const x = sx + 4 + (i / 30) * (sw - 8);
        const y = r.y + 50 + Math.sin(i * 0.7 + t * 2) * 8 + Math.sin(i * 1.9 + t) * 4;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const pending = state.approvals.filter((a) => a.status === "pending").length;
      ctx.fillStyle = pending ? "#f87171" : "#4ade80";
      ctx.font = "bold 9px ui-monospace, Menlo, monospace";
      ctx.fillText(pending ? `${pending} AWAITING YOU` : "ALL CLEAR", sx + 6, r.y + 33);
      // Consoles.
      for (let i = 0; i < 3; i++) {
        const cx = sx + 10 + i * (sw / 3);
        px(ctx, cx, floorY - 16, 34, 16, "#1e293b");
        px(ctx, cx + 3, floorY - 14, 28, 4, Math.sin(t * 3 + i) > 0 ? accent : "#0f172a");
      }
      break;
    }
    case "vault": {
      // Finished work stacks up as crates.
      const done = state.tasks.filter((x) => x.state === "done").length;
      const shown = Math.min(done, 36);
      for (let i = 0; i < shown; i++) {
        const col = i % 9;
        const row = Math.floor(i / 9);
        const cx = r.x + 12 + col * 15;
        const cy = floorY - 14 - row * 14;
        px(ctx, cx, cy, 13, 12, "#a16207");
        px(ctx, cx + 1, cy + 1, 11, 2, "#ca8a04");
        px(ctx, cx + 5, cy, 3, 12, "#713f12");
      }
      ctx.fillStyle = "#fde68a";
      ctx.font = "bold 10px ui-monospace, Menlo, monospace";
      ctx.fillText(`${done} COMPLETED`, r.x + 12, r.y + 34);
      break;
    }
    case "lab": {
      for (let i = 0; i < 3; i++) {
        const tx = r.x + 16 + i * 26;
        px(ctx, tx, floorY - 44, 14, 40, "#0f2a20");
        const level = 18 + Math.sin(t * 1.5 + i * 2) * 8;
        px(ctx, tx + 2, floorY - 6 - level, 10, level, i === 1 ? "#a855f7" : "#22c55e");
        px(ctx, tx - 2, floorY - 6, 18, 6, "#334155");
      }
      px(ctx, r.x + r.w - 54, floorY - 34, 40, 26, "#020617");
      px(ctx, r.x + r.w - 50, floorY - 30, 32, 2, "#22c55e");
      px(ctx, r.x + r.w - 50, floorY - 24, (Math.sin(t * 2) + 1.2) * 12, 2, "#22c55e");
      px(ctx, r.x + r.w - 50, floorY - 18, 20, 2, "#22c55e");
      break;
    }
    case "studio": {
      for (let i = 0; i < 2; i++) {
        const ex = r.x + 18 + i * 60;
        px(ctx, ex + 4, floorY - 50, 2, 50, "#78350f");
        px(ctx, ex + 26, floorY - 50, 2, 50, "#78350f");
        px(ctx, ex, floorY - 52, 32, 26, "#f5f5f4");
        const hue = (t * 40 + i * 120) % 360;
        ctx.fillStyle = `hsl(${hue},70%,60%)`;
        ctx.fillRect(ex + 6, floorY - 46, 10, 10);
        ctx.fillStyle = `hsl(${(hue + 90) % 360},70%,55%)`;
        ctx.fillRect(ex + 14, floorY - 40, 12, 8);
      }
      break;
    }
    case "bay": {
      // Conveyor belt carrying listing packets toward the shaft.
      px(ctx, r.x + 10, floorY - 14, r.w - 20, 8, "#292524");
      for (let x = 0; x < r.w - 20; x += 8) {
        px(ctx, r.x + 10 + ((x + t * 30) % (r.w - 20)), floorY - 13, 2, 6, "#57534e");
      }
      const active = state.tasks.filter((x) => x.state === "active" || x.state === "awaiting_approval");
      const boxes = active.filter((x) => {
        const stages = state.wings.find((w) => w.id === x.wingId)?.workflows.find((w) => w.id === x.workflowId)?.stages;
        return stages?.[x.stageIndex]?.roomId === room.id;
      }).length;
      for (let i = 0; i < Math.min(boxes, 6); i++) {
        px(ctx, r.x + 18 + i * 22, floorY - 26, 16, 12, "#fbbf24");
        px(ctx, r.x + 18 + i * 22, floorY - 26, 16, 3, "#f59e0b");
      }
      break;
    }
    case "comms": {
      px(ctx, r.x + r.w / 2 - 2, r.y + 30, 4, floorY - r.y - 30, "#475569");
      ctx.strokeStyle = "#f87171";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + 36, 14, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const wave = (t * 1.2 + i / 3) % 1;
        ctx.strokeStyle = `rgba(248,113,113,${1 - wave})`;
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2, r.y + 30, 10 + wave * 24, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
      }
      break;
    }
    case "dock": {
      // Antenna with a beacon on the surface building.
      px(ctx, r.x + r.w - 20, r.y - 22, 2, 22, "#64748b");
      px(ctx, r.x + r.w - 23, r.y - 26, 8, 4, Math.sin(t * 4) > 0 ? "#ef4444" : "#7f1d1d");
      px(ctx, r.x + 12, r.y + 18, r.w - 24, 8, "#1e293b");
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 8px ui-monospace, Menlo, monospace";
      ctx.fillText("ETSY UPLINK", r.x + 16, r.y + 25);
      break;
    }
    case "sealed": {
      for (let x = r.x; x < r.x + r.w; x += 16) {
        px(ctx, x, floorY - 10, 8, 6, "#eab308");
      }
      ctx.fillStyle = "#71717a";
      ctx.font = "bold 11px ui-monospace, Menlo, monospace";
      ctx.fillText("SEALED · RESERVED FOR NEXT BUSINESS", r.x + 12, r.y + r.h / 2 + 4);
      break;
    }
  }
}

function roomNeedsAttention(state: FacilityState, room: Room) {
  if (room.kind === "command") return state.approvals.some((a) => a.status === "pending");
  return state.approvals.some((a) => {
    if (a.status !== "pending") return false;
    const task = state.tasks.find((t) => t.id === a.taskId);
    if (!task) return false;
    const stages = state.wings.find((w) => w.id === task.wingId)?.workflows.find((w) => w.id === task.workflowId)?.stages;
    return stages?.[task.stageIndex]?.roomId === room.id;
  });
}

function drawRooms(ctx: CanvasRenderingContext2D, scene: Scene) {
  const { state, layout, selection, time } = scene;
  for (const room of state.rooms) {
    const rl = layout.rooms.get(room.id);
    if (!rl) continue;
    const wing = state.wings.find((w) => w.id === room.wingId);
    const accent = wing?.color ?? "#94a3b8";
    const r = rl.rect;
    const alert = roomNeedsAttention(state, room);

    px(ctx, r.x, r.y, r.w, r.h, ROOM_TINT[room.kind]);
    // Ceiling lights.
    for (let x = r.x + 16; x < r.x + r.w - 10; x += 40) {
      px(ctx, x, r.y + 2, 14, 3, room.kind === "sealed" ? "#27272a" : "#fef9c3");
      ctx.fillStyle = room.kind === "sealed" ? "transparent" : "rgba(254,249,195,0.05)";
      ctx.beginPath();
      ctx.moveTo(x, r.y + 5);
      ctx.lineTo(x + 14, r.y + 5);
      ctx.lineTo(x + 30, r.y + 50);
      ctx.lineTo(x - 16, r.y + 50);
      ctx.fill();
    }

    drawRoomFurniture(ctx, room, r, rl.floorY, scene, accent);

    const glow = alert ? 0.55 + 0.45 * Math.sin(time * 5) : 1;
    ctx.strokeStyle = alert ? `rgba(239,68,68,${glow})` : room.kind === "sealed" ? "#3f3f46" : accent;
    ctx.lineWidth = alert ? 3 : 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    if (selection?.kind === "room" && selection.id === room.id) {
      ctx.strokeStyle = "#ffffff";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
      ctx.setLineDash([]);
    }

    if (room.kind === "sealed") continue;

    // Name plate.
    ctx.font = "bold 10px ui-monospace, Menlo, monospace";
    const label = room.name.toUpperCase();
    const lw = ctx.measureText(label).width + 10;
    px(ctx, r.x + 6, r.y + 6, lw, 13, "rgba(2,6,23,0.85)");
    ctx.fillStyle = alert ? "#fca5a5" : accent;
    ctx.fillText(label, r.x + 11, r.y + 16);
    if (alert && room.kind !== "command") {
      px(ctx, r.x + r.w - 20, r.y + 6, 14, 14, "#dc2626");
      ctx.fillStyle = "#fff";
      ctx.fillText("!", r.x + r.w - 16, r.y + 17);
    }
  }
}

function drawLevels(ctx: CanvasRenderingContext2D, scene: Scene) {
  const { layout, state } = scene;
  for (const level of layout.levels) {
    const wing = state.wings.find((w) => w.id === level.wingId);
    const r = level.rect;
    px(ctx, r.x - 6, r.y - 6, r.w + 12, r.h + 12, "#0a0a0a");
    px(ctx, r.x, r.y, r.w, r.h, "#111318");
    // Corridor floor.
    px(ctx, r.x, level.floorY + 2, r.w, 8, "#27272a");
    for (let x = r.x; x < r.x + r.w; x += 12) px(ctx, x, level.floorY + 2, 6, 2, "#3f3f46");
    ctx.font = "bold 9px ui-monospace, Menlo, monospace";
    ctx.fillStyle = wing?.sealed ? "#52525b" : (wing?.color ?? "#94a3b8");
    ctx.fillText(`B${level.index + 1} · ${wing?.name.toUpperCase() ?? ""}`, r.x + 4, r.y - 9);
  }
}

function drawAgent(ctx: CanvasRenderingContext2D, agent: Agent, w: Walker, scene: Scene) {
  const { time, selection, state } = scene;
  // Draw the sprite around its feet at 1.5x so the crew reads clearly.
  ctx.save();
  ctx.translate(Math.round(w.x), Math.round(w.y));
  ctx.scale(1.5, 1.5);
  const x = 0;
  const y = 0;
  const bob = w.moving ? Math.round(Math.abs(Math.sin(time * 10 + w.x)) * 2) : 0;
  const stepPhase = w.moving ? Math.floor(time * 8) % 2 : 0;

  // Shadow.
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(x - 6, y - 1, 12, 2);
  // Legs.
  px(ctx, x - 4, y - 7, 3, 6 - stepPhase * 2, "#1f2937");
  px(ctx, x + 1, y - 7, 3, 4 + stepPhase * 2, "#1f2937");
  // Suit.
  px(ctx, x - 5, y - 17 - bob, 10, 11, agent.sprite.suit);
  px(ctx, x - 5, y - 9 - bob, 10, 2, "rgba(0,0,0,0.3)");
  // Helmet and visor.
  px(ctx, x - 5, y - 25 - bob, 10, 8, "#e5e7eb");
  px(ctx, x + (w.facing > 0 ? -1 : -4), y - 23 - bob, 5, 4, agent.sprite.visor);
  // Backpack.
  px(ctx, x + (w.facing > 0 ? -7 : 5), y - 16 - bob, 2, 7, "#475569");

  if (selection?.kind === "agent" && selection.id === agent.id) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 9.5, y - 30.5 - bob, 19, 32);
  }

  // Status badge above the head.
  const by = y - 34 - bob;
  if (agent.status === "working" && agent.taskId) {
    const task = state.tasks.find((t) => t.id === agent.taskId);
    px(ctx, x - 10, by, 20, 4, "#0f172a");
    px(ctx, x - 10, by, Math.max(1, Math.round(20 * (task?.progress ?? 0))), 4, agent.sprite.suit);
  } else if (agent.status === "paused") {
    px(ctx, x - 4, by - 4, 3, 8, "#fbbf24");
    px(ctx, x + 1, by - 4, 3, 8, "#fbbf24");
  } else if (agent.status === "idle" && !w.moving) {
    ctx.fillStyle = "rgba(148,163,184,0.8)";
    ctx.font = "bold 8px ui-monospace, Menlo, monospace";
    const z = Math.floor(time * 1.5) % 3;
    ctx.fillText("z".repeat(z + 1), x + 4, by + 4);
  }

  ctx.restore();

  ctx.fillStyle = "rgba(226,232,240,0.9)";
  ctx.font = "9px ui-monospace, Menlo, monospace";
  const nameW = ctx.measureText(agent.name).width;
  ctx.fillText(agent.name, Math.round(w.x - nameW / 2), Math.round(w.y + 13));
}

export function drawFacility(ctx: CanvasRenderingContext2D, scene: Scene) {
  const { layout, state, walkers, time } = scene;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(rockTexture(WORLD_W, Math.ceil(layout.height)), 0, 0);
  drawSurface(ctx, time);
  drawLevels(ctx, scene);
  drawShaft(ctx, layout.shaft, time);
  drawRooms(ctx, scene);
  for (const agent of state.agents) {
    const w = walkers.get(agent.id);
    if (w) drawAgent(ctx, agent, w, scene);
  }
}

export function wingOf(state: FacilityState, id: string): Wing | undefined {
  return state.wings.find((w) => w.id === id);
}
