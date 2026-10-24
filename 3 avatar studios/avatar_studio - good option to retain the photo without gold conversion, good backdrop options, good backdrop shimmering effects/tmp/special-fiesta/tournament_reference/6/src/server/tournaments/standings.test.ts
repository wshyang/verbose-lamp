import { describe, expect, it } from 'vitest';
import type { MatchRecord, ParticipantSlot, TeamRecord } from '../../shared/contracts.js';
import {
  buildStandings,
  createResolutionContext,
  resolveParticipant,
  type LedgerRecord,
} from './standings.js';

const teams = [
  createTeam('t1', 'Northside', 1),
  createTeam('t2', 'River Club', 2),
  createTeam('t3', 'Old Town', 3),
  createTeam('t4', 'Hilltop', 4),
  createTeam('t5', 'Lakeside', 5),
];
const groupMatches = [
  finalMatch('g-a-1', teamSlot('t1'), teamSlot('t2'), 'A', 2, 0, 't1'),
  finalMatch('g-a-2', teamSlot('t1'), teamSlot('t3'), 'A', 1, 1, null),
  finalMatch('g-a-3', teamSlot('t2'), teamSlot('t3'), 'A', 0, 1, 't3'),
  finalMatch('g-b-1', teamSlot('t4'), teamSlot('t5'), 'B', 0, 0, null),
];
const ledger = [
  entry('p-1', 't1', 'g-a-1', 3),
  entry('p-2', 't1', 'g-a-2', 1),
  entry('p-3', 't2', 'g-a-1', 0),
  entry('p-4', 't2', 'g-a-3', 0),
  entry('p-5', 't3', 'g-a-2', 1),
  entry('p-6', 't3', 'g-a-3', 3),
  entry('p-7', 't4', 'g-b-1', 1),
  entry('p-8', 't5', 'g-b-1', 1),
  entry('p-9', 't1', null, 2, 'desk-award'),
];

describe('match-linked standings and placeholders', () => {
  it('ranks teams by points, score difference, score for, and stable seed', () => {
    const result = buildStandings(teams, groupMatches, ledger);
    expect(result.overall[0]).toMatchObject({ teamId: 't1', played: 2, wins: 1, draws: 1, points: 6 });
    expect(result.groups.A?.[0]?.teamId).toBe('t1');
    expect(result.groups.B?.[0]?.teamId).toBe('t4');
  });

  it('resolves winner and loser slots from a final source match', () => {
    const context = createResolutionContext(teams, groupMatches, ledger);
    const winner = resolveParticipant(outcomeSlot('winner', 'g-a-1'), context);
    const loser = resolveParticipant(outcomeSlot('loser', 'g-a-1'), context);
    expect(winner).toEqual({ teamId: 't1', displayName: 'Northside' });
    expect(loser).toEqual({ teamId: 't2', displayName: 'River Club' });
    expect(resolveParticipant(outcomeSlot('loser', 'g-a-3'), context)).toEqual({ teamId: 't2', displayName: 'River Club' });
    const partialSource = finalMatch(
      'partial-source',
      teamSlot('t1'),
      outcomeSlot('winner', 'missing-source'),
      null,
      2,
      0,
      't1',
    );
    const partialContext = createResolutionContext(teams, [partialSource], []);
    expect(resolveParticipant(outcomeSlot('loser', 'partial-source'), partialContext).teamId).toBeNull();
  });

  it('leaves incomplete, tied, unknown, and Swiss slots as labelled placeholders', () => {
    const live = { ...groupMatches[0]!, id: 'live-match', status: 'live' as const };
    const noWinner = { ...groupMatches[1]!, id: 'tie-match', winnerTeamId: null };
    const context = createResolutionContext(teams, [...groupMatches, live, noWinner], ledger);
    expect(resolveParticipant(outcomeSlot('winner', 'live-match'), context).teamId).toBeNull();
    expect(resolveParticipant(outcomeSlot('winner', 'missing'), context).displayName).toBe('Winner of missing');
    expect(resolveParticipant(outcomeSlot('loser', 'tie-match'), context).teamId).toBeNull();
    expect(resolveParticipant({ kind: 'swiss-pairing', afterRound: 1, pairNumber: 1, seat: 1, label: 'Swiss side' }, context)).toEqual({
      teamId: null,
      displayName: 'Swiss side',
    });
  });

  it('resolves group ranks only after all matches are final and the requested rank exists', () => {
    const context = createResolutionContext(teams, groupMatches, ledger);
    expect(resolveParticipant({ kind: 'group-rank', groupKey: 'A', rank: 1, label: '1st Group A' }, context).teamId).toBe('t1');
    expect(resolveParticipant({ kind: 'group-rank', groupKey: 'A', rank: 4, label: '4th Group A' }, context).teamId).toBeNull();
    expect(resolveParticipant({ kind: 'group-rank', groupKey: 'missing', rank: 1, label: 'Unknown group' }, context).teamId).toBeNull();
    const incomplete = createResolutionContext(teams, [...groupMatches, { ...groupMatches[0]!, id: 'a-pending', status: 'staged' }], ledger);
    expect(resolveParticipant({ kind: 'group-rank', groupKey: 'A', rank: 1, label: '1st Group A' }, incomplete).teamId).toBeNull();
  });

  it('ranks group winners only when every source pool has finished', () => {
    const context = createResolutionContext(teams, groupMatches, ledger);
    const slot = { kind: 'group-winner-rank' as const, groupKeys: ['A', 'B'], rank: 1, label: 'Top group winner' };
    expect(resolveParticipant(slot, context).teamId).toBe('t1');
    expect(resolveParticipant({ ...slot, rank: 2 }, context).teamId).toBe('t4');
    expect(resolveParticipant({ ...slot, rank: 3 }, context).teamId).toBeNull();
    expect(resolveParticipant({ ...slot, groupKeys: ['A', 'C'] }, context).teamId).toBeNull();

    const missingLookup = createResolutionContext(teams, groupMatches, ledger);
    const originalLookup = missingLookup.teamsById.get.bind(missingLookup.teamsById);
    let t1Lookups = 0;
    missingLookup.teamsById.get = (teamId) => {
      if (teamId === 't1' && ++t1Lookups === 3) return undefined;
      return originalLookup(teamId);
    };
    expect(resolveParticipant(slot, missingLookup).teamId).toBe('t4');
  });

  it('keeps group-rank cycles unresolved instead of recursing indefinitely', () => {
    const recursiveMatch = finalMatch(
      'recursive',
      { kind: 'group-rank', groupKey: 'A', rank: 1, label: '1st Group A' },
      teamSlot('t2'),
      'A',
      1,
      0,
      't1',
    );
    const context = createResolutionContext(teams, [recursiveMatch], []);
    expect(resolveParticipant({ kind: 'group-rank', groupKey: 'A', rank: 1, label: '1st Group A' }, context).teamId).toBeNull();
  });

  it('ignores final rows without scores or whose participants cannot be resolved', () => {
    const noScore = { ...groupMatches[0]!, id: 'no-score', score: null };
    const unknown = finalMatch('unknown-team', teamSlot('not-on-field'), teamSlot('t2'), null, 3, 1, 't1');
    const result = buildStandings(teams, [noScore, unknown], []);
    expect(result.overall.find((row) => row.teamId === 't1')?.played).toBe(0);
    const missingTeam = resolveParticipant(teamSlot('not-on-field'), createResolutionContext(teams, [], []));
    expect(missingTeam).toEqual({ teamId: null, displayName: 'TBD team' });
    const unresolvedGroupMatch = finalMatch(
      'unresolved-group-match',
      teamSlot('t1'),
      teamSlot('not-on-field'),
      'C',
      2,
      1,
      't1',
    );
    const partialGroup = buildStandings([teams[0]!], [unresolvedGroupMatch], []);
    expect(partialGroup.groups.C?.map((row) => row.teamId)).toEqual(['t1']);
    expect(partialGroup.groups.C?.[0]?.played).toBe(0);
  });

  it('applies point reversals and limits group totals to match-linked entries', () => {
    const voided = entry('void-1', 't1', 'g-a-1', -3, 'void', 'p-1');
    const wrongScope = entry('unscoped', 't1', null, 10, 'desk-award');
    const result = buildStandings(teams, groupMatches, [...ledger, voided, wrongScope]);
    expect(result.overall.find((row) => row.teamId === 't1')?.points).toBe(13);
    expect(result.groups.A?.find((row) => row.teamId === 't1')?.points).toBe(1);
  });

  it('uses team name as the final stable tie-break and allows a standings view before play', () => {
    const tiedTeams = [createTeam('z', 'Zulu', 1), createTeam('a', 'Alpha', 1)];
    const rows = buildStandings(tiedTeams, [], []).overall;
    expect(rows.map((row) => row.teamId)).toEqual(['a', 'z']);
  });
});

function createTeam(id: string, name: string, seed: number): TeamRecord {
  return { id, tournamentId: 'tournament-test', name, seed, withdrawnAt: null, withdrawalReason: null };
}

function teamSlot(teamId: string): ParticipantSlot {
  return { kind: 'team', teamId, label: teams.find((team) => team.id === teamId)?.name ?? 'TBD team' };
}

function outcomeSlot(kind: 'winner' | 'loser', matchId: string): ParticipantSlot {
  return { kind, matchId, matchCode: matchId, label: `${kind === 'winner' ? 'Winner' : 'Loser'} of ${matchId}` };
}

function finalMatch(
  id: string,
  homeSlot: ParticipantSlot,
  awaySlot: ParticipantSlot,
  groupKey: string | null,
  home: number,
  away: number,
  winnerTeamId: string | null,
): MatchRecord {
  return {
    id,
    tournamentId: 'tournament-test',
    code: id,
    phase: 'Group play',
    roundNumber: 1,
    groupKey,
    position: 1,
    status: 'final',
    homeSlot,
    awaySlot,
    dependsOn: [],
    schedule: { startMinute: 540, endMinute: 560, courtNumber: 1, durationMinutes: 20 },
    score: { home, away, winnerTeamId, finalizedAt: '2026-10-14T09:20:00.000Z' },
  };
}

function entry(
  id: string,
  teamId: string,
  matchId: string | null,
  points: number,
  kind: LedgerRecord['kind'] = 'outcome-award',
  voidsEntryId: string | null = null,
): LedgerRecord {
  return {
    id,
    tournamentId: 'tournament-test',
    teamId,
    matchId,
    points,
    kind,
    reason: 'Test entry',
    voidsEntryId,
    createdAt: '2026-10-14T09:20:00.000Z',
  };
}
