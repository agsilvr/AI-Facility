import { describe, expect, it } from "vitest";
import { assertSafeWorkflows, workflowViolations } from "./policy";
import { wings } from "./seed";
import type { Stage, Wing } from "./types";

function wingWith(stages: Stage[]): Wing[] {
  return [{ id: "test", name: "Test", color: "#fff", budgetMonthly: 1, workflows: [{ id: "wf", label: "WF", stages }] }];
}

const work = (id: string): Stage => ({ id, label: id, roomId: "r" });

describe("workflow policy", () => {
  it("accepts the real facility's workflows", () => {
    expect(workflowViolations(wings)).toEqual([]);
  });

  it("puts every outward action behind an approval", () => {
    const actions = wings.flatMap((w) => w.workflows.flatMap((wf) => wf.stages.filter((s) => s.action)));
    expect(actions.map((s) => s.action).sort()).toEqual(["etsy.publishListing", "etsy.sendReply"]);
  });

  it("refuses an action with no approval before it", () => {
    const problems = workflowViolations(wingWith([work("draft"), { ...work("send"), action: "etsy.sendReply" }]));
    expect(problems.join()).toContain("must directly follow an approval stage");
  });

  it("refuses a step slipped in between the approval and the action", () => {
    const problems = workflowViolations(
      wingWith([{ ...work("review"), needsApproval: true }, work("rewrite"), { ...work("send"), action: "etsy.sendReply" }]),
    );
    expect(problems.length).toBeGreaterThan(0);
  });

  it("refuses an action as the first stage", () => {
    expect(workflowViolations(wingWith([{ ...work("send"), action: "etsy.sendReply" }]))).not.toEqual([]);
  });

  it("refuses a stage that approves itself", () => {
    const problems = workflowViolations(
      wingWith([{ ...work("review"), needsApproval: true }, { ...work("send"), needsApproval: true, action: "etsy.sendReply" }]),
    );
    expect(problems.join()).toContain("can't also be an approval stage");
  });

  it("refuses to start with an unsafe workflow", () => {
    expect(() => assertSafeWorkflows(wingWith([{ ...work("send"), action: "etsy.publishListing" }]))).toThrow(/Unsafe workflow/);
  });
});
