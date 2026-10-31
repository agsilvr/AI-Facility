import type { FacilityState, Task } from "../../src/core/types";
import { readResearch, RESEARCH_SOURCES, currentResearch } from "../../src/core/research";

export interface ProductSelection {
  notebookId: string;
  candidateIndex: number;
  candidateTitle: string;
  reason: string;
  sourceIds: string[];
  limitations: string[];
}

function selectionOf(task: Task): ProductSelection | undefined {
  try {
    const value = JSON.parse(task.brief ?? "null")?.selection;
    return value && typeof value.notebookId === "string" && Number.isInteger(value.candidateIndex) && typeof value.candidateTitle === "string" ? value : undefined;
  } catch { return undefined; }
}

/** Only completed same-wing notebooks may feed production. Saved model text grants no permissions. */
export function productCandidates(task: Pick<Task, "id" | "wingId">, state: FacilityState, now = Date.now()) {
  const notebooks = state.tasks
    .filter((t) => t.wingId === task.wingId && t.workflowId === "research-test" && t.state === "done" && !t.flags.some((f) => f.level === "block"))
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const notebook of notebooks) {
    const report = readResearch(notebook.brief);
    if (!currentResearch(report, now) || !report || !Array.isArray(report.opportunities) || !Array.isArray(report.limitations) || !report.limitations.every((s) => typeof s === "string")) continue;
    const candidates = report.opportunities.map((opportunity, candidateIndex) => ({ ...opportunity, candidateIndex }))
      .filter((o) => [o.title, o.audience, o.concept, o.evidence, o.nextStep].every((s) => typeof s === "string" && s.trim().length > 0)
        && Array.isArray(o.sourceIds) && o.sourceIds.length > 0 && o.sourceIds.every((id) => RESEARCH_SOURCES.some((s) => s.id === id)));
    if (!candidates.length) continue;
    const used = state.tasks.filter((t) => t.id !== task.id && t.wingId === task.wingId && ["listing", "artwork-pilot"].includes(t.workflowId));
    return {
      notebookId: notebook.id,
      summary: report.summary,
      limitations: report.limitations,
      flags: notebook.flags,
      candidates: candidates.filter((o) => !used.some((t) => {
        const selection = selectionOf(t);
        return (selection?.notebookId === notebook.id && selection.candidateIndex === o.candidateIndex)
          || selection?.candidateTitle.trim().toLocaleLowerCase() === o.title.trim().toLocaleLowerCase()
          || t.title.trim().toLocaleLowerCase() === o.title.trim().toLocaleLowerCase();
      })),
    };
  }
  return null;
}

/** The saved creation time fences restarts; there is no missed-run catch-up burst. */
export function productDue(state: FacilityState, now: number, intervalMs: number): boolean {
  const products = state.tasks.filter((t) => t.wingId === "etsy" && t.workflowId === "listing");
  if (products.filter((t) => t.state !== "done").length >= 3) return false;
  const latest = products.reduce((at, t) => Math.max(at, t.createdAt), -Infinity);
  if (now - latest < intervalMs) return false;
  const notebook = productCandidates({ id: "", wingId: "etsy" }, state, now);
  return !!notebook && notebook.candidates.length > 0;
}
