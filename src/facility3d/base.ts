import * as THREE from "three";
import type { FacilityState } from "../core/types";
import type { FacilityLayout } from "../facility/layout";
import { CORRIDOR_D, DROP, LIFT_R, PIT_X, PLATE_D, platesFor, ROOM_D, SHAFT_X, WALL_H, type Plate } from "./coords";
import { box, dish, glow, label, place, plate, standard } from "./parts";
import { roomBounds } from "./rooms";
import { floorTexture, grassTexture, hazardTexture, rockBump, rockTexture, skyTexture } from "./textures";

// Everything in the 3D facility that isn't a room or a crew member: the
// lights, the night sky, the ground, the dug-out pit with its rock and steel,
// each level's floor and corridor, the lifts and the surface dock. Built once;
// the only motion is ambient (stars, lift pulses, the dock beacon), returned
// as ticks for the scene to run every frame.

/** How far the rock and ground reach beyond the pit on each side. */
const WORLD_HALF_W = 260;

export type Tick = (time: number) => void;

/** Add the base to a scene. Returns the ambient animations to run each frame. */
export function buildBase(scene: THREE.Scene, layout: FacilityLayout, state: FacilityState): Tick[] {
  const builder = new BaseBuilder(scene, layout);
  builder.buildLights();
  builder.buildSky();
  builder.buildGround();
  builder.buildPit();
  builder.buildPlates(state);
  builder.buildLifts();
  builder.buildDock();
  return builder.ambient;
}

/** The deepest point of the pit, below the lowest level. */
export function pitBottom(layout: FacilityLayout) {
  const plates = platesFor(layout);
  return plates[plates.length - 1].y - DROP - 3;
}

class BaseBuilder {
  readonly ambient: Tick[] = [];
  private plates: Plate[];
  private bottom: number;

  constructor(
    private scene: THREE.Scene,
    private layout: FacilityLayout,
  ) {
    this.plates = platesFor(layout);
    this.bottom = pitBottom(layout);
  }

  private get lastPlate() {
    return this.plates[this.plates.length - 1];
  }

  private add<T extends THREE.Object3D>(obj: T): T {
    this.scene.add(obj);
    return obj;
  }

  buildLights() {
    this.add(new THREE.AmbientLight(0x404a66, 1.1));
    this.add(new THREE.HemisphereLight(0x8090ff, 0x5a4030, 0.9));
    const moon = new THREE.DirectionalLight(0xaabbff, 1.3);
    moon.position.set(-60, 140, 60);
    this.add(moon);
    // A cool fill from the front so the drops and walls read clearly.
    const fill = new THREE.DirectionalLight(0x9fb4e0, 1.4);
    fill.position.set(30, 50, 160);
    this.add(fill);
  }

  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    sky.position.y = -2;
    this.add(sky);

    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42;
      positions[i * 3] = 560 * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = 560 * Math.cos(phi) + 10;
      positions[i * 3 + 2] = 560 * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true });
    this.add(new THREE.Points(geo, starMat));
    this.ambient.push((t) => (starMat.opacity = 0.75 + Math.sin(t * 0.7) * 0.2));

    const moon = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 16), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false }));
    this.add(place(moon, -180, 200, -460));
  }

  /** Grass over everything that isn't dug out, with hills and pines. */
  buildGround() {
    const pitBack = this.plates[0].zFront;
    const pitFront = this.lastPlate.zFront;
    const back = -420;
    const grass = (x0: number, x1: number, z0: number, z1: number) => {
      if (z1 - z0 < 0.01) return;
      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(x1 - x0, z1 - z0),
        standard("#ffffff", { map: grassTexture([(x1 - x0) / 8, (z1 - z0) / 8]), roughness: 1 }),
      );
      g.rotation.x = -Math.PI / 2;
      this.add(place(g, (x0 + x1) / 2, 0, (z0 + z1) / 2));
    };
    grass(-WORLD_HALF_W, WORLD_HALF_W, back, pitBack);
    grass(-WORLD_HALF_W, -PIT_X, pitBack, pitFront);
    grass(PIT_X, WORLD_HALF_W, pitBack, pitFront);
    // A turf lip along the cut, so the edge of the ground reads as soil.
    const turf = standard("#2f5a1c", { roughness: 1 });
    for (const [x0, x1] of [[-WORLD_HALF_W, -PIT_X], [PIT_X, WORLD_HALF_W]]) {
      this.add(place(box(x1 - x0, 0.5, 0.6, turf), (x0 + x1) / 2, -0.2, pitFront - 0.3));
      this.add(place(box(0.6, 0.5, pitFront - pitBack, turf), x0 === -WORLD_HALF_W ? x1 - 0.3 : x0 + 0.3, -0.2, (pitBack + pitFront) / 2));
    }

    const hillMat = standard("#0f1a12", { roughness: 1, flatShading: true });
    for (let i = 0; i < 16; i++) {
      const r = 34 + ((i * 53) % 44);
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.55, 7), hillMat);
      this.add(place(hill, -320 + i * 42 + ((i * 17) % 20), r * 0.27 - 1, back + 120 - ((i * 37) % 90)));
    }
    const trunk = standard("#3b2414", { roughness: 1 });
    const needles = standard("#14301c", { roughness: 1, flatShading: true });
    const dock = this.dockBounds();
    for (let i = 0; i < 140; i++) {
      const x = -150 + ((i * 97.3) % 300);
      const z = this.plates[0].zBack - 120 + ((i * 61.7) % (pitFront - this.plates[0].zBack + 115));
      // Keep trees out of the pit and off the dock's apron.
      if (Math.abs(x) < PIT_X + 4 && z > pitBack - 3) continue;
      if (dock && x > dock.x0 - 26 && x < dock.x1 + 26 && z > dock.z0 - 10) continue;
      const s = 0.9 + ((i * 13) % 10) / 10;
      const tree = new THREE.Group();
      tree.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), trunk), 0, 0.8, 0));
      tree.add(place(new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 7), needles), 0, 2.6, 0));
      tree.add(place(new THREE.Mesh(new THREE.ConeGeometry(1, 2.2, 7), needles), 0, 3.8, 0));
      tree.scale.setScalar(s);
      tree.rotation.y = i;
      this.add(place(tree, x, 0, z));
    }
  }

  private dockBounds() {
    const rl = [...this.layout.rooms.values()].find((r) => r.level === -1);
    return rl ? roomBounds(rl) : null;
  }

  private rock(w: number, h: number) {
    return standard("#ffffff", {
      map: rockTexture([w / 14, h / 14]),
      bumpMap: rockBump([w / 7, h / 7]),
      bumpScale: 2,
      roughness: 0.95,
      metalness: 0,
    });
  }

  /**
   * The dug-out pit: a stepped block of rock under each plate, the pit walls
   * either side, and the cut face at the front showing the layers of earth.
   */
  buildPit() {
    const pitBack = this.plates[0].zFront;
    const pitFront = this.lastPlate.zFront;
    const tall = -this.bottom;

    // One block under each plate. Its front face is the drop to the next level.
    this.plates.forEach((p, i) => {
      const z0 = i === 0 ? p.zBack - 30 : p.zBack;
      const h = p.y - this.bottom;
      const top = i === 0 ? -0.05 : p.y - 0.3;
      this.add(place(box(PIT_X * 2, top - this.bottom, p.zFront - z0, this.rock(PIT_X * 2, h)), 0, (top + this.bottom) / 2, (z0 + p.zFront) / 2));
    });

    // Rock either side of the pit, its front face cut away to show the earth.
    const sideW = WORLD_HALF_W - PIT_X;
    for (const side of [-1, 1]) {
      const cx = side * (PIT_X + sideW / 2);
      this.add(place(box(sideW, tall - 0.05, pitFront - pitBack, this.rock(sideW, tall)), cx, (this.bottom - 0.05) / 2, (pitBack + pitFront) / 2));
      // The pit wall facing in, with its own texture so it isn't stretched.
      this.add(place(box(0.4, tall, pitFront - pitBack, this.rock(pitFront - pitBack, tall)), side * (PIT_X + 0.2), this.bottom / 2, (pitBack + pitFront) / 2));
    }

    // Steel ribs holding the pit walls and the drops, with a beam along each edge.
    const steel = standard("#3b4250", { metalness: 0.9, roughness: 0.35 });
    const ribs: THREE.Matrix4[] = [];
    const m = () => new THREE.Matrix4();
    for (const p of this.plates.slice(1)) {
      for (const side of [-1, 1]) {
        for (let z = p.zBack + 2; z < p.zFront - 1; z += 5) ribs.push(m().compose(new THREE.Vector3(side * (PIT_X - 0.15), p.y + 3.5, z), new THREE.Quaternion(), new THREE.Vector3(0.5, 7, 0.5)));
      }
    }
    // On the drops, only the band of rock above the room walls of the level below shows.
    const band = DROP - WALL_H;
    this.plates.slice(0, -1).forEach((p) => {
      for (let x = -PIT_X + 2; x < PIT_X; x += 8) {
        if (Math.abs(x - SHAFT_X) < LIFT_R + 1.5) continue;
        ribs.push(m().compose(new THREE.Vector3(x, p.y - band / 2, p.zFront + 0.2), new THREE.Quaternion(), new THREE.Vector3(0.6, band, 0.4)));
      }
    });
    const ribMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steel, ribs.length);
    ribs.forEach((r, i) => ribMesh.setMatrixAt(i, r));
    this.add(ribMesh);

    // Glowing crystals in the exposed rock: drops, pit walls and the cut face.
    const crystalMats = [glow(0x38bdf8, 2.2), glow(0xa855f7, 2.2)];
    const crystal = (x: number, y: number, z: number, i: number) => {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.25 + (i % 4) * 0.12), crystalMats[i % 2]);
      c.rotation.set(i, i * 2, i * 3);
      c.scale.y = 2;
      this.add(place(c, x, y, z));
    };
    this.plates.slice(0, -1).forEach((p, k) => {
      for (let i = 0; i < 10; i++) {
        const x = -PIT_X + 2 + ((i * 37.7 + k * 13) % (PIT_X * 2 - 4));
        if (Math.abs(x - SHAFT_X) < 3) continue;
        crystal(x, p.y - 0.5 - ((i * 0.7) % (band - 1)), p.zFront + 0.25, i + k);
      }
    });
    for (let i = 0; i < 60; i++) {
      const x = -WORLD_HALF_W * 0.6 + ((i * 113.7) % (WORLD_HALF_W * 1.2));
      const y = -1.5 - ((i * 7.3) % (tall - 3));
      const onPlate = Math.abs(x) < PIT_X && y > this.lastPlate.y - 1;
      if (!onPlate) crystal(x, y, pitFront + 0.1, i);
    }
    this.plates.slice(1).forEach((p, k) => {
      for (let i = 0; i < 8; i++) {
        const z = p.zBack + 1 + ((i * 5.3) % (PLATE_D - 2));
        crystal((i % 2 ? 1 : -1) * (PIT_X - 0.05), -1 - ((i * 3.1 + k) % (-p.y - 2)), z, i + k);
      }
    });
  }

  /** Each plate's floor, corridor, edge and name. */
  buildPlates(state: FacilityState) {
    const grating = standard("#ffffff", { map: floorTexture([PIT_X / 2, CORRIDOR_D / 2]), metalness: 0.6, roughness: 0.5 });
    const floorMat = standard("#ffffff", { map: floorTexture([PIT_X / 3, ROOM_D / 3]), metalness: 0.5, roughness: 0.6, color: "#8a919c" });
    const hazard = standard("#ffffff", { map: hazardTexture([PIT_X / 1.5, 1]) });
    const railMat = standard("#64748b", { metalness: 0.9, roughness: 0.3 });

    this.plates.forEach((p, i) => {
      const level = this.layout.levels[i - 1];
      const wing = level && state.wings.find((w) => w.id === level.wingId);
      const colour = wing?.sealed ? "#71717a" : (wing?.color ?? "#38bdf8");
      const corridorZ0 = p.zBack + ROOM_D;
      if (i > 0) {
        // Floor under the rooms, and the corridor grating in front of them.
        this.add(place(box(PIT_X * 2, 0.3, ROOM_D, floorMat), 0, p.y - 0.17, p.zBack + ROOM_D / 2));
        this.add(place(box(PIT_X * 2, 0.3, CORRIDOR_D, grating), 0, p.y - 0.15, corridorZ0 + CORRIDOR_D / 2));
        // A guide line in the wing's colour down the corridor.
        this.add(place(box(PIT_X * 2 - 2, 0.04, 0.12, glow(colour, wing?.sealed ? 0.4 : 1.4)), 0, p.y + 0.02, corridorZ0 + 0.4));
        // The level's name painted on the corridor floor.
        const name = plate(`B${i} · ${wing?.name.toUpperCase() ?? ""}`, 2.2, { color: colour, background: "rgba(2,6,23,0.85)", border: colour });
        name.rotation.x = -Math.PI / 2;
        const nw = (name.geometry as THREE.PlaneGeometry).parameters.width;
        this.add(place(name, -PIT_X + 1.5 + nw / 2, p.y + 0.03, p.zCorridor + 0.5));
        // The lane from the lift above to this corridor.
        const laneZ0 = p.zBack + LIFT_R * 2;
        const lane = box(2.6, 0.04, p.zCorridor - laneZ0, standard("#1e293b", { metalness: 0.6 }));
        this.add(place(lane, SHAFT_X, p.y + 0.02, (laneZ0 + p.zCorridor) / 2));
        for (const dx of [-1.3, 1.3]) {
          this.add(place(box(0.08, 0.05, p.zCorridor - laneZ0, glow(0x38bdf8, 1.2)), SHAFT_X + dx, p.y + 0.04, (laneZ0 + p.zCorridor) / 2));
        }
      } else {
        // The concrete apron in front of the surface dock.
        this.add(place(box(30, 0.2, p.zFront - p.zBack + 4, standard("#3f3f46", { roughness: 0.9 })), SHAFT_X, 0.02, (p.zBack - 4 + p.zFront) / 2));
      }

      // Hazard edge and a railing along the drop (open where the lift is).
      const edgeY = p.y + 0.03;
      this.add(place(box(PIT_X * 2, 0.06, 0.6, hazard), 0, edgeY, p.zFront - 0.3));
      const railZ = p.zFront - 0.15;
      for (const [x0, x1] of [[-PIT_X, SHAFT_X - LIFT_R - 0.4], [SHAFT_X + LIFT_R + 0.4, PIT_X]]) {
        this.add(place(box(x1 - x0, 0.08, 0.08, railMat), (x0 + x1) / 2, p.y + 1.1, railZ));
        this.add(place(box(x1 - x0, 0.06, 0.06, railMat), (x0 + x1) / 2, p.y + 0.6, railZ));
        for (let x = x0; x <= x1 + 0.01; x += 3) this.add(place(box(0.1, 1.1, 0.1, railMat), x, p.y + 0.55, railZ));
      }
    });
  }

  /** A glass lift at each drop, from one corridor down to the next. */
  buildLifts() {
    const frame = standard("#334155", { metalness: 0.9, roughness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i + 1 < this.plates.length; i++) {
      const from = this.plates[i];
      const to = this.plates[i + 1];
      const z = from.zFront + LIFT_R;
      const top = from.y + 2.8;
      const h = top - to.y;
      const cy = (top + to.y) / 2;
      this.add(place(new THREE.Mesh(new THREE.CylinderGeometry(LIFT_R, LIFT_R, h, 28, 1, true), glass), SHAFT_X, cy, z));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        this.add(place(box(0.18, h, 0.18, frame), SHAFT_X + Math.cos(a) * LIFT_R, cy, z + Math.sin(a) * LIFT_R));
      }
      const rim = glow(0x38bdf8, 2);
      for (const y of [top, from.y + 0.05, to.y + 0.05]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(LIFT_R, 0.09, 8, 36), y === top ? rim : frame);
        ring.rotation.x = Math.PI / 2;
        this.add(place(ring, SHAFT_X, y, z));
      }
      // A walkway from the corridor edge out to the lift.
      this.add(place(box(2.6, 0.2, LIFT_R, frame), SHAFT_X, from.y - 0.1, from.zFront + LIFT_R / 2));
      this.add(place(label("LIFT", 0.6, { color: "#7dd3fc", background: "rgba(2,6,23,0.8)", size: 40 }), SHAFT_X, top + 0.9, z));
      // Light pulses running down the tube.
      const pulses: THREE.Mesh[] = [];
      for (let k = 0; k < 2; k++) {
        const p = new THREE.Mesh(new THREE.TorusGeometry(LIFT_R * 0.92, 0.05, 6, 32), glow(0x7dd3fc, 3));
        p.rotation.x = Math.PI / 2;
        pulses.push(p);
        this.add(place(p, SHAFT_X, top, z));
      }
      this.ambient.push((t) => pulses.forEach((p, k) => (p.position.y = top - ((t * 3 + (k * h) / 2) % h))));
    }
  }

  /** Antenna, beacon, landing pad and dish around the surface dock. */
  buildDock() {
    const b = this.dockBounds();
    if (!b) return;
    const metal = standard("#334155", { metalness: 0.85, roughness: 0.35 });
    this.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 7, 8), metal), b.x1 - 1.2, 3.5, b.z0 + 1.2));
    const beacon = glow(0xff2020, 3);
    this.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), beacon), b.x1 - 1.2, 7.1, b.z0 + 1.2));
    const beaconLight = this.add(place(new THREE.PointLight(0xff3030, 20, 16, 1.5), b.x1 - 1.2, 7.1, b.z0 + 1.2));
    // Landing pad beside the dock.
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.8, 0.3, 40), standard("#27272a", { metalness: 0.5 }));
    this.add(place(pad, b.x1 + 9, 0.15, b.cz));
    const padRing = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.1, 6, 48), glow(0xf59e0b, 2));
    padRing.rotation.x = Math.PI / 2;
    this.add(place(padRing, b.x1 + 9, 0.35, b.cz));
    const padMark = plate("H", 3, { color: "#f59e0b" });
    padMark.rotation.x = -Math.PI / 2;
    this.add(place(padMark, b.x1 + 9, 0.32, b.cz));
    const dishMast = new THREE.Group();
    dishMast.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 3, 8), metal), 0, 1.5, 0));
    const bowl = dish(2.2, 0.8, standard("#aab4c3", { metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }));
    bowl.rotation.x = 0.45;
    bowl.position.y = 3.2;
    dishMast.add(bowl);
    this.add(place(dishMast, b.x0 - 8, 0, b.cz));
    this.ambient.push((t) => {
      const on = Math.sin(t * 4) > 0;
      beacon.emissiveIntensity = on ? 4 : 0.2;
      beaconLight.intensity = on ? 20 : 0;
      dishMast.rotation.y = Math.sin(t * 0.25) * 0.8;
      padRing.material.emissiveIntensity = 1.2 + Math.sin(t * 2) * 0.8;
    });
  }
}
