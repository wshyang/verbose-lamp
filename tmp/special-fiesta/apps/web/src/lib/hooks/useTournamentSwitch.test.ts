import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { messages } from "@psd/contracts";
import {
  installFetchStub,
  type FetchStub,
} from "../../test-utils/fetchStub.js";
import {
  adminTournament,
  consoleView,
} from "../../test-utils/tournamentFixtures.js";
import { useTournamentDesk } from "./useTournamentDesk.js";
import {
  SWITCH_WORD,
  modeLine,
  tiersOrNull,
  useTournamentSwitch,
} from "./useTournamentSwitch.js";

/**
 * ADR-336 §4/§5 — the switch form's readings: the buttons the day's own rates prefill, the two things
 * a slip cannot supply (a word and a reason), and the client id that makes a double tap a replay.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

function renderSwitch() {
  return renderHook(() => {
    const desk = useTournamentDesk();
    return { desk, form: useTournamentSwitch(desk) };
  });
}

describe("tiersOrNull", () => {
  it("takes whole points in the schema’s bounds, and refuses anything a press could not pay", () => {
    expect(tiersOrNull([{ label: "30 pts", points: "30" }])).toEqual([
      { label: "30 pts", points: 30 },
    ]);
    expect(tiersOrNull([{ label: "Gold", points: "7.5" }])).toBeNull();
    expect(tiersOrNull([{ label: "Gold", points: "0" }])).toBeNull();
    expect(tiersOrNull([{ label: "Gold", points: "101" }])).toBeNull();
    expect(
      tiersOrNull([
        { label: "Gold", points: "10" },
        { label: "gold", points: "20" },
      ]),
    ).toBeNull();
    expect(tiersOrNull([{ label: "  ", points: "10" }])).toBeNull();
    expect(tiersOrNull([])).toBeNull();
  });
});

describe("modeLine", () => {
  it("says what the room is playing, and what the drain is waiting for", () => {
    expect(modeLine({ mode: "fixtures", isDraining: false })).toBe(
      "The day is playing fixtures.",
    );
    expect(modeLine({ mode: "dumb", isDraining: false })).toBe(
      "Courts are awarding points.",
    );
    expect(modeLine({ mode: "switching", isDraining: true })).toContain(
      "finish first",
    );
    expect(modeLine({ mode: "switching", isDraining: false })).toBe(
      "Courts are awarding points.",
    );
  });
});

describe("useTournamentSwitch", () => {
  it("opens on the derived buttons, and will not confirm without the word", async () => {
    stub = installFetchStub({
      "GET /api/admin/tournament": {
        body: consoleView(adminTournament(), {
          suggestedTiers: [
            { label: "30 pts", points: 30 },
            { label: "20 pts", points: 20 },
          ],
        }),
      },
      "POST /api/admin/tournament/switch": {
        body: consoleView(adminTournament()),
      },
    });
    const { result } = renderSwitch();
    await waitFor(() =>
      expect(result.current.desk.suggestedTiers).toHaveLength(2),
    );
    await act(async () => result.current.form.open());
    // §4 — the dialog opens with the day's own paid rates already as buttons.
    expect(result.current.form.tiers).toEqual([
      { label: "30 pts", points: "30" },
      { label: "20 pts", points: "20" },
    ]);
    act(() => result.current.form.setReason("Court 3 is unplayable."));
    expect(result.current.form.isReady).toBe(false);
    act(() => result.current.form.setWord("yes"));
    expect(result.current.form.isReady).toBe(false);
    act(() => result.current.form.setWord(`  ${SWITCH_WORD.toUpperCase()} `));
    expect(result.current.form.isReady).toBe(true);

    let worked: boolean | undefined;
    await act(async () => {
      worked = await result.current.form.confirm();
    });
    expect(worked).toBe(true);
    expect(stub.callsTo("POST /api/admin/tournament/switch")).toHaveLength(1);
    const body = stub.callsTo("POST /api/admin/tournament/switch")[0]?.body as {
      confirmation: string;
      reason: string;
      tiers: unknown[];
      clientUuid: string;
    };
    // Sent as typed — trimmed, and the API does the case-insensitive comparison, so there is one
    // place that decides what the word means.
    expect(body.confirmation).toBe("SWITCH");
    expect(body.reason).toBe("Court 3 is unplayable.");
    expect(body.tiers).toEqual([
      { label: "30 pts", points: 30 },
      { label: "20 pts", points: 20 },
    ]);
    expect(body.clientUuid).toMatch(/^[0-9a-f-]{36}$/);
    // The form closes on success: the console now shows the award day.
    expect(result.current.form.isOpen).toBe(false);
  });

  it("refuses to confirm an unusable tier set, saying what is wrong", async () => {
    stub = installFetchStub({
      "GET /api/admin/tournament": {
        body: consoleView(adminTournament(), {
          suggestedTiers: [{ label: "30 pts", points: 30 }],
        }),
      },
    });
    const { result } = renderSwitch();
    await waitFor(() =>
      expect(result.current.desk.suggestedTiers).toHaveLength(1),
    );
    await act(async () => result.current.form.open());
    act(() => result.current.form.setReason("Rain."));
    act(() => result.current.form.setWord("switch"));
    act(() => result.current.form.patchTier(0, { points: "" }));
    expect(result.current.form.isReady).toBe(false);
    await act(async () => {
      await result.current.form.confirm();
    });
    expect(result.current.form.error).toBe(messages.tierListInvalid);
    // Nothing was posted: a form that cannot be confirmed writes nothing.
    expect(
      stub.calls.filter((request) => request.method === "POST"),
    ).toHaveLength(0);
  });
});
