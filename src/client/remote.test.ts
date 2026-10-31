import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteFacility } from "./remote";

function answer(status: number) {
  return new Response(JSON.stringify({}), { status, headers: { "Content-Type": "application/json" } });
}

describe("RemoteFacility commands", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks for the owner's PIN when the server wants it, then sends the same command again", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(answer(401)).mockResolvedValueOnce(answer(200));
    vi.stubGlobal("fetch", fetch);
    const facility = new RemoteFacility();
    const asked = vi.fn<(retry: () => void) => void>();
    facility.onOwnerNeeded = asked;

    facility.decide("approval-1", true);
    await vi.waitFor(() => expect(asked).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledOnce();

    asked.mock.calls[0][0]();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [path, init] = fetch.mock.calls[1] as [string, RequestInit];
    expect(path).toBe("/api/approvals/approval-1");
    expect(JSON.parse(init.body as string)).toEqual({ approve: true });
  });

  it("doesn't ask for the PIN for other refusals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer(409)));
    const facility = new RemoteFacility();
    const asked = vi.fn();
    facility.onOwnerNeeded = asked;

    facility.setAgentPaused("agent-1", false);
    await vi.waitFor(() => expect(facility.commandError).toBe("This action could not be completed."));
    expect(asked).not.toHaveBeenCalled();
  });
});

describe("live connection watchdog", () => {
  it("stops stale activity after a silent connection loss and reconnects for a fresh snapshot", () => {
    vi.useFakeTimers();
    const sources: { handlers: Record<string, (e: unknown) => void>; close: ReturnType<typeof vi.fn> }[] = [];
    class Source {
      handlers: Record<string, (e: unknown) => void> = {};
      close = vi.fn();
      onerror: (() => void) | null = null;
      constructor() { sources.push(this); }
      addEventListener(name: string, fn: (e: unknown) => void) { this.handlers[name] = fn; }
    }
    vi.stubGlobal("EventSource", Source);
    const facility = new RemoteFacility();
    try {
      facility.start();
      const snapshot = { data: JSON.stringify({ state: {}, control: { running: true, mode: "live", speed: 1 } }) };
      sources[0].handlers.snapshot(snapshot);
      expect(facility.connection).toBe("online");
      vi.advanceTimersByTime(10000);
      sources[0].handlers.heartbeat({});
      vi.advanceTimersByTime(10000);
      expect(facility.connection).toBe("online");
      vi.advanceTimersByTime(6000);
      expect(facility.connection).toBe("offline");
      expect(sources[0].close).toHaveBeenCalledOnce();
      expect(sources).toHaveLength(2);
      sources[1].handlers.snapshot(snapshot);
      expect(facility.connection).toBe("online");
      facility.stop();
      expect(facility.connection).toBe("offline");
      expect(vi.getTimerCount()).toBe(0);
    } finally { facility.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
});
