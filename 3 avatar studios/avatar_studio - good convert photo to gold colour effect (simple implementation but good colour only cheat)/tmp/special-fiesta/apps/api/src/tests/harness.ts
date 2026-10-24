import { DEFAULT_AVATAR_LOOK_CODE } from '@psd/contracts';
import type { Hono } from 'hono';
import { uuidv7 } from 'uuidv7';
import { createApp } from '../app.js';
import { openInMemoryDatabase, type DatabaseHandle } from '../db/client.js';
import { ensureSchema } from '../db/bootstrap.js';
import { seedDatabase } from '../db/seed.js';
import { overrideEnv } from '../env.js';
import type { AppBindings } from '../lib/session.js';
import { activityNameFor, anyClusterCode, nicknameFor, teamNameFor } from './fixtures/names.js';

/**
 * Every test file gets its own migrated, seeded, in-memory PostgreSQL database and its own
 * app instance (AGENTS-testing.md §2). Nothing is mocked: the repositories, SQL, constraints
 * and cookies are the real ones.
 */

export const SUPERADMIN_PASSCODE = '4242';

export interface ActorSession {
  headers: Record<string, string>;
  id: string;
  username?: string;
  nickname?: string;
}

export interface TestContext {
  app: Hono<AppBindings>;
  handle: DatabaseHandle;
  runId: string;
  close: () => Promise<void>;
  signUpParticipant: (overrides?: ParticipantOverrides) => Promise<ParticipantSession>;
  signInSuperadmin: () => Promise<ActorSession>;
  createFacilitator: (username?: string) => Promise<ActorSession>;
  json: <T>(response: Response) => Promise<T>;
}

export interface ParticipantOverrides {
  nickname?: string;
  pin?: string;
  clusterCode?: string;
  gender?: 'male' | 'female';
  avatarVariant?: number;
  avatarLook?: string;
  /** ADR-324 — a sprite carried by the signup itself. */
  avatarPhoto?: string;
}

export interface ParticipantSession extends ActorSession {
  nickname: string;
  pin: string;
  clusterCode: string;
  /** ADR-061 — the energetic word the server assigned; never chosen by the caller. */
  title: string;
}

function cookieHeaderFrom(response: Response): Record<string, string> {
  const raw = response.headers.get('set-cookie') ?? '';
  const token = raw.split(';')[0] ?? '';
  return token ? { cookie: token } : {};
}

export function jsonRequest(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

export function withMethod(
  method: 'PUT' | 'PATCH' | 'DELETE',
  body: unknown,
  headers: Record<string, string> = {},
): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    // Omitted rather than set to `undefined`: with exactOptionalPropertyTypes those differ, and
    // `RequestInit` asks for a body that is absent rather than one that is explicitly nothing.
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export async function createTestContext(): Promise<TestContext> {
  overrideEnv({
    NODE_ENV: 'test',
    DATABASE_DRIVER: 'pglite',
    PGLITE_DATA_DIR: 'memory://',
    SUPERADMIN_INITIAL_PASSCODE: SUPERADMIN_PASSCODE,
    SUPERADMIN_INITIAL_USERNAME: 'superadmin',
    SESSION_TTL_DAYS: 30,
    COOKIE_SECURE: false,
  });
  const handle = await openInMemoryDatabase();
  await ensureSchema(handle);
  await seedDatabase(handle);
  const app = createApp(handle);
  const runId = uuidv7().slice(-6);

  const context: TestContext = {
    app,
    handle,
    runId,
    close: () => handle.close(),
    json: async <T>(response: Response) => (await response.json()) as T,
    signUpParticipant: (overrides) => signUpParticipant(app, runId, overrides),
    signInSuperadmin: () => signInSuperadmin(app),
    createFacilitator: (username) => createFacilitator(context, username),
  };
  return context;
}

let participantCounter = 0;

async function signUpParticipant(
  app: Hono<AppBindings>,
  runId: string,
  overrides: ParticipantOverrides = {},
): Promise<ParticipantSession> {
  participantCounter += 1;
  const clusterCode = overrides.clusterCode ?? anyClusterCode(participantCounter);
  const nickname = overrides.nickname ?? nicknameFor({ clusterCode, runId });
  const pin = overrides.pin ?? '1234';
  const response = await app.request(
    '/api/auth/participants/signup',
    jsonRequest({
      nickname,
      pin,
      clusterCode,
      gender: overrides.gender ?? 'female',
      avatarVariant: overrides.avatarVariant ?? 3,
      avatarLook: overrides.avatarLook ?? DEFAULT_AVATAR_LOOK_CODE,
      ...(overrides.avatarPhoto === undefined ? {} : { avatarPhoto: overrides.avatarPhoto }),
    }),
  );
  if (response.status !== 201) throw new Error(`signup failed: ${await response.text()}`);
  const payload = (await response.json()) as { participant: { id: string; title: string } };
  return {
    headers: cookieHeaderFrom(response),
    id: payload.participant.id,
    title: payload.participant.title,
    nickname,
    pin,
    clusterCode,
  };
}

async function signInSuperadmin(app: Hono<AppBindings>): Promise<ActorSession> {
  const response = await app.request(
    '/api/auth/superadmins/signin',
    jsonRequest({ username: 'superadmin', passcode: SUPERADMIN_PASSCODE }),
  );
  if (response.status !== 200) throw new Error(`superadmin signin failed: ${await response.text()}`);
  const payload = (await response.json()) as { superadmin: { id: string } };
  return { headers: cookieHeaderFrom(response), id: payload.superadmin.id, username: 'superadmin' };
}

let facilitatorCounter = 0;

async function createFacilitator(
  context: TestContext,
  username?: string,
): Promise<ActorSession> {
  facilitatorCounter += 1;
  const superadmin = await context.signInSuperadmin();
  const name = username ?? `psdadmin${facilitatorCounter}${context.runId.slice(0, 2)}`;
  const created = await context.app.request(
    '/api/admin/facilitators',
    jsonRequest(
      { username: name, passcode: '1111', defaultStationType: 'none' },
      superadmin.headers,
    ),
  );
  if (created.status !== 201) throw new Error(`facilitator create failed: ${await created.text()}`);
  const signIn = await context.app.request(
    '/api/auth/facilitators/signin',
    jsonRequest({ username: name, passcode: '1111' }),
  );
  const payload = (await signIn.json()) as { facilitator: { id: string } };
  return { headers: cookieHeaderFrom(signIn), id: payload.facilitator.id, username: name };
}

/**
 * Fixture builder: a superadmin, a facilitator and two teams with their captains, so a test
 * states only its point. ADR-270 — the old tournament's point config and court are gone; the
 * rebuilt tournament's own fixtures build on this one.
 */
export interface TeamsFixture {
  superadmin: ActorSession;
  facilitator: ActorSession;
  teamAId: string;
  teamBId: string;
  captainA: ParticipantSession;
  captainB: ParticipantSession;
}

export async function seedTeamsReady(context: TestContext): Promise<TeamsFixture> {
  const superadmin = await context.signInSuperadmin();
  const facilitator = await context.createFacilitator();
  const captainA = await context.signUpParticipant();
  const captainB = await context.signUpParticipant();
  const teamA = await createTeam(context, captainA, teamNameFor(context.runId));
  const teamB = await createTeam(context, captainB, teamNameFor(context.runId));
  return { superadmin, facilitator, teamAId: teamA, teamBId: teamB, captainA, captainB };
}

export async function createTeam(
  context: TestContext,
  captain: ActorSession,
  teamName: string,
): Promise<string> {
  const response = await context.app.request(
    '/api/teams',
    jsonRequest({ teamName }, captain.headers),
  );
  if (response.status !== 201) throw new Error(`team create failed: ${await response.text()}`);
  const payload = (await response.json()) as { team: { id: string } };
  return payload.team.id;
}

export interface FringeFixture {
  superadmin: ActorSession;
  facilitator: ActorSession;
  activityId: string;
  roundId: string;
  pointValue: number;
  tierLabel: string;
}

/** Fixture builder: an active activity with an open round, ready to scan into. */
export async function seedFringeReady(context: TestContext): Promise<FringeFixture> {
  const superadmin = await context.signInSuperadmin();
  const pointValue = 15;
  const tierLabel = 'Award';
  const activityResponse = await context.app.request(
    '/api/admin/activities',
    jsonRequest(
      { activityName: activityNameFor(context.runId), awardTiers: [{ label: tierLabel, points: pointValue }] },
      superadmin.headers,
    ),
  );
  const activity = (await activityResponse.json()) as { activity: { id: string } };
  const facilitator = await context.createFacilitator();
  const roundResponse = await context.app.request(
    `/api/fringe/activities/${activity.activity.id}/rounds`,
    jsonRequest({}, facilitator.headers),
  );
  const round = (await roundResponse.json()) as { round: { id: string } };
  return {
    superadmin,
    facilitator,
    activityId: activity.activity.id,
    roundId: round.round.id,
    pointValue,
    tierLabel,
  };
}
