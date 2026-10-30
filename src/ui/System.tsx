import { useState } from "react";
import { MODELS } from "../core/models";
import type { FacilityState, ModelId } from "../core/types";
import { Icon } from "./Icon";
import { money, timeAgo } from "./format";

export function System({
  state,
  now,
  connected,
}: {
  state: FacilityState;
  now: number;
  connected: boolean;
}) {
  const [view, setView] = useState("connections");
  return (
    <>
      <div className="page-heading">
        <h2>System</h2>
        <Icon name="settings" size={19} />
      </div>
      <div className="filter-row" aria-label="System view">
        {[
          ["connections", "Connections"],
          ["usage", "Usage"],
          ["activity", "Activity"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={view === id ? "selected" : ""}
            aria-pressed={view === id}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "connections" && (
        <>
          <div className="connection-row">
            <div>
              <strong>Local server</strong>
              <small>Ledger saved on this Mac</small>
            </div>
            <span className={`badge ${connected ? "sage" : "amber"}`}>
              {connected ? "Connected" : "Offline"}
            </span>
          </div>
          {(Object.keys(MODELS) as ModelId[]).map((id) => (
            <details className="model-record disclosure" key={id}>
              <summary>
                <span>
                  <strong>{MODELS[id].name}</strong>
                  <small>{MODELS[id].where}</small>
                </span>
                <span
                  className={`badge ${state.unavailable?.includes(id) ? "amber" : ""}`}
                >
                  {state.unavailable?.includes(id)
                    ? "Unavailable"
                    : state.tasks.some(
                          (t) => t.model === id && t.state === "active",
                        )
                      ? "In use"
                      : "Standby"}
                </span>
              </summary>
              <p className="micro">
                Allowed model data:{" "}
                {MODELS[id].sees
                  .map((s) =>
                    s === "public"
                      ? "public information"
                      : s === "shop"
                        ? "shop plans"
                        : "customer messages",
                  )
                  .join(", ")}
                . Individual agents have narrower roles.
              </p>
            </details>
          ))}
          <p className="micro">
            Standby means enabled in the router. It does not confirm sign-in or
            available credits.
          </p>
          <div className="connection-row">
            <div>
              <strong>Etsy / Printify</strong>
              <small>Listing drafts remain local</small>
            </div>
            <span className="badge">Not connected</span>
          </div>
          <div className="connection-row">
            <div>
              <strong>Accounting</strong>
              <small>Revenue and profit unavailable</small>
            </div>
            <span className="badge">Not connected</span>
          </div>
          <details className="disclosure">
            <summary>
              <Icon name="shield" size={15} />
              Permissions & safeguards
            </summary>
            <p>
              Owner PIN protects approvals, retries, resuming and operator
              handovers. Publishing uses only the exact approved package.
              External text is handled by isolated readers; agent permissions
              come from code.
            </p>
            <p>
              Pause holds work and survives a restart. In-flight answers cannot
              advance paused jobs.
            </p>
          </details>
        </>
      )}
      {view === "usage" && (
        <>
          <p className="section-intro">
            Model-reported usage · {state.spendMonth}. These figures are not
            shop revenue or provider invoices.
          </p>
          {state.wings
            .filter((w) => !w.sealed)
            .map((wing) => {
              const spend = state.spend[wing.id] ?? 0;
              const ratio = wing.budgetMonthly
                ? Math.min(1, spend / wing.budgetMonthly)
                : 0;
              return (
                <div className="budget-card" key={wing.id}>
                  <div>
                    <strong>{wing.name}</strong>
                    <span>
                      {money(spend)}{" "}
                      <small>/ {money(wing.budgetMonthly)}</small>
                    </span>
                  </div>
                  <div
                    className="meter"
                    role="meter"
                    aria-label={`${wing.name} monthly usage`}
                    aria-valuemin={0}
                    aria-valuemax={wing.budgetMonthly}
                    aria-valuenow={spend}
                  >
                    <div style={{ width: `${ratio * 100}%` }} />
                  </div>
                </div>
              );
            })}
          <p className="micro">
            Dispatch stops at each wing’s monthly limit. DeepSeek has a separate
            $5 monthly cap.
          </p>
        </>
      )}
      {view === "activity" && (
        <ol className="activity-list">
          {state.log.map((event) => (
            <li key={event.id}>
              <span className={`event-dot ${event.level}`} />
              <div>
                <time
                  dateTime={new Date(event.at).toISOString()}
                  title={new Date(event.at).toLocaleString()}
                >
                  {timeAgo(event.at, now)}
                </time>
                <p>
                  {/Claude Code exited/.test(event.text)
                    ? event.text.split(": Claude Code")[0] +
                      ". Open the job for recovery options."
                    : event.text}
                </p>
                {/Claude Code exited/.test(event.text) && (
                  <details className="technical">
                    <summary>Diagnostics</summary>
                    <pre>{event.text}</pre>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <details className="disclosure">
        <summary>
          <Icon name="help" size={15} />
          Keyboard shortcuts
        </summary>
        <dl className="facts">
          <div>
            <dt>Change section</dt>
            <dd>Option / Alt + 1–5</dd>
          </div>
          <div>
            <dt>Close details</dt>
            <dd>Escape</dd>
          </div>
          <div>
            <dt>Pan focused map</dt>
            <dd>Arrow keys</dd>
          </div>
          <div>
            <dt>Zoom map</dt>
            <dd>+ / −</dd>
          </div>
          <div>
            <dt>Move between tabs</dt>
            <dd>Left / Right</dd>
          </div>
        </dl>
      </details>
    </>
  );
}
