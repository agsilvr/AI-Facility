import { Ledger } from "../src/core/ledger";
import type { Control } from "../src/core/port";
import { initialState } from "../src/core/seed";
import { DemoSimulation } from "../src/sim/demo";
import type { Store } from "./store";

const TICK_MS = 200;
const SAVE_EVERY_MS = 2000;
const SPEEDS = [1, 2, 4];

/**
 * The running facility: owns the ledger, drives the crew on a timer whether or
 * not anyone has the page open, and saves to disk shortly after every change.
 */
export class Facility {
  readonly ledger: Ledger;
  private sim: DemoSimulation;
  private control: Control = { running: true, speed: 1 };
  private timer: NodeJS.Timeout | null = null;
  private dirty = false;
  private lastSave = 0;
  private controlListeners = new Set<() => void>();

  constructor(private store: Store) {
    const saved = store.load();
    this.ledger = new Ledger(saved ? Ledger.recover(saved) : initialState());
    this.sim = new DemoSimulation(this.ledger);
    this.ledger.subscribe(() => {
      this.dirty = true;
    });
    this.dirty = true;
  }

  start() {
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.save();
  }

  tick(dt = TICK_MS / 1000) {
    if (this.control.running) this.sim.tick(dt * this.control.speed);
    if (this.dirty && Date.now() - this.lastSave >= SAVE_EVERY_MS) this.save();
  }

  save() {
    if (!this.dirty) return;
    this.store.save(this.ledger.getState());
    this.dirty = false;
    this.lastSave = Date.now();
  }

  getControl = () => this.control;

  setControl(patch: Partial<Control>) {
    const next = { ...this.control };
    if (typeof patch.running === "boolean") next.running = patch.running;
    if (typeof patch.speed === "number" && SPEEDS.includes(patch.speed)) next.speed = patch.speed;
    if (next.running !== this.control.running) {
      this.ledger.log(next.running ? "Facility resumed" : "Facility paused by owner", "info");
    }
    this.control = next;
    for (const l of this.controlListeners) l();
  }

  onControl(listener: () => void) {
    this.controlListeners.add(listener);
    return () => this.controlListeners.delete(listener);
  }
}
