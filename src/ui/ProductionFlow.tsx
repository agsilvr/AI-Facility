import type { FacilityState } from "../core/types";
import { roomSignal, SIGNAL_LABELS } from "../facility/status";

const FLOW = [["etsy-lab", "Research"], ["etsy-studio", "Design"], ["etsy-qc", "Check"], ["etsy-factory", "Listing"], ["dock", "Outbox"]];
export function ProductionFlow({ state, running, now, onRoom, connected = true }: { state: FacilityState; running: boolean; now: number; connected?: boolean; onRoom: (id: string) => void }) {
  return <nav className="production-flow" aria-label="Production room status">
    {FLOW.map(([id, label], i) => {
      const signal = connected ? roomSignal(state, id, running, now) : "paused";
      const status = connected ? SIGNAL_LABELS[signal] : "Offline";
      return <button key={id} className={`flow-station ${signal}`} onClick={() => onRoom(id)} aria-label={`${label}: ${status}`}>
        <span className="station-light" aria-hidden="true">{signal === "done" ? "✓" : signal === "paused" ? "Ⅱ" : signal === "blocked" ? "!" : String(i + 1).padStart(2, "0")}</span>
        <span><strong>{label}</strong><small>{status}</small></span>
      </button>;
    })}
  </nav>;
}
