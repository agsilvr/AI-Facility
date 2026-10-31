import type { Control, FacilityPort } from "../core/port";
import type { FacilityState } from "../core/types";

export type Connection = "connecting" | "online" | "offline";

interface Snapshot {
  state: FacilityState;
  control: Control;
}

/**
 * The browser's view of the facility. The server pushes a fresh snapshot over
 * Server-Sent Events after every change; commands go back as small POSTs.
 * The browser never changes state itself, so what you see is what the server has.
 */
export class RemoteFacility implements FacilityPort {
  private snapshot: Snapshot | null = null;
  private listeners = new Set<() => void>();
  private source: EventSource | null = null;
  connection: Connection = "connecting";
  private version = 0;
  private lastSignal = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  commandError: string | null = null;
  /**
   * Called when the server refuses a command until the owner enters their PIN
   * (approving, sending back, resuming). `retry` sends the same command again
   * once they have.
   */
  onOwnerNeeded: ((retry: () => void) => void) | null = null;

  constructor(private base = "") {}

  start() {
    this.stop();
    this.connection = this.snapshot ? "offline" : "connecting";
    this.lastSignal = Date.now();
    this.source = new EventSource(`${this.base}/api/events`);
    this.source.addEventListener("snapshot", (e) => {
      this.lastSignal = Date.now();
      this.snapshot = JSON.parse((e as MessageEvent).data) as Snapshot;
      this.connection = "online";
      this.emit();
    });
    this.source.addEventListener("heartbeat", () => {
      this.lastSignal = Date.now();
      // A heartbeat alone cannot certify a previously disconnected snapshot.
      if (this.connection === "offline") this.start();
    });
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastSignal > 15_000) {
        this.connection = "offline";
        this.emit();
        this.start();
      }
    }, 1000);
    // EventSource reconnects by itself; we only report the gap.
    this.source.onerror = () => {
      this.connection = "offline";
      this.emit();
    };
  }

  stop() {
    this.source?.close();
    this.source = null;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.connection = "offline";
  }

  ready() {
    return this.snapshot !== null;
  }

  getState = (): FacilityState => {
    if (!this.snapshot) throw new Error("No facility state yet");
    return this.snapshot.state;
  };

  /** Changes whenever anything the screens show changes. */
  getVersion = () => this.version;

  getControl = (): Control => this.snapshot?.control ?? { running: false, speed: 1, mode: "demo" };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  decide(approvalId: string, approve: boolean, feedback?: string) {
    void this.post(`/api/approvals/${encodeURIComponent(approvalId)}`, { approve, feedback });
  }

  setAgentPaused(agentId: string, paused: boolean) {
    void this.post(`/api/agents/${encodeURIComponent(agentId)}/pause`, { paused });
  }

  setControl(control: Partial<Control>) {
    void this.post("/api/control", control);
  }

  runResearch() { void this.post("/api/research", {}); }
  runArtworkPilot() { void this.post("/api/artwork-pilot", {}); }
  setOperator(active: "claude" | "codex", generation: number) { void this.post("/api/operator", { active, generation }); }
  clearError() { this.commandError = null; this.emit(); }

  private async post(path: string, body: unknown) {
    this.commandError = null;
    try {
      const res = await fetch(`${this.base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401 && this.onOwnerNeeded) this.onOwnerNeeded(() => void this.post(path, body));
      else if (!res.ok) { this.commandError = (await res.json().catch(() => null))?.error ?? "This action could not be completed."; this.emit(); }
    } catch (err) {
      this.commandError = "The facility is offline. Reconnect before trying again.";
      this.emit();
    }
  }

  private emit() {
    this.version += 1;
    for (const l of this.listeners) l();
  }
}
