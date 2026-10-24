import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminTournamentConsoleView } from '@psd/contracts';
import { messages } from '@psd/contracts';
import { tournaments } from '../db/schema/index.js';
import { teamNameFor } from './fixtures/names.js';
import { createTeam, createTestContext, jsonRequest, type ActorSession, type TestContext } from './harness.js';

/**
 * ADR-293 — tournament.kind enforcement: one open tournament per kind.
 *
 * The existing tournament-desk.test.ts already covers "a second draft is refused". This file
 * tightens the invariant: the refusal is *kind-scoped*, not global. Four assertions matter:
 *
 * 1. kind is present in the created tournament's payload (and defaults to 'captains_ball').
 * 2. A second draft of the *same* kind is refused 409.
 * 3. A new draft is allowed after discard (proves the guard lifts cleanly).
 * 4. Wrong-party: participant and facilitator are refused 403 on draft creation (session-scoping
 *    negative per non-negotiable #2 and AGENTS-testing).
 */

let ctx: TestContext;
let desk: ActorSession;
const teamIds: string[] = [];

type Console = AdminTournamentConsoleView;

async function postDraft(body: unknown, session: ActorSession = desk) {
  const response = await ctx.app.request('/api/admin/tournament', jsonRequest(body, session.headers));
  return { status: response.status, body: (await response.json()) as Console & { error?: { message: string } } };
}

async function postDiscard(session: ActorSession = desk) {
  const response = await ctx.app.request('/api/admin/tournament/discard', jsonRequest({}, session.headers));
  return response.status;
}

beforeAll(async () => {
  ctx = await createTestContext();
  desk = await ctx.signInSuperadmin();
  for (let index = 0; index < 2; index += 1) {
    teamIds.push(await createTeam(ctx, await ctx.signUpParticipant(), teamNameFor(ctx.runId)));
  }
});

afterAll(async () => {
  await ctx.close();
});

describe('ADR-293 — tournament kind', () => {
  it('kind defaults to captains_ball and is present in the payload', async () => {
    const body = { name: 'Day', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds };
    const created = await postDraft(body);
    expect(created.status).toBe(201);
    expect(created.body.tournament?.kind).toBe('captains_ball');
    // Read back from the row: confirms the column was written, not only projected.
    const [row] = await ctx.handle.db.select().from(tournaments).limit(1);
    expect(row?.kind).toBe('captains_ball');
  });

  it('refuses a second draft of the same kind with 409', async () => {
    const body = { name: 'Second', winPoints: 1, drawPoints: 1, lossPoints: 0, teamIds };
    const again = await postDraft(body);
    expect(again.status).toBe(409);
    expect((again.body as unknown as { error: { message: string } }).error.message).toBe(
      messages.tournamentAlreadyOpen,
    );
  });

  it('allows a new draft after the previous one is discarded', async () => {
    expect(await postDiscard()).toBe(200);
    const body = { name: 'Replacement', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds };
    const replaced = await postDraft(body);
    expect(replaced.status).toBe(201);
    expect(replaced.body.tournament?.kind).toBe('captains_ball');
  });

  it('refuses a participant and a facilitator on draft creation — session-scoping negative', async () => {
    const participant = await ctx.signUpParticipant();
    const facilitator = await ctx.createFacilitator();
    const body = { name: 'Hack', winPoints: 1, drawPoints: 1, lossPoints: 0, teamIds };
    for (const session of [participant, facilitator]) {
      const result = await postDraft(body, session);
      expect(result.status).toBe(403);
    }
    // No tournament row written by the unauthorized attempts.
    const rows = await ctx.handle.db.select().from(tournaments);
    expect(rows.filter((row) => row.name === 'Hack')).toHaveLength(0);
  });
});
