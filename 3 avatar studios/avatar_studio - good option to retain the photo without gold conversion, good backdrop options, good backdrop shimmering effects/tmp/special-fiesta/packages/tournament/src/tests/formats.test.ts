import { describe, expect, it } from 'vitest';
import { FORMATS, findFormat, isFormatId } from '../scheduler/formats/index.js';
import { bracketOrder, circleRounds, nextPowerOfTwo, ordinal, snakeDeal } from '../scheduler/formats/common.js';
import { defaultSwissRounds, pairWithoutRematch, pairKey, planNextSwissRound } from '../scheduler/formats/swiss.js';
import type { DraftMatch, FormatId, SeededEntrant, Structure } from '../scheduler/types.js';
import { entrants as coreEntrants, match, slotOf, stage, state } from './fixtures.js';

function field(count: number): SeededEntrant[] {
  return Array.from({ length: count }, (_, index) => ({ id: `e${index + 1}`, name: `Team ${index + 1}`, seed: index + 1 }));
}

function build(id: FormatId, count: number, options = {}): Structure {
  const format = findFormat(id);
  if (format === null) throw new Error(id);
  expect(format.validate(count, options)).toBeNull();
  return format.build(field(count), options);
}

/** Every code a seat refers to must exist, earlier in play order (the structure is a DAG). */
function assertWellFormed(structure: Structure): void {
  const order = new Map(structure.matches.map((row, index) => [row.code, index]));
  expect(order.size).toBe(structure.matches.length);
  structure.matches.forEach((row, index) => {
    for (const seat of [row.a, row.b]) {
      if (seat.source.kind === 'winner_of' || seat.source.kind === 'loser_of') {
        expect(order.get(seat.source.code), `${row.code} reads ${seat.source.code}`).toBeLessThan(index);
      }
      expect(seat.source.kind).not.toBe('vacant');
    }
  });
}

function entrantAppearances(matches: readonly DraftMatch[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of matches) {
    for (const seat of [row.a, row.b]) {
      if (seat.source.kind === 'entrant') counts.set(seat.source.entrantId, (counts.get(seat.source.entrantId) ?? 0) + 1);
    }
  }
  return counts;
}

describe('the registry', () => {
  it('registers all ten formats once', () => {
    expect(FORMATS.map((format) => format.id)).toEqual([
      'open',
      'round_robin',
      'groups_knockout',
      'single_elimination',
      'double_elimination',
      'consolation',
      'swiss',
      'flighted_quads',
      'ironman',
      'points_rush',
    ]);
    expect(isFormatId('swiss')).toBe(true);
    expect(isFormatId('nope')).toBe(false);
  });

  it('refuses team counts each format cannot play', () => {
    expect(findFormat('consolation')?.validate(7, {})).toMatch(/exactly eight/);
    expect(findFormat('points_rush')?.validate(7, {})).toMatch(/multiple of three/);
    expect(findFormat('flighted_quads')?.validate(10, {})).toMatch(/multiple of four/);
    expect(findFormat('double_elimination')?.validate(6, {})).toMatch(/4, 8 or 16/);
    expect(findFormat('round_robin')?.validate(1, {})).toMatch(/at least 2/);
    expect(findFormat('round_robin')?.validate(40, {})).toMatch(/at most 16/);
    expect(findFormat('groups_knockout')?.validate(4, { groupSize: 2, advanceCount: 2 })).toMatch(/Fewer teams/);
    expect(findFormat('groups_knockout')?.validate(3, {})).toMatch(/at least 4/);
    expect(findFormat('swiss')?.validate(4, { rounds: 9 })).toMatch(/between 1 and 3/);
    expect(findFormat('swiss')?.validate(2, {})).toMatch(/at least 4/);
  });
});

describe('format shapes', () => {
  it('open play has a stage and no fixtures', () => {
    const structure = build('open', 6);
    expect(structure.matches).toEqual([]);
    expect(structure.stages[0]?.kind).toBe('open');
  });

  it('round robin: everyone meets everyone once, with no phantom match for an odd field', () => {
    const structure = build('round_robin', 5);
    expect(structure.matches).toHaveLength(10);
    expect([...entrantAppearances(structure.matches).values()]).toEqual([4, 4, 4, 4, 4]);
    assertWellFormed(structure);
  });

  it('single elimination: byes are structure, and third place exists only with two semi-finals', () => {
    const six = build('single_elimination', 6, { hasThirdPlace: true });
    assertWellFormed(six);
    expect(six.matches.filter((row) => !row.isPlacement)).toHaveLength(5);
    expect(six.matches.filter((row) => row.isPlacement)).toHaveLength(1);
    expect(build('single_elimination', 2, { hasThirdPlace: true }).matches).toHaveLength(1);
    const adjacent = build('single_elimination', 4, { pairing: 'adjacent' });
    expect(adjacent.matches[0]?.a.label).toBe('Team 1');
    expect(adjacent.matches[0]?.b.label).toBe('Team 2');
  });

  it('groups then knockout: interleaved groups, qualifiers seated from group places', () => {
    const structure = build('groups_knockout', 16, { groupSize: 4, advanceCount: 2, hasThirdPlace: true });
    assertWellFormed(structure);
    expect(structure.groups).toHaveLength(4);
    const groupMatches = structure.matches.filter((row) => row.stageCode === 'GRP');
    expect(groupMatches).toHaveLength(24);
    expect(groupMatches.slice(0, 4).map((row) => row.groupCode)).toEqual(['A', 'B', 'C', 'D']);
    const knockout = structure.matches.filter((row) => row.stageCode === 'KO');
    expect(knockout).toHaveLength(8);
    expect(knockout[0]?.a.source).toMatchObject({ kind: 'group_place', place: 1 });
  });

  it('points rush: pools of three and a final from the overall table', () => {
    const structure = build('points_rush', 12, { hasThirdPlace: true });
    assertWellFormed(structure);
    expect(structure.groups).toHaveLength(4);
    const finals = structure.matches.filter((row) => row.stageCode === 'FINAL');
    expect(finals.map((row) => row.code)).toEqual(['GF', 'P3']);
    expect(finals[0]?.a.source).toMatchObject({ kind: 'stage_place', place: 1 });
    expect(build('points_rush', 6, { hasThirdPlace: true }).matches.filter((row) => row.stageCode === 'FINAL')).toHaveLength(1);
  });

  it('flighted quads: each flight plays two semis, a final and third place', () => {
    const structure = build('flighted_quads', 8);
    assertWellFormed(structure);
    expect(structure.matches).toHaveLength(8);
    expect([...entrantAppearances(structure.matches).values()].every((count) => count === 1)).toBe(true);
  });

  it('double elimination: everyone can lose twice; 2n - 2 matches without a reset', () => {
    for (const count of [4, 8, 16]) {
      const structure = build('double_elimination', count);
      assertWellFormed(structure);
      expect(structure.matches).toHaveLength(2 * count - 2);
      expect(structure.matches[structure.matches.length - 1]?.code).toBe('GF');
    }
  });

  it('consolation: eleven matches — everyone plays at least twice, and fifth place is decided', () => {
    const structure = build('consolation', 8);
    assertWellFormed(structure);
    expect(structure.matches).toHaveLength(11);
    expect(structure.matches.filter((row) => row.isPlacement).map((row) => row.code)).toEqual(['C1', 'C2', '3RD', '5TH']);
  });

  it('ironman: the knockout with a zero-rest policy that flags back-to-backs', () => {
    const structure = build('ironman', 12);
    assertWellFormed(structure);
    expect(findFormat('ironman')?.restPolicy).toEqual({ restMinutes: 0, flagBackToBack: true });
    expect(structure.matches.filter((row) => !row.isPlacement)).toHaveLength(11);
  });

  it('groups then knockout: group-mates are kept apart until the final', () => {
    // Every qualifier label under a bracket match, following winner seats back through the rounds.
    const groupsUnder = (structure: Structure, code: string): Set<string> => {
      const row = structure.matches.find((candidate) => candidate.code === code);
      const groups = new Set<string>();
      for (const seat of row === undefined ? [] : [row.a, row.b]) {
        if (seat.source.kind === 'group_place') groups.add(seat.source.groupCode);
        if (seat.source.kind === 'winner_of') for (const group of groupsUnder(structure, seat.source.code)) groups.add(group);
      }
      return groups;
    };
    const sideGroups = (structure: Structure, seat: DraftMatch['a']): Set<string> => {
      if (seat.source.kind === 'group_place') return new Set([seat.source.groupCode]);
      return seat.source.kind === 'winner_of' ? groupsUnder(structure, seat.source.code) : new Set();
    };
    for (const [teams, groupSize] of [[8, 4], [12, 4], [16, 4], [12, 6]] as const) {
      const structure = build('groups_knockout', teams, { groupSize, advanceCount: 2 });
      const bracket = structure.matches.filter((row) => row.stageCode === 'KO' && !row.isPlacement);
      const final = bracket[bracket.length - 1];
      for (const row of bracket.filter((candidate) => candidate !== final)) {
        const a = sideGroups(structure, row.a);
        const shared = [...sideGroups(structure, row.b)].filter((group) => a.has(group));
        expect(shared, `${teams} teams: ${row.code} ${row.a.label} v ${row.b.label}`).toEqual([]);
      }
    }
    const eight = build('groups_knockout', 8, { groupSize: 4, advanceCount: 2 }).matches.filter((row) => row.stageCode === 'KO');
    expect(eight.slice(0, 2).map((row) => `${row.a.label} v ${row.b.label}`)).toEqual(['1st in Group A v 2nd in Group B', '1st in Group B v 2nd in Group A']);
  });

  it('swiss: round one is seeded, later rounds wait for results', () => {
    const structure = build('swiss', 8);
    expect(structure.matches).toHaveLength(4);
    expect(findFormat('swiss')?.isDynamic).toBe(true);
    expect(defaultSwissRounds(8)).toBe(3);
  });
});

function finished(id: string, input: { a: string; b: string; winner: 'a' | 'b'; round: number }) {
  return match({
    id,
    round: input.round,
    status: 'completed',
    scoreA: input.winner === 'a' ? 1 : 0,
    scoreB: input.winner === 'b' ? 1 : 0,
    result: { kind: 'score', winnerSide: input.winner },
    slots: {
      a: { ...slotOf({ kind: 'entrant', entrantId: input.a }), seatedEntrantId: input.a },
      b: { ...slotOf({ kind: 'entrant', entrantId: input.b }), seatedEntrantId: input.b },
    },
  });
}

describe('swiss pairing', () => {
  it('never pairs a rematch when one can be avoided, and backtracks to find it', () => {
    const played = new Set([pairKey('a', 'b'), pairKey('c', 'd'), pairKey('a', 'c')]);
    expect(pairWithoutRematch(['a', 'b', 'c', 'd'], played)).toEqual([
      ['a', 'd'],
      ['b', 'c'],
    ]);
    expect(pairWithoutRematch(['a', 'b'], new Set([pairKey('a', 'b')]))).toBeNull();
  });

  it('plans round two from the standings, with a bye for an odd field', () => {
    const value = state({
      entrants: coreEntrants(5),
      stages: [stage({ kind: 'swiss' })],
      matches: [finished('r1a', { a: 'e1', b: 'e2', winner: 'a', round: 1 }), finished('r1b', { a: 'e3', b: 'e4', winner: 'a', round: 1 })],
    });
    const plan = planNextSwissRound(value, { stage: stage({ kind: 'swiss' }), rounds: 3 });
    expect(plan?.round).toBe(2);
    expect(plan?.byeEntrantId).toBe('e5');
    expect(plan?.pairs).toHaveLength(2);
    for (const [left, right] of plan?.pairs ?? []) {
      expect([pairKey('e1', 'e2'), pairKey('e3', 'e4')]).not.toContain(pairKey(left, right));
    }
  });

  it('waits while a round is open, and stops after the last round', () => {
    const open = state({ stages: [stage({ kind: 'swiss' })], matches: [match({ id: 'r1', round: 1 })] });
    expect(planNextSwissRound(open, { stage: stage({ kind: 'swiss' }), rounds: 3 })).toBeNull();
    const done = state({ stages: [stage({ kind: 'swiss' })], matches: [finished('r1', { a: 'e1', b: 'e2', winner: 'a', round: 1 })] });
    expect(planNextSwissRound(done, { stage: stage({ kind: 'swiss' }), rounds: 1 })).toBeNull();
  });
});

describe('helpers', () => {
  it('seeds, deals and names consistently', () => {
    expect(bracketOrder(8, 'classic')).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(snakeDeal([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 6],
      [2, 5],
      [3, 4],
    ]);
    expect(circleRounds([1, 2, 3, 4])).toHaveLength(3);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);
  });
});
