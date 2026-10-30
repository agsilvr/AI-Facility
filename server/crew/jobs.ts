import type { Draft, FacilityState, Task } from "../../src/core/types";
import type { ReaderRequest } from "../agents/reader";

// What each stage of a real workflow asks its model, and what it expects
// back. Every request goes through the locked-down reader, so the model
// gets no tools and must answer in the given JSON shape. Anything a model
// wrote is treated as outside text by the next stage, never as instructions.

/** The product idea research hands on to design and writing. */
export interface Idea {
  title: string;
  idea: string;
  keywords: string[];
  /** A few words for a type-only design. */
  phrase: string;
  /** Set by the design stage. */
  design?: string;
}

const IDEA_SCHEMA = {
  type: "object",
  required: ["title", "idea", "keywords", "phrase"],
  additionalProperties: false,
  properties: {
    title: { type: "string", maxLength: 80 },
    idea: { type: "string", maxLength: 600 },
    keywords: { type: "array", maxItems: 13, items: { type: "string", maxLength: 20 } },
    phrase: { type: "string", maxLength: 40 },
  },
};

const LISTING_SCHEMA = {
  type: "object",
  required: ["title", "description", "tags", "priceUsd"],
  additionalProperties: false,
  properties: {
    title: { type: "string", maxLength: 140 },
    description: { type: "string", maxLength: 2000 },
    tags: { type: "array", maxItems: 13, items: { type: "string", maxLength: 20 } },
    priceUsd: { type: "number" },
  },
};

const BRIEFING_SCHEMA = {
  type: "object",
  required: ["summary"],
  additionalProperties: false,
  properties: { summary: { type: "string", maxLength: 1200 } },
};

/** What the shop sells, until the owner writes their own description. */
export const DEFAULT_SHOP =
  "A small Etsy shop selling print-on-demand designs (wall prints, t-shirts and mugs), made through Printify.";

export function researchRequest(task: Task, state: FacilityState, shop: string): ReaderRequest {
  const recent = state.tasks
    .filter((t) => t.workflowId === "listing" && t.id !== task.id)
    .map((t) => t.title)
    .slice(-30);
  return {
    purpose: "etsy-research",
    instructions: [
      `The shop: ${shop}`,
      "Suggest one new product for this shop that is likely to sell on Etsy and works as a simple typographic design.",
      "Give a short product title, the idea and who it's for, up to 13 Etsy search keywords, and a phrase of at most 6 words to print.",
      "The outside text lists products the shop already has or is making; don't repeat them.",
    ].join("\n"),
    source: "the shop's own product list",
    untrusted: recent.length ? recent.join("\n") : "(none yet)",
    schema: IDEA_SCHEMA,
  };
}

export function listingRequest(idea: Idea, shop: string): ReaderRequest {
  return {
    purpose: "etsy-listing",
    instructions: [
      `The shop: ${shop}`,
      "Write the Etsy listing for the product described in the outside text, which is a draft from another model.",
      "Title up to 140 characters; a warm, honest description that says the design was made with AI assistance and finished by the shop;",
      "up to 13 tags of at most 20 characters; and a fair price in US dollars for this kind of print-on-demand item.",
      "No links, emails, phone numbers, discounts or mentions of paying outside Etsy.",
    ].join("\n"),
    source: "a product idea drafted by the research model",
    untrusted: JSON.stringify({ title: idea.title, idea: idea.idea, keywords: idea.keywords, phrase: idea.phrase }),
    schema: LISTING_SCHEMA,
  };
}

export function briefingRequest(state: FacilityState): ReaderRequest {
  const count = (pred: (t: Task) => boolean) => state.tasks.filter(pred).length;
  const facts = {
    waitingForOwner: state.approvals.filter((a) => a.status === "pending").length,
    inProgress: count((t) => t.state === "active" || t.state === "queued"),
    finishedRecently: count((t) => t.state === "done"),
    spendThisMonth: state.spend,
    recentLog: state.log.slice(0, 15).map((e) => e.text),
  };
  return {
    purpose: "daily-briefing",
    instructions:
      "Write the owner's daily briefing in at most 5 short sentences: what got done, what's waiting for them, and anything that looks wrong. Plain words, no lists.",
    source: "the facility's own records",
    untrusted: JSON.stringify(facts),
    schema: BRIEFING_SCHEMA,
  };
}

export function readIdea(task: Task): Idea | null {
  try {
    return task.brief ? (JSON.parse(task.brief) as Idea) : null;
  } catch {
    return null;
  }
}

export function asIdea(output: unknown): Idea {
  const o = output as Idea;
  return { title: o.title, idea: o.idea, keywords: o.keywords, phrase: o.phrase };
}

export function asListing(output: unknown, design: string | undefined): Draft {
  const o = output as { title: string; description: string; tags: string[]; priceUsd: number };
  return { kind: "listing", title: o.title, description: o.description, tags: o.tags, priceUsd: o.priceUsd, design };
}
