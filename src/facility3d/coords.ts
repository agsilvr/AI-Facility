import { SHAFT, WORLD_W } from "../facility/layout";

// The 3D facility is built from the same layout as the 2D map, so rooms,
// walking routes and the lift line up exactly. Layout pixels become scene
// units here: x runs left to right, y up (ground level is 0), z toward the
// viewer. The facility is a cut-away: rooms are open at the front.

export const UNIT = 0.1;
/** Layout y of the ground surface. */
export const GROUND_Y = 104;
/** Back wall of every room. */
export const BACK_Z = -6;
/** Open front edge of every room. */
export const FRONT_Z = 4;
/** Where the crew walks, a little in front of centre. */
export const WALK_Z = 1;

export function sceneX(x: number) {
  return (x - WORLD_W / 2) * UNIT;
}

export function sceneY(y: number) {
  return (GROUND_Y - y) * UNIT;
}

export function sceneLength(px: number) {
  return px * UNIT;
}

export const SHAFT_SCENE = { x: sceneX(SHAFT.x + SHAFT.w / 2), w: sceneLength(SHAFT.w) };
