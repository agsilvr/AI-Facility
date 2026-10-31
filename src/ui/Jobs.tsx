import { useEffect, useRef, useState } from "react";
import { APPROVAL_TTL_MS } from "../core/ledger";
import { MODELS } from "../core/models";
import { RESEARCH_SOURCES } from "../core/research";
import type { Approval, Draft, FacilityState, Task } from "../core/types";
import type { RemoteFacility } from "../client/remote";
import { money, stageLabel, timeAgo } from "./format";
import { Icon } from "./Icon";
import { WorkBoard } from "./WorkBoard";
import {
  failureSummary,
  jobCategory,
  JOB_CATEGORIES,
  taskState,
  taskTone,
  operationCategory,
  type JobFilter,
} from "./presentation";

export function Jobs({
  filter,
  onFilter,
  state,
  ledger,
  now,
  pinSet,
  onResearch,
  selected,
  onSelect,
}: {
  filter: JobFilter;
  onFilter: (filter: JobFilter) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  state: FacilityState;
  ledger: RemoteFacility;
  now: number;
  pinSet: boolean;
  onResearch: () => void;
}) {
  const [query, setQuery] = useState("");
  const previous = useRef<string | null>(null);
  const task = state.tasks.find((t) => t.id === selected);
  useEffect(() => {
    if (selected) document.getElementById("job-heading")?.focus();
    else if (previous.current)
      document.getElementById(`job-${previous.current}`)?.focus();
    previous.current = selected;
  }, [selected]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[aria-modal="true"]'))
        onSelect(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  if (task)
    return (
      <JobDetail
        task={task}
        state={state}
        ledger={ledger}
        now={now}
        onBack={() => onSelect(null)}
        onResearch={onResearch}
      />
    );
  const tasks = [...state.tasks]
    .reverse()
    .filter(
      (t) =>
        t.title.toLowerCase().includes(query.toLowerCase().trim()) &&
        (filter === "all" || jobCategory(state, t) === filter),
    );
  const shared = (state.operations ?? []).filter((op) => (filter === "all" || operationCategory(op, now) === filter) && `${op.title} ${op.summary} ${op.context} ${op.references.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const shown = tasks.length + shared.length;
  return (
    <>
      <div className="page-heading">
        <h2>Jobs</h2>
        <span className="muted">
          {shown} {filter === "all" && !query ? "total" : "shown"}
        </span>
      </div>
      <label className="search-field">
        <Icon name="research" size={16} />
        <input
          type="search"
          placeholder="Search jobs"
          aria-label="Search jobs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="icon-button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </label>
      <label className="category-select">
        <span>Category</span>
        <select
          aria-label="Job category"
          value={filter}
          onChange={(e) => onFilter(e.target.value as JobFilter)}
        >
          {JOB_CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label} (
              {category.id === "all"
                ? state.tasks.length + (state.operations?.length ?? 0)
                : state.tasks.filter(
                    (t) => jobCategory(state, t) === category.id,
                  ).length + (state.operations ?? []).filter((op) => operationCategory(op, now) === category.id).length}
              )
            </option>
          ))}
        </select>
      </label>
      <WorkBoard state={state} now={now} connected={ledger.connection === "online"} query={query} filter={filter}/>
      {!pinSet && (
        <p className="notice">
          Set up your owner PIN before reviewing work. Open the installer’s
          setup page.
        </p>
      )}
      {JOB_CATEGORIES.filter(
        (c) => c.id !== "all" && (filter === "all" || c.id === filter),
      ).map((category) => {
        const group = tasks.filter(
          (t) => jobCategory(state, t) === category.id,
        );
        if (!group.length) return null;
        return (
          <section
            className="job-group"
            key={category.id}
            aria-label={`${category.label} jobs`}
          >
            <div className="subheading">
              <h3>{category.label}</h3>
              <span className="micro">{group.length}</span>
            </div>
            <div className="row-list">
              {group.map((t) => (
                <button
                  className="job-row"
                  id={`job-${t.id}`}
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                >
                  <span className={`row-indicator ${taskTone(state, t)}`} />
                  <span className="row-copy">
                    <strong>{t.title}</strong>
                    <small>
                      {stageLabel(state, t)} · {timeAgo(t.updatedAt, now)}
                    </small>
                  </span>
                  <span className={`badge ${taskTone(state, t)}`}>
                    {taskState(state, t)}
                  </span>
                  <Icon name="chevron" size={14} />
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {!shown && (
        <div className="empty-state">
          <Icon name="work" size={25} />
          <h3>
            {query
              ? "No matching jobs"
              : {
                  all: "No jobs yet",
                  approval: "Nothing to approve",
                  login: "No sign-in issues",
                  blocked: "No blocked jobs",
                  active: "No jobs in progress",
                  waiting: "No jobs waiting",
                  paused: "No paused jobs",
                  done: "No completed jobs",
                }[filter]}
          </h3>
          <p>
            {query
              ? "Try another search or clear the filters."
              : filter === "all"
                ? "Start with a research notebook in Lab."
                : filter === "login"
                  ? "Jobs that need you to sign in will appear here."
                  : "Choose another category to see more work."}
          </p>
          {filter === "all" && !query && (
            <button onClick={onResearch}>
              Open Lab <Icon name="arrow" size={15} />
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function JobDetail({
  task,
  state,
  ledger,
  now,
  onBack,
  onResearch,
}: {
  task: Task;
  state: FacilityState;
  ledger: RemoteFacility;
  now: number;
  onBack: () => void;
  onResearch: () => void;
}) {
  const approval = state.approvals.find(
    (a) => a.taskId === task.id && a.status === "pending",
  );
  const failed = approval?.kind === "failure";
  const operator = state.operator?.active ?? "claude";
  const summary = failed
    ? failureSummary(approval.flags[0]?.message ?? "", operator)
    : null;
  const stages =
    state.wings
      .find((w) => w.id === task.wingId)
      ?.workflows.find((w) => w.id === task.workflowId)?.stages ?? [];
  const stage = stages[task.stageIndex];
  const retryModel =
    stage?.job === "write" || stage?.job === "brief"
      ? MODELS[operator].name
      : null;
  return (
    <>
      <button className="back-button" onClick={onBack}>
        <Icon name="back" size={16} />
        Back to jobs
      </button>
      <div className="detail-heading">
        <span className={`badge ${taskTone(state, task)}`}>
          {taskState(state, task)}
        </span>
        <h2 id="job-heading" tabIndex={-1}>
          {task.title}
        </h2>
        <p>
          {stageLabel(state, task)} · updated {timeAgo(task.updatedAt, now)}
        </p>
      </div>
      {summary && (
        <div className="notice">
          <strong>{summary.title}</strong>
          <p>{summary.detail}</p>
        </div>
      )}
      {task.waiting && <p className="notice">{task.waiting}</p>}
      {task.workflowId === "artwork-pilot" && <ResearchTrail brief={task.brief} />}
      {task.artworkRequest && !task.artwork && <section className="draft">
        <h3>Artwork brief ready</h3>
        <p>The product direction has been selected. This job is waiting for its generated image through the Codex handoff.</p>
        <details className="disclosure"><summary>Creative brief · version {task.artworkRequest.revision}</summary><p className="artwork-prompt">{task.artworkRequest.prompt}</p></details>
      </section>}
      <dl className="facts">
        <div>
          <dt>Model{task.state === "done" ? " used" : ""}</dt>
          <dd>{task.model ? MODELS[task.model].name : "Not assigned"}</dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd>
            {task.state === "done"
              ? stages.length
              : Math.min(task.stageIndex + 1, stages.length)}{" "}
            of {stages.length} steps
          </dd>
        </div>
      </dl>
      {approval?.content ? <DraftPreview content={approval.content} /> : task.draft?.kind === "artwork" && <DraftPreview content={JSON.stringify(task.draft)} />}
      {approval && (
        <ApprovalActions
          approval={approval}
          ledger={ledger}
          now={now}
          retryModel={retryModel}
        />
      )}
      {task.workflowId === "research-test" && task.state === "done" && (
        <button className="primary" onClick={onResearch}>
          Read findings in Lab <Icon name="arrow" size={15} />
        </button>
      )}
      <details className="disclosure">
        <summary>Workflow</summary>
        <ol className="stage-track">
          {stages.map((s, i) => (
            <li
              key={s.id}
              className={
                task.state === "done" || i < task.stageIndex
                  ? "finished"
                  : i === task.stageIndex
                    ? "current"
                    : ""
              }
            >
              <span>
                {i < task.stageIndex || task.state === "done" ? (
                  <Icon name="check" size={12} />
                ) : (
                  i + 1
                )}
              </span>
              {s.label}
              {task.state !== "done" && i === task.stageIndex && (
                <small>Current</small>
              )}
            </li>
          ))}
        </ol>
      </details>
      {task.notes.length > 0 && (
        <details className="disclosure">
          <summary>
            Saved work <span className="muted">{task.notes.length}</span>
          </summary>
          <ol className="notes">
            {task.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ol>
        </details>
      )}
      {failed && (
        <details className="disclosure technical">
          <summary>Diagnostics</summary>
          <pre>{approval.flags.map((f) => f.message).join("\n")}</pre>
        </details>
      )}
    </>
  );
}

export function ApprovalActions({
  approval,
  ledger,
  now,
  retryModel,
}: {
  approval: Approval;
  ledger: RemoteFacility;
  now: number;
  retryModel?: string | null;
}) {
  const [feedback, setFeedback] = useState("");
  const artwork = approval.content ? (() => { try { return JSON.parse(approval.content).kind === "artwork"; } catch { return false; } })() : false;
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
              This approval expired. Request a revision to create a fresh
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
            {retryModel ? `Retry with ${retryModel}` : "Retry step"}
          </button>
        ) : (
          <>
            <button
              className="primary"
              disabled={blocked || stale}
              title={
                blocked
                  ? "Resolve blocking findings before approval"
                  : stale
                    ? "Approval expired"
                    : "Approve this exact package"
              }
              onClick={() => ledger.decide(approval.id, true)}
            >
              <Icon name="check" size={16} />
              {artwork ? "Accept artwork" : "Approve package"}
            </button>
            <button onClick={() => ledger.decide(approval.id, false, artwork ? feedback : undefined)}>
              Request revision
            </button>
          </>
        )}
      </div>
      {artwork && approval.kind !== "failure" && <label className="revision-field">What should change?
        <textarea value={feedback} maxLength={1000} placeholder="Describe any changes to composition, colors, details or overall style." onChange={(e) => setFeedback(e.target.value)} />
      </label>}
      <p className="micro">
        Owner PIN required.{" "}
        {approval.kind === "failure"
          ? "Saved work is retained."
          : "Approval applies only to the package shown above."}
      </p>
    </>
  );
}
function ResearchTrail({ brief }: { brief?: string }) {
  let idea;
  try { idea = JSON.parse(brief ?? "null"); } catch { return null; }
  if (!idea || typeof idea.idea !== "string") return null;
  const selection = idea.selection;
  const sources = RESEARCH_SOURCES.filter((s) => Array.isArray(selection?.sourceIds) && selection.sourceIds.includes(s.id));
  return <details className="disclosure" open>
    <summary>Research behind this artwork</summary>
    <p>{idea.idea}</p>
    {typeof selection?.candidateTitle === "string" && <p><strong>Automatically selected:</strong> {selection.candidateTitle}</p>}
    {typeof selection?.reason === "string" && <p>{selection.reason}</p>}
    <div className="source-links">{sources.map((s) => <a key={s.id} href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a>)}</div>
    <p className="micro">A concept based on saved public evidence. Current sales, competitor prices and supplier costs have not been checked.</p>
  </details>;
}

function DraftPreview({ content }: { content: string }) {
  let draft: Draft;
  try {
    draft = JSON.parse(content);
  } catch {
    return <pre className="draft">{content}</pre>;
  }
  return draft.kind === "artwork" ? (
    <section className="draft artwork-review">
      <span className="eyebrow">ARTWORK QUALITY REVIEW · VERSION {draft.revision}</span>
      <a href={`/api/designs/${draft.design}`} target="_blank" rel="noreferrer"><img className="artwork-full" src={`/api/designs/${draft.design}`} alt={`Artwork for ${draft.title}`} /></a>
      <h3>{draft.title}</h3>
      <p>{draft.width} × {draft.height} pixels · PNG · <a href={`/api/designs/${draft.design}`} target="_blank" rel="noreferrer">Open full image ↗</a></p>
      <p>Check composition, subject details, unwanted marks, colors and whether you would want this in your shop.</p>
      {draft.inspection ? <div className="notice">
        <p>Pixel inspection: {draft.inspection.transparentPixels.toLocaleString()} fully transparent · {draft.inspection.semiTransparentPixels.toLocaleString()} partly transparent.</p>
        {draft.inspection.visibleBounds && <p>Visible artwork: {draft.inspection.visibleBounds.width} × {draft.inspection.visibleBounds.height} pixels. At an example 300 PPI: {(draft.inspection.visibleBounds.width / 300).toFixed(1)} × {(draft.inspection.visibleBounds.height / 300).toFixed(1)} inches. This does not verify source sharpness or supplier suitability.</p>}
      </div> : <p className="notice">Alpha and visible bounds have not been recorded for this historical image.</p>}
      <p className="micro">Concept image. Exact product dimensions, placement, variant contrast and supplier mockups still need checking. Accepting archives this image; nothing is published.</p>
      <details className="disclosure"><summary>Creative brief and image fingerprint</summary><p className="artwork-prompt">{draft.prompt}</p><code className="artwork-hash">{draft.design}</code></details>
    </section>
  ) : draft.kind === "listing" ? (
    <section className="draft">
      <span className="eyebrow">PACKAGE FOR REVIEW</span>
      {draft.design && (
        <img
          className="draft-design"
          src={`/api/designs/${encodeURIComponent(draft.design)}`}
          alt={`Artwork for ${draft.title}`}
        />
      )}
      <h3>{draft.title}</h3>
      <strong>{draft.priceUsd === null ? "Price unverified" : money(draft.priceUsd)}</strong>
      <p>{draft.description}</p>
      <div className="tag-list">
        {draft.tags.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </section>
  ) : draft.kind === "reply" ? (
    <section className="draft">
      <span className="eyebrow">REPLY FOR REVIEW</span>
      <p>{draft.message}</p>
    </section>
  ) : (
    <pre className="draft">{content}</pre>
  );
}
