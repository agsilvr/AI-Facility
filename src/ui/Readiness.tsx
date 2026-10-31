import { useState } from "react";
import type { FacilityState } from "../core/types";
import type { Control } from "../core/port";
import { operationalFacts, researchReadiness } from "../core/health";
import { profitPlan, type ProfitInputs } from "../core/profit";
import { money } from "./format";

const INPUTS: [keyof ProfitInputs, string][] = [
  ["revenuePerOrder", "Collected per order, including charged shipping ($)"],
  ["production", "Supplier production per order ($)"], ["shipping", "Supplier shipping per order ($)"],
  ["feePercent", "Applicable platform, payment and ad fees (%)"], ["fixedFee", "Fixed fees per order ($)"],
  ["ads", "Additional acquisition cost per order ($)"], ["returns", "Expected returns / replacements per order ($)"],
  ["labor", "Labor per order ($)"], ["overhead", "Monthly overhead and other cost provision ($)"],
];
export function Readiness({ state, now, control, connected, onResearch, onJobs }: {
  state: FacilityState; now: number; control: Control; connected: boolean; onResearch: () => void; onJobs: () => void;
}) {
  const facts = operationalFacts(state, now, connected);
  const research = researchReadiness(state, now);
  const target = state.businessGoal?.monthlyNetProfitUsd;
  return <section className="readiness" aria-label="Business readiness">
    <div className="mission-header"><span className="micro">BUSINESS TARGET</span><strong>{target ? `${money(target)} / month` : "Target not recorded"}</strong><span>Profit after costs · actual profit unknown</span></div>
    <div className={`readiness-state ${control.running && connected ? "" : "held"}`}>
      <strong>{!connected ? "Connection lost" : control.running ? "Dispatcher enabled" : "Production paused"}</strong>
      <p>{connected ? `${facts.running} running · ${facts.maintenance} maintenance · ${facts.paused} paused work items` : "Saved history is available. No activity is shown as live."}</p>
      <p>Automatic product creation: {control.automaticProducts ? "enabled" : "off"}. Publishing: not connected.</p>
    </div>
    <details className="readiness-gates">
      <summary>Automation gaps · inspect the five stages</summary>
      <ol>
        <li><strong>Research <span>{research.label}</span></strong><p>{research.detail}</p><button className="text-button" onClick={onResearch}>Inspect evidence →</button></li>
        <li><strong>Product brief & artwork <span>Handoff required</span></strong><p>Save buyer, exact wording, product/provider, variants, print area and version. Image generation still needs the official Codex chat handoff.</p></li>
        <li><strong>Product quality <span>Not certified</span></strong><p>File checks do not verify anatomy, wording, print placement or mockups. Review full-resolution art, supplier mockups, variant contrast and a small listing preview. Three artwork attempts maximum.</p></li>
        <li><strong>Pricing & profit <span>Unverified</span></strong><p>Confirm variant costs, shipping, fees, returns and labor. The writer cannot set a guessed price or approve it.</p></li>
        <li><strong>Publish & reconcile <span>Not connected</span></strong><p>Exact creative approval, a verified connector and external-ID reconciliation are required. A local design or Printify draft is not an Etsy sale.</p></li>
      </ol>
      <button className="text-button" onClick={onJobs}>Open saved work and next steps →</button>
    </details>
    {target !== undefined && <ProfitPlanner target={target} />}
  </section>;
}

function ProfitPlanner({ target }: { target: number }) {
  const [values, setValues] = useState<Partial<Record<keyof ProfitInputs, string>>>({});
  const complete = INPUTS.every(([id]) => values[id]?.trim());
  const result = complete ? profitPlan(Object.fromEntries(INPUTS.map(([id]) => [id, Number(values[id])])) as unknown as ProfitInputs, target) : null;
  return <details className="disclosure profit-planner"><summary>Plan the path to {money(target)} profit</summary>
    <p>Scenario only. Enter every cost, using 0 only when it is confirmed. These assumptions are not a saved quote, forecast or permission to publish.</p>
    <div className="profit-inputs">{INPUTS.map(([id, label]) => <label key={id}>{label}<input type="number" min="0" step="0.01" max={id === "feePercent" ? 100 : undefined} value={values[id] ?? ""} onChange={(e) => setValues({ ...values, [id]: e.target.value })}/></label>)}</div>
    <div className="profit-result" aria-live="polite">{!complete ? "Fill every field to calculate required order volume." : !result ? "Check the inputs: costs must be nonnegative and percentage fees at most 100%." : result.orders === null ? "This scenario loses money or breaks even per order. More orders cannot reach the profit target." : `${money(result.contribution)} contribution per order → ${result.orders.toLocaleString()} orders per month and ${money(result.revenue!)} collected revenue to reach the target after entered costs.`}</div>
  </details>;
}
