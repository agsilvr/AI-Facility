import { useEffect, useRef, useState } from "react";
import { APPROVAL_TTL_MS, completedCount } from "../core/ledger";
import { canWorkStage } from "../core/capabilities";
import { MODELS } from "../core/models";
import { readResearch, RESEARCH_SOURCES } from "../core/research";
import type {
  Agent,
  Approval,
  Draft,
  FacilityState,
  ModelId,
  Task,
} from "../core/types";
import type { RemoteFacility } from "../client/remote";
import { crewSprite } from "../facility/pixels";
import type { Selection } from "../facility/status";
import { money, stageLabel, timeAgo } from "./format";
import { Icon, type IconName } from "./Icon";
import {
  agentModel,
  failureSummary,
  ROOM_DESCRIPTIONS,
  taskState,
} from "./presentation";

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
  { id: "work", label: "Work", icon: "work" },
  { id: "research", label: "Research", icon: "research" },
  { id: "crew", label: "Crew", icon: "crew" },
  { id: "activity", label: "Activity", icon: "activity" },
];
interface Props {
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
  const pending = state.approvals.filter((a) => a.status === "pending");
  const active = WORKSPACE_TABS.find((t) => t.id === tab)!;
  return (
    <aside className="sidebar" aria-label="Facility workspace">
      <div className="panel-heading">
        <span className="eyebrow">YOUR WORKSPACE</span>
        <span className="connection-label">
          <i /> Local connection
        </span>
      </div>
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
            onTab(WORKSPACE_TABS[next].id);
            document.getElementById(`tab-${WORKSPACE_TABS[next].id}`)?.focus();
          }
        }}
      >
        {WORKSPACE_TABS.map((item) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            role="tab"
            aria-controls={`panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            className={`tab ${tab === item.id ? "active" : ""}`}
            onClick={() => onTab(item.id)}
            title={`${item.label} · Option ${WORKSPACE_TABS.indexOf(item) + 1}`}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
            {item.id === "work" && pending.length > 0 && (
              <b className="tab-count">{pending.length}</b>
            )}
          </button>
        ))}
      </nav>
      <div
        className="tab-body"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
      >
        {selection && (
          <Inspector
            state={state}
            selection={selection}
            onClose={() => onSelect(null)}
            ledger={ledger}
          />
        )}
        <div className="section-heading">
          <h2>
            {active.label === "Work"
              ? "The workbench"
              : active.label === "Command"
                ? "Command journal"
                : active.label === "Research"
                  ? "Research notebook"
                  : active.label === "Crew"
                    ? "Meet your crew"
                    : "Activity journal"}
          </h2>
          <span className="section-mark">
            <Icon name={active.icon} size={20} />
          </span>
        </div>
        {tab === "command" && (
          <Command state={state} ledger={ledger} now={now} onTab={onTab} />
        )}
        {tab === "work" && (
          <Work state={state} ledger={ledger} now={now} pinSet={pinSet} />
        )}
        {tab === "research" && (
          <Research
            state={state}
            ledger={ledger}
            live={live}
            running={running}
          />
        )}
        {tab === "crew" && (
          <Crew state={state} ledger={ledger} onSelect={onSelect} />
        )}
        {tab === "activity" && <Activity state={state} now={now} />}
      </div>
      <footer className="panel-footer">
        <Icon name="shield" size={15} /> Your approval comes before publishing.
        <span>LOCAL FIRST</span>
      </footer>
    </aside>
  );
}

function Command({
  state,
  ledger,
  now,
  onTab,
}: {
  state: FacilityState;
  ledger: RemoteFacility;
  now: number;
  onTab: (t: WorkspaceTab) => void;
}) {
  const operator = state.operator?.active ?? "claude";
  const stopped = state.approvals.filter(
    (a) => a.status === "pending" && a.kind === "failure",
  ).length;
  const reviews = state.approvals.filter(
    (a) => a.status === "pending" && a.kind !== "failure",
  ).length;
  const working = state.tasks.filter((t) => t.state === "active").length;
  return (
    <>
      <section className="operator-card">
        <div className="card-head">
          <span className="eyebrow">AT THE HELM</span>
          <span
            className={`badge ${operator === "codex" ? "lavender" : "sage"}`}
          >
            {operator === "codex" ? "Temporary operator" : "Primary operator"}
          </span>
        </div>
        <div className="operator-identity">
          <span className="operator-avatar">
            <Icon name={operator === "codex" ? "spark" : "command"} size={27} />
          </span>
          <div>
            <h3>{operator === "codex" ? "Codex" : "Claude"}</h3>
            <p>One leader. One shared plan.</p>
          </div>
        </div>
        <p>
          {operator === "codex"
            ? "Codex is holding command while Claude is away. Jobs, notes, and approvals stay together."
            : "Claude leads day-to-day work. Codex takes command if Claude cannot complete a step."}
        </p>
        <button
          className="handoff-button"
          onClick={() =>
            ledger.setOperator(
              operator === "claude" ? "codex" : "claude",
              state.operator?.generation ?? 0,
            )
          }
        >
          <Icon name="arrow" size={17} />
          {operator === "claude"
            ? "Hand command to Codex"
            : "Return command to Claude"}
        </button>
        {state.operator?.changedAt ? (
          <span className="micro">
            Last handover {timeAgo(state.operator.changedAt, now)} · existing
            approvals retained
          </span>
        ) : null}
      </section>
      <div className="summary-grid">
        <Metric label="In progress" value={working} />
        <Metric label="Ready to review" value={reviews} />
        <Metric
          label="Need attention"
          value={stopped}
          tone={stopped > 0 ? "amber" : undefined}
        />
      </div>
      {stopped > 0 && (
        <button className="notice notice-button" onClick={() => onTab("work")}>
          <span className="notice-icon">!</span>
          <span>
            <strong>
              {stopped} {stopped === 1 ? "step needs" : "steps need"} a little
              attention
            </strong>
            <span>Your earlier work is saved. Review the blockers.</span>
          </span>
          <Icon name="chevron" size={17} />
        </button>
      )}
      <div className="subheading">
        <h3>Today's work</h3>
        <button className="text-button" onClick={() => onTab("work")}>
          View all <Icon name="arrow" size={14} />
        </button>
      </div>
      <div className="journey-list">
        <Journey
          icon="research"
          title="Explore opportunities"
          description={
            state.unavailable?.includes("qwen")
              ? "Waiting for Qwen on this Mac"
              : "Qwen · local research notebook"
          }
          onClick={() => onTab("research")}
        />
        <Journey
          icon="image"
          title="Create something worth making"
          description="Typography is ready · image handoff coming next"
          onClick={() => onTab("work")}
        />
        <Journey
          icon="shield"
          title="Review before it goes out"
          description={`${reviews} packages ready · publishing not connected`}
          onClick={() => onTab("work")}
        />
      </div>
      <div className="subheading">
        <h3>Monthly usage</h3>
        <span className="micro">{state.spendMonth}</span>
      </div>
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
                  {money(spend)} <small>/ {money(wing.budgetMonthly)}</small>
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
        Model-reported usage, not shop revenue. Accounting is not connected.
      </p>
      <details className="disclosure">
        <summary>
          <Icon name="shield" size={17} /> Connections & safeguards
        </summary>
        <div className="detail-content">
          <p>
            Owner PIN protects approvals and handovers. Outside text is read by
            isolated drafting models. DeepSeek and publishing are not connected.
          </p>
          <p>
            Codex and Claude use the official apps on your subscriptions. Only
            the elected operator claims new writing work.
          </p>
        </div>
      </details>
    </>
  );
}
function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <span>{label}</span>
    </div>
  );
}
function Journey({
  icon,
  title,
  description,
  onClick,
}: {
  icon: IconName;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button className="journey" onClick={onClick}>
      <span className="journey-icon">
        <Icon name={icon} size={19} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <Icon name="chevron" size={15} />
    </button>
  );
}

function Work({
  state,
  ledger,
  now,
  pinSet,
}: {
  state: FacilityState;
  ledger: RemoteFacility;
  now: number;
  pinSet: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const tasks = [...state.tasks]
    .reverse()
    .filter(
      (t) =>
        t.title.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "all" ||
          (filter === "done" && t.state === "done") ||
          (filter === "review" &&
            state.approvals.some(
              (a) => a.taskId === t.id && a.status === "pending",
            ))),
    );
  return (
    <>
      <p className="section-intro">
        Every job, its next step, and the work already saved.
      </p>
      <label className="search-field">
        <Icon name="research" size={17} />
        <input
          type="search"
          placeholder="Find a job…"
          aria-label="Search jobs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="filter-row" aria-label="Filter jobs">
        {[
          ["all", "All work"],
          ["review", "Needs you"],
          ["done", "Completed"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            className={filter === id ? "selected" : ""}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {!pinSet && (
        <p className="notice">
          Choose your owner PIN before approving work. The installer opens the
          setup page.
        </p>
      )}
      <div className="cards">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            state={state}
            ledger={ledger}
            now={now}
          />
        ))}
      </div>
      {!tasks.length && (
        <Empty
          icon="work"
          title={query ? "No matching jobs" : "A clear workbench"}
          text={
            query
              ? "Try another word or choose a different filter."
              : "Start a research notebook to give the crew a first assignment."
          }
        />
      )}
    </>
  );
}
function TaskCard({
  task,
  state,
  ledger,
  now,
}: {
  task: Task;
  state: FacilityState;
  ledger: RemoteFacility;
  now: number;
}) {
  const approval = state.approvals.find(
    (a) => a.taskId === task.id && a.status === "pending",
  );
  const failed = approval?.kind === "failure";
  const summary = failed
    ? failureSummary(approval.flags[0]?.message ?? "")
    : null;
  const stages =
    state.wings
      .find((w) => w.id === task.wingId)
      ?.workflows.find((w) => w.id === task.workflowId)?.stages ?? [];
  const status = taskState(state, task);
  return (
    <details className={`job-card ${failed ? "stopped" : ""}`}>
      <summary>
        <span className="job-icon">
          <Icon
            name={
              task.workflowId === "research-test"
                ? "research"
                : task.workflowId === "briefing"
                  ? "command"
                  : "image"
            }
            size={19}
          />
        </span>
        <span className="job-summary">
          <strong>{task.title}</strong>
          <small>
            {stageLabel(state, task)} · {timeAgo(task.updatedAt, now)}
          </small>
        </span>
        <span
          className={`badge ${failed ? "amber" : task.state === "done" ? "sage" : ""}`}
        >
          {status}
        </span>
        <Icon name="chevron" size={15} />
      </summary>
      <div className="job-details">
        <div className="stage-track" aria-label="Job progress">
          {stages.map((s, i) => (
            <span
              key={s.id}
              className={
                task.state === "done" || i < task.stageIndex
                  ? "finished"
                  : i === task.stageIndex
                    ? "current"
                    : ""
              }
            >
              <i>
                {i < task.stageIndex || task.state === "done" ? "✓" : i + 1}
              </i>
              {s.label}
            </span>
          ))}
        </div>
        {task.model && (
          <p className="model-line">
            <Icon name="spark" size={15} /> Thinking with{" "}
            <strong>{MODELS[task.model].name}</strong>
          </p>
        )}
        {task.waiting && <p className="notice">{task.waiting}</p>}
        {summary && (
          <div className="notice">
            <strong>{summary.title}</strong>
            <p>{summary.detail}</p>
          </div>
        )}
        {task.notes.length > 0 && (
          <details className="disclosure">
            <summary>
              Saved work · {task.notes.length}{" "}
              {task.notes.length === 1 ? "step" : "steps"}
            </summary>
            <ol className="notes">
              {task.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
          </details>
        )}
        {approval?.content && <DraftPreview content={approval.content} />}
        {approval && (
          <ApprovalActions approval={approval} ledger={ledger} now={now} />
        )}
        {failed && (
          <details className="disclosure technical">
            <summary>Technical details</summary>
            <pre>{approval.flags.map((f) => f.message).join("\n")}</pre>
          </details>
        )}
      </div>
    </details>
  );
}
function ApprovalActions({
  approval,
  ledger,
  now,
}: {
  approval: Approval;
  ledger: RemoteFacility;
  now: number;
}) {
  const stale = now - approval.createdAt > APPROVAL_TTL_MS;
  const blocked = approval.flags.some((f) => f.level === "block");
  return (
    <>
      {approval.kind !== "failure" && (
        <>
          {approval.flags.map((f) => (
            <p className={`flag-${f.level}`} key={f.code}>
              {f.message}
            </p>
          ))}
          {stale && (
            <p className="notice">
              This approval is more than a day old. Send it back for a fresh
              review.
            </p>
          )}
        </>
      )}
      <div className="card-actions">
        {approval.kind === "failure" ? (
          <button
            className="primary"
            onClick={() => ledger.decide(approval.id, false)}
          >
            <Icon name="play" size={15} />
            Retry this step
          </button>
        ) : (
          <>
            <button
              className="primary"
              disabled={blocked || stale}
              title={
                blocked
                  ? "Resolve the blocking findings first"
                  : stale
                    ? "This approval has expired"
                    : "Approve this exact package"
              }
              onClick={() => ledger.decide(approval.id, true)}
            >
              <Icon name="check" size={17} />
              Approve package
            </button>
            <button onClick={() => ledger.decide(approval.id, false)}>
              Request revision
            </button>
          </>
        )}
      </div>
    </>
  );
}
function DraftPreview({ content }: { content: string }) {
  let draft: Draft;
  try {
    draft = JSON.parse(content);
  } catch {
    return <pre className="draft">{content}</pre>;
  }
  return draft.kind === "listing" ? (
    <section className="draft">
      <span className="eyebrow">EXACT PACKAGE FOR REVIEW</span>
      {draft.design && (
        <img
          className="draft-design"
          src={`/api/designs/${encodeURIComponent(draft.design)}`}
          alt={`Artwork for ${draft.title}`}
        />
      )}
      <h3>{draft.title}</h3>
      <strong>{money(draft.priceUsd)}</strong>
      <p>{draft.description}</p>
      <div className="tag-list">
        {draft.tags.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </section>
  ) : draft.kind === "reply" ? (
    <div className="draft">
      <span className="eyebrow">REPLY FOR REVIEW</span>
      <p>{draft.message}</p>
    </div>
  ) : null;
}

function Research({
  state,
  ledger,
  live,
  running,
}: {
  state: FacilityState;
  ledger: RemoteFacility;
  live: boolean;
  running: boolean;
}) {
  const tasks = state.tasks.filter((t) => t.workflowId === "research-test");
  const open = tasks.find((t) => t.state !== "done");
  const reportTask = [...tasks].reverse().find((t) => readResearch(t.brief));
  const report = readResearch(reportTask?.brief);
  return (
    <>
      <div className="research-intro">
        <span className="large-icon">
          <Icon name="research" size={28} />
        </span>
        <span className="badge sage">Qwen · on this Mac</span>
        <h3>Good ideas start with evidence.</h3>
        <p>
          Ask Qwen to explore three original print directions using a small,
          dated public source pack.
        </p>
        <button
          className="primary"
          disabled={!live || !running || !!open}
          onClick={() => ledger.runResearch()}
        >
          <Icon name={open ? "clock" : "spark"} size={17} />
          {open
            ? open.state === "active"
              ? "Qwen is researching…"
              : open.state === "awaiting_approval"
                ? "Research needs attention"
                : "Research queued"
            : report
              ? "Run another research test"
              : "Run a research test"}
        </button>
        <span className="micro">
          Local model · no Claude call · no publishing
        </span>
        {!running && (
          <p className="notice">Resume the facility to begin research.</p>
        )}
      </div>
      {open && (
        <p className="notice" role="status">
          {open.state === "awaiting_approval"
            ? "The research step stopped. Open Work to review its message and retry."
            : open.waiting ||
              "This notebook will appear here when Qwen finishes."}
        </p>
      )}
      {report && (
        <section className="research-report">
          <div className="subheading">
            <h3>Latest findings</h3>
            <span className="badge sage">
              {report.opportunities.length} directions
            </span>
          </div>
          <p>{report.summary}</p>
          {report.opportunities.map((o, i) => (
            <article className="opportunity" key={i}>
              <span className="opportunity-number">0{i + 1}</span>
              <h3>{o.title}</h3>
              <p className="micro">FOR {o.audience}</p>
              <p>{o.concept}</p>
              <div className="evidence">
                <strong>Why explore it</strong>
                <p>{o.evidence}</p>
                {o.sourceIds.map((id) => {
                  const source = report.sources.find((s) => s.id === id);
                  return source ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      key={id}
                    >
                      {source.title} ↗
                    </a>
                  ) : null;
                })}
              </div>
              <p className="next-step">
                <strong>Next step</strong> {o.nextStep}
              </p>
            </article>
          ))}
          <div className="notice">
            <strong>What still needs validation</strong>
            <ul>
              {report.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              <li>
                Competitor prices, supplier variant costs, shipping and margins
                have not been checked.
              </li>
            </ul>
          </div>
        </section>
      )}
      <details className="disclosure" open={!report}>
        <summary>
          <Icon name="link" size={16} /> Public sources · checked October 30,
          2026
        </summary>
        <div className="source-list">
          {RESEARCH_SOURCES.map((s) => (
            <a href={s.url} key={s.id} target="_blank" rel="noreferrer">
              <strong>{s.title} ↗</strong>
              <small>{s.notes}</small>
            </a>
          ))}
        </div>
      </details>
      <p className="micro">
        Qwen analyzes these saved sources. Live web collection and
        competitor-price research are not connected yet.
      </p>
    </>
  );
}
function Portrait({ agent }: { agent: Agent }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
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
  ledger,
  onSelect,
}: {
  state: FacilityState;
  ledger: RemoteFacility;
  onSelect: (s: Selection) => void;
}) {
  return (
    <>
      <p className="section-intro">
        A familiar face. A clear role. Select a crew member to see their model
        and current assignment.
      </p>
      <div className="cards">
        {state.agents.map((agent) => {
          const model = agentModel(state, agent);
          return (
            <article className="crew-card" key={agent.id}>
              <button
                className="crew-main"
                onClick={() => onSelect({ kind: "agent", id: agent.id })}
              >
                <Portrait agent={agent} />
                <span>
                  <strong>{agent.name}</strong>
                  <small>{agent.role}</small>
                  <span className="model-chip">
                    <Icon name="spark" size={12} />
                    {model ? MODELS[model].name : "Application code"}
                  </span>
                </span>
                <span
                  className={`badge ${agent.status === "working" ? "sage" : ""}`}
                >
                  {agent.status === "working"
                    ? "Working"
                    : agent.status === "paused"
                      ? "Paused"
                      : "Available"}
                </span>
              </button>
              <button
                className="crew-toggle"
                onClick={() =>
                  ledger.setAgentPaused(agent.id, agent.status !== "paused")
                }
                aria-label={`${agent.status === "paused" ? "Resume" : "Pause"} ${agent.name}`}
              >
                <Icon
                  name={agent.status === "paused" ? "play" : "pause"}
                  size={16}
                />
              </button>
            </article>
          );
        })}
      </div>
      <details className="disclosure">
        <summary>
          <Icon name="shield" size={17} /> Model access & connections
        </summary>
        <div className="detail-content">
          {(Object.keys(MODELS) as ModelId[]).map((id) => (
            <div className="model-record" key={id}>
              <strong>{MODELS[id].name}</strong>
              <small>{MODELS[id].where}</small>
              <p>
                May see:{" "}
                {MODELS[id].sees
                  .map((s) =>
                    s === "public"
                      ? "public information"
                      : s === "shop"
                        ? "shop plans"
                        : "customer messages",
                  )
                  .join(", ")}
                .
              </p>
              {state.unavailable?.includes(id) && (
                <span className="badge amber">Not connected</span>
              )}
            </div>
          ))}
        </div>
      </details>
    </>
  );
}
function Activity({ state, now }: { state: FacilityState; now: number }) {
  return (
    <>
      <p className="section-intro">
        A continuous record of assignments, handovers, decisions, and completed
        work.
      </p>
      <ol className="activity-list">
        {state.log.map((event) => (
          <li key={event.id}>
            <span className={`event-dot ${event.level}`} />
            <div>
              <time>{timeAgo(event.at, now)}</time>
              <p>
                {/Claude Code exited/.test(event.text)
                  ? event.text.split(": Claude Code")[0] +
                    ". Open the job for recovery options."
                  : event.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: IconName;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export function Inspector({
  state,
  selection,
  onClose,
  ledger,
}: {
  state: FacilityState;
  selection: Selection;
  onClose: () => void;
  ledger?: RemoteFacility;
}) {
  const agent =
    selection.kind === "agent"
      ? state.agents.find((a) => a.id === selection.id)
      : undefined;
  const room =
    selection.kind === "room"
      ? state.rooms.find((r) => r.id === selection.id)
      : state.rooms.find((r) => r.id === agent?.roomId);
  if (!agent && !room) return null;
  const model = agent ? agentModel(state, agent) : null;
  const task = agent?.taskId
    ? state.tasks.find((t) => t.id === agent.taskId)
    : null;
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
  return (
    <section
      className="inspector"
      aria-label={`${agent?.name ?? room?.name} details`}
    >
      <div className="card-head">
        <span className="eyebrow">
          {agent ? "CREW DOSSIER" : "ROOM DETAILS"}
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close details"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="inspector-title">
        {agent && <Portrait agent={agent} />}
        <div>
          <h3>{agent?.name ?? room?.name}</h3>
          <p>
            {agent?.role ??
              ROOM_DESCRIPTIONS[room!.id] ??
              "Space reserved for the next business."}
          </p>
        </div>
      </div>
      {agent && (
        <>
          <dl className="facts">
            <div>
              <dt>{task ? "Current model" : "Assigned model"}</dt>
              <dd>{model ? MODELS[model].name : "Application code"}</dd>
            </div>
            <div>
              <dt>Runs through</dt>
              <dd>{model ? MODELS[model].where : "this Mac"}</dd>
            </div>
            <div>
              <dt>Data access</dt>
              <dd>{access || "Code checks / approved content"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{agent.status}</dd>
            </div>
            <div>
              <dt>Workstation</dt>
              <dd>{room?.name}</dd>
            </div>
          </dl>
          {model === "typeset" && (
            <p className="micro">
              Artwork currently uses the local typography designer. Codex image
              handoff is not connected yet.
            </p>
          )}
          <div className="assignment">
            <span className="eyebrow">CURRENT ASSIGNMENT</span>
            <strong>{task?.title ?? "Ready for the next assignment"}</strong>
            <p>
              {task
                ? stageLabel(state, task)
                : "The scheduler assigns work when a matching job is ready."}
            </p>
            {task?.state === "active" && (
              <span className="badge sage">
                In progress · elapsed work, not a completion estimate
              </span>
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
              {agent.status === "paused" ? "Resume" : "Pause"} {agent.name}
            </button>
          )}
        </>
      )}
      {!agent && (
        <>
          <div className="room-crew">
            {here.length ? (
              here.map((a) => (
                <span className="model-chip" key={a.id}>
                  {a.name} ·{" "}
                  {agentModel(state, a)
                    ? MODELS[agentModel(state, a)!].name
                    : "Automated code"}
                </span>
              ))
            ) : (
              <span className="micro">No crew stationed here.</span>
            )}
          </div>
          <p className="micro">
            {completedCount(state, room?.wingId)} completed jobs in this wing.
            Completion counts are not revenue.
          </p>
        </>
      )}
    </section>
  );
}
