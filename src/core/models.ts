import type { DataClass, Job, ModelId } from "./types";

// Which model does which job. The crew are fixed characters on the map, but
// the thinking behind them is routed here, by plain code: no AI decides which
// AI gets a job, so a buyer's message can't talk its way to a different model.
//
// - Qwen runs on the Mac (Ollama). It's free and private, so it may see
//   anything, but it does one job at a time.
// - Claude, on the owner's own Claude subscription, is the senior writer: the
//   final version of every listing and reply, and the daily briefing.
// - DeepSeek takes research Qwen has no room for, on the owner's existing
//   DeepSeek credits. It only ever sees public data, never the shop's plans or
//   anything a customer wrote.
// - Codex, on the owner's own ChatGPT subscription, is the designer: it draws
//   designs as vector artwork. When it's busy, designs are type-only, drawn in
//   code. Nothing here pays per call except DeepSeek's prepaid credits.

export interface Model {
  name: string;
  /** Where the data goes when this model works, in the owner's words. */
  where: string;
  /** The data this model may see. */
  sees: DataClass[];
  /** How many jobs it can run at once; unlimited if not set. */
  capacity?: number;
  /** Dollars it may spend per month, on top of each wing's own budget. */
  monthlyCapUsd?: number;
}

const ALL: DataClass[] = ["public", "shop", "customer"];

export const MODELS: Record<ModelId, Model> = {
  qwen: { name: "Qwen 3.5 9B", where: "on this Mac", sees: ALL, capacity: 1 },
  claude: { name: "Claude", where: "your Claude subscription", sees: ALL },
  deepseek: { name: "DeepSeek", where: "your DeepSeek credits", sees: ["public"], monthlyCapUsd: 5 },
  codex: { name: "Codex", where: "your ChatGPT subscription", sees: ALL, capacity: 1 },
  typeset: { name: "Type designs", where: "drawn in code on this Mac", sees: ALL },
};

/** Who may do each job, first choice first; the rest take over when it's full or out of budget. */
export const ROUTES: Record<Job, ModelId[]> = {
  research: ["qwen", "deepseek"],
  design: ["codex", "typeset"],
  write: ["claude", "codex"],
  brief: ["claude", "codex"],
};

/** What the router needs to know about right now: who's busy and what's been spent. */
export interface Load {
  busy: Partial<Record<ModelId, number>>;
  spent: Partial<Record<ModelId, number>>;
  /** Models that can't be used right now, e.g. not connected yet. */
  unavailable?: ModelId[];
}

export type Route = { ok: true; model: ModelId } | { ok: false; reason: string };

/** The models allowed to do this job with this data, before load is considered. */
export function allowedModels(job: Job, data: DataClass, routes = ROUTES): ModelId[] {
  return (routes[job] ?? []).filter((id) => MODELS[id].sees.includes(data));
}

/**
 * Pick the model for a job. Models that may not see the data are never
 * considered, however busy the others are. If every allowed model is full or
 * out of budget, the job waits: it never falls through to one that isn't allowed.
 */
export function route(job: Job, data: DataClass, load: Load, routes = ROUTES): Route {
  const allowed = allowedModels(job, data, routes);
  if (allowed.length === 0) return { ok: false, reason: `No model is allowed to do ${job} work with ${data} data` };
  for (const id of allowed) {
    const m = MODELS[id];
    if (m.capacity !== undefined && (load.busy[id] ?? 0) >= m.capacity) continue;
    if (m.monthlyCapUsd !== undefined && (load.spent[id] ?? 0) >= m.monthlyCapUsd) continue;
    if (load.unavailable?.includes(id)) continue;
    return { ok: true, model: id };
  }
  const names = allowed.map((id) => MODELS[id].name).join(" and ");
  return { ok: false, reason: `Waiting for ${names}: busy, not connected, or this month's cap is used up` };
}
