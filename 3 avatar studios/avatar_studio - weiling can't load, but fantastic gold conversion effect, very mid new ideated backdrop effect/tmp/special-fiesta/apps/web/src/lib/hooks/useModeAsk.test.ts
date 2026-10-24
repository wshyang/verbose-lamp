import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { installFetchStub } from "../../test-utils/fetchStub.js";
import type { FetchStub, RouteTable } from "../../test-utils/fetchStub.js";
import { messages } from "@psd/contracts";
import { MODE_POLL_MS, useModeAsk } from "./useModeAsk.js";

/**
 * ADR-336 §5.4 — the ask on a court page.
 *
 * The hook owns three things the panel above it should not have to think about: one idempotency key per
 * unanswered question, a mode that refreshes without a tap, and an ask that clears its own draft only
 * once the API has taken it.
 *
 * ADR-342 — the ask never expires, so the hook owns a fourth: the desk's answer. A decline that
 * arrives while the marshal holds the phone is shown with its reason and dismissed by them, and a
 * question that was already answered before the page opened is history — the form is simply there,
 * ready for the next ask at once.
 */

let stub: FetchStub;
afterEach(() => {
  stub?.restore();
  vi.useRealTimers();
});

const fixturesMode = {
  mode: "fixtures" as const,
  isAwarding: false,
  pendingRequest: null,
  lastAnswer: null,
};

const declinedAnswer = {
  id: "req-7",
  resolution: "declined" as const,
  declineReason: "The courts are fine — the puddle is on the path.",
  resolvedAt: "2026-10-15T02:14:00.000Z",
};

function mount(routes: RouteTable = {}) {
  stub = installFetchStub({
    "GET /api/tournament/mode": { body: fixturesMode },
    "POST /api/tournament/mode/requests": { body: fixturesMode },
    ...routes,
  });
  return renderHook(() => useModeAsk("court-1"));
}

describe("useModeAsk", () => {
  it("reads the mode for this court", async () => {
    const { result } = mount({
      "GET /api/tournament/mode": {
        body: { ...fixturesMode, isAwarding: true },
      },
    });
    await waitFor(() => expect(result.current.isAwarding).toBe(true));
    expect(stub.callsTo("GET /api/tournament/mode")[0]?.path).toContain(
      "courtId=court-1",
    );
  });

  it("re-asks on the poll interval, so a desk answer arrives without a tap", async () => {
    vi.useFakeTimers();
    const { result } = mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(stub.callsTo("GET /api/tournament/mode")).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MODE_POLL_MS);
    });
    expect(stub.callsTo("GET /api/tournament/mode")).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("asks with the reason, then shows the ask waiting on the desk", async () => {
    const pending = {
      id: "req-1",
      requestedByLabel: "psdadmin1",
      reason: "Court 3 is underwater.",
      courtLabel: "Court 1",
      createdAt: "2026-10-15T02:10:00.000Z",
    };
    const { result } = mount({
      "POST /api/tournament/mode/requests": {
        status: 201,
        body: { ...fixturesMode, pendingRequest: pending },
      },
    });
    await waitFor(() => expect(result.current.mode).toBe("fixtures"));
    act(() => result.current.setReason("  Court 3 is underwater.  "));
    await act(async () => expect(await result.current.ask()).toBe(true));

    const body = stub.callsTo("POST /api/tournament/mode/requests")[0]
      ?.body as {
      reason: string;
      courtId?: string;
      clientUuid?: string;
    };
    expect(body.reason).toBe("Court 3 is underwater.");
    expect(body.courtId).toBe("court-1");
    expect(body.clientUuid).toEqual(expect.any(String));
    expect(result.current.pendingRequest?.id).toBe("req-1");
    expect(result.current.reason).toBe("");
  });

  it("reuses one clientUuid for every press while its question is unanswered", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.mode).toBe("fixtures"));
    act(() => result.current.setReason("First."));
    await act(async () => {
      await result.current.ask();
    });
    act(() => result.current.setReason("Second."));
    await act(async () => {
      await result.current.ask();
    });
    const keys = stub
      .callsTo("POST /api/tournament/mode/requests")
      .map((call) => (call.body as { clientUuid: string }).clientUuid);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("mints a new key for the ask after its last one was answered", async () => {
    // The first press is an unanswered question, so it keeps the page's key. The answer comes back on
    // the response, and the next press is a new question — a new key, because the answered row keeps
    // its key forever (ADR-009's replay is for double taps on live questions).
    const { result } = mount({
      "POST /api/tournament/mode/requests": {
        status: 201,
        body: { ...fixturesMode, lastAnswer: declinedAnswer },
      },
    });
    await waitFor(() => expect(result.current.mode).toBe("fixtures"));
    act(() => result.current.setReason("First."));
    await act(async () => {
      await result.current.ask();
    });
    act(() => result.current.setReason("After the answer."));
    await act(async () => {
      await result.current.ask();
    });
    const keys = stub
      .callsTo("POST /api/tournament/mode/requests")
      .map((call) => (call.body as { clientUuid: string }).clientUuid);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("will not ask with nothing to say", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.mode).toBe("fixtures"));
    act(() => result.current.setReason("   "));
    await act(async () => expect(await result.current.ask()).toBe(false));
    expect(stub.callsTo("POST /api/tournament/mode/requests")).toHaveLength(0);
    expect(result.current.pendingRequest).toBeNull();
  });

  it("keeps the draft and says why when the ask is refused", async () => {
    const { result } = mount({
      "POST /api/tournament/mode/requests": {
        status: 403,
        body: { error: { code: "forbidden", message: "Only staff may ask." } },
      },
    });
    await waitFor(() => expect(result.current.mode).toBe("fixtures"));
    act(() => result.current.setReason("Let us award points."));
    await act(async () => expect(await result.current.ask()).toBe(false));
    expect(result.current.error).toBe("Only staff may ask.");
    expect(result.current.reason).toBe("Let us award points.");
    expect(result.current.pendingRequest).toBeNull();
  });

  it("surfaces a decline that arrives with its reason, until the marshal dismisses it", async () => {
    // The marshal pressed ask again before the poll delivered the decline; the response carries both
    // the new pending ask and the old answer. The answer is news — it arrived on this page — so it
    // reads out loud, and the marshal clears it.
    const pending = {
      id: "req-8",
      requestedByLabel: "psdadmin1",
      reason: "Still raining.",
      courtLabel: "Court 1",
      createdAt: "2026-10-15T02:16:00.000Z",
    };
    const { result } = mount({
      "POST /api/tournament/mode/requests": {
        status: 201,
        body: {
          ...fixturesMode,
          pendingRequest: pending,
          lastAnswer: declinedAnswer,
        },
      },
    });
    await waitFor(() => expect(result.current.mode).toBe("fixtures"));
    act(() => result.current.setReason("Still raining."));
    await act(async () => expect(await result.current.ask()).toBe(true));
    expect(result.current.pendingRequest?.id).toBe("req-8");
    expect(result.current.declinedAnswer?.declineReason).toBe(
      "The courts are fine — the puddle is on the path.",
    );
    act(() => result.current.dismissDeclined());
    expect(result.current.declinedAnswer).toBeNull();
    expect(result.current.pendingRequest?.id).toBe("req-8");
  });

  it("treats an answer that was already waiting as history, not news", async () => {
    const { result } = mount({
      "GET /api/tournament/mode": {
        body: { ...fixturesMode, lastAnswer: declinedAnswer },
      },
    });
    await waitFor(() => expect(result.current.mode).toBe("fixtures"));
    expect(result.current.declinedAnswer).toBeNull();
    expect(result.current.pendingRequest).toBeNull();
  });

  it("reports a mode read that fails, and keeps the last answer on screen", async () => {
    const { result } = mount({
      "GET /api/tournament/mode": {
        status: 500,
        body: {
          error: { code: "boom", message: messages.modeRequestNotPending },
        },
      },
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.mode).toBe("fixtures");
  });
});
