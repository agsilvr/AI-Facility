import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ownerStatus,
  setFirstPin,
  unlock,
  lock,
  type OwnerProblem,
  type OwnerStatus,
} from "../client/owner";
import type { RemoteFacility } from "../client/remote";

// Everything on screen about the owner's PIN: asking for it when the server
// refuses a decision, setting the first one from the installer's setup link,
// and locking again. The server decides who is the owner; this only asks.

type Asking = "unlock" | "setup" | "no-pin" | null;

export interface Owner {
  status: OwnerStatus | null;
  /** True while decisions would go through without asking for the PIN. */
  unlocked: boolean;
  asking: Asking;
  /** Open the PIN prompt without a command waiting on it. */
  ask(): void;
  lockNow(): void;
  /** The PIN was accepted: run whatever was waiting for it. */
  accepted(until: number): void;
  cancel(): void;
  setupCode: string | null;
}

export function useOwner(facility: RemoteFacility, now: number): Owner {
  const [status, setStatus] = useState<OwnerStatus | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  // The setup code comes from the link the installer opens; it's only ever used once.
  const [setupCode, setSetupCode] = useState(() =>
    new URLSearchParams(location.search).get("setup"),
  );
  const waiting = useRef<(() => void) | null>(null);

  const promptFor = useCallback(
    (s: OwnerStatus | null) =>
      setAsking(s && !s.pinSet ? (setupCode ? "setup" : "no-pin") : "unlock"),
    [setupCode],
  );

  useEffect(() => {
    ownerStatus().then(
      (s) => {
        setStatus(s);
        if (!s.pinSet && setupCode) setAsking("setup");
      },
      () => setStatus(null),
    );
    // Only on first load: after that, the server's answers keep it up to date.
  }, []);

  useEffect(() => {
    facility.onOwnerNeeded = (retry) => {
      waiting.current = retry;
      // The server said no, so whatever we thought about the session is out of date.
      setStatus((s) => (s ? { ...s, unlockedUntil: null } : s));
      promptFor(status);
    };
    return () => {
      facility.onOwnerNeeded = null;
    };
  }, [facility, promptFor, status]);

  return {
    status,
    unlocked: !!status?.unlockedUntil && status.unlockedUntil > now,
    asking,
    setupCode,
    ask: () => {
      waiting.current = null;
      promptFor(status);
    },
    lockNow: () => {
      void lock().then(() =>
        setStatus((s) => (s ? { ...s, unlockedUntil: null } : s)),
      );
    },
    accepted: (until) => {
      setStatus({ pinSet: true, unlockedUntil: until });
      if (setupCode) {
        setSetupCode(null);
        history.replaceState(null, "", location.pathname);
      }
      setAsking(null);
      const retry = waiting.current;
      waiting.current = null;
      retry?.();
    },
    cancel: () => {
      waiting.current = null;
      setAsking(null);
    },
  };
}

const PIN_RULE = /^\d{6,12}$/;

function problemText(problem: OwnerProblem, retryAt: number | null) {
  switch (problem) {
    case "bad-pin":
      return "That PIN isn't right.";
    case "locked": {
      const at = retryAt
        ? new Date(retryAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })
        : "later";
      return `Too many wrong tries. You can try again at ${at}.`;
    }
    case "weak-pin":
      return "Use 6 to 12 digits.";
    case "bad-code":
      return "This setup link has expired. Run the installer again for a fresh one.";
    case "pin-set":
      return "A PIN is already set. Reload the page and enter it.";
    case "no-pin":
      return "No PIN has been set yet.";
    case "offline":
      return "Can't reach the facility server.";
  }
}

/** The PIN prompt, or the first-run "choose your PIN" form. */
export function OwnerDialog({ owner }: { owner: Owner }) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const mode = owner.asking;

  useEffect(() => {
    setPin("");
    setAgain("");
    setError(null);
    input.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [
      ...(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
      ) ?? []),
    ];
    (input.current ?? focusable()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        owner.cancel();
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [mode]);

  if (!mode) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!PIN_RULE.test(pin)) return setError("Use 6 to 12 digits.");
    if (mode === "setup" && pin !== again)
      return setError("The two PINs don't match.");
    setBusy(true);
    const answer =
      mode === "setup"
        ? await setFirstPin(pin, owner.setupCode ?? "")
        : await unlock(pin);
    setBusy(false);
    if (answer.ok) return owner.accepted(answer.unlockedUntil);
    setPin("");
    setAgain("");
    setError(problemText(answer.problem, answer.retryAt));
    input.current?.focus();
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) =>
        !busy && e.target === e.currentTarget && owner.cancel()
      }
    >
      <div
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-title"
      >
        {mode === "no-pin" ? (
          <>
            <h2 id="owner-title">Choose your approval PIN first</h2>
            <p>
              Nothing can be approved until you've chosen a PIN. The installer
              opens a setup page for it; if you've closed it, run the installer
              again and it will open a fresh one.
            </p>
            <div className="modal-actions">
              <button className="primary" onClick={owner.cancel}>
                OK
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} aria-busy={busy}>
            <h2 id="owner-title">
              {mode === "setup"
                ? "Choose your approval PIN"
                : "Enter your approval PIN"}
            </h2>
            <p className="muted">
              {mode === "setup"
                ? "6 to 12 digits. Only someone with this PIN can approve, send back or restart work. Don't reuse your Mac password."
                : "Approving, sending back and restarting need your PIN. You'll stay unlocked for 20 minutes."}
            </p>
            <label className="pin-field">
              {mode === "setup" ? "New PIN" : "PIN"}
              <input
                ref={input}
                type="password"
                inputMode="numeric"
                autoComplete={
                  mode === "setup" ? "new-password" : "current-password"
                }
                maxLength={12}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            {mode === "setup" && (
              <label className="pin-field">
                Same PIN again
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={12}
                  value={again}
                  onChange={(e) => setAgain(e.target.value.replace(/\D/g, ""))}
                />
              </label>
            )}
            {error && (
              <p className="pin-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" disabled={busy} onClick={owner.cancel}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Unlocking…" : mode === "setup" ? "Set PIN" : "Unlock"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** The lock in the top bar: shows whether decisions need the PIN right now. */
export function OwnerBadge({ owner, now }: { owner: Owner; now: number }) {
  if (!owner.status) return null;
  if (!owner.status.pinSet) {
    return (
      <span
        className="owner-badge warn"
        title="Approvals are locked until you choose a PIN"
      >
        🔒 No PIN set
      </span>
    );
  }
  if (owner.unlocked) {
    const minutes = Math.max(
      1,
      Math.ceil((owner.status.unlockedUntil! - now) / 60000),
    );
    return (
      <button
        className="owner-badge open"
        onClick={owner.lockNow}
        title="Lock now: the next decision will ask for your PIN"
      >
        🔓 Unlocked · {minutes}m · Lock
      </button>
    );
  }
  return (
    <button
      className="owner-badge"
      onClick={owner.ask}
      title="Enter your PIN now so decisions go straight through"
    >
      🔒 Locked
    </button>
  );
}
