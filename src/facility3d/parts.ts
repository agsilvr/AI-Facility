import * as THREE from "three";
import { textTexture, type TextOptions } from "./textures";

// Small building blocks shared by the rooms, the crew and the base.

export function box(w: number, h: number, d: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

export function standard(color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2, ...extra });
}

/** A material that glows (picked up by the bloom pass). */
export function glow(color: THREE.ColorRepresentation, intensity = 2) {
  return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
}

/** A parabolic dish with a dark rim, opening toward +y. */
export function dish(radius: number, depth: number, material: THREE.Material) {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const r = (radius * i) / 12;
    points.push(new THREE.Vector2(r, (depth * r * r) / (radius * radius)));
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.LatheGeometry(points, 32), material));
  // The rim keeps the dish's outline readable from any angle.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.05, 6, 40), standard("#334155", { metalness: 0.8, roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = depth;
  group.add(rim);
  return group;
}

/** A text label that always faces the camera. Height is in scene units. */
export function label(text: string, height: number, opts: TextOptions = {}) {
  const { texture, aspect } = textTexture(text, opts);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(height * aspect, height, 1);
  return sprite;
}

/** A text panel fixed to a wall (doesn't turn with the camera). */
export function plate(text: string, height: number, opts: TextOptions = {}) {
  const { texture, aspect } = textTexture(text, opts);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), material);
}

/** Put a mesh with its base at (x, y, z). */
export function place<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number): T {
  obj.position.set(x, y, z);
  return obj;
}

/** Free the GPU memory held by everything under an object. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      m.dispose();
    }
  });
}
