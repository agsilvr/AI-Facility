import { describe, expect, it } from "vitest";
import { dispatch } from "../src/core/dispatch";
import { Facility } from "./facility";
import { Store } from "./store";

function setup() {
  const store = new Store(":memory:");
  const facility = new Facility(store);
  return { store, facility, ledger: facility.ledger };
}

describe("Recoverable queue reset", () => {
  it("archives unfinished work and artwork references, invalidates claims and leaves controls and financial history intact", () => {
    const { store, facility, ledger } = setup();
    const active = ledger.createTask("etsy", "listing", "Old product");
    const pending = ledger.createTask("etsy", "artwork-pilot", "Old illustration");
    dispatch(ledger);
    const claim = ledger.task(active.id)!;
    ledger.work(active.id, 0.1, 0.75);
    ledger.failStage(active.id, "Old failure");
    const stopped = ledger.task(active.id)!;
    stopped.artwork = { id: "saved-image", requestId: "saved-request", width: 1024, height: 1536, mime: "image/png" };
    ledger.assign(pending.id, "scout");
    const inFlight = ledger.task(pending.id)!;
    ledger.getState().etsyPublishAttempts = [{ taskId: active.id, runToken: "old-write", at: 1, content: "approved-content" }];
    ledger.setAgentPaused("muse", true);
    facility.setControl({ running: false });
    const before = ledger.getState();
    const result = facility.resetQueue("launch-reset-1", "Owner requested a fresh launch");
    expect(result.alreadyApplied).toBe(false);
    expect(ledger.getState().tasks).toEqual([]);
    expect(ledger.getState().approvals).toEqual([]);
    expect(result.archive.tasks).toHaveLength(2);
    expect(result.archive.tasks.find((t) => t.id === active.id)?.artwork?.id).toBe("saved-image");
    expect(result.archive.approvals).toHaveLength(1);
    expect(store.queueArchive("launch-reset-1")).toEqual(result.archive);
    expect(ledger.getState().spend).toEqual(before.spend);
    expect(ledger.getState().modelSpend).toEqual(before.modelSpend);
    expect(ledger.getState().operator).toEqual(before.operator);
    expect(ledger.getState().etsyPublishAttempts).toEqual(before.etsyPublishAttempts);
    expect(ledger.agent("muse")?.status).toBe("paused");
    expect(ledger.getState().agents.every((agent) => agent.taskId === null)).toBe(true);
    expect(ledger.mayWork(claim)).toBe(false);
    expect(ledger.mayWork(inFlight)).toBe(false);
    ledger.finishStage(pending.id, "Late output");
    expect(ledger.getState().tasks).toEqual([]);
    expect(new Facility(store).getControl().running).toBe(false);
    expect(store.getSetting("automatic_products")).toBe("false");
    store.close();
  });

  it("keeps late usage from an in-flight model in the budget without reviving its task", () => {
    const { store, facility, ledger } = setup();
    const task = ledger.createTask("etsy", "listing", "In flight");
    dispatch(ledger);
    facility.resetQueue("late-usage", "Fresh launch");
    ledger.recordUsage(task.id, "claude", 0.5);
    expect(ledger.getState().spend.etsy).toBe(0.5);
    expect(ledger.getState().modelSpend.claude).toBe(0.5);
    expect(ledger.task(task.id)).toBeUndefined();
    store.close();
  });

  it("applies an ID once across restart, preserving newly created tasks", () => {
    const { store, facility, ledger } = setup();
    ledger.createTask("etsy", "listing", "Old");
    const first = facility.resetQueue("once", "Reset");
    const fresh = ledger.createTask("etsy", "research-test", "Fresh research");
    facility.save();
    const restarted = new Facility(store);
    expect(restarted.resetQueue("once", "Reset again")).toEqual({ ...first, alreadyApplied: true });
    expect(restarted.ledger.task(fresh.id)).toBeDefined();
    expect(store.queueArchive("once")?.tasks.map((task) => task.title)).toEqual(["Old"]);
    store.close();
  });

  it("retains completed research and its historical completion count", () => {
    const { store, facility, ledger } = setup();
    const task = ledger.createTask("etsy", "research-test", "Completed research");
    dispatch(ledger);
    ledger.finishStage(task.id, "Saved notebook");
    const count = ledger.getState().completed;
    facility.resetQueue("history", "Fresh launch");
    expect(ledger.task(task.id)?.state).toBe("done");
    expect(ledger.getState().completed).toEqual(count);
    store.close();
  });

  it("does not mutate live work when the archive transaction fails", () => {
    const { store, ledger } = setup();
    const task = ledger.createTask("etsy", "listing", "Keep me");
    dispatch(ledger);
    const before = ledger.getState();
    expect(() => ledger.resetQueue("failed", "Test", () => { throw new Error("disk full"); })).toThrow("disk full");
    expect(ledger.getState()).toBe(before);
    expect(ledger.mayWork(ledger.task(task.id)!)).toBe(true);
    store.close();
  });

  it("rolls back the archive, snapshot and generator setting together", () => {
    const { store, facility, ledger } = setup();
    ledger.createTask("etsy", "listing", "Original");
    facility.resetQueue("duplicate", "First");
    const fresh = ledger.createTask("etsy", "listing", "Fresh");
    facility.save();
    const saved = store.load();
    store.setSetting("automatic_products", "true");
    expect(() => store.saveQueueReset({ id: "duplicate", at: 0, reason: "duplicate", tasks: [], approvals: [] }, { ...ledger.getState(), tasks: [] })).toThrow();
    expect(store.load()).toEqual(saved);
    expect(store.load()?.tasks.some((task) => task.id === fresh.id)).toBe(true);
    expect(store.getSetting("automatic_products")).toBe("true");
    store.close();
  });
});
