import { SHAFT, WORLD_W, type FacilityLayout } from "../facility/layout";

// The 3D facility is a base seen from above, like a strategy game: every
// level is a wide floor ("plate") dug a step deeper into the ground than the
// one behind it. Plate 0 is the surface, plate 1 is B1, and so on. Rooms sit
// at the back of each plate, with a corridor along the front, and a lift
// drops from each corridor down to the next plate.
//
// Left-to-right positions come from the same layout as the 2D map, so rooms
// and walking routes line up with it. x runs left to right, y up (the
// surface is 0) and z toward the viewer.

export const UNIT = 0.1;
/** How far each level sits below the one behind it. */
export const DROP = 7;
/** Depth of the rooms at the back of a plate. */
export const ROOM_D = 12;
/** Depth of the corridor along the front of a plate. */
export const CORRIDOR_D = 5;
export const PLATE_D = ROOM_D + CORRIDOR_D;
/** Height of room walls: lower than the drop, so a band of rock shows above them. */
export const WALL_H = 5;
/** The lift tube stands just past the edge of a plate, over the next one down. */
export const LIFT_R = 1.6;
/** Half the width of the dug-out pit the plates sit in. */
export const PIT_X = 48;
const Z_ORIGIN = -PLATE_D * 1.5;

export function sceneX(x: number) {
  return (x - WORLD_W / 2) * UNIT;
}

export function sceneLength(px: number) {
  return px * UNIT;
}

export const SHAFT_X = sceneX(SHAFT.x + SHAFT.w / 2);
export const SHAFT_W = sceneLength(SHAFT.w);

export interface Plate {
  index: number;
  /** Floor height. */
  y: number;
  /** Back edge, against the rock (or the open ground for the surface). */
  zBack: number;
  /** Front edge, where the floor drops to the next plate. */
  zFront: number;
  /** Where the crew walk between rooms. */
  zCorridor: number;
  /** Where the crew stand inside a room. */
  zRoom: number;
}

export function plateAt(index: number): Plate {
  const zBack = Z_ORIGIN + index * PLATE_D;
  return {
    index,
    y: 0 - index * DROP,
    zBack,
    zFront: zBack + PLATE_D,
    zCorridor: zBack + ROOM_D + CORRIDOR_D / 2,
    zRoom: zBack + ROOM_D * 0.6,
  };
}

/** The surface plus one plate per level. */
export function platesFor(layout: FacilityLayout): Plate[] {
  return [0, ...layout.levels.map((l) => l.index + 1)].map(plateAt);
}

/** Plate of a room or walker on a layout level (-1 is the surface). */
export function plateOfLevel(level: number) {
  return plateAt(level + 1);
}

/**
 * The 2D walking height of each plate, in order: walkers on the 2D map ride
 * the shaft between these, and the 3D view turns that ride into a lift trip.
 */
export function liftStops(layout: FacilityLayout): number[] {
  const dock = [...layout.rooms.values()].find((r) => r.level === -1);
  const first = layout.levels[0]?.floorY ?? 0;
  return [dock?.floorY ?? first - 1, ...layout.levels.map((l) => l.floorY)];
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Where a crew member is during a lift ride, given their height on the 2D
 * map. A ride from one plate to the next goes forward off the corridor onto
 * the lift, down the drop, then back along the lane to the next corridor.
 * Returns null when they are standing on a plate rather than riding.
 */
export function liftPoint(y2d: number, stops: number[]): Point3 | null {
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (y2d <= a || y2d >= b) continue;
    const from = plateAt(i);
    const to = plateAt(i + 1);
    const liftZ = from.zFront + LIFT_R;
    const out = liftZ - from.zCorridor;
    const back = to.zCorridor - liftZ;
    let s = ((y2d - a) / (b - a)) * (out + DROP + back);
    if (s <= out) return { x: SHAFT_X, y: from.y, z: from.zCorridor + s };
    s -= out;
    if (s <= DROP) return { x: SHAFT_X, y: from.y - s, z: liftZ };
    s -= DROP;
    return { x: SHAFT_X, y: to.y, z: liftZ + s };
  }
  return null;
}

/** Index of the plate a 2D walking height belongs to (the nearest stop). */
export function plateOfY(y2d: number, stops: number[]) {
  let best = 0;
  stops.forEach((s, i) => {
    if (Math.abs(s - y2d) < Math.abs(stops[best] - y2d)) best = i;
  });
  return best;
}

function approach(value: number, goal: number, maxStep: number) {
  if (Math.abs(goal - value) <= maxStep) return goal;
  return value + Math.sign(goal - value) * maxStep;
}

/**
 * Move a crew member one step toward where they should be on a plate. They
 * leave a room by walking straight out to the corridor, walk along it, and
 * turn into the next room only when they are in front of it, so they never
 * walk through walls.
 */
export function walkOnPlate(pos: Point3, goal: Point3, corridorZ: number, maxStep: number): Point3 {
  const y = approach(pos.y, goal.y, maxStep);
  if (Math.abs(pos.x - goal.x) > 0.01) {
    if (Math.abs(pos.z - corridorZ) > 0.01) return { x: pos.x, y, z: approach(pos.z, corridorZ, maxStep) };
    return { x: approach(pos.x, goal.x, maxStep), y, z: pos.z };
  }
  return { x: goal.x, y, z: approach(pos.z, goal.z, maxStep) };
}

/** Move straight toward a point, at most maxStep. */
export function moveToward(pos: Point3, goal: Point3, maxStep: number): Point3 {
  const dx = goal.x - pos.x;
  const dy = goal.y - pos.y;
  const dz = goal.z - pos.z;
  const d = Math.hypot(dx, dy, dz);
  if (d <= maxStep) return { ...goal };
  const k = maxStep / d;
  return { x: pos.x + dx * k, y: pos.y + dy * k, z: pos.z + dz * k };
}
