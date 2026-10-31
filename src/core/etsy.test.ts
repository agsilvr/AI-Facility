import { describe, expect, it } from "vitest";
import { ETSY_PUBLISH_GAP_MS, ETSY_PUBLISH_WINDOW_MS } from "./etsy";
import { Ledger } from "./ledger";
import { serializeDraft } from "./safety";
import { initialState } from "./seed";
import type { ListingDraft } from "./types";

function ready(ledger: Ledger, now: number, title: string) {
  const task = ledger.createTask("etsy", "listing", title);
  const draft: ListingDraft = { kind: "listing", title, description: "Original print with AI-assisted design.", tags: ["print"], priceUsd: 20 };
  // Start at the approved action boundary; approval binding has its own tests.
  Object.assign(task, { stageIndex: 4, draft, approvedAt: now, approvedContent: serializeDraft(draft) });
  return task.id;
}

describe("Etsy publishing guardrails", () => {
  it("reserves no more than three attempts in a rolling day, with no midnight reset", () => {
    let now = Date.UTC(2026, 9, 30, 23);
    const start = now;
    const ledger = new Ledger(initialState(), () => now);
    for (let i = 0; i < 3; i++) {
      const id = ready(ledger, now, `Print ${i}`);
      ledger.assign(id, "relay");
      expect(ledger.task(id)?.state).toBe("active");
      expect(ledger.mayAct(ledger.task(id)!)).toBe(true);
      ledger.finishStage(id, "Simulated success");
      now += ETSY_PUBLISH_GAP_MS;
    }
    const fourth = ready(ledger, now, "Print 4");
    ledger.assign(fourth, "relay");
    ledger.assign(fourth, "relay");
    expect(ledger.task(fourth)?.waiting).toContain("three attempts");
    expect(ledger.getState().etsyPublishAttempts).toHaveLength(3);
    expect(ledger.getState().log.filter((l) => l.text.includes("three attempts"))).toHaveLength(1);
    now = start + ETSY_PUBLISH_WINDOW_MS;
    ledger.assign(fourth, "relay");
    expect(ledger.task(fourth)?.state).toBe("active");
  });

  it("shares spacing and slots across workers and keeps completed attempts after task pruning", () => {
    let now = 1000;
    const state = initialState();
    state.agents.push({ ...state.agents.find((a) => a.id === "relay")!, id: "relay-2" });
    const ledger = new Ledger(state, () => now);
    const first = ready(ledger, now, "One");
    ledger.assign(first, "relay");
    const second = ready(ledger, now, "Two");
    ledger.assign(second, "relay-2");
    expect(ledger.task(second)?.waiting).toContain("four hours");
    ledger.finishStage(first, "Simulated success");
    ledger.getState().tasks = ledger.getState().tasks.filter((t) => t.id !== first);
    ledger.assign(second, "relay-2");
    expect(ledger.task(second)?.state).toBe("queued");
    now += ETSY_PUBLISH_GAP_MS;
    ledger.assign(second, "relay-2");
    expect(ledger.task(second)?.state).toBe("active");
  });

  it("retains uncertain attempts after restart and refuses replay or exact duplicates", () => {
    let now = 1000;
    const ledger = new Ledger(initialState(), () => now);
    const first = ready(ledger, now, "One");
    ledger.assign(first, "relay");
    const stale = ledger.task(first)!;
    now += ETSY_PUBLISH_GAP_MS;
    const recovered = new Ledger(Ledger.recover(JSON.parse(JSON.stringify(ledger.getState()))), () => now);
    expect(recovered.mayAct(stale)).toBe(false);
    recovered.assign(first, "relay");
    expect(recovered.task(first)?.waiting).toContain("Confirm its outcome");
    const duplicate = ready(recovered, now, "One");
    recovered.assign(duplicate, "relay");
    expect(recovered.task(duplicate)?.state).toBe("queued");
    expect(recovered.getState().etsyPublishAttempts).toHaveLength(1);
  });

  it("counts failed attempts and never refunds their quota", () => {
    let now = 1000;
    const ledger = new Ledger(initialState(), () => now);
    const id = ready(ledger, now, "One");
    ledger.assign(id, "relay");
    ledger.failStage(id, "Connection outcome unknown");
    expect(ledger.getState().etsyPublishAttempts).toHaveLength(1);
    ledger.decide(ledger.getState().approvals[0].id, false);
    now += ETSY_PUBLISH_GAP_MS;
    ledger.assign(id, "relay");
    expect(ledger.task(id)?.state).toBe("queued");
    expect(ledger.task(id)?.waiting).toContain("Confirm its outcome");
  });

  it("fails closed on corrupt history or a clock that moved backward", () => {
    let now = 1000;
    const ledger = new Ledger(initialState(), () => now);
    const first = ready(ledger, now, "One");
    ledger.assign(first, "relay");
    now--;
    expect(ledger.mayAct(ledger.task(first)!)).toBe(false);
    ledger.getState().etsyPublishAttempts![0].at = NaN;
    const second = ready(ledger, now, "Two");
    ledger.assign(second, "post"); // Wrong role cannot acquire a reservation.
    expect(ledger.getState().etsyPublishAttempts).toHaveLength(1);
    ledger.setAgentPaused("relay", true);
    ledger.setAgentPaused("relay", false);
    ledger.assign(second, "relay");
    expect(ledger.task(second)?.waiting).toContain("history or clock is invalid");
  });

  it("does not consume publishing quota for an unapproved listing or local research", () => {
    const ledger = new Ledger(initialState(), () => 1000);
    const id = ready(ledger, 1000, "One");
    ledger.task(id)!.approvedContent = undefined;
    ledger.assign(id, "relay");
    const research = ledger.createTask("etsy", "research-test", "Notebook");
    ledger.assign(research.id, "scout");
    expect(ledger.task(research.id)?.state).toBe("active");
    expect(ledger.getState().etsyPublishAttempts).toHaveLength(0);
  });
});
