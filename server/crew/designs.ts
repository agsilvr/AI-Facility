import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtworkAsset, ArtworkInspection } from "../../src/core/types";
import { inspectPng } from "./png";

// Designs the crew make, kept as files in the facility's data folder. The
// type-only designer lives here too: when Codex isn't free, a product still
// gets a clean typographic design, drawn by plain code from the idea's phrase.
//
// A design's id is a fingerprint of its content, so a listing that names a
// design names exactly that artwork, and approving the listing approves it.

const ID = /^[0-9a-f]{16}$/;

export class Designs {
  private dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "designs");
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
  }

  /** Save an SVG design and return its id. */
  save(svg: string): string {
    const id = createHash("sha256").update(svg).digest("hex").slice(0, 16);
    writeFileSync(this.path(id), svg, { mode: 0o600 });
    return id;
  }

  /** The SVG for an id, or null for anything that isn't a saved design. */
  read(id: string): string | null {
    if (!ID.test(id)) return null;
    const file = this.path(id);
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  }

  savePng(bytes: Buffer): ArtworkAsset {
    const dimensions = inspectPng(bytes);
    if (!dimensions.inspection.visibleBounds) throw new Error("Artwork is entirely transparent; provide visible artwork.");
    const id = createHash("sha256").update(bytes).digest("hex");
    const file = join(this.dir, `${id}.png`);
    if (!existsSync(file)) writeFileSync(file, bytes, { mode: 0o600, flag: "wx" });
    else if (createHash("sha256").update(readFileSync(file)).digest("hex") !== id) throw new Error("Stored artwork fingerprint does not match.");
    return { id, ...dimensions, mime: "image/png" };
  }

  asset(id: string): { bytes: Buffer; mime: "image/png" | "image/svg+xml"; width?: number; height?: number; inspection?: ArtworkInspection } | null {
    if (/^[0-9a-f]{64}$/.test(id)) {
      const file = join(this.dir, `${id}.png`);
      if (!existsSync(file)) return null;
      const bytes = readFileSync(file);
      if (createHash("sha256").update(bytes).digest("hex") !== id) return null;
      return { bytes, mime: "image/png", ...inspectPng(bytes) };
    }
    const svg = this.read(id);
    return svg ? { bytes: Buffer.from(svg), mime: "image/svg+xml" } : null;
  }

  private path(id: string) {
    return join(this.dir, `${id}.svg`);
  }
}

const PALETTES = [
  { bg: "#f6efe4", ink: "#2b2a28", accent: "#c8553d" },
  { bg: "#1f2a44", ink: "#f4f1de", accent: "#e9c46a" },
  { bg: "#e8f1ec", ink: "#1d3b2f", accent: "#7fb685" },
  { bg: "#fdf0f2", ink: "#4a1c2c", accent: "#e07a95" },
];

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Split a phrase into one to three lines so the longest line is as short as
 * possible, which lets the type be set as large as it can. Short phrases stay
 * on one line. (At most 9 words, so trying every split is cheap.)
 */
export function lines(phrase: string): string[] {
  const words = phrase.trim().split(/\s+/).filter(Boolean).slice(0, 9);
  const count = Math.min(3, words.length, Math.max(1, Math.round(words.join(" ").length / 10)));
  let best: string[] = [words.join(" ")];
  const widest = (rows: string[]) => Math.max(...rows.map((r) => r.length));
  const consider = (rows: string[]) => {
    if (widest(rows) < widest(best)) best = rows;
  };
  for (let i = 1; i < words.length && count >= 2; i++) {
    consider([words.slice(0, i).join(" "), words.slice(i).join(" ")]);
    for (let j = i + 1; j < words.length && count >= 3; j++) {
      consider([words.slice(0, i).join(" "), words.slice(i, j).join(" "), words.slice(j).join(" ")]);
    }
  }
  return best;
}

/**
 * A type-only design: the phrase set large and centred on a square print, with
 * a thin rule and a small accent. It contains only text and shapes we write,
 * so it can't carry scripts or links whatever the phrase says.
 */
export function typeDesign(phrase: string, seed: string): string {
  const palette = PALETTES[parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 2), 16) % PALETTES.length];
  const rows = lines(phrase.toUpperCase());
  // Bold capitals are a little over half as wide as they are tall; fill about three-quarters of the width.
  const size = Math.max(90, Math.min(320, Math.floor(1500 / (0.6 * Math.max(...rows.map((r) => r.length), 1)))));
  const lead = size * 1.1;
  const top = 1000 - ((rows.length - 1) * lead) / 2 + size * 0.35;
  const text = rows
    .map((row, i) => `<text x="1000" y="${Math.round(top + i * lead)}" text-anchor="middle">${escape(row)}</text>`)
    .join("");
  const ruleY = Math.round(top + (rows.length - 1) * lead + size * 0.6);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" width="2000" height="2000">`,
    `<rect width="2000" height="2000" fill="${palette.bg}"/>`,
    `<g fill="${palette.ink}" font-family="Futura, 'Avenir Next', Helvetica, Arial, sans-serif" font-weight="800" font-size="${size}" letter-spacing="${Math.round(size * 0.04)}">${text}</g>`,
    `<rect x="760" y="${ruleY}" width="480" height="12" fill="${palette.accent}"/>`,
    `<circle cx="1000" cy="${ruleY + 90}" r="18" fill="${palette.accent}"/>`,
    `</svg>`,
  ].join("");
}
