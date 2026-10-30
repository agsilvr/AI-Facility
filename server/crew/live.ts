import { dispatch } from "../../src/core/dispatch";
import { canReadFor } from "../../src/core/capabilities";
import type { Ledger } from "../../src/core/ledger";
import type { Draft, Flag, ModelId, Task } from "../../src/core/types";
import { RESEARCH_SCHEMA, RESEARCH_SOURCES, type ResearchReport } from "../../src/core/research";
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
const NOT_CONNECTED: ModelId[] = ["deepseek"];
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
  private paused = false;

  constructor(
    private ledger: Ledger,
    private opts: LiveOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.ledger.setUnavailable([...NOT_CONNECTED, "qwen"]);
    const state = this.ledger.getState();
    if (this.ledger.operator().active === "claude" && this.ledger.operator().automatic && state.approvals.some((a) =>
      a.status === "pending" && a.kind === "failure" && a.flags.some((f) => /Claude Code/.test(f.message)))) {
      this.ledger.handoff("codex", this.ledger.operator().generation, "Claude has stopped jobs. Codex is holding command; existing stopped steps still need your retry.");
    }
  }

  tick(dt: number) {
    if (this.paused) return;
    const now = this.now();
    if (now >= this.nextQwenCheck) {
      this.nextQwenCheck = now + CHECK_QWEN_EVERY;
      void this.checkQwen();
    }
    this.plan(now);
    dispatch(this.ledger);
    for (const task of this.ledger.getState().tasks) {
      if (task.state !== "active") continue;
      const token = task.runToken ?? task.id;
      if (this.running.has(token)) {
        // Keep the progress bar alive without ever claiming the stage is done.
        this.ledger.work(task.id, Math.min(CREEP_PER_SECOND * dt, Math.max(0, 0.9 - task.progress)), 0);
      } else {
        this.running.add(token);
        void this.runStage(task).finally(() => this.running.delete(token));
      }
    }
  }

  /** Is a stage in flight? For tests and a clean shutdown. */
  busy() {
    return this.running.size > 0;
  }

  setPaused(paused: boolean) { this.paused = paused; }

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
    if (day !== this.lastBriefingDay && !tasks.some((t) => t.workflowId === "briefing" && t.title === `Daily briefing ${day}`)) {
      this.lastBriefingDay = day;
      this.ledger.createTask("core", "briefing", `Daily briefing ${day}`);
    }
  }

  private async runStage(task: Task) {
    if (!this.ledger.mayWork(task)) {
      this.ledger.failStage(task.id, "Agent permission check failed. This stage cannot run.");
      return;
    }
    const stage = this.ledger.stagesOf(task)[task.stageIndex];
    if (!stage) return;
    try {
      const done = await this.doStage(task, stage.id);
      // The owner may have paused the agent or stopped the work meanwhile.
      const now = this.ledger.task(task.id);
      if (this.paused || !now || now.state !== "active" || now.runToken !== task.runToken || now.stageIndex !== task.stageIndex) return;
      if (!this.ledger.mayWork(task)) return this.ledger.failStage(task.id, "Agent permissions changed while this stage was running.");
      if (typeof done === "string") {
        if (task.model === "claude" && this.ledger.operator().active === "claude" && this.ledger.operator().automatic) {
          this.ledger.handoff("codex", this.ledger.operator().generation, "Claude could not complete its step. Codex is the temporary operator; return control when Claude is available.");
          return;
        }
        return this.ledger.failStage(task.id, done);
      }
      if (done.brief) this.ledger.setBrief(task.id, done.brief, done.title);
      this.ledger.work(task.id, 1, done.cost);
      this.ledger.finishStage(task.id, done.note, { draft: done.draft, inputFlags: done.inputFlags });
    } catch (err) {
      if (!this.paused && this.ledger.task(task.id)?.runToken === task.runToken) this.ledger.failStage(task.id, `Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Do one stage. Returns what it produced, or why it failed. */
  private async doStage(task: Task, stageId: string): Promise<{ note: string; cost: number; draft?: Draft; brief?: string; title?: string; inputFlags?: Flag[] } | string> {
    switch (stageId) {
      case "research-test": {
        const result = await this.ask(task, {
          purpose: "public-research-test", instructions: "You are researching original print-on-demand wall art. Using only the supplied public evidence, propose three distinct product directions. Cite source IDs, distinguish hypotheses from evidence, and name the next validation step. Never invent competitor prices, revenue, sales or a source. Explain limitations. Return the required JSON.",
          source: "public evidence checked October 30, 2026", untrusted: JSON.stringify(RESEARCH_SOURCES), schema: RESEARCH_SCHEMA,
        });
        if (!result.ok) return `Qwen research stopped: ${result.error}`;
        const report = result.output as Omit<ResearchReport, "kind" | "sources">;
        if (!report.opportunities.length || report.opportunities.some((o) => !o.sourceIds.length || o.sourceIds.some((id) => !RESEARCH_SOURCES.some((s) => s.id === id)))) return "Research did not link its recommendations to the supplied evidence.";
        return { note: "Public evidence reviewed. Research notebook is ready.", cost: 0, inputFlags: result.inputFlags,
          brief: JSON.stringify({ ...report, kind: "research-report", sources: RESEARCH_SOURCES }) };
      }
      case "research": {
        const result = await this.ask(task, researchRequest(task, this.ledger.getState(), this.opts.shop?.() || DEFAULT_SHOP));
        if (!result.ok) return `Research didn't work: ${result.error}`;
        const idea = asIdea(result.output);
        return { note: idea.idea, cost: 0, brief: JSON.stringify(idea), title: idea.title, inputFlags: result.inputFlags };
      }
      case "design": {
        const idea = readIdea(task);
        if (!idea) return "There's no product idea to design from.";
        // Only the type designer is connected so far.
        const design = this.opts.designs.save(typeDesign(idea.phrase || idea.title, task.id));
        return { note: `Type design: "${idea.phrase}"`, cost: 0, brief: JSON.stringify({ ...idea, design }) };
      }
      case "quality": {
        const idea = readIdea(task);
        const svg = idea?.design && this.opts.designs.read(idea.design);
        if (!svg || !svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') || !svg.includes('viewBox="0 0 2000 2000"')) return "Artwork is missing or has an unexpected format. Return it to Design Studio.";
        return { note: "Artwork file and SVG dimensions are valid. Supplier print checks and your creative review are still required.", cost: 0 };
      }
      case "list": {
        const idea = readIdea(task);
        if (!idea) return "There's no product idea to write a listing for.";
        const result = await this.ask(task, listingRequest(idea, this.opts.shop?.() || DEFAULT_SHOP));
        if (!result.ok) return `Writing the listing didn't work: ${result.error}`;
        return { note: "Listing written for your review", cost: 0, draft: asListing(result.output, idea.design), inputFlags: result.inputFlags };
      }
      case "brief": {
        const result = await this.ask(task, briefingRequest(this.ledger.getState()));
        if (!result.ok) return `The briefing didn't work: ${result.error}`;
        return { note: (result.output as { summary: string }).summary, cost: 0, inputFlags: result.inputFlags };
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
    const agent = task.agentId ? this.ledger.agent(task.agentId) : undefined;
    if (!this.ledger.mayWork(task) || !agent || !canReadFor(agent, req.purpose)) {
      return { ok: false, inputFlags: [], costUsd: 0, error: "Agent is not authorized for this reader request" };
    }
    const model = task.model;
    if (model !== "qwen" && model !== "claude" && model !== "codex") {
      return { ok: false, inputFlags: [], costUsd: 0, error: `${model ?? "no model"} isn't connected` };
    }
    const result = await this.opts.think(model, { ...req, model });
    this.ledger.recordUsage(task.id, model, result.costUsd);
    return result;
  }
}
