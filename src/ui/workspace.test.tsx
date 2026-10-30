import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Ledger, APPROVAL_TTL_MS } from "../core/ledger";
import { initialState } from "../core/seed";
import type { Approval } from "../core/types";
import { RemoteFacility } from "../client/remote";
import { Sidebar } from "./Sidebar";
import { ApprovalActions, JobDetail, Jobs } from "./Jobs";

const noop = vi.fn();
const remote = new RemoteFacility();
describe("Focused workspace", () => {
  it("replaces the base page with the selected agent and its actual model", () => {
    const html = renderToStaticMarkup(
      <Sidebar
        jobFilter="all"
        onJobFilter={noop}
        onJobs={noop}
        ledger={remote}
        state={initialState()}
        now={0}
        pinSet
        live
        running
        tab="command"
        jobId={null}
        onJobSelect={noop}
        onTab={noop}
        selection={{ kind: "agent", id: "scout" }}
        onSelect={noop}
      />,
    );
    expect(html).toContain("Scout details");
    expect(html).toContain("Qwen 3.5 9B");
    expect(html).toContain("Back to workspace");
    expect(html).not.toContain("Active operator");
    expect(html).not.toContain("Latest work");
  });
  it("opens one job without leaving the search and the other jobs beneath it", () => {
    const ledger = new Ledger(initialState());
    const one = ledger.createTask("etsy", "listing", "Selected print");
    ledger.createTask("etsy", "listing", "Another print");
    const html = renderToStaticMarkup(
      <Jobs
        filter="all"
        onFilter={noop}
        state={ledger.getState()}
        ledger={remote}
        now={0}
        pinSet
        selected={one.id}
        onSelect={noop}
        onResearch={noop}
      />,
    );
    expect(html).toContain("Selected print");
    expect(html).toContain("Back to jobs");
    expect(html).not.toContain("Another print");
    expect(html).not.toContain("Search jobs");
  });
  it("filters login issues while retaining counts for the other categories", () => {
    const ledger = new Ledger(initialState());
    const login = ledger.createTask("core", "briefing", "Sign-in issue");
    const blocked = ledger.createTask("etsy", "listing", "Credit-limited job");
    const state = ledger.getState();
    for (const [task, message] of [
      [login, "Not logged in"],
      [blocked, "Claude Code exited: credit limit"],
    ] as const) {
      task.state = "awaiting_approval";
      state.approvals.push({
        id: task.id,
        taskId: task.id,
        wingId: task.wingId,
        status: "pending",
        kind: "failure",
        summary: "Failure",
        flags: [{ level: "block", code: "failure", message }],
        createdAt: 0,
      });
    }
    const html = renderToStaticMarkup(
      <Jobs
        filter="login"
        onFilter={noop}
        state={state}
        ledger={remote}
        now={0}
        pinSet
        selected={null}
        onSelect={noop}
        onResearch={noop}
      />,
    );
    expect(html).toContain("Sign-in issue");
    expect(html).not.toContain("Credit-limited job");
    expect(html).toContain("Blocked (1)");
    expect(html).toContain("Login needed (1)");
    expect(html).toContain("1 shown");
  });
  it("lists every category even when it is empty, without duplicating jobs in All", () => {
    const ledger = new Ledger(initialState());
    ledger.createTask("etsy", "listing", "One queued job");
    const html = renderToStaticMarkup(
      <Jobs
        filter="all"
        onFilter={noop}
        state={ledger.getState()}
        ledger={remote}
        now={0}
        pinSet
        selected={null}
        onSelect={noop}
        onResearch={noop}
      />,
    );
    for (const label of [
      "All jobs (1)",
      "Approval (0)",
      "Login needed (0)",
      "Blocked (0)",
      "Waiting (0)",
      "Done (0)",
    ])
      expect(html).toContain(label);
    expect(html.match(/One queued job/g)).toHaveLength(1);
  });
});
describe("Review and recovery", () => {
  const approval: Approval = {
    id: "a",
    taskId: "t",
    wingId: "etsy",
    summary: "Review",
    status: "pending",
    flags: [],
    createdAt: 100,
  };
  it("keeps expired or blocked packages unapprovable", () => {
    for (const [item, now] of [
      [approval, APPROVAL_TTL_MS + 101],
      [
        {
          ...approval,
          flags: [{ level: "block", code: "unsafe", message: "Unsafe" }],
        },
        101,
      ],
    ] as const) {
      const html = renderToStaticMarkup(
        <ApprovalActions
          approval={item as Approval}
          ledger={remote}
          now={now}
        />,
      );
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Approve package/);
      expect(html).toContain("Request revision");
    }
  });
  it("offers retry with the elected operator and no approve button for failures", () => {
    const ledger = new Ledger(initialState());
    const task = ledger.createTask("core", "briefing", "Daily briefing");
    const state = ledger.getState();
    state.operator = {
      active: "codex",
      generation: 2,
      changedAt: 0,
      reason: "fallback",
      automatic: true,
    };
    state.approvals.push({
      ...approval,
      taskId: task.id,
      wingId: "core",
      kind: "failure",
      flags: [
        {
          level: "block",
          code: "failure",
          message: "Claude Code exited: usage limit",
        },
      ],
    });
    const html = renderToStaticMarkup(
      <JobDetail
        task={task}
        state={state}
        ledger={remote}
        now={101}
        onBack={noop}
        onResearch={noop}
      />,
    );
    expect(html).toContain("Retry with Codex");
    expect(html).not.toContain("Approve package");
  });
});
