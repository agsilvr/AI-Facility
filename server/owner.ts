import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Store } from "./store";

// Proof that a decision really comes from the owner. The facility's server
// answers only this Mac, but any program on the Mac could still send it an
// "approve". So approving, sending back, and resuming after a pause all need
// an owner session, and a session needs the owner's PIN.
//
// - The PIN is stored only as a salted scrypt hash, in the facility's own
//   database. It never goes to an agent, a log or the browser's storage.
// - The very first PIN can only be set with a one-time setup code that the
//   server writes to its own data folder when it starts without one, so
//   whatever reaches the server first can't claim the facility.
// - A session lives in an HttpOnly cookie, so page scripts can't read it, and
//   ends after SESSION_MS whatever happens.
// - Wrong PINs are counted, even across restarts; after a few the PIN is
//   locked for a while, longer each time.

export const SESSION_MS = 20 * 60 * 1000;
const FREE_TRIES = 5;
const FIRST_LOCK_MS = 60 * 1000;
const MAX_LOCK_MS = 60 * 60 * 1000;
const PIN_RULE = /^\d{6,12}$/;

export type OwnerResult =
  | { ok: true; token: string; expiresAt: number }
  | { ok: false; reason: "bad-pin" | "locked" | "no-pin" | "pin-set" | "bad-code" | "weak-pin"; retryAt?: number };

const sha256 = (s: string) => createHash("sha256").update(s).digest();

function hashPin(pin: string, salt = randomBytes(16)) {
  return `scrypt:${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

function pinMatches(pin: string, stored: string) {
  const [kind, salt, hash] = stored.split(":");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(pin, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export class OwnerGate {
  /** Sessions by the SHA-256 of their token, so a memory dump doesn't hand one out. */
  private sessions = new Map<string, number>();
  private setupCode: string | null = null;

  constructor(
    private store: Store,
    private now: () => number = Date.now,
  ) {}

  hasPin() {
    return this.store.getSetting("owner_pin") !== null;
  }

  /**
   * The one-time code for setting the first PIN, made fresh each time the
   * server starts without one. Null once a PIN exists.
   */
  newSetupCode(): string | null {
    if (this.hasPin()) return null;
    this.setupCode = randomBytes(12).toString("base64url");
    return this.setupCode;
  }

  /** Set the first PIN. Needs the setup code; a PIN can't be replaced this way. */
  setFirstPin(pin: string, code: string): OwnerResult {
    if (this.hasPin()) return { ok: false, reason: "pin-set" };
    if (!this.setupCode || !timingSafeEqual(sha256(code), sha256(this.setupCode))) return { ok: false, reason: "bad-code" };
    if (!PIN_RULE.test(pin)) return { ok: false, reason: "weak-pin" };
    this.store.setSetting("owner_pin", hashPin(pin));
    this.setupCode = null;
    return this.openSession();
  }

  unlock(pin: string): OwnerResult {
    const stored = this.store.getSetting("owner_pin");
    if (!stored) return { ok: false, reason: "no-pin" };
    const lockedUntil = Number(this.store.getSetting("owner_locked_until") ?? 0);
    if (this.now() < lockedUntil) return { ok: false, reason: "locked", retryAt: lockedUntil };
    if (typeof pin !== "string" || !pinMatches(pin, stored)) {
      const failures = Number(this.store.getSetting("owner_failures") ?? 0) + 1;
      this.store.setSetting("owner_failures", String(failures));
      if (failures >= FREE_TRIES) {
        const lock = Math.min(MAX_LOCK_MS, FIRST_LOCK_MS * 2 ** (failures - FREE_TRIES));
        this.store.setSetting("owner_locked_until", String(this.now() + lock));
        return { ok: false, reason: "locked", retryAt: this.now() + lock };
      }
      return { ok: false, reason: "bad-pin" };
    }
    this.store.setSetting("owner_failures", "0");
    return this.openSession();
  }

  /** Is this cookie value a live owner session? */
  check(token: string | undefined): boolean {
    if (!token) return false;
    const key = sha256(token).toString("hex");
    const expires = this.sessions.get(key);
    if (expires === undefined) return false;
    if (this.now() >= expires) {
      this.sessions.delete(key);
      return false;
    }
    return true;
  }

  expiresAt(token: string | undefined): number | null {
    return token && this.check(token) ? this.sessions.get(sha256(token).toString("hex"))! : null;
  }

  lock(token: string | undefined) {
    if (token) this.sessions.delete(sha256(token).toString("hex"));
  }

  private openSession(): OwnerResult {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + SESSION_MS;
    this.sessions.set(sha256(token).toString("hex"), expiresAt);
    return { ok: true, token, expiresAt };
  }
}
