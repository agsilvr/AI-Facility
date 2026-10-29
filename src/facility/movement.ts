import { SHAFT } from "./layout";

export interface Walker {
  x: number;
  y: number;
  level: number;
  /** -1 facing left, 1 facing right. */
  facing: number;
  moving: boolean;
}

export interface Target {
  x: number;
  y: number;
  level: number;
}

const WALK_SPEED = 70;
const LIFT_SPEED = 120;
const SHAFT_X = SHAFT.x + SHAFT.w / 2;

function approach(value: number, goal: number, maxStep: number) {
  if (Math.abs(goal - value) <= maxStep) return goal;
  return value + Math.sign(goal - value) * maxStep;
}

/**
 * Move a walker one frame toward its target. Agents walk along their level's
 * corridor, and take the central shaft to change levels.
 */
export function step(walker: Walker, target: Target, dt: number): Walker {
  let { x, y, level, facing } = walker;

  if (level === target.level) {
    const nx = approach(x, target.x, WALK_SPEED * dt);
    if (nx !== x) facing = Math.sign(nx - x);
    x = nx;
    y = approach(y, target.y, LIFT_SPEED * dt);
  } else if (Math.abs(x - SHAFT_X) > 0.5) {
    const nx = approach(x, SHAFT_X, WALK_SPEED * dt);
    facing = Math.sign(nx - x) || facing;
    x = nx;
  } else {
    y = approach(y, target.y, LIFT_SPEED * dt);
    if (y === target.y) level = target.level;
  }

  const moving = x !== walker.x || y !== walker.y;
  return { x, y, level, facing, moving };
}
