import { allowedModels, ROUTES } from "./models";
import type { Wing } from "./types";

/**
 * Structural safety rules for workflows. The server refuses to start if any
 * wing breaks them, so an unsafe workflow can't be added by mistake.
 *
 * - Every outward action stage comes straight after a stage that needs the
 *   owner's approval. Nothing (in particular no AI step) sits in between, so
 *   what the owner approved is exactly what the action uses.
 * - An approval stage is never the last stage of a workflow that has no action
 *   (that would be an approval that does nothing, which hides mistakes).
 * - Every other stage says what kind of work it is and how sensitive its data
 *   is, and at least one model is allowed to do that work with that data.
 */
export function workflowViolations(wings: Wing[], routes = ROUTES): string[] {
  const problems: string[] = [];
  for (const wing of wings) {
    for (const wf of wing.workflows) {
      wf.stages.forEach((stage, i) => {
        const where = `${wing.id}/${wf.id}/${stage.id}`;
        if (stage.action) {
          if (stage.job || stage.data) problems.push(`${where}: an action stage cannot also be an AI stage`);
          const prev = wf.stages[i - 1];
          if (!prev?.needsApproval) problems.push(`${where}: action "${stage.action}" must directly follow an approval stage`);
          if (stage.needsApproval) problems.push(`${where}: an action stage can't also be an approval stage`);
        }
        if (stage.needsApproval && !wf.stages[i + 1]?.action) {
          problems.push(`${where}: an approval stage must be followed by the action it approves`);
        }
        if (!stage.action && stage.executor !== "code") {
          if (!stage.job || !stage.data) problems.push(`${where}: an AI stage must say its job and its data class`);
          else if (allowedModels(stage.job, stage.data, routes).length === 0) {
            problems.push(`${where}: no model is allowed to do ${stage.job} work with ${stage.data} data`);
          }
        }
      });
    }
  }
  return problems;
}

export function assertSafeWorkflows(wings: Wing[]) {
  const problems = workflowViolations(wings);
  if (problems.length) throw new Error(`Unsafe workflow configuration:\n${problems.join("\n")}`);
}
