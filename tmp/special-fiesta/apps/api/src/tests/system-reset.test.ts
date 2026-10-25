import { messages } from '@psd/contracts';
import type { SystemResetView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../db/ids.js';
import {
  chatMessages,
  facilitatorAccounts,
  fringeActivities,
  fringeRounds,
  fringeScans,
  galleryPhotos,
  participants,
  sessions,
  superadminAccounts,
  teams,
  tournamentEntrants,
  tournamentMatches,
  tournamentStages,
  tournaments,
} from '../db/schema/index.js';
import {
  SUPERADMIN_PASSCODE,
  createTestContext,
  jsonRequest,
  seedFringeReady,
  seedTeamsReady,
  type ActorSession,
  type TestContext,
} from './harness.js';

/**
 * ADR-307 — the system reset.
 *
 * The two things these tests exist to swear to: the guard cannot be walked past
 * (two proofs, both the server's, spent by a single attempt), and the emptying
 * is the *practice* day only — setup survives, which is the entire reason the
 * surface exists.
 */

let ctx: TestContext;
let superadmin: ActorSession;

beforeAll(async () => {
  ctx = await createTestContext();
  superadmin = await ctx.signInSuperadmin();
});
afterAll(async () => ctx.close());

async function askChallenge(headers: Record<string, string>): Promise<Response> {
  return await ctx.app.request(
    '/api/admin/system/reset/challenge',
    jsonRequest({}, headers),
  );
}

async function askConfirmation(headers: Record<string, string>): Promise<string> {
  const response = await askChallenge(headers);
  expect(response.status).toBe(200);
  const body = await ctx.json<{ confirmation: string }>(response);
  expect(body.confirmation).toMatch(/^DELETE[A-Za-z0-9]{10}$/);
  return body.confirmation;
}

async function attemptReset(
  headers: Record<string, string>,
  body: { passcode: string; confirmation: string },
): Promise<Response> {
  return ctx.app.request('/api/admin/system/reset', jsonRequest(body, headers));
}

/** A confirmation that is well-formed, server-shaped, and definitely not the issued one. */
function wrongVersionOf(confirmation: string): string {
  const last = confirmation.at(-1);
  return confirmation.slice(0, -1) + (last === 'A' ? 'B' : 'A');
}

/** One practice day, written the way a rehearsal writes it: people, teams, scores, socials. */
async function seedPracticeDay() {
  const teamsFixture = await seedTeamsReady(ctx);
  const fringe = await seedFringeReady(ctx);
  const scan = await ctx.app.request(
    '/api/fringe/scans',
    jsonRequest(
      {
        nickname: teamsFixture.captainA.nickname,
        roundId: fringe.roundId,
        tierLabel: fringe.tierLabel,
        clientScanUuid: crypto.randomUUID(),
        clientTimestamp: new Date().toISOString(),
      },
      fringe.facilitator.headers,
    ),
  );
  expect(scan.status).toBe(201);

  const chat = await ctx.app.request(
    '/api/chat/messages',
    jsonRequest({ body: 'practice day chat' }, teamsFixture.captainA.headers),
  );
  expect(chat.status).toBe(201);
  const teamChat = await ctx.app.request(
    '/api/team-chat/messages',
    jsonRequest({ body: 'practice team chat' }, teamsFixture.captainA.headers),
  );
  expect(teamChat.status).toBe(201);
  const announcement = await ctx.app.request(
    '/api/admin/announcements',
    jsonRequest({ body: 'practice announcement' }, superadmin.headers),
  );
  expect(announcement.status).toBe(201);

  const db = ctx.handle.db;
  const photoId = newId();
  await db.insert(galleryPhotos).values({
    id: photoId,
    uploaderType: 'participant',
    participantId: teamsFixture.captainA.id,
    uploaderLabelSnapshot: teamsFixture.captainA.nickname ?? 'captain',
    caption: '',
    width: 10,
    height: 10,
    bytes: 4,
    originalFilename: 'practice.jpg',
    sha1Raw: (photoId.replaceAll('-', '') + 'aaaaaaaa').slice(0, 40),
    rawByteSize: 4,
  });

  const tournamentId = newId();
  const stageId = newId();
  const entrantId = newId();
  await db.insert(tournaments).values({
    id: tournamentId,
    name: 'Practice Cup',
    status: 'live',
    winPoints: 3,
    drawPoints: 1,
    lossPoints: 0,
    createdByKind: 'superadmin',
    createdById: superadmin.id,
    createdByLabel: 'superadmin',
  });
  await db.insert(tournamentStages).values({
    id: stageId,
    tournamentId,
    code: 'groups',
    ordinal: 1,
    label: 'Groups',
    kind: 'pool',
    allowsDraws: true,
    status: 'active',
  });
  await db.insert(tournamentEntrants).values({
    id: entrantId,
    tournamentId,
    teamId: teamsFixture.teamAId,
    nameSnapshot: 'Practice team',
    entryOrder: 1,
  });
  await db.insert(tournamentMatches).values({
    id: newId(),
    tournamentId,
    stageId,
    code: 'M1',
    round: 1,
    sequence: 1,
    origin: 'structure',
    status: 'scheduled',
    plannedMinutes: 10,
  });
  return { teamsFixture, fringe };
}

describe('ADR-307 — the reset guard', () => {
  it('refuses everybody who is not a superadmin', async () => {
    const fixture = await seedTeamsReady(ctx);
    expect((await askChallenge(fixture.facilitator.headers)).status).toBe(403);
    expect((await askChallenge(fixture.captainA.headers)).status).toBe(403);
    const refused = await attemptReset(fixture.facilitator.headers, {
      passcode: SUPERADMIN_PASSCODE,
      confirmation: 'DELETEAAAAAAAAAA',
    });
    expect(refused.status).toBe(403);
  });

  it('refuses when no challenge was ever issued, and says a new one is needed', async () => {
    const response = await attemptReset(superadmin.headers, {
      passcode: SUPERADMIN_PASSCODE,
      confirmation: 'DELETEAAAAAAAAAA',
    });
    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.resetChallengeExpired);
  });

  it('refuses a mistyped confirmation, and the spent challenge cannot be retried', async () => {
    const participant = await ctx.signUpParticipant();
    const confirmation = await askConfirmation(superadmin.headers);

    const refused = await attemptReset(superadmin.headers, {
      passcode: SUPERADMIN_PASSCODE,
      confirmation: wrongVersionOf(confirmation),
    });
    expect(refused.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(refused);
    expect(body.error.message).toBe(messages.resetConfirmationMismatch);

    // The attempt spent the challenge: even the correct text is now refused,
    // so the endpoint cannot be used to guess at either proof by repetition.
    const retry = await attemptReset(superadmin.headers, {
      passcode: SUPERADMIN_PASSCODE,
      confirmation,
    });
    expect(retry.status).toBe(400);
    expect((await ctx.json<{ error: { message: string } }>(retry)).error.message).toBe(
      messages.resetChallengeExpired,
    );

    // And the refusal deleted nothing.
    const me = await ctx.app.request('/api/auth/session', { headers: participant.headers });
    expect(me.status).toBe(200);
  });

  it("refuses another superadmin's passcode — the proof is the caller's own", async () => {
    const participant = await ctx.signUpParticipant();
    const confirmation = await askConfirmation(superadmin.headers);
    const refused = await attemptReset(superadmin.headers, {
      passcode: '9999',
      confirmation,
    });
    expect(refused.status).toBe(403);
    expect((await ctx.json<{ error: { message: string } }>(refused)).error.message).toBe(
      messages.resetPasscodeRejected,
    );
    const me = await ctx.app.request('/api/auth/session', { headers: participant.headers });
    expect(me.status).toBe(200);
  });

  it('refuses a lowercase delete outright', async () => {
    const confirmation = await askConfirmation(superadmin.headers);
    const response = await attemptReset(superadmin.headers, {
      passcode: SUPERADMIN_PASSCODE,
      confirmation: confirmation.replace('DELETE', 'delete'),
    });
    expect(response.status).toBe(400);
  });
});

describe('ADR-307 — the reset itself', () => {
  it('empties the practice day and keeps the setup', async () => {
    const { teamsFixture, fringe } = await seedPracticeDay();
    const db = ctx.handle.db;
    expect(await db.$count(participants)).toBeGreaterThan(0);
    expect(await db.$count(tournaments)).toBeGreaterThan(0);

    const confirmation = await askConfirmation(superadmin.headers);
    const response = await attemptReset(superadmin.headers, {
      passcode: SUPERADMIN_PASSCODE,
      confirmation,
    });
    expect(response.status).toBe(200);
    const { reset } = await ctx.json<{ reset: SystemResetView }>(response);
    expect(reset.participants).toBeGreaterThan(0);
    expect(reset.teams).toBeGreaterThanOrEqual(2);
    expect(reset.tournaments).toBeGreaterThanOrEqual(1);
    expect(reset.matches).toBeGreaterThanOrEqual(1);
    expect(reset.chatMessages).toBeGreaterThanOrEqual(1);
    expect(reset.photos).toBeGreaterThanOrEqual(1);
    expect(reset.fringeRounds).toBeGreaterThanOrEqual(1);
    expect(reset.sessionsEnded).toBeGreaterThan(0);

    // Gone: everybody and everything they did.
    expect(await db.$count(participants)).toBe(0);
    expect(await db.$count(teams)).toBe(0);
    expect(await db.$count(tournaments)).toBe(0);
    expect(await db.$count(tournamentMatches)).toBe(0);
    expect(await db.$count(fringeRounds)).toBe(0);
    expect(await db.$count(fringeScans)).toBe(0);
    expect(await db.$count(chatMessages)).toBe(0);
    expect(await db.$count(galleryPhotos)).toBe(0);

    // Only the acting superadmin's session survived; everybody else is signed out.
    expect(await db.$count(sessions)).toBe(1);
    const staleParticipant = await ctx.app.request('/api/auth/session', {
      headers: teamsFixture.captainA.headers,
    });
    expect(staleParticipant.status).toBe(401);

    // Kept: the setup the next event runs on.
    expect(await db.$count(superadminAccounts)).toBeGreaterThan(0);
    expect(await db.$count(facilitatorAccounts)).toBeGreaterThan(0);
    const activities = await db
      .select({ id: fringeActivities.id })
      .from(fringeActivities)
      .limit(100);
    expect(activities.some((row) => row.id === fringe.activityId)).toBe(true);

    // The console that pressed it is still signed in and reporting.
    const state = await ctx.app.request('/api/admin/service-state', {
      headers: superadmin.headers,
    });
    expect(state.status).toBe(200);

    // And the readied system takes the real event's first signup.
    const first = await ctx.signUpParticipant();
    expect(first.id).toBeTruthy();
  });
});
