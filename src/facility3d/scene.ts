import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { completedCount } from "../core/ledger";
import type { FacilityState } from "../core/types";
import type { FacilityLayout } from "../facility/layout";
import { pendingApprovals, roomNeedsAttention, tasksInRoom, type Selection } from "../facility/status";
import { targetFor } from "../facility/targets";
import { buildBase, type Tick } from "./base";
import { PIT_X, PLATE_D, platesFor, SHAFT_X, WALL_H, type Plate } from "./coords";
import { buildCrew, type CrewView } from "./crew";
import { CrewMotion } from "./motion";
import { disposeTree } from "./parts";
import { buildRoom, type RoomView } from "./rooms";
import { AZIMUTH, easeInOut, ELEVATION, focusOn, FrameMeter, nextQuality, QUALITY, type Area } from "./view";

// The 3D facility, seen from above like a base-building game: each level is a
// wide floor dug a step deeper into the ground than the one behind it, with
// rooms along the back, a corridor along the front and a glass lift down each
// drop. It is drawn from the same layout and ledger state as the 2D map, and
// only shows what the ledger records (plus ambient motion like bubbles and
// blinking lights).
//
// This file runs the view: camera, controls, picking, quality and the frame
// loop. The base itself is built in base.ts, the rooms in rooms.ts, the crew
// in crew.ts, and where the crew walk in motion.ts.

const FLY_SECONDS = 0.9;
/** Room around the whole base in the overview; the near edge looks bigger in perspective. */
const OVERVIEW_MARGIN = 1.15;

interface Flight {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
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
  private motion: CrewMotion;
  private ambient: Tick[];
  private raycaster = new THREE.Raycaster();
  private plates: Plate[];
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
    this.motion = new CrewMotion(layout);
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

    this.ambient = buildBase(this.scene, layout, state);

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
    const at = this.motion.positionOf(selection.id);
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
      const pose = this.motion.advance(agent, target, dt);
      let view = this.crew.get(agent.id);
      if (!view) {
        view = buildCrew(agent);
        view.group.userData = { kind: "agent", id: agent.id };
        this.crew.set(agent.id, view);
        this.scene.add(view.group);
      }
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
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
