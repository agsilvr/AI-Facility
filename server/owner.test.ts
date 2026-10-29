import { describe, expect, it } from "vitest";
import { OwnerGate, SESSION_MS } from "./owner";
import { Store } from "./store";

function gate() {
  const clock = { t: 1_000_000 };
  const store = new Store(":memory:");
  const owner = new OwnerGate(store, () => clock.t);
  return { owner, store, clock };
}

function withPin(pin = "246810") {
  const g = gate();
  const code = g.owner.newSetupCode()!;
  const first = g.owner.setFirstPin(pin, code);
  if (!first.ok) throw new Error("setup failed");
  return { ...g, token: first.token };
}

describe("owner PIN", () => {
  it("stores the PIN only as a salted hash", () => {
    const { store } = withPin("246810");
    const stored = store.getSetting("owner_pin")!;
    expect(stored).not.toContain("246810");
    expect(stored).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/);
    // The same PIN set again elsewhere gets a different salt, so hashes can't be compared.
    expect(withPin("246810").store.getSetting("owner_pin")).not.toBe(stored);
  });

  it("sets the first PIN only with the one-time setup code", () => {
    const { owner } = gate();
    expect(owner.hasPin()).toBe(false);
    expect(owner.setFirstPin("246810", "guess")).toMatchObject({ ok: false, reason: "bad-code" });
    const code = owner.newSetupCode()!;
    expect(owner.setFirstPin("246810", "wrong")).toMatchObject({ ok: false, reason: "bad-code" });
    expect(owner.setFirstPin("1234", code)).toMatchObject({ ok: false, reason: "weak-pin" });
    expect(owner.setFirstPin("246810", code).ok).toBe(true);
    expect(owner.hasPin()).toBe(true);
    // Once set, the PIN can't be replaced with a setup code, and no new code is made.
    expect(owner.setFirstPin("999999", code)).toMatchObject({ ok: false, reason: "pin-set" });
    expect(owner.newSetupCode()).toBeNull();
  });

  it("opens a session for the right PIN and not for a wrong one", () => {
    const { owner } = withPin("246810");
    const good = owner.unlock("246810");
    expect(good.ok).toBe(true);
    if (good.ok) expect(owner.check(good.token)).toBe(true);
    expect(owner.unlock("000000")).toMatchObject({ ok: false, reason: "bad-pin" });
    expect(owner.check("made-up-token")).toBe(false);
    expect(owner.check(undefined)).toBe(false);
  });

  it("ends a session after its time, or when locked", () => {
    const { owner, clock, token } = withPin();
    expect(owner.check(token)).toBe(true);
    clock.t += SESSION_MS;
    expect(owner.check(token)).toBe(false);
    const again = owner.unlock("246810");
    if (!again.ok) throw new Error("unlock failed");
    owner.lock(again.token);
    expect(owner.check(again.token)).toBe(false);
  });

  it("locks the PIN after repeated wrong guesses, longer each time, even across restarts", () => {
    const { owner, store, clock } = withPin("246810");
    for (let i = 0; i < 4; i++) expect(owner.unlock("111111")).toMatchObject({ reason: "bad-pin" });
    const fifth = owner.unlock("111111");
    expect(fifth).toMatchObject({ ok: false, reason: "locked" });
    // Even the right PIN is refused while locked, and a restart doesn't clear it.
    const restarted = new OwnerGate(store, () => clock.t);
    expect(restarted.unlock("246810")).toMatchObject({ ok: false, reason: "locked" });
    clock.t += 61_000;
    const sixth = restarted.unlock("111111");
    expect(sixth).toMatchObject({ ok: false, reason: "locked" });
    if (!sixth.ok) expect(sixth.retryAt! - clock.t).toBe(120_000);
    clock.t += 121_000;
    expect(restarted.unlock("246810").ok).toBe(true);
    // A good PIN resets the count.
    expect(restarted.unlock("111111")).toMatchObject({ reason: "bad-pin" });
  });
});
