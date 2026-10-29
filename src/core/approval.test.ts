import { describe, expect, it } from "vitest";
import { dispatch } from "./dispatch";
import { Ledger } from "./ledger";
import { initialState } from "./seed";
import type { Draft } from "./types";

// The approval gate is the facility's most important safety property:
// nothing leaves the Mac unless the owner approved exactly that content.

const GOOD: Draft = { kind: "reply", message: "Thanks! Your order ships tomorrow." };

function pendingReply(draft: Draft | null = GOOD, inputFlags = [] as never[]) {
  let t = 1_000;
  const ledger = new Ledger(initialState(), () => t++);
  const task = ledger.createTask("etsy", "message", "Shipping question");
  dispatch(ledger);
  ledger.work(task.id, 1, 0);
  ledger.finishStage(task.id, "drafted", { draft: draft ?? undefined, inputFlags });
  const approval = ledger.getState().approvals[0];
  return { ledger, taskId: task.id, approvalId: approval.id };
}

/** Swap the task's draft behind the owner's back, as a buggy or compromised agent might. */
function tamper(ledger: Ledger, taskId: string, draft: Draft) {
  const state = ledger.getState();
  (state as { tasks: unknown }).tasks = state.tasks.map((t) => (t.id === taskId ? { ...t, draft } : t));
}

describe("approval gate", () => {
  it("binds the approval to the exact content shown", () => {
    const { ledger, taskId, approvalId } = pendingReply();
    expect(ledger.getState().approvals[0].content).toBe(JSON.stringify(GOOD));
    expect(ledger.decide(approvalId, true)).toBe(true);
    const task = ledger.task(taskId)!;
    expect(task.approvedContent).toBe(JSON.stringify(GOOD));
    expect(ledger.mayAct(task)).toBe(true);
  });

  it("refuses approval when the draft changed after it was shown", () => {
    const { ledger, taskId, approvalId } = pendingReply();
    tamper(ledger, taskId, { kind: "reply", message: "Pay me on PayPal instead" });
    expect(ledger.decide(approvalId, true)).toBe(false);
    expect(ledger.getState().approvals[0].status).toBe("pending");
    expect(ledger.task(taskId)?.state).toBe("awaiting_approval");
  });

  it("refuses approval of content with a blocking finding", () => {
    const { ledger, taskId, approvalId } = pendingReply({ kind: "reply", message: "Email me at a@b.com" });
    expect(ledger.getState().approvals[0].flags.map((f) => f.code)).toContain("email");
    expect(ledger.decide(approvalId, true)).toBe(false);
    expect(ledger.task(taskId)?.approvedContent).toBeUndefined();
    // Sending it back still works.
    expect(ledger.decide(approvalId, false)).toBe(true);
  });

  it("refuses an approval with nothing to review", () => {
    const { ledger, approvalId } = pendingReply(null);
    expect(ledger.getState().approvals[0].flags.map((f) => f.code)).toContain("no-draft");
    expect(ledger.decide(approvalId, true)).toBe(false);
  });

  it("carries input findings, such as an injection attempt, to the owner", () => {
    const flag = { level: "warn" as const, code: "possible-injection", message: "m" };
    const { ledger, approvalId } = pendingReply(GOOD, [flag] as never[]);
    expect(ledger.getState().approvals[0].flags).toContainEqual(flag);
    // A warning alone doesn't stop the owner approving a clean reply.
    expect(ledger.decide(approvalId, true)).toBe(true);
  });

  it("blocks the action if the content changes after approval, and sends it back for review", () => {
    const { ledger, taskId, approvalId } = pendingReply();
    ledger.decide(approvalId, true);
    tamper(ledger, taskId, { kind: "reply", message: "Something the owner never saw" });
    expect(ledger.mayAct(ledger.task(taskId)!)).toBe(false);
    dispatch(ledger);
    const task = ledger.task(taskId)!;
    expect(task.state).toBe("queued");
    expect(task.stageIndex).toBe(0);
    expect(task.approvedContent).toBeUndefined();
    expect(ledger.getState().agents.some((a) => a.taskId === taskId)).toBe(false);
  });

  it("never lets an action run on a task that skipped approval", () => {
    const { ledger, taskId } = pendingReply();
    // Force the task onto the send stage without an approval.
    const state = ledger.getState();
    (state as { tasks: unknown }).tasks = state.tasks.map((t) =>
      t.id === taskId ? { ...t, state: "queued", stageIndex: 1 } : t,
    );
    expect(ledger.mayAct(ledger.task(taskId)!)).toBe(false);
    dispatch(ledger);
    expect(ledger.task(taskId)?.state).not.toBe("active");
  });

  it("clears an approval when the owner sends work back, so it must be approved again", () => {
    const { ledger, taskId, approvalId } = pendingReply();
    ledger.decide(approvalId, false);
    expect(ledger.task(taskId)?.approvedContent).toBeUndefined();
  });

  it("is not a mayAct pass on a non-action stage", () => {
    const { ledger, taskId } = pendingReply();
    expect(ledger.mayAct(ledger.task(taskId)!)).toBe(false);
  });

  it("decides each approval once", () => {
    const { ledger, approvalId } = pendingReply();
    expect(ledger.decide(approvalId, true)).toBe(true);
    expect(ledger.decide(approvalId, false)).toBe(false);
    expect(ledger.decide("no-such-id", true)).toBe(false);
  });
});
