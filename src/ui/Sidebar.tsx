import { useEffect, useRef } from "react";
import { completedCount } from "../core/ledger";
import { canWorkStage } from "../core/capabilities";
import { MODELS } from "../core/models";
import { readResearch } from "../core/research";
import type { Agent, FacilityState } from "../core/types";
import type { RemoteFacility } from "../client/remote";
import { crewSprite } from "../facility/pixels";
import type { Selection } from "../facility/status";
import { stageLabel, timeAgo } from "./format";
import { Icon, type IconName } from "./Icon";
import { agentModel, jobCategory, ROOM_DESCRIPTIONS } from "./presentation";
import { Jobs } from "./Jobs";
import type { JobFilter } from "./presentation";
import { Lab } from "./Lab";
import { System } from "./System";

export type WorkspaceTab =
  | "command"
  | "work"
  | "research"
  | "crew"
  | "activity";
export const WORKSPACE_TABS: {
  id: WorkspaceTab;
  label: string;
  icon: IconName;
}[] = [
  { id: "command", label: "Command", icon: "command" },
  { id: "work", label: "Jobs", icon: "work" },
  { id: "research", label: "Lab", icon: "research" },
  { id: "crew", label: "Crew", icon: "crew" },
  { id: "activity", label: "System", icon: "settings" },
];
interface Props {
  jobFilter: JobFilter;
  onJobFilter: (filter: JobFilter) => void;
  onJobs: (filter: JobFilter) => void;
  jobId: string | null;
  onJobSelect: (id: string | null) => void;
  ledger: RemoteFacility;
  state: FacilityState;
  now: number;
  pinSet: boolean;
  live: boolean;
  running: boolean;
  tab: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
}
export function Sidebar({
  jobFilter,
  onJobFilter,
  onJobs,
  jobId,
  onJobSelect,
  ledger,
  state,
  now,
  pinSet,
  live,
  running,
  tab,
  onTab,
  selection,
  onSelect,
}: Props) {
  const body = useRef<HTMLDivElement>(null);
  const previousSelection = useRef<Selection | null>(null);
  const previousTab = useRef(tab);
  const chooseTab = (next: WorkspaceTab) => {
    onSelect(null);
    onTab(next);
  };
  useEffect(() => {
    body.current?.scrollTo(0, 0);
    if (selection) document.getElementById("inspector-heading")?.focus();
    else if (
      previousSelection.current &&
      previousTab.current === tab &&
      document.activeElement?.getAttribute("role") !== "tab"
    ) {
      const previous = previousSelection.current;
      (
        document.getElementById(`agent-${previous.id}`) ??
        document.getElementById("room-locator")
      )?.focus();
    }
    previousSelection.current = selection;
    previousTab.current = tab;
  }, [tab, selection, jobId]);
  return (
    <aside className="sidebar" aria-label="Facility workspace">
      <nav
        className="tabs"
        role="tablist"
        aria-label="Workspace sections"
        onKeyDown={(e) => {
          const index = WORKSPACE_TABS.findIndex((t) => t.id === tab);
          const next =
            e.key === "ArrowRight"
              ? (index + 1) % 5
              : e.key === "ArrowLeft"
                ? (index + 4) % 5
                : e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? 4
                    : -1;
          if (next >= 0) {
            e.preventDefault();
            chooseTab(WORKSPACE_TABS[next].id);
            document.getElementById(`tab-${WORKSPACE_TABS[next].id}`)?.focus();
          }
        }}
      >
        {WORKSPACE_TABS.map((item, i) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            role="tab"
            aria-controls={`panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            className={`tab ${tab === item.id ? "active" : ""}`}
            onClick={() => chooseTab(item.id)}
            title={`${item.label} · Option / Alt ${i + 1}`}
          >
            <Icon name={item.icon} size={17} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div
        ref={body}
        className="tab-body"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
      >
        {selection ? (
          <Inspector
            state={state}
            selection={selection}
            onClose={() => onSelect(null)}
            ledger={ledger}
            onTab={chooseTab}
            onSelect={onSelect}
            onJobSelect={onJobSelect}
          />
        ) : (
          <>
            {tab === "command" && (
              <Command
                onJobs={onJobs}
                state={state}
                ledger={ledger}
                now={now}
                onTab={chooseTab}
                onJobSelect={onJobSelect}
              />
            )}
            {tab === "work" && (
              <Jobs
                filter={jobFilter}
                onFilter={onJobFilter}
                selected={jobId}
                onSelect={onJobSelect}
                state={state}
                ledger={ledger}
                now={now}
                pinSet={pinSet}
                onResearch={() => chooseTab("research")}
              />
            )}
            {tab === "research" && (
              <Lab
                state={state}
                ledger={ledger}
                live={live}
                running={running}
                onJobs={(id) => onJobSelect(id ?? null)}
              />
            )}
            {tab === "crew" && <Crew state={state} onSelect={onSelect} />}
            {tab === "activity" && (
              <System
                state={state}
                now={now}
                connected={ledger.connection === "online"}
              />
            )}
          </>
        )}
      </div>
      <footer className="panel-footer">
        <Icon name="shield" size={13} />
        <span>Owner approval required for external actions</span>
      </footer>
    </aside>
  );
}
function Command({
  onJobs,
  state,
  ledger,
  now,
  onTab,
  onJobSelect,
}: {
  state: FacilityState;
  ledger: RemoteFacility;
  now: number;
  onTab: (t: WorkspaceTab) => void;
  onJobSelect: (id: string | null) => void;
  onJobs: (filter: JobFilter) => void;
}) {
  const operator = state.operator?.active ?? "claude";
  const stopped = state.tasks.filter(
    (t) => jobCategory(state, t) === "blocked",
  ).length;
  const logins = state.tasks.filter(
    (t) => jobCategory(state, t) === "login",
  ).length;
  const reviews = state.approvals.filter(
    (a) => a.status === "pending" && a.kind !== "failure",
  ).length;
  const working = state.tasks.filter((t) => t.state === "active").length;
  const notebook = [...state.tasks]
    .reverse()
    .find((t) => readResearch(t.brief));
  const latest = [...state.tasks].reverse().slice(0, 3);
  return (
    <>
      <div className="page-heading">
        <h2>Command</h2>
        <span className="micro">Overview</span>
      </div>
      <section className="operator-card" aria-label="Active operator">
        <span className="operator-symbol">
          <Icon name="command" size={23} />
        </span>
        <div>
          <span className="micro">Active operator</span>
          <strong>{MODELS[operator].name}</strong>
        </div>
        <span className="badge">
          {operator === "codex" ? "Temporary" : "Primary"}
        </span>
      </section>
      <div className="summary-grid">
        <button className="metric" onClick={() => onJobs("active")}>
          <strong>{working}</strong>
          <span>Running</span>
        </button>
        <button className="metric" onClick={() => onJobs("approval")}>
          <strong>{reviews}</strong>
          <span>Approval</span>
        </button>
        <button
          className={`metric ${stopped ? "amber" : ""}`}
          onClick={() => onJobs("blocked")}
        >
          <strong>{stopped}</strong>
          <span>Blocked</span>
        </button>
      </div>
      {(stopped > 0 || reviews > 0 || logins > 0) && (
        <button
          className="action-row attention-row"
          onClick={() => onTab("work")}
        >
          <Icon name={stopped ? "help" : "shield"} size={19} />
          <span className="row-copy">
            <strong>{`${stopped + reviews + logins} ${stopped + reviews + logins === 1 ? "job needs" : "jobs need"} attention`}</strong>
            <small>
              {[
                logins ? `${logins} login needed` : "",
                stopped ? `${stopped} blocked` : "",
                reviews ? `${reviews} approval` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </span>
          <Icon name="chevron" size={15} />
        </button>
      )}
      <div className="subheading">
        <h3>Latest work</h3>
        <button className="text-button" onClick={() => onTab("work")}>
          All jobs <Icon name="arrow" size={14} />
        </button>
      </div>
      <div className="row-list">
        {latest.length ? (
          latest.map((task) => (
            <button
              className="action-row"
              key={task.id}
              onClick={() => onJobSelect(task.id)}
            >
              <Icon
                name={task.workflowId === "research-test" ? "research" : "work"}
                size={18}
              />
              <span className="row-copy">
                <strong>{task.title}</strong>
                <small>
                  {stageLabel(state, task)} · {timeAgo(task.updatedAt, now)}
                </small>
              </span>
              <Icon name="chevron" size={14} />
            </button>
          ))
        ) : (
          <p className="section-intro">No jobs yet. Start a notebook in Lab.</p>
        )}
      </div>
      <button
        className="action-row lab-shortcut"
        onClick={() => onTab("research")}
      >
        <Icon name="research" size={18} />
        <span className="row-copy">
          <strong>{notebook ? "Research notebook" : "Start research"}</strong>
          <small>
            {notebook
              ? "Latest findings and supporting sources"
              : "Qwen · public evidence analysis on this Mac"}
          </small>
        </span>
        <Icon name="arrow" size={15} />
      </button>
      <details className="disclosure">
        <summary>Operator & handover</summary>
        <p>
          {operator === "codex"
            ? "Codex is temporarily handling writing and briefings. Claude can take command again through the same shared queue."
            : "Claude handles writing and briefings. Codex takes command when Claude is unavailable."}
        </p>
        <p className="micro">
          Handovers keep jobs, saved work and approvals. Previous operator
          responses cannot advance a reassigned job.
        </p>
        <button
          onClick={() =>
            ledger.setOperator(
              operator === "claude" ? "codex" : "claude",
              state.operator?.generation ?? 0,
            )
          }
        >
          <Icon name="arrow" size={15} />
          {operator === "claude" ? "Switch to Codex" : "Return to Claude"}
        </button>
        {!!state.operator?.changedAt && (
          <p className="micro">
            Last handover {timeAgo(state.operator.changedAt, now)} · Owner PIN
            required
          </p>
        )}
      </details>
    </>
  );
}
function Portrait({ agent }: { agent: Agent }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 28, 36);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(crewSprite(agent.sprite, "down", 0), 0, 0, 28, 36);
  }, [agent.sprite.suit, agent.sprite.visor]);
  return (
    <span className="portrait">
      <canvas ref={ref} width="28" height="36" aria-hidden="true" />
    </span>
  );
}
function Crew({
  state,
  onSelect,
}: {
  state: FacilityState;
  onSelect: (s: Selection) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <h2>Crew</h2>
        <span className="muted">{state.agents.length} agents</span>
      </div>
      <p className="section-intro">
        Select an agent for its model, assignment and permissions.
      </p>
      <div className="row-list">
        {state.agents.map((agent) => {
          const model = agentModel(state, agent);
          return (
            <button
              className="crew-row"
              id={`agent-${agent.id}`}
              key={agent.id}
              onClick={() => onSelect({ kind: "agent", id: agent.id })}
            >
              <Portrait agent={agent} />
              <span className="row-copy">
                <strong>
                  {agent.name}{" "}
                  <small className="inline-role">{agent.role}</small>
                </strong>
                <small>{model ? MODELS[model].name : "Application code"}</small>
              </span>
              <span
                className={`status-dot ${agent.status}`}
                title={agent.status}
              />
              <span className="sr-only">{agent.status}</span>
              <Icon name="chevron" size={14} />
            </button>
          );
        })}
      </div>
      <div className="crew-legend">
        <span>
          <i className="status-dot working" />
          Working
        </span>
        <span>
          <i className="status-dot idle" />
          Idle
        </span>
        <span>
          <i className="status-dot paused" />
          Paused
        </span>
        <span>
          <i className="status-dot waiting" />
          Waiting
        </span>
      </div>
    </>
  );
}
export function Inspector({
  state,
  selection,
  onClose,
  ledger,
  onTab,
  onSelect,
  onJobSelect,
}: {
  state: FacilityState;
  selection: Selection;
  onClose: () => void;
  ledger?: RemoteFacility;
  onTab?: (t: WorkspaceTab) => void;
  onSelect?: (s: Selection) => void;
  onJobSelect?: (id: string) => void;
}) {
  const agent =
    selection.kind === "agent"
      ? state.agents.find((a) => a.id === selection.id)
      : undefined;
  const room =
    selection.kind === "room"
      ? state.rooms.find((r) => r.id === selection.id)
      : state.rooms.find((r) => r.id === agent?.roomId);
  if (!agent && !room)
    return (
      <>
        <button className="back-button" onClick={onClose}>
          <Icon name="back" size={16} />
          Back
        </button>
        <p>This item is no longer available.</p>
      </>
    );
  const model = agent ? agentModel(state, agent) : null;
  const task = state.tasks.find((t) => t.id === agent?.taskId);
  const here = state.agents.filter((a) => a.roomId === room?.id);
  const access = agent
    ? [
        ...new Set(
          state.wings
            .flatMap((w) => w.workflows.flatMap((f) => f.stages))
            .filter((s) => canWorkStage(agent, agent.wingId, s))
            .map((s) => s.data)
            .filter(Boolean),
        ),
      ]
        .map((d) =>
          d === "public"
            ? "Public information"
            : d === "shop"
              ? "Shop plans"
              : "Customer messages",
        )
        .join(", ")
    : "";
  const roomTab: WorkspaceTab =
    room?.kind === "lab"
      ? "research"
      : room?.kind === "security" || room?.kind === "vault"
        ? "activity"
        : room?.kind === "command"
          ? "command"
          : "work";
  return (
    <section
      className="inspector"
      aria-label={`${agent?.name ?? room?.name} details`}
    >
      <button className="back-button" onClick={onClose}>
        <Icon name="back" size={16} />
        Back to workspace
      </button>
      <div className="inspector-title">
        {agent && <Portrait agent={agent} />}
        <div>
          <span className="eyebrow">{agent ? "AGENT" : "ROOM"}</span>
          <h2 id="inspector-heading" tabIndex={-1}>
            {agent?.name ?? room?.name}
          </h2>
          {agent && <p>{agent.role}</p>}
        </div>
      </div>
      {agent ? (
        <>
          <dl className="facts">
            <div>
              <dt>{task ? "Current model" : "Assigned model"}</dt>
              <dd className="model-value">
                {model ? MODELS[model].name : "Application code"}
              </dd>
            </div>
            <div>
              <dt>Runs through</dt>
              <dd>{model ? MODELS[model].where : "this Mac"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd className="capitalize">{agent.status}</dd>
            </div>
            <div>
              <dt>Workstation</dt>
              <dd>{room?.name}</dd>
            </div>
          </dl>
          <div className="assignment">
            <span className="eyebrow">ASSIGNMENT</span>
            <h3>{task?.title ?? "No active assignment"}</h3>
            <p>
              {task ? stageLabel(state, task) : "Waiting for a matching job."}
            </p>
            {task && (
              <button
                className="text-button"
                onClick={() => onJobSelect?.(task.id)}
              >
                Open job <Icon name="arrow" size={14} />
              </button>
            )}
          </div>
          {ledger && (
            <button
              onClick={() =>
                ledger.setAgentPaused(agent.id, agent.status !== "paused")
              }
            >
              <Icon
                name={agent.status === "paused" ? "play" : "pause"}
                size={15}
              />
              {agent.status === "paused" ? "Resume agent" : "Pause agent"}
            </button>
          )}
          <details className="disclosure">
            <summary>Role & permissions</summary>
            <p>{access || "Code checks and approved content only"}.</p>
            <p className="micro">
              Role: {agent.capability}. Role permissions are fixed in
              application code. Model output cannot grant additional access.
            </p>
            {model === "typeset" && (
              <p className="micro">
                Artwork uses the local typography designer. Codex image handoff
                is not connected.
              </p>
            )}
          </details>
        </>
      ) : (
        <>
          <p className="section-intro">
            {ROOM_DESCRIPTIONS[room!.id] ?? "Reserved for a future business."}
          </p>
          {room?.kind !== "sealed" && onTab && (
            <button onClick={() => onTab(roomTab)}>
              Open {WORKSPACE_TABS.find((t) => t.id === roomTab)?.label}{" "}
              <Icon name="arrow" size={15} />
            </button>
          )}
          <div className="subheading">
            <h3>Stationed here</h3>
            <span className="micro">{here.length} agents</span>
          </div>
          <div className="row-list">
            {here.length ? (
              here.map((a) => (
                <button
                  key={a.id}
                  className="crew-row"
                  onClick={() => onSelect?.({ kind: "agent", id: a.id })}
                >
                  <Portrait agent={a} />
                  <span className="row-copy">
                    <strong>{a.name}</strong>
                    <small>
                      {agentModel(state, a)
                        ? MODELS[agentModel(state, a)!].name
                        : "Application code"}
                    </small>
                  </span>
                  <Icon name="chevron" size={14} />
                </button>
              ))
            ) : (
              <p className="micro">No agents stationed here.</p>
            )}
          </div>
          <p className="micro room-completion">
            {completedCount(state, room?.wingId)} completed jobs in this wing.
          </p>
        </>
      )}
    </section>
  );
}
