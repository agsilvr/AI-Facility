import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dispatch } from "../src/core/dispatch";
import { Designs } from "./crew/designs";
import { Facility } from "./facility";
import { createFacilityServer } from "./http";
import { Store } from "./store";

describe("Store", () => {
  it("saves and reloads the facility, keeping log history", () => {
    const store = new Store(":memory:");
    const facility = new Facility(store);
    facility.ledger.createTask("etsy", "listing", "Saved task");
    facility.save();
    const loaded = store.load()!;
    expect(loaded.tasks.map((t) => t.title)).toContain("Saved task");
    expect(store.historyCount()).toBeGreaterThan(0);
  });

  it("recovers interrupted work when the facility starts from a saved state", () => {
    const store = new Store(":memory:");
    const first = new Facility(store);
    const task = first.ledger.createTask("etsy", "listing", "Mid-flight");
    dispatch(first.ledger);
    first.save();
    const second = new Facility(store);
    expect(second.ledger.task(task.id)?.state).toBe("queued");
  });
});

describe("Audit trail", () => {
  const entry = {
    at: 1,
    purpose: "etsy-reply",
    source: "etsy buyer message",
    inputSha256: "a".repeat(64),
    outputSha256: null,
    ok: false,
    error: "Claude Code exited with 1",
    costUsd: 0,
    flags: ["possible-injection"],
  };

  it("records every AI call", () => {
    const store = new Store(":memory:");
    store.addAudit(entry);
    store.addAudit({ ...entry, at: 2, ok: true, error: null, outputSha256: "b".repeat(64) });
    const [latest, first] = store.auditEntries();
    expect(first).toEqual(entry);
    expect(latest).toMatchObject({ at: 2, ok: true });
  });

  it("can't be edited or deleted, even with direct database access", () => {
    const dir = mkdtempSync(join(tmpdir(), "facility-audit-"));
    try {
      const path = join(dir, "facility.db");
      const store = new Store(path);
      store.addAudit(entry);
      const db = new DatabaseSync(path);
      expect(() => db.exec("UPDATE audit SET ok = 1")).toThrow(/append-only/);
      expect(() => db.exec("DELETE FROM audit")).toThrow(/append-only/);
      db.close();
      expect(store.auditEntries()).toHaveLength(1);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Kill switch", () => {
  it("stays off after a restart until the owner turns the facility back on", () => {
    const store = new Store(":memory:");
    new Facility(store).setControl({ running: false });
    const restarted = new Facility(store);
    expect(restarted.getControl().running).toBe(false);
    const before = restarted.ledger.getState().tasks.length;
    for (let i = 0; i < 100; i++) restarted.tick(1);
    expect(restarted.ledger.getState().tasks.length).toBe(before);
    restarted.setControl({ running: true });
    expect(new Facility(store).getControl().running).toBe(true);
  });
});

describe("HTTP API", () => {
  let facility: Facility;
  let base: string;
  let close: () => void;
  let designs: Designs;

  beforeEach(async () => {
    facility = new Facility(new Store(":memory:"));
    designs = new Designs(mkdtempSync(join(tmpdir(), "facility-http-")));
    const server = createFacilityServer(facility, { staticDir: null, allowedHosts: ["127.0.0.1", "localhost"], designs });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterEach(() => close());

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  /** Set the owner's PIN and return the session cookie the server hands back. */
  async function ownerCookie(pin = "246810") {
    const code = facility.owner.newSetupCode()!;
    const res = await post("/api/owner/setup", { pin, code });
    expect(res.status).toBe(200);
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Strict/);
    return { Cookie: set.split(";")[0] };
  }

  function makePendingApproval() {
    const { ledger } = facility;
    const task = ledger.createTask("etsy", "message", "Question");
    dispatch(ledger);
    ledger.work(task.id, 1, 0);
    ledger.finishStage(task.id, "draft", { draft: { kind: "reply", message: "Thanks, it ships tomorrow." } });
    return ledger.getState().approvals[0].id;
  }

  it("shows a saved design as a picture that can't run scripts", async () => {
    const id = designs.save('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const res = await fetch(`${base}/api/designs/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect((await fetch(`${base}/api/designs/..%2Ffacility.db`)).status).toBe(404);
    expect((await fetch(`${base}/api/designs/0000000000000000`)).status).toBe(404);
  });

  it("serves the current state", async () => {
    const res = await fetch(`${base}/api/state`);
    const body = await res.json();
    expect(body.state.wings.length).toBeGreaterThan(0);
    expect(body.control).toEqual({ running: true, speed: 1, mode: "demo" });
  });

  it("approves work for the owner", async () => {
    const id = makePendingApproval();
    const res = await post(`/api/approvals/${id}`, { approve: true }, await ownerCookie());
    expect(res.status).toBe(200);
    expect(facility.ledger.getState().approvals[0].status).toBe("approved");
  });

  it("refuses decisions without the owner's PIN session, whoever sends them", async () => {
    const id = makePendingApproval();
    expect((await post(`/api/approvals/${id}`, { approve: true })).status).toBe(401);
    expect((await post(`/api/approvals/${id}`, { approve: false })).status).toBe(401);
    await ownerCookie();
    expect((await post(`/api/approvals/${id}`, { approve: true }, { Cookie: "facility_owner=forged" })).status).toBe(401);
    expect(facility.ledger.getState().approvals[0].status).toBe("pending");
  });

  it("unlocks with the PIN, refuses a wrong one, and locks again", async () => {
    await ownerCookie("246810");
    expect((await post("/api/owner/unlock", { pin: "000000" })).status).toBe(403);
    const ok = await post("/api/owner/unlock", { pin: "246810" });
    expect(ok.status).toBe(200);
    const cookie = { Cookie: ok.headers.get("set-cookie")!.split(";")[0] };
    const status = await (await fetch(`${base}/api/owner`, { headers: cookie })).json();
    expect(status.pinSet).toBe(true);
    expect(status.unlockedUntil).toBeGreaterThan(Date.now());
    await post("/api/owner/lock", {}, cookie);
    const after = await (await fetch(`${base}/api/owner`, { headers: cookie })).json();
    expect(after.unlockedUntil).toBeNull();
    expect(facility.ledger.getState().log.some((e) => e.text === "Wrong approval PIN entered")).toBe(true);
  });

  it("won't set a first PIN without the setup code", async () => {
    facility.owner.newSetupCode();
    expect((await post("/api/owner/setup", { pin: "246810", code: "guess" })).status).toBe(403);
    expect(facility.owner.hasPin()).toBe(false);
  });

  it("refuses to approve content with a blocking safety finding", async () => {
    const { ledger } = facility;
    const task = ledger.createTask("etsy", "message", "Question");
    dispatch(ledger);
    ledger.work(task.id, 1, 0);
    ledger.finishStage(task.id, "draft", { draft: { kind: "reply", message: "Pay me on PayPal" } });
    const id = ledger.getState().approvals[0].id;
    const res = await post(`/api/approvals/${id}`, { approve: true }, await ownerCookie());
    expect(res.status).toBe(409);
    expect(ledger.getState().approvals[0].status).toBe("pending");
  });

  it("refuses approvals from another website", async () => {
    const id = makePendingApproval();
    const res = await post(`/api/approvals/${id}`, { approve: true }, { Origin: "https://evil.example", ...(await ownerCookie()) });
    expect(res.status).toBe(403);
    expect(facility.ledger.getState().approvals[0].status).toBe("pending");
  });

  it("refuses requests addressed to an unknown host name", async () => {
    // fetch won't let us forge Host, so use a raw request like a rebinding attack would.
    const status = await new Promise<number>((done, fail) => {
      const req = request(`${base}/api/state`, { headers: { Host: "attacker.example" } }, (res) => {
        res.resume();
        done(res.statusCode ?? 0);
      });
      req.on("error", fail);
      req.end();
    });
    expect(status).toBe(421);
  });

  it("refuses non-JSON and malformed requests", async () => {
    const id = makePendingApproval();
    const owner = await ownerCookie();
    const form = await fetch(`${base}/api/approvals/${id}`, { method: "POST", body: "approve=true", headers: owner });
    expect(form.status).toBe(415);
    expect((await post(`/api/approvals/${id}`, { approve: "yes" }, owner)).status).toBe(400);
    expect((await post(`/api/approvals/nope`, { approve: true }, owner)).status).toBe(404);
  });

  it("lets anyone pause, but only the owner resume", async () => {
    expect((await post("/api/agents/scout/pause", { paused: true })).status).toBe(200);
    expect(facility.ledger.agent("scout")?.status).toBe("paused");
    expect((await post("/api/agents/scout/pause", { paused: false })).status).toBe(401);
    expect(facility.ledger.agent("scout")?.status).toBe("paused");
    expect((await post("/api/control", { running: false, speed: 4 })).status).toBe(200);
    expect(facility.getControl()).toEqual({ running: false, speed: 4, mode: "demo" });
    expect((await post("/api/control", { running: true })).status).toBe(401);
    expect(facility.getControl().running).toBe(false);
    await post("/api/control", { speed: 1000 });
    expect(facility.getControl().speed).toBe(4);

    const owner = await ownerCookie();
    expect((await post("/api/agents/scout/pause", { paused: false }, owner)).status).toBe(200);
    expect(facility.ledger.agent("scout")?.status).toBe("idle");
    expect((await post("/api/control", { running: true }, owner)).status).toBe(200);
    expect(facility.getControl().running).toBe(true);
  });

  it("streams snapshots", async () => {
    const res = await fetch(`${base}/api/events`);
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: snapshot");
    await reader.cancel();
  });
});
