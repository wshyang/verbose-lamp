import { describe, expect, it } from 'vitest';
import { diffPlacements, plan, type PlanInput } from '../scheduler/planner.js';
import { simulate } from '../scheduler/simulate.js';

const COURTS = [
  { id: 'c1', label: 'Court 1' },
  { id: 'c2', label: 'Court 2' },
];

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    now: 540,
    courts: COURTS,
    matches: [],
    fixed: [],
    finished: [],
    changeoverMinutes: 3,
    restMinutes: 0,
    deadline: null,
    ...overrides,
  };
}

describe('plan — requirement 7: one timetable everybody reads', () => {
  it('fills both courts at once, then the next pair as soon as a court is free', () => {
    const result = plan(
      input({
        matches: [
          { id: 'm1', priority: 1, entrants: ['a', 'b'], dependsOn: [], minutes: 12 },
          { id: 'm2', priority: 2, entrants: ['c', 'd'], dependsOn: [], minutes: 12 },
          { id: 'm3', priority: 3, entrants: ['e', 'f'], dependsOn: [], minutes: 12 },
        ],
      }),
    );
    expect(result.placements.map((row) => [row.matchId, row.courtId, row.start])).toEqual([
      ['m1', 'c1', 540],
      ['m2', 'c2', 540],
      ['m3', 'c1', 555],
    ]);
    expect(result.fit).toMatchObject({ remainingMatches: 3, courtMinutes: 36, projectedFinish: 567, fitsDeadline: null });
  });

  it('never doubles a team, waits for dependencies, and forecasts unknown seats', () => {
    const result = plan(
      input({
        restMinutes: 5,
        matches: [
          { id: 'sf1', priority: 1, entrants: ['a', 'b'], dependsOn: [], minutes: 10 },
          { id: 'sf2', priority: 2, entrants: ['a', 'c'], dependsOn: [], minutes: 10 },
          { id: 'f', priority: 3, entrants: [null, null], dependsOn: ['sf1', 'sf2'], minutes: 10 },
        ],
      }),
    );
    const at = new Map(result.placements.map((row) => [row.matchId, row]));
    expect(at.get('sf2')?.start).toBe(555);
    expect(at.get('f')?.start).toBe((at.get('sf2')?.end ?? 0) + 3);
  });

  it('respects live matches and pins, and flags back-to-back play under a zero-rest rule', () => {
    const result = plan(
      input({
        fixed: [{ matchId: 'live', courtId: 'c1', start: 530, end: 550, entrants: ['a', 'b'] }],
        matches: [{ id: 'next', priority: 1, entrants: ['a', 'c'], dependsOn: [], minutes: 10 }],
        changeoverMinutes: 0,
      }),
    );
    expect(result.placements[0]).toMatchObject({ matchId: 'next', start: 550, isBackToBack: true });
  });

  it('leaves unplaceable matches unplaced, and plans nothing with no courts', () => {
    const orphan = plan(input({ matches: [{ id: 'f', priority: 1, entrants: [null, null], dependsOn: ['missing'], minutes: 10 }] }));
    expect(orphan.placements).toEqual([]);
    const courtless = plan(input({ courts: [], matches: [{ id: 'm', priority: 1, entrants: ['a', 'b'], dependsOn: [], minutes: 10 }] }));
    expect(courtless.placements).toEqual([]);
    expect(courtless.fit.projectedFinish).toBeNull();
  });

  it('reports the fit against a deadline as advice', () => {
    const result = plan(input({ deadline: 545, matches: [{ id: 'm', priority: 1, entrants: ['a', 'b'], dependsOn: [], minutes: 12 }] }));
    expect(result.fit).toMatchObject({ fitsDeadline: false, overrunMinutes: 7 });
    const easy = plan(input({ deadline: 600, matches: [{ id: 'm', priority: 1, entrants: ['a', 'b'], dependsOn: [], minutes: 12 }] }));
    expect(easy.fit).toMatchObject({ fitsDeadline: true, overrunMinutes: 0 });
  });

  it('keeps the next-up match on its court across a re-plan where it can', () => {
    const result = plan(
      input({
        previousNext: [{ courtId: 'c2', matchId: 'm1' }],
        matches: [{ id: 'm1', priority: 1, entrants: ['a', 'b'], dependsOn: [], minutes: 12 }],
      }),
    );
    expect(result.placements[0]?.courtId).toBe('c2');
  });
});

describe('diffPlacements — requirement 8: say what a re-plan disturbs', () => {
  it('names added, moved and removed placements', () => {
    const changes = diffPlacements(
      [
        { matchId: 'a', courtId: 'c1', start: 540 },
        { matchId: 'b', courtId: 'c2', start: 540 },
      ],
      [
        { matchId: 'a', courtId: 'c1', start: 555 },
        { matchId: 'c', courtId: 'c1', start: 570 },
      ],
    );
    expect(changes.map((change) => [change.matchId, change.kind])).toEqual([
      ['a', 'moved'],
      ['c', 'added'],
      ['b', 'removed'],
    ]);
  });
});

describe('simulate — the simulator runs the real engine', () => {
  it('plans a groups-then-knockout day over placeholder teams', () => {
    const result = simulate({
      formatId: 'groups_knockout',
      options: { groupSize: 4, advanceCount: 2 },
      teamCount: 8,
      courtCount: 2,
      matchMinutes: 12,
      changeoverMinutes: 3,
      restMinutes: 0,
      startMinute: 540,
      deadlineMinute: 720,
    });
    expect(result.error).toBeNull();
    expect(result.matches).toHaveLength(12 + 3);
    expect(result.matches.every((row) => row.start !== null)).toBe(true);
    const finalMatch = result.matches[result.matches.length - 1];
    const lastGroup = Math.max(...result.matches.filter((row) => row.stageCode === 'GRP').map((row) => row.end ?? 0));
    expect(finalMatch?.start ?? 0).toBeGreaterThan(lastGroup);
    expect(result.fit?.fitsDeadline).toBe(true);
  });

  it('reports a format that cannot be played, and an unknown one', () => {
    const base = { options: {}, courtCount: 1, matchMinutes: 10, changeoverMinutes: 0, restMinutes: 0, startMinute: 0, deadlineMinute: null };
    expect(simulate({ ...base, formatId: 'consolation', teamCount: 6 }).error).toMatch(/exactly eight/);
    expect(simulate({ ...base, formatId: 'nope' as never, teamCount: 6 }).error).toBe('Unknown format.');
  });

  it('applies the ironman zero-rest rule and marks back-to-back matches', () => {
    const result = simulate({ formatId: 'ironman', options: {}, teamCount: 12, courtCount: 3, matchMinutes: 20, changeoverMinutes: 0, restMinutes: 10, startMinute: 0, deadlineMinute: 100 });
    expect(result.matches.some((row) => row.isBackToBack)).toBe(true);
  });
});
