import type {
  AwardPointsInput,
  FinalizeMatchInput,
  LiveScoreInput,
  StageMatchInput,
  WeatherChangeInput,
} from '../../shared/contracts.js';
import { unprocessable } from '../errors.js';

export function parseWeatherInput(value: unknown): WeatherChangeInput {
  const body = object(value);
  return {
    courtCount: number(body.courtCount),
    matchDurationMinutes: number(body.matchDurationMinutes),
    effectiveAtMinutes: number(body.effectiveAtMinutes),
  };
}

export function parseStageMatchInput(value: unknown): StageMatchInput {
  const body = object(value);
  const input: StageMatchInput = {
    homeTeamId: text(body.homeTeamId),
    awayTeamId: text(body.awayTeamId),
  };
  if (body.phase !== undefined) input.phase = optionalText(body.phase, 80);
  if (body.roundNumber !== undefined) input.roundNumber = positiveInteger(body.roundNumber);
  if (body.startMinute !== undefined) input.startMinute = number(body.startMinute);
  if (body.courtNumber !== undefined) input.courtNumber = positiveInteger(body.courtNumber);
  return input;
}

export function parseLiveScoreInput(value: unknown): LiveScoreInput {
  const body = object(value);
  return { home: number(body.home), away: number(body.away) };
}

export function parseFinalizeMatchInput(value: unknown): FinalizeMatchInput {
  const body = object(value);
  const input: FinalizeMatchInput = { home: number(body.home), away: number(body.away) };
  if (body.advancingTeamId !== undefined) input.advancingTeamId = text(body.advancingTeamId);
  return input;
}

export function parseReasonInput(value: unknown): unknown {
  return object(value).reason;
}

export function parseAwardPointsInput(value: unknown): AwardPointsInput {
  const body = object(value);
  const input: AwardPointsInput = {
    teamId: text(body.teamId),
    points: number(body.points),
    reason: text(body.reason),
  };
  if (body.matchId !== undefined) input.matchId = text(body.matchId);
  return input;
}

export function parseIdentifier(value: unknown): string {
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw unprocessable('That record ID is not valid.');
  }
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw unprocessable('Send the requested fields as an object.');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw unprocessable('Complete every required text field.');
  }
  return value.trim();
}

function optionalText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw unprocessable(`Text must be ${maxLength} characters or fewer.`);
  }
  return value.trim();
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw unprocessable('Use whole numbers for scores, times, points, and resource counts.');
  }
  return value;
}

function positiveInteger(value: unknown): number {
  const parsed = number(value);
  if (parsed < 1) throw unprocessable('Enter a number greater than zero.');
  return parsed;
}
