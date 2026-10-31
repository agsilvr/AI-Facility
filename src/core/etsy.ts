import { serializeDraft } from "./safety";
import type { FacilityState, Task } from "./types";

// Owner operating limits, not Etsy detection thresholds. Never randomize them
// to impersonate a person. All workers share the same saved reservations.
export const ETSY_PUBLISH_LIMIT = 3;
export const ETSY_PUBLISH_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ETSY_PUBLISH_GAP_MS = 4 * 60 * 60 * 1000;

export function etsyPublishHold(state: FacilityState, task: Task, now: number): string | undefined {
  const attempts = state.etsyPublishAttempts === undefined ? [] : state.etsyPublishAttempts;
  if (!Number.isFinite(now) || !Array.isArray(attempts) || attempts.some((a) =>
    !a || !Number.isFinite(a.at) || a.at > now || typeof a.taskId !== "string" ||
    typeof a.runToken !== "string" || typeof a.content !== "string")) {
    return "Publishing stopped: saved attempt history or clock is invalid. Owner review required.";
  }
  const content = serializeDraft(task.draft);
  const prior = attempts.find((a) => a.taskId === task.id || a.content === content);
  if (prior) {
    // Only the currently assigned attempt may finish. A restarted, failed or
    // paused attempt must never be replayed just because a slot became free.
    if (task.state === "active" && prior.taskId === task.id && prior.runToken === task.runToken && prior.content === content) return;
    return "Publishing stopped: this task or exact listing already had an attempt. Confirm its outcome before any retry.";
  }
  if (task.state === "active") return "Publishing stopped: this run has no saved publishing reservation.";
  const recent = attempts.filter((a) => now - a.at < ETSY_PUBLISH_WINDOW_MS);
  if (recent.length >= ETSY_PUBLISH_LIMIT) return "Publishing waits: three attempts already reserved in the last 24 hours.";
  if (attempts.some((a) => now - a.at < ETSY_PUBLISH_GAP_MS)) return "Publishing waits: allow four hours between listing attempts.";
}
