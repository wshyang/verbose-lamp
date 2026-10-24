import { messages } from '@psd/contracts';
import type {
  BootstrapStatusView,
  LeaderboardView,
  ParticipantDetailView,
  ParticipantView,
  ScanView,
  TeamSummaryView,
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
  withMethod,
} from './harness.js';

/**
 * F42, F45, F47–F50 — the superadmin read surfaces (S35, S47, S50, S52–S55) and the filters
 * an operator actually uses when a participant walks up saying "my points are wrong".
 */

interface ErrorBody {
  error: { message: string; field?: string };
}

describe('F42, F45, F47–F50 — superadmin directories, filters and the audit log', () => {
  let ctx: TestContext;
  let superadmin: ActorSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    superadmin = await ctx.signInSuperadmin();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const asAdmin = () => ({ headers: superadmin.headers });

  it('S35 — the dashboard reports each bootstrap gate', async () => {
    const before = await ctx.app.request('/api/admin/dashboard', asAdmin());
    const initial = await ctx.json<{ status: BootstrapStatusView }>(before);
    expect(initial.status.isPointConfigSet).toBe(false);

    // Set fringe point config to satisfy isPointConfigSet, then seed participants + teams.
    await ctx.app.request(
      '/api/admin/point-config',
      withMethod(
        'PUT',
        { fringeParticipationPoints: 5, fringePassportBonusPoints: 0, fringePassportStations: 2 },
        superadmin.headers,
      ),
    );
    await seedTeamsReady(ctx);

    const after = await ctx.app.request('/api/admin/dashboard', asAdmin());
    const ready = await ctx.json<{ status: BootstrapStatusView }>(after);
    expect(ready.status.isPointConfigSet).toBe(true);
    expect(ready.status.facilitatorCount).toBeGreaterThan(0);
    expect(ready.status.participantCount).toBeGreaterThan(0);
    expect(ready.status.teamCount).toBeGreaterThan(0);
  });

  it('S52 — lists participants, and filters by nickname and by cluster', async () => {
    const participant = await ctx.signUpParticipant({ clusterCode: 'PSC Sect' });

    const all = await ctx.app.request('/api/admin/participants', asAdmin());
    const everyone = await ctx.json<{ items: { participant: ParticipantView }[] }>(all);
    expect(everyone.items.length).toBeGreaterThan(0);

    const searched = await ctx.app.request(
      `/api/admin/participants?search=${encodeURIComponent(participant.nickname.slice(0, 5))}`,
      asAdmin(),
    );
    const bySearch = await ctx.json<{ items: { participant: ParticipantView }[] }>(searched);
    expect(bySearch.items.some((item) => item.participant.id === participant.id)).toBe(true);

    const filtered = await ctx.app.request(
      '/api/admin/participants?clusterCode=PSC%20Sect',
      asAdmin(),
    );
    const byCluster = await ctx.json<{ items: { participant: ParticipantView }[] }>(filtered);
    expect(byCluster.items.length).toBeGreaterThan(0);
    expect(byCluster.items.every((item) => item.participant.clusterCode === 'PSC Sect')).toBe(true);
  });

  /**
   * ADR-148 — the identifier people say out loud.
   *
   * ADR-088 built the 4-digit number for exactly this moment: somebody is standing at the
   * desk reading it out because their phone is flat. Until this, the superadmin directory
   * could search everything about them except the thing they were saying.
   */
  it('F49 — finds a participant by the number they read out, whole or partial', async () => {
    const participant = await ctx.signUpParticipant();
    const list = await ctx.app.request('/api/admin/participants', asAdmin());
    const everyone = await ctx.json<{ items: { participant: ParticipantView }[] }>(list);
    const scanNumber = everyone.items.find((item) => item.participant.id === participant.id)
      ?.participant.scanNumber;
    expect(scanNumber).toMatch(/^[0-9]{4}$/);

    const exact = await ctx.app.request(
      `/api/admin/participants?search=${scanNumber ?? ''}`,
      asAdmin(),
    );
    const byNumber = await ctx.json<{ items: { participant: ParticipantView }[] }>(exact);
    expect(byNumber.items.some((item) => item.participant.id === participant.id)).toBe(true);

    // Half-heard across a marquee: a prefix must still narrow rather than find nothing.
    const partial = await ctx.app.request(
      `/api/admin/participants?search=${(scanNumber ?? '').slice(0, 2)}`,
      asAdmin(),
    );
    const byPrefix = await ctx.json<{ items: { participant: ParticipantView }[] }>(partial);
    expect(byPrefix.items.some((item) => item.participant.id === participant.id)).toBe(true);
  });

  /*
   * Nicknames may contain digits even though they may never be only digits (ADR-088), so the
   * nickname match has to survive the new branch rather than be replaced by it.
   */
  it('F49 — a digits query still finds a nickname that contains those digits', async () => {
    const digitsInName = await ctx.signUpParticipant({ nickname: `Zed7788${ctx.runId}`.slice(0, 20) });
    const list = await ctx.app.request('/api/admin/participants?search=Zed7788', asAdmin());
    const rows = await ctx.json<{ items: { participant: ParticipantView }[] }>(list);
    const scanNumber =
      rows.items.find((item) => item.participant.id === digitsInName.id)?.participant.scanNumber ??
      '';

    /*
     * The token is chosen AFTER the number is known, so the row can only be found by its
     * nickname. Picking one up front would leave a one-in-a-hundred run where the scan
     * number happens to start with it and the test passes for the wrong reason.
     */
    const token = scanNumber.startsWith('77') ? '88' : '77';
    const response = await ctx.app.request(`/api/admin/participants?search=${token}`, asAdmin());
    const found = await ctx.json<{ items: { participant: ParticipantView }[] }>(response);
    expect(found.items.some((item) => item.participant.id === digitsInName.id)).toBe(true);
  });

  it('F47 — participant detail carries totals, team and the scan list', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    await createTeam(ctx, participant, `Detail ${ctx.runId}`);
    await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        {
          nickname: participant.nickname,
          roundId: fixture.roundId,
          tierLabel: fixture.tierLabel,
          clientScanUuid: crypto.randomUUID(),
          clientTimestamp: new Date().toISOString(),
        },
        fixture.facilitator.headers,
      ),
    );

    const response = await ctx.app.request(`/api/admin/participants/${participant.id}`, asAdmin());
    const detail = await ctx.json<ParticipantDetailView>(response);
    expect(detail.participant.nickname).toBe(participant.nickname);
    expect(detail.team?.teamName).toBe(`Detail ${ctx.runId}`);
    expect(detail.scans).toHaveLength(1);
    expect(detail.totals.fringePoints).toBe(15);
  });

  it('F47 — a participant with no team and no scans still renders', async () => {
    const loner = await ctx.signUpParticipant();
    const response = await ctx.app.request(`/api/admin/participants/${loner.id}`, asAdmin());
    const detail = await ctx.json<ParticipantDetailView>(response);
    expect(detail.team).toBeNull();
    expect(detail.scans).toEqual([]);
    expect(detail.totals.totalPoints).toBe(0);
  });

  it('F47 — 404s on an unknown participant', async () => {
    const response = await ctx.app.request(
      '/api/admin/participants/00000000-0000-7000-8000-000000000004',
      asAdmin(),
    );
    expect(response.status).toBe(404);
    expect((await ctx.json<ErrorBody>(response)).error.message).toBe(messages.participantNotFound);
  });

  it('F48 — the team directory lists every team with its roster', async () => {
    const captain = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Directory ${ctx.runId}`);

    const response = await ctx.app.request('/api/admin/teams', asAdmin());
    const { items } = await ctx.json<{
      items: { team: TeamSummaryView; memberNicknames: string[] }[];
    }>(response);
    const mine = items.find((item) => item.team.id === teamId);
    expect(mine?.memberNicknames).toContain(captain.nickname);
    expect(mine?.team.captainNickname).toBe(captain.nickname);
  });

  /*
   * ADR-154 — a repair must name its target by id. Nicknames are not handles: two participants
   * may share one, and a console that posted a nickname would eventually repair the wrong person.
   * The nickname list stays for the human reading the row; `members` is what the buttons use.
   */
  it('ADR-154 — the team directory names each member by id as well as by nickname', async () => {
    const captain = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Handles ${ctx.runId}`);

    const response = await ctx.app.request('/api/admin/teams', asAdmin());
    const { items } = await ctx.json<{
      items: {
        team: TeamSummaryView;
        memberNicknames: string[];
        members: { participantId: string; nickname: string; isCaptain: boolean }[];
      }[];
    }>(response);
    const mine = items.find((item) => item.team.id === teamId);

    expect(mine?.members).toEqual([
      { participantId: captain.id, nickname: captain.nickname, isCaptain: true },
    ]);
  });

  it('F45 — scans filter by activity, participant and round', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        {
          nickname: participant.nickname,
          roundId: fixture.roundId,
          tierLabel: fixture.tierLabel,
          clientScanUuid: crypto.randomUUID(),
          clientTimestamp: new Date().toISOString(),
        },
        fixture.facilitator.headers,
      ),
    );

    const byActivity = await ctx.app.request(
      `/api/admin/scans?activityId=${fixture.activityId}`,
      asAdmin(),
    );
    const forActivity = await ctx.json<{ items: ScanView[] }>(byActivity);
    expect(forActivity.items.every((item) => item.activityId === fixture.activityId)).toBe(true);

    const byParticipant = await ctx.app.request(
      `/api/admin/scans?participantId=${participant.id}`,
      asAdmin(),
    );
    const forParticipant = await ctx.json<{ items: ScanView[] }>(byParticipant);
    expect(forParticipant.items).toHaveLength(1);
    expect(forParticipant.items[0]?.participantNickname).toBe(participant.nickname);

    const byRound = await ctx.app.request(`/api/admin/scans?roundId=${fixture.roundId}`, asAdmin());
    expect((await ctx.json<{ items: ScanView[] }>(byRound)).items.length).toBeGreaterThan(0);
  });

  it('F50 — the audit log filters by target type, target id and actor', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const scanned = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        {
          nickname: participant.nickname,
          roundId: fixture.roundId,
          tierLabel: fixture.tierLabel,
          clientScanUuid: crypto.randomUUID(),
          clientTimestamp: new Date().toISOString(),
        },
        fixture.facilitator.headers,
      ),
    );
    const { scan } = await ctx.json<{ scan: ScanView }>(scanned);

    await ctx.app.request(
      `/api/admin/scans/${scan.id}/void`,
      jsonRequest({ reason: 'Scanned the wrong participant' }, superadmin.headers),
    );

    const byType = await ctx.app.request('/api/admin/void-audit?targetType=fringescan', asAdmin());
    const scansOnly = await ctx.json<{ items: VoidAuditEntryView[] }>(byType);
    expect(scansOnly.items.every((item) => item.targetType === 'fringescan')).toBe(true);

    const byTarget = await ctx.app.request(`/api/admin/void-audit?targetId=${scan.id}`, asAdmin());
    const forScan = await ctx.json<{ items: VoidAuditEntryView[] }>(byTarget);
    expect(forScan.items).toHaveLength(1);
    expect(forScan.items[0]?.reason).toBe('Scanned the wrong participant');

    const byActor = await ctx.app.request(
      `/api/admin/void-audit?superadminId=${superadmin.id}`,
      asAdmin(),
    );
    expect((await ctx.json<{ items: VoidAuditEntryView[] }>(byActor)).items.length).toBeGreaterThan(0);
  });

  it('F49 — the admin leaderboard is the same view participants see', async () => {
    const response = await ctx.app.request('/api/leaderboard', asAdmin());
    const board = await ctx.json<LeaderboardView>(response);
    expect(board.clusters).toHaveLength(18);
    expect(new Date(board.generatedAt).toString()).not.toBe('Invalid Date');
  });

  it('F43 — an unknown match cannot have its winner edited', async () => {
    const response = await ctx.app.request(
      '/api/admin/matches/00000000-0000-7000-8000-000000000005/result',
      jsonRequest(
        {
          scoreA: 1,
          scoreB: 0,
          winnerTeamId: '00000000-0000-7000-8000-000000000006',
          editReason: 'Scorer misheard the result',
        },
        superadmin.headers,
      ),
    );
    expect(response.status).toBe(404);
  });

  it('F46 — an unknown scan cannot be voided', async () => {
    const response = await ctx.app.request(
      '/api/admin/scans/00000000-0000-7000-8000-000000000007/void',
      jsonRequest({ reason: 'Nothing to void here' }, superadmin.headers),
    );
    expect(response.status).toBe(404);
  });

  /**
   * ADR-117 — the operational escape hatch. These four tests describe the whole contract:
   * it moves the real total, it subtracts as well as adds, it refuses to be unexplained,
   * and it keeps the history rather than rewriting it.
   */
  describe('ADR-117 — manual score adjustments', () => {
    async function adjust(
      participantId: string,
      activityId: string,
      body: { points?: number; reason?: string; activityId?: string },
    ) {
      return ctx.app.request(
        `/api/admin/participants/${participantId}/adjustments`,
        jsonRequest(
          {
            activityId: body.activityId ?? activityId,
            points: body.points ?? 5,
            reason: body.reason ?? 'Scanner was down, awarded by hand.',
          },
          superadmin.headers,
        ),
      );
    }

    it('grants points that land on the real total', async () => {
      const fixture = await seedFringeReady(ctx);
      const participant = await ctx.signUpParticipant();
      const before = await ctx.app.request(`/api/admin/participants/${participant.id}`, {
        headers: superadmin.headers,
      });
      const beforeBody = await ctx.json<{ totals: { totalPoints: number } }>(before);

      const response = await adjust(participant.id, fixture.activityId, { points: 12 });
      expect(response.status).toBe(201);

      const after = await ctx.app.request(`/api/admin/participants/${participant.id}`, {
        headers: superadmin.headers,
      });
      const afterBody = await ctx.json<{
        totals: { totalPoints: number; fringePoints: number };
        adjustments: { points: number; reason: string; activityName: string }[];
      }>(after);
      expect(afterBody.totals.totalPoints).toBe(beforeBody.totals.totalPoints + 12);
      expect(afterBody.adjustments).toHaveLength(1);
      expect(afterBody.adjustments[0]?.reason).toBe('Scanner was down, awarded by hand.');
    });

    it('takes points away when the correction is negative', async () => {
      const fixture = await seedFringeReady(ctx);
      const participant = await ctx.signUpParticipant();
      await adjust(participant.id, fixture.activityId, { points: 20 });
      await adjust(participant.id, fixture.activityId, {
        points: -8,
        reason: 'Double-counted at the tug of war.',
      });

      const after = await ctx.app.request(`/api/admin/participants/${participant.id}`, {
        headers: superadmin.headers,
      });
      const body = await ctx.json<{ totals: { totalPoints: number } }>(after);
      expect(body.totals.totalPoints).toBe(12);
    });

    it('refuses an adjustment of zero, or one with no justification', async () => {
      const fixture = await seedFringeReady(ctx);
      const participant = await ctx.signUpParticipant();
      expect((await adjust(participant.id, fixture.activityId, { points: 0 })).status).toBe(400);
      const noReason = await adjust(participant.id, fixture.activityId, { reason: '' });
      expect(noReason.status).toBe(400);
      // Its own wording: borrowing the void message talked about actions nobody had taken.
      expect((await ctx.json<{ error: { message: string } }>(noReason)).error.message).toBe(
        messages.adjustmentReasonRequired,
      );
      expect((await adjust(participant.id, fixture.activityId, { points: 500 })).status).toBe(400);
    });

    /**
     * The ledger is append-only: a mistake is answered with an opposite entry, and BOTH stay
     * visible. A correction that erased its own history would be worth very little during
     * the argument it exists to settle.
     */
    it('keeps every entry, including the one that cancelled a mistake', async () => {
      const fixture = await seedFringeReady(ctx);
      const participant = await ctx.signUpParticipant();
      await adjust(participant.id, fixture.activityId, { points: 50, reason: 'Fat-fingered.' });
      await adjust(participant.id, fixture.activityId, { points: -50, reason: 'Reversing that.' });

      const after = await ctx.app.request(`/api/admin/participants/${participant.id}`, {
        headers: superadmin.headers,
      });
      const body = await ctx.json<{
        totals: { totalPoints: number };
        adjustments: { points: number; createdByUsername: string }[];
      }>(after);
      expect(body.totals.totalPoints).toBe(0);
      expect(body.adjustments).toHaveLength(2);
      expect(body.adjustments.map((a) => a.points).sort((x, y) => x - y)).toEqual([-50, 50]);
      expect(body.adjustments[0]?.createdByUsername).toBeTruthy();
    });

    it('is refused to a facilitator', async () => {
      const fixture = await seedFringeReady(ctx);
      const participant = await ctx.signUpParticipant();
      const response = await ctx.app.request(
        `/api/admin/participants/${participant.id}/adjustments`,
        jsonRequest(
          { activityId: fixture.activityId, points: 5, reason: 'Not mine to give.' },
          fixture.facilitator.headers,
        ),
      );
      expect(response.status).toBe(403);
    });
  });

  it('PIN reset — a superadmin can reset any participant PIN (F55/F56)', async () => {
    const participant = await ctx.signUpParticipant();
    const reset = await ctx.app.request(
      `/api/staff/participants/${participant.id}/pin`,
      withMethod('PUT', { pin: '7777' }, superadmin.headers),
    );
    expect(reset.status).toBe(200);

    const signIn = await ctx.app.request(
      '/api/auth/participants/signin',
      jsonRequest({ nickname: participant.nickname, pin: '7777' }),
    );
    expect(signIn.status).toBe(200);
  });
});
