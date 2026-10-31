import { describe, expect, it } from "vitest";
import { Ledger } from "../../src/core/ledger";
import { initialState } from "../../src/core/seed";
import { researchNotebook } from "../test-research";
import { productCandidates, productDue } from "./selection";
import { researchRequest } from "./jobs";
import { validate } from "../agents/reader";

const HOUR = 3600000;
const start = Date.UTC(2026, 9, 30, 12);

function setup() {
  const ledger = new Ledger(initialState(), () => start);
  const notebook = ledger.createTask("etsy", "research-test", "Notebook");
  notebook.state = "done";
  notebook.brief = JSON.stringify(researchNotebook());
  const task = ledger.createTask("etsy", "listing", "New idea");
  return { ledger, notebook, task };
}

describe("automatic product selection", () => {
  it("supplies eligible notebook candidates as untrusted data and requires a choice", () => {
    const { ledger, task } = setup();
    const req = researchRequest(task, ledger.getState(), "Print shop");
    expect(JSON.parse(req.untrusted).notebook.candidates.map((o: { candidateIndex: number }) => o.candidateIndex)).toEqual([0, 1, 2]);
    expect(req.instructions).toContain("do not ask the owner");
    expect(req.instructions).not.toContain("Custom pet ornament");
    expect(req.schema).toMatchObject({ required: expect.arrayContaining(["candidateIndex", "selectionReason"]) });
    expect(validate({ title: "Bookish cat crewneck", idea: "Original botanical wall art.", phrase: "", keywords: ["botanical print"], candidateIndex: 0, selectionReason: "Supported by saved sources" }, req.schema)).toBeNull();
  });

  it("excludes claimed directions across a restart, keeping original candidate indices", () => {
    const { ledger, notebook, task } = setup();
    task.brief = JSON.stringify({ selection: { notebookId: notebook.id, candidateIndex: 0, candidateTitle: "Bookish cat crewneck" } });
    const restored = new Ledger(Ledger.recover(ledger.getState()), () => start);
    const next = restored.createTask("etsy", "listing", "Next");
    expect(productCandidates(next, restored.getState())?.candidates.map((o) => o.candidateIndex)).toEqual([1, 2]);
  });

  it("ignores unfinished, blocked, malformed and other-wing notebooks", () => {
    const { ledger, notebook, task } = setup();
    notebook.flags = [{ level: "block", code: "blocked", message: "Do not use" }];
    const other = ledger.createTask("other", "research-test", "Private notebook");
    other.state = "done"; other.brief = notebook.brief;
    const pending = ledger.createTask("etsy", "research-test", "Pending notebook");
    pending.brief = notebook.brief;
    expect(productCandidates(task, ledger.getState())).toBeNull();
    notebook.flags = [];
    notebook.brief = JSON.stringify({ kind: "research-report", opportunities: [{ title: "Missing evidence" }], limitations: [] });
    expect(productCandidates(task, ledger.getState())).toBeNull();
  });

  it("waits for new research after all current candidates are used", () => {
    const { ledger, notebook, task } = setup();
    task.state = "done";
    task.brief = JSON.stringify({ selection: { notebookId: notebook.id, candidateIndex: 0, candidateTitle: "Bookish cat crewneck" } });
    const second = ledger.createTask("etsy", "listing", "Other");
    second.state = "done";
    second.brief = JSON.stringify({ selection: { notebookId: notebook.id, candidateIndex: 1, candidateTitle: "Custom pet ornament" } });
    const third = ledger.createTask("etsy", "listing", "Reading corner gallery");
    third.state = "done";
    expect(productDue(ledger.getState(), start + 5 * HOUR, 4 * HOUR)).toBe(false);
  });

  it("uses saved product creation times to prevent restart catch-up", () => {
    const { ledger } = setup();
    const restored = new Ledger(Ledger.recover(ledger.getState()), () => start + HOUR);
    expect(productDue(restored.getState(), start + HOUR, 4 * HOUR)).toBe(false);
    expect(productDue(restored.getState(), start + 4 * HOUR, 4 * HOUR)).toBe(true);
  });
});
