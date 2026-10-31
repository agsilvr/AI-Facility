import { readResearch, RESEARCH_SOURCES, currentResearch } from "../core/research";
import type { FacilityState } from "../core/types";
import type { RemoteFacility } from "../client/remote";
import { Icon } from "./Icon";

export function Lab({
  state,
  ledger,
  live,
  running,
  onJobs,
}: {
  state: FacilityState;
  ledger: RemoteFacility;
  live: boolean;
  running: boolean;
  onJobs: (id?: string) => void;
}) {
  const tasks = state.tasks.filter((t) => t.workflowId === "research-test");
  const open = tasks.find((t) => t.state !== "done");
  const reportTask = [...tasks].reverse().find((t) => readResearch(t.brief));
  const report = readResearch(reportTask?.brief);
  const pilot = [...state.tasks].reverse().find((t) => t.workflowId === "artwork-pilot");
  return (
    <>
      <div className="page-heading">
        <h2>Research</h2>
        <span className="badge">Qwen · local</span>
      </div>
      <p className="section-intro">
        Explore product directions from saved public evidence. Scout prepares a
        notebook when the evidence pack changes, at most once per 24 hours. Repeating a saved pack is not fresh market research.
      </p>
      <section className="artwork-pilot">
        <div className="subheading"><h3>Research → artwork review</h3><span className="badge sage">Human quality check</span></div>
        <p>Qwen selects a direction automatically. Codex generates the artwork through the image handoff, then you review the exact image before anything continues.</p>
        <div className="card-actions">
          <button className="primary" disabled={!live || !running || (!!pilot && pilot.state !== "done")} onClick={() => ledger.runArtworkPilot()}>
            Start artwork pilot <Icon name="arrow" size={15} />
          </button>
          {pilot && <button onClick={() => onJobs(pilot.id)}>Open artwork job <Icon name="arrow" size={15} /></button>}
        </div>
        <p className="micro">No Claude or DeepSeek needed. Acceptance saves the artwork locally; it does not publish a product.</p>
      </section>
      <button
        className="primary"
        disabled={!live || !running || !!open}
        onClick={() => ledger.runResearch()}
      >
        <Icon name={open ? "clock" : "research"} size={16} />
        {open
          ? open.state === "active"
            ? "Researching…"
            : open.state === "awaiting_approval"
              ? "Research blocked"
              : "Research queued"
          : "Run research"}
      </button>
      {!live && (
        <p className="notice">
          Research runs in live mode. This is a simulation.
        </p>
      )}
      {!running && (
        <p className="notice">Resume the facility to run research.</p>
      )}
      {open && (
        <div className="notice" role="status">
          <p>
            {open.state === "awaiting_approval"
              ? "Research stopped. Open the job to review the issue and retry."
              : open.waiting ||
                "The notebook will appear here when Qwen finishes."}
          </p>
          <button className="text-button" onClick={() => onJobs(open.id)}>
            View jobs <Icon name="arrow" size={14} />
          </button>
        </div>
      )}
      {report ? (
        <section className="research-report">
          <div className="subheading">
            <h3>Latest notebook</h3>
            <time
              className="micro"
              dateTime={new Date(reportTask!.updatedAt).toISOString()}
            >
              {new Date(reportTask!.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </time>
          </div>
          {!currentResearch(report) && <p className="notice">Historical notebook · not eligible for new production. Revalidate it against the current evidence contract.</p>}
          <p>{report.summary}</p>
          <div className="opportunity-list">
            {report.opportunities.map((o, i) => (
              <details className="opportunity" key={i}>
                <summary>
                  <span className="opportunity-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{o.title}</strong>
                    <small>{o.audience}</small>
                  </span>
                  <Icon name="chevron" size={15} />
                </summary>
                <div className="detail-content">
                  <p><strong>Proposed concept: </strong>{o.concept}</p>
                  <h4>{report.evidenceVersion === 2 ? "Saved source observations" : "Historical model interpretation · unverified"}</h4>
                  <p>{o.evidence}</p>
                  <div className="source-links">
                    {o.sourceIds.map((id) => {
                      const s = report.sources.find((s) => s.id === id);
                      return s ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          key={id}
                        >
                          {s.title} ↗
                        </a>
                      ) : null;
                    })}
                  </div>
                  <h4>Next step</h4>
                  <p>{o.nextStep}</p>
                </div>
              </details>
            ))}
          </div>
          <details className="disclosure">
            <summary>Validation needed</summary>
            <ul>
              {report.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              <li>
                Competitor prices, supplier costs, shipping and margins have not
                been verified.
              </li>
            </ul>
          </details>
        </section>
      ) : (
        <div className="empty-state">
          <Icon name="research" size={25} />
          <h3>No notebook yet</h3>
          <p>
            Run research to get three directions with sources and next steps.
          </p>
        </div>
      )}
      <details className="disclosure">
        <summary>
          <Icon name="link" size={15} />
          Sources & method
        </summary>
        <p className="micro">
          Saved evidence checked October 30, 2026. Qwen analyzes these sources;
          live web collection and automated Etsy access are not connected.
        </p>
        <div className="source-list">
          {RESEARCH_SOURCES.map((s) => (
            <a href={s.url} key={s.id} target="_blank" rel="noreferrer">
              <strong>{s.title} ↗</strong>
              <small>{s.notes}</small>
            </a>
          ))}
        </div>
      </details>
    </>
  );
}
