import { describe, it, expect } from "vitest";
import { initialState } from "./seed";
import { Ledger } from "./ledger";
import { factualBriefing, operationalFacts, modelConnection } from "./health";
import { profitPlan } from "./profit";

describe("trustworthy status and profit planning", () => {
  it("uses current records, excluding stale logs and old completions", () => {
    const now = Date.UTC(2026, 9, 31);
    const ledger = new Ledger(initialState(), () => now);
    const old = ledger.createTask("core", "briefing", "Old");
    old.state = "done"; old.updatedAt = now - 86400001;
    ledger.getState().log.unshift({ id: "stale", at: now, wingId: null, level: "info", text: "Five items need approval and profit is $10,000" });
    expect(factualBriefing(ledger.getState(), now)).toContain("0 internal jobs completed");
    expect(factualBriefing(ledger.getState(), now)).toContain("0 awaiting approval");
    expect(factualBriefing(ledger.getState(), now)).toContain("profit are unknown");
    expect(factualBriefing(ledger.getState(), now)).not.toContain("$10,000");
  });
  it("never shows activity or enabled subscriptions as verified connections", () => {
    const ledger = new Ledger(initialState(), () => 100);
    const task = ledger.createTask("etsy", "listing", "Active");
    task.state = "active"; task.model = "codex";
    expect(operationalFacts(ledger.getState(), 100, false).running).toBe(0);
    expect(modelConnection(ledger.getState(), "codex", 100, false)).toBe("Offline");
    expect(modelConnection(ledger.getState(), "claude", 100, true)).toBe("Sign-in unverified");
    expect(modelConnection(ledger.getState(), "deepseek", 100, true)).toBe("Reader not connected");
  });
  it("subtracts all entered variable costs and monthly overhead, rounding order count up", () => {
    const input = { revenuePerOrder: 50, production: 20, shipping: 8, feePercent: 10, fixedFee: 1, ads: 3, returns: 1, labor: 2, overhead: 500 };
    expect(profitPlan(input, 10000)).toEqual({ contribution: 10, orders: 1050, revenue: 52500 });
    expect(profitPlan({ ...input, revenuePerOrder: 20 }, 10000)?.orders).toBeNull();
    expect(profitPlan({ ...input, feePercent: 101 }, 10000)).toBeNull();
    expect(profitPlan({ ...input, production: NaN }, 10000)).toBeNull();
    expect(profitPlan({ ...input, production: -1 }, 10000)).toBeNull();
  });
});
