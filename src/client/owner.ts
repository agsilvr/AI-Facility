// The browser's side of the owner's PIN (see server/owner.ts). The session
// itself lives in an HttpOnly cookie the server sets, so nothing here ever
// holds it: these calls only ask the server to open, check or close one.

export interface OwnerStatus {
  /** Whether the owner has chosen a PIN yet. Until then nothing can be approved. */
  pinSet: boolean;
  /** When the owner's session ends, or null while locked. */
  unlockedUntil: number | null;
}

export type OwnerProblem = "bad-pin" | "locked" | "no-pin" | "pin-set" | "bad-code" | "weak-pin" | "offline";

export type OwnerAnswer = { ok: true; unlockedUntil: number } | { ok: false; problem: OwnerProblem; retryAt: number | null };

export async function ownerStatus(base = ""): Promise<OwnerStatus> {
  const res = await fetch(`${base}/api/owner`);
  if (!res.ok) throw new Error(`Owner status refused: ${res.status}`);
  return (await res.json()) as OwnerStatus;
}

export const unlock = (pin: string, base = "") => send(`${base}/api/owner/unlock`, { pin });

/** Choose the first PIN, with the one-time code from the setup link. */
export const setFirstPin = (pin: string, code: string, base = "") => send(`${base}/api/owner/setup`, { pin, code });

export async function lock(base = "") {
  await send(`${base}/api/owner/lock`, {});
}

async function send(url: string, body: unknown): Promise<OwnerAnswer> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json()) as { unlockedUntil?: number; error?: OwnerProblem; retryAt?: number | null };
    if (res.ok) return { ok: true, unlockedUntil: data.unlockedUntil ?? 0 };
    return { ok: false, problem: data.error ?? "offline", retryAt: data.retryAt ?? null };
  } catch {
    return { ok: false, problem: "offline", retryAt: null };
  }
}
