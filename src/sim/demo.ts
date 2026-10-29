import { dispatch } from "../core/dispatch";
import type { Ledger } from "../core/ledger";

// Demo mode: simulated agents with canned output, so the facility can be tried
// before any real AI model or Etsy shop is connected. Nothing here costs money;
// the "cost" figures are pretend, to show how budgets behave.

const PRODUCT_IDEAS = [
  "Minimalist moon phase wall print",
  "Custom pet portrait mug",
  "Retro sunset sticker pack",
  "Botanical line-art tote bag",
  "Personalised star map poster",
  "Cottagecore mushroom earrings print",
  "Funny cat-dad t-shirt",
  "Watercolour wedding invitation set",
  "Kawaii planner sticker sheet",
  "Vintage national park poster",
];

const MESSAGES = [
  "Buyer asks about shipping time to Canada",
  "Buyer wants a custom name on the mug",
  "Buyer asks if the print comes framed",
  "Buyer reports a smudge on their order",
];

const STAGE_NOTES: Record<string, string[]> = {
  research: [
    "Search volume rising 18% this month, low competition",
    "Top 10 listings average 4.8 stars, gap in pastel colourways",
    "Seasonal spike expected in 3 weeks",
  ],
  design: [
    "3 variations drafted, mockups on print-on-demand template",
    "Palette tuned to match top sellers, 2 sizes",
    "Design ready with AI use disclosed",
  ],
  list: [
    "Title, 13 tags and description drafted, price $18.50",
    "Listing drafted with AI disclosure, price $24.00",
    "Listing drafted, 2 variations, price $12.00",
  ],
  publish: ["Published and linked to print-on-demand partner"],
  reply: [
    "Friendly reply drafted with order tracking info",
    "Reply drafted offering a free replacement",
    "Reply drafted confirming customisation is possible",
  ],
  send: ["Reply sent"],
  brief: ["Briefing: sales steady, 2 items waiting for you, budget on track"],
};

// Don't pile up work faster than the owner can review it.
const MAX_BACKLOG = 6;

function pick<T>(items: T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)];
}

export interface DemoOptions {
  /** Simulated seconds per new product idea. */
  ideaEvery?: number;
  messageEvery?: number;
  briefingEvery?: number;
  /** Fraction of a stage completed per second. */
  workRate?: number;
  /** Pretend dollars spent per second of agent work. */
  costRate?: number;
  rand?: () => number;
}

export class DemoSimulation {
  private elapsed = 0;
  private nextIdea = 1;
  private nextMessage = 12;
  private nextBriefing = 4;
  private opts: Required<DemoOptions>;

  constructor(
    private ledger: Ledger,
    options: DemoOptions = {},
  ) {
    this.opts = {
      ideaEvery: 14,
      messageEvery: 30,
      briefingEvery: 90,
      workRate: 0.12,
      costRate: 0.002,
      rand: Math.random,
      ...options,
    };
  }

  /** Unfinished work in a wing: waiting for you, queued, or in progress. */
  private backlog(wingId: string) {
    return this.ledger.getState().tasks.filter((t) => t.wingId === wingId && t.state !== "done").length;
  }

  /** Advance the simulation by dt seconds. */
  tick(dt: number) {
    const { ledger, opts } = this;
    this.elapsed += dt;

    if (this.elapsed >= this.nextIdea && this.backlog("etsy") < MAX_BACKLOG) {
      ledger.createTask("etsy", "listing", pick(PRODUCT_IDEAS, opts.rand));
      this.nextIdea = this.elapsed + opts.ideaEvery * (0.7 + opts.rand() * 0.6);
    }
    if (this.elapsed >= this.nextMessage && this.backlog("etsy") < MAX_BACKLOG) {
      ledger.createTask("etsy", "message", pick(MESSAGES, opts.rand));
      this.nextMessage = this.elapsed + opts.messageEvery * (0.7 + opts.rand() * 0.6);
    }
    if (this.elapsed >= this.nextBriefing) {
      ledger.createTask("core", "briefing", "Daily briefing");
      this.nextBriefing = this.elapsed + opts.briefingEvery;
    }

    dispatch(ledger);

    for (const task of ledger.getState().tasks) {
      if (task.state !== "active") continue;
      const finished = ledger.work(task.id, opts.workRate * dt, opts.costRate * dt);
      if (finished) {
        const stage = ledger.stagesOf(task)[task.stageIndex];
        ledger.finishStage(task.id, pick(STAGE_NOTES[stage.id] ?? ["Done"], opts.rand));
      }
    }
  }
}
