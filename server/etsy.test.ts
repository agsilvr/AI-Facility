import { describe, expect, it, vi } from "vitest";
import { serializeDraft } from "../src/core/safety";
import { Facility } from "./facility";
import { Store } from "./store";

function approvedListing(facility: Facility) {
  const task = facility.ledger.createTask("etsy", "listing", "Moon print");
  const draft = { kind: "listing" as const, title: "Moon print", description: "AI-assisted print", tags: ["moon"], priceUsd: 20 };
  Object.assign(task, { stageIndex: 4, draft, approvedAt: Date.now(), approvedContent: serializeDraft(draft) });
  return task.id;
}

describe("Durable Etsy publishing reservations", () => {
  it("saves before assigning an actor, without waiting for a tick, and retains the quota on restart", () => {
    const store = new Store(":memory:");
    try {
      const facility = new Facility(store);
      const id = approvedListing(facility);
      const save = vi.spyOn(store, "save");
      facility.ledger.assign(id, "relay");
      expect(save).toHaveBeenCalledTimes(1);
      expect(store.load()?.etsyPublishAttempts).toHaveLength(1);
      // Disk contains the reservation before the task can execute outward code.
      expect(store.load()?.tasks.find((t) => t.id === id)?.state).toBe("queued");
      const restarted = new Facility(store);
      restarted.ledger.assign(id, "relay");
      expect(restarted.ledger.task(id)?.state).toBe("queued");
      expect(restarted.ledger.task(id)?.waiting).toContain("Confirm its outcome");
      expect(restarted.ledger.getState().etsyPublishAttempts).toHaveLength(1);
    } finally { store.close(); }
  });

  it("does not assign an actor or authorize a write if saving the reservation fails", () => {
    const store = new Store(":memory:");
    try {
      const facility = new Facility(store);
      const id = approvedListing(facility);
      vi.spyOn(store, "save").mockImplementation(() => { throw new Error("disk full"); });
      expect(() => facility.ledger.assign(id, "relay")).toThrow("disk full");
      expect(facility.ledger.task(id)?.state).toBe("queued");
      expect(facility.ledger.agent("relay")?.taskId).toBeNull();
      expect(facility.ledger.mayAct(facility.ledger.task(id)!)).toBe(false);
    } finally { store.close(); }
  });
});
