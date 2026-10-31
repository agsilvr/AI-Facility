import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Ledger } from "../core/ledger";
import { initialState } from "../core/seed";
import { WORK_LEASE_MS } from "../core/operations";
import { WorkBoard } from "./WorkBoard";
import { ProductionFlow } from "./ProductionFlow";
import { Inspector } from "./Sidebar";
import { Jobs } from "./Jobs";
import { RemoteFacility } from "../client/remote";

function fixture() {
  const now = Date.now();
  const ledger = new Ledger(initialState(), () => now);
  const work = ledger.startOperation({ id: "product-one", title: "Reading gift redesign", phase: "design", worker: "codex", expectedRevision: 0, summary: "Generating the actual image", context: "Exact product draft and owner's guidelines", nextStep: "Independent file and mockup review" });
  return { ledger, work, now };
}
describe("truthful work displays", () => {
  it("shows the same actual design claim on the flow, shared card and crew dossier", () => {
    const { ledger, now } = fixture();
    const state = ledger.getState();
    const flow = renderToStaticMarkup(<ProductionFlow state={state} running now={now} onRoom={vi.fn()}/>);
    const card = renderToStaticMarkup(<WorkBoard state={state} now={now}/>);
    const dossier = renderToStaticMarkup(<Inspector state={state} selection={{kind: "agent", id: "muse"}} onClose={vi.fn()}/>);
    expect(flow).toContain('aria-label="Design: In progress"');
    for (const view of [card, dossier]) {
      expect(view).toContain("Reading gift redesign");
      expect(view).toContain("Generating the actual image");
      expect(view).toContain("Codex");
    }
    expect(dossier).toContain("working");
    expect(card).toContain("Independent file and mockup review");
    expect(card).toContain("Live heartbeat");
    expect(card).not.toContain("50%");
  });
  it("shows lost heartbeats as stopped and disconnected room views as offline", () => {
    const { ledger, now } = fixture();
    const card = renderToStaticMarkup(<WorkBoard state={ledger.getState()} now={now + WORK_LEASE_MS + 1}/>);
    expect(card).toContain("Stopped");
    expect(card).toContain("heartbeat lost");
    expect(card).not.toContain("Live heartbeat");
    const offline = renderToStaticMarkup(<ProductionFlow state={ledger.getState()} connected={false} running now={now} onRoom={vi.fn()}/>);
    expect(offline).toContain('aria-label="Design: Offline"');
    expect(offline).not.toContain("In progress");
  });
  it("preserves completed phase receipts and clearly paused next work without marking a listing live", () => {
    const { ledger, work, now } = fixture();
    ledger.reportOperation(work.id, { runToken: work.runToken!, status: "done", summary: "PNG saved for review" });
    ledger.checkpointOperation({ id: work.id, title: work.title, phase: "quality", worker: "codex", expectedRevision: 1, status: "paused", summary: "Owner paused before review", nextStep: "Apply saved guidelines when production resumes" });
    const flow = renderToStaticMarkup(<ProductionFlow state={ledger.getState()} running={false} now={now} onRoom={vi.fn()}/>);
    expect(flow).toContain('aria-label="Design: Completed"');
    expect(flow).toContain('aria-label="Check: Paused"');
    const card = renderToStaticMarkup(<WorkBoard state={ledger.getState()} now={now}/>);
    expect(card).toContain("Owner paused before review");
    expect(card).toContain("PNG saved for review");
    expect(card).not.toContain("Published");
  });
  it("counts and filters outside work in Jobs without announcing an empty queue", () => {
    const { ledger, now } = fixture();
    const view = (filter: "all" | "done") => renderToStaticMarkup(<Jobs state={ledger.getState()} ledger={new RemoteFacility()} now={now} pinSet filter={filter} onFilter={vi.fn()} selected={null} onSelect={vi.fn()} onResearch={vi.fn()}/>);
    const all = view("all");
    expect(all).toContain("1 total");
    expect(all).toContain("Reading gift redesign");
    expect(all).toContain("In progress (1)");
    expect(all).not.toContain("No jobs yet");
    const done = view("done");
    expect(done).toContain("0 shown");
    expect(done).not.toContain("Reading gift redesign");
    expect(done).toContain("No completed jobs");
  });
});
