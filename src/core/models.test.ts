import { describe, expect, it } from "vitest";
import { allowedModels, MODELS, route, ROUTES } from "./models";
import { wings } from "./seed";
import type { DataClass, Job } from "./types";

const idle = { busy: {}, spent: {} };

describe("model router", () => {
  it("never lets DeepSeek see the shop's plans or anything a customer wrote", () => {
    expect(MODELS.deepseek.sees).toEqual(["public"]);
    for (const job of Object.keys(ROUTES) as Job[]) {
      expect(allowedModels(job, "customer")).not.toContain("deepseek");
      expect(allowedModels(job, "shop")).not.toContain("deepseek");
    }
  });

  it("keeps customer data away from the designer", () => {
    expect(allowedModels("design", "customer")).toEqual(["typeset"]);
  });

  it("gives research to Qwen on the Mac first", () => {
    expect(route("research", "public", idle)).toEqual({ ok: true, model: "qwen" });
  });

  it("sends public research to DeepSeek when Qwen is busy", () => {
    expect(route("research", "public", { busy: { qwen: 1 }, spent: {} })).toEqual({ ok: true, model: "deepseek" });
  });

  it("makes private work wait for Qwen rather than overflow to DeepSeek", () => {
    const r = route("research", "shop", { busy: { qwen: 1 }, spent: {} });
    expect(r.ok).toBe(false);
  });

  it("has Codex design, and makes type-only designs while it's busy", () => {
    expect(route("design", "public", idle)).toEqual({ ok: true, model: "codex" });
    expect(route("design", "public", { busy: { codex: 1 }, spent: {} })).toEqual({ ok: true, model: "typeset" });
  });

  it("uses no pay-per-call model except DeepSeek's prepaid credits", () => {
    const capped = (Object.keys(MODELS) as (keyof typeof MODELS)[]).filter((id) => MODELS[id].monthlyCapUsd !== undefined);
    expect(capped).toEqual(["deepseek"]);
  });

  it("waits, and says why, when every allowed model is full or out of budget", () => {
    const r = route("research", "public", { busy: { qwen: 1 }, spent: { deepseek: 5 } });
    expect(r).toEqual({ ok: false, reason: "Waiting for Qwen 3.5 9B and DeepSeek: busy or this month's cap is used up" });
  });

  it("has Claude write every listing and reply", () => {
    for (const data of ["shop", "customer"] as DataClass[]) expect(route("write", data, idle)).toEqual({ ok: true, model: "claude" });
  });

  it("can route every stage of the real facility", () => {
    for (const stage of wings.flatMap((w) => w.workflows.flatMap((wf) => wf.stages))) {
      if (stage.action) continue;
      expect(route(stage.job!, stage.data!, idle).ok, stage.id).toBe(true);
    }
  });
});
