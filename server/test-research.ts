import { buildResearchReport, type ResearchOpportunity } from "../src/core/research";
export const researchOutput = {
  opportunities: [
    { family: "bookish-crewneck", title: "Bookish cat crewneck", audience: "Reader buying a book-club gift", concept: "Original cat librarian DTG crewneck", sourceIds: ["etsy-book-club-item", "printify-crewneck"], keyword: "cat reading sweatshirt" },
    { family: "pet-ornament", title: "Custom pet ornament", audience: "Pet owner buying a holiday gift", concept: "Personalized pet portrait ceramic ornament with per-order proofs", sourceIds: ["etsy-pet-ornament-item", "printify-ornament-guide"], keyword: "personalized pet ornament" },
    { family: "reader-print", title: "Reading corner gallery", audience: "Reader decorating a reading nook", concept: "Original reading-corner gallery print", sourceIds: ["etsy-gallery-trend", "printify-posters"], keyword: "reading corner print" },
  ],
};
export function researchNotebook() {
  return buildResearchReport(researchOutput.opportunities as unknown as ResearchOpportunity[]);
}
