import type { FacilityState } from "../core/types";
import { OwnerBadge, type Owner } from "./OwnerLock";
import { Icon } from "./Icon";
interface Props {
  state: FacilityState;
  running: boolean;
  speed: number;
  mode: "demo" | "live";
  onToggleRunning: () => void;
  onSpeed: (speed: number) => void;
  owner: Owner;
  now: number;
  onResearch: () => void;
  onWork: () => void;
}
export function TopBar({
  state,
  running,
  speed,
  mode,
  onToggleRunning,
  onSpeed,
  owner,
  now,
  onResearch,
  onWork,
}: Props) {
  const pending = state.approvals.filter((a) => a.status === "pending").length;
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="leaf" size={27} />
        </span>
        <div>
          <h1>
            AI Facility<span className="brand-dot">.</span>
          </h1>
          <p>A home for your ideas to become real.</p>
        </div>
      </div>
      <div className="topbar-center">
        <span className={`status-chip ${running ? "" : "paused"}`}>
          <i />
          {mode === "demo"
            ? "Demo · simulated work"
            : running
              ? "Facility online"
              : "Facility paused"}
        </span>
        <span className="header-date">
          {new Date(now).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: "America/New_York",
          })}
        </span>
      </div>
      <div className="controls">
        <button className="attention-button" onClick={onWork}>
          <span className="count-circle">{pending}</span>
          <span>Needs you</span>
        </button>
        <OwnerBadge owner={owner} now={now} />
        <button
          className="icon-button pause-button"
          aria-label={running ? "Pause facility" : "Resume facility"}
          title={
            running
              ? "Pause all work. In-flight answers cannot advance jobs."
              : "Resume facility · owner PIN required"
          }
          onClick={onToggleRunning}
        >
          <Icon name={running ? "pause" : "play"} size={18} />
        </button>
        <button className="primary new-research" onClick={onResearch}>
          <Icon name="spark" size={16} />
          New research
        </button>
        {mode === "demo" && (
          <label className="speed">
            Speed
            <select
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
