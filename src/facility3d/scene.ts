import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { completedCount } from "../core/ledger";
import type { Agent, FacilityState } from "../core/types";
import type { FacilityLayout } from "../facility/layout";
import { step, type Walker } from "../facility/movement";
import { pendingApprovals, roomNeedsAttention, tasksInRoom, type Selection } from "../facility/status";
import { targetFor } from "../facility/targets";
import {
  CORRIDOR_D,
  DROP,
  LIFT_R,
  liftPoint,
  liftStops,
  moveToward,
  PIT_X,
  PLATE_D,
  plateOfY,
  platesFor,
  ROOM_D,
  sceneX,
  SHAFT_X,
  walkOnPlate,
  WALL_H,
  type Plate,
  type Point3,
} from "./coords";
import { buildCrew, type CrewView, type Pose } from "./crew";
import { box, dish, disposeTree, glow, label, place, plate, standard } from "./parts";
import { buildRoom, roomBounds, type RoomView } from "./rooms";
import { floorTexture, grassTexture, hazardTexture, rockBump, rockTexture, skyTexture } from "./textures";
import { AZIMUTH, easeInOut, ELEVATION, focusOn, FrameMeter, nextQuality, QUALITY, type Area } from "./view";

// The 3D facility, seen from above like a base-building game: each level is a
// wide floor dug a step deeper into the ground than the one behind it, with
// rooms along the back, a corridor along the front and a glass lift down each
// drop. It is drawn from the same layout and ledger state as the 2D map, and
// only shows what the ledger records (plus ambient motion like bubbles and
// blinking lights).

const FLY_SECONDS = 0.9;
/** How far the rock and ground reach beyond the pit on each side. */
const WORLD_HALF_W = 260;
/** Crew walk a little faster than the 2D map so they keep up after turning corners. */
const WALK_SPEED = 10;
/** How fast a crew member who fell behind catches up with a lift ride. */
const CATCH_UP_SPEED = 25;
/** Room around the whole base in the overview; the near edge looks bigger in perspective. */
const OVERVIEW_MARGIN = 1.15;

interface Flight {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
}

interface Placement {
  at: Point3;
  heading: number;
}

export class FacilityScene {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: MapControls;
  private rooms: RoomView[] = [];
  private crew = new Map<string, CrewView>();
  private walkers = new Map<string, Walker>();
  private placements = new Map<string, Placement>();
  private ambient: ((time: number) => void)[] = [];
  private raycaster = new THREE.Raycaster();
  private plates: Plate[];
  private stops: number[];
  private bottom: number;
  private aspect = 1;
  private flight: Flight | null = null;
  private hovered: Selection | null = null;
  private quality = 0;
  private meter = new FrameMeter(2);
  private size = { width: 1, height: 1 };

  constructor(
    canvas: HTMLCanvasElement,
    private layout: FacilityLayout,
    state: FacilityState,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.plates = platesFor(layout);
    this.stops = liftStops(layout);
    this.bottom = this.lastPlate.y - DROP - 3;
    this.scene.background = new THREE.Color(0x04050a);
    this.scene.fog = new THREE.Fog(0x04050a, 260, 620);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 1400);
    // Map-style controls: drag to move around, right-drag or two fingers to turn.
    this.controls = new MapControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minAzimuthAngle = -1.2;
    this.controls.maxAzimuthAngle = 1.2;
    this.controls.minPolarAngle = 0.3;
    this.controls.maxPolarAngle = 1.2;
    this.controls.minDistance = 10;
    this.controls.zoomToCursor = true;
    // Any touch of the controls takes over from an automatic camera move.
    this.controls.addEventListener("start", () => (this.flight = null));

    this.buildLights();
    this.buildSky();
    this.buildGround();
    this.buildPit();
    this.buildPlates(state);
    this.buildLifts();
    this.buildDock();

    for (const room of state.rooms) {
      const rl = layout.rooms.get(room.id);
      if (!rl) continue;
      const wing = state.wings.find((w) => w.id === room.wingId);
      const view = buildRoom(room, rl, wing?.color ?? "#94a3b8");
      this.rooms.push(view);
      this.scene.add(view.group);
    }

    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.85);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.applyQuality();
  }

  private get lastPlate() {
    return this.plates[this.plates.length - 1];
  }

  resize(width: number, height: number) {
    this.size = { width, height };
    this.aspect = width / height;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width / 2, height / 2);
    const f = focusOn(this.overviewArea(), this.camera.fov, this.aspect, OVERVIEW_MARGIN);
    const far = Math.hypot(f.position[0] - f.target[0], f.position[1] - f.target[1], f.position[2] - f.target[2]);
    this.controls.maxDistance = far * 1.6;
  }

  /** The whole base: the surface dock down to the deepest level. */
  private overviewArea(): Area {
    return { x0: -PIT_X, x1: PIT_X, z0: this.plates[0].zBack - 2, z1: this.lastPlate.zFront, y: this.lastPlate.y / 2, h: WALL_H };
  }

  /** Jump straight to the overview, without flying (used on first show). */
  resetView() {
    const f = focusOn(this.overviewArea(), this.camera.fov, this.aspect, OVERVIEW_MARGIN);
    this.flight = null;
    this.camera.position.set(...f.position);
    this.controls.target.set(...f.target);
    this.controls.update();
  }

  /** Fly back to the view of the whole facility, at the default angle. */
  overview() {
    this.flyTo(this.overviewArea(), OVERVIEW_MARGIN, false);
  }

  /**
   * Fly to one level of the facility. Levels are much wider than deep, so on
   * narrower screens frame the middle and let the ends run off the sides
   * (drag to move along it) rather than shrinking the rooms to fit.
   */
  focusLevel(index: number) {
    const p = this.plates[index + 1];
    if (!p) return;
    const half = Math.min(PIT_X, Math.max(20, PLATE_D * 1.5 * this.aspect));
    this.flyTo({ x0: SHAFT_X - half, x1: SHAFT_X + half, z0: p.zBack, z1: p.zFront, y: p.y, h: WALL_H }, 1.05);
  }

  /** Fly to whatever is selected: a room, or the room a crew member is in. */
  focus(selection: Selection) {
    if (selection.kind === "room") {
      const room = this.rooms.find((r) => r.roomId === selection.id);
      if (room) this.flyTo(room.bounds, 1.4);
      return;
    }
    const at = this.placements.get(selection.id)?.at;
    if (!at) return;
    this.flyTo({ x0: at.x - 7, x1: at.x + 7, z0: at.z - 6, z1: at.z + 4, y: at.y, h: 4 }, 1);
  }

  /** Fly the camera to an area; by default keep the angle the owner turned it to. */
  private flyTo(area: Area, margin: number, keepAngle = true) {
    const elevation = keepAngle ? Math.PI / 2 - this.controls.getPolarAngle() : ELEVATION;
    const azimuth = keepAngle ? this.controls.getAzimuthalAngle() : AZIMUTH;
    const f = focusOn(area, this.camera.fov, this.aspect, margin, elevation, azimuth);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      this.flight = null;
      this.camera.position.set(...f.position);
      this.controls.target.set(...f.target);
      return;
    }
    this.flight = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPos: new THREE.Vector3(...f.position),
      toTarget: new THREE.Vector3(...f.target),
      t: 0,
    };
  }

  /** Set what the pointer is over, so it can be highlighted. */
  setHover(selection: Selection | null) {
    this.hovered = selection;
  }

  frame(state: FacilityState, selection: Selection | null, time: number, dt: number) {
    const completed = completedCount(state);
    const pending = pendingApprovals(state);
    const isOn = (kind: Selection["kind"], id: string, s: Selection | null) => s?.kind === kind && s.id === id;
    for (const view of this.rooms) {
      const room = state.rooms.find((r) => r.id === view.roomId);
      if (!room) continue;
      view.update({
        time,
        state,
        alert: roomNeedsAttention(state, room),
        busy: tasksInRoom(state, room.id),
        completed,
        pending,
        selected: isOn("room", room.id, selection),
        hovered: isOn("room", room.id, this.hovered),
      });
    }

    for (const agent of state.agents) {
      const target = targetFor(state, this.layout, agent.id);
      if (!target) continue;
      const current = this.walkers.get(agent.id) ?? { ...target, facing: 1, moving: false };
      const next = step(current, target, dt);
      this.walkers.set(agent.id, next);
      let view = this.crew.get(agent.id);
      if (!view) {
        view = buildCrew(agent);
        view.group.userData = { kind: "agent", id: agent.id };
        this.crew.set(agent.id, view);
        this.scene.add(view.group);
      }
      const pose = this.poseFor(agent, next, dt);
      view.update(agent, pose, state, time, isOn("agent", agent.id, selection), isOn("agent", agent.id, this.hovered));
    }

    for (const tick of this.ambient) tick(time);

    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / FLY_SECONDS);
      const k = easeInOut(f.t);
      this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
      if (f.t >= 1) this.flight = null;
    }
    this.keepInBounds();
    this.controls.update();

    const fps = this.meter.add(dt);
    if (fps !== null) {
      const next = nextQuality(this.quality, fps);
      if (next !== this.quality) {
        this.quality = next;
        this.applyQuality();
      }
    }
    if (QUALITY[this.quality].bloom) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  /**
   * Turn a walker on the 2D map into a place in the 3D base. Riding the
   * shaft becomes a trip on the lift; on a plate the crew walk out of a room
   * to the corridor, along it, and into the next room.
   */
  private poseFor(agent: Agent, walker: Walker, dt: number): Pose {
    const prev = this.placements.get(agent.id);
    const lift = liftPoint(walker.y, this.stops);
    let at: Point3;
    if (lift) {
      at = prev && dist(prev.at, lift) < 20 ? moveToward(prev.at, lift, CATCH_UP_SPEED * dt) : lift;
    } else {
      const p = this.plates[plateOfY(walker.y, this.stops)];
      const goal = { x: sceneX(walker.x), y: p.y, z: walker.moving ? p.zCorridor : p.zRoom };
      if (!prev || dist(prev.at, goal) > 60) at = goal;
      // Just off the lift: finish the ride to the corridor first.
      else if (Math.abs(prev.at.y - p.y) > 0.01) at = moveToward(prev.at, { x: SHAFT_X, y: p.y, z: p.zCorridor }, CATCH_UP_SPEED * dt);
      else at = walkOnPlate(prev.at, goal, p.zCorridor, WALK_SPEED * dt);
    }
    const dx = prev ? at.x - prev.at.x : 0;
    const dz = prev ? at.z - prev.at.z : 0;
    const moved = prev ? dist(prev.at, at) > 1e-4 : false;
    const riding = !!lift || (!!prev && Math.abs(at.y - this.plates[plateOfY(walker.y, this.stops)].y) > 0.01);
    // Face the way they walk; at rest face the work in front of them, or the viewer.
    const rest = agent.status === "working" ? Math.PI : 0;
    const heading = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(dx, dz) : riding ? (prev?.heading ?? 0) : rest;
    this.placements.set(agent.id, { at, heading });
    return { ...at, heading, walking: moved && !riding, riding };
  }

  /** Keep the camera over the base, so it can't be dragged off into the dark. */
  private keepInBounds() {
    const t = this.controls.target;
    const x = clamp(t.x, -PIT_X - 20, PIT_X + 20);
    const y = clamp(t.y, this.lastPlate.y, 4);
    const z = clamp(t.z, this.plates[0].zBack - 20, this.lastPlate.zFront + 8);
    const shift = new THREE.Vector3(x - t.x, y - t.y, z - t.z);
    if (shift.lengthSq() === 0) return;
    t.add(shift);
    this.camera.position.add(shift);
  }

  /** Lower the rendering cost to keep motion smooth on slower computers. */
  private applyQuality() {
    const q = QUALITY[this.quality];
    const ratio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    this.renderer.setSize(this.size.width, this.size.height, false);
    this.composer.setSize(this.size.width, this.size.height);
  }

  /** What's under a point on the canvas (in -1..1 device coordinates). */
  pick(ndcX: number, ndcY: number): Selection | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    // Crew first: they stand inside rooms and should win over the room around them.
    const crew = [...this.crew.values()].map((c) => c.group);
    for (const targets of [crew, this.rooms.map((r) => r.pick)]) {
      for (const hit of this.raycaster.intersectObjects(targets, true)) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj && !obj.userData.kind) obj = obj.parent;
        if (obj && hit.object.visible !== false) return { kind: obj.userData.kind as Selection["kind"], id: obj.userData.id as string };
      }
    }
    return null;
  }

  dispose() {
    this.controls.dispose();
    disposeTree(this.scene);
    this.composer.dispose();
    this.renderer.dispose();
    // Browsers allow only a few live 3D contexts; give this one back now.
    this.renderer.forceContextLoss();
  }

  private add<T extends THREE.Object3D>(obj: T): T {
    this.scene.add(obj);
    return obj;
  }

  private buildLights() {
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

  private buildSky() {
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
  private buildGround() {
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
  private buildPit() {
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
  private buildPlates(state: FacilityState) {
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
  private buildLifts() {
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
  private buildDock() {
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

function dist(a: Point3, b: Point3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
