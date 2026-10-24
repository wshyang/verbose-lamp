import { describe, expect, it } from 'vitest';
import { buildTournamentBlueprint } from './generator.js';
import { buildSingleElimination, buildWorldCupKnockout, buildIronman, eliminationPhase, pairSlots, resolveBracketPair } from './brackets.js';
import { createMatchDraft, groupRankParticipant, teamParticipant, type DraftParticipant } from './drafts.js';
import { buildFormatDraft } from './formats.js';
import { requireSchedule } from './generator.js';
import { scheduleDrafts } from './scheduler.js';
import { conflict } from '../errors.js';
import type { ModeId, TeamRecord, TournamentSettings } from '../../shared/contracts.js';

const baseSettings: TournamentSettings = {
  teamCount: 8,
  courtCount: 3,
  matchDurationMinutes: 20,
  tournamentLengthMinutes: 240,
  startTimeMinutes: 540,
};

function createTeams(count: number): TeamRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `team-${index + 1}`,
    tournamentId: 'tournament-test',
    name: `Team ${index + 1}`,
    seed: index + 1,
    withdrawnAt: null,
    withdrawalReason: null,
  }));
}

function createBlueprint(mode: ModeId, teamCount: number, overrides: Partial<TournamentSettings> = {}) {
  const teamNames = Array.from({ length: teamCount }, (_, index) => `Team ${index + 1}`);
  return buildTournamentBlueprint({
    tournamentId: 'tournament-test',
    mode,
    settings: { ...baseSettings, ...overrides, teamCount },
    teamNames,
  });
}

describe('format blueprints', () => {
  it.each([
    ['manual', 8, 0],
    ['round-robin', 8, 28],
    ['groups', 8, 12],
    ['swiss', 8, 12],
    ['single-elimination', 8, 7],
    ['consolation', 8, 10],
    ['flighted-quads', 8, 6],
    ['ironman', 12, 11],
    ['points-rush', 12, 13],
    ['world-cup', 10, 23],
  ] as const)('%s creates %i teams of fixtures', (mode, teamCount, matchCount) => {
    const blueprint = createBlueprint(mode, teamCount);
    expect(blueprint.teams).toHaveLength(teamCount);
    expect(blueprint.matches).toHaveLength(matchCount);
    expect(blueprint.matches.every((match) => match.score === null && match.status === 'staged')).toBe(true);
    assertReferencesAreConnected(blueprint.matches);
  });

  it('supports 16- and 32-team World Cup shapes without inventing outcomes', () => {
    const sixteen = createBlueprint('world-cup', 16);
    const thirtyTwo = createBlueprint('world-cup', 32);
    expect(sixteen.matches).toHaveLength(31);
    expect(thirtyTwo.matches).toHaveLength(63);
    expect(thirtyTwo.matches.at(-1)?.phase).toBe('Grand final');
    expect(thirtyTwo.matches.at(-1)?.homeSlot.kind).toBe('winner');
    expect(thirtyTwo.matches.at(-1)?.awaySlot.kind).toBe('winner');
  });

  it('preserves seeded byes, large bracket phases, and unusual pairing edges', () => {
    const nineTeams = createBlueprint('single-elimination', 9);
    const thirtyTwoTeams = createBlueprint('single-elimination', 32);
    expect(nineTeams.matches).toHaveLength(8);
    expect(nineTeams.matches.some((match) => match.phase === 'Play-in')).toBe(true);
    expect(thirtyTwoTeams.matches.some((match) => match.phase === 'Round of 16')).toBe(true);
    expect(eliminationPhase(2, 3, false)).toBe('Round 2');
    const participant: DraftParticipant = teamParticipant(createTeams(1)[0]!);
    expect(pairSlots([participant])).toEqual([[participant, null]]);
    expect(pairSlots(new Array<DraftParticipant | null>(2))).toEqual([[null, null]]);
    expect(resolveBracketPair(null, participant)).toEqual({ kind: 'bye', team: participant });
    expect(resolveBracketPair(participant, null)).toEqual({ kind: 'bye', team: participant });
    expect(resolveBracketPair(null, null)).toEqual({ kind: 'bye', team: null });
    const opponent = teamParticipant(createTeams(2)[1]!);
    expect(resolveBracketPair(participant, opponent)).toEqual({ kind: 'match', home: participant, away: opponent });
  });

  it('keeps lower-level format and schedule guards explicit', () => {
    const sparseTeams = [createTeams(2)[0], undefined] as TeamRecord[];
    expect(() => buildFormatDraft('swiss', sparseTeams)).toThrow('Swiss pairing 1 has no team seed.');
    expect(() => requireSchedule(new Map(), 'missing')).toThrow('Missing schedule for match missing.');
    expect(groupRankParticipant('A', 4).label).toBe('4th · A');
  });

  it('retains the ten-match consolation path, including both winner and loser links', () => {
    const blueprint = createBlueprint('consolation', 8);
    const outcomeKinds = blueprint.matches.flatMap((match) => [match.homeSlot.kind, match.awaySlot.kind]);
    expect(blueprint.matches.some((match) => match.code === 'CON1')).toBe(true);
    expect(outcomeKinds).toContain('loser');
    expect(outcomeKinds).toContain('winner');
  });

  it('retains the 100-minute Ironman interleave on three courts', () => {
    const blueprint = createBlueprint('ironman', 12, { courtCount: 3, matchDurationMinutes: 20 });
    expect(blueprint.scheduleSummary.durationMinutes).toBe(100);
    expect(blueprint.matches.find((match) => match.code === 'FINAL')?.schedule.startMinute).toBe(620);
  });

  it('uses no random outcomes and leaves Swiss round pairings as explicit standing slots', () => {
    const blueprint = createBlueprint('swiss', 9);
    const laterRound = blueprint.matches.filter((match) => match.roundNumber > 1);
    expect(laterRound.every((match) => match.homeSlot.kind === 'swiss-pairing')).toBe(true);
    expect(laterRound.every((match) => match.awaySlot.kind === 'swiss-pairing')).toBe(true);
    expect(blueprint.matches.some((match) => match.homeSlot.label.includes('Winner'))).toBe(false);
  });

  it('balances small groups so no group is left with a single team', () => {
    const blueprint = createBlueprint('groups', 5);
    const groupSizes = new Map<string, Set<string>>();
    blueprint.matches.forEach((match) => {
      const participants = groupSizes.get(match.groupKey ?? '') ?? new Set<string>();
      [match.homeSlot, match.awaySlot].forEach((slot) => {
        if (slot.kind === 'team') participants.add(slot.teamId);
      });
      groupSizes.set(match.groupKey ?? '', participants);
    });
    expect([...groupSizes.values()].map((group) => group.size).sort()).toEqual([2, 3]);
  });

  it('generates every round-robin pairing once for an odd number of teams', () => {
    const blueprint = createBlueprint('round-robin', 5);
    const pairKeys = blueprint.matches.map((match) => [match.homeSlot, match.awaySlot]
      .map((slot) => slot.kind === 'team' ? slot.teamId : '')
      .sort()
      .join('|'));
    expect(blueprint.matches).toHaveLength(10);
    expect(new Set(pairKeys).size).toBe(10);
  });

  it('does not put a direct team on two courts at the same time', () => {
    const blueprint = createBlueprint('round-robin', 10, { courtCount: 4, matchDurationMinutes: 30 });
    const conflicts = blueprint.matches.flatMap((first, index) =>
      blueprint.matches.slice(index + 1).filter((second) =>
        overlaps(first.schedule.startMinute, first.schedule.endMinute, second.schedule.startMinute, second.schedule.endMinute) &&
        teamIds(first).some((teamId) => teamIds(second).includes(teamId)),
      ),
    );
    expect(conflicts).toHaveLength(0);
  });

  it('reports a schedule that exceeds its time budget without blocking generation', () => {
    const blueprint = createBlueprint('round-robin', 12, { courtCount: 1, tournamentLengthMinutes: 30 });
    expect(blueprint.scheduleSummary.fits).toBe(false);
    expect(blueprint.scheduleSummary.matchCount).toBe(66);
  });

  it('rejects impossible internal bracket seeds and missing world-cup group paths', () => {
    expect(() => buildSingleElimination([])).toThrow('Single-elimination requires at least two teams.');
    expect(() => buildIronman([])).toThrow('Team at seed 8 is missing.');
    expect(() => buildWorldCupKnockout(['A'], [], 0)).toThrow('Match path 2 is missing.');
  });

  it('rejects a malformed dependency instead of silently scheduling an orphan', () => {
    const orphan = createMatchDraft(
      'M-1',
      'Round 1',
      1,
      null,
      1,
      teamParticipant(createTeams(1)[0]!),
      teamParticipant(createTeams(1)[0]!),
      ['MISSING'],
    );
    expect(() => scheduleDrafts([orphan], baseSettings)).toThrow(conflict('Match M-1 depends on unscheduled match MISSING.'));
  });

  it('fails if an ID factory cannot supply a persistent match ID', () => {
    expect(() => buildTournamentBlueprint({
      tournamentId: 'tournament-test',
      mode: 'single-elimination',
      settings: baseSettings,
      teamNames: Array.from({ length: 4 }, (_, index) => `Team ${index + 1}`),
      createId: () => '',
    })).toThrow('Missing ID for match SE-R1-M1.');
  });
});

function assertReferencesAreConnected(matches: ReturnType<typeof buildTournamentBlueprint>['matches']): void {
  const ids = new Set(matches.map((match) => match.id));
  matches.forEach((match) => {
    expect(match.dependsOn.every((id) => ids.has(id))).toBe(true);
    [match.homeSlot, match.awaySlot].forEach((slot) => {
      if (slot.kind === 'winner' || slot.kind === 'loser') expect(ids.has(slot.matchId)).toBe(true);
    });
  });
}

function overlaps(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): boolean {
  return firstStart < secondEnd && secondStart < firstEnd;
}

function teamIds(match: ReturnType<typeof buildTournamentBlueprint>['matches'][number]): string[] {
  return [match.homeSlot, match.awaySlot].flatMap((slot) => slot.kind === 'team' ? [slot.teamId] : []);
}
