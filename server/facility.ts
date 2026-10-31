import { Ledger } from "../src/core/ledger";
import type { Control } from "../src/core/port";
import { assertSafeWorkflows } from "../src/core/policy";
import { assertSafeAgents } from "../src/core/capabilities";
import { initialState, rooms, wings } from "../src/core/seed";
import { DemoSimulation } from "../src/sim/demo";
import { OwnerGate } from "./owner";
import type { Store } from "./store";

const TICK_MS = 200;

/** Whoever does the work: the demo simulation, or the real crew. */
export interface Crew {
  tick(dt: number): void;
  checkHealth?(): void;
  setPaused?(paused: boolean): void;
}
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
  private crew: Crew;
  private control: Control;
  private timer: NodeJS.Timeout | null = null;
  private dirty = false;
  private lastSave = 0;
  private controlListeners = new Set<() => void>();

  /** Without a real crew, the facility runs the labelled demo. */
  constructor(
    private store: Store,
    realCrew?: (ledger: Ledger) => Crew,
  ) {
    // Wings and rooms are configuration, not data: always take them from the
    // code, and refuse to start if any workflow breaks the safety policy.
    assertSafeWorkflows(wings);
    const configured = initialState();
    assertSafeAgents(wings, configured.agents);
    const saved = store.load();
    const recovered = saved ? Ledger.recover(saved) : undefined;
    // Saved records hold progress, never permissions. New code actors are added;
    // stale/unknown identities disappear and only the owner's pause is retained.
    const agents = configured.agents.map((agent) => ({
      ...agent,
      status: recovered?.agents.find((a) => a.id === agent.id)?.status === "paused" ? "paused" as const : "idle" as const,
    }));
    // Workflow edits migrate by stage identity, preserving stopped drafts and approvals.
    const tasks = recovered?.tasks.map((task) => {
      const oldStage = saved!.wings.find((w) => w.id === task.wingId)?.workflows.find((w) => w.id === task.workflowId)?.stages[task.stageIndex]?.id;
      const stages = wings.find((w) => w.id === task.wingId)?.workflows.find((w) => w.id === task.workflowId)?.stages;
      const index = stages?.findIndex((s) => s.id === oldStage) ?? -1;
      return index >= 0 ? { ...task, stageIndex: index } : task;
    });
    this.ledger = new Ledger(recovered ? { ...recovered, businessGoal: recovered.businessGoal ?? configured.businessGoal, wings, rooms, agents, tasks: tasks! } : configured);
    this.crew = realCrew ? realCrew(this.ledger) : new DemoSimulation(this.ledger);
    this.control = { running: true, speed: 1, mode: realCrew ? "live" : "demo" };
    this.owner = new OwnerGate(store);
    // A pause is the kill switch, so it survives a restart: if the owner
    // stopped the facility, it stays stopped until they start it again.
    if (store.getSetting("paused") === "true") this.control = { ...this.control, running: false };
    this.crew.setPaused?.(!this.control.running);
    let savedAttempts = this.ledger.getState().etsyPublishAttempts;
    this.ledger.subscribe(() => {
      this.dirty = true;
      const attempts = this.ledger.getState().etsyPublishAttempts;
      if (attempts !== savedAttempts) {
        // Publishing cannot start until its reservation is durable. If SQLite
        // fails, propagate the error; no actor is assigned and no call runs.
        this.save();
        savedAttempts = attempts;
      }
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
    this.ledger.expireOperations();
    this.crew.checkHealth?.();
    // Speed only makes sense for the demo; real models take the time they take.
    if (this.control.running) this.crew.tick(this.control.mode === "demo" ? dt * this.control.speed : dt);
    if (this.dirty && Date.now() - this.lastSave >= SAVE_EVERY_MS) this.save();
  }

  save() {
    if (!this.dirty) return;
    this.store.save(this.ledger.getState());
    this.dirty = false;
    this.lastSave = Date.now();
  }

  getControl = () => ({ ...this.control, automaticProducts: this.control.mode === "live" && this.store.getSetting("automatic_products") === "true" });

  setControl(patch: Partial<Control>) {
    if (patch.running === false) this.ledger.stopOperations("Owner paused the facility. Saved handoff retained.");
    const next = { ...this.control };
    if (typeof patch.running === "boolean") next.running = patch.running;
    if (typeof patch.speed === "number" && SPEEDS.includes(patch.speed)) next.speed = patch.speed;
    if (next.running !== this.control.running) {
      this.crew.setPaused?.(!next.running);
      if (!next.running) this.ledger.interruptActive();
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

  handoff(active: "claude" | "codex", expectedGeneration: number) {
    const ok = this.ledger.handoff(active, expectedGeneration, "Owner requested a handover.");
    if (ok) this.save();
    return ok;
  }

  /** Explicit, recoverable housekeeping; this never approves, resumes or publishes. */
  resetQueue(id: string, reason: string) {
    const prior = this.store.queueArchive(id);
    if (prior) return { archive: prior, alreadyApplied: true };
    const archive = this.ledger.resetQueue(id, reason, (record, next) => this.store.saveQueueReset(record, next));
    this.save();
    return { archive, alreadyApplied: false };
  }

  queueArchive(id: string) {
    return this.store.queueArchive(id);
  }
}
