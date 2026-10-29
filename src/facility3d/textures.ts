import * as THREE from "three";

// Every texture is drawn in code at start-up: no image files, nothing fetched.

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}

// Deterministic noise so textures look the same on every load.
function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function finish(c: HTMLCanvasElement, repeat?: [number, number], color = true) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/** Layered rock with strata, pebbles and a few glowing crystal veins. */
export function rockTexture(repeat: [number, number]) {
  const { c, ctx } = canvas(512, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#6b5442");
  g.addColorStop(0.5, "#57453a");
  g.addColorStop(1, "#45372e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 18; i++) {
    const y = hash(i + 3) * 512;
    ctx.fillStyle = `rgba(${hash(i) > 0.5 ? "120,96,74" : "20,16,12"},0.12)`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 6 + hash(i * x + 1) * 4);
    ctx.lineTo(512, y + 10 + hash(i + 9) * 14);
    ctx.lineTo(0, y + 10 + hash(i + 7) * 14);
    ctx.fill();
  }
  for (let i = 0; i < 2600; i++) {
    const x = hash(i) * 512;
    const y = hash(i + 999) * 512;
    const s = hash(i + 42);
    ctx.fillStyle = s > 0.7 ? "rgba(150,120,92,0.35)" : "rgba(0,0,0,0.4)";
    const r = s > 0.95 ? 5 : s > 0.8 ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, repeat);
}

/** Matching bump map for the rock, so light catches the surface. */
export function rockBump(repeat: [number, number]) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const v = Math.floor(hash(i + 5) * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(hash(i) * 256, hash(i + 77) * 256, 1 + hash(i + 3) * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, repeat, false);
}

/** Sci-fi wall panels: plates, seams, rivets and vents. */
export function panelTexture(base: string, line: string, repeat: [number, number]) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  for (let i = 0; i <= 256; i += 128) {
    ctx.strokeRect(i + 2, 2, 124, 252);
  }
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 90, 108, 70);
  ctx.strokeRect(138, 30, 108, 40);
  ctx.fillStyle = line;
  for (const [x, y] of [[8, 8], [120, 8], [8, 248], [120, 248], [136, 8], [248, 8], [136, 248], [248, 248]]) {
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  for (let y = 190; y < 240; y += 8) ctx.fillRect(150, y, 90, 3);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, 0, 256, 40);
  return finish(c, repeat);
}

/** Metal floor grating. */
export function floorTexture(repeat: [number, number]) {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = "#3a414c";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#262b33";
  for (let x = 0; x < 128; x += 16) for (let y = 0; y < 128; y += 16) ctx.fillRect(x + 2, y + 2, 12, 12);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let x = 0; x < 128; x += 16) ctx.fillRect(x, 0, 1, 128);
  return finish(c, repeat);
}

/** Yellow and black hazard stripes. */
export function hazardTexture(repeat: [number, number]) {
  const { c, ctx } = canvas(128, 32);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = "#eab308";
  for (let x = -32; x < 160; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x + 16, 32);
    ctx.lineTo(x + 32, 0);
    ctx.lineTo(x + 16, 0);
    ctx.fill();
  }
  return finish(c, repeat);
}

export function grassTexture(repeat: [number, number]) {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = "#1f3a14";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = hash(i) > 0.5 ? "#2f5a1c" : "#15290e";
    ctx.fillRect(hash(i + 1) * 128, hash(i + 2) * 128, 1.5, 3);
  }
  return finish(c, repeat);
}

/** Night sky gradient for the backdrop. */
export function skyTexture() {
  const { c, ctx } = canvas(16, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#01030a");
  g.addColorStop(0.55, "#0b1030");
  g.addColorStop(0.8, "#251a4a");
  g.addColorStop(1, "#3b1f4a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  return finish(c);
}

export interface TextOptions {
  color?: string;
  background?: string;
  border?: string;
  size?: number;
  bold?: boolean;
}

/** Text drawn onto a texture, with its width-to-height ratio for sizing. */
export function textTexture(text: string, opts: TextOptions = {}) {
  const size = opts.size ?? 48;
  const font = `${opts.bold === false ? "" : "bold "}${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const probe = canvas(4, 4).ctx;
  probe.font = font;
  const padX = size * 0.5;
  const w = Math.ceil(probe.measureText(text).width + padX * 2);
  const h = Math.ceil(size * 1.6);
  const { c, ctx } = canvas(w, h);
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, size * 0.3);
    ctx.fill();
  }
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = Math.max(2, size * 0.08);
    ctx.beginPath();
    ctx.roundRect(1, 1, w - 2, h - 2, size * 0.3);
    ctx.stroke();
  }
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.fillStyle = opts.color ?? "#e2e8f0";
  ctx.fillText(text, padX, h / 2 + size * 0.05);
  const t = finish(c);
  return { texture: t, aspect: w / h };
}
