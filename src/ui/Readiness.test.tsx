import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { initialState } from "../core/seed";
import { Readiness } from "./Readiness";

describe("business readiness dashboard", () => {
  it("shows the profit target, actual gaps and no fabricated earnings or ready-to-publish claim", () => {
    const html = renderToStaticMarkup(<Readiness state={initialState()} now={Date.UTC(2026, 9, 31)} control={{ running: false, speed: 1, mode: "live", automaticProducts: false }} connected onResearch={() => {}} onJobs={() => {}} />);
    for (const text of ["$10,000", "Profit after costs", "actual profit unknown", "Production paused", "Not connected", "Not certified", "Unverified", "Fill every field"]) expect(html).toContain(text);
    expect(html).not.toContain("$0.00 profit");
  });
  it("shows no live status when its server connection is lost", () => {
    const html = renderToStaticMarkup(<Readiness state={initialState()} now={0} control={{ running: true, speed: 1, mode: "live" }} connected={false} onResearch={() => {}} onJobs={() => {}} />);
    expect(html).toContain("Connection lost");
    expect(html).not.toContain("Dispatcher enabled");
  });
});
