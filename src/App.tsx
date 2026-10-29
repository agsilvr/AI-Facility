import { useEffect, useMemo, useState } from "react";
import { RemoteFacility } from "./client/remote";
import { FacilityView } from "./facility/FacilityView";
import type { Selection } from "./facility/render";
import { Inspector, Sidebar } from "./ui/Sidebar";
import { TopBar } from "./ui/TopBar";
import { useFacility } from "./ui/useFacility";

export function App() {
  const facility = useMemo(() => new RemoteFacility(), []);
  useFacility(facility);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [now, setNow] = useState(Date.now());

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
          <FacilityView ledger={facility} selection={selection} onSelect={setSelection} />
          {selection && <Inspector state={state} selection={selection} onClose={() => setSelection(null)} />}
        </section>
        <Sidebar ledger={facility} state={state} now={now} onSelect={setSelection} />
      </main>
    </div>
  );
}
