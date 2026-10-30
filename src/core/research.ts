/** A deliberately public evidence pack. No shop plans or customer data. */
export const RESEARCH_SOURCES = [
  {
    id: "etsy-seasonal",
    title: "Etsy · Fall and Winter 2026 trend report",
    url: "https://www.etsy.com/seller-handbook/article/1521255894814",
    checkedAt: "2026-10-30",
    notes:
      "Published October 14, 2026. Etsy describes interest in personal expression, gifts with a story, bold seasonal decoration and whimsical decor. The report combines recent Etsy search/sales information with forecasting; search changes are not proof of sales for any proposed product.",
  },
  {
    id: "printify-posters",
    title: "Printify · Custom posters",
    url: "https://printify.com/custom-posters/",
    checkedAt: "2026-10-30",
    notes:
      "Printify offers print-on-demand framed and unframed posters, multiple sizes and paper finishes, with no minimum order. Its product creator supports artwork placement and print previews. This general page is not a supplier-specific price quote; shipping, variant costs and margins still need verification.",
  },
];

export interface ResearchReport {
  kind: "research-report";
  summary: string;
  opportunities: {
    title: string;
    audience: string;
    concept: string;
    evidence: string;
    sourceIds: string[];
    nextStep: string;
  }[];
  limitations: string[];
  sources: typeof RESEARCH_SOURCES;
}

export const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "opportunities", "limitations"],
  properties: {
    summary: { type: "string", maxLength: 700 },
    opportunities: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "audience",
          "concept",
          "evidence",
          "sourceIds",
          "nextStep",
        ],
        properties: {
          title: { type: "string", maxLength: 80 },
          audience: { type: "string", maxLength: 180 },
          concept: { type: "string", maxLength: 400 },
          evidence: { type: "string", maxLength: 300 },
          sourceIds: {
            type: "array",
            maxItems: 2,
            items: { type: "string", maxLength: 30 },
          },
          nextStep: { type: "string", maxLength: 250 },
        },
      },
    },
    limitations: {
      type: "array",
      maxItems: 5,
      items: { type: "string", maxLength: 250 },
    },
  },
};

export function readResearch(brief?: string): ResearchReport | null {
  try {
    const value = JSON.parse(brief ?? "null");
    return value?.kind === "research-report" ? value : null;
  } catch {
    return null;
  }
}
