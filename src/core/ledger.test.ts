import { describe, expect, it } from "vitest";
import { dispatch } from "./dispatch";
import { completedCount, Ledger } from "./ledger";
import { initialState } from "./seed";

function setup() {
  let t = 1_000;
  const ledger = new Ledger(initialState(), () => t++);
  return ledger;
}

function runStage(ledger: Ledger, taskId: string) {
  dispatch(ledger);
  expect(ledger.task(taskId)?.state).toBe("active");
  expect(ledger.work(taskId, 1, 0.01)).toBe(true);
  ledger.finishStage(taskId, "note");
}

describe("Ledger", () => {
  it("moves a product through every stage, stopping for approval before publishing", () => {
    const ledger = setup();
    const task = ledger.createTask("etsy", "listing", "Moon print");

    runStage(ledger, task.id); // research
    runStage(ledger, task.id); // design
    runStage(ledger, task.id); // draft listing -> approval
    expect(ledger.task(task.id)?.state).toBe("awaiting_approval");

    // Nothing proceeds while waiting for the owner.
    dispatch(ledger);
    expect(ledger.task(task.id)?.state).toBe("awaiting_approval");

    const approval = ledger.getState().approvals[0];
    ledger.decide(approval.id, true);
    expect(ledger.task(task.id)?.stageIndex).toBe(3);

    runStage(ledger, task.id); // publish
    const done = ledger.task(task.id)!;
    expect(done.state).toBe("done");
    expect(done.notes).toHaveLength(4);
    expect(ledger.getState().agents.every((a) => a.taskId === null)).toBe(true);
  });

  it("sends rejected work back one stage", () => {
    const ledger = setup();
    const task = ledger.createTask("etsy", "listing", "Mug");
    runStage(ledger, task.id);
    runStage(ledger, task.id);
    runStage(ledger, task.id);
    ledger.decide(ledger.getState().approvals[0].id, false);
    const t = ledger.task(task.id)!;
    expect(t.state).toBe("queued");
    expect(t.stageIndex).toBe(1);
    expect(ledger.getState().approvals[0].status).toBe("rejected");
  });

  it("ignores a second decision on the same approval", () => {
    const ledger = setup();
    const task = ledger.createTask("etsy", "message", "Shipping question");
    runStage(ledger, task.id);
    const id = ledger.getState().approvals[0].id;
    ledger.decide(id, true);
    ledger.decide(id, false);
    expect(ledger.getState().approvals[0].status).toBe("approved");
    expect(ledger.task(task.id)?.stageIndex).toBe(1);
  });

  it("tracks spend per wing and stops dispatching when the budget is used up", () => {
    const ledger = setup();
    const task = ledger.createTask("etsy", "listing", "Poster");
    dispatch(ledger);
    ledger.work(task.id, 0.5, 30);
    expect(ledger.getState().spend.etsy).toBe(30);
    expect(ledger.overBudget("etsy")).toBe(true);

    const next = ledger.createTask("etsy", "listing", "Another");
    dispatch(ledger);
    expect(ledger.task(next.id)?.state).toBe("queued");
  });

  it("only gives work to agents in the same wing with the right skill", () => {
    const ledger = setup();
    const task = ledger.createTask("etsy", "listing", "Tote");
    dispatch(ledger);
    expect(ledger.task(task.id)?.agentId).toBe("scout");
  });

  it("returns a paused agent's task to the queue", () => {
    const ledger = setup();
    const task = ledger.createTask("etsy", "listing", "Stickers");
    dispatch(ledger);
    ledger.setAgentPaused("scout", true);
    expect(ledger.task(task.id)?.state).toBe("queued");
    expect(ledger.agent("scout")?.status).toBe("paused");
    dispatch(ledger);
    expect(ledger.task(task.id)?.state).toBe("queued");
    ledger.setAgentPaused("scout", false);
    dispatch(ledger);
    expect(ledger.task(task.id)?.agentId).toBe("scout");
  });

  it("notifies subscribers on change", () => {
    const ledger = setup();
    let calls = 0;
    const off = ledger.subscribe(() => calls++);
    ledger.createTask("core", "briefing", "Brief");
    expect(calls).toBeGreaterThan(0);
    off();
    const before = calls;
    ledger.log("x");
    expect(calls).toBe(before);
  });

  it("returns interrupted work to the queue after a restart", () => {
    const ledger = setup();
    const task = ledger.createTask("etsy", "listing", "Earrings");
    dispatch(ledger);
    ledger.setAgentPaused("muse", true);
    const recovered = Ledger.recover(ledger.getState());
    expect(recovered.tasks.find((t) => t.id === task.id)).toMatchObject({ state: "queued", agentId: null, progress: 0 });
    expect(recovered.agents.find((a) => a.id === "scout")).toMatchObject({ status: "idle", taskId: null });
    expect(recovered.agents.find((a) => a.id === "muse")?.status).toBe("paused");
    expect(recovered.log[0].text).toContain("1 interrupted task returned");
  });

  it("resets budgets when a new month starts", () => {
    let t = Date.UTC(2026, 9, 31, 23, 59);
    const ledger = new Ledger(initialState(), () => t);
    ledger.getState().spendMonth = "2026-10";
    const task = ledger.createTask("etsy", "listing", "Poster");
    dispatch(ledger);
    ledger.work(task.id, 0.1, 30);
    expect(ledger.overBudget("etsy")).toBe(true);
    t = Date.UTC(2026, 10, 1, 0, 1);
    expect(ledger.overBudget("etsy")).toBe(false);
    expect(ledger.getState().spendMonth).toBe("2026-11");
  });

  it("counts every completion but keeps only recent finished tasks in live state", () => {
    const ledger = setup();
    for (let i = 0; i < 70; i++) {
      const task = ledger.createTask("core", "briefing", `Brief ${i}`);
      runStage(ledger, task.id);
    }
    const state = ledger.getState();
    expect(completedCount(state)).toBe(70);
    expect(state.tasks.filter((t) => t.state === "done").length).toBe(60);
  });
});
