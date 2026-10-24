import type {
  AdminMatchView,
  AdminTournamentConsoleView,
  AdminTournamentView,
} from "@psd/contracts";

/** ADR-279 — the desk console's shapes, for the hook and page tests. Deterministic, no clock read. */

function seat(teamId: string | null) {
  return {
    label: teamId ?? "TBD",
    teamId,
    teamName: teamId,
    isSeated: teamId !== null,
    seatOverrideReason: null,
  };
}

export function adminMatch(
  overrides: Partial<AdminMatchView> & { id: string },
): AdminMatchView {
  return {
    code: overrides.id.toUpperCase(),
    stageId: "s1",
    stageLabel: "Pool",
    groupCode: "A",
    round: 1,
    sequence: 1,
    origin: "structure",
    isPlacement: false,
    status: "scheduled",
    courtId: "c1",
    courtLabel: "Court 1",
    plannedStartAt: "2026-10-15T02:00:00.000Z",
    plannedMinutes: 12,
    startedAt: null,
    endedAt: null,
    startedByLabel: null,
    scoreA: 0,
    scoreB: 0,
    resultKind: null,
    winnerSide: null,
    isVoided: false,
    cancelReason: null,
    isPinned: false,
    seatConflict: null,
    a: seat("t1"),
    b: seat("t2"),
    ...overrides,
  };
}

export function adminTournament(
  overrides: Partial<AdminTournamentView> = {},
): AdminTournamentView {
  return {
    id: "tn",
    name: "Day",
    status: "live",
    kind: "captains_ball" as const,
    rates: { win: 30, draw: 20, loss: 10 },
    createdAt: "2026-10-15T01:00:00.000Z",
    startedAt: "2026-10-15T01:00:00.000Z",
    closedAt: null,
    closeReason: null,
    revision: 1,
    entrants: [],
    stages: [],
    matches: [],
    scheduler: null,
    draftSetup: null,
    dumbTiers: [],
    fit: null,
    ...overrides,
  };
}

export function consoleView(
  tournament: AdminTournamentView | null,
  overrides: Partial<AdminTournamentConsoleView> = {},
): AdminTournamentConsoleView {
  return {
    courts: [{ id: "c1", courtNumber: 1, label: "Court 1", isEnabled: true }],
    tournament,
    teams: [
      { id: "t1", name: "Reds", memberCount: 4 },
      { id: "t2", name: "Blues", memberCount: 3 },
    ],
    mode: "fixtures",
    modeSwitch: null,
    modeRequest: null,
    suggestedTiers: [],
    ...overrides,
  };
}
