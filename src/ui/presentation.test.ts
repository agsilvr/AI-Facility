import { describe, expect, it } from "vitest";
import { initialState } from "../core/seed";
import { Ledger } from "../core/ledger";
import {
  agentModel,
  failureSummary,
  jobCategory,
  needsLogin,
  taskState,
} from "./presentation";

function fixture() {
  const ledger = new Ledger(initialState());
  const task = ledger.createTask("etsy", "listing", "Moon print");
  return { state: ledger.getState(), task };
}
describe("Job recovery categories", () => {
  it("keeps authentication separate from credit limits and disconnected publishing", () => {
    for (const message of [
      "Not logged in. Please run /login",
      "401 Unauthorized",
      '"type":"authentication_error"',
      "Invalid API key",
      "Expired session",
    ])
      expect(needsLogin(message), message).toBe(true);
    for (const message of [
      "Claude Code exited: You've hit your limit",
      "Rate limit exceeded",
      "Printify isn't connected",
      "Waiting for Qwen: busy, not connected, or this month's cap is used up",
    ])
      expect(needsLogin(message), message).toBe(false);
  });
  it("sorts explicit login failures separately from blocked jobs and approvals", () => {
    const { state, task } = fixture();
    task.state = "awaiting_approval";
    state.approvals.push({
      id: "a",
      taskId: task.id,
      wingId: "etsy",
      summary: "Failed",
      kind: "failure",
      flags: [{ level: "block", code: "failure", message: "Not logged in" }],
      status: "pending",
      createdAt: 0,
    });
    expect(jobCategory(state, task)).toBe("login");
    expect(taskState(state, task)).toBe("Login needed");
    state.approvals[0].flags[0].message =
      "Claude Code exited: You've hit your limit";
    expect(jobCategory(state, task)).toBe("blocked");
    state.approvals[0].kind = undefined;
    expect(jobCategory(state, task)).toBe("approval");
    task.state = "done";
    expect(jobCategory(state, task)).toBe("done");
  });
  it("distinguishes queued work, model waiting, and active work", () => {
    const { state, task } = fixture();
    expect(jobCategory(state, task)).toBe("active");
    expect(taskState(state, task)).toBe("Queued");
    task.waiting = "Waiting for Qwen: busy";
    expect(jobCategory(state, task)).toBe("waiting");
    task.waiting = "Sign-in required";
    expect(jobCategory(state, task)).toBe("login");
    task.state = "active";
    expect(taskState(state, task)).toBe("Running");
  });
  it("gives the next recovery action for the currently elected operator", () => {
    expect(
      failureSummary("Claude Code exited: usage limit", "codex").detail,
    ).toContain("Retry this step");
    expect(
      failureSummary("Claude Code exited: usage limit", "codex").detail,
    ).not.toContain("Switch to Codex");
    expect(
      failureSummary("Claude Code exited: usage limit", "claude").detail,
    ).toContain("Switch to Codex");
  });
  it("shows an agent’s actual in-flight model before its fallback assignment", () => {
    const { state, task } = fixture();
    const writer = state.agents.find((a) => a.id === "quill")!;
    state.operator = {
      active: "codex",
      generation: 1,
      changedAt: 0,
      reason: "test",
      automatic: false,
    };
    expect(agentModel(state, writer)).toBe("codex");
    writer.taskId = task.id;
    task.model = "claude";
    expect(agentModel(state, writer)).toBe("claude");
  });
});
