import { describe, expect, it } from "vitest";
import { validate } from "../../server/agents/reader";
import { RESEARCH_SCHEMA, RESEARCH_SOURCES } from "./research";

import { researchOutput, researchNotebook } from "../../server/test-research";
import { currentResearch, readResearch, researchEvidenceProblem, type ResearchOpportunity } from "./research";

describe("public research evidence contract", () => {
  it("accepts three cited product families and rejects invented citations or incomplete comparisons", () => {
    expect(validate(researchOutput, RESEARCH_SCHEMA)).toBeNull();
    expect(validate({ opportunities: [] }, RESEARCH_SCHEMA)).toContain("too few");
    const fake = structuredClone(researchOutput);
    fake.opportunities[0].sourceIds[0] = "invented-sales-api";
    expect(validate(fake, RESEARCH_SCHEMA)).toContain("not an allowed choice");
  });
  it("does not treat a supplier as buyer evidence or use poster specs for clothing", () => {
    const fake = structuredClone(researchOutput);
    fake.opportunities[0].sourceIds = ["printify-crewneck", "printify-posters"];
    expect(researchEvidenceProblem(fake.opportunities as unknown as ResearchOpportunity[])).toContain("buyer evidence");
    fake.opportunities[0].sourceIds = ["etsy-book-club-item", "printify-posters"];
    expect(researchEvidenceProblem(fake.opportunities as unknown as ResearchOpportunity[])).toContain("own supplier");
  });
  it("rejects fabricated factual text, obsolete evidence and malformed saved notebooks", () => {
    const now = Date.UTC(2026, 9, 31);
    const valid = researchNotebook();
    expect(currentResearch(valid, now)).toBe(true);
    valid.opportunities[0].evidence = "Guaranteed $10,000 profit";
    expect(currentResearch(valid, now)).toBe(false);
    expect(currentResearch(researchNotebook(), now + 31 * 86400000)).toBe(false);
    expect(currentResearch({ ...researchNotebook(), evidenceVersion: undefined }, now)).toBe(false);
    expect(readResearch('{"kind":"research-report","opportunities":[null]}')).toBeNull();
    expect(readResearch(JSON.stringify({ ...researchNotebook(), sources: null }))).toBeNull();
  });

  it("rejects the unsupported demand claim observed in the real local model smoke test", () => {
    const fake = researchNotebook();
    fake.opportunities[0].concept = "A reading print, avoiding sweatshirts which lack demand evidence.";
    expect(researchEvidenceProblem(fake.opportunities)).toContain("market-performance");
    fake.opportunities[0].concept = "A bestselling print guaranteed to sell.";
    expect(researchEvidenceProblem(fake.opportunities)).toContain("market-performance");
    fake.opportunities[0].concept = "A generic book to remain non-copyrighted.";
    expect(researchEvidenceProblem(fake.opportunities)).toContain("provenance");
  });

  it("rejects malformed saved creative fields without crashing readiness", () => {
    for (const keyword of [7, null, {}, ["reader gift"]]) {
      const saved = researchNotebook();
      Object.assign(saved.opportunities[0], { keyword });
      expect(readResearch(JSON.stringify(saved))).toBeNull();
      expect(currentResearch(saved, Date.UTC(2026, 9, 31))).toBe(false);
    }
  });

  it("does not certify edited summaries or removed evidence limitations", () => {
    const now = Date.UTC(2026, 9, 31);
    const summary = researchNotebook();
    summary.summary = "These products are proven to earn $10,000 per month.";
    expect(currentResearch(summary, now)).toBe(false);
    const limitations = researchNotebook();
    limitations.limitations = [];
    expect(currentResearch(limitations, now)).toBe(false);
  });

  it("preserves distinct provenance for trends, purchase reviews and supply information", () => {
    expect(new Set(RESEARCH_SOURCES.map((source) => source.id)).size).toBe(RESEARCH_SOURCES.length);
    for (const source of RESEARCH_SOURCES) {
      expect(source.url).toMatch(/^https:\/\/(?:www\.)?(?:etsy\.com|printify\.com|help\.printify\.com)\//);
      expect(source.checkedAt).toBe("2026-10-30");
      expect(source.period.length).toBeGreaterThan(20);
      expect(["demand", "item-observation", "supplier-capability"]).toContain(source.role);
    }
    expect(RESEARCH_SOURCES.find((source) => source.id === "etsy-gallery-trend")).toMatchObject({ role: "demand", evidenceType: "marketplace-category-trend" });
    expect(RESEARCH_SOURCES.find((source) => source.id === "printify-posters")?.role).toBe("supplier-capability");
    expect(RESEARCH_SOURCES.find((source) => source.id === "etsy-seasonal")?.period).toContain("2026-09-14");
    expect(RESEARCH_SOURCES.find((source) => source.id === "etsy-book-club-item")?.notes).toContain("entire shop, not this listing");
    expect(RESEARCH_SOURCES.find((source) => source.id === "printify-posters")?.notes).toContain("supply only, not demand");
  });
});
