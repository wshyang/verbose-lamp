import { describe, expect, it } from 'vitest';
import type { ModeId } from '../shared/contracts.js';
import { formatClock, formatDuration, buildMatchSections, sortTimeline, summaryTone } from './presentation.js';
import { matchView, scheduleSummary } from '../test/fixtures.js';

describe('mode-specific match presentation', () => {
  it('returns an empty pathway and a desk section for manual play', () => {
    expect(buildMatchSections('manual', [])).toEqual([]);
    const matches = [matchView(), matchView({ id: 'match-2', code: 'DESK-2' })];
    expect(buildMatchSections('manual', matches)).toEqual([{ key: 'desk', title: 'Desk-staged matches', matches }]);
  });

  it.each(['round-robin', 'swiss', 'single-elimination', 'ironman'] as ModeId[])('%s groups and sorts matches into numbered rounds', (mode) => {
    const matches = [
      matchView({ id: 'late', roundNumber: 2, position: 2, phase: 'Playoff' }),
      matchView({ id: 'early-2', roundNumber: 1, position: 2, phase: 'Round 1' }),
      matchView({ id: 'early-1', roundNumber: 1, position: 1, phase: 'Round 1' }),
    ];
    const sections = buildMatchSections(mode, matches);
    expect(sections.map((section) => section.key)).toEqual(['round-1', 'round-2']);
    expect(sections[0]?.title).toBe('Round 1');
    expect(sections[0]?.matches.map((match) => match.id)).toEqual(['early-2', 'early-1']);
    expect(sections[1]?.title).toBe('Round 2 · Playoff');
  });

  it.each(['groups', 'points-rush', 'world-cup'] as ModeId[])('%s groups pools and non-pool matches separately', (mode) => {
    const matches = [
      matchView({ id: 'last', groupKey: 'B', phase: 'Pool play', position: 2 }),
      matchView({ id: 'final', groupKey: null, phase: 'Final', roundNumber: 4 }),
      matchView({ id: 'first', groupKey: 'B', phase: 'Pool play', position: 1 }),
      matchView({ id: 'semi', groupKey: null, phase: 'Semifinal', roundNumber: 3 }),
    ];
    const sections = buildMatchSections(mode, matches);
    expect(sections.map((section) => section.title)).toEqual(['Group B', 'Final · Round 4', 'Semifinal · Round 3']);
    expect(sections[0]?.key).toBe('group-b');
    expect(sections[0]?.matches.map((match) => match.id)).toEqual(['first', 'last']);
  });

  it('groups flighted-quads by flight and uses phase for matches without a group', () => {
    const sections = buildMatchSections('flighted-quads', [
      matchView({ id: 'final', groupKey: null, phase: 'Grand final' }),
      matchView({ id: 'flight', groupKey: 'Flight A', phase: 'Flight semi' }),
    ]);
    expect(sections.map((section) => [section.key, section.title])).toEqual([
      ['grand-final', 'Grand final'],
      ['flight-a', 'Flight A'],
    ]);
  });

  it('groups consolation pathways by phase and handles unknown modes via numbered rounds', () => {
    const matches = [
      matchView({ id: 'c2', phase: 'Consolation final', position: 2 }),
      matchView({ id: 'g2', phase: 'Grand final', position: 2 }),
      matchView({ id: 'c1', phase: 'Consolation final', position: 1 }),
    ];
    const sections = buildMatchSections('consolation', matches);
    expect(sections.map((section) => section.key)).toEqual(['consolation-final', 'grand-final']);
    expect(sections[0]?.matches.map((match) => match.id)).toEqual(['c1', 'c2']);
    expect(buildMatchSections('single-elimination', [matchView()])[0]?.key).toBe('round-1');
  });

  it('sorts a copied timeline by start time then court number', () => {
    const matches = [
      matchView({ id: 'court-2', schedule: { startMinute: 560, endMinute: 580, courtNumber: 2, durationMinutes: 20 } }),
      matchView({ id: 'early', schedule: { startMinute: 540, endMinute: 560, courtNumber: 3, durationMinutes: 20 } }),
      matchView({ id: 'court-1', schedule: { startMinute: 560, endMinute: 580, courtNumber: 1, durationMinutes: 20 } }),
    ];
    const sorted = sortTimeline(matches);
    expect(sorted.map((match) => match.id)).toEqual(['early', 'court-1', 'court-2']);
    expect(matches[0]?.id).toBe('court-2');
  });

  it('formats 12-hour clocks, midnight rollover, durations, and budget tone', () => {
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(540)).toBe('9:00 AM');
    expect(formatClock(720)).toBe('12:00 PM');
    expect(formatClock(1439)).toBe('11:59 PM');
    expect(formatClock(1500)).toBe('1:00 AM');
    expect(formatClock(-1)).toBe('11:59 PM');
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(125)).toBe('2 hr 5 min');
    expect(summaryTone(scheduleSummary({ fits: true }))).toBe('fits');
    expect(summaryTone(scheduleSummary({ fits: false }))).toBe('tight');
  });
});
