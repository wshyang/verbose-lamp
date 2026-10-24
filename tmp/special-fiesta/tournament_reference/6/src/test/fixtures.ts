import {
  FORMAT_CATALOG,
  type MatchView,
  type ParticipantSlot,
  type PointEntry,
  type ScheduleSummary,
  type StandingRow,
  type TeamRecord,
  type TournamentRecord,
  type TournamentSnapshot,
} from '../shared/contracts.js';

export function team(id: string, name = id, seed = Number(id.replace(/\D/g, '')) || 1): TeamRecord {
  return { id, tournamentId: 'event-1', name, seed, withdrawnAt: null, withdrawalReason: null };
}

export function slot(teamRecord: TeamRecord): ParticipantSlot {
  return { kind: 'team', teamId: teamRecord.id, label: teamRecord.name };
}

export function matchView(overrides: Partial<MatchView> = {}): MatchView {
  const home = team('team-1', 'Northside', 1);
  const away = team('team-2', 'River Club', 2);
  const homeSlot = slot(home);
  const awaySlot = slot(away);
  return {
    id: 'match-1',
    tournamentId: 'event-1',
    code: 'R1-M1',
    phase: 'Round 1',
    roundNumber: 1,
    groupKey: null,
    position: 1,
    status: 'staged',
    dependsOn: [],
    schedule: { startMinute: 540, endMinute: 560, courtNumber: 1, durationMinutes: 20 },
    score: null,
    participants: [
      { reference: homeSlot, displayName: home.name, resolvedTeamId: home.id },
      { reference: awaySlot, displayName: away.name, resolvedTeamId: away.id },
    ],
    ...overrides,
  };
}

export function tournamentRecord(overrides: Partial<TournamentRecord> = {}): TournamentRecord {
  return {
    id: 'event-1',
    name: 'Saturday Cup',
    mode: 'single-elimination',
    status: 'scheduled',
    teamCount: 4,
    courtCount: 2,
    matchDurationMinutes: 20,
    tournamentLengthMinutes: 240,
    startTimeMinutes: 540,
    winPoints: 3,
    drawPoints: 1,
    lossPoints: 0,
    closingReason: null,
    createdAt: '2026-10-14T09:00:00.000Z',
    updatedAt: '2026-10-14T09:00:00.000Z',
    ...overrides,
  };
}

export function scheduleSummary(overrides: Partial<ScheduleSummary> = {}): ScheduleSummary {
  return {
    matchCount: 3,
    durationMinutes: 60,
    finishTimeMinutes: 600,
    tournamentLengthMinutes: 240,
    fits: true,
    courtsAvailable: 2,
    matchDurationMinutes: 20,
    ...overrides,
  };
}

export function standing(overrides: Partial<StandingRow> = {}): StandingRow {
  return {
    teamId: 'team-1',
    teamName: 'Northside',
    seed: 1,
    played: 1,
    wins: 1,
    draws: 0,
    losses: 0,
    scoreFor: 2,
    scoreAgainst: 1,
    scoreDifference: 1,
    points: 3,
    ...overrides,
  };
}

export function pointEntry(overrides: Partial<PointEntry> = {}): PointEntry {
  return {
    id: 'point-1',
    tournamentId: 'event-1',
    teamId: 'team-1',
    teamName: 'Northside',
    matchId: null,
    kind: 'desk-award',
    points: 2,
    reason: 'Fair play',
    voidsEntryId: null,
    voided: false,
    createdAt: '2026-10-14T09:00:00.000Z',
    ...overrides,
  };
}

export function snapshot(overrides: Partial<TournamentSnapshot> = {}): TournamentSnapshot {
  const teams = [team('team-1', 'Northside', 1), team('team-2', 'River Club', 2)];
  return {
    tournament: tournamentRecord(),
    teams,
    matches: [matchView()],
    pointEntries: [],
    standings: [standing()],
    groupStandings: {},
    scheduleSummary: scheduleSummary(),
    ...overrides,
  };
}

export const formats = [...FORMAT_CATALOG];
