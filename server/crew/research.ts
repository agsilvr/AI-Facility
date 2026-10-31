import type { Ledger } from "../../src/core/ledger";
import { RESEARCH_INTERVAL_MS, readResearch, currentResearch } from "../../src/core/research";

/** Use saved tasks as the clock so restarts do not duplicate research or retry failures. */
export function planResearch(ledger: Ledger, now: number) {
  const notebooks = ledger.getState().tasks.filter((t) => t.wingId === "etsy" && t.workflowId === "research-test");
  if (notebooks.some((t) => t.state !== "done")) return;
  // A new calendar day is not new evidence. Re-analyze only after the saved pack changes.
  if (notebooks.some((t) => currentResearch(readResearch(t.brief), now))) return;
  const latest = notebooks.reduce((at, t) => Math.max(at, t.createdAt), -Infinity);
  if (now - latest < RESEARCH_INTERVAL_MS) return;
  ledger.createTask("etsy", "research-test", "Daily print research");
}
