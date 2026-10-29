import type { RoomId } from "../core/types";
import { roomAt, type FacilityLayout, type Point } from "./layout";

// How the crew get around: out of a room through its door, along the main
// hall, and in through the next room's door. Every leg is straight up, down,
// left or right, like an old-school game, and nobody walks through a wall.

export type Facing = "up" | "down" | "left" | "right";

export interface Walker {
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  /** Corners still to walk through, in order. */
  path: Point[];
  /** Where the current path leads, so a new target means a new path. */
  goal: Target | null;
}

export interface Target {
  roomId: RoomId;
  x: number;
  y: number;
}

/** Pixels per second: three floor tiles. */
export const WALK_SPEED = 48;

export function placeWalker(target: Target): Walker {
  return { x: target.x, y: target.y, facing: "down", moving: false, path: [], goal: target };
}

/**
 * The corners of the walk from where someone stands to a spot in a room.
 * Inside a room they line up with the door first; in the hall they keep to
 * the walking lane.
 */
export function route(layout: FacilityLayout, from: Point, target: Target): Point[] {
  const here = roomAt(layout, from);
  const there = layout.rooms.get(target.roomId);
  if (!there) return [];
  const spot = { x: target.x, y: target.y };
  if (here?.roomId === target.roomId) return lShape(from, spot);

  const points: Point[] = [];
  if (here) {
    points.push({ x: here.door.inside.x, y: from.y }, here.door.inside, here.door.outside);
  } else if (from.y !== layout.laneY) {
    points.push({ x: from.x, y: layout.laneY });
  }
  points.push(there.door.outside, there.door.inside, { x: there.door.inside.x, y: spot.y }, spot);
  return dedupe(points);
}

/** Walk across a room: sideways first, then up or down. */
function lShape(from: Point, to: Point): Point[] {
  return dedupe([{ x: to.x, y: from.y }, to]);
}

function dedupe(points: Point[]) {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
}

/** Move a walker one frame toward their target, choosing a new route when the target changes. */
export function step(layout: FacilityLayout, walker: Walker, target: Target, dt: number, restFacing: Facing = "down"): Walker {
  let { x, y, facing, path } = walker;
  const sameGoal = walker.goal && walker.goal.roomId === target.roomId && walker.goal.x === target.x && walker.goal.y === target.y;
  if (!sameGoal) path = route(layout, { x, y }, target);

  let budget = WALK_SPEED * dt;
  path = [...path];
  while (budget > 0 && path.length > 0) {
    const next = path[0];
    const dx = next.x - x;
    const dy = next.y - y;
    const d = Math.abs(dx) + Math.abs(dy);
    if (d > 0) facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    if (d <= budget) {
      x = next.x;
      y = next.y;
      budget -= d;
      path.shift();
    } else {
      // Legs are straight, so only one of dx and dy is non-zero.
      x += Math.sign(dx) * Math.min(Math.abs(dx), budget);
      y += Math.sign(dy) * Math.min(Math.abs(dy), budget);
      budget = 0;
    }
  }
  const moving = x !== walker.x || y !== walker.y;
  return { x, y, facing: moving ? facing : restFacing, moving, path, goal: target };
}
