import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Database } from './db.js';
import * as schema from './schema.js';
import { newId } from './ids.js';
import {
  createTournament, getGraph, listTournaments, loadMatch, loadPointsEntry,
} from './repository.js';
import { FORMATS, getFormat } from '../shared/formats/index.js';
import { indexMatches, resolveSlotTeam } from '../shared/resolve.js';
import { rescheduleFutureMatches } from '../shared/reschedule.js';
import type { TournamentConfig, TournamentGraph } from '../shared/types.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

export function respondError(response: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) sendJson(response, error.status, { error: error.message });
  else sendJson(response, 500, { error: 'Internal server error' });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function parseBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (text === '') return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return fail(400, 'Request body must be valid JSON');
  }
}

function requireString(body: Record<string, unknown>, field: string, maxLength: number): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    return fail(400, `${field} must be a string of 1-${maxLength} characters`);
  }
  return value.trim();
}

function requireInt(body: Record<string, unknown>, field: string, range: { min: number; max: number }): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < range.min || value > range.max) {
    return fail(400, `${field} must be an integer between ${range.min} and ${range.max}`);
  }
  return value;
}

function optionalInt(body: Record<string, unknown>, field: string, range: { min: number; max: number }): number | undefined {
  if (body[field] === undefined) return undefined;
  return requireInt(body, field, range);
}

function optionalString(body: Record<string, unknown>, field: string, maxLength: number): string | undefined {
  if (body[field] === undefined) return undefined;
  return requireString(body, field, maxLength);
}

const DEFAULT_CONFIG: TournamentConfig = {
  courts: 2, matchLengthMinutes: 20, tournamentLengthMinutes: 480,
  startMinutes: 540, restMinutes: 5, winPoints: 3, drawPoints: 1, lossPoints: 0,
};

function configFrom(body: Record<string, unknown>): TournamentConfig {
  const raw = (body.config ?? {}) as Record<string, unknown>;
  return {
    courts: optionalInt(raw, 'courts', { min: 1, max: 20 }) ?? DEFAULT_CONFIG.courts,
    matchLengthMinutes: optionalInt(raw, 'matchLengthMinutes', { min: 1, max: 240 }) ?? DEFAULT_CONFIG.matchLengthMinutes,
    tournamentLengthMinutes: optionalInt(raw, 'tournamentLengthMinutes', { min: 10, max: 3000 }) ?? DEFAULT_CONFIG.tournamentLengthMinutes,
    startMinutes: optionalInt(raw, 'startMinutes', { min: 0, max: 1439 }) ?? DEFAULT_CONFIG.startMinutes,
    restMinutes: optionalInt(raw, 'restMinutes', { min: 0, max: 120 }) ?? DEFAULT_CONFIG.restMinutes,
    winPoints: optionalInt(raw, 'winPoints', { min: -100, max: 100 }) ?? DEFAULT_CONFIG.winPoints,
    drawPoints: optionalInt(raw, 'drawPoints', { min: -100, max: 100 }) ?? DEFAULT_CONFIG.drawPoints,
    lossPoints: optionalInt(raw, 'lossPoints', { min: -100, max: 100 }) ?? DEFAULT_CONFIG.lossPoints,
  };
}

function teamNamesFrom(body: Record<string, unknown>): string[] {
  const value = body.teamNames;
  if (!Array.isArray(value) || value.some((name) => typeof name !== 'string' || name.trim() === '')) {
    return fail(400, 'teamNames must be an array of non-empty team names');
  }
  const names = value.map((name) => name.trim());
  if (new Set(names).size !== names.length) return fail(400, 'teamNames must be unique');
  return names;
}

async function graphOr404(db: Database, tournamentId: string): Promise<TournamentGraph> {
  const graph = await getGraph(db, tournamentId);
  if (graph === null) return fail(404, 'Tournament not found');
  return graph;
}

function assertOpen(graph: TournamentGraph): void {
  if (graph.tournament.status === 'closed') fail(409, 'Tournament is closed');
}

async function createTournamentRoute(db: Database, body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const name = requireString(body, 'name', 120);
  const mode = requireString(body, 'mode', 60);
  try {
    getFormat(mode);
  } catch {
    return fail(400, `Unknown tournament format: ${mode}`);
  }
  const format = getFormat(mode);
  const teamNames = teamNamesFrom(body);
  const problem = format.validate(teamNames.length);
  if (problem !== null) return fail(400, problem);
  const graph = await createTournament(db, { name, mode, config: configFrom(body), teamNames });
  return { status: 201, body: graph };
}

async function stageManualMatch(
  db: Database,
  tournamentId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const graph = await graphOr404(db, tournamentId);
  assertOpen(graph);
  const teamAId = requireString(body, 'teamAId', 60);
  const teamBId = requireString(body, 'teamBId', 60);
  const teamIds = new Set(graph.teams.map((team) => team.id));
  if (teamAId === teamBId || !teamIds.has(teamAId) || !teamIds.has(teamBId)) {
    return fail(400, 'Teams must be two different teams in this tournament');
  }
  const courtId = optionalString(body, 'courtId', 60);
  if (courtId !== undefined && !graph.courts.some((court) => court.id === courtId)) {
    return fail(400, 'Court does not belong to this tournament');
  }
  const start = optionalInt(body, 'startMinutes', { min: 0, max: 1439 }) ?? graph.tournament.config.startMinutes;
  const key = nextManualKey(graph);
  const teamName = (id: string) => graph.teams.find((team) => team.id === id)?.name as string;
  await db.insert(schema.matches).values({
    id: newId(), tournamentId, matchKey: key,
    phase: optionalString(body, 'phase', 80) ?? 'Manual Match',
    groupKey: null, round: 1,
    slotA: { kind: 'team', teamRef: teamAId, label: teamName(teamAId) },
    slotB: { kind: 'team', teamRef: teamBId, label: teamName(teamBId) },
    dependsOn: [], courtId: courtId ?? null,
    startMinutes: start, endMinutes: start + graph.tournament.config.matchLengthMinutes,
    status: 'scheduled', origin: 'manual',
  });
  return { status: 201, body: await graphOr404(db, tournamentId) };
}

function nextManualKey(graph: TournamentGraph): string {
  const keys = new Set(graph.matches.map((match) => match.key));
  let counter = 1;
  while (keys.has(`MAN-${counter}`)) counter += 1;
  return `MAN-${counter}`;
}

async function loadMatchContext(db: Database, matchId: string) {
  const match = await loadMatch(db, matchId);
  if (match === null) return fail(404, 'Match not found');
  const graph = await graphOr404(db, match.tournamentId);
  return { match, graph };
}

async function startMatch(db: Database, matchId: string) {
  const { match, graph } = await loadMatchContext(db, matchId);
  assertOpen(graph);
  if (match.status !== 'scheduled') return fail(409, 'Only a scheduled match can be started');
  await db.update(schema.matches).set({ status: 'live' }).where(eq(schema.matches.id, matchId));
  return { status: 200, body: await graphOr404(db, match.tournamentId) };
}

async function scoreMatch(db: Database, matchId: string, body: Record<string, unknown>) {
  const { match, graph } = await loadMatchContext(db, matchId);
  assertOpen(graph);
  if (match.status !== 'live') return fail(409, 'Only a live match can be scored');
  const scoreA = requireInt(body, 'scoreA', { min: 0, max: 999 });
  const scoreB = requireInt(body, 'scoreB', { min: 0, max: 999 });
  await db.update(schema.matches).set({ scoreA, scoreB }).where(eq(schema.matches.id, matchId));
  return { status: 200, body: await graphOr404(db, match.tournamentId) };
}

async function awardForResult(
  db: Database,
  context: { tournamentId: string; matchId: string; key: string },
  awards: { teamId: string; points: number; result: string }[],
): Promise<void> {
  for (const award of awards) {
    await db.insert(schema.pointsEntries).values({
      id: newId(), tournamentId: context.tournamentId, teamId: award.teamId,
      matchId: context.matchId, points: award.points,
      reason: `Match ${context.key}: ${award.result}`, status: 'active',
    });
  }
}

async function finaliseMatch(db: Database, matchId: string) {
  const { match, graph } = await loadMatchContext(db, matchId);
  assertOpen(graph);
  if (match.status !== 'live') return fail(409, 'Only a live match can be finalised');
  if (match.scoreA === null || match.scoreB === null) return fail(409, 'Record a score before finalising');
  const byKey = indexMatches(graph.matches);
  const view = graph.matches.find((candidate) => candidate.id === matchId) as TournamentGraph['matches'][number];
  const teamA = resolveSlotTeam(view.slotA, byKey);
  const teamB = resolveSlotTeam(view.slotB, byKey);
  if (teamA === null || teamB === null) return fail(422, 'Match participants are not decided yet');
  await db.update(schema.matches).set({ status: 'final' }).where(eq(schema.matches.id, matchId));
  const config = graph.tournament.config;
  const context = { tournamentId: match.tournamentId, matchId, key: match.matchKey };
  if (match.scoreA === match.scoreB) {
    await awardForResult(db, context, [
      { teamId: teamA, points: config.drawPoints, result: 'draw' },
      { teamId: teamB, points: config.drawPoints, result: 'draw' },
    ]);
  } else if (match.scoreA > match.scoreB) {
    await awardForResult(db, context, [
      { teamId: teamA, points: config.winPoints, result: 'win' },
      { teamId: teamB, points: config.lossPoints, result: 'loss' },
    ]);
  } else {
    await awardForResult(db, context, [
      { teamId: teamA, points: config.lossPoints, result: 'loss' },
      { teamId: teamB, points: config.winPoints, result: 'win' },
    ]);
  }
  return { status: 200, body: await graphOr404(db, match.tournamentId) };
}

async function cancelMatch(db: Database, matchId: string) {
  const { match, graph } = await loadMatchContext(db, matchId);
  assertOpen(graph);
  if (match.status === 'final' || match.status === 'cancelled') {
    return fail(409, 'A finished match cannot be cancelled');
  }
  await db.update(schema.matches).set({ status: 'cancelled' }).where(eq(schema.matches.id, matchId));
  return { status: 200, body: await graphOr404(db, match.tournamentId) };
}

async function assignPoints(db: Database, tournamentId: string, body: Record<string, unknown>) {
  const graph = await graphOr404(db, tournamentId);
  assertOpen(graph);
  const teamId = requireString(body, 'teamId', 60);
  if (!graph.teams.some((team) => team.id === teamId)) return fail(404, 'Team not found in this tournament');
  const points = requireInt(body, 'points', { min: -1000, max: 1000 });
  const reason = requireString(body, 'reason', 200);
  await db.insert(schema.pointsEntries).values({
    id: newId(), tournamentId, teamId, matchId: null, points, reason, status: 'active',
  });
  return { status: 201, body: await graphOr404(db, tournamentId) };
}

async function voidPoints(db: Database, entryId: string, body: Record<string, unknown>) {
  const entry = await loadPointsEntry(db, entryId);
  if (entry === null) return fail(404, 'Points entry not found');
  if (entry.status === 'voided') return fail(409, 'Points entry is already voided');
  const reason = requireString(body, 'reason', 200);
  await db.update(schema.pointsEntries)
    .set({ status: 'voided', voidReason: reason })
    .where(eq(schema.pointsEntries.id, entryId));
  return { status: 200, body: await graphOr404(db, entry.tournamentId) };
}

function courtNumber(name: string): number {
  return Number(name.replace('Court ', ''));
}

async function syncCourts(db: Database, graph: TournamentGraph, wanted: number): Promise<TournamentGraph['courts']> {
  const sorted = [...graph.courts].sort((a, b) => courtNumber(a.name) - courtNumber(b.name));
  if (sorted.length < wanted) {
    let next = sorted.length + 1;
    for (let count = sorted.length; count < wanted; count += 1) {
      const id = newId();
      await db.insert(schema.courts).values({ id, tournamentId: graph.tournament.id, name: `Court ${next}` });
      sorted.push({ id, name: `Court ${next}` });
      next += 1;
    }
  }
  if (sorted.length > wanted) {
    for (const court of sorted.slice(wanted)) {
      await db.update(schema.courts).set({ deletedAt: new Date() }).where(eq(schema.courts.id, court.id));
    }
  }
  return [...(await graphOr404(db, graph.tournament.id)).courts]
    .sort((a, b) => courtNumber(a.name) - courtNumber(b.name));
}

async function applyContingency(db: Database, tournamentId: string, body: Record<string, unknown>) {
  const graph = await graphOr404(db, tournamentId);
  assertOpen(graph);
  const courtsWanted = requireInt(body, 'courts', { min: 1, max: 20 });
  const matchLength = requireInt(body, 'matchLengthMinutes', { min: 1, max: 240 });
  const courts = await syncCourts(db, graph, courtsWanted);
  const config = { ...graph.tournament.config, courts: courtsWanted, matchLengthMinutes: matchLength };
  await db.update(schema.tournaments).set({ config }).where(eq(schema.tournaments.id, tournamentId));
  const fresh = await graphOr404(db, tournamentId);
  const scheduledStarts = fresh.matches
    .filter((match) => match.status === 'scheduled' && match.startMinutes !== null)
    .map((match) => match.startMinutes as number);
  const anchor = scheduledStarts.length > 0 ? Math.min(...scheduledStarts) : fresh.tournament.config.startMinutes;
  const slots = rescheduleFutureMatches(fresh.matches, {
    courts: courtsWanted, matchLengthMinutes: matchLength,
    startMinutes: anchor, restMinutes: fresh.tournament.config.restMinutes,
  });
  for (const slot of slots) {
    await db.update(schema.matches).set({
      courtId: slot.courtNumber === null ? null : courts[slot.courtNumber - 1].id,
      startMinutes: slot.startMinutes, endMinutes: slot.endMinutes,
    }).where(eq(schema.matches.id, slot.matchId));
  }
  return { status: 200, body: await graphOr404(db, tournamentId) };
}

async function closeTournament(db: Database, tournamentId: string) {
  const graph = await graphOr404(db, tournamentId);
  if (graph.tournament.status === 'closed') return fail(409, 'Tournament is already closed');
  if (graph.matches.some((match) => match.status === 'live')) {
    return fail(409, 'Cannot close while a match is live');
  }
  await db.update(schema.tournaments).set({ status: 'closed' }).where(eq(schema.tournaments.id, tournamentId));
  return { status: 200, body: await graphOr404(db, tournamentId) };
}

type Handler = (db: Database, segments: string[], body: Record<string, unknown>) => Promise<{ status: number; body: unknown }>;

function formatMetadata() {
  return FORMATS.map((format) => ({
    id: format.id, name: format.name, description: format.description,
    minTeams: format.minTeams, maxTeams: format.maxTeams,
    enforcedRestMinutes: format.enforcedRestMinutes,
  }));
}

async function routeApi(db: Database, method: string, segments: string[], body: Record<string, unknown>) {
  if (method === 'GET' && segments.length === 1 && segments[0] === 'health') return { status: 200, body: { status: 'ok' } };
  if (method === 'GET' && segments.length === 1 && segments[0] === 'formats') return { status: 200, body: formatMetadata() };
  if (method === 'GET' && segments.length === 1 && segments[0] === 'tournaments') {
    return { status: 200, body: await listTournaments(db) };
  }
  if (method === 'POST' && segments.length === 1 && segments[0] === 'tournaments') return createTournamentRoute(db, body);
  if (method === 'GET' && segments.length === 2 && segments[0] === 'tournaments') {
    return { status: 200, body: await graphOr404(db, segments[1]) };
  }
  const tournamentAction = matchTournamentAction(method, segments);
  if (tournamentAction !== null) return tournamentAction(db, segments, body);
  const matchAction = matchMatchAction(method, segments);
  if (matchAction !== null) return matchAction(db, segments, body);
  if (method === 'POST' && segments.length === 3 && segments[0] === 'points' && segments[2] === 'void') {
    return voidPoints(db, segments[1], body);
  }
  return fail(404, 'Route not found');
}

function matchTournamentAction(method: string, segments: string[]): Handler | null {
  if (segments.length !== 3 || segments[0] !== 'tournaments') return null;
  if (method === 'POST' && segments[2] === 'matches') return (db, seg, body) => stageManualMatch(db, seg[1], body);
  if (method === 'POST' && segments[2] === 'points') return (db, seg, body) => assignPoints(db, seg[1], body);
  if (method === 'POST' && segments[2] === 'contingency') return (db, seg, body) => applyContingency(db, seg[1], body);
  if (method === 'POST' && segments[2] === 'close') return (db, seg) => closeTournament(db, seg[1]);
  return null;
}

function matchMatchAction(method: string, segments: string[]): Handler | null {
  if (segments.length !== 3 || segments[0] !== 'matches') return null;
  if (method === 'POST' && segments[2] === 'start') return (db, seg) => startMatch(db, seg[1]);
  if (method === 'PATCH' && segments[2] === 'score') return (db, seg, body) => scoreMatch(db, seg[1], body);
  if (method === 'POST' && segments[2] === 'finalise') return (db, seg) => finaliseMatch(db, seg[1]);
  if (method === 'POST' && segments[2] === 'cancel') return (db, seg) => cancelMatch(db, seg[1]);
  return null;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};

async function serveStatic(staticDir: string, pathname: string, response: ServerResponse): Promise<boolean> {
  const safePath = normalize(`/${pathname}`);
  const filePath = join(staticDir, safePath);
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream' });
    response.end(content);
    return true;
  } catch {
    try {
      const index = await readFile(join(staticDir, 'index.html'));
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(index);
      return true;
    } catch {
      return false;
    }
  }
}

export function createApp(db: Database, staticDir?: string) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const url = new URL(request.url as string, 'http://localhost');
      const segments = url.pathname.split('/').filter((part) => part.length > 0);
      if (segments[0] === 'api') {
        const body = request.method === 'GET' ? {} : await parseBody(request);
        const result = await routeApi(db, request.method as string, segments.slice(1), body);
        sendJson(response, result.status, result.body);
        return;
      }
      if (staticDir !== undefined && request.method === 'GET' && await serveStatic(staticDir, url.pathname, response)) return;
      sendJson(response, 404, { error: 'Route not found' });
    } catch (error) {
      respondError(response, error);
    }
  };
}

export function createHttpServer(db: Database, staticDir?: string): Server {
  return createServer(createApp(db, staticDir));
}
