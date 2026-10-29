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

/** A parabolic dish, opening toward +y. */
export function dish(radius: number, depth: number, material: THREE.Material) {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const r = (radius * i) / 12;
    points.push(new THREE.Vector2(r, (depth * r * r) / (radius * radius)));
  }
  return new THREE.Mesh(new THREE.LatheGeometry(points, 32), material);
}

let fade: THREE.Texture | null = null;

/** Vertical fade, bright at the top: makes light beams soft instead of solid. */
function fadeTexture() {
  if (fade) return fade;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.5, "#444");
  g.addColorStop(1, "#000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  fade = new THREE.CanvasTexture(c);
  return fade;
}

/** A soft cone of light; its tip is at the top. */
export function lightCone(color: THREE.ColorRepresentation, radius: number, height: number, opacity = 0.09) {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      alphaMap: fadeTexture(),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  return cone;
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
