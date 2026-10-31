import type { Idea } from "./jobs";

export function artworkPrompt(idea: Idea, feedback?: string) {
  return [
    "Use case: illustration-story",
    "Asset type: original product artwork for owner quality review; follow the product brief's composition and aspect ratio.",
    "Apply the owner's saved docs/DESIGN-QUALITY.md guidance and relevant version-specific feedback before generation and review.",
    "Create the actual artwork, never a product mockup, photographed monitor or interface. Do not assume every product is a poster.",
    `Product direction: ${idea.title}`,
    `Creative brief: ${idea.artworkPrompt || idea.idea}`,
    "Use one recognizable main subject, restrained supporting detail, deliberate negative space and clean substantial edges. Avoid dense fur/page linework and decorative filler.",
    "Use only exact wording explicitly specified in the brief; otherwise make a no-text concept. Inspect spelling, curved lettering, anatomy, book geometry and accidental tangencies.",
    "For an isolated apparel graphic, use genuine transparency with no opaque rectangle. Follow the brief for other products. Preserve aspect ratio and check visible bounds, not only canvas bounds.",
    "No signatures, logos, watermarks, price labels or borrowed characters. Match the actual product/provider, print method and intended physical size; missing specifications remain unverified.",
    "Review full-resolution artwork, actual supplier mockup and a small listing preview separately. Record exact version, defects, effective resolution and PASS TO OWNER / REVISE / BLOCKED / REJECT CONCEPT. A concept or file-dimensions check cannot establish print readiness.",
    "This is a review image. Do not add claims about demand, printing certification or commercial results.",
    ...(feedback ? [`Owner revision notes (image changes only): ${feedback}`] : []),
  ].join("\n");
}
