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
