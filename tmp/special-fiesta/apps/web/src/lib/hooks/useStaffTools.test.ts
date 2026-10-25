import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { messages } from "@psd/contracts";
import { installFetchStub } from "../../test-utils/fetchStub.js";
import type { FetchStub } from "../../test-utils/fetchStub.js";
import {
  activityFixture,
  courtFixture,
  participantFixture,
} from "../../test-utils/fixtures.js";
import {
  usePinReset,
  useScoreAdjustment,
  useStationPicker,
} from "./useStaffTools.js";
import { facilitatorShellRoutes } from "../../test-utils/ambientRoutes.js";

let stub: FetchStub;
afterEach(() => stub?.restore());

describe("useStationPicker", () => {
  it("offers courts and fringe activities as one list with their current state", async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      "GET /api/tournament/dumb/status": { body: { active: false } },
      "GET /api/tournament/courts": { body: { items: [courtFixture] } },
      "GET /api/fringe/activities": { body: { items: [activityFixture] } },
    });
    const { result } = renderHook(() => useStationPicker());

    await waitFor(() => expect(result.current.stations).toHaveLength(2));
    expect(result.current.stations[0]).toMatchObject({
      kind: "court",
      detail: "Idle",
    });
    expect(result.current.stations[1]).toMatchObject({
      kind: "fringe_activity",
      detail: "Round 1 · open",
    });
  });

  it("routes courts to the dumb award page while dumb courts operate (ADR-321)", async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      "GET /api/tournament/dumb/status": { body: { active: true } },
      "GET /api/tournament/courts": { body: { items: [courtFixture] } },
      "GET /api/fringe/activities": { body: { items: [] } },
    });
    const { result } = renderHook(() => useStationPicker());
    await waitFor(() => expect(result.current.stations).toHaveLength(1));
    expect(result.current.stations[0]).toMatchObject({
      kind: "dumb_court",
      detail: "Awarding points",
    });
  });

  it("leaves a court that is still finishing its match on the match page during the drain (ADR-336 §6.1)", async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      "GET /api/tournament/dumb/status": { body: { active: true } },
      "GET /api/tournament/courts": {
        body: {
          items: [
            courtFixture,
            {
              ...courtFixture,
              id: "c2",
              courtNumber: 2,
              displayLabel: "Court 2",
              currentMatchId: "m1",
            },
          ],
        },
      },
      "GET /api/fringe/activities": { body: { items: [] } },
    });
    const { result } = renderHook(() => useStationPicker());
    await waitFor(() => expect(result.current.stations).toHaveLength(2));
    // The mode says the room is awarding, but the per-court rule is what the picker follows: a court
    // with a live match keeps its match page until that match is closed.
    expect(result.current.stations[0]).toMatchObject({
      kind: "dumb_court",
      detail: "Awarding points",
    });
    expect(result.current.stations[1]).toMatchObject({
      kind: "court",
      detail: "Match in progress",
    });
  });

  it("says so when an activity has no round open yet", async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      "GET /api/tournament/dumb/status": { body: { active: false } },
      "GET /api/tournament/courts": { body: { items: [] } },
      "GET /api/fringe/activities": {
        body: { items: [{ ...activityFixture, currentRound: null }] },
      },
    });
    const { result } = renderHook(() => useStationPicker());

    await waitFor(() => expect(result.current.stations).toHaveLength(1));
    expect(result.current.stations[0]).toMatchObject({
      detail: "No round open",
    });
  });
});

describe("usePinReset", () => {
  it("looks the participant up, then sets a new PIN", async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      "GET /api/staff/participants/by-nickname/BeachBoss": {
        body: { participant: participantFixture },
      },
      "PUT /api/staff/participants/:id/pin": {
        body: { participant: participantFixture },
      },
    });
    const { result } = renderHook(() => usePinReset());

    act(() => result.current.setNickname("BeachBoss"));
    await act(async () => {
      await result.current.findParticipant();
    });
    expect(result.current.participant?.nickname).toBe("BeachBoss");

    act(() => result.current.setNewPin("9876"));
    await act(async () => {
      await result.current.submitReset();
    });

    await waitFor(() =>
      expect(result.current.confirmation).toContain("BeachBoss"),
    );
    const [call] = stub.calls.filter((entry) => entry.method === "PUT");
    expect(call?.body).toEqual({ pin: "9876" });
  });

  it("rejects a PIN that is not four digits before calling the API", async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      "GET /api/staff/participants/by-nickname/BeachBoss": {
        body: { participant: participantFixture },
      },
    });
    const { result } = renderHook(() => usePinReset());

    act(() => result.current.setNickname("BeachBoss"));
    await act(async () => {
      await result.current.findParticipant();
    });
    act(() => result.current.setNewPin("12"));
    await act(async () => {
      await result.current.submitReset();
    });

    expect(result.current.error).toBe(messages.pinInvalid);
    expect(stub.calls.filter((entry) => entry.method === "PUT")).toHaveLength(
      0,
    );
  });

  it("does nothing until a participant has been chosen", async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
    });
    const { result } = renderHook(() => usePinReset());

    act(() => result.current.setNewPin("2468"));
    await act(async () => {
      await result.current.submitReset();
    });

    expect(stub.calls).toHaveLength(0);
    expect(result.current.confirmation).toBeNull();
  });

  it("resets the PIN of a participant the console already has on screen (S53)", async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      [`PUT /api/staff/participants/${participantFixture.id}/pin`]: {
        body: { participant: participantFixture },
      },
    });
    const { result } = renderHook(() =>
      usePinReset({
        id: participantFixture.id,
        nickname: participantFixture.nickname,
      }),
    );

    act(() => result.current.setNewPin("2468"));
    await act(async () => {
      await result.current.submitReset();
    });

    await waitFor(() =>
      expect(result.current.confirmation).toBe(
        `PIN reset for ${participantFixture.nickname}.`,
      ),
    );
    expect(
      stub.callsTo(
        `PUT /api/staff/participants/${participantFixture.id}/pin`,
      )[0]?.body,
    ).toEqual({ pin: "2468" });
  });
});

describe("useScoreAdjustment (ADR-117)", () => {
  const url = `POST /api/admin/participants/${participantFixture.id}/adjustments`;
  const adjustment = {
    id: "adj-1",
    participantId: participantFixture.id,
    activityId: activityFixture.id,
    points: -4,
    reason: "Mis-scan at the volleyball net.",
    activityName: activityFixture.activityName,
    createdByUsername: "superadmin",
    createdAt: "2026-10-02T03:00:00.000Z",
  };

  function renderAdjustment(onApplied: () => void) {
    return renderHook(() =>
      useScoreAdjustment({ participantId: participantFixture.id, onApplied }),
    );
  }

  it("sends the typed deduction, trims the reason, and clears the form for the next one", async () => {
    let applied = 0;
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      [url]: { status: 201, body: { adjustment } },
    });
    const { result } = renderAdjustment(() => {
      applied += 1;
    });

    act(() => {
      result.current.setActivityId(activityFixture.id);
      result.current.setPoints("-4");
      result.current.setReason("  Mis-scan at the volleyball net.  ");
    });
    await act(async () => {
      await result.current.submit();
    });

    // The wire body is the contract: a signed number, and a reason with no stray whitespace.
    expect(stub.calls[0]?.body).toEqual({
      activityId: activityFixture.id,
      points: -4,
      reason: "Mis-scan at the volleyball net.",
    });
    expect(result.current.confirmation).toBe(
      `-4 on ${activityFixture.activityName}, recorded.`,
    );
    expect(result.current.points).toBe("");
    expect(result.current.reason).toBe("");
    expect(applied).toBe(1);
  });

  it("signs a grant, so the operator can see which way the correction went", async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      [url]: {
        status: 201,
        body: { adjustment: { ...adjustment, points: 15 } },
      },
    });
    const { result } = renderAdjustment(() => {});

    act(() => {
      result.current.setActivityId(activityFixture.id);
      result.current.setPoints("15");
      result.current.setReason("Station tablet died.");
    });
    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.confirmation).toBe(
      `+15 on ${activityFixture.activityName}, recorded.`,
    );
  });

  it("keeps the refusal and the typed values when the server says no", async () => {
    stub = installFetchStub({
      ...facilitatorShellRoutes(),
      [url]: {
        status: 400,
        body: { error: { message: messages.adjustmentPointsInvalid } },
      },
    });
    const { result } = renderAdjustment(() => {});

    act(() => {
      result.current.setActivityId(activityFixture.id);
      result.current.setPoints("0");
      result.current.setReason("Nothing to give.");
    });
    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() =>
      expect(result.current.error).toBe(messages.adjustmentPointsInvalid),
    );
    expect(result.current.confirmation).toBeNull();
    // Nothing was recorded, so the operator must not have to retype what they meant.
    expect(result.current.points).toBe("0");
    expect(result.current.reason).toBe("Nothing to give.");
  });
});
