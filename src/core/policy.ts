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
 */
export function workflowViolations(wings: Wing[]): string[] {
  const problems: string[] = [];
  for (const wing of wings) {
    for (const wf of wing.workflows) {
      wf.stages.forEach((stage, i) => {
        const where = `${wing.id}/${wf.id}/${stage.id}`;
        if (stage.action) {
          const prev = wf.stages[i - 1];
          if (!prev?.needsApproval) problems.push(`${where}: action "${stage.action}" must directly follow an approval stage`);
          if (stage.needsApproval) problems.push(`${where}: an action stage can't also be an approval stage`);
        }
        if (stage.needsApproval && !wf.stages[i + 1]?.action) {
          problems.push(`${where}: an approval stage must be followed by the action it approves`);
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
