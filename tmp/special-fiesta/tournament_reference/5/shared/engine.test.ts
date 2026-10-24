// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FORMATS, generateFormat, getFormat } from './formats/index.js';
import { scheduleMatches, simulate, dependenciesOf } from './schedule.js';
import { slotLabel } from './slots.js';
import { computeStandings, standingExplanation } from './standings.js';
import { resolveSlotTeam, indexMatches } from './resolve.js';
import { formatMinutes, parseTimeToMinutes } from './time.js';
import { rescheduleFutureMatches } from './reschedule.js';
import { byeSlot, winnerOf as winnerSlot } from './slots.js';
import { buildKnockoutFromSlots } from './formats/common.js';
import { rankOf as rankSlot } from './slots.js';
import type { MatchView, TeamView } from './types.js';

const config = { courts: 2, matchLengthMinutes: 20, startMinutes: 540, restMinutes: 10, tournamentLengthMinutes: 480 };

describe('format registry', () => {
  it('exposes all source formats plus double elimination', () => {
    expect(FORMATS.map((format) => format.id)).toEqual([
      'round-robin', 'single-elimination', 'double-elimination', 'consolation',
      'swiss', 'world-cup', 'flighted-quads', 'points-rush', 'ironman',
    ]);
  });

  it('rejects unknown formats', () => {
    expect(() => getFormat('king-of-the-court')).toThrow('Unknown tournament format: king-of-the-court');
  });

  it.each([
    ['round-robin', 1, 'between 2 and 32'],
    ['single-elimination', 33, 'between 2 and 32'],
    ['double-elimination', 5, '4 or 8'],
    ['consolation', 7, 'exactly 8'],
    ['swiss', 2, 'between 3 and 32'],
    ['world-cup', 5, 'between 6 and 32'],
    ['flighted-quads', 10, 'multiple of 4'],
    ['points-rush', 10, 'multiple of 3'],
    ['ironman', 1, 'between 2 and 32'],
  ])('validates %s team counts', (id, teams, fragment) => {
    expect(() => generateFormat(id, teams)).toThrow(fragment);
  });
});

describe('generators use placeholders, never predicted winners', () => {
  it('round robin pairs every team once for even and odd fields', () => {
    const even = generateFormat('round-robin', 4);
    expect(even).toHaveLength(6);
    const odd = generateFormat('round-robin', 5);
    expect(odd).toHaveLength(10);
    expect(slotLabel(even[0].slotA)).toBe('Seed 1');
  });

  it('single elimination generalises play-ins and byes', () => {
    const specs = generateFormat('single-elimination', 11);
    expect(specs.filter((match) => match.phase === 'Play-In')).toHaveLength(3);
    expect(specs[specs.length - 1].phase).toBe('Final');
    expect(slotLabel(specs[specs.length - 1].slotA)).toContain('Winner of');
    expect(generateFormat('single-elimination', 8)).toHaveLength(7);
    expect(generateFormat('single-elimination', 2)).toHaveLength(1);
    expect(generateFormat('single-elimination', 6).filter((m) => m.phase === 'Play-In')).toHaveLength(2);
    expect(generateFormat('single-elimination', 16).some((m) => m.phase === 'Round of 16')).toBe(true);
  });

  it('consolation guarantees losers a second match', () => {
    const specs = generateFormat('consolation', 8);
    expect(specs.map((match) => match.key)).toContain('CON1');
    expect(slotLabel(specs.find((m) => m.key === 'CON1')!.slotA)).toBe('Loser of QF1');
    expect(specs.find((m) => m.key === 'P5')).toBeDefined();
  });

  it('double elimination drops losers into a losers bracket', () => {
    const four = generateFormat('double-elimination', 4);
    expect(four.map((m) => m.key)).toContain('LB-F');
    const eight = generateFormat('double-elimination', 8);
    expect(eight).toHaveLength(14);
    expect(slotLabel(eight[eight.length - 1].slotB)).toBe('Winner of LB-F');
  });

  it('swiss uses record-pool placeholders after round one and a bye slot for odd fields', () => {
    const specs = generateFormat('swiss', 9);
    expect(specs.filter((m) => m.round === 1 && m.slotB.kind === 'bye')).toHaveLength(1);
    const roundTwo = specs.find((m) => m.round === 2)!;
    expect(roundTwo.slotA.kind).toBe('recordPool');
    expect(slotLabel(roundTwo.slotA)).toContain('record pool');
    expect(generateFormat('swiss', 8)[0].slotB.kind).toBe('team');
  });

  it('world cup builds balanced groups then a rank-placeholder knockout', () => {
    const specs = generateFormat('world-cup', 16);
    const knockout = specs.find((m) => m.key.startsWith('KO'))!;
    expect(knockout.slotA.kind).toBe('rankOf');
    expect(slotLabel(knockout.slotA)).toBe('#1 Group A');
    expect(knockout.dependsOn.length).toBeGreaterThan(8);
    expect(generateFormat('world-cup', 9).some((m) => m.groupKey === 'B')).toBe(true);
  });

  it('flighted quads and points rush build their topologies', () => {
    const flights = generateFormat('flighted-quads', 12);
    expect(flights.filter((m) => m.key.startsWith('FIN-'))).toHaveLength(3);
    const rush = generateFormat('points-rush', 12);
    expect(slotLabel(rush.find((m) => m.key === 'GF')!.slotA)).toBe('#1 Overall');
    expect(rush.find((m) => m.key === 'P3')!.round).toBe(4);
  });

  it('ironman reuses knockout topology under its own keys', () => {
    const specs = generateFormat('ironman', 8);
    expect(specs).toHaveLength(7);
    expect(specs[0].key).toBe('IM-R1M1');
  });
});

describe('scheduler', () => {
  it('schedules dependency-aware with courts, rest and team conflicts', () => {
    const result = simulate(generateFormat('single-elimination', 8), config);
    const final = result.matches[result.matches.length - 1];
    const semis = result.matches.filter((m) => m.phase === 'Semi-Finals');
    expect(final.startMinutes).toBeGreaterThanOrEqual(Math.max(...semis.map((m) => m.endMinutes!)) + 10);
    expect(result.courtMinutes).toBe(7 * 20);
    expect(result.fitsInTournamentLength).toBe(true);
    expect(result.overrunMinutes).toBe(0);
  });

  it('flags back-to-back matches only when rest is zero', () => {
    const zero = simulate(generateFormat('ironman', 4), { ...config, restMinutes: 0, courts: 2 });
    expect(zero.matches.some((m) => m.isBackToBack)).toBe(true);
    const rested = simulate(generateFormat('ironman', 4), config);
    expect(rested.matches.every((m) => !m.isBackToBack)).toBe(true);
  });

  it('reports overrun against tournament length honestly', () => {
    const result = simulate(generateFormat('round-robin', 8), { ...config, courts: 1, tournamentLengthMinutes: 60 });
    expect(result.fitsInTournamentLength).toBe(false);
    expect(result.overrunMinutes).toBe(result.totalMinutes - 60);
  });

  it('builds knockouts from slots with byes, powers of two, and feeder deps', () => {
    const ranks = [1, 2, 3, 4, 5, 6].map((rank) => rankSlot('Group A', rank));
    const withByes = buildKnockoutFromSlots(ranks, { keyPrefix: 'K', phasePrefix: 'KO', firstRound: 1 });
    expect(withByes.length).toBeGreaterThan(3);
    const feeders = ['A', 'B', 'C', 'D'].map((key) => winnerSlot(key));
    const pow2 = buildKnockoutFromSlots(feeders, { keyPrefix: 'K', phasePrefix: 'KO', firstRound: 1 });
    expect(pow2[pow2.length - 1].dependsOn).toEqual(['K-R1M1', 'K-R1M2']);
    expect(buildKnockoutFromSlots(feeders.slice(0, 2), { keyPrefix: 'K', phasePrefix: '', firstRound: 3 }))
      .toHaveLength(1);
  });

  it('handles an empty graph and a bye match', () => {
    const empty = simulate([], config);
    expect(empty.totalMinutes).toBe(0);
    expect(empty.finishMinutes).toBe(540);
    const swiss = simulate(generateFormat('swiss', 3), config);
    expect(swiss.matches.find((m) => m.court === null)).toBeDefined();
  });

  it('throws on a broken dependency graph', () => {
    const broken = [{
      key: 'X', phase: 'Final', groupKey: null, round: 1,
      slotA: { kind: 'winnerOf' as const, matchKey: 'MISSING' },
      slotB: { kind: 'team' as const, teamRef: 'team-1', label: 'Seed 1' },
      dependsOn: ['MISSING'],
    }];
    expect(() => scheduleMatches(broken, config)).toThrow('Unschedulable match graph');
  });

  it('collects dependencies from dependsOn and slots', () => {
    const [final] = generateFormat('round-robin', 2);
    expect(dependenciesOf(final)).toEqual([]);
    const knockout = generateFormat('single-elimination', 4);
    expect(dependenciesOf(knockout[knockout.length - 1])).toEqual(['SE-R1M1', 'SE-R1M2']);
  });
});

describe('slot resolution and standings', () => {
  const teams: TeamView[] = [
    { id: 'a', name: 'Alpha', seed: 1 }, { id: 'b', name: 'Bravo', seed: 2 },
    { id: 'c', name: 'Charlie', seed: 3 }, { id: 'd', name: 'Delta', seed: 4 },
  ];
  function match(key: string, a: string, b: string, scoreA: number, scoreB: number): MatchView {
    return {
      id: key, key, phase: 'Round 1', groupKey: null, round: 1,
      slotA: { kind: 'team', teamRef: a, label: a }, slotB: { kind: 'team', teamRef: b, label: b },
      dependsOn: [], courtId: null, courtName: 'Court 1', startMinutes: 540, endMinutes: 560,
      status: 'final', scoreA, scoreB, origin: 'generated',
    };
  }

  it('resolves winners and losers only from final, non-drawn matches', () => {
    const semi = match('S1', 'a', 'b', 10, 5);
    const drawn = match('S2', 'c', 'd', 7, 7);
    const byKey = indexMatches([semi, drawn]);
    expect(resolveSlotTeam({ kind: 'winnerOf', matchKey: 'S1' }, byKey)).toBe('a');
    expect(resolveSlotTeam({ kind: 'loserOf', matchKey: 'S1' }, byKey)).toBe('b');
    expect(resolveSlotTeam({ kind: 'winnerOf', matchKey: 'S2' }, byKey)).toBeNull();
    expect(resolveSlotTeam({ kind: 'winnerOf', matchKey: 'NOPE' }, byKey)).toBeNull();
    expect(resolveSlotTeam({ kind: 'rankOf', scope: 'Group A', rank: 1 }, byKey)).toBeNull();
    expect(resolveSlotTeam({ kind: 'team', teamRef: 'c', label: 'Charlie' }, byKey)).toBe('c');
    const awayWin = match('S3', 'c', 'd', 3, 9);
    expect(resolveSlotTeam({ kind: 'winnerOf', matchKey: 'S3' }, indexMatches([awayWin]))).toBe('d');
    expect(resolveSlotTeam({ kind: 'loserOf', matchKey: 'S3' }, indexMatches([awayWin]))).toBe('c');
    const live = { ...semi, status: 'live' as const };
    expect(resolveSlotTeam({ kind: 'winnerOf', matchKey: 'S1' }, indexMatches([live]))).toBeNull();
    const noScore = { ...semi, scoreA: null };
    expect(resolveSlotTeam({ kind: 'winnerOf', matchKey: 'S1' }, indexMatches([noScore]))).toBeNull();
  });

  it('cannot resolve a final whose own slots are undecided', () => {
    const feeder = match('S1', 'a', 'b', 10, 5);
    const pendingFeeder = { ...feeder, status: 'scheduled' as const };
    const finalMatch: MatchView = {
      ...match('F', 'a', 'c', 9, 1), slotA: { kind: 'winnerOf', matchKey: 'S1' },
    };
    const byKey = indexMatches([pendingFeeder, finalMatch]);
    expect(resolveSlotTeam({ kind: 'winnerOf', matchKey: 'F' }, byKey)).toBeNull();
  });

  it('ranks by points, wins, difference, scored, then seed, ignoring voided points', () => {
    const matches = [match('M1', 'a', 'b', 10, 5), match('M2', 'c', 'd', 8, 8)];
    const entries = [
      { teamId: 'a', points: 3, status: 'active' as const },
      { teamId: 'b', points: 99, status: 'voided' as const },
      { teamId: 'c', points: 1, status: 'active' as const },
      { teamId: 'ghost', points: 50, status: 'active' as const },
    ];
    const standings = computeStandings(teams, matches, entries);
    expect(standings.map((row) => row.teamId)).toEqual(['a', 'c', 'd', 'b']);
    expect(standings[0].rank).toBe(1);
    expect(standingExplanation(standings[0])).toContain('seed 1 breaks any remaining tie');
    expect(standingExplanation({ ...standings[0], scoreDifference: -2 })).toContain('difference -2');
  });

  it('ignores scoreless finals and unresolved finals in standings', () => {
    const scoreless = { ...match('M8', 'a', 'b', 3, 1), scoreA: null };
    const unresolved: MatchView = {
      ...match('M7', 'a', 'b', 3, 1), slotA: { kind: 'rankOf', scope: 'Group A', rank: 1 },
    };
    const standings = computeStandings(teams, [scoreless, unresolved], []);
    expect(standings.every((row) => row.played === 0)).toBe(true);
  });

  it('ignores final matches whose slots cannot resolve to tallied teams', () => {
    const orphan = match('M9', 'x', 'b', 3, 1);
    const standings = computeStandings(teams, [orphan], []);
    expect(standings.every((row) => row.played === 0)).toBe(true);
  });
});

describe('contingency rescheduling', () => {
  function view(partial: Partial<MatchView>): MatchView {
    return {
      id: 'id', key: 'M1', phase: 'Round 1', groupKey: null, round: 1,
      slotA: { kind: 'team', teamRef: 'a', label: 'Alpha' },
      slotB: { kind: 'team', teamRef: 'b', label: 'Bravo' },
      dependsOn: [], courtId: null, courtName: 'Court 1', startMinutes: 540, endMinutes: 560,
      status: 'scheduled', scoreA: null, scoreB: null, origin: 'generated', ...partial,
    };
  }
  const cfg = { courts: 1, matchLengthMinutes: 10, startMinutes: 600, restMinutes: 0 };

  it('keeps locked matches as blockers and re-times the rest', () => {
    const matches = [
      view({ id: 'locked', key: 'M1', status: 'final', startMinutes: 540, endMinutes: 620, scoreA: 5, scoreB: 2 }),
      view({ id: 'next', key: 'M2', startMinutes: 560, endMinutes: 580, dependsOn: ['M1'] }),
      view({ id: 'free', key: 'M3', startMinutes: 580, endMinutes: 600 }),
    ];
    const result = rescheduleFutureMatches(matches, cfg);
    expect(result.find((slot) => slot.matchId === 'next')).toMatchObject({ startMinutes: 620, endMinutes: 630, courtNumber: 1 });
    expect(result.find((slot) => slot.matchId === 'free')?.startMinutes).toBe(630);
  });

  it('handles byes, unknown dep ends, courtless locked matches and out-of-range courts', () => {
    const matches = [
      view({ id: 'done', key: 'M0', status: 'final', courtName: null, endMinutes: null }),
      view({ id: 'far', key: 'M9', status: 'final', courtName: 'Court 9', startMinutes: 540, endMinutes: 700 }),
      view({ id: 'bye-match', key: 'M1', slotB: byeSlot(), courtName: null, startMinutes: null, endMinutes: null }),
      view({ id: 'early', key: 'M2', startMinutes: 540, endMinutes: 560, dependsOn: ['M3'] }),
      view({ id: 'late', key: 'M3', startMinutes: 700, endMinutes: 720 }),
    ];
    const result = rescheduleFutureMatches(matches, cfg);
    expect(result.find((slot) => slot.matchId === 'bye-match')).toEqual({
      matchId: 'bye-match', courtNumber: null, startMinutes: null, endMinutes: null,
    });
    expect(result.find((slot) => slot.matchId === 'early')?.startMinutes).toBe(600);
    const tied = rescheduleFutureMatches([
      view({ id: 'one', key: 'M2', startMinutes: 540, endMinutes: 560 }),
      view({ id: 'two', key: 'M1', startMinutes: 540, endMinutes: 560 }),
      view({ id: 'unset', key: 'M0', startMinutes: null, endMinutes: null }),
    ], cfg);
    expect(tied.map((slot) => slot.matchId)).toEqual(['unset', 'two', 'one']);
    expect(slotLabel(byeSlot())).toBe('BYE');
  });
});

describe('time helpers', () => {
  it('formats and parses minutes', () => {
    expect(formatMinutes(540)).toBe('9:00 AM');
    expect(formatMinutes(780)).toBe('1:00 PM');
    expect(formatMinutes(0)).toBe('12:00 AM');
    expect(parseTimeToMinutes('09:30')).toBe(570);
  });
});
