import * as THREE from "three";
import type { FacilityState, Room, RoomKind } from "../core/types";
import type { RoomLayout } from "../facility/layout";
import { BACK_Z, FRONT_Z, sceneX, sceneY } from "./coords";
import { box, dish, glow, label, lightCone, place, plate, standard } from "./parts";
import { floorTexture, hazardTexture, panelTexture } from "./textures";
import type { Box2 } from "./view";

// One room of the facility: its shell, lighting and animated equipment.
// Everything that changes with the business (alerts, crates in the vault,
// packets on the conveyor, the command screen) is driven by the ledger
// state passed to update(); the rest is ambient motion.

export interface RoomFrame {
  time: number;
  state: FacilityState;
  alert: boolean;
  /** Tasks being worked on or waiting in this room. */
  busy: number;
  completed: number;
  pending: number;
  selected: boolean;
  hovered: boolean;
}

export interface RoomView {
  roomId: string;
  group: THREE.Group;
  /** Invisible box used for clicking on the room. */
  pick: THREE.Mesh;
  /** The room's open front, for framing it with the camera. */
  bounds: Box2;
  update(frame: RoomFrame): void;
}

const WALL_TINT: Record<RoomKind, [string, string]> = {
  command: ["#0f2238", "#1d4166"],
  vault: ["#2a2110", "#4a3a18"],
  lab: ["#0e2a20", "#1b4a38"],
  studio: ["#25132f", "#422352"],
  bay: ["#2b1f0b", "#4d3815"],
  comms: ["#2d1212", "#4f2222"],
  dock: ["#1c2230", "#2f3a4f"],
  sealed: ["#161616", "#262626"],
};

const LIGHT_TINT: Record<RoomKind, number> = {
  command: 0x7cc8ff,
  vault: 0xffd27a,
  lab: 0x8affc8,
  studio: 0xf0a8ff,
  bay: 0xffc46b,
  comms: 0xff9a8a,
  dock: 0xbcd4ff,
  sealed: 0x000000,
};

const ALERT = new THREE.Color(0xff2a2a);

interface Box {
  x0: number;
  x1: number;
  w: number;
  cx: number;
  top: number;
  floor: number;
  h: number;
  d: number;
  cz: number;
}

export function roomBounds(rl: RoomLayout): Box {
  const x0 = sceneX(rl.rect.x);
  const x1 = sceneX(rl.rect.x + rl.rect.w);
  const top = sceneY(rl.rect.y);
  const floor = sceneY(rl.floorY);
  const d = FRONT_Z - BACK_Z;
  return { x0, x1, w: x1 - x0, cx: (x0 + x1) / 2, top, floor, h: top - floor, d, cz: (FRONT_Z + BACK_Z) / 2 };
}

export function buildRoom(room: Room, rl: RoomLayout, accent: string): RoomView {
  const b = roomBounds(rl);
  const group = new THREE.Group();
  group.name = `room:${room.id}`;
  const sealed = room.kind === "sealed";
  const [wallBase, wallLine] = WALL_TINT[room.kind];

  // Shell: back wall, floor, ceiling and side walls. The front is open.
  const wallMat = standard("#ffffff", { map: panelTexture(wallBase, wallLine, [b.w / 8, b.h / 8]), metalness: 0.4, roughness: 0.6 });
  group.add(place(box(b.w, b.h, 0.3, wallMat), b.cx, b.floor + b.h / 2, BACK_Z - 0.15));
  const floorMat = standard("#ffffff", { map: floorTexture([b.w / 3, b.d / 3]), metalness: 0.6, roughness: 0.45 });
  group.add(place(box(b.w, 0.4, b.d, floorMat), b.cx, b.floor - 0.2, b.cz));
  const ceilMat = standard("#1a1d24", { metalness: 0.5 });
  group.add(place(box(b.w, 0.3, b.d, ceilMat), b.cx, b.top + 0.15, b.cz));
  const sideMat = standard(wallBase, { metalness: 0.5, roughness: 0.5 });
  group.add(place(box(0.3, b.h, b.d, sideMat), b.x0 + 0.15, b.floor + b.h / 2, b.cz));
  group.add(place(box(0.3, b.h, b.d, sideMat), b.x1 - 0.15, b.floor + b.h / 2, b.cz));

  // Neon trim around the open front: the room's colour, red when it needs you.
  const trimColor = new THREE.Color(sealed ? "#3f3f46" : accent);
  const trim = glow(trimColor, sealed ? 0.4 : 1.6);
  const t = 0.12;
  group.add(place(box(b.w, t, t, trim), b.cx, b.top - t / 2, FRONT_Z));
  group.add(place(box(b.w, t, t, trim), b.cx, b.floor + t / 2, FRONT_Z));
  for (const x of [b.x0 + t / 2, b.x1 - t / 2]) group.add(place(box(t, b.h, t, trim), x, b.floor + b.h / 2, FRONT_Z));

  // Ceiling light panels and the room's own light.
  let light: THREE.PointLight | null = null;
  if (!sealed) {
    const panel = glow(0xfff3d6, 2.2);
    const count = Math.max(1, Math.floor(b.w / 6));
    for (let i = 0; i < count; i++) {
      const x = b.x0 + (b.w / count) * (i + 0.5);
      group.add(place(box(2.2, 0.08, 0.7, panel), x, b.top - 0.05, b.cz - 1));
      const coneH = b.h * 0.85;
      group.add(place(lightCone(LIGHT_TINT[room.kind], 2.4, coneH), x, b.top - coneH / 2, b.cz - 1));
    }
    light = new THREE.PointLight(LIGHT_TINT[room.kind], 60, b.w * 1.4, 1.6);
    light.position.set(b.cx, b.top - 1.2, b.cz + 1);
    group.add(light);
  }

  // Name plate on the back wall.
  if (!sealed) {
    const name = plate(room.name.toUpperCase(), 1.3, { color: accent, background: "rgba(2,6,23,0.85)", border: accent });
    const w = (name.geometry as THREE.PlaneGeometry).parameters.width;
    group.add(place(name, b.x0 + 0.6 + w / 2, b.top - 1.1, BACK_Z + 0.02));
  }

  // Alert: a "!" that bobs at the front of the room, and the room light turns red.
  const alertSign = label("!", 1.8, { color: "#fff", background: "#dc2626", size: 64 });
  alertSign.position.set(b.x1 - 1.4, b.top - 1.6, FRONT_Z + 0.8);
  alertSign.visible = false;
  group.add(alertSign);
  const calm = new THREE.Color(LIGHT_TINT[room.kind]);
  const lit = new THREE.Color();

  // Dust drifting through the light.
  const dust = sealed ? null : dustMotes(b, LIGHT_TINT[room.kind]);
  if (dust) group.add(dust.points);

  // Selection outline.
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(b.w + 0.4, b.h + 0.4, b.d + 0.4)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, toneMapped: false }),
  );
  const outlineMat = outline.material as THREE.LineBasicMaterial;
  outline.position.set(b.cx, b.floor + b.h / 2, b.cz);
  outline.visible = false;
  group.add(outline);

  const pick = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), new THREE.MeshBasicMaterial({ visible: false }));
  pick.position.set(b.cx, b.floor + b.h / 2, b.cz);
  pick.userData = { kind: "room", id: room.id };
  group.add(pick);

  const furniture = FURNITURE[room.kind](group, b, accent);

  return {
    roomId: room.id,
    group,
    pick,
    bounds: { x0: b.x0, x1: b.x1, top: b.top, bottom: b.floor },
    update(frame) {
      const pulse = 0.5 + 0.5 * Math.sin(frame.time * 6);
      trim.emissive.copy(frame.alert ? ALERT : trimColor);
      trim.emissiveIntensity = frame.alert ? 1.5 + pulse * 2.5 : sealed ? 0.4 : 1.6;
      alertSign.visible = frame.alert && room.kind !== "command";
      alertSign.position.y = b.top - 1.6 + Math.sin(frame.time * 3) * 0.25;
      if (light) {
        light.color.copy(frame.alert ? lit.copy(calm).lerp(ALERT, 0.45 + pulse * 0.4) : calm);
        light.intensity = (frame.alert ? 75 : 60) + Math.sin(frame.time * 1.3 + b.cx) * 4;
      }
      outline.visible = frame.selected || frame.hovered;
      outlineMat.opacity = frame.selected ? 0.9 : 0.35;
      dust?.update(frame.time);
      furniture(frame);
    },
  };
}

function dustMotes(b: Box, color: number) {
  const COUNT = 36;
  const seeds = Array.from({ length: COUNT }, (_, i) => [((i * 0.618) % 1), ((i * 0.377) % 1), ((i * 0.851) % 1)]);
  const positions = new Float32Array(COUNT * 3);
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(positions, 3);
  geo.setAttribute("position", attr);
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color, size: 0.09, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  points.frustumCulled = false;
  return {
    points,
    update(time: number) {
      seeds.forEach(([sx, sy, sz], i) => {
        const drift = time * 0.02 * (0.5 + sz);
        positions[i * 3] = b.x0 + 0.5 + ((sx + Math.sin(time * 0.1 + i) * 0.02 + drift) % 1) * (b.w - 1);
        positions[i * 3 + 1] = b.floor + 0.3 + ((sy + drift * 0.6) % 1) * (b.h - 0.8);
        positions[i * 3 + 2] = BACK_Z + 0.5 + sz * (b.d - 1);
      });
      attr.needsUpdate = true;
    },
  };
}

/** Where crate number i sits in the vault: rows along the floor, then stacked in layers. */
export function crateSlot(i: number, perRow: number) {
  const perLayer = perRow * 3;
  const layer = Math.floor(i / perLayer);
  const inLayer = i % perLayer;
  return { col: inLayer % perRow, row: Math.floor(inLayer / perRow), layer };
}

type Furnish = (group: THREE.Group, b: Box, accent: string) => (frame: RoomFrame) => void;

const nothing = () => {};

const FURNITURE: Record<RoomKind, Furnish> = {
  command(group, b, accent) {
    // A wide wall screen showing what waits for the owner, live.
    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 1024;
    screenCanvas.height = 320;
    const ctx = screenCanvas.getContext("2d")!;
    const tex = new THREE.CanvasTexture(screenCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sw = b.w - 4;
    const sh = sw * (320 / 1024);
    const screenH = Math.min(sh, b.h * 0.42);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(sw, screenH),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
    );
    group.add(place(screen, b.cx, b.top - 1.8 - screenH / 2, BACK_Z + 0.05));
    group.add(place(box(sw + 0.4, screenH + 0.4, 0.2, standard("#0b0f17", { metalness: 0.8 })), b.cx, b.top - 1.8 - screenH / 2, BACK_Z + 0.02 - 0.1));

    // Consoles along the front with glowing keyboards.
    const desk = standard("#1e293b", { metalness: 0.7, roughness: 0.35 });
    const keys: THREE.MeshStandardMaterial[] = [];
    for (let i = 0; i < 3; i++) {
      const x = b.x0 + 3 + i * ((b.w - 6) / 2.6);
      if (i === 1) continue;
      group.add(place(box(3, 1.1, 1.4, desk), x, b.floor + 0.55, BACK_Z + 3));
      const k = glow(accent, 1.2);
      keys.push(k);
      const top = place(box(2.6, 0.06, 1, k), x, b.floor + 1.15, BACK_Z + 3);
      top.rotation.x = -0.35;
      group.add(top);
    }

    // Holotable with a slowly turning hologram of the facility.
    const tableX = b.cx + 1;
    group.add(place(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 1, 24), desk), tableX, b.floor + 0.5, BACK_Z + 3.4));
    const holoMat = new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.85, toneMapped: false });
    const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), holoMat);
    group.add(place(holo, tableX, b.floor + 2.4, BACK_Z + 3.4));
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.3, 1.6, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
    );
    group.add(place(beam, tableX, b.floor + 1.8, BACK_Z + 3.4));

    let lastDraw = -1;
    return (frame) => {
      holo.rotation.y = frame.time * 0.6;
      holo.rotation.x = Math.sin(frame.time * 0.4) * 0.3;
      keys.forEach((k, i) => (k.emissiveIntensity = 0.8 + 0.6 * Math.abs(Math.sin(frame.time * 2 + i))));
      if (frame.time - lastDraw < 0.25) return;
      lastDraw = frame.time;
      drawCommandScreen(ctx, frame, accent);
      tex.needsUpdate = true;
    };
  },

  vault(group, b) {
    // Round vault door on the back wall.
    const steel = standard("#6b7280", { metalness: 0.9, roughness: 0.3 });
    const door = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 40), steel);
    door.rotation.x = Math.PI / 2;
    const doorY = b.floor + 3;
    group.add(place(door, b.x1 - 4, doorY, BACK_Z + 0.3));
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 32), standard("#d1d5db", { metalness: 1, roughness: 0.2 }));
    group.add(place(wheel, b.x1 - 4, doorY, BACK_Z + 0.65));
    for (let i = 0; i < 3; i++) {
      const spoke = box(2, 0.12, 0.12, steel);
      spoke.rotation.z = (i * Math.PI) / 3;
      group.add(place(spoke, b.x1 - 4, doorY, BACK_Z + 0.65));
    }

    // Shelving along the back wall with gold bars.
    const shelfMat = standard("#3f3f46", { metalness: 0.8, roughness: 0.4 });
    const gold = standard("#e9b30f", { metalness: 1, roughness: 0.3, emissive: "#3a2800", emissiveIntensity: 0.3 });
    const shelfW = b.w - 11;
    for (let level = 0; level < 3; level++) {
      const y = b.floor + 1.6 + level * 2.2;
      group.add(place(box(shelfW, 0.15, 1.2, shelfMat), b.x0 + 1 + shelfW / 2, y, BACK_Z + 0.8));
      for (let i = 0; i < Math.floor(shelfW / 1.3); i++) {
        if ((i * 7 + level * 3) % 5 === 0) continue;
        group.add(place(box(1, 0.4, 0.6, gold), b.x0 + 1.6 + i * 1.3, y + 0.28, BACK_Z + 0.8));
      }
    }
    for (const x of [b.x0 + 1, b.x0 + 1 + shelfW]) group.add(place(box(0.2, 6.8, 1.2, shelfMat), x, b.floor + 3.4, BACK_Z + 0.8));

    // A counter showing the real total of finished work.
    const counterCanvas = document.createElement("canvas");
    counterCanvas.width = 512;
    counterCanvas.height = 160;
    const cctx = counterCanvas.getContext("2d")!;
    const counterTex = new THREE.CanvasTexture(counterCanvas);
    counterTex.colorSpace = THREE.SRGBColorSpace;
    const counter = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.75), new THREE.MeshBasicMaterial({ map: counterTex, toneMapped: false }));
    group.add(place(counter, b.x1 - 4, b.top - 1.6, BACK_Z + 0.32));

    // Finished work stacks up as crates, one per completed task (up to 48).
    const MAX = 48;
    const crateMat = standard("#ffffff", { map: crateTexture(), metalness: 0.2, roughness: 0.6 });
    const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), crateMat, MAX);
    const m = new THREE.Matrix4();
    const perRow = Math.max(1, Math.floor((b.w - 11) / 1.25));
    for (let i = 0; i < MAX; i++) {
      const { col, row, layer } = crateSlot(i, perRow);
      m.makeRotationY((((i * 37) % 10) - 5) * 0.03);
      m.setPosition(b.x0 + 1.6 + col * 1.25, b.floor + 0.55 + layer * 1.12, BACK_Z + 2.4 + row * 1.25);
      crates.setMatrixAt(i, m);
    }
    crates.count = 0;
    group.add(crates);
    let shown = -1;
    return (frame) => {
      crates.count = Math.min(frame.completed, MAX);
      wheel.rotation.z = frame.time * 0.2;
      if (frame.completed !== shown) {
        shown = frame.completed;
        cctx.fillStyle = "#0c0a05";
        cctx.fillRect(0, 0, 512, 160);
        cctx.strokeStyle = "#facc15";
        cctx.lineWidth = 4;
        cctx.strokeRect(4, 4, 504, 152);
        cctx.font = "bold 34px ui-monospace, Menlo, monospace";
        cctx.fillStyle = "#fde68a";
        cctx.fillText("COMPLETED", 24, 50);
        cctx.font = "bold 80px ui-monospace, Menlo, monospace";
        cctx.fillStyle = "#facc15";
        cctx.fillText(String(frame.completed), 24, 136);
        counterTex.needsUpdate = true;
      }
    };
  },

  lab(group, b) {
    // Specimen tanks with glowing liquid and rising bubbles.
    const glass = new THREE.MeshStandardMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.18, metalness: 0.1, roughness: 0.05, depthWrite: false });
    const metal = standard("#334155", { metalness: 0.8, roughness: 0.3 });
    const liquids: THREE.Mesh[] = [];
    const bubbles: THREE.Mesh[] = [];
    const colors = [0x22c55e, 0xa855f7, 0x22c55e];
    for (let i = 0; i < 3; i++) {
      const x = b.x0 + 2.2 + i * 2.6;
      const z = BACK_Z + 2;
      group.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.5, 20), metal), x, b.floor + 0.25, z));
      group.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 4.2, 20, 1, true), glass), x, b.floor + 2.6, z));
      group.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.3, 20), metal), x, b.floor + 4.85, z));
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 1, 20), glow(colors[i], 1.4));
      liquid.position.set(x, b.floor + 0.5, z);
      liquids.push(liquid);
      group.add(liquid);
      for (let j = 0; j < 4; j++) {
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.08 + j * 0.02, 8, 8), glow(0xffffff, 1.5));
        bubble.userData = { x: x + (j - 1.5) * 0.3, z, phase: j * 0.27 + i * 0.13 };
        bubbles.push(bubble);
        group.add(bubble);
      }
    }
    // Analysis station: a server rack with blinking lights and a screen.
    const rackX = b.x1 - 2;
    group.add(place(box(1.8, 4.4, 1.6, standard("#111827", { metalness: 0.7 })), rackX, b.floor + 2.2, BACK_Z + 1));
    const blinkers: THREE.MeshStandardMaterial[] = [];
    for (let r = 0; r < 8; r++) {
      const mat = glow(r % 3 === 0 ? 0xf59e0b : 0x22c55e, 1.5);
      blinkers.push(mat);
      const led = box(0.12, 0.12, 0.05, mat);
      group.add(place(led, rackX - 0.5 + (r % 2) * 0.3, b.floor + 0.8 + r * 0.45, BACK_Z + 1.82));
    }
    const chart = box(2.6, 1.6, 0.1, glow(0x22c55e, 0.6));
    group.add(place(chart, rackX - 3.6, b.floor + 3.4, BACK_Z + 0.1));
    return (frame) => {
      liquids.forEach((l, i) => {
        const level = 2.6 + Math.sin(frame.time * 0.8 + i * 2) * 1.0;
        l.scale.y = level;
        l.position.y = b.floor + 0.5 + level / 2;
      });
      for (const bubble of bubbles) {
        const { x, z, phase } = bubble.userData as { x: number; z: number; phase: number };
        const p = (frame.time * 0.35 + phase) % 1;
        bubble.position.set(x + Math.sin(p * 12) * 0.08, b.floor + 0.6 + p * 3.4, z);
      }
      blinkers.forEach((mat, i) => (mat.emissiveIntensity = Math.sin(frame.time * (3 + i) + i * 7) > 0.2 ? 2 : 0.1));
    };
  },

  studio(group, b) {
    // Easels with artwork that keeps evolving, and a 3D printer at work.
    const wood = standard("#7c4a1e", { roughness: 0.8 });
    const canvases: THREE.MeshStandardMaterial[] = [];
    for (let i = 0; i < 2; i++) {
      const x = b.x0 + 2.6 + i * 4.2;
      const z = BACK_Z + 2.5;
      for (const dx of [-0.9, 0.9]) {
        const leg = box(0.12, 4, 0.12, wood);
        leg.rotation.z = dx * 0.08;
        group.add(place(leg, x + dx, b.floor + 2, z));
      }
      const back = box(0.12, 4.2, 0.12, wood);
      back.rotation.x = -0.25;
      group.add(place(back, x, b.floor + 2, z - 0.5));
      const art = glow(0xffffff, 0.9);
      canvases.push(art);
      const board = box(2.6, 2, 0.08, art);
      board.rotation.x = -0.12;
      group.add(place(board, x, b.floor + 3, z + 0.1));
    }
    const printerX = b.x1 - 2.4;
    const frameMat = standard("#cbd5e1", { metalness: 0.8, roughness: 0.25 });
    group.add(place(box(2.6, 0.3, 2, frameMat), printerX, b.floor + 0.15, BACK_Z + 2));
    for (const [dx, dz] of [[-1.2, -0.9], [1.2, -0.9], [-1.2, 0.9], [1.2, 0.9]]) {
      group.add(place(box(0.1, 3, 0.1, frameMat), printerX + dx, b.floor + 1.6, BACK_Z + 2 + dz));
    }
    const head = place(box(0.5, 0.4, 0.5, glow(0xf0abfc, 1.6)), printerX, b.floor + 1.6, BACK_Z + 2);
    group.add(head);
    const print = place(new THREE.Mesh(new THREE.TorusKnotGeometry(0.35, 0.12, 48, 8), standard("#e879f9", { roughness: 0.4 })), printerX, b.floor + 0.8, BACK_Z + 2);
    group.add(print);
    const c = new THREE.Color();
    return (frame) => {
      canvases.forEach((mat, i) => mat.emissive.copy(c.setHSL(((frame.time * 0.05 + i * 0.4) % 1), 0.7, 0.55)));
      head.position.x = printerX + Math.sin(frame.time * 2.2) * 0.8;
      head.position.z = BACK_Z + 2 + Math.cos(frame.time * 1.7) * 0.6;
      print.rotation.y = frame.time * 0.5;
    };
  },

  bay(group, b, accent) {
    // Conveyor carrying one packet per listing in progress here, toward the lift.
    const beltY = b.floor + 1;
    group.add(place(box(b.w - 2, 0.2, 1.6, standard("#1c1917", { roughness: 0.9 })), b.cx, beltY, BACK_Z + 3));
    group.add(place(box(b.w - 2, 0.8, 1.8, standard("#44403c", { metalness: 0.6 })), b.cx, beltY - 0.5, BACK_Z + 3));
    const rollers: THREE.Mesh[] = [];
    for (let x = b.x0 + 1.5; x < b.x1 - 1.4; x += 1.2) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.7, 10), standard("#78716c", { metalness: 0.8 }));
      roller.rotation.x = Math.PI / 2;
      rollers.push(place(roller, x, beltY - 0.05, BACK_Z + 3));
      group.add(roller);
    }
    const packetMat = standard("#fbbf24", { emissive: "#7c4a03", emissiveIntensity: 0.6, roughness: 0.5 });
    const packets: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const p = box(0.9, 0.6, 0.9, packetMat);
      p.visible = false;
      packets.push(p);
      group.add(p);
    }
    // Robotic arm that stamps each packet.
    const arm = new THREE.Group();
    const armMat = standard(accent, { metalness: 0.6, roughness: 0.35 });
    arm.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.6, 16), standard("#27272a")), 0, 0.3, 0));
    const upper = place(box(0.35, 2.4, 0.35, armMat), 0, 1.6, 0);
    arm.add(upper);
    const fore = new THREE.Group();
    fore.position.set(0, 2.8, 0);
    fore.add(place(box(1.8, 0.3, 0.3, armMat), 0.9, 0, 0));
    fore.add(place(box(0.3, 0.6, 0.3, glow(0xffffff, 1.2)), 1.8, -0.3, 0));
    arm.add(fore);
    arm.position.set(b.cx, b.floor, BACK_Z + 1);
    group.add(arm);
    return (frame) => {
      const n = Math.min(frame.busy, packets.length);
      const span = b.w - 3;
      packets.forEach((p, i) => {
        p.visible = i < n;
        const along = (((frame.time * 0.12 + i / Math.max(1, n)) % 1) + 1) % 1;
        p.position.set(b.x0 + 1.5 + along * span, beltY + 0.4, BACK_Z + 3);
      });
      for (const r of rollers) r.rotation.y = frame.time * 4;
      arm.rotation.y = Math.sin(frame.time * 0.9) * 0.9;
      fore.rotation.z = -0.4 + Math.sin(frame.time * 1.8) * 0.3;
    };
  },

  comms(group, b) {
    // Satellite dish sweeping the sky, with signal rings pulsing outward.
    const metal = standard("#94a3b8", { metalness: 0.9, roughness: 0.25 });
    const x = b.cx;
    const z = BACK_Z + 2.5;
    group.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 3.4, 12), metal), x, b.floor + 1.7, z));
    const head = new THREE.Group();
    head.position.set(x, b.floor + 3.6, z);
    const bowl = dish(1.9, 0.7, standard("#8b95a5", { metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide }));
    bowl.rotation.x = 0.9;
    head.add(bowl);
    const feed = place(box(0.06, 1.3, 0.06, metal), 0, 0.6, 0.45);
    feed.rotation.x = 0.9;
    head.add(feed);
    head.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), glow(0xff4d4d, 1.5)), 0, 1.1, 0.95));
    group.add(head);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.05, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, toneMapped: false, depthWrite: false }),
      );
      ring.rotation.x = -0.5;
      rings.push(ring);
      group.add(place(ring, x, b.floor + 4.4, z + 1));
    }
    // Message screens on the wall.
    const screens: THREE.MeshStandardMaterial[] = [];
    for (let i = 0; i < 2; i++) {
      const mat = glow(0xfca5a5, 0.6);
      screens.push(mat);
      group.add(place(box(2, 1.3, 0.1, mat), b.x0 + 1.8 + i * (b.w - 3.6), b.floor + 3.5, BACK_Z + 0.1));
    }
    return (frame) => {
      head.rotation.y = Math.sin(frame.time * 0.3) * 0.7;
      rings.forEach((ring, i) => {
        const p = (frame.time * 0.5 + i / 3) % 1;
        ring.scale.setScalar(0.4 + p * 2.6);
        ring.position.y = b.floor + 4.4 + p * 1.2;
        (ring.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.5;
      });
      screens.forEach((s, i) => (s.emissiveIntensity = 0.5 + 0.4 * Math.abs(Math.sin(frame.time * 1.5 + i))));
    };
  },

  dock: () => nothing,

  sealed(group, b) {
    // A shut blast door and dim emergency lights: space for the next business.
    const door = standard("#3f3f46", { metalness: 0.85, roughness: 0.4 });
    const halfW = (b.w - 1) / 2;
    for (const side of [-1, 1]) {
      group.add(place(box(halfW, b.h - 0.6, 0.6, door), b.cx + (side * halfW) / 2, b.floor + (b.h - 0.6) / 2, BACK_Z + 0.4));
    }
    const stripes = standard("#ffffff", { map: hazardTexture([b.w / 3, 1]) });
    for (const y of [b.floor + 0.6, b.top - 0.9]) group.add(place(box(b.w - 0.6, 0.6, 0.1, stripes), b.cx, y, BACK_Z + 0.75));
    const sign = plate("SEALED · RESERVED FOR NEXT BUSINESS", 1.2, { color: "#a1a1aa", background: "rgba(0,0,0,0.75)" });
    group.add(place(sign, b.cx, b.floor + b.h / 2, BACK_Z + 0.75));
    const lamp = glow(0xff3b3b, 1);
    for (const x of [b.x0 + 1, b.x1 - 1]) {
      group.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), lamp), x, b.top - 0.8, BACK_Z + 0.8));
    }
    return (frame) => {
      lamp.emissiveIntensity = Math.sin(frame.time * 1.2) > 0.6 ? 2.5 : 0.3;
    };
  },
};

function crateTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#a16207";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#854d0e";
  for (let y = 0; y < 128; y += 32) ctx.fillRect(0, y, 128, 3);
  ctx.strokeStyle = "#713f12";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 118, 118);
  ctx.beginPath();
  ctx.moveTo(10, 10);
  ctx.lineTo(118, 118);
  ctx.stroke();
  ctx.fillStyle = "#facc15";
  ctx.font = "bold 22px ui-monospace, Menlo, monospace";
  ctx.fillText("DONE", 36, 72);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function drawCommandScreen(ctx: CanvasRenderingContext2D, frame: RoomFrame, accent: string) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = "#020814";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(56,189,248,0.12)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.font = "bold 30px ui-monospace, Menlo, monospace";
  ctx.fillStyle = accent;
  ctx.fillText("COMMAND // LIVE", 28, 48);
  const working = frame.state.agents.filter((a) => a.status === "working").length;
  ctx.font = "bold 72px ui-monospace, Menlo, monospace";
  ctx.fillStyle = frame.pending ? "#f87171" : "#4ade80";
  ctx.fillText(frame.pending ? `${frame.pending} AWAITING YOU` : "ALL CLEAR", 28, 140);
  ctx.font = "28px ui-monospace, Menlo, monospace";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(`${working}/${frame.state.agents.length} crew working · ${frame.completed} completed`, 28, 190);
  // One bar per crew member: how far along their current task is.
  const crew = frame.state.agents;
  const barW = (W - 56) / Math.max(1, crew.length);
  crew.forEach((agent, i) => {
    const task = agent.taskId ? frame.state.tasks.find((t) => t.id === agent.taskId) : undefined;
    const x = 28 + i * barW;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(x, 236, barW - 12, 22);
    ctx.fillStyle = agent.status === "paused" ? "#fbbf24" : agent.sprite.suit;
    ctx.fillRect(x, 236, (barW - 12) * (task?.progress ?? 0), 22);
    ctx.font = "20px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(agent.name, x, 290);
  });
}
