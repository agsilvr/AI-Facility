// Camera and quality decisions for the 3D view, kept free of three.js so
// they can be unit tested.

/** A stretch of floor to look at, and how tall the things standing on it are. */
export interface Area {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Floor height. */
  y: number;
  /** Height of walls and furniture on the floor. */
  h: number;
}

/** The default camera angle: looking down at about 45°, turned a little to the right. */
export const ELEVATION = 0.78;
export const AZIMUTH = 0.3;

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
 * Where to put the camera to look down at a stretch of floor from above and
 * in front, at the given angle, with some margin around it.
 */
export function focusOn(area: Area, fovDeg: number, aspect: number, margin = 1.3, elevation = ELEVATION, azimuth = AZIMUTH): Focus {
  const cx = (area.x0 + area.x1) / 2;
  const cz = (area.z0 + area.z1) / 2;
  const cy = area.y + area.h * 0.3;
  const w = area.x1 - area.x0;
  const d = area.z1 - area.z0;
  const sinA = Math.abs(Math.sin(azimuth));
  const cosA = Math.abs(Math.cos(azimuth));
  // From above, depth is foreshortened and anything standing up leans into view.
  const across = w * cosA + d * sinA;
  const along = (d * cosA + w * sinA) * Math.sin(elevation) + area.h * Math.cos(elevation);
  const dist = fitDistance(fovDeg, aspect, across * margin, along * margin);
  const flat = dist * Math.cos(elevation);
  return {
    target: [cx, cy, cz],
    position: [cx + flat * Math.sin(azimuth), cy + dist * Math.sin(elevation), cz + flat * Math.cos(azimuth)],
  };
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
