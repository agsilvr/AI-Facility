import type { Agent } from "../core/types";
import type { FacilityLayout } from "../facility/layout";
import { step, type Target, type Walker } from "../facility/movement";
import { liftPoint, liftStops, moveToward, plateOfY, platesFor, sceneX, SHAFT_X, walkOnPlate, type Plate, type Point3 } from "./coords";
import type { Pose } from "./crew";

// Where each crew member is in the 3D base, frame by frame. The 2D map's
// walkers decide where everyone is going (so both views agree); this turns
// each walker into a place on the plates: riding the 2D shaft becomes a lift
// trip, and on a plate the crew walk out of a room to the corridor, along it
// and into the next room. Plain numbers only, so it is unit tested.

/** Crew walk a little faster than the 2D map so they keep up after turning corners. */
const WALK_SPEED = 10;
/** How fast a crew member who fell behind catches up with a lift ride. */
const CATCH_UP_SPEED = 25;
/** Further than this from where they should be (say, after a reload), just put them there. */
const SNAP_DISTANCE = 60;

interface Placement {
  at: Point3;
  heading: number;
}

export class CrewMotion {
  private walkers = new Map<string, Walker>();
  private placements = new Map<string, Placement>();
  private plates: Plate[];
  private stops: number[];

  constructor(layout: FacilityLayout) {
    this.plates = platesFor(layout);
    this.stops = liftStops(layout);
  }

  /** Where a crew member is right now, if they have been placed yet. */
  positionOf(agentId: string): Point3 | undefined {
    return this.placements.get(agentId)?.at;
  }

  /** Move a crew member one frame toward their target and say how to draw them. */
  advance(agent: Agent, target: Target, dt: number): Pose {
    const walker = step(this.walkers.get(agent.id) ?? { ...target, facing: 1, moving: false }, target, dt);
    this.walkers.set(agent.id, walker);

    const prev = this.placements.get(agent.id);
    const plate = this.plates[plateOfY(walker.y, this.stops)];
    const lift = liftPoint(walker.y, this.stops);
    let at: Point3;
    if (lift) {
      at = prev && distance(prev.at, lift) < 20 ? moveToward(prev.at, lift, CATCH_UP_SPEED * dt) : lift;
    } else {
      const goal = { x: sceneX(walker.x), y: plate.y, z: walker.moving ? plate.zCorridor : plate.zRoom };
      if (!prev || distance(prev.at, goal) > SNAP_DISTANCE) at = goal;
      // Just off the lift: finish the ride to the corridor first.
      else if (Math.abs(prev.at.y - plate.y) > 0.01) at = moveToward(prev.at, { x: SHAFT_X, y: plate.y, z: plate.zCorridor }, CATCH_UP_SPEED * dt);
      else at = walkOnPlate(prev.at, goal, plate.zCorridor, WALK_SPEED * dt);
    }

    const dx = prev ? at.x - prev.at.x : 0;
    const dz = prev ? at.z - prev.at.z : 0;
    const moved = prev ? distance(prev.at, at) > 1e-4 : false;
    const riding = !!lift || Math.abs(at.y - plate.y) > 0.01;
    // Face the way they walk; at rest face the work in front of them, or the viewer.
    const rest = agent.status === "working" ? Math.PI : 0;
    const heading = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : riding ? (prev?.heading ?? 0) : rest;
    this.placements.set(agent.id, { at, heading });
    return { ...at, heading, walking: moved && !riding, riding };
  }
}

function distance(a: Point3, b: Point3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
