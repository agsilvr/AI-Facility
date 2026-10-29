import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { RemoteFacility } from "./client/remote";
import { FacilityView } from "./facility/FacilityView";
import type { Selection } from "./facility/render";
import { Inspector, Sidebar } from "./ui/Sidebar";
import { TopBar } from "./ui/TopBar";
import { useFacility } from "./ui/useFacility";

// The 3D engine is large, so it loads separately and the rest of the screen doesn't wait for it.
const Facility3DView = lazy(() => import("./facility3d/Facility3DView").then((m) => ({ default: m.Facility3DView })));

/** If the 3D view fails for any reason, hand over to the 2D map instead of a blank panel. */
class FallBack extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type ViewMode = "3d" | "2d";
const VIEW_KEY = "facility.view";

// Which map the owner prefers is a per-browser convenience; nothing depends on it.
function savedView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === "2d" ? "2d" : "3d";
  } catch {
    return "3d";
  }
}

export function App() {
  const facility = useMemo(() => new RemoteFacility(), []);
  useFacility(facility);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState<ViewMode>(savedView);
  const [no3d, setNo3d] = useState(false);
  const chooseView = (mode: ViewMode) => {
    setView(mode);
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // Private window or blocked storage: the choice just won't be remembered.
    }
  };
  const fallBackTo2d = useCallback(() => setNo3d(true), []);

  useEffect(() => {
    facility.start();
    return () => facility.stop();
  }, [facility]);

  // Keeps "2m ago" labels fresh between server updates.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!facility.ready()) {
    return (
      <div className="boot">
        <p>{facility.connection === "offline" ? "Can't reach the facility server. Retrying…" : "Connecting to the facility…"}</p>
      </div>
    );
  }

  const state = facility.getState();
  const control = facility.getControl();

  return (
    <div className="app">
      {facility.connection === "offline" && (
        <div className="offline-banner" role="alert">
          Lost connection to the facility server. Showing the last known state; reconnecting…
        </div>
      )}
      <TopBar
        state={state}
        running={control.running}
        speed={control.speed}
        onToggleRunning={() => facility.setControl({ running: !control.running })}
        onSpeed={(speed) => facility.setControl({ speed })}
      />
      <main className="main">
        <section className="map-panel">
          <div className="view-switch" role="group" aria-label="Map view">
            <button type="button" className={view === "3d" && !no3d ? "active" : ""} disabled={no3d} onClick={() => chooseView("3d")}>
              3D
            </button>
            <button type="button" className={view === "2d" || no3d ? "active" : ""} onClick={() => chooseView("2d")}>
              2D
            </button>
            {no3d && <span className="muted">3D isn't available on this computer</span>}
          </div>
          {view === "3d" && !no3d ? (
            <FallBack onError={fallBackTo2d}>
              <Suspense fallback={<p className="empty">Loading the 3D facility…</p>}>
                <Facility3DView ledger={facility} selection={selection} onSelect={setSelection} onUnsupported={fallBackTo2d} />
              </Suspense>
            </FallBack>
          ) : (
            <FacilityView ledger={facility} selection={selection} onSelect={setSelection} />
          )}
          {selection && <Inspector state={state} selection={selection} onClose={() => setSelection(null)} />}
        </section>
        <Sidebar ledger={facility} state={state} now={now} onSelect={setSelection} />
      </main>
    </div>
  );
}
