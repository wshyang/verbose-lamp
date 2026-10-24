import {
  FORMAT_CATALOG,
  type CreateTournamentInput,
  type ModeId,
  type PreviewInput,
  type TournamentSettings,
} from '../../shared/contracts.js';
import { unprocessable } from '../errors.js';

export function parseCreateTournamentInput(value: unknown): CreateTournamentInput {
  const body = record(value, 'Tournament details are required.');
  const name = requiredText(body.name, 120, 'Enter a tournament name.');
  const mode = parseMode(body.mode);
  const settings = parseSettings(body.settings);
  const teamNames = parseTeamNames(body.teamNames, settings.teamCount);
  validateModeTeamCount(mode, settings.teamCount);
  return { name, mode, settings, teamNames };
}

export function parsePreviewInput(value: unknown): PreviewInput {
  const body = record(value, 'Simulation details are required.');
  const mode = parseMode(body.mode);
  const settings = parseSettings(body.settings);
  const teamNames = parseTeamNames(body.teamNames, settings.teamCount);
  validateModeTeamCount(mode, settings.teamCount);
  return { mode, settings, teamNames };
}

export function validateModeTeamCount(mode: ModeId, teamCount: number): void {
  const format = FORMAT_CATALOG.find((item) => item.id === mode);
  if (!format) throw unprocessable('Choose a tournament format.');
  if (teamCount < format.minTeams || teamCount > format.maxTeams) {
    throw unprocessable(`${format.name} supports ${teamRange(format.minTeams, format.maxTeams)} teams.`);
  }
  if ((teamCount - format.minTeams) % format.teamStep !== 0) {
    throw unprocessable(`${format.name} requires teams in groups of ${format.teamStep}.`);
  }
  if (mode === 'world-cup' && ![10, 16, 32].includes(teamCount)) {
    throw unprocessable('World Cup format supports 10, 16, or 32 teams.');
  }
}

function parseMode(value: unknown): ModeId {
  const isKnownMode = FORMAT_CATALOG.some((format) => format.id === value);
  if (!isKnownMode) throw unprocessable('Choose a tournament format.');
  return value as ModeId;
}

function parseSettings(value: unknown): TournamentSettings {
  const settings = record(value, 'Tournament settings are required.');
  const parsed = {
    teamCount: integer(settings.teamCount, 2, 32, 'Choose between 2 and 32 teams.'),
    courtCount: integer(settings.courtCount, 1, 20, 'Choose between 1 and 20 courts.'),
    matchDurationMinutes: integer(
      settings.matchDurationMinutes,
      5,
      120,
      'Match length must be between 5 and 120 minutes.',
    ),
    tournamentLengthMinutes: integer(
      settings.tournamentLengthMinutes,
      30,
      720,
      'Tournament length must be between 30 minutes and 12 hours.',
    ),
    startTimeMinutes: integer(
      settings.startTimeMinutes,
      0,
      1439,
      'Enter a valid start time.',
    ),
  };
  return parsed;
}

function parseTeamNames(value: unknown, teamCount: number): string[] {
  if (!Array.isArray(value) || value.length !== teamCount) {
    throw unprocessable(`Enter exactly ${teamCount} team names.`);
  }
  const names = value.map((name) => requiredText(name, 80, 'Team names cannot be blank.'));
  const uniqueNames = new Set(names.map((name) => name.toLocaleLowerCase()));
  if (uniqueNames.size !== names.length) {
    throw unprocessable('Team names must be unique within this tournament.');
  }
  return names;
}

function requiredText(value: unknown, maxLength: number, message: string): string {
  if (typeof value !== 'string') throw unprocessable(message);
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) throw unprocessable(message);
  return trimmed;
}

function integer(value: unknown, minimum: number, maximum: number, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw unprocessable(message);
  if (value < minimum || value > maximum) throw unprocessable(message);
  return value;
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw unprocessable(message);
  }
  return value as Record<string, unknown>;
}

function teamRange(minimum: number, maximum: number): string {
  return minimum === maximum ? `${minimum}` : `${minimum}–${maximum}`;
}
