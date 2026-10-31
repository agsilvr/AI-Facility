import { describe, expect, it } from "vitest";
import { parseWorkReport, parseWorkStart } from "./work";
import { Facility } from "./facility";
import { Store } from "./store";
import { createFacilityServer } from "./http";
import type { AddressInfo } from "node:net";

const start = { id: "sync-work", title: "Facility synchronization", phase: "maintenance", worker: "codex", expectedRevision: 0, summary: "Implementing actual work telemetry", context: "Saved result", nextStep: "Verify map and handoff" };
describe("work record boundary", () => {
  it("rejects invented phases, actions, roles, privileges and oversized inputs", () => {
    for (const input of [{ ...start, phase: "publish" }, { ...start, worker: "admin" }, { ...start, approvedContent: "anything" }, { ...start, worker: "qwen" }, { ...start, context: "x".repeat(10001) }, { ...start, expectedRevision: -1 }, { ...start, phase: "__proto__" }]) expect(() => parseWorkStart(input)).toThrow();
    expect(() => parseWorkReport({ runToken: "token", approve: true })).toThrow();
    expect(() => parseWorkReport({ runToken: "token", status: "approved" })).toThrow();
  });
  it("persists truthful status and enforces pause, conflict, stale result and origin checks over HTTP", async () => {
    const store = new Store(":memory:");
    const facility = new Facility(store, () => ({ tick() {} }));
    facility.setControl({ running: false });
    const server = createFacilityServer(facility, { staticDir: null, allowedHosts: ["127.0.0.1"] });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (path: string, body: unknown, origin = base) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
    try {
      expect((await post("/api/work/start", { ...start, phase: "design" })).status).toBe(409);
      expect((await post("/api/work/start", start, "https://outside.invalid")).status).toBe(403);
      const res = await post("/api/work/start", start);
      expect(res.status).toBe(200);
      const { work } = await res.json();
      expect((await fetch(base + "/api/state").then((r) => r.json())).state.operations[0].status).toBe("running");
      expect((await post("/api/work/start", start)).status).toBe(409);
      const context = await fetch(base + "/api/work/sync-work/context").then((r) => r.json());
      expect(context).toMatchObject({ productionRunning: false, work: { context: start.context, nextStep: start.nextStep } });
      expect(context.guidance).toContain("docs/DESIGN-QUALITY.md");
      const done = await post("/api/work/sync-work/report", { runToken: work.runToken, status: "done", summary: "Verified output" });
      expect(done.status).toBe(200);
      expect(new Facility(store).ledger.getState().operations![0].status).toBe("done");
      const checkpoint = await post("/api/work/checkpoint", { ...start, id: "first-listing", phase: "design", status: "paused", summary: "Design superseded; draft retained" });
      expect(checkpoint.status).toBe(200);
      expect(facility.ledger.operationBusy("muse")).toBe(false);
      expect((await post("/api/work/start", { ...start, expectedRevision: 1 })).status).toBe(200);
      facility.setControl({ running: false }); // Re-pressing Pause stops maintenance as well.
      expect((await post("/api/work/sync-work/report", { runToken: work.runToken, status: "done" })).status).toBe(409);
      expect(facility.getControl().running).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.close();
    }
  });
});
