import * as THREE from "three";
import type { Agent, FacilityState } from "../core/types";
import type { Walker } from "../facility/movement";
import { SHAFT_SCENE, sceneX, sceneY, WALK_Z } from "./coords";
import { box, glow, label, place, standard } from "./parts";

// A crew member: a little astronaut in their own colours who walks, rides the
// lift and shows what they're doing above their head (progress while working,
// "zz" when idle, a pause sign when the owner paused them).

export interface CrewView {
  agentId: string;
  group: THREE.Group;
  update(agent: Agent, walker: Walker, state: FacilityState, time: number, selected: boolean, hovered: boolean): void;
}

const SCALE = 1.7;

export function buildCrew(agent: Agent): CrewView {
  const group = new THREE.Group();
  group.name = `agent:${agent.id}`;
  const body = new THREE.Group();
  body.scale.setScalar(SCALE);
  group.add(body);

  const suit = standard(agent.sprite.suit, { roughness: 0.5, metalness: 0.15 });
  const dark = standard("#1f2937", { roughness: 0.8 });
  const white = standard("#e5e7eb", { roughness: 0.35, metalness: 0.1 });

  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.18, 0.75, 0);
    hip.add(place(box(0.24, 0.72, 0.26, dark), 0, -0.36, 0));
    hip.add(place(box(0.28, 0.14, 0.36, white), 0, -0.7, 0.04));
    legs.push(hip);
    body.add(hip);
  }
  const torso = new THREE.Group();
  torso.position.y = 0.75;
  body.add(torso);
  torso.add(place(new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.5, 6, 12), suit), 0, 0.45, 0));
  torso.add(place(box(0.5, 0.6, 0.28, standard("#475569", { metalness: 0.6 })), 0, 0.5, -0.32));
  const packLight = glow(agent.sprite.visor, 2);
  torso.add(place(box(0.1, 0.1, 0.04, packLight), 0.12, 0.65, -0.47));
  const chest = glow(agent.sprite.visor, 1.2);
  torso.add(place(box(0.18, 0.1, 0.04, chest), 0, 0.6, 0.31));

  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.42, 0.78, 0);
    shoulder.add(place(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.42, 4, 8), suit), 0, -0.3, 0));
    shoulder.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), white), 0, -0.6, 0));
    arms.push(shoulder);
    torso.add(shoulder);
  }

  const head = new THREE.Group();
  head.position.y = 1.32;
  torso.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), white));
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 20, 12, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.35),
    new THREE.MeshStandardMaterial({ color: 0x050505, emissive: agent.sprite.visor, emissiveIntensity: 0.9, metalness: 1, roughness: 0.05 }),
  );
  visor.position.z = 0.1;
  visor.scale.setScalar(1.1);
  head.add(visor);
  head.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), dark), 0.2, 0.42, -0.05));
  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), glow(agent.sprite.visor, 3));
  head.add(place(antennaTip, 0.2, 0.62, -0.05));

  // Name tag and status stay readable even when furniture is in the way.
  const onTop = (sprite: THREE.Sprite) => {
    sprite.material.depthTest = false;
    sprite.renderOrder = 10;
    return sprite;
  };

  // Shadow, lift platform and selection ring sit under the feet.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.15, 24), standard("#64748b", { metalness: 0.9, roughness: 0.3 }));
  platform.position.y = -0.08;
  group.add(platform);
  const platformRim = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 6, 32), glow(0x38bdf8, 2));
  platformRim.rotation.x = Math.PI / 2;
  platformRim.position.y = 0;
  group.add(platformRim);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.1, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);

  // Name tag and status, floating above.
  const name = label(agent.name, 0.7, { color: "#e2e8f0", background: "rgba(2,6,23,0.7)", size: 40 });
  name.position.y = 4.75;
  group.add(onTop(name));
  const barBack = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x0f172a, depthWrite: false }));
  barBack.scale.set(1.6, 0.2, 1);
  barBack.position.y = 5.35;
  group.add(onTop(barBack));
  const barFill = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color(agent.sprite.suit), depthWrite: false, toneMapped: false }));
  barFill.center.set(0, 0.5);
  barFill.position.set(-0.8, 5.35, 0.01);
  group.add(onTop(barFill));
  const zz = label("z z", 0.6, { color: "#94a3b8", size: 40 });
  zz.position.set(0.7, 5.2, 0);
  group.add(onTop(zz));
  const paused = label("II", 0.7, { color: "#111", background: "#fbbf24", size: 40 });
  paused.position.y = 5.45;
  group.add(onTop(paused));

  let heading = 0;

  return {
    agentId: agent.id,
    group,
    update(current, walker, state, time, selected, hovered) {
      const x = sceneX(walker.x);
      const y = sceneY(walker.y);
      // Riding the lift: in the shaft and moving up or down.
      const riding = Math.abs(x - SHAFT_SCENE.x) < 0.05 && walker.moving && y !== group.position.y;
      group.position.set(x, y, WALK_Z);

      // Turn toward the direction of travel; face the viewer when standing.
      const goal = walker.moving && !riding ? walker.facing * (Math.PI / 2) : 0;
      heading += (goal - heading) * 0.15;
      body.rotation.y = heading;

      const walking = walker.moving && !riding;
      const swing = walking ? Math.sin(time * 10) * 0.6 : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      arms[0].rotation.x = -swing * 0.8;
      arms[1].rotation.x = swing * 0.8;
      const working = current.status === "working" && !walker.moving;
      // At work: hands busy at a console; idle: a slow breath.
      if (working) {
        arms[0].rotation.x = -1 + Math.sin(time * 8) * 0.25;
        arms[1].rotation.x = -1 + Math.cos(time * 8) * 0.25;
      }
      torso.position.y = 0.75 + (walking ? Math.abs(Math.sin(time * 10)) * 0.06 : Math.sin(time * 2) * 0.015);
      head.rotation.y = working ? Math.sin(time * 1.5) * 0.3 : 0;

      platform.visible = riding;
      platformRim.visible = riding;
      shadow.visible = !riding;
      ring.visible = selected || hovered;
      (ring.material as THREE.MeshBasicMaterial).opacity = selected ? 0.6 + 0.4 * Math.sin(time * 5) : 0.35;

      const task = current.taskId ? state.tasks.find((t) => t.id === current.taskId) : undefined;
      const showBar = current.status === "working" && !!task;
      barBack.visible = showBar;
      barFill.visible = showBar;
      barFill.scale.set(Math.max(0.02, 1.6 * (task?.progress ?? 0)), 0.2, 1);
      zz.visible = current.status === "idle" && !walker.moving;
      zz.position.y = 5.2 + ((time * 0.4) % 1) * 0.4;
      (zz.material as THREE.SpriteMaterial).opacity = 1 - ((time * 0.4) % 1);
      paused.visible = current.status === "paused";
      packLight.emissiveIntensity = current.status === "working" ? 1.5 + Math.sin(time * 6) : 0.4;
    },
  };
}
