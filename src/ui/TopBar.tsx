import { completedCount } from "../core/ledger";
import type { FacilityState } from "../core/types";
import { money } from "./format";
import { OwnerBadge, type Owner } from "./OwnerLock";

interface Props {
  state: FacilityState;
  running: boolean;
  speed: number;
  mode: "demo" | "live";
  onToggleRunning: () => void;
  onSpeed: (speed: number) => void;
  owner: Owner;
  now: number;
}

export function TopBar({ state, running, speed, mode, onToggleRunning, onSpeed, owner, now }: Props) {
  const pending = state.approvals.filter((a) => a.status === "pending").length;
  const done = completedCount(state);
  const working = state.agents.filter((a) => a.status === "working").length;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>▼</span>
        <div>
          <h1>AI Facility</h1>
          {mode === "demo" ? (
            <span className="demo-badge">Demo mode · simulated agents</span>
          ) : (
            <span className="live-badge">Live · real models at work</span>
          )}
        </div>
      </div>

      <div className="stats">
        <Stat label="Needs you" value={pending} tone={pending ? "alert" : "ok"} />
        <Stat label="Agents working" value={`${working}/${state.agents.length}`} />
        <Stat label="Completed" value={done} />
        {state.wings
          .filter((w) => !w.sealed)
          .map((w) => {
            const spent = state.spend[w.id] ?? 0;
            const ratio = w.budgetMonthly ? spent / w.budgetMonthly : 0;
            return (
              <div className="budget" key={w.id} title={`${w.name}: ${money(spent)} of ${money(w.budgetMonthly)} this month`}>
                <span className="stat-label">{w.name} budget</span>
                <div className="meter">
                  <div
                    className={`meter-fill ${ratio >= 1 ? "over" : ratio > 0.8 ? "high" : ""}`}
                    style={{ width: `${Math.min(100, ratio * 100)}%`, background: ratio < 0.8 ? w.color : undefined }}
                  />
                </div>
                <span className="budget-text">
                  {money(spent)} / {money(w.budgetMonthly)}
                </span>
              </div>
            );
          })}
      </div>

      <div className="controls">
        <OwnerBadge owner={owner} now={now} />
        <button onClick={onToggleRunning} className={running ? "" : "primary"}>
          {running ? "Pause facility" : "Resume facility"}
        </button>
        {/* Real models take the time they take; only the demo can be sped up. */}
        {mode === "demo" && (
          <label className="speed">
            Speed
            <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
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

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "alert" | "ok" }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
