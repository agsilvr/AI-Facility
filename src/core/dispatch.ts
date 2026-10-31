import type { Ledger } from "./ledger";
import { canWorkStage } from "./capabilities";

/**
 * Match queued tasks to idle agents in the same wing who have the skill for
 * the task's current stage. Wings over their monthly budget get no new work.
 */
export function dispatch(ledger: Ledger) {
  const { tasks } = ledger.getState();
  const queued = tasks
    .filter((t) => t.state === "queued")
    .sort((a, b) => a.createdAt - b.createdAt);

  for (const task of queued) {
    if (ledger.overBudget(task.wingId)) continue;
    const stage = ledger.stagesOf(task)[task.stageIndex];
    if (!stage) continue;
    // Re-read agents each time: an assignment above may have taken one.
    const agent = ledger
      .getState()
      .agents.find(
        (a) => a.status === "idle" && !a.taskId && !ledger.operationBusy(a.id) && canWorkStage(a, task.wingId, stage),
      );
    if (agent) ledger.assign(task.id, agent.id);
  }
}
