import { describe, expect, it } from "vitest";
import { Ledger } from "../../src/core/ledger";
import { initialState } from "../../src/core/seed";
import { RESEARCH_INTERVAL_MS } from "../../src/core/research";
import { researchNotebook } from "../test-research";
import { planResearch } from "./research";

describe("daily research planning", () => {
  const start = Date.UTC(2026, 9, 30, 12);
  const notebooks = (ledger: Ledger) => ledger.getState().tasks.filter((t) => t.workflowId === "research-test");

  it("keeps researching independently of three product drafts waiting for approval", () => {
    const ledger = new Ledger(initialState(), () => start);
    for (let i = 0; i < 3; i++) ledger.createTask("etsy", "listing", `Pending ${i}`).state = "awaiting_approval";
    planResearch(ledger, start);
    planResearch(ledger, start);
    expect(notebooks(ledger)).toHaveLength(1);
    expect(notebooks(ledger)[0]).toMatchObject({ state: "queued", title: "Daily print research" });
  });

  it("uses the saved clock across restarts, including manual notebook runs", () => {
    let now = start;
    const first = new Ledger(initialState(), () => now);
    first.createTask("etsy", "research-test", "Manual notebook").state = "done";
    now = start + RESEARCH_INTERVAL_MS - 1;
    const restored = new Ledger(Ledger.recover(first.getState()), () => now);
    planResearch(restored, now);
    expect(notebooks(restored)).toHaveLength(1);
    now++;
    planResearch(restored, now);
    planResearch(restored, now + RESEARCH_INTERVAL_MS * 5);
    expect(notebooks(restored)).toHaveLength(2);
    expect(notebooks(restored)[1].createdAt).toBe(now);
  });

  it.each(["queued", "active", "awaiting_approval"] as const)("does not duplicate or retry a %s notebook, even days later", (state) => {
    const ledger = new Ledger(initialState(), () => start);
    ledger.createTask("etsy", "research-test", "Existing notebook").state = state;
    planResearch(ledger, start + RESEARCH_INTERVAL_MS * 7);
    expect(notebooks(ledger)).toHaveLength(1);
  });

  it("does not spend another run on the same source pack after a day or restart", () => {
    const ledger = new Ledger(initialState(), () => start);
    const task = ledger.createTask("etsy", "research-test", "Validated notebook");
    task.state = "done"; task.brief = JSON.stringify(researchNotebook());
    const restored = new Ledger(Ledger.recover(ledger.getState()), () => start + RESEARCH_INTERVAL_MS * 2);
    planResearch(restored, start + RESEARCH_INTERVAL_MS * 2);
    expect(notebooks(restored)).toHaveLength(1);
  });

  it("creates only one notebook after several days offline", () => {
    const ledger = new Ledger(initialState(), () => start);
    ledger.createTask("etsy", "research-test", "Old notebook").state = "done";
    planResearch(ledger, start + RESEARCH_INTERVAL_MS * 7);
    expect(notebooks(ledger)).toHaveLength(2);
  });

  it.each([false, true])("waits for refreshed evidence when the pack expires (prior notebook: %s)", (existing) => {
    const ledger = new Ledger(initialState(), () => start);
    if (existing) {
      const task = ledger.createTask("etsy", "research-test", "Validated notebook");
      task.state = "done"; task.brief = JSON.stringify(researchNotebook());
    }
    const expired = start + RESEARCH_INTERVAL_MS * 31;
    const restored = new Ledger(Ledger.recover(ledger.getState()), () => expired);
    planResearch(restored, expired);
    planResearch(restored, expired + RESEARCH_INTERVAL_MS);
    expect(notebooks(restored)).toHaveLength(existing ? 1 : 0);
  });
});
