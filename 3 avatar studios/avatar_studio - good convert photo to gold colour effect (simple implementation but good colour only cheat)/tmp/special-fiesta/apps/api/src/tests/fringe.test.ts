import { PARTICIPATION_LABEL, messages } from '@psd/contracts';
import type { ActivityView, RoundView, ScanView } from '@psd/contracts';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activityNameFor } from './fixtures/names.js';
import {
  createTestContext,
  jsonRequest,
  seedFringeReady,
  withMethod,
  type TestContext,
} from './harness.js';

interface ErrorBody {
  error: { message: string; field?: string };
}

describe('F26–F31 — fringe rounds and scanning', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  function scanBody(input: {
    nickname: string;
    roundId: string;
    tierLabel?: string | null;
    clientScanUuid?: string;
  }) {
    return {
      nickname: input.nickname,
      roundId: input.roundId,
      tierLabel: input.tierLabel === undefined ? 'Award' : input.tierLabel,
      clientScanUuid: input.clientScanUuid ?? crypto.randomUUID(),
      clientTimestamp: new Date().toISOString(),
    };
  }

  it('F27: a scan snapshots activity name, round number, points and facilitator', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({ nickname: participant.nickname, roundId: fixture.roundId }),
        fixture.facilitator.headers,
      ),
    );
    expect(response.status).toBe(201);
    const body = await ctx.json<{ scan: ScanView; duplicate: boolean }>(response);
    expect(body.duplicate).toBe(false);
    expect(body.scan.pointsAwardedSnapshot).toBe(fixture.pointValue);
    expect(body.scan.tierLabelSnapshot).toBe(fixture.tierLabel);
    expect(body.scan.roundNumberSnapshot).toBe(1);
    expect(body.scan.facilitatorUsernameSnapshot).toBe(fixture.facilitator.username);
    expect(body.scan.activityNameSnapshot).not.toHaveLength(0);
  });

  it('§4.2.11 ADR-009: replaying the same clientScanUuid is idempotent', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const clientScanUuid = uuidv7();
    const payload = scanBody({
      nickname: participant.nickname,
      roundId: fixture.roundId,
      clientScanUuid,
    });
    const first = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(payload, fixture.facilitator.headers),
    );
    const second = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(payload, fixture.facilitator.headers),
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const firstBody = await ctx.json<{ scan: ScanView }>(first);
    const secondBody = await ctx.json<{ scan: ScanView; duplicate: boolean }>(second);
    expect(secondBody.duplicate).toBe(true);
    expect(secondBody.scan.id).toBe(firstBody.scan.id);

    const log = await ctx.app.request(`/api/fringe/rounds/${fixture.roundId}/scans`, {
      headers: fixture.facilitator.headers,
    });
    const logBody = await ctx.json<{ items: ScanView[] }>(log);
    expect(logBody.items.filter((item) => item.participantId === participant.id)).toHaveLength(1);
  });

  it('ADR-009: replaying the same client_scan_uuid stays idempotent', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const body = scanBody({ nickname: participant.nickname, roundId: fixture.roundId });
    const first = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(body, fixture.facilitator.headers),
    );
    const replay = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(body, fixture.facilitator.headers),
    );
    expect(replay.status).toBe(200);
    const firstBody = await ctx.json<{ scan: ScanView }>(first);
    const replayBody = await ctx.json<{ scan: ScanView; duplicate: boolean }>(replay);
    expect(replayBody.duplicate).toBe(true);
    expect(replayBody.scan.id).toBe(firstBody.scan.id);
  });

  /**
   * ADR-116 — this used to answer 200 and throw the second award away. Scanning someone for
   * turning up and then trying to award them first place lost the placing silently, which is
   * the exact sequence a participation floor invites.
   */
  it('ADR-116: a different award for a held slot is refused, not silently discarded', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({ nickname: participant.nickname, roundId: fixture.roundId, tierLabel: null }),
        fixture.facilitator.headers,
      ),
    );
    const second = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({ nickname: participant.nickname, roundId: fixture.roundId }),
        fixture.facilitator.headers,
      ),
    );
    expect(second.status).toBe(409);
    const body = await ctx.json<{ error: { message: string } }>(second);
    expect(body.error.message).toBe(messages.scanSlotHeld);
  });

  it('ADR-116: replaceExisting overwrites the held award and voids the old one', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const first = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({ nickname: participant.nickname, roundId: fixture.roundId, tierLabel: null }),
        fixture.facilitator.headers,
      ),
    );
    const firstBody = await ctx.json<{ scan: ScanView }>(first);
    const replaced = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        {
          ...scanBody({ nickname: participant.nickname, roundId: fixture.roundId }),
          replaceExisting: true,
        },
        fixture.facilitator.headers,
      ),
    );
    expect(replaced.status).toBe(201);
    const replacedBody = await ctx.json<{ scan: ScanView }>(replaced);
    expect(replacedBody.scan.id).not.toBe(firstBody.scan.id);
    expect(replacedBody.scan.pointsAwardedSnapshot).toBe(15);

    // The old award survives as a voided row: a correction, not a deletion. The round log
    // shows one live award, and the leaderboard counts one.
    const log = await ctx.app.request(`/api/fringe/rounds/${fixture.roundId}/scans`, {
      headers: fixture.facilitator.headers,
    });
    const logBody = await ctx.json<{ items: ScanView[] }>(log);
    const mine = logBody.items.filter((item) => item.participantId === participant.id);
    expect(mine.filter((item) => !item.isVoided)).toHaveLength(1);
    expect(mine.filter((item) => item.isVoided)).toHaveLength(1);
  });

  /**
   * ADR-116 — the gap this whole change exists for: a station configured with placings only
   * could not record anybody who merely took part. The floor is the day's, not the station's.
   */
  it('ADR-116: a null tier is priced from the day participation floor', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({ nickname: participant.nickname, roundId: fixture.roundId, tierLabel: null }),
        fixture.facilitator.headers,
      ),
    );
    expect(response.status).toBe(201);
    const body = await ctx.json<{ scan: ScanView }>(response);
    expect(body.scan.tierLabelSnapshot).toBe(PARTICIPATION_LABEL);
    expect(body.scan.pointsAwardedSnapshot).toBeGreaterThanOrEqual(1);
  });

  /**
   * ADR-116 — the reason `ux_fringe_scan_live_slot` is partial. Before it, voiding was a
   * one-way subtraction: the slot stayed occupied by the dead row, so a participant whose
   * award was voided could never be re-scanned in that round at all.
   */
  it('ADR-116: voiding an award frees the round slot for a re-scan', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const first = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({ nickname: participant.nickname, roundId: fixture.roundId }),
        fixture.facilitator.headers,
      ),
    );
    const firstBody = await ctx.json<{ scan: ScanView }>(first);

    // Blocked while the award is live.
    const blocked = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({ nickname: participant.nickname, roundId: fixture.roundId }),
        fixture.facilitator.headers,
      ),
    );
    expect(blocked.status).toBe(409);

    const voided = await ctx.app.request(
      `/api/admin/scans/${firstBody.scan.id}/void`,
      jsonRequest({ reason: 'Scanned the wrong person at the sandcastle.' }, fixture.superadmin.headers),
    );
    expect(voided.status).toBe(200);

    const rescan = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({ nickname: participant.nickname, roundId: fixture.roundId }),
        fixture.facilitator.headers,
      ),
    );
    expect(rescan.status).toBe(201);
    const rescanBody = await ctx.json<{ scan: ScanView }>(rescan);
    expect(rescanBody.scan.id).not.toBe(firstBody.scan.id);
  });

  it('ADR-116: the station is told the participation floor', async () => {
    const fixture = await seedFringeReady(ctx);
    const response = await ctx.app.request(`/api/fringe/activities/${fixture.activityId}`, {
      headers: fixture.facilitator.headers,
    });
    const body = await ctx.json<{ participationPoints: number }>(response);
    expect(body.participationPoints).toBeGreaterThanOrEqual(1);
  });

  it('rejects an unknown nickname with the spec message', async () => {
    const fixture = await seedFringeReady(ctx);
    const response = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({ nickname: 'Nobody_Here', roundId: fixture.roundId }),
        fixture.facilitator.headers,
      ),
    );
    expect(response.status).toBe(404);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.nicknameNotFound);
  });

  it('F28: advancing atomically closes round N and opens round N+1', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({ nickname: participant.nickname, roundId: fixture.roundId }),
        fixture.facilitator.headers,
      ),
    );
    const response = await ctx.app.request(
      `/api/fringe/rounds/${fixture.roundId}/advance`,
      jsonRequest({}, fixture.facilitator.headers),
    );
    expect(response.status).toBe(201);
    const body = await ctx.json<{ round: RoundView }>(response);
    expect(body.round.roundNumber).toBe(2);
    expect(body.round.status).toBe('open');
    expect(body.round.scanCount).toBe(0);

    // The same participant may score again in the new round.
    const rescan = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({ nickname: participant.nickname, roundId: body.round.id }),
        fixture.facilitator.headers,
      ),
    );
    expect(rescan.status).toBe(201);
  });

  it('F29/F30 (DC-003): ending for the day is reversible and keeps the round number', async () => {
    const fixture = await seedFringeReady(ctx);
    const ended = await ctx.app.request(
      `/api/fringe/rounds/${fixture.roundId}/end`,
      jsonRequest({}, fixture.facilitator.headers),
    );
    const endedBody = await ctx.json<{ round: RoundView }>(ended);
    expect(endedBody.round.status).toBe('ended');

    const reactivated = await ctx.app.request(
      `/api/fringe/rounds/${fixture.roundId}/reactivate`,
      jsonRequest({}, fixture.facilitator.headers),
    );
    const reactivatedBody = await ctx.json<{ round: RoundView }>(reactivated);
    expect(reactivatedBody.round.status).toBe('open');
    expect(reactivatedBody.round.roundNumber).toBe(endedBody.round.roundNumber);
  });

  it('§3.3: a second open round cannot exist while one is open', async () => {
    const fixture = await seedFringeReady(ctx);
    const response = await ctx.app.request(
      `/api/fringe/activities/${fixture.activityId}/rounds`,
      jsonRequest({}, fixture.facilitator.headers),
    );
    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.singleActiveRound);
  });

  it('§3.5: superadmin deactivation auto-closes the open round', async () => {
    const fixture = await seedFringeReady(ctx);
    await ctx.app.request(
      `/api/admin/activities/${fixture.activityId}/active`,
      withMethod('PATCH', { isEnabled: false }, fixture.superadmin.headers),
    );
    const response = await ctx.app.request(`/api/fringe/activities/${fixture.activityId}`, {
      headers: fixture.facilitator.headers,
    });
    const body = await ctx.json<{ activity: ActivityView }>(response);
    expect(body.activity.isActive).toBe(false);
    expect(body.activity.currentRound).toBeNull();
  });

  it('blocks opening a round on an inactive activity', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const facilitator = await ctx.createFacilitator();
    const created = await ctx.app.request(
      '/api/admin/activities',
      jsonRequest(
        { activityName: activityNameFor(ctx.runId), awardTiers: [{ label: 'Award', points: 5 }] },
        superadmin.headers,
      ),
    );
    const activity = await ctx.json<{ activity: ActivityView }>(created);
    await ctx.app.request(
      `/api/admin/activities/${activity.activity.id}/active`,
      withMethod('PATCH', { isEnabled: false }, superadmin.headers),
    );
    const response = await ctx.app.request(
      `/api/fringe/activities/${activity.activity.id}/rounds`,
      jsonRequest({}, facilitator.headers),
    );
    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.activityInactive);
  });

  it('§4.2.12: renaming an activity does not rewrite historical snapshots', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const scanned = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({ nickname: participant.nickname, roundId: fixture.roundId }),
        fixture.facilitator.headers,
      ),
    );
    const before = await ctx.json<{ scan: ScanView }>(scanned);
    const renamed = activityNameFor(ctx.runId);
    await ctx.app.request(
      `/api/admin/activities/${fixture.activityId}`,
      withMethod(
        'PUT',
        { activityName: renamed, awardTiers: [{ label: 'Award', points: 99 }], isActive: true },
        fixture.superadmin.headers,
      ),
    );
    const log = await ctx.app.request(`/api/fringe/rounds/${fixture.roundId}/scans`, {
      headers: fixture.facilitator.headers,
    });
    const body = await ctx.json<{ items: ScanView[] }>(log);
    const historical = body.items.find((item) => item.id === before.scan.id);
    expect(historical?.activityNameSnapshot).toBe(before.scan.activityNameSnapshot);
    expect(historical?.pointsAwardedSnapshot).toBe(fixture.pointValue);
  });

  it('ADR-092: the server prices a named tier and snapshots its label', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const facilitator = await ctx.createFacilitator();
    const created = await ctx.app.request(
      '/api/admin/activities',
      jsonRequest(
        {
          activityName: activityNameFor(ctx.runId),
          awardTiers: [
            { label: 'First place', points: 25 },
            { label: 'Second place', points: 10 },
          ],
        },
        superadmin.headers,
      ),
    );
    const activity = await ctx.json<{ activity: ActivityView }>(created);
    const opened = await ctx.app.request(
      `/api/fringe/activities/${activity.activity.id}/rounds`,
      jsonRequest({}, facilitator.headers),
    );
    const round = await ctx.json<{ round: { id: string } }>(opened);
    const participant = await ctx.signUpParticipant();
    const scanned = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({
          nickname: participant.nickname,
          roundId: round.round.id,
          tierLabel: 'Second place',
        }),
        facilitator.headers,
      ),
    );
    expect(scanned.status).toBe(201);
    const body = await ctx.json<{ scan: ScanView }>(scanned);
    expect(body.scan.pointsAwardedSnapshot).toBe(10);
    expect(body.scan.tierLabelSnapshot).toBe('Second place');
  });

  it('ADR-092: a tier the activity does not define is refused', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({
          nickname: participant.nickname,
          roundId: fixture.roundId,
          tierLabel: 'Imaginary',
        }),
        fixture.facilitator.headers,
      ),
    );
    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.tierNotFound);
  });

  it('F28–F30: a round refuses transitions it is not in the state for', async () => {
    const fixture = await seedFringeReady(ctx);
    const headers = fixture.facilitator.headers;
    const missingId = '01919000-0000-7000-8000-0000000000ff';

    const openReactivate = await ctx.app.request(
      `/api/fringe/rounds/${fixture.roundId}/reactivate`,
      jsonRequest({}, headers),
    );
    expect(openReactivate.status).toBe(400);
    expect((await ctx.json<ErrorBody>(openReactivate)).error.message).toBe(
      messages.invalidStatusTransition,
    );

    const ended = await ctx.app.request(
      `/api/fringe/rounds/${fixture.roundId}/end`,
      jsonRequest({}, headers),
    );
    expect(ended.status).toBe(200);

    const endedAgain = await ctx.app.request(
      `/api/fringe/rounds/${fixture.roundId}/end`,
      jsonRequest({}, headers),
    );
    expect(endedAgain.status).toBe(400);
    expect((await ctx.json<ErrorBody>(endedAgain)).error.message).toBe(
      messages.invalidStatusTransition,
    );

    const advanceEnded = await ctx.app.request(
      `/api/fringe/rounds/${fixture.roundId}/advance`,
      jsonRequest({}, headers),
    );
    expect(advanceEnded.status).toBe(400);
    expect((await ctx.json<ErrorBody>(advanceEnded)).error.message).toBe(
      messages.invalidStatusTransition,
    );

    const unknownLog = await ctx.app.request(`/api/fringe/rounds/${missingId}/scans`, { headers });
    expect(unknownLog.status).toBe(404);
    expect((await ctx.json<ErrorBody>(unknownLog)).error.message).toBe(messages.roundNotFound);
  });

  it('F27: a queued scan whose round id is unknown is refused, not silently dropped', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        scanBody({
          nickname: participant.nickname,
          roundId: '01919000-0000-7000-8000-0000000000ff',
        }),
        fixture.facilitator.headers,
      ),
    );
    expect(response.status).toBe(404);
    expect((await ctx.json<ErrorBody>(response)).error.message).toBe(messages.roundNotFound);
  });

  it('ADR-029: level on points, the cluster that got there first is ranked higher', async () => {
    // Its own event: every other test in this file has already put points on the board.
    const fresh = await createTestContext();
    const fixture = await seedFringeReady(fresh);
    // Two clusters, one scan each, same points — but one is scanned first.
    const early = await fresh.signUpParticipant({ clusterCode: 'BP' });
    const late = await fresh.signUpParticipant({ clusterCode: 'WD' });

    for (const participant of [early, late]) {
      const response = await fresh.app.request(
        '/api/fringe/scans',
        jsonRequest(
          scanBody({ nickname: participant.nickname, roundId: fixture.roundId }),
          fixture.facilitator.headers,
        ),
      );
      expect(response.status).toBe(201);
    }

    const board = await fresh.app.request('/api/leaderboard', { headers: early.headers });
    const body = await fresh.json<{
      clusters: { clusterCode: string; totalPoints: number; rank: number; reachedAt: string | null }[];
    }>(board);
    const scored = body.clusters.filter((row) => row.totalPoints > 0);

    expect(scored.map((row) => row.clusterCode)).toEqual(['BP', 'WD']);
    expect(scored[0]?.totalPoints).toBe(scored[1]?.totalPoints);
    expect(scored[0]?.rank).toBe(1);
    // And the board can say why: each row carries the moment it reached its total.
    expect(Date.parse(String(scored[0]?.reachedAt)))
      .toBeLessThanOrEqual(Date.parse(String(scored[1]?.reachedAt)));
    // A cluster that has not scored has no such moment.
    expect(body.clusters.find((row) => row.totalPoints === 0)?.reachedAt).toBeNull();
    await fresh.close();
  });
});
