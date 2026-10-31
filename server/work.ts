import { WORK_PHASES, type WorkStart, type WorkReport } from "../src/core/operations";

const statuses = ["running", "waiting", "paused", "blocked", "done"];
function fields(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new Error("Unknown work-record field");
}
function text(body: Record<string, unknown>, key: string, max: number, required = false) {
  const value = body[key];
  if (value === undefined && !required) return;
  if (typeof value !== "string" || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`Invalid ${key}`);
}
function shared(body: Record<string, unknown>) {
  text(body, "summary", 600); text(body, "context", 10_000); text(body, "nextStep", 1000);
  if (body.references !== undefined && (!Array.isArray(body.references) || body.references.length > 20 || body.references.some((ref) => typeof ref !== "string" || ref.length > 1000))) throw new Error("Invalid references");
}
export function parseWorkStart(body: Record<string, unknown>): WorkStart {
  fields(body, ["id", "title", "phase", "worker", "expectedRevision", "summary", "context", "nextStep", "references"]);
  text(body, "id", 80, true); text(body, "title", 160, true); text(body, "summary", 600, true); shared(body);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(body.id as string) || !Object.hasOwn(WORK_PHASES, String(body.phase)) || !["codex", "claude", "qwen"].includes(String(body.worker)) || !Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 0) throw new Error("Invalid worker, phase or revision");
  if (body.worker === "qwen" && body.phase !== "research") throw new Error("Qwen's work record is restricted to research");
  return body as unknown as WorkStart;
}
export function parseWorkReport(body: Record<string, unknown>): WorkReport {
  fields(body, ["runToken", "status", "summary", "context", "nextStep", "references"]);
  text(body, "runToken", 100, true); shared(body);
  if (body.status !== undefined && !statuses.includes(String(body.status))) throw new Error("Invalid work status");
  return body as unknown as WorkReport;
}
