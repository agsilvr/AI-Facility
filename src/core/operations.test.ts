import { describe, expect, it } from "vitest";
import { Ledger } from "./ledger";
import { dispatch } from "./dispatch";
import { initialState } from "./seed";
import { visibleAgents, WORK_LEASE_MS, type WorkStart } from "./operations";
import { commandScreen, roomSignal } from "../facility/status";

function setup() {
  let now = Date.now();
  const ledger = new Ledger(initialState(), () => now);
  const input: WorkStart = { id: "reader-product", title: "Reader gift", phase: "design", worker: "codex", expectedRevision: 0, summary: "Generating the actual artwork", context: "Owner wants restrained detail", nextStep: "Check source PNG and provider mockup" };
  return { ledger, input, time: () => now, advance: (ms: number) => { now += ms; } };
}
describe("shared live work", () => {
  it("lights the correct workstation, reserves its agent and carries output into another operator's next phase", () => {
    const { ledger, input, time } = setup();
    const first = ledger.startOperation(input);
    expect(visibleAgents(ledger.getState(), time()).find((a) => a.id === "muse")?.status).toBe("working");
    expect(roomSignal(ledger.getState(), "etsy-studio", true, time())).toBe("running");
    const task = ledger.createTask("etsy", "listing", "Other job");
    task.stageIndex = 1;
    ledger.assign(task.id, "muse");
    expect(ledger.task(task.id)?.state).toBe("queued");
    dispatch(ledger);
    expect(ledger.task(task.id)?.agentId).not.toBe("muse");
    ledger.reportOperation(first.id, { runToken: first.runToken!, status: "done", summary: "Saved exact PNG v3", references: ["asset-v3-sha256"], context: "Exact wording and version retained" });
    const next = ledger.startOperation({ ...input, phase: "quality", worker: "claude", expectedRevision: 1 });
    expect(next.context).toBe(input.context); // Explicit context in a new claim deliberately replaces the previous value.
    expect(next.references).toEqual(["asset-v3-sha256"]);
    expect(next.history).toHaveLength(3);
    expect(visibleAgents(ledger.getState(), time()).find((a) => a.id === "pip")?.status).toBe("working");
    expect(() => ledger.reportOperation(first.id, { runToken: first.runToken!, status: "done" })).toThrow(/expired/);
  });
  it("rejects overlapping claims and stale revisions", () => {
    const { ledger, input } = setup();
    const op = ledger.startOperation(input);
    expect(() => ledger.startOperation(input)).toThrow(/changed/);
    expect(() => ledger.startOperation({ ...input, expectedRevision: 1 })).toThrow(/live worker/);
    ledger.reportOperation(op.id, { runToken: op.runToken!, status: "waiting" });
    expect(() => ledger.startOperation(input)).toThrow(/changed/);
    const { context: _, ...handoff } = input;
    expect(ledger.startOperation({ ...handoff, expectedRevision: 1 }).context).toBe(input.context);
  });
  it("expires a lost worker, retains its handoff and never pretends it completed", () => {
    const { ledger, input, advance, time } = setup();
    const op = ledger.startOperation(input);
    advance(WORK_LEASE_MS + 1);
    expect(roomSignal(ledger.getState(), "etsy-studio", true, time())).toBe("blocked");
    ledger.expireOperations();
    const saved = ledger.getState().operations![0];
    expect(saved).toMatchObject({ status: "blocked", context: input.context, nextStep: input.nextStep, runToken: undefined });
    expect(ledger.operationBusy("muse")).toBe(false);
    expect(() => ledger.reportOperation(op.id, { runToken: op.runToken! })).toThrow(/expired/);
  });
  it("heartbeats renew a lease without inventing progress or filling event history", () => {
    const { ledger, input, advance, time } = setup();
    const op = ledger.startOperation(input);
    advance(45_000);
    const beat = ledger.reportOperation(op.id, { runToken: op.runToken! });
    expect(beat.leaseUntil).toBe(time() + WORK_LEASE_MS);
    expect(beat.history).toHaveLength(1);
    expect(beat).not.toHaveProperty("progress");
  });
  it("pauses invalidate claims and checkpoints preserve feedback without assigning an agent", () => {
    const { ledger, input, time } = setup();
    const op = ledger.startOperation(input);
    ledger.stopOperations("Owner paused");
    expect(roomSignal(ledger.getState(), "etsy-studio", false, time())).toBe("paused");
    expect(() => ledger.reportOperation(op.id, { runToken: op.runToken!, status: "done" })).toThrow();
    const checkpoint = ledger.checkpointOperation({ ...input, status: "paused", expectedRevision: 1, summary: "Old artwork superseded; keep listing draft" });
    expect(checkpoint.status).toBe("paused");
    expect(ledger.operationBusy("muse")).toBe(false);
    expect(ledger.getState().approvals).toEqual([]);
    expect(ledger.getState().etsyPublishAttempts ?? []).toEqual([]);
  });
  it("restart interrupts external workers and preserves all context", () => {
    const { ledger, input } = setup();
    ledger.startOperation(input);
    const recovered = Ledger.recover(JSON.parse(JSON.stringify(ledger.getState())));
    expect(recovered.operations![0]).toMatchObject({ status: "blocked", context: input.context, nextStep: input.nextStep, runToken: undefined });
    expect(recovered.operations![0].history.at(-1)?.status).toBe("blocked");
  });
  it("never announces all clear while there is paused, stopped or active outside work", () => {
    const { ledger, input, time, advance } = setup();
    const op = ledger.startOperation(input);
    expect(commandScreen(ledger.getState(), time())).toMatchObject({ headline: "WORK RUNNING", detail: "1 ACTIVE" });
    ledger.checkpointOperation({ ...input, id: "another-paused-design", status: "paused", summary: "Saved for redesign" });
    expect(visibleAgents(ledger.getState(), time()).find((a) => a.id === "muse")?.status).toBe("working");
    expect(commandScreen(ledger.getState(), time()).headline).toBe("WORK ON HOLD");
    advance(WORK_LEASE_MS + 1);
    expect(commandScreen(ledger.getState(), time()).headline).toBe("WORK STOPPED");
    ledger.expireOperations();
    expect(() => ledger.reportOperation(op.id, { runToken: op.runToken!, status: "done" })).toThrow();
  });
});
