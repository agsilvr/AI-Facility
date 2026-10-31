import { MARGIN, TILE, type FacilityLayout, type Rect } from "./layout";

// The map's camera: which point of the world is in the middle of the screen,
// and how many screen pixels each art pixel takes. Plain numbers, so it is
// unit tested. Whole-number zooms keep the pixel art crisp, so the zoom
// buttons and the mouse wheel step through a fixed ladder.

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6];
export const MAX_ZOOM = ZOOMS[ZOOMS.length - 1];

/** The zoom at which the whole facility fits on screen. */
export function fitZoom(layout: FacilityLayout, view: Viewport) {
  return Math.min(view.width / layout.width, view.height / layout.height);
}

/** The lowest zoom allowed: the whole facility, or the bottom of the ladder if that's bigger. */
export function minZoom(layout: FacilityLayout, view: Viewport) {
  return Math.min(ZOOMS[0], fitZoom(layout, view));
}

/** The next rung up or down the zoom ladder from where we are. */
export function stepZoom(zoom: number, direction: 1 | -1) {
  if (direction > 0) return ZOOMS.find((z) => z > zoom + 1e-6) ?? MAX_ZOOM;
  return [...ZOOMS].reverse().find((z) => z < zoom - 1e-6) ?? ZOOMS[0];
}

/** The biggest rung at which an area fits on screen. */
export function zoomToFit(area: { w: number; h: number }, view: Viewport) {
  const fit = Math.min(view.width / area.w, view.height / area.h);
  return fit;
}

/** Keep the camera over the facility; if the facility is smaller than the screen, centre it. */
export function clampCamera(camera: Camera, layout: FacilityLayout, view: Viewport, lo = minZoom(layout, view)): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(lo, camera.zoom));
  const halfW = view.width / zoom / 2;
  const halfH = view.height / zoom / 2;
  const x = halfW * 2 >= layout.width ? layout.width / 2 : Math.min(layout.width - halfW, Math.max(halfW, camera.x));
  const y = halfH * 2 >= layout.height ? layout.height / 2 : Math.min(layout.height - halfH, Math.max(halfH, camera.y));
  return { x, y, zoom };
}

/** Zoom while keeping the world point under the given screen point where it is. */
export function zoomAround(camera: Camera, zoom: number, screen: { x: number; y: number }, view: Viewport): Camera {
  const wx = camera.x + (screen.x - view.width / 2) / camera.zoom;
  const wy = camera.y + (screen.y - view.height / 2) / camera.zoom;
  return { zoom, x: wx - (screen.x - view.width / 2) / zoom, y: wy - (screen.y - view.height / 2) / zoom };
}

/** The world point under a screen point. */
export function toWorld(camera: Camera, screen: { x: number; y: number }, view: Viewport) {
  return { x: camera.x + (screen.x - view.width / 2) / camera.zoom, y: camera.y + (screen.y - view.height / 2) / camera.zoom };
}

/** Where the map opens: as big as fits the facility's height, centred on the Command Center. */
export function startCamera(layout: FacilityLayout, view: Viewport): Camera {
  const zoom = zoomToFit({ w: layout.width, h: layout.height }, view);
  return clampCamera({ zoom, x: layout.width / 2, y: layout.height / 2 }, layout, view);
}

/** The camera for looking at an area, such as a wing or a room. */
export function focusCamera(area: Rect, layout: FacilityLayout, view: Viewport, margin = 1.3, maxZoom = 4): Camera {
  const zoom = Math.min(maxZoom, zoomToFit({ w: area.w * margin, h: area.h * margin }, view));
  return clampCamera({ zoom, x: area.x + area.w / 2, y: area.y + area.h / 2 }, layout, view);
}

/** The stretch of the map belonging to a wing: its rooms on both sides of the hall. */
export function wingArea(layout: FacilityLayout, wingId: string): Rect | null {
  const wing = layout.wings.find((w) => w.wingId === wingId);
  if (!wing) return null;
  const y = MARGIN - TILE;
  return { x: wing.x0 - TILE, y, w: wing.x1 - wing.x0 + TILE * 2, h: layout.height - y * 2 };
}
