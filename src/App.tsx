import { useEffect, useMemo, useState } from "react";
import { Ledger } from "./core/ledger";
import { initialState } from "./core/seed";
import { FacilityView } from "./facility/FacilityView";
import type { Selection } from "./facility/render";
import { DemoSimulation } from "./sim/demo";
import { Inspector, Sidebar } from "./ui/Sidebar";
import { TopBar } from "./ui/TopBar";
import { useLedger } from "./ui/useLedger";

const TICK_MS = 100;

export function App() {
  const ledger = useMemo(() => new Ledger(initialState()), []);
  const sim = useMemo(() => new DemoSimulation(ledger), [ledger]);
  const state = useLedger(ledger);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      if (running) sim.tick((TICK_MS / 1000) * speed);
      setNow(Date.now());
    }, TICK_MS);
    return () => clearInterval(id);
  }, [sim, running, speed]);

  return (
    <div className="app">
      <TopBar
        state={state}
        running={running}
        speed={speed}
        onToggleRunning={() => setRunning((r) => !r)}
        onSpeed={setSpeed}
      />
      <main className="main">
        <section className="map-panel">
          <FacilityView ledger={ledger} selection={selection} onSelect={setSelection} />
          {selection && <Inspector state={state} selection={selection} onClose={() => setSelection(null)} />}
        </section>
        <Sidebar ledger={ledger} state={state} now={now} onSelect={setSelection} />
      </main>
    </div>
  );
}
