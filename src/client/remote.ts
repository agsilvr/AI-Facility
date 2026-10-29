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

  constructor(private base = "") {}

  start() {
    this.source = new EventSource(`${this.base}/api/events`);
    this.source.addEventListener("snapshot", (e) => {
      this.snapshot = JSON.parse((e as MessageEvent).data) as Snapshot;
      this.connection = "online";
      this.emit();
    });
    // EventSource reconnects by itself; we only report the gap.
    this.source.onerror = () => {
      this.connection = "offline";
      this.emit();
    };
  }

  stop() {
    this.source?.close();
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

  getControl = (): Control => this.snapshot?.control ?? { running: false, speed: 1 };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  decide(approvalId: string, approve: boolean) {
    void this.post(`/api/approvals/${encodeURIComponent(approvalId)}`, { approve });
  }

  setAgentPaused(agentId: string, paused: boolean) {
    void this.post(`/api/agents/${encodeURIComponent(agentId)}/pause`, { paused });
  }

  setControl(control: Partial<Control>) {
    void this.post("/api/control", control);
  }

  private async post(path: string, body: unknown) {
    try {
      const res = await fetch(`${this.base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) console.error(`Facility refused ${path}: ${res.status}`);
    } catch (err) {
      console.error(`Facility unreachable for ${path}`, err);
    }
  }

  private emit() {
    this.version += 1;
    for (const l of this.listeners) l();
  }
}
