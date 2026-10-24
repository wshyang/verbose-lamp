import { describe, expect, it } from 'vitest';
import { asNickname, formatAge, formatDateTime, formatPoints, formatRankLabel, formatTime, matchResultLine, roundPoints, scanConfirmation, tierButtonLine, tierSummary, typingLine } from './format.js';

/** Every human-readable string in the UI is produced here (AGENTS-frontend.md §2). */

describe('format', () => {
  it('formats a time and a date-time in event-local form', () => {
    expect(formatTime('2026-09-29T02:05:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
    expect(formatDateTime('2026-09-29T02:05:00.000Z')).toMatch(/\d{2} \w{3}/);
  });

  /**
   * ADR-342 — an ask never expires, so its age is the only thing that says how current it is. The
   * desk reads a room, not a stopwatch: coarse steps, and never a negative number for a clock that
   * drifted backwards.
   */
  it('states an age in coarse steps, and never a negative one', () => {
    const now = Date.parse('2026-10-22T14:20:00.000Z');
    expect(formatAge('2026-10-22T14:19:40.000Z', now)).toBe('moments');
    expect(formatAge('2026-10-22T14:19:00.000Z', now)).toBe('1 minute');
    expect(formatAge('2026-10-22T14:12:00.000Z', now)).toBe('8 minutes');
    expect(formatAge('2026-10-22T13:20:00.000Z', now)).toBe('1 hour');
    expect(formatAge('2026-10-22T12:15:00.000Z', now)).toBe('2 hours 5 minutes');
    // A future timestamp is "moments", not a negative count.
    expect(formatAge('2026-10-22T14:21:00.000Z', now)).toBe('moments');
  });

  it('turns every space typed into a nickname into an underscore', () => {
    expect(asNickname('Ah Seng')).toBe('Ah_Seng');
    expect(asNickname('sandy  toes')).toBe('sandy__toes');
    // Same length in as out, so the caret does not jump while typing.
    expect(asNickname('a b\tc')).toHaveLength('a b\tc'.length);
    expect(asNickname('BeachBoss')).toBe('BeachBoss');
  });

  it('pluralises points, except for exactly one', () => {
    expect(formatPoints(0)).toBe('0 pts');
    expect(formatPoints(1)).toBe('1 pt');
    expect(formatPoints(55)).toBe('55 pts');
  });

  /**
   * ADR-337 — a team award is sliced across its roster, so a total can be fractional. The paint
   * rounds to a whole number; it must never truncate. 100 / 7 summed seven times is
   * 99.99999999999999, which truncation paints as 99 — a cluster losing a point it earned.
   */
  it('rounds a fractional total to a whole number, and never truncates', () => {
    expect(roundPoints(14.285714285714286)).toBe(14);
    expect(roundPoints(42.857142857142854)).toBe(43);
    expect(roundPoints(57.142857142857146)).toBe(57);
    expect(roundPoints(99.99999999999999)).toBe(100);
    expect(roundPoints(0)).toBe(0);
    expect(formatPoints(99.99999999999999)).toBe('100 pts');
    expect(formatPoints(0.6)).toBe('1 pt');
    expect(formatPoints(2.4)).toBe('2 pts');
  });

  it('labels a rank with a hash', () => {
    expect(formatRankLabel(3)).toBe('#3');
  });

  it('writes the F27 scan confirmation, with the offline variant', () => {
    expect(scanConfirmation({ nickname: 'BeachBoss', points: 15, isQueued: false })).toBe(
      '✓ BeachBoss +15 pts',
    );
    expect(scanConfirmation({ nickname: 'BeachBoss', points: 15, isQueued: true })).toBe(
      '✓ BeachBoss +15 pts (queued)',
    );
  });

  it('names the beaten team whichever side won, and falls back while a match is live', () => {
    const teams = { teamAName: 'Sandstorm', teamBName: 'Wave Riders', status: 'completed' };
    expect(matchResultLine({ ...teams, winnerTeamName: 'Sandstorm' })).toBe(
      'Sandstorm beat Wave Riders',
    );
    expect(matchResultLine({ ...teams, winnerTeamName: 'Wave Riders' })).toBe(
      'Wave Riders beat Sandstorm',
    );
    expect(matchResultLine({ ...teams, status: 'in_progress', winnerTeamName: null })).toBe(
      'Sandstorm vs Wave Riders',
    );
  });

  /*
   * ADR-156 — the two null-winner cases, side by side, because they are one character apart
   * in the data and must never be one line apart on the screen.
   */
  it('says a finished match was drawn rather than repeating the live line', () => {
    const teams = { teamAName: 'Sandstorm', teamBName: 'Wave Riders', winnerTeamName: null };
    expect(matchResultLine({ ...teams, status: 'completed' })).toBe(
      'Sandstorm drew with Wave Riders',
    );
    expect(matchResultLine({ ...teams, status: 'in_progress' })).toBe('Sandstorm vs Wave Riders');
  });

  it('names the tier on the ✓ line only when one was chosen (ADR-092)', () => {
    expect(
      scanConfirmation({ nickname: 'BeachBoss', points: 25, isQueued: false, tierLabel: 'First place' }),
    ).toBe('✓ BeachBoss +25 pts · First place');
    expect(
      scanConfirmation({ nickname: 'BeachBoss', points: 10, isQueued: true, tierLabel: 'Second place' }),
    ).toBe('✓ BeachBoss +10 pts · Second place (queued)');
  });

  it('summarises a single tier as the flat rate and lists a tiered station (ADR-092)', () => {
    expect(tierSummary([{ label: 'Award', points: 15 }])).toBe('15 points per scan');
    expect(
      tierSummary([
        { label: 'First place', points: 25 },
        { label: 'Second place', points: 10 },
      ]),
    ).toBe('First place +25 · Second place +10');
  });

  it('names a tier and its points without saying either twice (ADR-336 §4)', () => {
    // A named tier keeps both halves: the label says which honour, the points say what it pays.
    expect(tierButtonLine({ label: 'Gold', points: 10 })).toBe('Gold · 10 pts');
    // A derived tier is named by its number, so the button shows the number once.
    expect(tierButtonLine({ label: '30 pts', points: 30 })).toBe('30 pts');
    expect(tierButtonLine({ label: '5 pts', points: 50 })).toBe('5 pts · 50 pts');
  });

  /**
   * ADR-146 — the names threshold. Two is a judgement, and it is a constant so that revisiting
   * it costs one number; these cases are written against the behaviour on either side of it.
   */
  it('names one typist, names two, and counts the rest', () => {
    expect(typingLine([])).toBe('');
    expect(typingLine(['Marcus_Lim'])).toBe('Marcus_Lim is typing…');
    expect(typingLine(['Marcus_Lim', 'Hui_Min'])).toBe('Marcus_Lim and Hui_Min are typing…');
    // Past the threshold the room is told how many, because a list of every name in a
    // five-person team stops being information and becomes a crowd.
    expect(typingLine(['Marcus_Lim', 'Hui_Min', 'Priya'])).toBe('3 people are typing…');
  });
});
