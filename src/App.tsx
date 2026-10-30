import { useEffect, useMemo, useState } from "react";
import { RemoteFacility } from "./client/remote";
import { FacilityView } from "./facility/FacilityView";
import type { Selection } from "./facility/render";
import { OwnerDialog, useOwner } from "./ui/OwnerLock";
import { Sidebar, WORKSPACE_TABS, type WorkspaceTab } from "./ui/Sidebar";
import { TopBar } from "./ui/TopBar";
import { Icon } from "./ui/Icon";
import { useFacility } from "./ui/useFacility";
import type { JobFilter } from "./ui/presentation";
export function App() {
  const facility = useMemo(() => new RemoteFacility(), []);
  useFacility(facility);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [jobFilter, setJobFilter] = useState<JobFilter>("all");
  const [jobId, setJobId] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("command");
  const [now, setNow] = useState(Date.now());
  const owner = useOwner(facility, now);
  useEffect(() => {
    facility.start();
    return () => facility.stop();
  }, [facility]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      if (event.key === "Escape") {
        setSelection(null);
        setJobId(null);
      }
      if (
        (event.target as HTMLElement)?.matches(
          "input, textarea, select, [contenteditable]",
        )
      )
        return;
      if (event.altKey && /^[1-5]$/.test(event.key)) {
        event.preventDefault();
        setJobFilter("all");
        const next = WORKSPACE_TABS[Number(event.key) - 1].id;
        setTab(next);
        document.getElementById(`tab-${next}`)?.focus();
        setSelection(null);
        setJobId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  if (!facility.ready())
    return (
      <div className="boot">
        <span className="brand-mark">
          <Icon name="command" size={32} />
        </span>
        <h1>AI Facility</h1>
        <p role="status">
          {facility.connection === "offline"
            ? "Waiting for the local server. Reconnecting…"
            : "Connecting to the facility…"}
        </p>
      </div>
    );
  const state = facility.getState();
  const control = facility.getControl();
  const changeTab = (next: WorkspaceTab) => {
    setJobFilter("all");
    setSelection(null);
    setJobId(null);
    setTab(next);
  };
  const selectMap = (next: Selection | null) => {
    setJobId(null);
    setSelection(next);
  };
  const openJobs = (filter: JobFilter) => {
    changeTab("work");
    setJobFilter(filter);
  };
  const selectJob = (id: string | null) => {
    setSelection(null);
    setTab("work");
    setJobId(id);
  };
  return (
    <div className="app">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      {facility.connection === "offline" && (
        <div className="offline-banner" role="alert">
          Connection lost. Showing your last saved view; reconnecting…
        </div>
      )}
      <TopBar
        state={state}
        running={control.running}
        speed={control.speed}
        mode={control.mode}
        owner={owner}
        now={now}
        onToggleRunning={() =>
          facility.setControl({ running: !control.running })
        }
        onSpeed={(speed) => facility.setControl({ speed })}
        connected={facility.connection === "online"}
        onWork={() => changeTab("work")}
      />
      {facility.commandError && (
        <div className="error-banner" role="alert">
          <Icon name="help" size={17} />
          <span>{facility.commandError}</span>
          <button
            className="icon-button"
            onClick={() => facility.clearError()}
            aria-label="Dismiss message"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <main className="main" id="workspace">
        <section className="map-panel" aria-label="Live facility map">
          <FacilityView
            ledger={facility}
            selection={selection}
            onSelect={selectMap}
          />
        </section>
        <Sidebar
          ledger={facility}
          state={state}
          now={now}
          live={control.mode === "live"}
          running={control.running}
          pinSet={owner.status?.pinSet ?? true}
          tab={tab}
          onTab={changeTab}
          jobId={jobId}
          jobFilter={jobFilter}
          onJobFilter={setJobFilter}
          onJobs={openJobs}
          onJobSelect={selectJob}
          selection={selection}
          onSelect={selectMap}
        />
      </main>
      <OwnerDialog owner={owner} />
    </div>
  );
}
