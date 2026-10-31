import type { FacilityState } from "../core/types";
import { WORK_PHASES, workStatus } from "../core/operations";
import { MODELS } from "../core/models";
import { timeAgo } from "./format";
import { Icon } from "./Icon";
import { operationCategory, type JobFilter } from "./presentation";

export function WorkBoard({ state, now, roomId, agentId, connected = true, query = "", filter = "all" }: { state: FacilityState; now: number; roomId?: string; agentId?: string; connected?: boolean; query?: string; filter?: JobFilter }) {
  const work = [...(state.operations ?? [])].reverse().filter((op) =>
    (!roomId || WORK_PHASES[op.phase].roomId === roomId || op.history.some((event) => WORK_PHASES[event.phase].roomId === roomId))
    && (!agentId || WORK_PHASES[op.phase].agentId === agentId)
    && (filter === "all" || operationCategory(op, now) === filter)
    && `${op.title} ${op.summary} ${op.context} ${op.references.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(workStatus(b, now) === "running") - Number(workStatus(a, now) === "running"));
  if (!work.length) return null;
  return <section className="work-board" aria-label="Shared live work">
    <div className="subheading"><h3>Shared work</h3><span className="micro">One saved handoff</span></div>
    {work.map((op) => {
      const offline = !connected && op.status === "running";
      const status = offline ? "blocked" : workStatus(op, now);
      const label = status === "running" ? "In progress" : status === "blocked" ? "Stopped" : status === "done" ? "Completed" : status === "paused" ? "Paused" : "Waiting";
      return <details key={op.id} className={`work-card ${status}`} open={status !== "done"}>
        <summary><span className={`work-beacon ${status}`} aria-hidden="true"><Icon name={status === "done" ? "check" : status === "paused" ? "pause" : status === "blocked" ? "help" : "work"} size={17}/></span>
          <span className="row-copy"><strong>{op.title}</strong><small>{WORK_PHASES[op.phase].label} · {MODELS[op.worker].name} · {op.phase === "maintenance" ? "Maintenance" : "Official app / chat"}</small></span>
          <span className={`badge ${status === "done" ? "sage" : status === "running" ? "" : "amber"}`}>{label}</span></summary>
        <div className="work-card-body">
          <p>{offline ? "Facility connection lost. Showing saved work; live activity is unverified." : status === "blocked" && op.status === "running" ? "Worker heartbeat lost. Reconnect before continuing." : op.summary}</p>
          {status === "running" && <p className="heartbeat"><i/> Live heartbeat · {timeAgo(op.heartbeatAt, now)} · no estimated percentage</p>}
          {op.nextStep && <div className="handoff-note"><span className="micro">NEXT STEP</span><p>{op.nextStep}</p></div>}
          <details className="disclosure"><summary>Saved context & history · version {op.revision}</summary>
            {op.context && <p className="saved-context">{op.context}</p>}
            {op.references.length > 0 && <ul className="work-references">{op.references.map((ref) => <li key={ref}>{ref}</li>)}</ul>}
            <ol className="work-history">{op.history.slice(-12).map((event, i) => <li key={i}><span className={`event-dot ${event.status === "done" ? "success" : event.status === "blocked" ? "warning" : "info"}`}/><span><strong>{WORK_PHASES[event.phase].label} · {event.status}</strong><small>{timeAgo(event.at, now)} · {MODELS[event.worker as keyof typeof MODELS]?.name ?? event.worker}</small><p>{event.summary}</p></span></li>)}</ol>
          </details>
        </div>
      </details>;
    })}
  </section>;
}
