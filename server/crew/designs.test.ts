import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Designs, lines, typeDesign } from "./designs";

const dir = mkdtempSync(join(tmpdir(), "facility-designs-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("designs", () => {
  it("names a design by its content, so a listing names exactly one artwork", () => {
    const designs = new Designs(dir);
    const id = designs.save("<svg>a</svg>");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(designs.save("<svg>a</svg>")).toBe(id);
    expect(designs.save("<svg>b</svg>")).not.toBe(id);
    expect(designs.read(id)).toBe("<svg>a</svg>");
  });

  it("only reads saved designs, never other files", () => {
    const designs = new Designs(dir);
    for (const bad of ["../facility.db", "..%2Ffacility.db", "abc", "0123456789abcdef.svg", ""]) expect(designs.read(bad)).toBeNull();
  });

  it("sets the phrase in a type design without letting it add markup", () => {
    const svg = typeDesign('Plant <script>alert(1)</script> "Parent"', "seed");
    expect(svg).toContain("PLANT");
    expect(svg).not.toContain("<script");
    expect(svg).not.toMatch(/href|onload|javascript:/i);
  });

  it("breaks a phrase into at most three lines", () => {
    expect(lines("Plant Parent")).toEqual(["Plant Parent"]);
    expect(lines("one two three four five six seven eight nine ten").length).toBeLessThanOrEqual(3);
  });
});
