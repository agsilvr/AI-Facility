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

  it("looks at the centre of a room from in front of it", () => {
    const f = focusOn({ x0: 10, x1: 30, top: -5, bottom: -15 }, 30, 1.6);
    expect(f.target).toEqual([20, -10, 0]);
    expect(f.position[2]).toBeGreaterThan(20);
    expect(f.position[0]).toBeGreaterThan(20);
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
