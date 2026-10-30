import { describe, expect, it } from "vitest";
import { rooms, wings } from "../core/seed";
import { clampCamera, focusCamera, startCamera, stepZoom, toWorld, wingArea, zoomAround, ZOOMS } from "./camera";
import { buildLayout } from "./layout";

const layout = buildLayout(wings, rooms);
const desktop = { width: 1000, height: 640 };
const phone = { width: 360, height: 400 };

describe("map camera", () => {
  it("steps the zoom one rung at a time and stops at the ends", () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1.5, -1)).toBe(1);
    expect(stepZoom(1.2, 1)).toBe(1.5);
    expect(stepZoom(ZOOMS[ZOOMS.length - 1], 1)).toBe(ZOOMS[ZOOMS.length - 1]);
    expect(stepZoom(ZOOMS[0], -1)).toBe(ZOOMS[0]);
  });

  it("opens with the entire branching facility in view", () => {
    for (const view of [desktop, phone]) {
      const cam = startCamera(layout, view);
      expect(layout.width * cam.zoom).toBeLessThanOrEqual(view.width);
      expect(layout.height * cam.zoom).toBeLessThanOrEqual(view.height);
      expect(cam.x).toBeCloseTo(layout.width / 2);
    }
  });

  it("never lets the map be dragged off screen", () => {
    const cam = clampCamera({ x: -5000, y: 99999, zoom: 3 }, layout, desktop);
    expect(cam.x - desktop.width / 3 / 2).toBeCloseTo(0);
    expect(cam.y + desktop.height / 3 / 2).toBeCloseTo(layout.height);
    expect(clampCamera({ x: 0, y: 0, zoom: 99 }, layout, desktop).zoom).toBe(ZOOMS[ZOOMS.length - 1]);
  });

  it("keeps the point under the pointer still while zooming", () => {
    const cam = { x: 300, y: 200, zoom: 2 };
    const pointer = { x: 700, y: 100 };
    const before = toWorld(cam, pointer, desktop);
    const after = toWorld(zoomAround(cam, 4, pointer, desktop), pointer, desktop);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("frames a whole wing when you jump to it", () => {
    const area = wingArea(layout, "etsy")!;
    const cam = focusCamera(area, layout, desktop, 1.05, 3);
    expect(area.w * cam.zoom).toBeLessThanOrEqual(desktop.width);
    expect(cam.x).toBeCloseTo(Math.min(area.x + area.w / 2, layout.width - desktop.width / cam.zoom / 2));
    expect(wingArea(layout, "nope")).toBeNull();
  });
});
