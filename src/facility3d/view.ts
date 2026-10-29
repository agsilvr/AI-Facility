// Camera and quality decisions for the 3D view, kept free of three.js so
// they can be unit tested.

export interface Box2 {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

/** Camera distance at which a box of the given size fills the view. */
export function fitDistance(fovDeg: number, aspect: number, width: number, height: number) {
  const tan = Math.tan((fovDeg * Math.PI) / 360);
  return Math.max(height / (2 * tan), width / (2 * tan * aspect));
}

export interface Focus {
  target: [number, number, number];
  position: [number, number, number];
}

/**
 * Where to put the camera to look at a box: straight on, a little from the
 * right and above, like the default view, with some margin around it.
 */
export function focusOn(box: Box2, fovDeg: number, aspect: number, margin = 1.35): Focus {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.top + box.bottom) / 2;
  const d = fitDistance(fovDeg, aspect, (box.x1 - box.x0) * margin, (box.top - box.bottom) * margin);
  return { target: [cx, cy, 0], position: [cx + d * 0.13, cy + d * 0.07, d] };
}

/** Smooth start and stop for camera moves. t runs from 0 to 1. */
export function easeInOut(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

/**
 * Quality levels, best first. When frames come too slowly the view steps
 * down a level rather than stuttering: first sharper pixels go, then glow.
 */
export const QUALITY = [
  { pixelRatio: 2, bloom: true },
  { pixelRatio: 1.25, bloom: true },
  { pixelRatio: 1, bloom: false },
  { pixelRatio: 0.75, bloom: false },
] as const;

export const MIN_FPS = 28;

/** The quality level to use next, given the frame rate measured at the current one. */
export function nextQuality(level: number, fps: number) {
  return fps < MIN_FPS ? Math.min(level + 1, QUALITY.length - 1) : level;
}

/** Frame-rate meter over a window of a couple of seconds. */
export class FrameMeter {
  private frames = 0;
  private elapsed = 0;

  constructor(private windowSeconds = 2) {}

  /** Add a frame; returns the average fps once a full window has passed, else null. */
  add(dt: number): number | null {
    this.frames += 1;
    this.elapsed += dt;
    if (this.elapsed < this.windowSeconds) return null;
    const fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    return fps;
  }
}
