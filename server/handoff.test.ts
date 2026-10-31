import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { Ledger } from "../src/core/ledger";
import { initialState } from "../src/core/seed";
import type { ReaderResult } from "./agents/reader";
import { Designs } from "./crew/designs";
import { LiveCrew, type Think } from "./crew/live";
import { Facility } from "./facility";
import { Store } from "./store";
const dirs: string[] = [];
const now = () => Date.UTC(2026, 9, 30, 12);
const settle = () => new Promise((r) => setTimeout(r, 0));
function designStore() {
  const dir = mkdtempSync(join(tmpdir(), "facility-handoff-"));
  dirs.push(dir);
  return new Designs(dir);
}
function crew(ledger: Ledger, think: Think) {
  return new LiveCrew(ledger, {
    think,
    designs: designStore(),
    qwenReady: async () => false,
    now,
  });
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function writingTask(ledger: Ledger) {
  const task = ledger.createTask("etsy", "listing", "Writing handoff");
  task.stageIndex = 3;
  task.brief = JSON.stringify({ title: task.title, idea: "Original illustration", keywords: [], phrase: "" });
  return task;
}
const answer = (summary: string, costUsd = 0): ReaderResult => ({
  ok: true,
  output: { title: "Original reader print", description: summary + " Designed with AI assistance.", tags: ["reader print"] },
  inputFlags: [],
  costUsd,
});

it("fences an outgoing answer after Codex takes command, and rejects a stale handover", async () => {
  const ledger = new Ledger(initialState(), now);
  let release!: (value: ReaderResult) => void;
  const old = new Promise<ReaderResult>((resolve) => {
    release = resolve;
  });
  const worker = crew(ledger, async (model) =>
    model === "claude" ? old : answer("Codex finished this briefing."),
  );
  const task = writingTask(ledger);
  worker.tick(1);
  await settle();
  const oldToken = ledger.task(task.id)!.runToken;
  expect(ledger.handoff("codex", 0, "test handover")).toBe(true);
  expect(ledger.handoff("claude", 0, "stale browser")).toBe(false);
  worker.tick(1);
  await settle();
  expect(ledger.task(task.id)?.state).toBe("awaiting_approval");
  release(answer("STALE CLAUDE ANSWER", 0.5));
  await settle();
  const result = ledger.task(task.id)!;
  expect(JSON.stringify(result.draft)).toContain("Codex finished");
  expect(JSON.stringify(result.draft)).not.toContain("STALE");
  expect(result.runToken).not.toBe(oldToken);
  expect(ledger.getState().modelSpend.claude).toBe(0.5);
  expect(ledger.operator().active).toBe("codex");
});

it("automatically hands leadership to Codex once when Claude cannot complete a step", async () => {
  const ledger = new Ledger(initialState(), now);
  const called: string[] = [];
  const worker = crew(ledger, async (model) => {
    called.push(model);
    return model === "claude"
      ? {
          ok: false,
          error: "Usage limit reached",
          inputFlags: [],
          costUsd: 0.25,
        }
      : answer("Recovered through Codex");
  });
  writingTask(ledger);
  worker.tick(1);
  await settle();
  expect(ledger.operator()).toMatchObject({ active: "codex", generation: 1 });
  worker.tick(1);
  await settle();
  expect(called).toEqual(["claude", "codex"]);
  expect(
    ledger.getState().tasks.find((t) => t.workflowId === "listing")?.state,
  ).toBe("awaiting_approval");
  expect(ledger.getState().spend.etsy).toBe(0.25);
});

it("pausing fences an in-flight answer until work is explicitly resumed", async () => {
  const store = new Store(":memory:");
  let release!: (value: ReaderResult) => void;
  const pending = new Promise<ReaderResult>((resolve) => {
    release = resolve;
  });
  const facility = new Facility(store, (ledger) =>
    crew(ledger, async () => pending),
  );
  const task = writingTask(facility.ledger);
  facility.tick();
  facility.setControl({ running: false });
  release(answer("Late answer"));
  await settle();
  expect(facility.ledger.task(task.id)).toMatchObject({
    state: "queued",
    notes: [],
  });
  expect(new Facility(store).getControl().running).toBe(false);
  store.close();
});

it("persists the elected operator and migrates saved tasks by stage identity", () => {
  const old = initialState();
  old.wings = old.wings.map((w) => ({
    ...w,
    workflows: w.workflows.map((f) => ({
      ...f,
      stages: f.stages.filter((s) => s.id !== "quality"),
    })),
  }));
  const ledger = new Ledger(old, now);
  const task = ledger.createTask("etsy", "listing", "Existing draft");
  Object.assign(task, {
    state: "awaiting_approval",
    stageIndex: 2,
    brief: "saved artwork",
  });
  ledger.handoff("codex", 0, "take over");
  const store = new Store(":memory:");
  store.save(ledger.getState());
  const restarted = new Facility(store);
  const migrated = restarted.ledger.task(task.id)!;
  expect(restarted.ledger.stagesOf(migrated)[migrated.stageIndex].id).toBe(
    "list",
  );
  expect(migrated.brief).toBe("saved artwork");
  expect(restarted.ledger.operator().active).toBe("codex");
  expect(restarted.ledger.handoff("claude", 1, "return command")).toBe(true);
  store.close();
});

it("retains a stopped Claude job when leadership is recovered on startup", () => {
  const state = initialState();
  state.approvals.push({ id: "failure", taskId: "stopped", wingId: "core", kind: "failure", summary: "Briefing stopped", flags: [{ level: "block", code: "stage-failed", message: "Claude Code exited with 1" }], status: "pending", createdAt: now() });
  const ledger = new Ledger(state, now);
  crew(ledger, async () => answer("unused"));
  expect(ledger.operator().active).toBe("codex");
  expect(ledger.getState().approvals[0].status).toBe("pending");
});
