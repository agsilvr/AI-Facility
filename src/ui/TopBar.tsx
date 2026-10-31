import type { FacilityState } from "../core/types";
import { OwnerBadge, type Owner } from "./OwnerLock";
import { Icon } from "./Icon";
import { workAlive } from "../core/operations";
interface Props {
  state: FacilityState;
  running: boolean;
  speed: number;
  mode: "demo" | "live";
  connected: boolean;
  onToggleRunning: () => void;
  onSpeed: (speed: number) => void;
  owner: Owner;
  now: number;
  onWork: () => void;
}
export function TopBar({
  state,
  running,
  speed,
  mode,
  connected,
  onToggleRunning,
  onSpeed,
  owner,
  now,
  onWork,
}: Props) {
  const pending = state.approvals.filter((a) => a.status === "pending").length;
  const maintenance = state.operations?.some((op) => op.phase === "maintenance" && workAlive(op, now));
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="command" size={21} />
        </span>
        <h1>AI FACILITY</h1>
      </div>
      <span className={`status-chip ${!connected || !running ? "paused" : ""}`}>
        <i />
        {!connected
          ? "Reconnecting"
          : mode === "demo"
            ? running
              ? "Demo · simulated"
              : "Demo · paused"
            : running
              ? "Live"
              : maintenance ? "Production paused · maintenance active" : "Paused"}
      </span>
      <div className="controls">
        {pending > 0 && (
          <button
            className="attention-button"
            aria-label={`${pending} ${pending === 1 ? "job needs" : "jobs need"} attention`}
            onClick={onWork}
          >
            <span className="count-circle">{pending}</span>
            <span>Needs attention</span>
          </button>
        )}
        <OwnerBadge owner={owner} now={now} />
        <button
          className="pause-button"
          disabled={!connected}
          aria-label={running ? "Pause facility" : "Resume facility"}
          title={
            running
              ? "Hold all work, including in-flight answers"
              : "Resume work · owner PIN required"
          }
          onClick={onToggleRunning}
        >
          <Icon name={running ? "pause" : "play"} size={16} />
          <span>{running ? "Pause" : "Resume"}</span>
        </button>
        {mode === "demo" && (
          <label className="speed">
            <span>Speed</span>
            <select
              aria-label="Simulation speed"
              value={speed}
              onChange={(e) => onSpeed(Number(e.target.value))}
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </label>
        )}
      </div>
    </header>
  );
}
