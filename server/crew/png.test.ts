import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { testPng } from "../test-png";
import { Designs } from "./designs";
import { inspectPng } from "./png";

describe("generated artwork integrity", () => {
  it("decodes PNG dimensions and rejects damaged or truncated image data", () => {
    expect(inspectPng(testPng())).toMatchObject({ width: 2, height: 3, inspection: { opaquePixels: 6, transparentPixels: 0, visibleBounds: { x: 0, y: 0, width: 2, height: 3 } } });
    const damaged = testPng(); damaged[damaged.length - 1] ^= 1;
    expect(() => inspectPng(damaged)).toThrow(/checksum/);
    expect(() => inspectPng(testPng().subarray(0, 45))).toThrow();
    expect(() => inspectPng(Buffer.from('<svg onload="alert(1)"></svg>'))).toThrow();
  });

  it.each([0, 1, 2, 3, 4])("decodes alpha and visible bounds with PNG filter %s", (filter) => {
    // First pixel is transparent, second is opaque. A second identical row
    // exercises Up, Average and Paeth reconstruction, not just the header.
    const first = [0, 0, 0, 0, 0, 0, 0, 0, 255];
    const alphaDelta = filter === 2 || filter === 4 ? 0 : filter === 3 ? 128 : 255;
    const second = [filter, 0, 0, 0, 0, 0, 0, 0, alphaDelta];
    const result = inspectPng(testPng(2, 2, Buffer.from([...first, ...second])));
    expect(result.inspection).toEqual({ transparentPixels: 2, semiTransparentPixels: 0, opaquePixels: 2,
      visibleBounds: { x: 1, y: 0, width: 1, height: 2 } });
  });

  it("preserves partial alpha and refuses an entirely invisible saved design", () => {
    expect(inspectPng(testPng(1, 1, Buffer.from([0, 50, 60, 70, 128]))).inspection)
      .toMatchObject({ semiTransparentPixels: 1, transparentPixels: 0, opaquePixels: 0 });
    const dir = mkdtempSync(join(tmpdir(), "artwork-empty-"));
    try { expect(() => new Designs(dir).savePng(testPng(1, 1, Buffer.alloc(5)))).toThrow(/entirely transparent/); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("stores immutable full-fingerprint PNGs and refuses tampered content", () => {
    const dir = mkdtempSync(join(tmpdir(), "artwork-qc-"));
    try {
      const designs = new Designs(dir);
      const asset = designs.savePng(testPng());
      expect(asset.id).toMatch(/^[0-9a-f]{64}$/);
      expect(designs.asset(asset.id)).toMatchObject({ mime: "image/png", width: 2, height: 3 });
      expect(designs.asset("../facility.db")).toBeNull();
      writeFileSync(join(dir, "designs", `${asset.id}.png`), testPng(3, 2));
      expect(designs.asset(asset.id)).toBeNull();
      expect(() => designs.savePng(testPng())).toThrow(/fingerprint/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
