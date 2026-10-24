import { describe, expect, it } from 'vitest';
import {
  blankStage,
  draftSetupOfSetup,
  movedStage,
  patchStage,
  pipelineProblem,
  setupDraftFromTournament,
  sourceChoicesOf,
  specOfStages,
  stageDraftOf,
  templateStages,
  withoutStage,
  type StageDraft,
} from './useTournamentSetup.js';
import { adminTournament } from '../../test-utils/tournamentFixtures.js';
import { stageFlowsOf } from './stageFlowText.js';
import { INITIAL_KNOBS, runSimulation } from './useTournamentSimulator.js';

/** ADR-311 — the stage builder's readings: form text in, an engine spec (or a refusal) out. */

describe('the template and the spec it describes', () => {
  it('preloads the engine template: groups at 15, the top four at 20', () => {
    const stages = templateStages();
    expect(stages.map((stage) => [stage.code, stage.format, stage.matchMinutes])).toEqual([
      ['GRP', 'pool', '15'],
      ['KO', 'bracket', '20'],
    ]);
    expect(pipelineProblem(stages, 9)).toBeNull();
    const spec = specOfStages(stages);
    expect(spec.stages[1]?.source).toEqual({ kind: 'advancers', fromStage: 'GRP', count: 4 });
    expect(spec.stages[0]?.options).toMatchObject({ groupSize: 3, advanceCount: 1 });
  });

  it('reads blank minutes as inherit, rates in threes, and groups by count', () => {
    const stages = templateStages();
    const edited: StageDraft[] = [
      { ...stages[0]!, matchMinutes: '', groupSize: '', groupCount: '2', winPoints: '10', drawPoints: '5', lossPoints: '0' },
      stages[1]!,
    ];
    const spec = specOfStages(edited);
    expect(spec.stages[0]?.matchMinutes).toBeNull();
    expect(spec.stages[0]?.options).toMatchObject({ groupCount: 2, rates: { win: 10, draw: 5, loss: 0 } });
  });

  it('reads an open stage and a bracket from the entered teams back out of a spec', () => {
    const open = stageDraftOf({ code: 'OP', label: 'Open', format: 'open', source: { kind: 'initial' }, matchMinutes: null });
    expect(open).toMatchObject({ format: 'open', sourceKind: 'initial', matchMinutes: '' });
    const bracket = stageDraftOf({ code: 'KO', label: 'KO', format: 'bracket', source: { kind: 'initial' }, matchMinutes: 20 });
    expect(bracket).toMatchObject({ sourceKind: 'initial', fromStage: '', advancerCount: '4' });
    const rated = stageDraftOf({
      code: 'R',
      label: 'Rated',
      format: 'bracket',
      source: { kind: 'initial' },
      matchMinutes: 18,
      options: { rates: { win: 10, draw: 5, loss: 0 } },
    });
    expect(rated).toMatchObject({ winPoints: '10', drawPoints: '5', lossPoints: '0' });
  });
});

describe('internal table points in the stage builder (ADR-320)', () => {
  it('round-trips a stage’s table points from spec to fields and back, apart from its rates', () => {
    const draft = stageDraftOf({
      code: 'GRP',
      label: 'Groups',
      format: 'pool',
      source: { kind: 'initial' },
      matchMinutes: 15,
      options: { rates: { win: 10, draw: 5, loss: 0 }, tablePoints: { win: 2, draw: 1, loss: 0 } },
    });
    expect(draft).toMatchObject({ tableWinPoints: '2', tableDrawPoints: '1', tableLossPoints: '0', winPoints: '10' });
    const spec = specOfStages([draft, templateStages()[1]!]);
    expect(spec.stages[0]?.options).toMatchObject({ rates: { win: 10, draw: 5, loss: 0 }, tablePoints: { win: 2, draw: 1, loss: 0 } });
  });

  it('blank table points mean the default, and a partial set is refused in the form’s own words', () => {
    const stages = templateStages();
    expect(specOfStages(stages).stages[0]?.options?.tablePoints).toBeUndefined();
    const partial: StageDraft[] = [{ ...stages[0]!, tableWinPoints: '2' }, stages[1]!];
    expect(pipelineProblem(partial, 9)).toMatch(/table points need a win, a draw and a loss/i);
  });

  it('saves table points with a draft’s pipeline in threes', () => {
    const stages: StageDraft[] = [
      { ...templateStages()[0]!, tableWinPoints: '2', tableDrawPoints: '1', tableLossPoints: '0' },
      templateStages()[1]!,
    ];
    const saved = draftSetupOfSetup({ ...setupDraftFromTournament(null), buildMode: 'pipeline', stages });
    expect(saved.pipeline?.stages[0]?.options).toMatchObject({ tablePoints: { win: 2, draw: 1, loss: 0 } });
  });
});

describe('pipelineProblem — the desk hears the refusal before the server', () => {
  const template = templateStages();

  it('refuses an empty list, a codeless stage and a nameless stage', () => {
    expect(pipelineProblem([], 9)).toMatch(/at least one stage/);
    expect(pipelineProblem([{ ...blankStage(0), code: ' ' }], 9)).toMatch(/needs a code/);
    expect(pipelineProblem([{ ...blankStage(0), label: '' }], 9)).toMatch(/needs a name/);
  });

  it('refuses numbers that are not whole, rates in part, and advancers with nowhere to come from', () => {
    expect(pipelineProblem([{ ...template[0]!, matchMinutes: 'soon' }], 9)).toMatch(/whole number/);
    expect(pipelineProblem([{ ...template[0]!, winPoints: '10' }], 9)).toMatch(/win, a draw and a loss/);
    expect(pipelineProblem([template[0]!, { ...template[1]!, fromStage: '' }], 9)).toMatch(/need a stage to come from/);
  });

  it('passes the engine’s own refusals through: later feeders and impossible counts', () => {
    expect(pipelineProblem([template[1]!, template[0]!], 9)).toMatch(/earlier stage/);
    expect(pipelineProblem([template[0]!, { ...template[1]!, advancerCount: '10' }], 9)).toMatch(/no more than/);
  });

  it('refuses a successive stage that would leave out a pool qualifier, and accepts the qualifier floor (ADR-328)', () => {
    expect(pipelineProblem([template[0]!, { ...template[1]!, advancerCount: '2' }], 9)).toMatch(/3 qualifiers \(3 groups × 1 per group\).*only 2/);
    expect(pipelineProblem([template[0]!, { ...template[1]!, advancerCount: '3' }], 9)).toBeNull();
  });
});

describe('the stage list edits', () => {
  it('patches, removes and moves without mutating, and stops at the ends', () => {
    const stages = templateStages();
    expect(patchStage(stages, 0, { matchMinutes: '18' })[0]?.matchMinutes).toBe('18');
    expect(stages[0]?.matchMinutes).toBe('15');
    expect(withoutStage(stages, 0).map((stage) => stage.code)).toEqual(['KO']);
    expect(movedStage(stages, 1, -1).map((stage) => stage.code)).toEqual(['KO', 'GRP']);
    expect(movedStage(stages, 0, -1).map((stage) => stage.code)).toEqual(['GRP', 'KO']);
    expect(movedStage(stages, 1, 1).map((stage) => stage.code)).toEqual(['GRP', 'KO']);
    expect(movedStage([], 0, 1)).toEqual([]);
    expect(blankStage(2)).toMatchObject({ code: 'S3', format: 'bracket', sourceKind: 'initial' });
  });
});

describe('a saved draft setup (ADR-313)', () => {
  const nineEntrants = Array.from({ length: 9 }, (_, index) => ({
    teamId: `t${index + 1}`,
    name: `Team ${index + 1}`,
    entryOrder: index + 1,
    withdrawnAt: null,
    awardedPoints: 0,
  }));

  it('opens the saved 1-hour-40 pipeline as form text, and reads it back unchanged', () => {
    const saved = draftSetupOfSetup({ ...setupDraftFromTournament(adminTournament({ status: 'draft', entrants: nineEntrants })), buildMode: 'pipeline', stages: templateStages() });
    const draft = setupDraftFromTournament(adminTournament({ status: 'draft', entrants: nineEntrants, draftSetup: saved }));
    expect(draft.buildMode).toBe('pipeline');
    expect(draft.stages.map((stage) => [stage.code, stage.matchMinutes])).toEqual([
      ['GRP', '15'],
      ['KO', '20'],
    ]);
    expect(draft).toMatchObject({ matchMinutes: '12', changeoverMinutes: '3', deadline: '' });
    expect(draftSetupOfSetup(draft)).toEqual(saved);
  });

  it('opens a saved format with the tournament’s own name, rates and seed order', () => {
    const entrants = [
      { teamId: 't2', name: 'Team 2', entryOrder: 2, withdrawnAt: null, awardedPoints: 0 },
      { teamId: 't1', name: 'Team 1', entryOrder: 1, withdrawnAt: null, awardedPoints: 0 },
    ];
    const draft = setupDraftFromTournament(
      adminTournament({
        status: 'draft',
        name: 'Saved day',
        rates: { win: 9, draw: 4, loss: 1 },
        entrants,
        draftSetup: {
          buildMode: 'format',
          formatId: 'swiss',
          options: { rounds: 3 },
          matchMinutes: 18,
          changeoverMinutes: 5,
          restMinutes: 2,
          deadline: '16:30',
        },
      }),
    );
    expect(draft).toMatchObject({ name: 'Saved day', winPoints: '9', drawPoints: '4', lossPoints: '1', teamIds: ['t1', 't2'] });
    expect(draft).toMatchObject({ buildMode: 'format', formatId: 'swiss', rounds: '3', groupSize: '4', advanceCount: '2', hasThirdPlace: true });
    expect(draft).toMatchObject({ matchMinutes: '18', changeoverMinutes: '5', restMinutes: '2', deadline: '16:30' });
    expect(draftSetupOfSetup(draft)).toEqual({
      buildMode: 'format',
      formatId: 'swiss',
      options: { rounds: 3 },
      matchMinutes: 18,
      changeoverMinutes: 5,
      restMinutes: 2,
      deadline: '16:30',
    });
  });

  it('falls back to the template stages when a saved pipeline is absent, and opens no tournament as the defaults', () => {
    const draft = setupDraftFromTournament(
      adminTournament({
        status: 'draft',
        entrants: nineEntrants,
        draftSetup: { buildMode: 'pipeline', options: {}, matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0, deadline: null },
      }),
    );
    expect(draft.buildMode).toBe('pipeline');
    expect(draft.stages.map((stage) => stage.code)).toEqual(['GRP', 'KO']);
    expect(setupDraftFromTournament(null)).toMatchObject({ name: 'Captain’s ball', buildMode: 'format', teamIds: [] });
  });

  it('saves group counts and stage rates in threes', () => {
    const stages: StageDraft[] = [
      { ...templateStages()[0]!, groupSize: '', groupCount: '2', winPoints: '10', drawPoints: '5', lossPoints: '0' },
      templateStages()[1]!,
    ];
    const saved = draftSetupOfSetup({ ...setupDraftFromTournament(adminTournament({ status: 'draft', entrants: nineEntrants })), buildMode: 'pipeline', stages });
    expect(saved.pipeline?.stages[0]?.options).toEqual({ groupCount: 2, advanceCount: 1, rates: { win: 10, draw: 5, loss: 0 } });
    expect(saved.pipeline?.stages[1]?.options).toEqual({ hasThirdPlace: false });
  });
});

describe('runSimulation in pipeline mode', () => {
  it('rehearses the template: 12 matches ending 97 minutes after the start', () => {
    const result = runSimulation({ ...INITIAL_KNOBS, buildMode: 'pipeline', teamCount: '9', courtCount: '3', startAt: '10:00', deadline: '11:30' });
    expect(result.error).toBeNull();
    expect(result.matches).toHaveLength(12);
    expect(result.fit?.projectedFinish).toBe(697);
  });

  it('reads an unbuildable list as the rehearsal’s error, and nonsense team counts too', () => {
    expect(runSimulation({ ...INITIAL_KNOBS, buildMode: 'pipeline', stages: [] }).error).toMatch(/at least one stage/);
    expect(runSimulation({ ...INITIAL_KNOBS, buildMode: 'pipeline', teamCount: 'many' }).error).toMatch(/at least two teams/);
  });
});

describe('ADR-321 — dumb courts in the setup draft', () => {
  it('hydrates the kind and tiers back out of a dumb tournament', () => {
    const draft = setupDraftFromTournament(
      adminTournament({ kind: 'dumb_courts', dumbTiers: [{ label: 'Gold', points: 10 }] }),
    );
    expect(draft.kind).toBe('dumb_courts');
    expect(draft.dumbTiers).toEqual([{ label: 'Gold', points: '10' }]);
  });

  it('keeps captains ball drafts on the default tiers, unused', () => {
    const draft = setupDraftFromTournament(adminTournament({}));
    expect(draft.kind).toBe('captains_ball');
    expect(draft.dumbTiers.length).toBeGreaterThan(0);
  });
});


describe('which sources a stage may pick (ADR-325)', () => {
  const stages = templateStages();

  it('offers the entered teams to every stage', () => {
    for (const index of [0, 1]) {
      const choices = sourceChoicesOf(index, stages);
      expect(choices.find((choice) => choice.kind === 'initial')).toMatchObject({ isEnabled: true });
    }
  });

  it('offers an earlier stage only to a stage that has one, and says why not to the first', () => {
    const first = sourceChoicesOf(0, stages).find((choice) => choice.kind === 'advancers');
    expect(first).toMatchObject({ isEnabled: false });
    expect(first?.reason).toMatch(/earlier stage/i);
    expect(sourceChoicesOf(1, stages).find((choice) => choice.kind === 'advancers')).toMatchObject({ isEnabled: true });
  });

  it('offers it to a pool and to open play, not only to a knockout', () => {
    for (const format of ['pool', 'open', 'bracket'] as const) {
      const second: StageDraft[] = [stages[0]!, { ...stages[1]!, format }];
      expect(sourceChoicesOf(1, second).find((choice) => choice.kind === 'advancers')).toMatchObject({ isEnabled: true });
    }
  });

  it('keeps a pool fed by an earlier stage valid, where it used to be refused', () => {
    const second: StageDraft[] = [
      { ...stages[0]!, groupSize: '3', advanceCount: '2' },
      { ...stages[1]!, format: 'pool', groupSize: '', groupCount: '2', advanceCount: '1', advancerCount: '6' },
    ];
    expect(pipelineProblem(second, 9)).toBeNull();
  });
});

describe('what each stage takes in and sends on, read-only (ADR-325)', () => {
  it('describes the template in words a person can check against what they configured', () => {
    const [groups, knockout] = stageFlowsOf(templateStages(), 9);
    expect(groups?.ingress).toBe('In: 9 entered teams');
    expect(groups?.shape).toBe('3 groups of 3, 9 matches');
    expect(groups?.egress).toBe('Out: 3 group winners + the best 1 runner-up, to KO');
    expect(knockout?.ingress).toBe('In: 4 from GRP');
    expect(knockout?.shape).toBe('Knockout of 2 rounds, 3 matches');
    expect(knockout?.egress).toBe('Out: final placings');
  });

  it('names a third-place match and a bracket with byes', () => {
    const stages: StageDraft[] = [{ ...templateStages()[1]!, sourceKind: 'initial', fromStage: '', hasThirdPlace: true }];
    const [only] = stageFlowsOf(stages, 6);
    expect(only?.shape).toBe('Knockout of 3 rounds, 6 matches (with a third-place match)');
  });

  it('uses the singular for one, so a two-team final reads "1 round, 1 match" and not "1 rounds"', () => {
    const final: StageDraft[] = [{ ...templateStages()[1]!, sourceKind: 'initial', fromStage: '', hasThirdPlace: false }];
    const [only] = stageFlowsOf(final, 2);
    expect(only?.ingress).toBe('In: 2 entered teams');
    expect(only?.shape).toBe('Knockout of 1 round, 1 match');
    const oneGroup: StageDraft[] = [{ ...templateStages()[0]!, groupSize: '', groupCount: '1', advanceCount: '1' }];
    expect(stageFlowsOf(oneGroup, 3)[0]?.shape).toBe('1 group of 3, 3 matches');
  });

  it('says "runners-up" for several, which is the plural of runner-up, not "runner-ups"', () => {
    const stages: StageDraft[] = [
      { ...templateStages()[0]!, groupSize: '3', advanceCount: '1' },
      { ...templateStages()[1]!, advancerCount: '6' },
    ];
    expect(stageFlowsOf(stages, 9)[0]?.egress).toBe('Out: 3 group winners + the best 3 runners-up, to KO');
  });

  it('shows no ranked fill at exactly the qualifier floor, and the engine refusal below it (ADR-328)', () => {
    const exact: StageDraft[] = [templateStages()[0]!, { ...templateStages()[1]!, advancerCount: '3' }];
    expect(stageFlowsOf(exact, 9)[0]?.egress).toBe('Out: 3 group winners, to KO');

    const short: StageDraft[] = [templateStages()[0]!, { ...templateStages()[1]!, advancerCount: '2' }];
    expect(stageFlowsOf(short, 9)[1]?.problem).toMatch(/3 qualifiers.*only 2/);
  });

  it('describes a pool fed by an earlier stage and an open stage', () => {
    const stages: StageDraft[] = [
      { ...templateStages()[0]!, groupSize: '3', advanceCount: '2' },
      { ...templateStages()[1]!, code: 'P2', label: 'Second pools', format: 'pool', groupSize: '', groupCount: '2', advancerCount: '6' },
      { ...templateStages()[1]!, code: 'FUN', label: 'Open play', format: 'open', fromStage: 'P2', advancerCount: '2' },
    ];
    const [, second, open] = stageFlowsOf(stages, 9);
    expect(second?.ingress).toBe('In: 6 from GRP');
    expect(second?.shape).toBe('2 groups of 3, 6 matches');
    expect(open?.shape).toBe('Open play: matches are staged by hand');
    expect(open?.ingress).toBe('In: 2 from P2');
  });

  it('shows the engine’s own sentence when the stage cannot be built, rather than a number that is wrong', () => {
    const stages: StageDraft[] = [{ ...templateStages()[0]!, groupSize: '', groupCount: '5' }];
    const [only] = stageFlowsOf(stages, 6);
    expect(only?.problem).toMatch(/at least two teams/i);
  });

  it('describes nothing until the fields parse, so half-typed text never shows a wrong figure', () => {
    const stages: StageDraft[] = [{ ...templateStages()[0]!, groupSize: 'x' }];
    expect(stageFlowsOf(stages, 9)[0]?.problem).toMatch(/whole number/i);
  });
});
