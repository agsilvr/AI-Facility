import { describe, expect, it } from "vitest";
import { dispatch } from "../core/dispatch";
import { Ledger } from "../core/ledger";
import { initialState, rooms } from "../core/seed";
import { buildLayout, contains } from "./layout";
import { pendingApprovals, roomNeedsAttention, roomOfTask, tasksInRoom } from "./status";
import { targetFor } from "./targets";

function ledgerWithPendingReply() {
  let t = 1_000;
  const ledger = new Ledger(initialState(), () => t++);
  const task = ledger.createTask("etsy", "message", "Shipping question");
  dispatch(ledger);
  ledger.work(task.id, 1, 0);
  ledger.finishStage(task.id, "drafted", { draft: { kind: "reply", message: "Thanks, it ships tomorrow." } });
  return { ledger, taskId: task.id };
}

const room = (id: string) => rooms.find((r) => r.id === id)!;

describe("room status", () => {
  it("finds the room a task is in from its workflow stage", () => {
    const { ledger, taskId } = ledgerWithPendingReply();
    expect(roomOfTask(ledger.getState(), ledger.task(taskId)!)).toBe("etsy-comms");
  });

  it("lights up the room holding work that waits for the owner, and the command center", () => {
    const { ledger } = ledgerWithPendingReply();
    const state = ledger.getState();
    expect(roomNeedsAttention(state, room("etsy-comms"))).toBe(true);
    expect(roomNeedsAttention(state, room("command"))).toBe(true);
    expect(roomNeedsAttention(state, room("etsy-lab"))).toBe(false);
    expect(pendingApprovals(state)).toBe(1);
    expect(tasksInRoom(state, "etsy-comms")).toBe(1);
  });

  it("goes quiet once the owner decides", () => {
    const { ledger } = ledgerWithPendingReply();
    ledger.decide(ledger.getState().approvals[0].id, false);
    const state = ledger.getState();
    expect(roomNeedsAttention(state, room("etsy-comms"))).toBe(false);
    expect(roomNeedsAttention(state, room("command"))).toBe(false);
    expect(pendingApprovals(state)).toBe(0);
  });

  it("shows nothing when nothing is happening", () => {
    const state = initialState();
    for (const r of rooms) {
      expect(roomNeedsAttention(state, r)).toBe(false);
      expect(tasksInRoom(state, r.id)).toBe(0);
    }
  });
});

describe("crew positions", () => {
  const layout = buildLayout(initialState().wings, rooms);

  it("puts each crew member on the floor of the room they're in", () => {
    const state = initialState();
    for (const agent of state.agents) {
      const target = targetFor(state, layout, agent.id)!;
      const rl = layout.rooms.get(agent.roomId)!;
      expect(target.roomId).toBe(agent.roomId);
      expect(contains(rl.floor, target.x, target.y)).toBe(true);
    }
  });

  it("spaces out crew who share a room", () => {
    const state = initialState();
    const sharing = state.agents.filter((a) => a.roomId === "etsy-studio");
    expect(sharing.length).toBeGreaterThan(1);
    const xs = sharing.map((a) => targetFor(state, layout, a.id)!.x);
    expect(new Set(xs).size).toBe(xs.length);
  });

  it("stands each crew member at a workstation in their room", () => {
    const state = initialState();
    for (const agent of state.agents) {
      const target = targetFor(state, layout, agent.id)!;
      expect(layout.rooms.get(agent.roomId)!.stations).toContainEqual({ x: target.x, y: target.y });
    }
  });

  it("lines up extra crew nearer the front when a room runs out of workstations", () => {
    const state = initialState();
    const crowd = state.agents.map((a) => ({ ...a, roomId: "vault" }));
    const crowded = { ...state, agents: crowd };
    const spots = crowd.map((a) => targetFor(crowded, layout, a.id)!);
    const vault = layout.rooms.get("vault")!;
    expect(spots.every((p) => contains(vault.floor, p.x, p.y))).toBe(true);
    expect(new Set(spots.map((p) => `${p.x},${p.y}`)).size).toBe(spots.length);
  });

  it("has no position for an unknown crew member", () => {
    expect(targetFor(initialState(), layout, "nobody")).toBeNull();
  });
});
