import { describe, expect, it } from "vitest";
import { DEFAULT_SHOP, listingRequest } from "./jobs";

// What the listing writer is told to disclose. Etsy's rules are product
// requirements, so these instructions are tested like any other behaviour.

describe("listing instructions", () => {
  const request = listingRequest({ title: "Plant mum mug", idea: "A mug for plant lovers", keywords: ["plants"], phrase: "PLANT MUM" }, DEFAULT_SHOP);

  it("asks for the AI disclosure Etsy requires", () => {
    expect(request.instructions).toMatch(/made with AI assistance/);
  });

  it("asks the writer to say a print partner makes and ships the item", () => {
    expect(request.instructions).toMatch(/printed to order and shipped by the shop's print partner/);
  });

  it("passes the research model's idea as outside text, never as instructions", () => {
    expect(request.instructions).not.toContain("PLANT MUM");
    expect(request.untrusted).toContain("PLANT MUM");
  });
});
