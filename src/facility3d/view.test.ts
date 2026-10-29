import { describe, expect, it } from "vitest";
import { easeInOut, fitDistance, focusOn, FrameMeter, nextQuality, QUALITY } from "./view";

describe("camera framing", () => {
  it("backs off further for a bigger box", () => {
    expect(fitDistance(30, 1.5, 100, 40)).toBeGreaterThan(fitDistance(30, 1.5, 50, 20));
  });

  it("is limited by width on narrow screens and by height on wide ones", () => {
    const narrow = fitDistance(30, 0.5, 100, 40);
    const wide = fitDistance(30, 3, 100, 40);
    expect(narrow).toBeCloseTo(100 / (2 * Math.tan(Math.PI / 12) * 0.5));
    expect(wide).toBeCloseTo(40 / (2 * Math.tan(Math.PI / 12)));
  });

  it("looks down at the centre of an area from above and in front", () => {
    const area = { x0: 10, x1: 30, z0: -5, z1: 5, y: -7, h: 5 };
    const f = focusOn(area, 30, 1.6, 1.3, 0.9, 0);
    expect(f.target[0]).toBe(20);
    expect(f.target[2]).toBe(0);
    expect(f.position[0]).toBeCloseTo(20);
    expect(f.position[1]).toBeGreaterThan(f.target[1]);
    expect(f.position[2]).toBeGreaterThan(f.target[2]);
    // Looking down at the chosen angle.
    const flat = Math.hypot(f.position[0] - f.target[0], f.position[2] - f.target[2]);
    expect(Math.atan2(f.position[1] - f.target[1], flat)).toBeCloseTo(0.9);
  });

  it("backs off further for a bigger area, and turns with the azimuth", () => {
    const small = focusOn({ x0: 0, x1: 10, z0: 0, z1: 10, y: 0, h: 5 }, 30, 1.6);
    const big = focusOn({ x0: 0, x1: 100, z0: 0, z1: 10, y: 0, h: 5 }, 30, 1.6);
    const reach = (f: typeof small) => Math.hypot(...f.position.map((v, i) => v - f.target[i]));
    expect(reach(big)).toBeGreaterThan(reach(small));
    const turned = focusOn({ x0: 0, x1: 10, z0: 0, z1: 10, y: 0, h: 5 }, 30, 1.6, 1.3, 0.9, 0.5);
    expect(turned.position[0]).toBeGreaterThan(turned.target[0]);
  });

  it("eases smoothly from start to end", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
    for (let t = 0; t < 1; t += 0.05) expect(easeInOut(t + 0.05)).toBeGreaterThanOrEqual(easeInOut(t));
  });
});

describe("adaptive quality", () => {
  it("steps down one level at a time when frames are slow, and stops at the lowest", () => {
    let level = 0;
    for (let i = 0; i < 10; i++) level = nextQuality(level, 10);
    expect(level).toBe(QUALITY.length - 1);
    expect(nextQuality(0, 10)).toBe(1);
  });

  it("keeps full quality when frames are smooth", () => {
    expect(nextQuality(0, 60)).toBe(0);
  });

  it("drops glow before anything else is lost entirely", () => {
    expect(QUALITY[0].bloom).toBe(true);
    expect(QUALITY[QUALITY.length - 1].bloom).toBe(false);
    for (let i = 1; i < QUALITY.length; i++) expect(QUALITY[i].pixelRatio).toBeLessThanOrEqual(QUALITY[i - 1].pixelRatio);
  });

  it("measures frame rate over a window", () => {
    const meter = new FrameMeter(1);
    let result: number | null = null;
    for (let i = 0; i < 30 && result === null; i++) result = meter.add(0.05);
    expect(result).toBeCloseTo(20);
  });
});
