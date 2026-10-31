/** Notebook analysis runs daily, separately from the product approval backlog. */
export const RESEARCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Saved public observations, not a live collector or product-sales database. */
export const RESEARCH_SOURCES = [
  {
    id: "etsy-seasonal",
    title: "Etsy · Fall and Winter 2026 trend report",
    url: "https://www.etsy.com/seller-handbook/article/1521255894814",
    checkedAt: "2026-10-30",
    role: "demand",
    evidenceType: "marketplace-category-trend",
    period: "Data as of 2026-09-14; recent three months versus prior year; published 2026-10-14",
    notes: "Pet gifting searches doubled; pet ornaments +22%; personalized friend gifts +1,400%. Category/search signals, not proposed-product sales. US signed-in activity limitations apply. No exact keyword volumes or competition counts supplied.",
  },
  {
    id: "etsy-book-history",
    title: "Etsy · Spring and Summer 2025 trend report",
    url: "https://www.etsy.com/seller-handbook/article/1362959156542",
    checkedAt: "2026-10-30",
    role: "demand",
    evidenceType: "historical-marketplace-trend",
    period: "Spring/Summer 2025 report; historical context, not current 2026 volume",
    notes: "Book-related purchases and book-club interest were documented. This covers multiple product types; it does not validate current demand for a new cat sweatshirt.",
  },
  {
    id: "etsy-book-club-item",
    title: "Etsy · Custom book club sweatshirt, TheLibraryCloset",
    url: "https://www.etsy.com/listing/1597490306/custom-book-club-sweatshirt-personalized",
    checkedAt: "2026-10-30",
    role: "item-observation",
    evidenceType: "adjacent-item-reviews",
    period: "Retrieved public page snapshot; visible review examples from 2025",
    notes: "51 item reviews, 4.9 item rating. About 45,000 displayed sales belongs to the entire shop, not this listing. Reviews show adjacent purchases, not exact item unit sales, monthly sales or demand for our new design. Snapshot may be cached/localized.",
  },
  {
    id: "etsy-book-cat-item",
    title: "Etsy · Book-cat embroidered sweatshirt, FurFamilyStudio",
    url: "https://www.etsy.com/listing/1770495962/cute-book-cat-embroidered-sweatshirt",
    checkedAt: "2026-10-30",
    role: "item-observation",
    evidenceType: "adjacent-item-review",
    period: "Retrieved public page snapshot; one review dated 2026-01-17",
    notes: "One item review, 5.0 rating. Gift purchase evidence only; a tiny sample. Embroidery differs from a DTG printed product. Shop totals and offer prices cannot establish this item's sales, conversion or profitability. Snapshot may be cached/localized.",
  },
  {
    id: "etsy-pet-ornament-item",
    title: "Etsy · Personalized pet watercolor ornament, ModPawsUS",
    url: "https://www.etsy.com/listing/4385389807/personalized-pet-watercolor-ornament",
    checkedAt: "2026-10-30",
    role: "item-observation",
    evidenceType: "adjacent-item-reviews",
    period: "Retrieved public page snapshot; visible review examples from 2025 and January 2026",
    notes: "Six item reviews, 4.7 item rating. Photo/name customization requires per-order artwork and proofs. Shop sales are not item sales. No current item sales volume or profit is available; snapshot may be cached/localized.",
  },
  {
    id: "printify-crewneck",
    title: "Printify · Gildan 18000 crewneck catalog",
    url: "https://printify.com/app/products/49/gildan/unisex-heavy-blend-crewneck-sweatshirt",
    checkedAt: "2026-10-30",
    role: "supplier-capability",
    evidenceType: "public-supplier-catalog",
    period: "Public starting-price snapshot; actual selected account quote unavailable",
    notes: "US Printify Choice DTG catalog starts at USD 17.87 plus shipping from USD 7.39. These are starting estimates, not a selected variant/provider quote or verified contribution. Account prices, destination, print area and availability must be checked before preparing a listing.",
  },
  {
    id: "printify-ornament-guide",
    title: "Printify · Ceramic ornament design guidelines",
    url: "https://help.printify.com/hc/en-us/articles/4483628673681-What-are-the-design-guidelines-for-ceramic-ornaments",
    checkedAt: "2026-10-30",
    role: "supplier-capability",
    evidenceType: "production-guidance",
    period: "Guidance retrieved 2026-10-30; selected product template still required",
    notes: "Small print area needs bold text/lines and safe-area placement. Tiny details and pale gradients risk poor reproduction. Guidance is production feasibility evidence, not buyer demand or an exact template.",
  },
  {
    id: "etsy-gallery-trend",
    title: "Etsy · Spring and Summer 2026 trend report",
    url: "https://www.etsy.com/seller-handbook/article/1473931456647",
    checkedAt: "2026-10-30",
    role: "demand",
    evidenceType: "marketplace-category-trend",
    period: "Data as of 2026-02-10; recent three months versus prior year; published 2026-03-17",
    notes: "Gallery prints +80% and wall-art decor +110% are broad category search signals. They do not establish current demand for reader-specific illustrations or profitable prints. No exact product search volume, item sales or conversion is supplied.",
  },
  {
    id: "printify-posters",
    title: "Printify · Custom posters",
    url: "https://printify.com/custom-posters/",
    checkedAt: "2026-10-30",
    role: "supplier-capability",
    evidenceType: "public-supplier-catalog",
    period: "Saved general product-family information; no selected supplier quote",
    notes: "Print-on-demand framed and unframed posters are feasible product families. This page establishes supply only, not demand, shipping cost, variant margin or a reason to prefer wall art over other products.",
  },
];

export const RESEARCH_VERSION = 2;
export const RESEARCH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const PRODUCT_FAMILIES = {
  "bookish-crewneck": { label: "Bookish-cat DTG crewneck", supplier: "printify-crewneck", buyers: ["etsy-book-history", "etsy-book-club-item", "etsy-book-cat-item"] },
  "pet-ornament": { label: "Personalized pet ornament", supplier: "printify-ornament-guide", buyers: ["etsy-seasonal", "etsy-pet-ornament-item"] },
  "reader-print": { label: "Reader gallery print", supplier: "printify-posters", buyers: ["etsy-gallery-trend", "etsy-book-history"] },
};
export type ProductFamily = keyof typeof PRODUCT_FAMILIES;
export interface ResearchOpportunity {
  title: string;
  audience: string;
  concept: string;
  evidence: string;
  sourceIds: string[];
  nextStep: string;
  family?: ProductFamily;
  keyword?: string;
}
export interface ResearchReport {
  kind: "research-report";
  evidenceVersion?: number;
  summary: string;
  opportunities: ResearchOpportunity[];
  limitations: string[];
  sources: typeof RESEARCH_SOURCES;
}

// Models propose concepts and select citations. Factual evidence is assembled
// from the saved source notes by code, never rewritten by the model.
export const RESEARCH_SCHEMA = {
  type: "object", additionalProperties: false, required: ["opportunities"],
  properties: {
    opportunities: {
      type: "array", minItems: 3, maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        required: ["family", "title", "audience", "concept", "sourceIds", "keyword"],
        properties: {
          family: { type: "string", enum: Object.keys(PRODUCT_FAMILIES) },
          title: { type: "string", minLength: 1, maxLength: 80 },
          audience: { type: "string", minLength: 1, maxLength: 180 },
          concept: { type: "string", minLength: 1, maxLength: 400 },
          sourceIds: { type: "array", minItems: 2, maxItems: 3,
            items: { type: "string", enum: RESEARCH_SOURCES.map((s) => s.id) } },
          keyword: { type: "string", minLength: 3, maxLength: 70 },
        },
      },
    },
  },
};

export function evidenceFor(ids: string[]) {
  return ids.map((id) => {
    const source = RESEARCH_SOURCES.find((s) => s.id === id)!;
    return `${source.title} — ${source.period}. ${source.notes}`;
  }).join("\n\n");
}

/** Semantic checks supplement JSON shape; a supplier citation is not demand. */
export function researchEvidenceProblem(opportunities: ResearchOpportunity[]): string | null {
  if (opportunities.length !== 3 || new Set(opportunities.map((o) => o.family)).size !== 3) return "Compare each of the three product families exactly once.";
  for (const o of opportunities) {
    // Creative fields must describe the proposed product, not smuggle market
    // conclusions around the factual evidence renderer. This is a bounded
    // lexical check, not a claim of complete semantic verification.
    if (/\b(?:demand|sales|revenue|profit(?:able|ability)?|competition|competitors?|saturat(?:ed|ion)|bestsell(?:er|ing)|conversion|high[- ]performing|(?:starting|base|catalog) prices?|guaranteed?)\b/i.test([o.title, o.audience, o.concept].join(" "))) return "Creative fields contain a market-performance or pricing claim. Describe only the proposed product and buyer; evidence and economics are supplied separately.";
    if (/non[- ]copyrighted|copyright[- ]free|commercially safe|royalty[- ]free|(?:cleared|verified) (?:rights|licen[sc]e)/i.test([o.title, o.audience, o.concept].join(" "))) return "Creative fields cannot certify copyright, commercial rights or licensing. Asset provenance requires a separate review.";
    if (!o.keyword?.trim() || o.keyword.length > 70) return "Each hypothesis needs a specific buyer keyword to validate.";
    const family = o.family && Object.hasOwn(PRODUCT_FAMILIES, o.family) ? PRODUCT_FAMILIES[o.family] : undefined;
    if (!family || !o.sourceIds.every((id) => RESEARCH_SOURCES.some((s) => s.id === id))) return "Unknown family or evidence source.";
    if (new Set(o.sourceIds).size !== o.sourceIds.length) return "Duplicate citations do not add evidence.";
    if (!o.sourceIds.includes(family.supplier) || !o.sourceIds.some((id) => family.buyers.includes(id))) return `${family.label} needs its own supplier evidence and relevant buyer evidence.`;
    if (o.sourceIds.some((id) => RESEARCH_SOURCES.find((s) => s.id === id)?.role === "supplier-capability" && id !== family.supplier)) return "Supplier evidence belongs to a different product family.";
  }
  return null;
}

export function validationStep(o: ResearchOpportunity) {
  const product = o.family === "bookish-crewneck" ? "Gildan 18000, exact provider, DTG front, US size M" : o.family === "pet-ornament" ? "the exact ceramic ornament, provider and template; include per-order artwork/proof labor" : "the exact poster, provider, paper, size and framing variant";
  return `Check '${o.keyword}' in Marketplace Insights for searches, listings and displayed period. Obtain a dated account quote for ${product} with shipping to the chosen destination. Subtract actual platform/payment/listing fees, applicable ads, returns and labor. Starting prices are not selected-variant quotes.`;
}

export function buildResearchReport(opportunities: ResearchOpportunity[]): ResearchReport {
  const problem = researchEvidenceProblem(opportunities);
  if (problem) throw new Error(problem);
  return {
    kind: "research-report", evidenceVersion: RESEARCH_VERSION,
    summary: "Three product hypotheses from saved evidence. Their ranking is a model suggestion, not measured demand or profitability.",
    opportunities: opportunities.map((o) => ({ ...o, evidence: evidenceFor(o.sourceIds), nextStep: validationStep(o) })),
    limitations: ["Analysis of saved evidence only; no live Etsy or competitor data was collected.",
      "Concepts and suggested keywords are model proposals, not verified market facts.",
      "Exact-product demand, supplier variant quotes, shipping, fees and margins remain unverified.",
      "Asset provenance and commercial rights require a separate review; a generated proposal does not establish them."],
    sources: RESEARCH_SOURCES,
  };
}

/** Historical notes remain readable, but malformed saved text must not crash the app. */
export function readResearch(brief?: string): ResearchReport | null {
  try {
    const v = JSON.parse(brief ?? "null");
    if (v?.kind !== "research-report" || typeof v.summary !== "string" || !Array.isArray(v.opportunities)
      || !Array.isArray(v.limitations) || !v.limitations.every((s: unknown) => typeof s === "string")
      || !Array.isArray(v.sources) || !v.sources.every((s: Record<string, unknown> | null) => s && [s.id, s.title, s.url, s.notes, s.checkedAt].every((x) => typeof x === "string") && /^https:\/\//.test(String(s.url)))) return null;
    if (!v.opportunities.every((o: ResearchOpportunity | null) => o && [o.title, o.audience, o.concept, o.evidence, o.nextStep].every((s) => typeof s === "string" && s.trim())
      && Array.isArray(o.sourceIds) && o.sourceIds.length && o.sourceIds.every((s) => typeof s === "string"))) return null;
    return v;
  } catch { return null; }
}

/** Legacy reports are history, never silently certified under the new contract. */
export function currentResearch(report: ResearchReport | null, now = Date.now()): boolean {
  if (!report || report.evidenceVersion !== RESEARCH_VERSION || JSON.stringify(report.sources) !== JSON.stringify(RESEARCH_SOURCES)
    || researchEvidenceProblem(report.opportunities)) return false;
  if (report.opportunities.some((o) => (o.evidence !== evidenceFor(o.sourceIds) || o.nextStep !== validationStep(o)))) return false;
  return report.sources.every((s) => {
    const age = now - Date.parse(s.checkedAt + "T00:00:00Z");
    return age >= 0 && age <= RESEARCH_MAX_AGE_MS;
  });
}
