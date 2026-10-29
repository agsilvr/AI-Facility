import type { SpriteLook } from "../core/types";
import type { Facing } from "./movement";

// The pixel-art toolkit: a small fixed palette, a 3x5 pixel font and the crew
// sprites, all drawn from code so there are no image files to load. Everything
// is drawn at one canvas pixel per art pixel; the view scales it up with
// smoothing off, which keeps every pixel crisp.

export const P = {
  ink: "#0b0a10",
  night: "#14121c",
  dirt0: "#24170f",
  dirt1: "#2f1e13",
  dirt2: "#3b2618",
  dirt3: "#4c321f",
  clay: "#6b4a2f",
  pebble: "#8b6b4c",
  stone0: "#3d3c48",
  stone1: "#5a5968",
  stone2: "#85849a",
  hull0: "#191b2b",
  hull1: "#23263c",
  hull2: "#2f3350",
  wall0: "#262a45",
  wall1: "#343a5e",
  wall2: "#4a5282",
  trim: "#6d77b0",
  steel0: "#3a3f55",
  steel1: "#565d7a",
  steel2: "#8890ad",
  white: "#f4f1e8",
  paper: "#d9d4c5",
  grey: "#9a9fb8",
  red: "#ff4d5e",
  darkRed: "#8c1f2c",
  orange: "#ff9f1c",
  yellow: "#ffd84d",
  gold: "#e8b02a",
  darkGold: "#8a5f12",
  green: "#3ddc84",
  darkGreen: "#16784a",
  teal: "#2ec4b6",
  blue: "#3fa7ff",
  darkBlue: "#1b4f8a",
  purple: "#a167ff",
  pink: "#ff77a8",
  brown: "#8a5a3b",
  darkBrown: "#55351f",
  screen: "#07131f",
} as const;

/** Fill one pixel-aligned rectangle. */
export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A one-pixel outline just inside a rectangle. */
export function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  rect(ctx, x, y, w, 1, color);
  rect(ctx, x, y + h - 1, w, 1, color);
  rect(ctx, x, y, 1, h, color);
  rect(ctx, x + w - 1, y, 1, h, color);
}

/** Deterministic noise in 0..1, so generated art is the same every time. */
export function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// 3x5 font. Each glyph is five rows of three pixels.
const GLYPHS: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110",
  E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101",
  I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
  M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
  Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
  Y: "101101010010010", Z: "111001010100111",
  "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110",
  "4": "101101111001001", "5": "111100110001110", "6": "011100111101111", "7": "111001010010010",
  "8": "111101111101111", "9": "111101111001110",
  " ": "000000000000000", ".": "000000000000010", ",": "000000000010100", ":": "000010000010000",
  "!": "010010010000010", "?": "110001010000010", "-": "000000111000000", "+": "000010111010000",
  "/": "001001010100100", "·": "000000010000000", "$": "011110010011110", "%": "101001010100101",
  "&": "010101010101011", "'": "010010000000000", "(": "001010010010001", ")": "100010010010100",
  "#": "101111101111101", ">": "100010001010100", "<": "001010100010001", "=": "000111000111000",
  "^": "010101000000000", "_": "000000000000111",
};

export const GLYPH_W = 3;
export const GLYPH_H = 5;

export function glyph(ch: string) {
  return GLYPHS[ch.toUpperCase()] ?? GLYPHS["?"];
}

/** Width in pixels of text in the pixel font, at a given scale. */
export function textWidth(text: string, scale = 1) {
  return text.length === 0 ? 0 : (text.length * (GLYPH_W + 1) - 1) * scale;
}

/** Draw text in the pixel font with its top-left corner at (x, y). */
export function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string, scale = 1) {
  ctx.fillStyle = color;
  let cx = Math.round(x);
  const top = Math.round(y);
  for (const ch of value) {
    const bits = glyph(ch);
    for (let i = 0; i < 15; i++) {
      if (bits[i] === "1") ctx.fillRect(cx + (i % 3) * scale, top + Math.floor(i / 3) * scale, scale, scale);
    }
    cx += (GLYPH_W + 1) * scale;
  }
}

/** Text on a small dark plate, centred on x. */
export function tag(ctx: CanvasRenderingContext2D, value: string, cx: number, y: number, color: string, background: string = P.ink) {
  const w = textWidth(value) + 4;
  const x = Math.round(cx - w / 2);
  rect(ctx, x, y, w, GLYPH_H + 4, background);
  text(ctx, value, x + 2, y + 2, color);
}

// Crew sprites: a little underground worker in a helmet, in their own colours.
// Each is 12 x 16 art pixels plus a 1-pixel outline, for 4 directions and 2
// walking frames, built once per look and kept.

export const SPRITE_W = 14;
export const SPRITE_H = 18;

type Paint = (x: number, y: number, w: number, h: number, color: string) => void;

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function paintCrew(paint: Paint, look: SpriteLook, facing: Facing, step: 0 | 1) {
  const suit = look.suit;
  const suitDark = shade(look.suit, -0.18);
  const helmet = P.white;
  const helmetShade = P.paper;
  const boots = P.steel0;
  // Legs, swapping lengths to walk.
  const left = step === 0 ? 3 : 2;
  const right = step === 0 ? 2 : 3;
  if (facing === "left" || facing === "right") {
    paint(4, 12, 2, left, boots);
    paint(7, 12, 2, right, boots);
  } else {
    paint(3, 12, 2, left, boots);
    paint(7, 12, 2, right, boots);
  }
  // Body.
  paint(2, 7, 8, 5, suit);
  paint(2, 10, 8, 1, suitDark);
  // Head: a round helmet.
  paint(3, 0, 6, 1, helmet);
  paint(2, 1, 8, 5, helmet);
  paint(3, 6, 6, 1, helmetShade);
  paint(2, 5, 8, 1, helmetShade);
  if (facing === "down") {
    paint(3, 2, 6, 3, look.visor);
    paint(3, 2, 2, 1, P.white);
    paint(1, 7, 1, 4, suitDark);
    paint(10, 7, 1, 4, suitDark);
    paint(1, 11, 1, 1, helmet);
    paint(10, 11, 1, 1, helmet);
    paint(5, 8, 2, 1, look.visor);
  } else if (facing === "up") {
    // Back of the helmet and an air pack.
    paint(3, 7, 6, 4, P.steel1);
    paint(4, 8, 4, 1, P.steel2);
    paint(1, 7, 1, 4, suitDark);
    paint(10, 7, 1, 4, suitDark);
  } else {
    const dir = facing === "left" ? -1 : 1;
    const vx = dir < 0 ? 2 : 6;
    paint(vx, 2, 4, 3, look.visor);
    paint(vx + (dir < 0 ? 0 : 3), 2, 1, 1, P.white);
    // Pack on the back, arm swinging at the front.
    paint(dir < 0 ? 9 : 1, 7, 2, 4, P.steel1);
    paint(dir < 0 ? 4 : 6, 8 + step, 2, 3, suitDark);
  }
}

const spriteCache = new Map<string, HTMLCanvasElement>();

/** The sprite for a crew member's look, direction and walking frame. */
export function crewSprite(look: SpriteLook, facing: Facing, step: 0 | 1): HTMLCanvasElement {
  const key = `${look.suit}|${look.visor}|${facing}|${step}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const W = SPRITE_W;
  const H = SPRITE_H;
  const pixels: (string | null)[] = new Array(W * H).fill(null);
  paintCrew(
    (x, y, w, h, color) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) pixels[(y + j + 1) * W + (x + i + 1)] = color;
    },
    look,
    facing,
    step,
  );
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  // A dark outline around the whole figure, the classic sprite look.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const color = pixels[y * W + x];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      } else if (outlineAt(pixels, x, y, W, H)) {
        ctx.fillStyle = P.ink;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  spriteCache.set(key, canvas);
  return canvas;
}

/** True for an empty pixel next to a filled one. */
export function outlineAt(pixels: (string | null)[], x: number, y: number, w: number, h: number) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h && pixels[ny * w + nx]) return true;
  }
  return false;
}
