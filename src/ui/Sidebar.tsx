import { useState } from "react";
import { completedCount, completedKey } from "../core/ledger";
import type { FacilityPort } from "../core/port";
import type { Draft, FacilityState, Flag } from "../core/types";
import type { Selection } from "../facility/status";
import { money, stageLabel, timeAgo } from "./format";

type Tab = "attention" | "flow" | "crew" | "log";

interface Props {
  ledger: FacilityPort;
  state: FacilityState;
  now: number;
  onSelect: (s: Selection) => void;
}

export function Sidebar({ ledger, state, now, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>("attention");
  const pending = state.approvals.filter((a) => a.status === "pending");

  return (
    <aside className="sidebar">
      <nav className="tabs" role="tablist">
        <TabButton id="attention" tab={tab} setTab={setTab} alert={pending.length > 0}>
          Needs you{pending.length ? ` (${pending.length})` : ""}
        </TabButton>
        <TabButton id="flow" tab={tab} setTab={setTab}>Task flow</TabButton>
        <TabButton id="crew" tab={tab} setTab={setTab}>Crew</TabButton>
        <TabButton id="log" tab={tab} setTab={setTab}>Log</TabButton>
      </nav>
      <div className="tab-body">
        {tab === "attention" && <Attention ledger={ledger} state={state} now={now} />}
        {tab === "flow" && <Flow state={state} />}
        {tab === "crew" && <Crew ledger={ledger} state={state} onSelect={onSelect} />}
        {tab === "log" && <Log state={state} now={now} />}
      </div>
    </aside>
  );
}

function TabButton(props: {
  id: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
  alert?: boolean;
  children: React.ReactNode;
}) {
  const active = props.id === props.tab;
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`tab ${active ? "active" : ""} ${props.alert ? "alert" : ""}`}
      onClick={() => props.setTab(props.id)}
    >
      {props.children}
    </button>
  );
}

function Attention({ ledger, state, now }: { ledger: FacilityPort; state: FacilityState; now: number }) {
  const pending = state.approvals.filter((a) => a.status === "pending");
  if (pending.length === 0) {
    return <p className="empty">Nothing needs you right now. Agents will ask here before anything goes out.</p>;
  }
  return (
    <ul className="cards">
      {pending.map((a) => {
        const task = state.tasks.find((t) => t.id === a.taskId);
        const wing = state.wings.find((w) => w.id === a.wingId);
        return (
          <li key={a.id} className="card attention-card" style={{ borderLeftColor: wing?.color }}>
            <div className="card-head">
              <strong>{task?.title}</strong>
              <span className="muted">{timeAgo(a.createdAt, now)}</span>
            </div>
            <span className="muted">{wing?.name} · {task && stageLabel(state, task)}</span>
            <ul className="notes">
              {task?.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
            {a.content && <DraftPreview content={a.content} />}
            {a.flags.length > 0 && (
              <ul className="flags">
                {a.flags.map((f) => (
                  <li key={`${f.level}-${f.code}`} className={`flag-${f.level}`}>
                    {f.level === "block" ? "Blocked: " : "Check: "}
                    {f.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="card-actions">
              <button
                className="primary"
                disabled={blocked(a.flags)}
                title={blocked(a.flags) ? "This can't go out as it is. Send it back to be redone." : undefined}
                onClick={() => ledger.decide(a.id, true)}
              >
                Approve
              </button>
              <button onClick={() => ledger.decide(a.id, false)}>Send back</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function blocked(flags: Flag[]) {
  return flags.some((f) => f.level === "block");
}

/** Shows exactly what will go out if approved: the same string approval binds to. */
function DraftPreview({ content }: { content: string }) {
  let draft: Draft | null = null;
  try {
    draft = JSON.parse(content) as Draft;
  } catch {
    return <pre className="draft">{content}</pre>;
  }
  if (draft?.kind === "listing") {
    return (
      <div className="draft">
        <div className="draft-label">Listing that will be published</div>
        <strong>{draft.title}</strong> <span className="muted">${draft.priceUsd.toFixed(2)}</span>
        <p>{draft.description}</p>
        <div className="muted">Tags: {draft.tags.join(", ")}</div>
      </div>
    );
  }
  if (draft?.kind === "reply") {
    return (
      <div className="draft">
        <div className="draft-label">Reply that will be sent</div>
        <p>{draft.message}</p>
      </div>
    );
  }
  return null;
}

function Flow({ state }: { state: FacilityState }) {
  return (
    <div className="flow">
      {state.wings
        .filter((w) => !w.sealed)
        .flatMap((wing) =>
          wing.workflows.map((wf) => {
            const tasks = state.tasks.filter((t) => t.wingId === wing.id && t.workflowId === wf.id);
            const done = state.completed[completedKey(wing.id, wf.id)] ?? 0;
            return (
              <section key={`${wing.id}-${wf.id}`} className="flow-section">
                <h3 style={{ color: wing.color }}>{wing.name} · {wf.label}</h3>
                <div className="flow-columns">
                  {wf.stages.map((stage, i) => {
                    const here = tasks.filter((t) => t.stageIndex === i && t.state !== "done");
                    return (
                      <div key={stage.id} className="flow-col">
                        <div className="flow-col-head">
                          {stage.label}
                          {stage.needsApproval && <span className="gate" title="Needs your approval">✋</span>}
                        </div>
                        {here.length === 0 && <div className="flow-empty">·</div>}
                        {here.map((t) => (
                          <div key={t.id} className={`flow-task ${t.state}`} title={t.title}>
                            <span className="flow-title">{t.title}</span>
                            {t.state === "active" && (
                              <div className="mini-meter"><div style={{ width: `${t.progress * 100}%` }} /></div>
                            )}
                            {t.state === "awaiting_approval" && <span className="pill alert">Needs you</span>}
                            {t.state === "queued" && <span className="pill">Queued</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  <div className="flow-col done-col">
                    <div className="flow-col-head">Done</div>
                    <div className="done-count">{done}</div>
                  </div>
                </div>
              </section>
            );
          }),
        )}
    </div>
  );
}

function Crew({ ledger, state, onSelect }: { ledger: FacilityPort; state: FacilityState; onSelect: (s: Selection) => void }) {
  return (
    <ul className="cards">
      {state.agents.map((a) => {
        const task = a.taskId ? state.tasks.find((t) => t.id === a.taskId) : null;
        const room = state.rooms.find((r) => r.id === a.roomId);
        return (
          <li key={a.id} className="card crew-card">
            <button className="crew-main" onClick={() => onSelect({ kind: "agent", id: a.id })}>
              <span className="swatch" style={{ background: a.sprite.suit }} />
              <span>
                <strong>{a.name}</strong> <span className="muted">{a.role}</span>
                <br />
                <span className={`status ${a.status}`}>{a.status}</span>
                <span className="muted"> · {room?.name}</span>
                {task && <span className="muted"> · {task.title}</span>}
              </span>
            </button>
            <button onClick={() => ledger.setAgentPaused(a.id, a.status !== "paused")}>
              {a.status === "paused" ? "Resume" : "Pause"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Log({ state, now }: { state: FacilityState; now: number }) {
  return (
    <ul className="log">
      {state.log.map((e) => (
        <li key={e.id} className={`log-${e.level}`}>
          <span className="muted">{timeAgo(e.at, now)}</span> {e.text}
        </li>
      ))}
    </ul>
  );
}

export function Inspector({ state, selection, onClose }: { state: FacilityState; selection: Selection; onClose: () => void }) {
  let title = "";
  let body: React.ReactNode = null;
  if (selection.kind === "agent") {
    const a = state.agents.find((x) => x.id === selection.id);
    if (!a) return null;
    const task = a.taskId ? state.tasks.find((t) => t.id === a.taskId) : null;
    const finished = completedCount(state, a.wingId);
    title = `${a.name} · ${a.role}`;
    body = (
      <>
        <p><span className={`status ${a.status}`}>{a.status}</span> in {state.rooms.find((r) => r.id === a.roomId)?.name}</p>
        {task ? (
          <p>Working on <strong>{task.title}</strong> ({stageLabel(state, task)}, {Math.round(task.progress * 100)}%)</p>
        ) : (
          <p className="muted">No current task.</p>
        )}
        <p className="muted">Skills: {a.skills.join(", ")} · Wing completions: {finished}</p>
      </>
    );
  } else {
    const r = state.rooms.find((x) => x.id === selection.id);
    if (!r) return null;
    const wing = state.wings.find((w) => w.id === r.wingId);
    const here = state.agents.filter((a) => a.roomId === r.id);
    title = r.name;
    body = (
      <>
        <p className="muted">{wing?.name}{wing && ` · budget ${money(state.spend[wing.id] ?? 0)} of ${money(wing.budgetMonthly)}`}</p>
        <p>{here.length ? `Crew here: ${here.map((a) => a.name).join(", ")}` : "No crew here right now."}</p>
      </>
    );
  }
  return (
    <div className="inspector" role="dialog" aria-label={title}>
      <div className="card-head">
        <strong>{title}</strong>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
      </div>
      {body}
    </div>
  );
}
