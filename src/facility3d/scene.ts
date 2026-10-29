import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { completedCount } from "../core/ledger";
import type { FacilityState } from "../core/types";
import type { FacilityLayout, Rect } from "../facility/layout";
import { step, type Walker } from "../facility/movement";
import { pendingApprovals, roomNeedsAttention, tasksInRoom, type Selection } from "../facility/status";
import { targetFor } from "../facility/targets";
import { BACK_Z, FRONT_Z, SHAFT_SCENE, sceneX, sceneY } from "./coords";
import { buildCrew, type CrewView } from "./crew";
import { box, dish, disposeTree, glow, label, place, plate, standard } from "./parts";
import { buildRoom, type RoomView } from "./rooms";
import { grassTexture, rockBump, rockTexture, skyTexture } from "./textures";
import { easeInOut, fitDistance, focusOn, FrameMeter, nextQuality, QUALITY, type Box2 } from "./view";

// The 3D facility: a cut-away of an underground base beneath a night-time
// surface, one level per wing, joined by a glass lift shaft. It is drawn from
// the same layout and ledger state as the 2D map, and only shows what the
// ledger records (plus ambient motion like bubbles and blinking lights).

const ROCK_FRONT = FRONT_Z + 0.5;
const ROCK_BACK = -16;
const ROCK_HALF_W = 160;
const FLY_SECONDS = 0.9;
/** The whole facility, surface antenna to the lowest level, for the overview. */
const OVERVIEW_WIDTH = 96;

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
  private controls: OrbitControls;
  private rooms: RoomView[] = [];
  private crew = new Map<string, CrewView>();
  private walkers = new Map<string, Walker>();
  private ambient: ((time: number) => void)[] = [];
  private raycaster = new THREE.Raycaster();
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
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.bottom = sceneY(layout.height) - 2;
    this.scene.background = new THREE.Color(0x04050a);
    this.scene.fog = new THREE.Fog(0x04050a, 160, 360);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 900);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minAzimuthAngle = -0.75;
    this.controls.maxAzimuthAngle = 0.75;
    this.controls.minPolarAngle = 0.95;
    this.controls.maxPolarAngle = 1.85;
    this.controls.minDistance = 12;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    // Any touch of the controls takes over from an automatic camera move.
    this.controls.addEventListener("start", () => (this.flight = null));

    this.buildLights();
    this.buildSky();
    this.buildSurface();
    this.buildRock();
    this.buildLevels(state);
    this.buildShaft();

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
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.85);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.applyQuality();
  }

  resize(width: number, height: number) {
    this.size = { width, height };
    this.aspect = width / height;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width / 2, height / 2);
    this.controls.maxDistance = fitDistance(this.camera.fov, this.aspect, OVERVIEW_WIDTH, this.overviewBox().top - this.bottom) * 1.8;
  }

  private overviewBox(): Box2 {
    return { x0: -OVERVIEW_WIDTH / 2, x1: OVERVIEW_WIDTH / 2, top: 9, bottom: this.bottom };
  }

  /** Jump straight to the overview, without flying (used on first show). */
  resetView() {
    const f = focusOn(this.overviewBox(), this.camera.fov, this.aspect, 1);
    this.flight = null;
    this.camera.position.set(...f.position);
    this.controls.target.set(...f.target);
    this.controls.update();
  }

  /** Fly back to the view of the whole facility. */
  overview() {
    this.flyTo(this.overviewBox(), 1);
  }

  /**
   * Fly to one level of the facility. Levels are much wider than tall, so
   * frame the height and let the sides run off screen: drag to look along it.
   */
  focusLevel(index: number) {
    const level = this.layout.levels[index];
    if (!level) return;
    const r = level.rect;
    this.flyTo({ x0: -1, x1: 1, top: sceneY(r.y), bottom: sceneY(r.y + r.h) }, 2.6);
  }

  /** Fly to whatever is selected: a room, or the room a crew member is in. */
  focus(selection: Selection) {
    if (selection.kind === "room") {
      const room = this.rooms.find((r) => r.roomId === selection.id);
      if (room) this.flyTo(room.bounds, 1.5);
      return;
    }
    const w = this.walkers.get(selection.id);
    if (!w) return;
    const x = sceneX(w.x);
    const y = sceneY(w.y);
    this.flyTo({ x0: x - 9, x1: x + 9, top: y + 7, bottom: y - 1 }, 1);
  }

  private flyTo(box: Box2, margin: number) {
    const f = focusOn(box, this.camera.fov, this.aspect, margin);
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
      view.update(agent, next, state, time, isOn("agent", agent.id, selection), isOn("agent", agent.id, this.hovered));
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
    // Crew first: they stand inside rooms and should win over the room behind them.
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
    this.add(new THREE.AmbientLight(0x404a66, 0.8));
    this.add(new THREE.HemisphereLight(0x8090ff, 0x5a4030, 0.9));
    const moon = new THREE.DirectionalLight(0xaabbff, 1.4);
    moon.position.set(-60, 120, 80);
    this.add(moon);
    // A cool fill from the front so the cut-away reads clearly.
    const fill = new THREE.DirectionalLight(0x8fa6d6, 1.1);
    fill.position.set(30, -10, 120);
    this.add(fill);
  }

  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    sky.position.y = -2;
    this.add(sky);

    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42;
      positions[i * 3] = 450 * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = 450 * Math.cos(phi) + 10;
      positions[i * 3 + 2] = 450 * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true });
    this.add(new THREE.Points(geo, starMat));
    this.ambient.push((t) => (starMat.opacity = 0.75 + Math.sin(t * 0.7) * 0.2));

    const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false }));
    this.add(place(moon, -150, 160, -380));
  }

  private buildSurface() {
    // Ground stretching away behind the cut-away, with hills and pines.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ROCK_HALF_W * 4, 400),
      standard("#ffffff", { map: grassTexture([80, 50]), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.add(place(ground, 0, 0, ROCK_FRONT - 200));
    const edge = box(ROCK_HALF_W * 2, 0.5, 0.6, standard("#2f5a1c", { roughness: 1 }));
    this.add(place(edge, 0, -0.2, ROCK_FRONT - 0.3));

    const hillMat = standard("#0f1a12", { roughness: 1, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const r = 30 + ((i * 53) % 40);
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.55, 7), hillMat);
      this.add(place(hill, -260 + i * 40 + ((i * 17) % 20), r * 0.27 - 1, -150 - ((i * 37) % 90)));
    }
    const trunk = standard("#3b2414", { roughness: 1 });
    const needles = standard("#14301c", { roughness: 1, flatShading: true });
    for (let i = 0; i < 46; i++) {
      const x = -120 + ((i * 97) % 240);
      const z = -20 - ((i * 61) % 110);
      if (Math.abs(x) < 16 && z > -30) continue;
      const s = 0.8 + ((i * 13) % 10) / 12;
      const tree = new THREE.Group();
      tree.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), trunk), 0, 0.8, 0));
      tree.add(place(new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 7), needles), 0, 2.6, 0));
      tree.add(place(new THREE.Mesh(new THREE.ConeGeometry(1, 2.2, 7), needles), 0, 3.8, 0));
      tree.scale.setScalar(s);
      this.add(place(tree, x, 0, z));
    }
    this.buildDock();
  }

  private buildDock() {
    // The surface dock: where approved work leaves for the Etsy shop.
    const dock = this.layout.rooms.get("dock");
    if (!dock) return;
    const r = dock.rect;
    const x0 = sceneX(r.x);
    const x1 = sceneX(r.x + r.w);
    const cx = (x0 + x1) / 2;
    const w = x1 - x0;
    const floor = sceneY(dock.floorY);
    const top = sceneY(r.y);
    const h = top - floor;
    const metal = standard("#334155", { metalness: 0.85, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.16, metalness: 0.2, roughness: 0.05, depthWrite: false });

    this.add(place(box(w + 6, 0.5, 14, standard("#1f2937", { metalness: 0.6 })), cx, floor - 0.25, -1));
    this.add(place(box(w, 0.4, 10, metal), cx, top + 0.2, -1));
    for (const x of [x0, x1]) this.add(place(box(0.4, h, 10, metal), x, floor + h / 2, -1));
    this.add(place(box(w, h, 0.2, glass), cx, floor + h / 2, FRONT_Z));
    this.add(place(box(w, h, 0.3, standard("#1e293b", { metalness: 0.6 })), cx, floor + h / 2, BACK_Z));
    const trim = glow(0x38bdf8, 1.8);
    this.add(place(box(w + 0.4, 0.15, 0.15, trim), cx, top + 0.45, FRONT_Z));
    this.add(place(box(w + 0.4, 0.15, 0.15, trim), cx, floor + 0.1, FRONT_Z + 0.1));
    const sign = plate("SURFACE DOCK · ETSY UPLINK", 1.1, { color: "#7dd3fc", background: "rgba(2,6,23,0.9)", border: "#38bdf8" });
    this.add(place(sign, cx, top - 0.8, BACK_Z + 0.2));
    const inside = new THREE.PointLight(0xbcd4ff, 40, 20, 1.6);
    this.add(place(inside, cx, top - 1, 0));

    // Antenna mast with a blinking beacon.
    this.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 7, 8), metal), x1 - 1.2, top + 3.7, -3));
    const beacon = glow(0xff2020, 3);
    this.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), beacon), x1 - 1.2, top + 7.3, -3));
    const beaconLight = this.add(place(new THREE.PointLight(0xff3030, 20, 16, 1.5), x1 - 1.2, top + 7.3, -3));
    // Landing pad beside the dock.
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.8, 0.3, 40), standard("#27272a", { metalness: 0.5 }));
    this.add(place(pad, x1 + 9, 0.15, -6));
    const padRing = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.1, 6, 48), glow(0xf59e0b, 2));
    padRing.rotation.x = Math.PI / 2;
    this.add(place(padRing, x1 + 9, 0.35, -6));
    const dishMast = new THREE.Group();
    dishMast.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 3, 8), metal), 0, 1.5, 0));
    const bowl = dish(2.2, 0.8, standard("#7c8696", { metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide }));
    bowl.rotation.x = 0.8;
    bowl.position.y = 3.2;
    dishMast.add(bowl);
    this.add(place(dishMast, x0 - 9, 0, -8));
    this.ambient.push((t) => {
      const on = Math.sin(t * 4) > 0;
      beacon.emissiveIntensity = on ? 4 : 0.2;
      beaconLight.intensity = on ? 20 : 0;
      dishMast.rotation.y = Math.sin(t * 0.25) * 0.8;
      padRing.material.emissiveIntensity = 1.2 + Math.sin(t * 2) * 0.8;
    });
  }

  /** Solid rock around the facility, with the levels and the shaft cut out. */
  private buildRock() {
    const tall = 0 - (this.bottom - 30);
    const rock = standard("#ffffff", {
      map: rockTexture([ROCK_HALF_W / 14, tall / 14]),
      bumpMap: rockBump([ROCK_HALF_W / 7, tall / 7]),
      bumpScale: 2,
      roughness: 0.95,
      metalness: 0,
    });
    const depth = ROCK_FRONT - ROCK_BACK;
    const zMid = (ROCK_FRONT + ROCK_BACK) / 2;
    const slab = (x0: number, x1: number, yTop: number, yBot: number) => {
      if (x1 - x0 < 0.01 || yTop - yBot < 0.01) return;
      this.add(place(box(x1 - x0, yTop - yBot, depth, rock), (x0 + x1) / 2, (yTop + yBot) / 2, zMid));
    };
    const shaftL = SHAFT_SCENE.x - SHAFT_SCENE.w / 2;
    const shaftR = SHAFT_SCENE.x + SHAFT_SCENE.w / 2;
    const band = (yTop: number, yBot: number) => {
      slab(-ROCK_HALF_W, shaftL, yTop, yBot);
      slab(shaftR, ROCK_HALF_W, yTop, yBot);
    };

    let above = -0.4;
    for (const level of this.layout.levels) {
      const top = sceneY(level.rect.y);
      const bot = sceneY(level.rect.y + level.rect.h);
      band(above, top);
      slab(-ROCK_HALF_W, sceneX(level.rect.x), top, bot);
      slab(sceneX(level.rect.x + level.rect.w), ROCK_HALF_W, top, bot);
      above = bot;
    }
    slab(-ROCK_HALF_W, ROCK_HALF_W, above, this.bottom - 30);
    // Rock behind the rooms.
    const backDepth = BACK_Z - 0.3 - ROCK_BACK;
    const backMat = rock.clone();
    this.add(
      place(box(ROCK_HALF_W * 2, -this.bottom + 30, backDepth, backMat), 0, (this.bottom - 30) / 2, ROCK_BACK + backDepth / 2),
    );
    // Glowing crystal veins in the rock face.
    const crystalMats = [glow(0x38bdf8, 2.2), glow(0xa855f7, 2.2)];
    for (let i = 0; i < 70; i++) {
      const x = -ROCK_HALF_W + 4 + ((i * 113.7) % (ROCK_HALF_W * 2 - 8));
      const y = -1.5 - ((i * 37.3) % (-this.bottom + 26));
      if (this.insideHall(x, y)) continue;
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.25 + (i % 4) * 0.12), crystalMats[i % 2]);
      c.rotation.set(i, i * 2, i * 3);
      c.scale.y = 2;
      this.add(place(c, x, y, ROCK_FRONT));
    }
  }

  private insideHall(x: number, y: number) {
    for (const level of this.layout.levels) {
      const r = level.rect;
      if (x > sceneX(r.x) - 1 && x < sceneX(r.x + r.w) + 1 && y < sceneY(r.y) + 1 && y > sceneY(r.y + r.h) - 1) return true;
    }
    return Math.abs(x - SHAFT_SCENE.x) < SHAFT_SCENE.w / 2 + 1;
  }

  /** Each level's service ceiling, walkway, pillars and name. */
  private buildLevels(state: FacilityState) {
    const metal = standard("#262b35", { metalness: 0.8, roughness: 0.4 });
    const pipeMat = standard("#4b5563", { metalness: 0.9, roughness: 0.3 });
    const pillar = standard("#1f2430", { metalness: 0.8, roughness: 0.35 });
    for (const level of this.layout.levels) {
      const wing = state.wings.find((w) => w.id === level.wingId);
      const r: Rect = level.rect;
      const x0 = sceneX(r.x);
      const x1 = sceneX(r.x + r.w);
      const cx = (x0 + x1) / 2;
      const top = sceneY(r.y);
      const floor = sceneY(level.floorY);
      const bot = sceneY(r.y + r.h);
      const roomTop = top - 2.6;
      const d = ROCK_FRONT - BACK_Z;
      const zMid = (ROCK_FRONT + BACK_Z) / 2;

      // Service ceiling with pipes and the level's name.
      this.add(place(box(x1 - x0, top - roomTop, d, metal), cx, (top + roomTop) / 2, zMid));
      for (let i = 0; i < 3; i++) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, x1 - x0, 10), pipeMat);
        pipe.rotation.z = Math.PI / 2;
        this.add(place(pipe, cx, roomTop + 0.5 + i * 0.5, ROCK_FRONT + 0.1));
      }
      const colour = wing?.sealed ? "#71717a" : (wing?.color ?? "#94a3b8");
      const name = plate(`B${level.index + 1} · ${wing?.name.toUpperCase() ?? ""}`, 1.7, {
        color: colour,
        background: "rgba(2,6,23,0.92)",
        border: colour,
      });
      const nw = (name.geometry as THREE.PlaneGeometry).parameters.width;
      this.add(place(name, x0 + 1 + nw / 2, (top + roomTop) / 2 + 0.2, ROCK_FRONT + 0.45));
      const strip = glow(colour, wing?.sealed ? 0.3 : 1.4);
      this.add(place(box(x1 - x0, 0.1, 0.1, strip), cx, roomTop - 0.05, ROCK_FRONT + 0.2));

      // Walkway under the rooms, with a hazard edge.
      this.add(place(box(x1 - x0, floor - bot, d, metal), cx, (floor + bot) / 2 - 0.4, zMid));
      this.add(place(box(x1 - x0, 0.12, 0.3, glow(0xf59e0b, 0.6)), cx, floor - 0.35, ROCK_FRONT + 0.1));

      // Pillars between rooms.
      const xs = new Set<number>();
      for (const rl of this.layout.rooms.values()) {
        if (rl.level !== level.index) continue;
        xs.add(Math.round(rl.rect.x));
        xs.add(Math.round(rl.rect.x + rl.rect.w));
      }
      for (const px of xs) {
        const x = sceneX(px);
        this.add(place(box(1.2, top - bot, 1.2, pillar), x, (top + bot) / 2, ROCK_FRONT - 0.2));
      }

      this.frameOpening(x0, x1, top, bot);
    }
  }

  /**
   * A steel I-beam frame bolted round the opening of each level, with the
   * rough-cut rock edge around it, so each level reads as dug out of the ground.
   */
  private frameOpening(x0: number, x1: number, top: number, bot: number) {
    const steel = standard("#3b4250", { metalness: 0.9, roughness: 0.35 });
    const flange = standard("#4b5563", { metalness: 0.9, roughness: 0.3 });
    const z = ROCK_FRONT + 0.25;
    const w = x1 - x0;
    const h = top - bot;
    for (const y of [top + 0.35, bot - 0.35]) {
      this.add(place(box(w + 1.6, 0.7, 0.5, steel), (x0 + x1) / 2, y, z));
      this.add(place(box(w + 1.6, 0.12, 0.9, flange), (x0 + x1) / 2, y + 0.35, z));
      this.add(place(box(w + 1.6, 0.12, 0.9, flange), (x0 + x1) / 2, y - 0.35, z));
    }
    for (const x of [x0 - 0.45, x1 + 0.45]) {
      this.add(place(box(0.7, h + 1.4, 0.5, steel), x, (top + bot) / 2, z));
      this.add(place(box(0.12, h + 1.4, 0.9, flange), x - 0.35, (top + bot) / 2, z));
      this.add(place(box(0.12, h + 1.4, 0.9, flange), x + 0.35, (top + bot) / 2, z));
    }
    // Rivets along the beams.
    const rivets: [number, number][] = [];
    for (let x = x0; x <= x1; x += 2.4) rivets.push([x, top + 0.35], [x, bot - 0.35]);
    for (let y = bot; y <= top; y += 2.4) rivets.push([x0 - 0.45, y], [x1 + 0.45, y]);
    const rivetMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 6), flange, rivets.length);
    const m = new THREE.Matrix4();
    rivets.forEach(([x, y], i) => rivetMesh.setMatrixAt(i, m.makeTranslation(x, y, z + 0.27)));
    this.add(rivetMesh);

    // Broken rock lumps around the frame.
    const lumps: [number, number, number][] = [];
    let seed = Math.abs(x0 * 7 + top * 13);
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let x = x0 - 1; x <= x1 + 1; x += 1.3 + rand()) {
      lumps.push([x, top + 1 + rand() * 0.6, 0.5 + rand() * 0.7], [x, bot - 1 - rand() * 0.6, 0.5 + rand() * 0.7]);
    }
    for (let y = bot - 1; y <= top + 1; y += 1.3 + rand()) {
      lumps.push([x0 - 1.4 - rand() * 0.6, y, 0.5 + rand() * 0.7], [x1 + 1.4 + rand() * 0.6, y, 0.5 + rand() * 0.7]);
    }
    const rockMat = standard("#5b4a3c", { roughness: 1, flatShading: true });
    const lumpMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, lumps.length);
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    lumps.forEach(([x, y, size], i) => {
      e.set(rand() * 3, rand() * 3, rand() * 3);
      m.compose(new THREE.Vector3(x, y, ROCK_FRONT - 0.1), q.setFromEuler(e), new THREE.Vector3(size, size * (0.7 + rand() * 0.5), size * 0.7));
      lumpMesh.setMatrixAt(i, m);
    });
    this.add(lumpMesh);
  }

  /** The glass lift shaft running from the surface dock down through every level. */
  private buildShaft() {
    const x = SHAFT_SCENE.x;
    const w = SHAFT_SCENE.w;
    const top = 0;
    const bottom = sceneY(this.layout.shaft.y + this.layout.shaft.h);
    const h = top - bottom;
    const cy = (top + bottom) / 2;
    const frame = standard("#334155", { metalness: 0.9, roughness: 0.3 });
    this.add(place(box(w, h, 0.3, standard("#0b1220", { metalness: 0.6 })), x, cy, BACK_Z - 0.2));
    for (const dx of [-w / 2 + 0.25, w / 2 - 0.25]) {
      this.add(place(box(0.5, h, 0.5, frame), x + dx, cy, FRONT_Z));
      this.add(place(box(0.3, h, 0.3, frame), x + dx, cy, BACK_Z + 0.3));
      this.add(place(box(0.15, h, 0.15, glow(0x38bdf8, 1.6)), x + dx * 0.75, cy, BACK_Z + 0.1));
    }
    for (let y = top - 2; y > bottom; y -= 3) {
      this.add(place(box(w, 0.18, 0.3, frame), x, y, FRONT_Z));
    }
    const glass = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.1, depthWrite: false });
    this.add(place(box(w - 1, h, 0.1, glass), x, cy, FRONT_Z + 0.3));
    this.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 6), standard("#94a3b8", { metalness: 1 })), x, cy, BACK_Z + 1));
    // Light pulses running down the shaft.
    const pulses: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), glow(0x7dd3fc, 4));
      pulses.push(p);
      this.add(place(p, x, 0, BACK_Z + 1));
    }
    this.add(place(label("LIFT", 0.7, { color: "#7dd3fc", background: "rgba(2,6,23,0.8)", size: 40 }), x, 1.6, FRONT_Z));
    this.ambient.push((t) => {
      pulses.forEach((p, i) => (p.position.y = top - ((t * 9 + (i * h) / 3) % h)));
    });
  }
}
