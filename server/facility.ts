import { Ledger } from "../src/core/ledger";
import type { Control } from "../src/core/port";
import { assertSafeWorkflows } from "../src/core/policy";
import { initialState, rooms, wings } from "../src/core/seed";
import { DemoSimulation } from "../src/sim/demo";
import { OwnerGate } from "./owner";
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
  /** Proof that a decision comes from the owner. */
  readonly owner: OwnerGate;
  private sim: DemoSimulation;
  private control: Control = { running: true, speed: 1 };
  private timer: NodeJS.Timeout | null = null;
  private dirty = false;
  private lastSave = 0;
  private controlListeners = new Set<() => void>();

  constructor(private store: Store) {
    // Wings and rooms are configuration, not data: always take them from the
    // code, and refuse to start if any workflow breaks the safety policy.
    assertSafeWorkflows(wings);
    const saved = store.load();
    this.ledger = new Ledger(saved ? { ...Ledger.recover(saved), wings, rooms } : initialState());
    this.sim = new DemoSimulation(this.ledger);
    this.owner = new OwnerGate(store);
    // A pause is the kill switch, so it survives a restart: if the owner
    // stopped the facility, it stays stopped until they start it again.
    if (store.getSetting("paused") === "true") this.control = { ...this.control, running: false };
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
    this.store.setSetting("paused", String(!next.running));
    for (const l of this.controlListeners) l();
  }

  onControl(listener: () => void) {
    this.controlListeners.add(listener);
    return () => this.controlListeners.delete(listener);
  }
}
