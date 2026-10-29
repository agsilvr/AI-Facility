import { describe, expect, it } from "vitest";
import { Ledger } from "../core/ledger";
import { initialState } from "../core/seed";
import { DemoSimulation } from "./demo";

describe("DemoSimulation", () => {
  it("produces work that reaches the owner for approval and never exceeds budgets", () => {
    let seed = 1;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const ledger = new Ledger(initialState());
    const sim = new DemoSimulation(ledger, { rand });
    for (let i = 0; i < 1200; i++) sim.tick(0.1);

    const state = ledger.getState();
    expect(state.tasks.length).toBeGreaterThan(3);
    expect(state.approvals.some((a) => a.status === "pending")).toBe(true);
    // Nothing published without an approval.
    expect(state.tasks.filter((t) => t.wingId === "etsy" && t.state === "done")).toHaveLength(0);
    for (const wing of state.wings) {
      // Spend can overshoot by at most one tick of one agent per wing.
      expect(state.spend[wing.id] ?? 0).toBeLessThanOrEqual(wing.budgetMonthly + 1);
    }
  });
});
