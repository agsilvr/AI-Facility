import { dispatch } from "../../src/core/dispatch";
import { canReadFor } from "../../src/core/capabilities";
import type { Ledger } from "../../src/core/ledger";
import type { Draft, Flag, ModelId, Task } from "../../src/core/types";
import { buildResearchReport, researchEvidenceProblem, RESEARCH_SCHEMA, type ResearchOpportunity } from "../../src/core/research";
import { validate, type ReaderModel, type ReaderRequest, type ReaderResult } from "../agents/reader";
import { type Designs, typeDesign } from "./designs";
import { asIdea, asListing, DEFAULT_SHOP, listingRequest, notebookRequest, readIdea, researchRequest } from "./jobs";
import { planResearch } from "./research";
import { productCandidates, productDue } from "./selection";
import { factualBriefing } from "../../src/core/health";
import { artworkPrompt } from "./artwork";

// The real crew. The same ledger, dispatch and router as the demo, but each
// stage is done by the model the router picked, through the locked-down
// reader. A stage that fails stops and waits for the owner (fail closed);
// nothing is retried on its own.
//
// What's wired so far: research on Qwen, type-only designs, listings and the
// factual briefings in code. Notebooks analyze saved public
// evidence locally, without accessing Etsy. Publishing waits for a connection.

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
  /** Persisted owner policy can disable automatic products while research continues. */
  automaticProducts?: () => boolean;
  /** Daily briefings use the shop's calendar, independently of the host timezone. */
  timezone?: string;
}

/** Models with no connection yet; the router never sends them work. */
const NOT_CONNECTED: ModelId[] = ["deepseek"];
const HOUR = 60 * 60 * 1000;
const CHECK_QWEN_EVERY = 60 * 1000;

export class LiveCrew {
  private running = new Set<string>();
  private nextIdea = 0;
  private lastBriefingDay = "";
  private nextQwenCheck = 0;
  private qwenUp = false;
  private now: () => number;
  private paused = false;
  private dayFormat: Intl.DateTimeFormat;

  constructor(
    private ledger: Ledger,
    private opts: LiveOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.dayFormat = new Intl.DateTimeFormat("en-CA", {
      timeZone: opts.timezone ?? "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    });
    this.ledger.setUnavailable([...NOT_CONNECTED, "qwen"]);
    const state = this.ledger.getState();
    if (this.ledger.operator().active === "claude" && this.ledger.operator().automatic && state.approvals.some((a) =>
      a.status === "pending" && a.kind === "failure" && a.flags.some((f) => /Claude Code/.test(f.message)))) {
      this.ledger.handoff("codex", this.ledger.operator().generation, "Claude has stopped jobs. Codex is holding command; existing stopped steps still need your retry.");
    }
  }

  tick(_dt: number) {
    if (this.paused) return;
    const now = this.now();
    this.checkHealth();
    this.plan(now);
    dispatch(this.ledger);
    for (const task of this.ledger.getState().tasks) {
      if (task.state !== "active") continue;
      const token = task.runToken ?? task.id;
      if (!this.running.has(token)) {
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

  /** Read-only local readiness probes continue while business production is paused. */
  checkHealth() {
    const now = this.now();
    if (now < this.nextQwenCheck) return;
    this.nextQwenCheck = now + CHECK_QWEN_EVERY;
    void this.checkQwen();
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
    const interval = (this.opts.ideaEveryHours ?? 4) * HOUR;
    if ((this.opts.automaticProducts?.() ?? false) && now >= this.nextIdea && productDue(this.ledger.getState(), now, interval)) {
      this.ledger.createTask("etsy", "listing", "New product idea");
      this.nextIdea = now + (this.opts.ideaEveryHours ?? 4) * HOUR;
    }
    planResearch(this.ledger, now);
    const parts = this.dayFormat.formatToParts(now);
    const day = ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)!.value).join("-");
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
        if (this.fallbackToCodex(task)) return;
        return this.ledger.failStage(task.id, done);
      }
      if (done.brief) this.ledger.setBrief(task.id, done.brief, done.title);
      this.ledger.work(task.id, 1, done.cost);
      this.ledger.finishStage(task.id, done.note, { draft: done.draft, inputFlags: done.inputFlags });
    } catch (err) {
      if (this.paused || this.ledger.task(task.id)?.runToken !== task.runToken) return;
      if (this.fallbackToCodex(task)) return;
      this.ledger.failStage(task.id, `Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** One subscription fallback for drafting, never a retry of an outward action. */
  private fallbackToCodex(task: Task): boolean {
    const current = this.ledger.task(task.id);
    const stage = this.ledger.stagesOf(task)[task.stageIndex];
    const operator = this.ledger.operator();
    if (this.paused || !current || current.state !== "active" || current.runToken !== task.runToken
      || current.stageIndex !== task.stageIndex || !this.ledger.mayWork(task) || stage?.action || stage?.executor === "code"
      || task.model !== "claude" || operator.active !== "claude" || !operator.automatic) return false;
    return this.ledger.handoff("codex", operator.generation,
      "Claude could not complete its drafting step. Codex is the temporary operator; return control when Claude is available.");
  }

  /** Do one stage. Returns what it produced, or why it failed. */
  private async doStage(task: Task, stageId: string): Promise<{ note: string; cost: number; draft?: Draft; brief?: string; title?: string; inputFlags?: Flag[] } | string> {
    switch (stageId) {
      case "research-test": {
        const result = await this.ask(task, notebookRequest(task, this.ledger.getState()));
        if (!result.ok) return `Qwen research stopped: ${result.error}`;
        const shape = validate(result.output, RESEARCH_SCHEMA);
        if (shape) return `Research format rejected: ${shape}`;
        const opportunities = (result.output as { opportunities: ResearchOpportunity[] }).opportunities;
        const evidenceProblem = researchEvidenceProblem(opportunities);
        if (evidenceProblem) return `Research evidence rejected: ${evidenceProblem}`;
        const report = buildResearchReport(opportunities);
        return { note: "Saved source citations checked. Product concepts remain unvalidated hypotheses.", cost: 0, inputFlags: result.inputFlags,
          brief: JSON.stringify(report) };
      }
      case "research": {
        const notebook = productCandidates(task, this.ledger.getState(), this.now());
        if (!notebook) return "Research evidence is missing, outdated or unvalidated. Run a notebook against the current evidence pack before starting a product.";
        if (!notebook.candidates.length) return "All eligible directions in the latest notebook are already in production. Wait for new research before retrying.";
        const result = await this.ask(task, researchRequest(task, this.ledger.getState(), this.opts.shop?.() || DEFAULT_SHOP));
        if (!result.ok) return `Research didn't work: ${result.error}`;
        const idea = asIdea(result.output);
        if (notebook) {
          const choice = result.output as { candidateIndex?: number; selectionReason?: string };
          const candidate = notebook.candidates.find((o) => o.candidateIndex === choice.candidateIndex);
          if (!candidate || typeof choice.selectionReason !== "string" || !choice.selectionReason.trim()) return "Automatic product selection did not name an eligible research direction and a reason.";
          idea.selection = { notebookId: notebook.notebookId, candidateIndex: candidate.candidateIndex,
            candidateTitle: candidate.title, reason: choice.selectionReason, sourceIds: [...candidate.sourceIds],
            limitations: [...notebook.limitations, "Saved evidence supports a product hypothesis; current demand, supplier costs and margin are not verified."] };
        }
        return { note: idea.selection ? `Automatically selected ${idea.selection.candidateTitle}: ${idea.selection.reason}` : idea.idea,
          cost: 0, brief: JSON.stringify(idea), title: idea.title, inputFlags: [...(notebook?.flags ?? []), ...result.inputFlags] };
      }
      case "design": {
        const idea = readIdea(task);
        if (!idea) return "There's no product idea to design from.";
        if (task.workflowId === "artwork-pilot") {
          if (task.artwork && task.artworkRequest?.id === task.artwork.requestId) {
            return { note: "Generated image received. Preparing your artwork review.", cost: 0, brief: JSON.stringify({ ...idea, design: task.artwork.id }) };
          }
          this.ledger.requestArtwork(task.id, artworkPrompt(idea, task.revisionFeedback));
          return { note: "Image-generation handoff prepared.", cost: 0 };
        }
        // Only the type designer is connected so far.
        const design = this.opts.designs.save(typeDesign(idea.phrase || idea.title, task.id));
        return { note: `Type design: "${idea.phrase}"`, cost: 0, brief: JSON.stringify({ ...idea, design }) };
      }
      case "quality": {
        const idea = readIdea(task);
        if (task.workflowId === "artwork-pilot") {
          const asset = task.artwork && this.opts.designs.asset(task.artwork.id);
          if (!idea || !task.artwork || !task.artworkRequest || task.artwork.requestId !== task.artworkRequest.id || idea.design !== task.artwork.id || !asset || asset.mime !== "image/png" || asset.width !== task.artwork.width || asset.height !== task.artwork.height) return "Artwork is missing, changed or does not match this review request.";
          return { note: "Inspect the composition, details and overall quality. Acceptance archives this version only; nothing is published.", cost: 0,
            draft: { kind: "artwork", title: idea.title, design: task.artwork.id, width: task.artwork.width, height: task.artwork.height,
              prompt: task.artworkRequest.prompt, revision: task.artworkRequest.revision, inspection: asset.inspection },
            inputFlags: [{ level: "warn", code: "review-image", message: "Concept image for visual review. Supplier print size, costs, mockups and commercial readiness have not been verified." }] };
        }
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
      case "brief":
        return { note: factualBriefing(this.ledger.getState(), this.now()), cost: 0 };
      case "publish":
        // Checked here as well as by the ledger, so no action code runs on a stale approval.
        if (!this.ledger.mayAct(task)) return "This listing no longer matches what you approved.";
        return "Printify isn't connected yet, so nothing was published.";
      case "accept-artwork": {
        if (!this.ledger.mayAct(task) || task.draft?.kind !== "artwork" || !this.opts.designs.asset(task.draft.design)) return "Artwork changed or its exact review approval is no longer valid.";
        return { note: "Owner-accepted artwork archived locally. No listing was created or published.", cost: 0 };
      }
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
