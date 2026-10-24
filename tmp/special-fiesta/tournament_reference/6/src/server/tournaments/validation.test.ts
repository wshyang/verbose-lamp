import { describe, expect, it } from 'vitest';
import type { CreateTournamentInput } from '../../shared/contracts.js';
import { parseCreateTournamentInput, parsePreviewInput, validateModeTeamCount } from './validation.js';

const validInput: CreateTournamentInput = {
  name: 'Saturday Cup',
  mode: 'round-robin',
  settings: {
    teamCount: 4,
    courtCount: 2,
    matchDurationMinutes: 20,
    tournamentLengthMinutes: 180,
    startTimeMinutes: 540,
  },
  teamNames: ['Northside', 'River Club', 'Old Town', 'Hilltop'],
};

describe('tournament input contracts', () => {
  it('trims a valid create request and validates its roster', () => {
    const parsed = parseCreateTournamentInput({ ...validInput, name: ' Cup ', teamNames: [' A ', 'B', 'C', 'D'] });
    expect(parsed.name).toBe('Cup');
    expect(parsed.teamNames[0]).toBe('A');
  });

  it('parses a preview request without requiring an event name', () => {
    const { name: _name, ...preview } = validInput;
    expect(parsePreviewInput(preview).mode).toBe('round-robin');
  });

  it.each([null, [], 'value', 4])('rejects a non-object input: %s', (value) => {
    expect(() => parseCreateTournamentInput(value)).toThrow('Tournament details are required.');
    expect(() => parsePreviewInput(value)).toThrow('Simulation details are required.');
  });

  it('rejects missing, blank, and overlong tournament names', () => {
    expect(() => parseCreateTournamentInput({ ...validInput, name: '' })).toThrow('Enter a tournament name.');
    expect(() => parseCreateTournamentInput({ ...validInput, name: 'x'.repeat(121) })).toThrow('Enter a tournament name.');
    expect(() => parseCreateTournamentInput({ ...validInput, name: 4 })).toThrow('Enter a tournament name.');
  });

  it('rejects an unknown format and malformed settings', () => {
    expect(() => parseCreateTournamentInput({ ...validInput, mode: 'mystery' })).toThrow('Choose a tournament format.');
    expect(() => parseCreateTournamentInput({ ...validInput, settings: null })).toThrow('Tournament settings are required.');
    expect(() => parseCreateTournamentInput({ ...validInput, settings: { ...validInput.settings, courtCount: '2' } })).toThrow('Choose between 1 and 20 courts.');
  });

  it.each([
    ['teamCount', 1, 'Choose between 2 and 32 teams.'],
    ['teamCount', 33, 'Choose between 2 and 32 teams.'],
    ['courtCount', 0, 'Choose between 1 and 20 courts.'],
    ['courtCount', 21, 'Choose between 1 and 20 courts.'],
    ['matchDurationMinutes', 4, 'Match length must be between 5 and 120 minutes.'],
    ['matchDurationMinutes', 121, 'Match length must be between 5 and 120 minutes.'],
    ['tournamentLengthMinutes', 29, 'Tournament length must be between 30 minutes and 12 hours.'],
    ['tournamentLengthMinutes', 721, 'Tournament length must be between 30 minutes and 12 hours.'],
    ['startTimeMinutes', -1, 'Enter a valid start time.'],
    ['startTimeMinutes', 1440, 'Enter a valid start time.'],
  ] as const)('rejects invalid %s = %i', (key, value, message) => {
    expect(() => parseCreateTournamentInput({
      ...validInput,
      settings: { ...validInput.settings, [key]: value },
    })).toThrow(message);
  });

  it('rejects non-integer settings', () => {
    expect(() => parsePreviewInput({
      mode: validInput.mode,
      settings: { ...validInput.settings, matchDurationMinutes: 20.5 },
      teamNames: validInput.teamNames,
    })).toThrow('Match length must be between 5 and 120 minutes.');
  });

  it('rejects a roster with the wrong length, blank names, or duplicates', () => {
    expect(() => parsePreviewInput({ ...validInput, teamNames: ['Only one'] })).toThrow('Enter exactly 4 team names.');
    expect(() => parsePreviewInput({ ...validInput, teamNames: ['', 'B', 'C', 'D'] })).toThrow('Team names cannot be blank.');
    expect(() => parsePreviewInput({ ...validInput, teamNames: ['Team', ' team ', 'C', 'D'] })).toThrow('Team names must be unique within this tournament.');
  });

  it('rejects names longer than the supported team label', () => {
    expect(() => parsePreviewInput({
      ...validInput,
      teamNames: ['x'.repeat(81), 'B', 'C', 'D'],
    })).toThrow('Team names cannot be blank.');
  });

  it('enforces fixed, stepped, and World Cup field sizes', () => {
    expect(() => validateModeTeamCount('consolation', 7)).toThrow('Consolation bracket supports 8 teams.');
    expect(() => validateModeTeamCount('round-robin', 1)).toThrow('Round robin supports 2–32 teams.');
    expect(() => validateModeTeamCount('flighted-quads', 10)).toThrow('Flighted quads requires teams in groups of 4.');
    expect(() => validateModeTeamCount('world-cup', 11)).toThrow('World Cup format supports 10, 16, or 32 teams.');
    expect(() => validateModeTeamCount('unknown' as never, 8)).toThrow('Choose a tournament format.');
  });
});
