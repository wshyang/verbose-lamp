import { describe, expect, it } from 'vitest';
import { stageAdHocMatch } from '../core/lifecycle.js';
import {
  advancersRanked,
  completeStage,
  groupPlacesRanked,
  resolveSource,
  stageAdvancers,
  type Group,
  type Match,
  type Stage,
  type TournamentState,
} from '../core/index.js';
import {
  buildPipeline,
  defaultPipelineSpec,
  describePipelineFlow,
  plan,
  simulate,
  validatePipeline,
  type PipelineSpec,
  type SeededEntrant,
} from '../scheduler/index.js';
import { DESK, SYSTEM, context, entrantSlot, entrants, match, ok, refusalCode, slotOf, stage, state } from './fixtures.js';

/**
 * ADR-310 — the stage pipeline: a tournament as a list of stages, each with its own
 * scheduler format, entrant source and match duration. The template (groups →
 * cross-seeded knockout) is only the default presentation of a free-form builder.
 */

function seeded(count: number): SeededEntrant[] {
  return entrants(count).map((entrant, index) => ({ id: entrant.id, name: entrant.name, seed: index + 1 }));
}

describe('the default pipeline (9 teams, 3 courts: groups at 15, knockouts at 20)', () => {
  const spec = defaultPipelineSpec();
  const structure = buildPipeline(spec, seeded(9));

  it('is a pool stage then a bracket stage, each with its own duration', () => {
    expect(structure.stages.map((row) => row.code)).toEqual(['GRP', 'KO']);
    expect(structure.stages.map((row) => row.kind)).toEqual(['pool', 'bracket']);
    expect(structure.stages.map((row) => row.ordinal)).toEqual([1, 2]);
    expect(structure.stages.map((row) => row.matchMinutes)).toEqual([15, 20]);
  });

  it('deals nine teams into three groups of three, snake-wise by seed', () => {
    expect(structure.groups).toHaveLength(3);
    expect(structure.groups.map((group) => group.entrantIds)).toEqual([
      ['e1', 'e6', 'e7'],
      ['e2', 'e5', 'e8'],
      ['e3', 'e4', 'e9'],
    ]);
  });

  it('plays a round robin in each group: nine 15-minute matches', () => {
    const pool = structure.matches.filter((row) => row.stageCode === 'GRP');
    expect(pool).toHaveLength(9);
    expect(new Set(pool.map((row) => row.groupCode))).toEqual(new Set(['A', 'B', 'C']));
    for (const group of structure.groups) {
      expect(pool.filter((row) => row.groupCode === group.code)).toHaveLength(3);
    }
  });

  it('cross-seeds the four advancers into the semis: 1v4 and 2v3', () => {
    const semis = structure.matches.filter((row) => row.stageCode === 'KO' && row.round === 1);
    expect(semis).toHaveLength(2);
    const places = semis.map((row) => [
      row.a.source.kind === 'stage_place' ? row.a.source.place : null,
      row.b.source.kind === 'stage_place' ? row.b.source.place : null,
    ]);
    expect(places).toEqual([
      [1, 4],
      [2, 3],
    ]);
    for (const semi of semis) {
      expect(semi.a.source).toMatchObject({ kind: 'stage_place', stageCode: 'GRP' });
    }
  });

  it('ends in a final fed by the two semi winners, twelve matches in all', () => {
    expect(structure.matches).toHaveLength(12);
    const final = structure.matches.find((row) => row.stageCode === 'KO' && row.round === 2);
    const semis = structure.matches.filter((row) => row.stageCode === 'KO' && row.round === 1);
    expect(final?.a.source).toEqual({ kind: 'winner_of', code: semis[0]?.code });
    expect(final?.b.source).toEqual({ kind: 'winner_of', code: semis[1]?.code });
    const sequences = structure.matches.map((row) => row.sequence);
    expect(new Set(sequences).size).toBe(sequences.length);
    expect(Math.max(...sequences.filter((_, index) => structure.matches[index]?.stageCode === 'GRP'))).toBeLessThan(
      Math.min(...sequences.filter((_, index) => structure.matches[index]?.stageCode === 'KO')),
    );
  });
});

describe('building a pipeline from scratch (the template is only a default)', () => {
  it('a single bracket stage from the initial entrants', () => {
    const spec: PipelineSpec = {
      stages: [
        { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'initial' }, matchMinutes: 20 },
      ],
    };
    const structure = buildPipeline(spec, seeded(4));
    expect(structure.groups).toHaveLength(0);
    expect(structure.matches).toHaveLength(3);
    const semis = structure.matches.filter((row) => row.round === 1);
    expect(semis.map((row) => [row.a.source, row.b.source])).toEqual([
      [{ kind: 'entrant', entrantId: 'e1' }, { kind: 'entrant', entrantId: 'e4' }],
      [{ kind: 'entrant', entrantId: 'e2' }, { kind: 'entrant', entrantId: 'e3' }],
    ]);
  });

  it('a single pool stage with one table when the desk asks for one group', () => {
    const spec: PipelineSpec = {
      stages: [
        {
          code: 'RR',
          label: 'Round robin',
          format: 'pool',
          source: { kind: 'initial' },
          matchMinutes: 15,
          options: { groupCount: 1 },
        },
      ],
    };
    const structure = buildPipeline(spec, seeded(6));
    expect(structure.groups).toHaveLength(1);
    expect(structure.matches).toHaveLength(15);
  });

  it('an open stage contributes its stage and no fixtures', () => {
    const spec: PipelineSpec = {
      stages: [{ code: 'OPEN', label: 'Open play', format: 'open', source: { kind: 'initial' }, matchMinutes: null }],
    };
    const structure = buildPipeline(spec, seeded(6));
    expect(structure.stages[0]?.kind).toBe('open');
    expect(structure.matches).toHaveLength(0);
  });

  it('a third-place match rides on the bracket when asked for', () => {
    const spec: PipelineSpec = {
      stages: [
        {
          code: 'KO',
          label: 'Knockout',
          format: 'bracket',
          source: { kind: 'initial' },
          matchMinutes: 20,
          options: { hasThirdPlace: true },
        },
      ],
    };
    const structure = buildPipeline(spec, seeded(4));
    const placement = structure.matches.find((row) => row.isPlacement);
    expect(placement?.a.source.kind).toBe('loser_of');
    expect(structure.matches).toHaveLength(4);
  });

  it('carries per-stage internal table points onto the draft stages, apart from the paid rates', () => {
    const spec: PipelineSpec = {
      stages: [
        {
          code: 'GRP',
          label: 'Groups',
          format: 'pool',
          source: { kind: 'initial' },
          matchMinutes: 15,
          options: { groupSize: 3, advanceCount: 1, rates: { win: 10, draw: 5, loss: 0 }, tablePoints: { win: 2, draw: 1, loss: 0 } },
        },
        {
          code: 'KO',
          label: 'Knockout',
          format: 'bracket',
          source: { kind: 'advancers', fromStage: 'GRP', count: 4 },
          matchMinutes: 20,
        },
      ],
    };
    const structure = buildPipeline(spec, seeded(9));
    expect(structure.stages[0]?.tablePoints).toEqual({ win: 2, draw: 1, loss: 0 });
    expect(structure.stages[0]?.rates).toEqual({ win: 10, draw: 5, loss: 0 });
    expect(structure.stages[1]?.tablePoints).toBeNull();
  });

  it('carries per-stage point rates onto the draft stages', () => {
    const spec: PipelineSpec = {
      stages: [
        {
          code: 'GRP',
          label: 'Groups',
          format: 'pool',
          source: { kind: 'initial' },
          matchMinutes: 15,
          options: { groupSize: 3, rates: { win: 10, draw: 5, loss: 0 } },
        },
        {
          code: 'KO',
          label: 'Knockout',
          format: 'bracket',
          source: { kind: 'advancers', fromStage: 'GRP', count: 4 },
          matchMinutes: 20,
          options: { rates: { win: 30, draw: 0, loss: 10 } },
        },
      ],
    };
    const structure = buildPipeline(spec, seeded(9));
    expect(structure.stages[0]?.rates).toEqual({ win: 10, draw: 5, loss: 0 });
    expect(structure.stages[1]?.rates).toEqual({ win: 30, draw: 0, loss: 10 });
  });
});

describe('validatePipeline', () => {
  const teams = 9;

  it('accepts the default and a bare bracket', () => {
    expect(validatePipeline(defaultPipelineSpec(), teams)).toBeNull();
    expect(
      validatePipeline(
        { stages: [{ code: 'KO', label: 'KO', format: 'bracket', source: { kind: 'initial' }, matchMinutes: 20 }] },
        4,
      ),
    ).toBeNull();
  });

  it('refuses an empty pipeline and duplicate stage codes', () => {
    expect(validatePipeline({ stages: [] }, teams)).toMatch(/at least one stage/i);
    const stageSpec = { code: 'A', label: 'One', format: 'open' as const, source: { kind: 'initial' as const }, matchMinutes: null };
    expect(validatePipeline({ stages: [stageSpec, { ...stageSpec, label: 'Two' }] }, teams)).toMatch(/unique/i);
  });

  it('refuses advancers from a stage that is not earlier', () => {
    const bracket = {
      code: 'KO',
      label: 'KO',
      format: 'bracket' as const,
      source: { kind: 'advancers' as const, fromStage: 'GRP', count: 4 },
      matchMinutes: 20,
    };
    expect(validatePipeline({ stages: [bracket] }, teams)).toMatch(/earlier stage/i);
    const pool = {
      code: 'GRP',
      label: 'Groups',
      format: 'pool' as const,
      source: { kind: 'initial' as const },
      matchMinutes: 15,
      options: { groupSize: 3 },
    };
    expect(validatePipeline({ stages: [bracket, pool] }, teams)).toMatch(/earlier stage/i);
  });

  it('accepts a pool fed by advancers: its groups are dealt from places, and filled when the feeder closes (ADR-325)', () => {
    const spec: PipelineSpec = {
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3 } },
        { code: 'P2', label: 'Pools again', format: 'pool', source: { kind: 'advancers', fromStage: 'GRP', count: 6 }, matchMinutes: 15, options: { groupCount: 2 } },
      ],
    };
    expect(validatePipeline(spec, teams)).toBeNull();
  });

  it('still refuses a pool whose groups would have fewer than two teams once the intake is counted', () => {
    const spec: PipelineSpec = {
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3 } },
        { code: 'P2', label: 'Pools again', format: 'pool', source: { kind: 'advancers', fromStage: 'GRP', count: 4 }, matchMinutes: 15, options: { groupCount: 4 } },
      ],
    };
    expect(validatePipeline(spec, teams)).toMatch(/at least two/i);
  });

  it('accepts an open stage fed by advancers', () => {
    const spec: PipelineSpec = {
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3 } },
        { code: 'FUN', label: 'Open play', format: 'open', source: { kind: 'advancers', fromStage: 'GRP', count: 4 }, matchMinutes: 10 },
      ],
    };
    expect(validatePipeline(spec, teams)).toBeNull();
  });

  it('refuses impossible advancer counts and durations', () => {
    const base = defaultPipelineSpec();
    const withCount = (count: number): PipelineSpec => ({
      stages: base.stages.map((row) =>
        row.code === 'KO' ? { ...row, source: { kind: 'advancers' as const, fromStage: 'GRP', count } } : row,
      ),
    });
    expect(validatePipeline(withCount(1), teams)).toMatch(/at least two/i);
    expect(validatePipeline(withCount(10), teams)).toMatch(/no more than/i);
    const withMinutes = (matchMinutes: number): PipelineSpec => ({
      stages: base.stages.map((row) => (row.code === 'GRP' ? { ...row, matchMinutes } : row)),
    });
    expect(validatePipeline(withMinutes(0), teams)).toMatch(/between 1 and 180/i);
    expect(validatePipeline(withMinutes(181), teams)).toMatch(/between 1 and 180/i);
  });

  it('reconciles the handover: an intake inside the feeder’s field is a plan, beyond it a refusal (ADR-320)', () => {
    const feed = (count: number): PipelineSpec => ({
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3, advanceCount: 1 } },
        { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'GRP', count }, matchMinutes: 20 },
      ],
    });
    // Three groups, one through each: only three qualifiers, yet a 4- or 6-team
    // knockout is satisfiable — the rest are shortfall fills from the internal table.
    expect(validatePipeline(feed(4), 9)).toBeNull();
    expect(validatePipeline(feed(6), 9)).toBeNull();
    expect(validatePipeline(feed(9), 9)).toBeNull();
    // Two seats would leave out one group's winner. Three is the floor: every qualifier
    // goes through first, and only seats past that floor may be ranked fills (ADR-328).
    expect(validatePipeline(feed(2), 9)).toMatch(/3 qualifiers \(3 groups × 1 per group\).*only 2/);
    expect(validatePipeline(feed(3), 9)).toBeNull();

    const twoPerGroup = (count: number): PipelineSpec => ({
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3, advanceCount: 2 } },
        { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'GRP', count }, matchMinutes: 20 },
      ],
    });
    expect(validatePipeline(twoPerGroup(5), 9)).toMatch(/6 qualifiers \(3 groups × 2 per group\).*only 5/);
    expect(validatePipeline(twoPerGroup(6), 9)).toBeNull();
    expect(validatePipeline(twoPerGroup(7), 9)).toBeNull();

    // The floor is the feeder's output shape, so it binds every kind of successive stage.
    const openShort: PipelineSpec = {
      stages: [
        twoPerGroup(6).stages[0]!,
        { code: 'FUN', label: 'Open play', format: 'open', source: { kind: 'advancers', fromStage: 'GRP', count: 5 }, matchMinutes: 10 },
      ],
    };
    expect(validatePipeline(openShort, 9)).toMatch(/6 qualifiers.*only 5/);
    // Beyond the field the feeder ranks, there is nobody left to fill with.
    const chained: PipelineSpec = {
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3, advanceCount: 1 } },
        { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'GRP', count: 4 }, matchMinutes: 20 },
        { code: 'FIN', label: 'Finals', format: 'bracket', source: { kind: 'advancers', fromStage: 'KO', count: 6 }, matchMinutes: 20 },
      ],
    };
    expect(validatePipeline(chained, 9)).toMatch(/KO only has 4 teams to send on/);
  });

  it('refuses groups smaller than two teams', () => {
    const spec: PipelineSpec = {
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupCount: 4 } },
      ],
    };
    expect(validatePipeline(spec, 6)).toMatch(/at least two teams/i);
  });

  it('refuses a pool stage that sends nobody through from a group (ADR-328)', () => {
    const spec: PipelineSpec = {
      stages: [{ code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3, advanceCount: 0 } }],
    };
    expect(validatePipeline(spec, teams)).toMatch(/at least one team.*each group/i);
  });
});

/** A played-out group stage over three groups of three (see the tally notes in the test). */
function playedGroupState(): { value: TournamentState; pool: Stage } {
  const pool = stage({ id: 's1', kind: 'pool', advanceCount: 1 });
  const groups: Group[] = [
    { id: 'gA', stageId: 's1', code: 'A', label: 'Group A', entrantIds: ['e1', 'e2', 'e3'] },
    { id: 'gB', stageId: 's1', code: 'B', label: 'Group B', entrantIds: ['e4', 'e5', 'e6'] },
    { id: 'gC', stageId: 's1', code: 'C', label: 'Group C', entrantIds: ['e7', 'e8', 'e9'] },
  ];
  const played = (input: { id: string; groupId: string; a: string; b: string; scoreA: number; scoreB: number }): Match =>
    match({
      id: input.id,
      stageId: 's1',
      groupId: input.groupId,
      status: 'completed',
      scoreA: input.scoreA,
      scoreB: input.scoreB,
      result: { kind: 'score', winnerSide: input.scoreA === input.scoreB ? null : input.scoreA > input.scoreB ? 'a' : 'b' },
      slots: {
        a: { ...entrantSlot(input.a), seatedEntrantId: input.a },
        b: { ...entrantSlot(input.b), seatedEntrantId: input.b },
      },
    });
  const matches = [
    played({ id: 'a1', groupId: 'gA', a: 'e1', b: 'e2', scoreA: 5, scoreB: 0 }),
    played({ id: 'a2', groupId: 'gA', a: 'e1', b: 'e3', scoreA: 5, scoreB: 0 }),
    played({ id: 'a3', groupId: 'gA', a: 'e2', b: 'e3', scoreA: 1, scoreB: 0 }),
    played({ id: 'b1', groupId: 'gB', a: 'e4', b: 'e5', scoreA: 2, scoreB: 0 }),
    played({ id: 'b2', groupId: 'gB', a: 'e4', b: 'e6', scoreA: 1, scoreB: 1 }),
    played({ id: 'b3', groupId: 'gB', a: 'e5', b: 'e6', scoreA: 5, scoreB: 0 }),
    played({ id: 'c1', groupId: 'gC', a: 'e7', b: 'e8', scoreA: 1, scoreB: 0 }),
    played({ id: 'c2', groupId: 'gC', a: 'e7', b: 'e9', scoreA: 1, scoreB: 0 }),
    played({ id: 'c3', groupId: 'gC', a: 'e8', b: 'e9', scoreA: 4, scoreB: 0 }),
  ];
  return { value: state({ entrants: entrants(9), stages: [pool], groups, matches }), pool };
}

describe('advancersRanked (place-major: winners first, then the best runners-up)', () => {
  it('ranks every finisher: place class first, then points, difference, scored', () => {
    const { value, pool } = playedGroupState();
    // Winners: e1 (6 pts, +10), e7 (6, +2), e4 (4). Runners-up: e5 (3, +3, 5 scored),
    // e8 (3, +3, 4 scored — separated on goals), e2 (3, −4). Thirds: e6, e9, e3.
    expect(advancersRanked(value, pool).map((row) => row.entrantId)).toEqual([
      'e1', 'e7', 'e4', 'e5', 'e8', 'e2', 'e6', 'e9', 'e3',
    ]);
  });

  it('separates level runners-up on scored after difference', () => {
    const { value, pool } = playedGroupState();
    const runnersUp = groupPlacesRanked(value, pool, 2);
    expect(runnersUp.map((row) => row.entrantId)).toEqual(['e5', 'e8', 'e2']);
    expect(runnersUp[0]).toMatchObject({ points: 3, difference: 3, scored: 5 });
    expect(runnersUp[1]).toMatchObject({ points: 3, difference: 3, scored: 4 });
  });

  it('seats advancer #4 as the best runner-up once the stage is finished, and nobody before', () => {
    const { value, pool } = playedGroupState();
    void pool;
    expect(resolveSource(value, { kind: 'stage_place', stageId: 's1', place: 4 })).toBe('e5');
    expect(resolveSource(value, { kind: 'stage_place', stageId: 's1', place: 1 })).toBe('e1');

    const unfinished: TournamentState = {
      ...value,
      matches: value.matches.map((row) => (row.id === 'c3' ? { ...row, status: 'scheduled' as const, result: null } : row)),
    };
    expect(resolveSource(unfinished, { kind: 'stage_place', stageId: 's1', place: 4 })).toBeNull();
  });
});

describe('stageAdvancers — qualifiers first, then shortfall fills, each named (ADR-320)', () => {
  it('labels the fourth seat of a 4-team knockout fed by three group winners as a fill', () => {
    const { value, pool } = playedGroupState();
    const places = stageAdvancers(value, pool, 4);
    expect(places.map((place) => [place.row.entrantId, place.via])).toEqual([
      ['e1', 'qualifier'],
      ['e7', 'qualifier'],
      ['e4', 'qualifier'],
      ['e5', 'fill'],
    ]);
    // Without a downstream intake the stage's own qualifying count is the answer.
    expect(stageAdvancers(value, pool).map((place) => place.row.entrantId)).toEqual(['e1', 'e7', 'e4']);
    // At exactly the qualifier count there are no fills and no qualifier is displaced.
    expect(stageAdvancers(value, pool, 3).map((place) => [place.row.entrantId, place.via])).toEqual([
      ['e1', 'qualifier'],
      ['e7', 'qualifier'],
      ['e4', 'qualifier'],
    ]);
  });

  it('the scheduler may not decide a tie for the last fill seat; the desk may, and the fill is seated', () => {
    const { value, pool } = playedGroupState();
    // Make the two best runners-up identical: e5 and e8 both W1 L1, 2 scored, +1.
    const tiedMatches = value.matches.map((row) => {
      if (row.id === 'b1') return { ...row, scoreA: 1, scoreB: 0 };
      if (row.id === 'b3') return { ...row, scoreA: 2, scoreB: 0 };
      if (row.id === 'c3') return { ...row, scoreA: 2, scoreB: 0 };
      return row;
    });
    const bracket = stage({ id: 's2', ordinal: 2, label: 'Knockout', kind: 'bracket', allowsDraws: false, advanceCount: 0, status: 'pending' });
    const seat = (id: string, place: number, side: 'a' | 'b') => ({
      id,
      stageId: 's2',
      slots:
        side === 'a'
          ? { a: slotOf({ kind: 'stage_place', stageId: 's1', place }), b: slotOf({ kind: 'stage_place', stageId: 's1', place: place + 1 }) }
          : { a: slotOf({ kind: 'stage_place', stageId: 's1', place }), b: slotOf({ kind: 'stage_place', stageId: 's1', place: place + 1 }) },
    });
    const semis = [match({ ...seat('sf1', 1, 'a') }), match({ ...seat('sf2', 3, 'a') })];
    const tied: TournamentState = { ...value, stages: [pool, bracket], matches: [...tiedMatches, ...semis] };
    expect(refusalCode(completeStage(tied, { stageId: 's1', overrides: [], reason: null }, context(SYSTEM)))).toBe('tie_on_cut');
    const closed = ok(completeStage(tied, { stageId: 's1', overrides: [], reason: null }, context(DESK)));
    const sf2 = closed.state.matches.find((row) => row.id === 'sf2');
    // Seed 4 is the fill seat: one of the level runners-up, seated by the desk's close.
    expect(sf2?.slots.b.seatedEntrantId).toBe(stageAdvancers(tied, pool, 4)[3]?.row.entrantId);
    expect(sf2?.slots.b.seatedEntrantId).toBe('e5');
  });
});

describe('simulate a pipeline (the rehearsal the Simulator subtab runs)', () => {
  const base = { teamCount: 9, courtCount: 3, matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 };

  it('plans the template with its own durations and reads the fit against the hard stop', () => {
    const result = simulate({ ...base, pipeline: defaultPipelineSpec(), startMinute: 600, deadlineMinute: 690 });
    expect(result.error).toBeNull();
    expect(result.matches).toHaveLength(12);
    // 3 group waves of 15, a semi wave and a final of 20, 3-minute changeovers: 97 all told.
    expect(result.fit?.projectedFinish).toBe(697);
    expect(result.fit?.fitsDeadline).toBe(false);
    expect(result.fit?.overrunMinutes).toBe(7);
    const semi = result.matches.find((match) => match.stageCode === 'KO' && match.round === 1);
    expect(semi === undefined ? null : (semi.end ?? 0) - (semi.start ?? 0)).toBe(20);
  });

  it('refuses a pipeline that cannot be built, in the validator’s words', () => {
    const result = simulate({
      ...base,
      pipeline: {
        stages: [
          { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'GRP', count: 4 }, matchMinutes: 20 },
        ],
      },
      startMinute: 600,
      deadlineMinute: null,
    });
    expect(result.error).toMatch(/earlier stage/i);
    expect(result.structure).toBeNull();
    expect(result.matches).toEqual([]);
  });
});

describe('per-stage durations in the planner', () => {
  it('gives pool matches 15 and knockout matches 20 on the one clock', () => {
    const result = plan({
      now: 0,
      courts: [
        { id: 'c1', label: 'Court 1' },
        { id: 'c2', label: 'Court 2' },
        { id: 'c3', label: 'Court 3' },
      ],
      matches: [
        { id: 'p1', priority: 1, entrants: ['e1', 'e2'], dependsOn: [], minutes: 15 },
        { id: 'p2', priority: 2, entrants: ['e3', 'e4'], dependsOn: [], minutes: 15 },
        { id: 'p3', priority: 3, entrants: ['e5', 'e6'], dependsOn: [], minutes: 15 },
        { id: 'sf', priority: 4, entrants: [null, null], dependsOn: ['p1', 'p2', 'p3'], minutes: 20 },
      ],
      fixed: [],
      finished: [],
      changeoverMinutes: 5,
      restMinutes: 10,
      deadline: null,
    });
    const byId = new Map(result.placements.map((row) => [row.matchId, row]));
    expect(byId.get('p1')).toMatchObject({ start: 0, end: 15 });
    // The semi waits for the last pool match plus the changeover, then runs its 20.
    expect(byId.get('sf')).toMatchObject({ start: 20, end: 40 });
    expect(result.fit.courtMinutes).toBe(3 * 15 + 20);
  });
});


describe('a pool fed by advancers (ADR-325)', () => {
  const spec: PipelineSpec = {
    stages: [
      { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3, advanceCount: 2 } },
      { code: 'P2', label: 'Second pools', format: 'pool', source: { kind: 'advancers', fromStage: 'GRP', count: 6 }, matchMinutes: 15, options: { groupCount: 2, advanceCount: 1 } },
    ],
  };
  const structure = buildPipeline(spec, seeded(9));
  const second = structure.matches.filter((row) => row.stageCode === 'P2');

  it('deals SEATS into groups, snake-wise by place, and leaves the members for the feeder to decide', () => {
    const groups = structure.groups.filter((group) => group.stageCode === 'P2');
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.entrantIds)).toEqual([[], []]);
    const seatsOf = (code: string) =>
      second
        .filter((row) => row.groupCode === code)
        .flatMap((row) => [row.a, row.b])
        .map((slot) => (slot.source.kind === 'stage_place' ? slot.source.place : -1));
    // Six places snake-dealt into two groups: A holds #1 #4 #5, B holds #2 #3 #6.
    expect([...new Set(seatsOf(groups[0]?.code ?? ''))].sort()).toEqual([1, 4, 5]);
    expect([...new Set(seatsOf(groups[1]?.code ?? ''))].sort()).toEqual([2, 3, 6]);
  });

  it('plays a round robin of three in each group: three matches each, none against an entrant directly', () => {
    expect(second).toHaveLength(6);
    for (const row of second) {
      expect(row.a.source.kind).toBe('stage_place');
      expect(row.b.source.kind).toBe('stage_place');
    }
  });

  it('labels each seat by its place in the feeder, so the desk can read the plan before anyone has qualified', () => {
    const labels = new Set(second.flatMap((row) => [row.a.label, row.b.label]));
    expect(labels).toEqual(new Set(['#1 overall', '#2 overall', '#3 overall', '#4 overall', '#5 overall', '#6 overall']));
  });

  it('gives every group a code that is unique across the WHOLE structure, not only within its stage', () => {
    // materialise keys its ids by group code, so two pool stages both calling their groups A and B
    // used to collide on the second insert. The first stage keeps its familiar letters.
    const codes = structure.groups.map((group) => group.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(structure.groups.filter((group) => group.stageCode === 'GRP').map((group) => group.code)).toEqual(['A', 'B', 'C']);
    // Every fixture's group code names a group that exists.
    for (const row of structure.matches.filter((match) => match.groupCode !== null)) {
      expect(codes).toContain(row.groupCode);
    }
  });

  it('gives every match a code that is unique across the whole structure, and keeps every reference to it intact', () => {
    // The adapter keys match ids by code. Two pool stages both numbering their fixtures A1, A2 ...
    // gave two matches the same id on activation: caught against a real database, not by the engine.
    const codes = structure.matches.map((row) => row.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const row of structure.matches) {
      for (const seat of [row.a, row.b]) {
        if (seat.source.kind === 'winner_of' || seat.source.kind === 'loser_of') expect(codes).toContain(seat.source.code);
      }
    }
  });

  it('still deals the feeder from the entered teams', () => {
    const first = structure.groups.filter((group) => group.stageCode === 'GRP');
    expect(first.every((group) => group.entrantIds.length === 3)).toBe(true);
  });
});

describe('closing a stage that feeds a pool (ADR-325)', () => {
  /** The nine-team group stage above, followed by a two-group pool of six seats: #1..#6 overall. */
  function fedPoolState() {
    const { value, pool } = playedGroupState();
    const second = stage({ id: 's2', ordinal: 2, label: 'Second pools', kind: 'pool', advanceCount: 1, status: 'pending' });
    const place = (n: number) => slotOf({ kind: 'stage_place', stageId: 's1', place: n }, `#${n} overall`);
    // Snake-dealt places: A = #1 #4 #5, B = #2 #3 #6. Each group a round robin of three.
    const gA: Group = { id: 'gP-A', stageId: 's2', code: 'PA', label: 'Group A', entrantIds: [] };
    const gB: Group = { id: 'gP-B', stageId: 's2', code: 'PB', label: 'Group B', entrantIds: [] };
    const fixture = (id: string, group: Group, places: [number, number]) =>
      match({ id, stageId: 's2', groupId: group.id, slots: { a: place(places[0]), b: place(places[1]) } });
    const matches = [
      fixture('pa1', gA, [1, 5]),
      fixture('pa2', gA, [4, 1]),
      fixture('pa3', gA, [5, 4]),
      fixture('pb1', gB, [2, 6]),
      fixture('pb2', gB, [3, 2]),
      fixture('pb3', gB, [6, 3]),
    ];
    const withFed: TournamentState = {
      ...value,
      stages: [{ ...pool, advanceCount: 2 }, second],
      groups: [...value.groups, gA, gB],
      matches: [...value.matches, ...matches],
    };
    return withFed;
  }

  it('fills each fed group with the people who took its places, in place order', () => {
    const closed = ok(completeStage(fedPoolState(), { stageId: 's1', overrides: [], reason: null }, context(DESK)));
    const groups = closed.state.groups.filter((group) => group.stageId === 's2');
    // advancersRanked for the nine-team fixture is e1 e7 e4 e5 e8 e2 e6 e9 e3, so places 1..6 are
    // e1 e7 e4 e5 e8 e2: group A holds #1 #4 #5 = e1 e5 e8, group B holds #2 #3 #6 = e7 e4 e2.
    expect(groups.find((group) => group.code === 'PA')?.entrantIds).toEqual(['e1', 'e5', 'e8']);
    expect(groups.find((group) => group.code === 'PB')?.entrantIds).toEqual(['e7', 'e4', 'e2']);
  });

  it('does not touch a group that already has members', () => {
    const base = fedPoolState();
    const preset = { ...base, groups: base.groups.map((group) => (group.code === 'PA' ? { ...group, entrantIds: ['e9', 'e3'] } : group)) };
    const closed = ok(completeStage(preset, { stageId: 's1', overrides: [], reason: null }, context(DESK)));
    expect(closed.state.groups.find((group) => group.code === 'PA')?.entrantIds).toEqual(['e9', 'e3']);
  });

  it('seats the fixtures too, so the second stage can be played the moment the first closes', () => {
    const closed = ok(completeStage(fedPoolState(), { stageId: 's1', overrides: [], reason: null }, context(DESK)));
    const first = closed.state.matches.find((row) => row.id === 'pa1');
    // pa1 is #1 v #5; advancer order is e1 e7 e4 e5 e8 e2, so #1 is e1 and #5 is e8.
    expect([first?.slots.a.seatedEntrantId, first?.slots.b.seatedEntrantId]).toEqual(['e1', 'e8']);
  });

  it('puts an override on a PLACE, so a team is never half in a group', () => {
    const closed = ok(
      completeStage(
        fedPoolState(),
        { stageId: 's1', overrides: [{ matchId: 'pa1', side: 'a', entrantId: 'e9' }], reason: 'Reds withdrew' },
        context(DESK),
      ),
    );
    // Place #1 was overruled to e9: every fixture that reads #1, in either group seat, now names e9.
    const reading = closed.state.matches.filter((row) => row.stageId === 's2' && (row.slots.a.source.kind === 'stage_place' && row.slots.a.source.place === 1));
    expect(reading.length).toBeGreaterThan(0);
    for (const row of reading) expect(row.slots.a.seatedEntrantId).toBe('e9');
    expect(closed.state.groups.find((group) => group.code === 'PA')?.entrantIds[0]).toBe('e9');
  });

  it('leaves a bracket fed from the same stage working as before', () => {
    const { value, pool } = playedGroupState();
    const bracket = stage({ id: 's2', ordinal: 2, label: 'Knockout', kind: 'bracket', allowsDraws: false, advanceCount: 0, status: 'pending' });
    const semi = match({
      id: 'sf1',
      stageId: 's2',
      slots: {
        a: slotOf({ kind: 'stage_place', stageId: 's1', place: 1 }),
        b: slotOf({ kind: 'stage_place', stageId: 's1', place: 2 }),
      },
    });
    const closed = ok(completeStage({ ...value, stages: [pool, bracket], matches: [...value.matches, semi] }, { stageId: 's1', overrides: [], reason: null }, context(DESK)));
    expect(closed.state.matches.find((row) => row.id === 'sf1')?.slots.a.seatedEntrantId).toBe('e1');
  });
});


describe('an open stage fed by advancers plays only the teams that came through (ADR-325)', () => {
  function fedOpenState() {
    const { value, pool } = playedGroupState();
    const open = stage({
      id: 's2',
      ordinal: 2,
      label: 'Open play',
      kind: 'open',
      advanceCount: 0,
      status: 'pending',
      intake: { fromStageId: 's1', count: 4 },
    });
    return { ...value, stages: [{ ...pool, advanceCount: 1 }, open] } as TournamentState;
  }
  const stageIt = (value: TournamentState, teams: [string, string]) =>
    stageAdHocMatch(value, { courtId: 'c1', entrantAId: teams[0], entrantBId: teams[1], plannedMinutes: 10 }, context(DESK, ['x1']));

  it('reports its intake from the fed stage itself, since an open stage has no fixtures that read places', () => {
    const value = fedOpenState();
    const feeder = value.stages.find((row) => row.id === 's1');
    if (feeder === undefined) throw new Error('no feeder');
    // Three group winners qualify; the open stage asks for four, so the fourth is a fill.
    expect(stageAdvancers(value, feeder).map((place) => [place.row.entrantId, place.via])).toEqual([
      ['e1', 'qualifier'],
      ['e7', 'qualifier'],
      ['e4', 'qualifier'],
      ['e5', 'fill'],
    ]);
  });

  it('learns its roster when the feeder closes: the top four in advancer order', () => {
    const closed = ok(completeStage(fedOpenState(), { stageId: 's1', overrides: [], reason: null }, context(DESK)));
    expect(closed.state.stages.find((row) => row.id === 's2')?.roster).toEqual(['e1', 'e7', 'e4', 'e5']);
  });

  it('puts a desk override into the roster at the place it overruled, so the overruled team may not play', () => {
    const base = fedOpenState();
    const semi = match({
      id: 'o1',
      stageId: 's2',
      slots: { a: slotOf({ kind: 'stage_place', stageId: 's1', place: 1 }), b: slotOf({ kind: 'stage_place', stageId: 's1', place: 2 }) },
    });
    const withSeat: TournamentState = { ...base, matches: [...base.matches, semi] };
    const closed = ok(
      completeStage(withSeat, { stageId: 's1', overrides: [{ matchId: 'o1', side: 'a', entrantId: 'e9' }], reason: 'Reds withdrew' }, context(DESK)),
    );
    // Place #1 was e1; the desk named e9 instead. The roster follows the desk.
    expect(closed.state.stages.find((row) => row.id === 's2')?.roster).toEqual(['e9', 'e7', 'e4', 'e5']);
    expect(refusalCode(stageIt(closed.state, ['e1', 'e5']))).toBe('not_in_stage');
    expect(ok(stageIt(closed.state, ['e9', 'e5'])).state.matches.some((row) => row.origin === 'ad_hoc')).toBe(true);
  });

  it('lets two of the fed teams play', () => {
    const closed = ok(completeStage(fedOpenState(), { stageId: 's1', overrides: [], reason: null }, context(DESK)));
    expect(ok(stageIt(closed.state, ['e1', 'e5'])).state.matches.some((row) => row.origin === 'ad_hoc')).toBe(true);
  });

  it('accepts a place-form override for a fed open stage, which has no fixture seat to name (ADR-329 F2)', () => {
    const closed = ok(
      completeStage(fedOpenState(), { stageId: 's1', overrides: [{ place: 1, entrantId: 'e9' }], reason: 'Winner is absent' }, context(DESK)),
    );
    expect(closed.state.stages.find((row) => row.id === 's2')?.roster).toEqual(['e9', 'e7', 'e4', 'e5']);
    expect(refusalCode(completeStage(fedOpenState(), { stageId: 's1', overrides: [{ place: 1, entrantId: 'e9' }], reason: null }, context(DESK)))).toBe(
      'reason_required',
    );
  });

  it('refuses a team that did not come through, naming the reason', () => {
    const closed = ok(completeStage(fedOpenState(), { stageId: 's1', overrides: [], reason: null }, context(DESK)));
    const refused = stageIt(closed.state, ['e1', 'e9']);
    expect(refusalCode(refused)).toBe('not_in_stage');
  });

  it('refuses any match in the stage while the feeder is still open: nobody has come through yet', () => {
    const open = stage({ id: 's2', ordinal: 2, kind: 'open', advanceCount: 0, status: 'active', intake: { fromStageId: 's1', count: 4 } });
    const before = state({ stages: [open], entrants: entrants(9) });
    expect(refusalCode(stageIt(before, ['e1', 'e2']))).toBe('stage_not_fed');
  });

  it('leaves an open stage with no feeder, and every other kind of stage, accepting any two teams', () => {
    const unfed = state({ stages: [stage({ id: 's2', kind: 'open', advanceCount: 0 })], entrants: entrants(9) });
    expect(ok(stageIt(unfed, ['e1', 'e9'])).state.matches).toHaveLength(1);
    const bracket = state({ stages: [stage({ id: 's2', kind: 'bracket', allowsDraws: false, intake: { fromStageId: 's1', count: 4 } })], entrants: entrants(9) });
    expect(ok(stageIt(bracket, ['e1', 'e9'])).state.matches).toHaveLength(1);
  });
});


describe('describePipelineFlow — what each stage takes in and sends on (ADR-325)', () => {
  it('describes the default template: nine teams into three groups of three, the top four into a knockout', () => {
    const [groups, knockout] = describePipelineFlow(defaultPipelineSpec(), 9);
    expect(groups).toMatchObject({
      code: 'GRP',
      ingress: { count: 9, from: 'entered' },
      shape: { kind: 'pool', groups: 3, sizes: [3, 3, 3] },
      matches: 9,
      egress: { count: 4, kind: 'advancers', qualifiers: 3, fills: 1, toStage: 'KO' },
    });
    expect(knockout).toMatchObject({
      code: 'KO',
      ingress: { count: 4, from: 'stage', fromStage: 'GRP' },
      shape: { kind: 'bracket', rounds: 2, hasThirdPlace: false },
      matches: 3,
      egress: { kind: 'final' },
    });
  });

  it('reports no ranked fills when the successive stage takes exactly the pool qualifiers (ADR-328)', () => {
    const spec: PipelineSpec = {
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3, advanceCount: 1 } },
        { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'GRP', count: 3 }, matchMinutes: 20 },
      ],
    };
    expect(describePipelineFlow(spec, 9)[0]?.egress).toMatchObject({ count: 3, qualifiers: 3, fills: 0, toStage: 'KO' });
  });

  it('counts a third-place match and the rounds of a bracket that needs byes', () => {
    const spec: PipelineSpec = {
      stages: [{ code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'initial' }, matchMinutes: 20, options: { hasThirdPlace: true } }],
    };
    const [only] = describePipelineFlow(spec, 6);
    expect(only).toMatchObject({ ingress: { count: 6 }, shape: { kind: 'bracket', rounds: 3, hasThirdPlace: true }, egress: { kind: 'final' } });
    // six teams: two byes, then 2 + 2 matches + a final = 5, plus the third-place match.
    expect(only?.matches).toBe(6);
  });

  it('describes a pool fed by advancers with its groups sized from the intake, and says whom it sends on', () => {
    const spec: PipelineSpec = {
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3, advanceCount: 2 } },
        { code: 'P2', label: 'Second pools', format: 'pool', source: { kind: 'advancers', fromStage: 'GRP', count: 6 }, matchMinutes: 15, options: { groupCount: 2, advanceCount: 1 } },
        { code: 'FIN', label: 'Final', format: 'bracket', source: { kind: 'advancers', fromStage: 'P2', count: 2 }, matchMinutes: 20 },
      ],
    };
    const [groups, second, final] = describePipelineFlow(spec, 9);
    expect(groups?.egress).toMatchObject({ count: 6, qualifiers: 6, fills: 0, toStage: 'P2' });
    expect(second).toMatchObject({
      ingress: { count: 6, from: 'stage', fromStage: 'GRP' },
      shape: { kind: 'pool', groups: 2, sizes: [3, 3] },
      matches: 6,
      egress: { count: 2, toStage: 'FIN' },
    });
    expect(final?.ingress).toMatchObject({ count: 2, fromStage: 'P2' });
  });

  it('describes an open stage: no fixtures, a roster when fed, and a free-for-all when not', () => {
    const fed: PipelineSpec = {
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3 } },
        { code: 'FUN', label: 'Open play', format: 'open', source: { kind: 'advancers', fromStage: 'GRP', count: 4 }, matchMinutes: 10 },
      ],
    };
    expect(describePipelineFlow(fed, 9)[1]).toMatchObject({ shape: { kind: 'open' }, matches: 0, ingress: { count: 4, from: 'stage' }, egress: { kind: 'final' } });
    const alone: PipelineSpec = { stages: [fed.stages[1] ? { ...fed.stages[1], source: { kind: 'initial' } } : fed.stages[0]!] };
    expect(describePipelineFlow(alone, 9)[0]).toMatchObject({ ingress: { count: 9, from: 'entered' } });
  });

  it('says plainly when a stage cannot be described, using the validator’s own sentence', () => {
    const spec: PipelineSpec = {
      stages: [{ code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupCount: 5 } }],
    };
    const [only] = describePipelineFlow(spec, 6);
    expect(only?.problem).toMatch(/at least two teams/i);
  });

  it('agrees with what is actually built, for every stage of the template and a fed pool', () => {
    const spec: PipelineSpec = {
      stages: [
        { code: 'GRP', label: 'Groups', format: 'pool', source: { kind: 'initial' }, matchMinutes: 15, options: { groupSize: 3, advanceCount: 2 } },
        { code: 'P2', label: 'Second pools', format: 'pool', source: { kind: 'advancers', fromStage: 'GRP', count: 6 }, matchMinutes: 15, options: { groupCount: 2 } },
        { code: 'KO', label: 'Knockout', format: 'bracket', source: { kind: 'advancers', fromStage: 'P2', count: 4 }, matchMinutes: 20, options: { hasThirdPlace: true } },
      ],
    };
    const flow = describePipelineFlow(spec, 9);
    const built = buildPipeline(spec, seeded(9));
    for (const stage of flow) {
      expect(stage.matches).toBe(built.matches.filter((row) => row.stageCode === stage.code).length);
    }
  });
});
