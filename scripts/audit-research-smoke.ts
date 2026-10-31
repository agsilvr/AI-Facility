import { writeFileSync } from "node:fs";
import { runReader, QWEN_TAG, type AuditEntry } from "../server/agents/reader";
import { notebookRequest } from "../server/crew/jobs";
import { Ledger } from "../src/core/ledger";
import { initialState } from "../src/core/seed";
import { buildResearchReport, researchEvidenceProblem, type ResearchOpportunity } from "../src/core/research";
const ledger = new Ledger(initialState());
const task = ledger.createTask("etsy", "research-test", "Maintenance evidence-contract smoke test");
const audit: AuditEntry[] = [];
const started = Date.now();
const result = await runReader({ ...notebookRequest(task, ledger.getState()), model: "qwen", timeoutMs: 120000 }, { audit: (entry) => audit.push(entry) });
const opportunities = (result.output as { opportunities: ResearchOpportunity[] } | undefined)?.opportunities;
const evidenceProblem = result.ok && opportunities ? researchEvidenceProblem(opportunities) : result.error;
const report = !evidenceProblem && opportunities ? buildResearchReport(opportunities) : null;
const receipt = { testedAt: new Date().toISOString(), model: QWEN_TAG, durationMs: Date.now() - started,
  purpose: "One bounded maintenance validation; not a production notebook, design or permission to publish", audit, result, evidenceProblem, report };
writeFileSync(new URL("../docs/reliability-2026-10-30/qwen-smoke.json", import.meta.url), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ ok: result.ok && !evidenceProblem, durationMs: receipt.durationMs, error: evidenceProblem, families: opportunities?.map((o) => o.family) }));
if (!result.ok || evidenceProblem) process.exitCode = 1;
