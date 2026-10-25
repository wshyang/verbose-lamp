// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { columnsFor, linkDescriptions, modeMeta, phaseTone, slotDisplay } from './formatUi.js';
import type { MatchView } from '../../../shared/types.js';

function match(partial: Partial<MatchView>): MatchView {
  return {
    id: 'm1', key: 'M1', phase: 'Round 1', groupKey: null, round: 1,
    slotA: { kind: 'team', teamRef: 'a', label: 'Alpha' },
    slotB: { kind: 'team', teamRef: 'b', label: 'Bravo' },
    dependsOn: [], courtId: null, courtName: 'Court 1', startMinutes: 540, endMinutes: 560,
    status: 'scheduled', scoreA: null, scoreB: null, origin: 'generated', ...partial,
  };
}

describe('formatUi specialisation', () => {
  it('describes every mode and falls back for unknown ids', () => {
    expect(modeMeta('swiss').tagline).toContain('standings');
    expect(modeMeta('something-else').tagline).toBe('Tournament format.');
  });

  it('tones phases by meaning', () => {
    expect(phaseTone('Grand Final')).toBe('tone-final');
    expect(phaseTone('Final')).toBe('tone-final');
    expect(phaseTone('Pro Flight Final')).toBe('tone-final');
    expect(phaseTone('Consolation')).toBe('tone-consolation');
    expect(phaseTone('Group A')).toBe('tone-group');
    expect(phaseTone('Swiss Round 2')).toBe('tone-swiss');
    expect(phaseTone('Quarter-Finals')).toBe('tone-default');
  });

  it('displays slots with and without a live context', () => {
    const semi = match({ key: 'S1', status: 'final', scoreA: 10, scoreB: 4 });
    const context = { teams: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Bravo' }], matches: [semi] };
    expect(slotDisplay({ kind: 'winnerOf', matchKey: 'S1' }, context)).toBe('Alpha');
    expect(slotDisplay({ kind: 'loserOf', matchKey: 'S1' }, context)).toBe('Bravo');
    expect(slotDisplay({ kind: 'winnerOf', matchKey: 'S1' })).toBe('Winner of S1');
    expect(slotDisplay({ kind: 'team', teamRef: 'a', label: 'Alpha' }, context)).toBe('Alpha');
    expect(slotDisplay({ kind: 'rankOf', scope: 'Group A', rank: 1 }, context)).toBe('#1 Group A');
    const pending = match({ key: 'S1', status: 'live', scoreA: 1, scoreB: 1 });
    expect(slotDisplay({ kind: 'winnerOf', matchKey: 'S1' }, { teams: context.teams, matches: [pending] }))
      .toBe('Winner of S1');
    expect(slotDisplay({ kind: 'winnerOf', matchKey: 'S1' }, { teams: [], matches: [semi] })).toBe('a');
  });

  it('describes links from slots and barriers', () => {
    const linked = match({
      slotA: { kind: 'winnerOf', matchKey: 'QF1' },
      slotB: { kind: 'loserOf', matchKey: 'QF2' },
      dependsOn: ['QF1', 'QF2', 'QF3'],
    });
    expect(linkDescriptions(linked)).toEqual(['Winner of QF1', 'Loser of QF2', 'After QF3']);
    const slotBOnly = match({
      slotB: { kind: 'winnerOf', matchKey: 'QF9' }, dependsOn: ['QF9'],
    });
    expect(linkDescriptions(slotBOnly)).toEqual(['Winner of QF9']);
    const slotBLoser = match({
      slotB: { kind: 'loserOf', matchKey: 'QF8' }, dependsOn: ['QF8'],
    });
    expect(linkDescriptions(slotBLoser)).toEqual(['Loser of QF8']);
    const slotALoser = match({
      slotA: { kind: 'loserOf', matchKey: 'QF7' }, dependsOn: ['QF7'],
    });
    expect(linkDescriptions(slotALoser)).toEqual(['Loser of QF7']);
  });

  it('groups matches into round columns', () => {
    const columns = columnsFor([
      match({ key: 'B', round: 2, phase: 'Semi-Finals' }),
      match({ key: 'A', round: 1, phase: 'Quarter-Finals' }),
      match({ key: 'C', round: 2, phase: 'Consolation' }),
    ]);
    expect(columns.map((column) => column.round)).toEqual([1, 2]);
    expect(columns[1].title).toBe('Semi-Finals · Consolation');
  });
});
