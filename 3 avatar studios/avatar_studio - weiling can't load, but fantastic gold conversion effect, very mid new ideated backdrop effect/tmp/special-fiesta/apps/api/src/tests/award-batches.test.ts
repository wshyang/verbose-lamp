import { messages } from '@psd/contracts';
import type {
  AwardBatchDetailView,
  AwardBatchView,
  FinalStandingsView,
  ParticipantDetailView,
  VoidAuditEntryView,
} from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTeam,
  createTestContext,
  jsonRequest,
  seedFringeReady,
  seedTeamsReady,
  type ActorSession,
  type TestContext,
} from './harness.js';
import { teamNameFor } from './fixtures/names.js';

/**
 * ADR-248 — the reversible award batch.
 *
 * What a batch has to prove is not that two inserts happened. It is that a decision made once moves the
 * board once, that taking it back moves the board back, and that neither of those two acts removes a row
 * from the record of what was decided. So every test here reads a total, a register, or both — never the
 * tables directly, because the tables agreeing with themselves is the easy half.
 */

interface BatchResponse {
  batch: AwardBatchDetailView;
  replayed: boolean;
}
interface ErrorBody {
  error: { message: string; field?: string };
}
interface LedgerResponse {
  teamId: string;
  liveTotal: number;
  rows: { points: number; batchLabel: string; batchReversed: boolean; participantIds: string[] }[];
}

describe('ADR-248 — posting a batch, and taking it back', () => {
  let ctx: TestContext;
  let superadmin: ActorSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    superadmin = await ctx.signInSuperadmin();
  });
  afterAll(async () => {
    await ctx.close();
  });

  async function post(body: Record<string, unknown>): Promise<Response> {
    return ctx.app.request('/api/admin/award-batches', jsonRequest(body, superadmin.headers));
  }

  async function awardTeam(teamId: string, points: number): Promise<BatchResponse> {
    const response = await post({
      clientBatchUuid: crypto.randomUUID(),
      label: 'Rain award',
      reason: 'The rain cost us an hour of play.',
      teams: [{ teamId, points }],
    });
    expect(response.status).toBe(201);
    return ctx.json<BatchResponse>(response);
  }

  async function reversal(batchId: string, path: string, reason = 'Wrong hour, wrong team.'): Promise<Response> {
    return ctx.app.request(
      `/api/admin/award-batches/${batchId}/${path}`,
      jsonRequest({ reason }, superadmin.headers),
    );
  }

  async function totalsOf(participantId: string): Promise<number> {
    const response = await ctx.app.request(`/api/admin/participants/${participantId}`, {
      headers: superadmin.headers,
    });
    return (await ctx.json<ParticipantDetailView>(response)).totals.totalPoints;
  }

  /**
   * A team of one, so the roster the batch froze is exactly the person whose total is being read.
   * `teamNameFor` advances a per-run cursor, which is what keeps eight tests in one context from colliding
   * on a name — a collision here would look like an award bug and be nothing.
   */
  async function oneTeam(): Promise<{ teamId: string; participantId: string }> {
    const captain = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, teamNameFor(ctx.runId));
    return { teamId, participantId: captain.id };
  }

  it('pays people only, which is the other half of what a batch is for', async () => {
    // No team anywhere in it: the owner's "the ones the rain cost us" case, where the award is to
    // individuals and the team ledger has nothing to say. A batch that required a team row would have made
    // the operator invent one.
    const fixture = await seedFringeReady(ctx);
    const first = await ctx.signUpParticipant();
    const second = await ctx.signUpParticipant();
    const beforeFirst = await totalsOf(first.id);
    const beforeSecond = await totalsOf(second.id);

    const response = await post({
      clientBatchUuid: crypto.randomUUID(),
      label: 'Kept the station open',
      reason: 'Nobody was scored in the hour we lost.',
      participants: [
        { participantId: first.id, activityId: fixture.activityId, points: 6 },
        { participantId: second.id, activityId: fixture.activityId, points: 6 },
      ],
    });
    expect(response.status).toBe(201);
    const { batch } = await ctx.json<BatchResponse>(response);
    expect(batch.teamCount).toBe(0);
    expect(batch.participantCount).toBe(2);
    expect(batch.participantTotal).toBe(12);
    expect(await totalsOf(first.id)).toBe(beforeFirst + 6);

    await reversal(batch.id, 'reverse');
    expect(await totalsOf(first.id)).toBe(beforeFirst);
    expect(await totalsOf(second.id)).toBe(beforeSecond);
  });

  it('pays a team through the board, and takes it back through the same door', async () => {
    const { teamId, participantId } = await oneTeam();
    const before = await totalsOf(participantId);

    const posted = await awardTeam(teamId, 20);
    expect(posted.batch.teamTotal).toBe(20);
    expect(posted.batch.teams[0]?.participantIds).toEqual([participantId]);
    expect(await totalsOf(participantId)).toBe(before + 20);

    const reversed = await reversal(posted.batch.id, 'reverse');
    expect(reversed.status).toBe(200);
    expect((await ctx.json<BatchResponse>(reversed)).batch.isReversed).toBe(true);
    expect(await totalsOf(participantId)).toBe(before);

    const back = await reversal(posted.batch.id, 'reinstate', 'The award stood after all.');
    expect((await ctx.json<BatchResponse>(back)).batch.isReversed).toBe(false);
    expect(await totalsOf(participantId)).toBe(before + 20);
  });

  it('leaves a reversal visible in the register, marked', async () => {
    const { teamId } = await oneTeam();
    const posted = await awardTeam(teamId, 15);
    await reversal(posted.batch.id, 'reverse');

    const list = await ctx.app.request('/api/admin/award-batches', { headers: superadmin.headers });
    const { items } = await ctx.json<{ items: AwardBatchView[] }>(list);
    const row = items.find((item) => item.id === posted.batch.id);
    expect(row?.isReversed).toBe(true);
    expect(row?.reversedReason).toBe('Wrong hour, wrong team.');
    expect(row?.reversedByUsername).toBeTruthy();
    // The rows it paid are counted, not zeroed: a reversed batch is a decision, and the register lists
    // decisions. Only what the board PRICES treats it as nothing.
    expect(row?.teamCount).toBe(1);
    expect(row?.teamTotal).toBe(15);
  });

  it('pays both ledgers from one batch, and one reversal takes both back', async () => {
    // A real station, because a participant row has to name one: the ledger attributes every award to the
    // activity it belongs to, which is what makes its name snapshot a snapshot of something.
    const fixture = await seedFringeReady(ctx);
    const fringe = await ctx.signUpParticipant();
    const { teamId, participantId } = await oneTeam();
    const before = { team: await totalsOf(participantId), fringe: await totalsOf(fringe.id) };

    const response = await post({
      clientBatchUuid: crypto.randomUUID(),
      label: 'Winners, and the ones the rain cost us',
      reason: 'Consolation awards after the weather.',
      teams: [{ teamId, points: 30 }],
      participants: [{ participantId: fringe.id, activityId: fixture.activityId, points: -5 }],
    });
    expect(response.status).toBe(201);
    const { batch } = await ctx.json<BatchResponse>(response);
    expect(batch.teamTotal).toBe(30);
    expect(batch.participantTotal).toBe(-5);
    expect(await totalsOf(participantId)).toBe(before.team + 30);
    expect(await totalsOf(fringe.id)).toBe(before.fringe - 5);

    await reversal(batch.id, 'reverse');
    expect(await totalsOf(participantId)).toBe(before.team);
    expect(await totalsOf(fringe.id)).toBe(before.fringe);

    // The participant's own ledger still lists the row the batch posted, and says the batch was taken back.
    const detail = await ctx.json<ParticipantDetailView>(
      await ctx.app.request(`/api/admin/participants/${fringe.id}`, { headers: superadmin.headers }),
    );
    expect(detail.adjustments).toHaveLength(1);
    expect(detail.adjustments[0]?.batchLabel).toBe(batch.label);
    expect(detail.adjustments[0]?.batchReversed).toBe(true);
  });

  it('moves the day’s export with the board, because it reads the same one', async () => {
    const { teamId, participantId } = await oneTeam();
    const exportRow = async (): Promise<number> => {
      const response = await ctx.app.request('/api/admin/standings/final', { headers: superadmin.headers });
      const { standings } = await ctx.json<{ standings: FinalStandingsView }>(response);
      return standings.individuals.find((row) => row.participantId === participantId)?.totalPoints ?? -1;
    };
    const before = await exportRow();

    const posted = await awardTeam(teamId, 25);
    expect(await exportRow()).toBe(before + 25);
    await reversal(posted.batch.id, 'reverse');
    expect(await exportRow()).toBe(before);
  });

  it('acknowledges a retry of the same key, and refuses a different payload under it', async () => {
    const { teamId, participantId } = await oneTeam();
    const clientBatchUuid = crypto.randomUUID();
    const body = {
      clientBatchUuid,
      label: 'Late award',
      reason: 'Posted after the buzzer.',
      teams: [{ teamId, points: 12 }],
    };
    const before = await totalsOf(participantId);
    expect((await ctx.json<BatchResponse>(await post(body))).batch.teamTotal).toBe(12);

    const retry = await post(body);
    expect(retry.status).toBe(200);
    expect((await ctx.json<BatchResponse>(retry)).replayed).toBe(true);
    expect(await totalsOf(participantId)).toBe(before + 12);

    // Same key, different decision: the second one is not an acknowledgement of the first.
    const clash = await post({ ...body, label: 'A different award' });
    expect(clash.status).toBe(409);
    expect((await ctx.json<ErrorBody>(clash)).error.message).toBe(messages.awardBatchReplayMismatch);
    // ...and it changed nothing, on either side of the argument.
    expect(await totalsOf(participantId)).toBe(before + 12);
  });

  it('names which id it could not find, before it writes anything', async () => {
    const gone = '00000000-0000-7000-8000-00000000000e';
    const cases: [string, Record<string, unknown>][] = [
      [messages.teamNotFound, { teams: [{ teamId: gone, points: 5 }] }],
      [messages.participantNotFound, { participants: [{ participantId: gone, activityId: gone, points: 5 }] }],
      [messages.activityNotFound, { participants: [{ participantId: (await ctx.signUpParticipant()).id, activityId: gone, points: 5 }] }],
    ];
    for (const [message, over] of cases) {
      const response = await post({
        clientBatchUuid: crypto.randomUUID(),
        label: 'Missing',
        reason: 'An id from a stale tab.',
        ...over,
      });
      expect(response.status, message).toBe(404);
      expect((await ctx.json<ErrorBody>(response)).error.message).toBe(message);
    }
  });

  it('refuses the batch that pays nobody, and the shape that cannot be posted', async () => {
    const { teamId } = await oneTeam();
    const refusals: [string, Record<string, unknown>][] = [
      [messages.awardBatchEmpty, { teams: [], participants: [] }],
      [messages.awardBatchLabelInvalid, { label: '' }],
      [messages.awardBatchLabelInvalid, { label: 'x'.repeat(41) }],
      [messages.voidReasonRequired, { reason: '' }],
      [messages.adjustmentPointsInvalid, { teams: [{ teamId, points: 0 }] }],
      [messages.adjustmentPointsInvalid, { teams: [{ teamId, points: 101 }] }],
      [
        messages.awardBatchTooLarge,
        { teams: Array.from({ length: 65 }, () => ({ teamId, points: 1 })) },
      ],
    ];
    for (const [message, over] of refusals) {
      const response = await post({
        clientBatchUuid: crypto.randomUUID(),
        label: 'Bounds',
        reason: 'Every bound on this request is a decision.',
        ...over,
      });
      expect(response.status, message).toBe(400);
      expect((await ctx.json<ErrorBody>(response)).error.message).toBe(message);
    }
  });

  it('answers an unknown batch with 404 and a repeated reversal with 409', async () => {
    const missing = await ctx.app.request(
      '/api/admin/award-batches/00000000-0000-7000-8000-00000000000a',
      { headers: superadmin.headers },
    );
    expect(missing.status).toBe(404);
    expect((await ctx.json<ErrorBody>(missing)).error.message).toBe(messages.awardBatchNotFound);

    const { teamId } = await oneTeam();
    const posted = await awardTeam(teamId, 8);
    expect((await reversal(posted.batch.id, 'reverse')).status).toBe(200);
    const twice = await reversal(posted.batch.id, 'reverse');
    expect(twice.status).toBe(409);
    expect((await ctx.json<ErrorBody>(twice)).error.message).toBe(messages.awardBatchAlreadyReversed);
    const notYet = await reversal(posted.batch.id, 'reinstate', 'Already live.');
    expect(notYet.status).toBe(200);
    const liveAgain = await reversal(posted.batch.id, 'reinstate');
    expect(liveAgain.status).toBe(409);
    expect((await ctx.json<ErrorBody>(liveAgain)).error.message).toBe(messages.awardBatchNotReversed);

    const noReason = await reversal(posted.batch.id, 'reverse', '');
    expect(noReason.status).toBe(400);
  });

  it('writes a void and an unvoid row, and the audit filter can ask for them', async () => {
    const nowhere = await reversal('00000000-0000-7000-8000-00000000000d', 'reverse');
    expect(nowhere.status).toBe(404);
    expect((await ctx.json<ErrorBody>(nowhere)).error.message).toBe(messages.awardBatchNotFound);

    const { teamId } = await oneTeam();
    const posted = await awardTeam(teamId, 9);
    await reversal(posted.batch.id, 'reverse', 'Paid the wrong team.');
    await reversal(posted.batch.id, 'reinstate', 'The first word was right.');

    const response = await ctx.app.request(
      `/api/admin/void-audit?targetType=awardbatch&targetId=${posted.batch.id}`,
      { headers: superadmin.headers },
    );
    const { items } = await ctx.json<{ items: VoidAuditEntryView[] }>(response);
    expect(items.map((entry) => entry.action)).toEqual(['unvoid', 'void']);
    expect(items.map((entry) => entry.reason)).toEqual([
      'The first word was right.',
      'Paid the wrong team.',
    ]);
  });

  it('shows a team its own ledger, and only counts what is live', async () => {
    const { teamId } = await oneTeam();
    const first = await awardTeam(teamId, 12);
    const second = await awardTeam(teamId, 7);
    await reversal(second.batch.id, 'reverse');

    const response = await ctx.app.request(`/api/admin/teams/${teamId}/awards`, {
      headers: superadmin.headers,
    });
    const ledger = await ctx.json<LedgerResponse>(response);
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.liveTotal).toBe(12);
    expect(ledger.rows[0]?.batchReversed).toBe(true);
    expect(ledger.rows[1]?.batchLabel).toBe('Rain award');

    const missing = await ctx.app.request('/api/admin/teams/00000000-0000-7000-8000-00000000000b/awards', {
      headers: superadmin.headers,
    });
    expect(missing.status).toBe(404);
    expect((await ctx.json<ErrorBody>(missing)).error.message).toBe(messages.teamNotFound);

    // An award to the same team twice is the owner's freedom (D7), and the ledger says so plainly.
    const again = await awardTeam(teamId, 12);
    expect(again.batch.id).not.toBe(first.batch.id);
    expect(again.batch.id).not.toBe(second.batch.id);
  });

  it('is a superadmin surface: a facilitator may not post or reverse one', async () => {
    const fixture = await seedTeamsReady(ctx);
    const body = {
      clientBatchUuid: crypto.randomUUID(),
      label: 'Not yours',
      reason: 'A facilitator trying anyway.',
      teams: [{ teamId: fixture.teamAId, points: 5 }],
    };
    const posted = await ctx.app.request('/api/admin/award-batches', jsonRequest(body, fixture.facilitator.headers));
    expect(posted.status).toBe(403);
    const reversed = await ctx.app.request(
      '/api/admin/award-batches/00000000-0000-7000-8000-00000000000c/reverse',
      jsonRequest({ reason: 'Not yours either.' }, fixture.facilitator.headers),
    );
    expect(reversed.status).toBe(403);
  });
});

