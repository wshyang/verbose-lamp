import { describe, expect, it } from 'vitest';
import { restructureStages, type StageFragment } from '../core/restructure.js';
import { DESK, MARSHAL, entrantSlot, match, ok, refusalCode, slotOf, stage, state } from './fixtures.js';

/**
 * ADR-329 F12 — the core's restage primitive: an unstarted, unfed stage swaps its groups
 * and fixtures for a well-formed fragment. Format-blind: the fragment arrives with ids,
 * and everything the fragment does not explain is refused.
 */

const ko = stage({ id: 's2', ordinal: 2, label: 'Knockout', kind: 'bracket', allowsDraws: false, advanceCount: 0, status: 'pending' });

function baseState() {
  return state({
    stages: [stage({}), ko],
    groups: [
      { id: 'gA', stageId: 's1', code: 'A', label: 'Group A', entrantIds: ['e1', 'e2'] },
      { id: 'gB', stageId: 's1', code: 'B', label: 'Group B', entrantIds: ['e3', 'e4'] },
    ],
    matches: [
      match({ id: 'm1', groupId: 'gA' }),
      match({ id: 'm2', groupId: 'gB', slots: { a: entrantSlot('e3'), b: entrantSlot('e4') } }),
      match({
        id: 'f1',
        stageId: 's2',
        slots: {
          a: slotOf({ kind: 'stage_place', stageId: 's1', place: 1 }, '1st from Pool'),
          b: slotOf({ kind: 'stage_place', stageId: 's1', place: 2 }, '2nd from Pool'),
        },
      }),
    ],
  });
}

/** One big group of four instead of two of two: new group id, new fixtures, same stage. */
function bigGroupFragment(): StageFragment {
  return {
    stageId: 's1',
    patch: { advanceCount: 2, rates: null, tablePoints: { win: 2, draw: 1, loss: 0 }, intake: null, kind: 'pool', allowsDraws: true },
    groups: [{ id: 'gBig', stageId: 's1', code: 'A', label: 'Group A', entrantIds: ['e1', 'e2', 'e3', 'e4'] }],
    matches: [
      match({ id: 'n1', groupId: 'gBig', sequence: 1 }),
      match({ id: 'n2', groupId: 'gBig', sequence: 2, slots: { a: entrantSlot('e3'), b: entrantSlot('e4') } }),
    ],
  };
}

describe('restructureStages — ADR-329 F12', () => {
  it('swaps an unstarted stage’s groups and fixtures, superseding the old ones, under one event', () => {
    const result = ok(restructureStages(baseState(), { fragments: [bigGroupFragment()], reason: 'Only one court is dry.' }, context()));
    const replaced = result.state.matches.filter((row) => row.stageId === 's1');
    expect(replaced.map((row) => [row.id, row.status])).toEqual([
      ['m1', 'superseded'],
      ['m2', 'superseded'],
      ['n1', 'scheduled'],
      ['n2', 'scheduled'],
    ]);
    expect(result.state.groups.map((group) => group.id)).toEqual(['gBig']);
    expect(result.state.stages.find((row) => row.id === 's1')?.tablePoints).toEqual({ win: 2, draw: 1, loss: 0 });
    // The knockout still reads the stage's places: its fixtures are untouched.
    expect(result.state.matches.find((row) => row.id === 'f1')?.status).toBe('scheduled');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ kind: 'stage_restructured', actor: DESK, reason: 'Only one court is dry.' });
  });

  it('refuses a started stage, a fed stage, staff, and no reason', () => {
    const started = baseState();
    const withStarted = {
      ...started,
      matches: started.matches.map((row) => (row.id === 'm1' ? { ...row, status: 'completed' as const, startedAt: 't', endedAt: 't' } : row)),
    };
    expect(refusalCode(restructureStages(withStarted, { fragments: [bigGroupFragment()], reason: 'x' }, context()))).toBe('stage_started');
    const fed = { ...baseState(), stages: [stage({ roster: ['e1', 'e2'] }), ko] };
    expect(refusalCode(restructureStages(fed, { fragments: [bigGroupFragment()], reason: 'x' }, context()))).toBe('stage_fed');
    expect(refusalCode(restructureStages(baseState(), { fragments: [bigGroupFragment()], reason: 'x' }, context(MARSHAL)))).toBe('not_allowed');
    expect(refusalCode(restructureStages(baseState(), { fragments: [bigGroupFragment()], reason: ' ' }, context()))).toBe('reason_required');
    expect(refusalCode(restructureStages(baseState(), { fragments: [], reason: 'x' }, context()))).toBe('bad_step');
  });

  it('refuses a fragment that would strand a downstream seat, and a cyclic fragment', () => {
    const stranded = baseState();
    const withGroupReader = {
      ...stranded,
      matches: [
        ...stranded.matches,
        match({
          id: 'f2',
          stageId: 's2',
          sequence: 9,
          slots: { a: slotOf({ kind: 'group_place', groupId: 'gB', place: 1 }, '1st in Group B'), b: entrantSlot('e1') },
        }),
      ],
    };
    // gB disappears under the fragment while f2 still reads its first place.
    expect(refusalCode(restructureStages(withGroupReader, { fragments: [bigGroupFragment()], reason: 'x' }, context()))).toBe('has_dependents');
    const cyclic: StageFragment = {
      stageId: 's2',
      patch: { advanceCount: 0, rates: null, tablePoints: null, intake: null, kind: 'bracket', allowsDraws: false },
      groups: [],
      matches: [
        match({ id: 'c1', stageId: 's2', slots: { a: slotOf({ kind: 'winner_of', matchId: 'c2' }), b: entrantSlot('e1') } }),
        match({ id: 'c2', stageId: 's2', slots: { a: slotOf({ kind: 'winner_of', matchId: 'c1' }), b: entrantSlot('e2') } }),
      ],
    };
    expect(refusalCode(restructureStages(baseState(), { fragments: [cyclic], reason: 'x' }, context()))).toBe('bad_step');
  });

  it('refuses when a downstream stage that reads the target has already started', () => {
    const value = baseState();
    const downstreamStarted = {
      ...value,
      matches: value.matches.map((row) =>
        row.id === 'f1' ? { ...row, status: 'in_progress' as const, startedAt: 't' } : row,
      ),
    };
    expect(refusalCode(restructureStages(downstreamStarted, { fragments: [bigGroupFragment()], reason: 'x' }, context()))).toBe(
      'stage_started',
    );
  });
});

function context(actor = DESK) {
  return { now: '2026-10-15T02:00:00.000Z', actor, newIds: [] };
}
