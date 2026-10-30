import { useEffect, useMemo, useState } from "react";
import { RemoteFacility } from "./client/remote";
import { FacilityView } from "./facility/FacilityView";
import type { Selection } from "./facility/render";
import { OwnerDialog, useOwner } from "./ui/OwnerLock";
import { Sidebar, WORKSPACE_TABS, type WorkspaceTab } from "./ui/Sidebar";
import { TopBar } from "./ui/TopBar";
import { Icon } from "./ui/Icon";
import { useFacility } from "./ui/useFacility";
export function App() {
  const facility = useMemo(() => new RemoteFacility(), []);
  useFacility(facility);
  const [selection, setSelection] = useState<Selection | null>(null);
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
      if (event.key === "Escape") setSelection(null);
      if (
        (event.target as HTMLElement)?.matches(
          "input, textarea, select, [contenteditable]",
        )
      )
        return;
      if (event.altKey && /^[1-5]$/.test(event.key)) {
        event.preventDefault();
        setTab(WORKSPACE_TABS[Number(event.key) - 1].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  if (!facility.ready())
    return (
      <div className="boot">
        <span className="brand-mark">
          <Icon name="leaf" size={32} />
        </span>
        <h1>Welcome to the facility.</h1>
        <p role="status">
          {facility.connection === "offline"
            ? "Waiting for the local server. Reconnecting…"
            : "Opening your workspace…"}
        </p>
      </div>
    );
  const state = facility.getState();
  const control = facility.getControl();
  const working = state.agents.filter((a) => a.status === "working").length;
  const startResearch = () => {
    setTab("research");
    setSelection(null);
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
        onResearch={startResearch}
        onWork={() => setTab("work")}
      />
      <main className="main" id="workspace">
        <section className="map-panel" aria-label="Live facility map">
          <div className="scene-heading">
            <div>
              <span className="eyebrow">THE FACILITY / ETSY WING</span>
              <h2>
                Your business, taking shape<span>.</span>
              </h2>
              <p>
                A living workspace. Select a room or crew member to look closer.
              </p>
            </div>
            <div className="scene-stats">
              <span className="crew-cluster">
                <i />
                <i />
                <i />
              </span>
              <span>
                <strong>
                  {working} of {state.agents.length}
                </strong>
                <small>crew at work</small>
              </span>
            </div>
          </div>
          <div className="map-frame">
            <FacilityView
              ledger={facility}
              selection={selection}
              onSelect={(s) => {
                setSelection(s);
              }}
            />
            <div className="map-caption">
              <span>
                <i />
                {control.mode === "demo" ? "SIMULATION" : "LIVE FACILITY"}
              </span>
              <span>
                {control.running
                  ? working
                    ? "Work is in motion"
                    : "Crew ready · waiting for assignments"
                  : "Paused · jobs safely held"}
              </span>
              <span className="map-caption-right">
                <Icon name="shield" size={13} /> Approval protected
              </span>
            </div>
          </div>
          <div className="scene-footer">
            <span>
              <Icon name="leaf" size={15} /> Built for a little more
              possibility.
            </span>
            <details className="map-help">
              <summary>
                <Icon name="help" size={15} />
                Map & keyboard guide
              </summary>
              <div>
                <strong>Make yourself at home</strong>
                <p>
                  Drag to explore. Scroll or pinch to zoom. Select a room or
                  person for details.
                </p>
                <p>
                  Arrow keys pan the focused map. + / − zoom. Escape closes
                  details. Option 1–5 changes workspace sections.
                </p>
                <p>
                  Use Fit facility to return to the whole map. Your controls
                  never publish without approval.
                </p>
              </div>
            </details>
          </div>
        </section>
        <Sidebar
          ledger={facility}
          state={state}
          now={now}
          live={control.mode === "live"}
          running={control.running}
          pinSet={owner.status?.pinSet ?? true}
          tab={tab}
          onTab={setTab}
          selection={selection}
          onSelect={setSelection}
        />
      </main>
      {facility.commandError && (
        <div className="command-toast" role="alert">
          <Icon name="help" size={20} />
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
      <OwnerDialog owner={owner} />
    </div>
  );
}
