// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { createDatabase, type DbHandle } from './db.js';
import { createHttpServer, respondError, HttpError } from './app.js';
import type { MatchView, TournamentGraph } from '../shared/types.js';

let handle: DbHandle;
let server: Server;
let base = '';
let staticServer: Server;
let staticBase = '';
let staticDir = '';

interface Reply { status: number; body: TournamentGraph & { error?: string } }

async function call(method: string, path: string, payload?: unknown, onStatic = false): Promise<Reply> {
  const response = await fetch(`${onStatic ? staticBase : base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? ({} as Reply['body']) : JSON.parse(text) };
}

async function createRoundRobin(name = 'Autumn Cup'): Promise<TournamentGraph> {
  const reply = await call('POST', '/api/tournaments', {
    name, mode: 'round-robin',
    teamNames: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
    config: { courts: 2, matchLengthMinutes: 20, startMinutes: 540 },
  });
  expect(reply.status).toBe(201);
  return reply.body;
}

beforeAll(async () => {
  handle = await createDatabase();
  server = createHttpServer(handle.db);
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  staticDir = await mkdtemp(join(tmpdir(), 'static-'));
  await writeFile(join(staticDir, 'index.html'), '<h1>Tournament desk</h1>');
  await writeFile(join(staticDir, 'app.js'), 'console.log(1)');
  await writeFile(join(staticDir, 'styles.css'), 'body{}');
  await writeFile(join(staticDir, 'data.json'), '{}');
  await writeFile(join(staticDir, 'logo.svg'), '<svg/>');
  await writeFile(join(staticDir, 'file.bin'), 'bin');
  staticServer = createHttpServer(handle.db, staticDir);
  await new Promise<void>((resolve) => { staticServer.listen(0, '127.0.0.1', resolve); });
  staticBase = `http://127.0.0.1:${(staticServer.address() as { port: number }).port}`;
});

afterAll(async () => {
  server.close();
  staticServer.close();
  await rm(staticDir, { recursive: true, force: true });
  await handle.close();
});

describe('health, formats and tournament creation', () => {
  it('serves health and format metadata', async () => {
    const health = await call('GET', '/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });
    const formats = await call('GET', '/api/formats');
    expect(formats.status).toBe(200);
    expect((formats.body as unknown as unknown[]).length).toBe(9);
  });

  it('creates a tournament graph with named teams in slot labels', async () => {
    const graph = await createRoundRobin();
    expect(graph.teams.map((team) => team.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    expect(graph.matches).toHaveLength(6);
    expect(graph.matches[0].slotA).toMatchObject({ kind: 'team', label: 'Alpha' });
    expect(graph.courts).toHaveLength(2);
    expect(graph.standings).toHaveLength(4);
    const list = await call('GET', '/api/tournaments');
    expect((list.body as unknown as unknown[]).length).toBeGreaterThan(0);
    const fetched = await call('GET', `/api/tournaments/${graph.tournament.id}`);
    expect(fetched.status).toBe(200);
  });

  it('rejects invalid creation payloads', async () => {
    const cases: [unknown, string][] = [
      [{ mode: 'round-robin', teamNames: ['A', 'B'] }, 'name must be'],
      [{ name: 'X', mode: 'nope', teamNames: ['A', 'B'] }, 'Unknown tournament format'],
      [{ name: 'X', mode: 'round-robin', teamNames: 'AB' }, 'teamNames must be'],
      [{ name: 'X', mode: 'round-robin', teamNames: ['A', 'A'] }, 'unique'],
      [{ name: 'X', mode: 'round-robin', teamNames: ['A', ' '] }, 'teamNames must be'],
      [{ name: 'X', mode: 'consolation', teamNames: ['A', 'B', 'C', 'D'] }, 'exactly 8'],
      [{ name: 'X', mode: 'round-robin', teamNames: ['A', 'B'], config: { courts: 0 } }, 'courts must be'],
      [{ name: 'X'.repeat(121), mode: 'round-robin', teamNames: ['A', 'B'] }, 'name must be'],
    ];
    for (const [payload, fragment] of cases) {
      const reply = await call('POST', '/api/tournaments', payload);
      expect(reply.status).toBe(400);
      expect(reply.body.error).toContain(fragment);
    }
  });

  it('persists bye matches without a court (swiss odd field)', async () => {
    const reply = await call('POST', '/api/tournaments', {
      name: 'Swiss Cup', mode: 'swiss', teamNames: ['A', 'B', 'C', 'D', 'E'],
    });
    expect(reply.status).toBe(201);
    expect(reply.body.matches.some((match: MatchView) => match.courtName === null)).toBe(true);
  });

  it('returns 404 for unknown and malformed tournament ids', async () => {
    expect((await call('GET', '/api/tournaments/not-a-uuid')).status).toBe(404);
    expect((await call('GET', '/api/tournaments/123e4567-e89b-42d3-a456-426614174000')).status).toBe(404);
    expect((await call('GET', '/api/nope')).status).toBe(404);
    expect((await call('GET', '/')).status).toBe(404);
  });

  it('rejects malformed JSON', async () => {
    const response = await fetch(`${base}/api/tournaments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken',
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Request body must be valid JSON');
  });
});

describe('desk match lifecycle', () => {
  it('stages manual matches and enforces team scoping', async () => {
    const graph = await createRoundRobin('Manual Cup');
    const [alpha, bravo] = graph.teams;
    const staged = await call('POST', `/api/tournaments/${graph.tournament.id}/matches`, {
      teamAId: alpha.id, teamBId: bravo.id, courtId: graph.courts[0].id, startMinutes: 700,
    });
    expect(staged.status).toBe(201);
    expect(staged.body.matches.some((match) => match.key === 'MAN-1')).toBe(true);
    const second = await call('POST', `/api/tournaments/${graph.tournament.id}/matches`, {
      teamAId: alpha.id, teamBId: bravo.id,
    });
    expect(second.body.matches.some((match) => match.key === 'MAN-2')).toBe(true);
    const other = await createRoundRobin('Other Cup');
    const scoped = await call('POST', `/api/tournaments/${graph.tournament.id}/matches`, {
      teamAId: alpha.id, teamBId: other.teams[0].id,
    });
    expect(scoped.status).toBe(400);
    expect((await call('POST', `/api/tournaments/${graph.tournament.id}/matches`, {
      teamAId: alpha.id, teamBId: alpha.id,
    })).status).toBe(400);
    expect((await call('POST', `/api/tournaments/${graph.tournament.id}/matches`, {
      teamAId: alpha.id, teamBId: bravo.id, courtId: other.courts[0].id,
    })).status).toBe(400);
    expect((await call('POST', '/api/tournaments/not-a-uuid/matches', {
      teamAId: alpha.id, teamBId: bravo.id,
    })).status).toBe(404);
  });

  it('runs start, live score and finalise, awarding points', async () => {
    const graph = await createRoundRobin('Lifecycle Cup');
    const match = graph.matches[0];
    expect((await call('PATCH', `/api/matches/${match.id}/score`, { scoreA: 1, scoreB: 0 })).status).toBe(409);
    expect((await call('POST', `/api/matches/${match.id}/finalise`)).status).toBe(409);
    expect((await call('POST', `/api/matches/${match.id}/start`)).status).toBe(200);
    expect((await call('POST', `/api/matches/${match.id}/start`)).status).toBe(409);
    expect((await call('POST', `/api/matches/${match.id}/finalise`)).status).toBe(409);
    const scored = await call('PATCH', `/api/matches/${match.id}/score`, { scoreA: 10, scoreB: 4 });
    expect(scored.status).toBe(200);
    expect((await call('PATCH', `/api/matches/${match.id}/score`, { scoreA: -1, scoreB: 0 })).status).toBe(400);
    const final = await call('POST', `/api/matches/${match.id}/finalise`);
    expect(final.status).toBe(200);
    expect(final.body.pointsEntries).toHaveLength(2);
    expect(final.body.standings[0].points).toBe(3);
    expect((await call('PATCH', `/api/matches/${match.id}/score`, { scoreA: 1, scoreB: 1 })).status).toBe(409);
    expect((await call('POST', `/api/matches/${match.id}/cancel`)).status).toBe(409);
    expect((await call('POST', '/api/matches/not-a-uuid/start')).status).toBe(404);
    expect((await call('POST', '/api/matches/123e4567-e89b-42d3-a456-426614174000/start')).status).toBe(404);
    expect((await call('POST', `/api/matches/${match.id}/dance`)).status).toBe(404);
  });

  it('awards points when the second team wins', async () => {
    const graph = await createRoundRobin('Away Win Cup');
    const match = graph.matches[0];
    await call('POST', `/api/matches/${match.id}/start`);
    await call('PATCH', `/api/matches/${match.id}/score`, { scoreA: 2, scoreB: 7 });
    const final = await call('POST', `/api/matches/${match.id}/finalise`);
    const slotB = match.slotB as { teamRef: string };
    expect(final.body.standings.find((row) => row.teamId === slotB.teamRef)?.points).toBe(3);
    expect((await call('POST', `/api/tournaments/${graph.tournament.id}/dance`)).status).toBe(404);
  });

  it('awards draw points and cancels a scheduled match', async () => {
    const graph = await createRoundRobin('Draw Cup');
    const [first, second] = graph.matches;
    await call('POST', `/api/matches/${first.id}/start`);
    await call('PATCH', `/api/matches/${first.id}/score`, { scoreA: 6, scoreB: 6 });
    const final = await call('POST', `/api/matches/${first.id}/finalise`);
    expect(final.body.pointsEntries.every((entry) => entry.points === 1)).toBe(true);
    const cancelled = await call('POST', `/api/matches/${second.id}/cancel`);
    expect(cancelled.body.matches.find((m) => m.id === second.id)?.status).toBe('cancelled');
    expect((await call('POST', `/api/matches/${second.id}/cancel`)).status).toBe(409);
  });

  it('refuses to finalise a match whose participants are placeholders', async () => {
    const reply = await call('POST', '/api/tournaments', {
      name: 'Knockout Cup', mode: 'single-elimination', teamNames: ['A', 'B', 'C', 'D'],
    });
    const graph = reply.body;
    const final = graph.matches[graph.matches.length - 1];
    await call('POST', `/api/matches/${final.id}/start`);
    await call('PATCH', `/api/matches/${final.id}/score`, { scoreA: 5, scoreB: 3 });
    const refused = await call('POST', `/api/matches/${final.id}/finalise`);
    expect(refused.status).toBe(422);
    expect(refused.body.error).toBe('Match participants are not decided yet');
  });
});

describe('points ledger', () => {
  it('assigns points directly and voids them with a reason', async () => {
    const graph = await createRoundRobin('Ledger Cup');
    const team = graph.teams[0];
    const assigned = await call('POST', `/api/tournaments/${graph.tournament.id}/points`, {
      teamId: team.id, points: 5, reason: 'Desk bonus',
    });
    expect(assigned.status).toBe(201);
    expect(assigned.body.standings.find((row) => row.teamId === team.id)?.points).toBe(5);
    const entry = assigned.body.pointsEntries[0];
    expect((await call('POST', `/api/points/${entry.id}/void`, {})).status).toBe(400);
    const voided = await call('POST', `/api/points/${entry.id}/void`, { reason: 'Awarded in error' });
    expect(voided.status).toBe(200);
    expect(voided.body.standings.find((row) => row.teamId === team.id)?.points).toBe(0);
    expect((await call('POST', `/api/points/${entry.id}/void`, { reason: 'again' })).status).toBe(409);
    expect((await call('POST', '/api/points/not-a-uuid/void', { reason: 'x' })).status).toBe(404);
    expect((await call('POST', '/api/points/123e4567-e89b-42d3-a456-426614174000/void', { reason: 'x' })).status).toBe(404);
  });

  it('rejects direct points for teams outside the tournament', async () => {
    const graph = await createRoundRobin('Scoped Cup');
    const other = await createRoundRobin('Scoped Other');
    const reply = await call('POST', `/api/tournaments/${graph.tournament.id}/points`, {
      teamId: other.teams[0].id, points: 2, reason: 'Wrong scope',
    });
    expect(reply.status).toBe(404);
    expect((await call('POST', `/api/tournaments/${graph.tournament.id}/points`, {
      teamId: graph.teams[0].id, points: 5000, reason: 'Too many',
    })).status).toBe(400);
  });
});

describe('wet-weather contingency and closing', () => {
  it('re-times only unstarted matches when courts and length change', async () => {
    const graph = await createRoundRobin('Rain Cup');
    const finished = graph.matches[0];
    await call('POST', `/api/matches/${finished.id}/start`);
    await call('PATCH', `/api/matches/${finished.id}/score`, { scoreA: 9, scoreB: 2 });
    await call('POST', `/api/matches/${finished.id}/finalise`);
    const shrunk = await call('POST', `/api/tournaments/${graph.tournament.id}/contingency`, {
      courts: 1, matchLengthMinutes: 10,
    });
    expect(shrunk.status).toBe(200);
    expect(shrunk.body.courts).toHaveLength(1);
    expect(shrunk.body.tournament.config.matchLengthMinutes).toBe(10);
    const kept = shrunk.body.matches.find((m) => m.id === finished.id);
    expect(kept?.endMinutes).toBe(finished.endMinutes);
    const future = shrunk.body.matches.filter((m) => m.status === 'scheduled');
    expect(future.every((m) => (m.endMinutes ?? 0) - (m.startMinutes ?? 0) === 10)).toBe(true);
    const grown = await call('POST', `/api/tournaments/${graph.tournament.id}/contingency`, {
      courts: 3, matchLengthMinutes: 15,
    });
    expect(grown.body.courts).toHaveLength(3);
    expect((await call('POST', `/api/tournaments/${graph.tournament.id}/contingency`, {
      courts: 0, matchLengthMinutes: 15,
    })).status).toBe(400);
  });

  it('applies contingency to a swiss tournament with bye matches', async () => {
    const created = await call('POST', '/api/tournaments', {
      name: 'Swiss Rain', mode: 'swiss', teamNames: ['A', 'B', 'C', 'D', 'E'],
    });
    const reply = await call('POST', `/api/tournaments/${created.body.tournament.id}/contingency`, {
      courts: 1, matchLengthMinutes: 12,
    });
    expect(reply.status).toBe(200);
    expect(reply.body.matches.some((match: MatchView) => match.courtName === null)).toBe(true);
  });

  it('applies contingency when nothing is scheduled', async () => {
    const graph = await createRoundRobin('Done Cup');
    for (const match of graph.matches) await call('POST', `/api/matches/${match.id}/cancel`);
    const reply = await call('POST', `/api/tournaments/${graph.tournament.id}/contingency`, {
      courts: 1, matchLengthMinutes: 30,
    });
    expect(reply.status).toBe(200);
  });

  it('closes only as a deliberate act, then stays readable', async () => {
    const graph = await createRoundRobin('Closing Cup');
    const match = graph.matches[0];
    await call('POST', `/api/matches/${match.id}/start`);
    expect((await call('POST', `/api/tournaments/${graph.tournament.id}/close`)).status).toBe(409);
    await call('POST', `/api/matches/${match.id}/cancel`);
    for (const rest of graph.matches.slice(1)) await call('POST', `/api/matches/${rest.id}/cancel`);
    const closed = await call('POST', `/api/tournaments/${graph.tournament.id}/close`);
    expect(closed.status).toBe(200);
    expect(closed.body.tournament.status).toBe('closed');
    expect((await call('POST', `/api/tournaments/${graph.tournament.id}/close`)).status).toBe(409);
    expect((await call('POST', `/api/tournaments/${graph.tournament.id}/matches`, {
      teamAId: graph.teams[0].id, teamBId: graph.teams[1].id,
    })).status).toBe(409);
    expect((await call('GET', `/api/tournaments/${graph.tournament.id}`)).status).toBe(200);
  });
});

describe('static hosting and error responses', () => {
  it('serves built frontend assets and SPA fallback', async () => {
    const js = await fetch(`${staticBase}/app.js`);
    expect(js.headers.get('content-type')).toContain('text/javascript');
    expect(await js.text()).toBe('console.log(1)');
    expect((await fetch(`${staticBase}/styles.css`)).headers.get('content-type')).toContain('text/css');
    expect((await fetch(`${staticBase}/data.json`)).headers.get('content-type')).toContain('application/json');
    expect((await fetch(`${staticBase}/logo.svg`)).headers.get('content-type')).toContain('image/svg+xml');
    expect((await fetch(`${staticBase}/file.bin`)).headers.get('content-type')).toContain('octet-stream');
    const spa = await fetch(`${staticBase}/desk/live`);
    expect(await spa.text()).toContain('Tournament desk');
  });

  it('returns 404 when no static asset and no index exists', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'static-empty-'));
    const emptyServer = createHttpServer(handle.db, emptyDir);
    await new Promise<void>((resolve) => { emptyServer.listen(0, '127.0.0.1', resolve); });
    const port = (emptyServer.address() as { port: number }).port;
    const response = await fetch(`http://127.0.0.1:${port}/missing`);
    expect(response.status).toBe(404);
    emptyServer.close();
    await rm(emptyDir, { recursive: true, force: true });
  });

  it('responds to errors with stable JSON', () => {
    const captured: { status?: number; body?: string } = {};
    const response = {
      writeHead: (status: number) => { captured.status = status; },
      end: (body: string) => { captured.body = body; },
    };
    respondError(response as never, new HttpError(418, 'Teapot'));
    expect(captured.status).toBe(418);
    respondError(response as never, new Error('boom'));
    expect(captured.status).toBe(500);
    expect(JSON.parse(captured.body as string).error).toBe('Internal server error');
  });
});
