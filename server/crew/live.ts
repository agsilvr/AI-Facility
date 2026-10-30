import { dispatch } from "../../src/core/dispatch";
import type { Ledger } from "../../src/core/ledger";
import type { ModelId, Task } from "../../src/core/types";
import type { ReaderModel, ReaderRequest, ReaderResult } from "../agents/reader";
import { type Designs, typeDesign } from "./designs";
import { asIdea, asListing, briefingRequest, DEFAULT_SHOP, listingRequest, readIdea, researchRequest } from "./jobs";

// The real crew. The same ledger, dispatch and router as the demo, but each
// stage is done by the model the router picked, through the locked-down
// reader. A stage that fails stops and waits for the owner (fail closed);
// nothing is retried on its own.
//
// What's wired so far: research on Qwen, type-only designs, listings and the
// daily briefing on Claude. DeepSeek and Codex aren't connected yet, so the
// router skips them; publishing waits until Printify is connected.

/** Run one request through the reader on a given model. */
export type Think = (model: ReaderModel, req: ReaderRequest) => Promise<ReaderResult>;

/** Is Qwen downloaded and Ollama answering? */
export type QwenCheck = () => Promise<boolean>;

export interface LiveOptions {
  think: Think;
  designs: Designs;
  qwenReady: QwenCheck;
  /** The owner's description of the shop. */
  shop?: () => string;
  now?: () => number;
  /** Hours between new product ideas. */
  ideaEveryHours?: number;
}

/** Models with no connection yet; the router never sends them work. */
const NOT_CONNECTED: ModelId[] = ["deepseek", "codex"];
const HOUR = 60 * 60 * 1000;
const CHECK_QWEN_EVERY = 60 * 1000;
/** Product ideas waiting at once; more would just pile up unreviewed. */
const MAX_OPEN_IDEAS = 3;
/** Progress shown while a model works: it creeps up, and jumps to done at the end. */
const CREEP_PER_SECOND = 0.02;

export class LiveCrew {
  private running = new Set<string>();
  private nextIdea = 0;
  private lastBriefingDay = "";
  private nextQwenCheck = 0;
  private qwenUp = false;
  private now: () => number;

  constructor(
    private ledger: Ledger,
    private opts: LiveOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.ledger.setUnavailable([...NOT_CONNECTED, "qwen"]);
  }

  tick(dt: number) {
    const now = this.now();
    if (now >= this.nextQwenCheck) {
      this.nextQwenCheck = now + CHECK_QWEN_EVERY;
      void this.checkQwen();
    }
    this.plan(now);
    dispatch(this.ledger);
    for (const task of this.ledger.getState().tasks) {
      if (task.state !== "active") continue;
      if (this.running.has(task.id)) {
        // Keep the progress bar alive without ever claiming the stage is done.
        this.ledger.work(task.id, Math.min(CREEP_PER_SECOND * dt, Math.max(0, 0.9 - task.progress)), 0);
      } else {
        this.running.add(task.id);
        void this.runStage(task).finally(() => this.running.delete(task.id));
      }
    }
  }

  /** Is a stage in flight? For tests and a clean shutdown. */
  busy() {
    return this.running.size > 0;
  }

  private async checkQwen() {
    const up = await this.opts.qwenReady().catch(() => false);
    if (up === this.qwenUp) return;
    this.qwenUp = up;
    this.ledger.setUnavailable(up ? NOT_CONNECTED : [...NOT_CONNECTED, "qwen"]);
    this.ledger.log(up ? "Qwen is ready on this Mac." : "Qwen isn't answering on this Mac; research waits for it.", up ? "success" : "warning");
  }

  /** New work: a product idea every few hours, and one briefing a day. */
  private plan(now: number) {
    const tasks = this.ledger.getState().tasks;
    const open = tasks.filter((t) => t.workflowId === "listing" && t.state !== "done").length;
    if (now >= this.nextIdea && open < MAX_OPEN_IDEAS) {
      this.ledger.createTask("etsy", "listing", "New product idea");
      this.nextIdea = now + (this.opts.ideaEveryHours ?? 4) * HOUR;
    }
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.lastBriefingDay) {
      this.lastBriefingDay = day;
      this.ledger.createTask("core", "briefing", `Daily briefing ${day}`);
    }
  }

  private async runStage(task: Task) {
    const stage = this.ledger.stagesOf(task)[task.stageIndex];
    if (!stage) return;
    try {
      const done = await this.doStage(task, stage.id);
      // The owner may have paused the agent or stopped the work meanwhile.
      const now = this.ledger.task(task.id);
      if (!now || now.state !== "active" || now.stageIndex !== task.stageIndex) return;
      if (typeof done === "string") return this.ledger.failStage(task.id, done);
      this.ledger.work(task.id, 1, done.cost);
      this.ledger.finishStage(task.id, done.note, done.draft ? { draft: done.draft } : {});
    } catch (err) {
      this.ledger.failStage(task.id, `Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Do one stage. Returns what it produced, or why it failed. */
  private async doStage(task: Task, stageId: string): Promise<{ note: string; cost: number; draft?: ReturnType<typeof asListing> } | string> {
    const shop = this.opts.shop?.() || DEFAULT_SHOP;
    const state = this.ledger.getState();
    switch (stageId) {
      case "research": {
        const result = await this.ask(task, researchRequest(task, state, shop));
        if (!result.ok) return `Research didn't work: ${result.error}`;
        const idea = asIdea(result.output);
        this.ledger.setBrief(task.id, JSON.stringify(idea), idea.title);
        return { note: idea.idea, cost: result.costUsd };
      }
      case "design": {
        const idea = readIdea(task);
        if (!idea) return "There's no product idea to design from.";
        // Only the type designer is connected so far.
        const design = this.opts.designs.save(typeDesign(idea.phrase || idea.title, task.id));
        this.ledger.setBrief(task.id, JSON.stringify({ ...idea, design }));
        return { note: `Type design: "${idea.phrase}"`, cost: 0 };
      }
      case "list": {
        const idea = readIdea(task);
        if (!idea) return "There's no product idea to write a listing for.";
        const result = await this.ask(task, listingRequest(idea, shop));
        if (!result.ok) return `Writing the listing didn't work: ${result.error}`;
        return { note: "Listing written for your review", cost: result.costUsd, draft: asListing(result.output, idea.design) };
      }
      case "brief": {
        const result = await this.ask(task, briefingRequest(state));
        if (!result.ok) return `The briefing didn't work: ${result.error}`;
        return { note: (result.output as { summary: string }).summary, cost: result.costUsd };
      }
      case "publish":
        // Checked here as well as by the ledger, so no action code runs on a stale approval.
        if (!this.ledger.mayAct(task)) return "This listing no longer matches what you approved.";
        return "Printify isn't connected yet, so nothing was published.";
      default:
        return `No real crew for "${stageId}" yet.`;
    }
  }

  /** Ask the model the router picked. Only Qwen and Claude read text so far; anything else is a routing bug. */
  private async ask(task: Task, req: ReaderRequest): Promise<ReaderResult> {
    const model = task.model;
    if (model !== "qwen" && model !== "claude") {
      return { ok: false, inputFlags: [], costUsd: 0, error: `${model ?? "no model"} isn't connected` };
    }
    return this.opts.think(model, { ...req, model });
  }
}
