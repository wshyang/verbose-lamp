import { describe, expect, it } from 'vitest';
import { v7 } from 'uuid';
import {
  parseAwardPointsInput,
  parseFinalizeMatchInput,
  parseIdentifier,
  parseLiveScoreInput,
  parseReasonInput,
  parseStageMatchInput,
  parseWeatherInput,
} from './parse.js';

describe('HTTP body parsing', () => {
  it('parses resource, live-score, and final-score requests', () => {
    expect(parseWeatherInput({ courtCount: 2, matchDurationMinutes: 25, effectiveAtMinutes: 720 })).toEqual({
      courtCount: 2,
      matchDurationMinutes: 25,
      effectiveAtMinutes: 720,
    });
    expect(parseLiveScoreInput({ home: 4, away: 2 })).toEqual({ home: 4, away: 2 });
    expect(parseFinalizeMatchInput({ home: 2, away: 2 })).toEqual({ home: 2, away: 2 });
    expect(parseFinalizeMatchInput({ home: 2, away: 2, advancingTeamId: 'team-1' }).advancingTeamId).toBe('team-1');
  });

  it('parses optional staging and point fields without inventing defaults', () => {
    expect(parseStageMatchInput({ homeTeamId: 'home', awayTeamId: 'away' })).toEqual({
      homeTeamId: 'home',
      awayTeamId: 'away',
    });
    expect(parseStageMatchInput({
      homeTeamId: 'home',
      awayTeamId: 'away',
      phase: '  Final  ',
      roundNumber: 3,
      startMinute: 600,
      courtNumber: 2,
    })).toEqual({ homeTeamId: 'home', awayTeamId: 'away', phase: 'Final', roundNumber: 3, startMinute: 600, courtNumber: 2 });
    expect(parseStageMatchInput({ homeTeamId: 'home', awayTeamId: 'away', phase: '' }).phase).toBe('');
    expect(parseAwardPointsInput({ teamId: 'team-1', points: 3, reason: 'Fair play' })).toEqual({
      teamId: 'team-1',
      points: 3,
      reason: 'Fair play',
    });
    expect(parseAwardPointsInput({ teamId: 'team-1', points: 3, reason: 'Fair play', matchId: 'match-1' }).matchId).toBe('match-1');
  });

  it('requires request bodies to be JSON objects and required text to be present', () => {
    expect(() => parseWeatherInput(null)).toThrow('Send the requested fields as an object.');
    expect(() => parseLiveScoreInput([])).toThrow('Send the requested fields as an object.');
    expect(() => parseStageMatchInput({ homeTeamId: '', awayTeamId: 'away' })).toThrow('Complete every required text field.');
    expect(() => parseAwardPointsInput({ teamId: 'team-1', points: 3, reason: ' ' })).toThrow('Complete every required text field.');
  });

  it('rejects non-integer numeric fields and non-positive optional staging values', () => {
    expect(() => parseWeatherInput({ courtCount: 2, matchDurationMinutes: 20, effectiveAtMinutes: 4.5 })).toThrow('Use whole numbers for scores, times, points, and resource counts.');
    expect(() => parseLiveScoreInput({ home: -1, away: 0 })).not.toThrow();
    expect(() => parseStageMatchInput({ homeTeamId: 'h', awayTeamId: 'a', roundNumber: 0 })).toThrow('Enter a number greater than zero.');
    expect(() => parseStageMatchInput({ homeTeamId: 'h', awayTeamId: 'a', courtNumber: 1.5 })).toThrow('Use whole numbers for scores, times, points, and resource counts.');
    expect(() => parseStageMatchInput({ homeTeamId: 'h', awayTeamId: 'a', startMinute: '600' })).toThrow('Use whole numbers for scores, times, points, and resource counts.');
  });

  it('limits optional text and extracts an optional reason field', () => {
    expect(parseReasonInput({ reason: 'Rain stopped play' })).toBe('Rain stopped play');
    expect(parseReasonInput({})).toBeUndefined();
    expect(() => parseStageMatchInput({ homeTeamId: 'h', awayTeamId: 'a', phase: 'x'.repeat(81) })).toThrow('Text must be 80 characters or fewer.');
    expect(() => parseStageMatchInput({ homeTeamId: 'h', awayTeamId: 'a', phase: 8 })).toThrow('Text must be 80 characters or fewer.');
  });

  it('accepts UUIDv7 identifiers and rejects malformed route IDs', () => {
    const id = v7();
    expect(parseIdentifier(id)).toBe(id);
    expect(() => parseIdentifier(undefined)).toThrow('That record ID is not valid.');
    expect(() => parseIdentifier('not-an-id')).toThrow('That record ID is not valid.');
  });
});
