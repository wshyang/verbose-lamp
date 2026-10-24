import { SCAN_UNDO_WINDOW_SECONDS, messages } from '@psd/contracts';
import type { ScanView } from '@psd/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { undoScanAtStation } from '../db/entities/index.js';
import { fringeScans } from '../db/schema/index.js';
import {
  createTestContext,
  jsonRequest,
  seedFringeReady,
  type FringeFixture,
  type TestContext,
} from './harness.js';

/**
 * ADR-138 (F1) — the station's ten-second undo.
 *
 * The feature is one button; the guarantee is that the button is not what decides. Every test
 * here asks the server, and the two that matter most age the row or change the actor, because
 * a window enforced in the browser and a window enforced in SQL look identical from the happy
 * path.
 */

let ctx: TestContext;
let fixture: FringeFixture;

interface ErrorBody {
  error: { message: string };
}

beforeAll(async () => {
  ctx = await createTestContext();
  fixture = await seedFringeReady(ctx);
});

afterAll(async () => {
  await ctx.close();
});

async function scanSomebody(): Promise<{ scan: ScanView; nickname: string }> {
  const participant = await ctx.signUpParticipant();
  const response = await ctx.app.request(
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
  expect(response.status).toBe(201);
  const body = await ctx.json<{ scan: ScanView }>(response);
  return { scan: body.scan, nickname: participant.nickname };
}

async function undo(scanId: string, headers: Record<string, string>): Promise<Response> {
  return ctx.app.request(`/api/fringe/scans/${scanId}/undo`, {
    method: 'POST',
    headers,
  });
}

/** Rewrite when the scan happened, which is the only honest way to test a window. */
async function ageScanBy(scanId: string, seconds: number): Promise<void> {
  await ctx.handle.db
    .update(fringeScans)
    .set({ scannedAt: new Date(Date.now() - seconds * 1000) })
    .where(eq(fringeScans.id, scanId));
}

async function pointsFor(nickname: string): Promise<number> {
  const response = await ctx.app.request('/api/leaderboard', {
    headers: fixture.superadmin.headers,
  });
  const { topIndividuals } = await ctx.json<{
    topIndividuals: { nickname: string; totalPoints: number }[];
  }>(response);
  return topIndividuals.find((entry) => entry.nickname === nickname)?.totalPoints ?? 0;
}

describe('ADR-138 — undoing a mis-scan at the station', () => {
  it('takes the points straight back off the board and frees the round slot', async () => {
    const { scan, nickname } = await scanSomebody();
    expect(await pointsFor(nickname)).toBe(fixture.pointValue);

    const undone = await undo(scan.id, fixture.facilitator.headers);
    expect(undone.status).toBe(200);
    const body = await ctx.json<{ scan: ScanView }>(undone);
    expect(body.scan.isVoided).toBe(true);
    expect(body.scan.undoneAt).not.toBeNull();
    expect(await pointsFor(nickname)).toBe(0);

    /*
     * The slot is free again, which is the whole point: the marshal undoes the wrong person
     * and immediately scans the right one. A void that left the slot held would turn one
     * mistake into two.
     */
    const again = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        {
          nickname,
          roundId: fixture.roundId,
          tierLabel: fixture.tierLabel,
          clientScanUuid: crypto.randomUUID(),
          clientTimestamp: new Date().toISOString(),
        },
        fixture.facilitator.headers,
      ),
    );
    expect(again.status).toBe(201);
  });

  /*
   * The window is the feature. A test that only undoes immediately cannot tell a server-side
   * window from no window at all — the button would look the same either way, and the first
   * person to notice would be whoever undid an award from an hour ago.
   */
  it('refuses once the window has passed, and says a superadmin can still do it', async () => {
    const { scan, nickname } = await scanSomebody();
    await ageScanBy(scan.id, SCAN_UNDO_WINDOW_SECONDS + 1);

    const refused = await undo(scan.id, fixture.facilitator.headers);
    expect(refused.status).toBe(409);
    expect((await ctx.json<ErrorBody>(refused)).error.message).toBe(messages.scanUndoExpired);
    // The award is untouched: a refused undo must not half-apply.
    expect(await pointsFor(nickname)).toBe(fixture.pointValue);
  });

  it('still allows it at the very edge of the window', async () => {
    const { scan, nickname } = await scanSomebody();
    // A second inside the limit — the boundary belongs to the facilitator, not the clock.
    await ageScanBy(scan.id, SCAN_UNDO_WINDOW_SECONDS - 1);

    expect((await undo(scan.id, fixture.facilitator.headers)).status).toBe(200);
    expect(await pointsFor(nickname)).toBe(0);
  });

  /*
   * The wrong-party negative. Two stations are open at once all afternoon and both consoles
   * show an Undo button; the scan id is the only thing standing between them.
   */
  it('refuses a facilitator undoing another station’s award', async () => {
    const { scan, nickname } = await scanSomebody();
    const other = await ctx.createFacilitator();

    const refused = await undo(scan.id, other.headers);
    expect(refused.status).toBe(403);
    expect((await ctx.json<ErrorBody>(refused)).error.message).toBe(messages.scanUndoNotYours);
    expect(await pointsFor(nickname)).toBe(fixture.pointValue);
  });

  it('refuses a participant and an anonymous caller outright', async () => {
    const { scan } = await scanSomebody();
    const participant = await ctx.signUpParticipant();
    expect((await undo(scan.id, participant.headers)).status).toBe(403);
    expect((await undo(scan.id, {})).status).toBe(401);
  });

  it('answers a second tap of the same button without undoing anything twice', async () => {
    const { scan, nickname } = await scanSomebody();
    expect((await undo(scan.id, fixture.facilitator.headers)).status).toBe(200);

    /*
     * The row is already voided, so the guarded UPDATE matches nothing and the caller is told
     * the same thing as an expired window: it is not yours to take back any more. The state
     * it reports is the true one, which is what matters when two taps race.
     */
    const second = await undo(scan.id, fixture.facilitator.headers);
    expect(second.status).toBe(409);
    expect(await pointsFor(nickname)).toBe(0);
  });

  /*
   * The route's 403 exists to tell the two refusals apart in words a facilitator can act on;
   * the STATEMENT is what actually decides. Asserted here directly, because no HTTP request
   * can reach it past the route check — and defence in depth that nothing exercises is just
   * a comment that happens to compile.
   */
  it('scopes the write itself to the owning facilitator, below the route’s refusal', async () => {
    const { scan } = await scanSomebody();
    const other = await ctx.createFacilitator();

    const stolen = await undoScanAtStation(ctx.handle.db, {
      scanId: scan.id,
      facilitatorId: other.id,
      windowSeconds: SCAN_UNDO_WINDOW_SECONDS,
    });
    expect(stolen).toBeNull();

    // And the owner's own call still works, so the predicate is scoping rather than blocking.
    const mine = await undoScanAtStation(ctx.handle.db, {
      scanId: scan.id,
      facilitatorId: fixture.facilitator.id,
      windowSeconds: SCAN_UNDO_WINDOW_SECONDS,
    });
    expect(mine?.isVoided).toBe(true);
  });

  it('404s for a scan id that does not exist', async () => {
    const missing = await undo(crypto.randomUUID(), fixture.facilitator.headers);
    expect(missing.status).toBe(404);
  });

  /*
   * ADR-117's ledger is the record of a SUPERADMIN's decisions, and its author column is NOT
   * NULL for that reason. A station correcting itself is a different event with a different
   * author, so it is recorded on the scan instead — and the corrections console can still
   * tell the two apart.
   */
  it('records the undo on the scan and writes nothing to the superadmin audit ledger', async () => {
    const { scan } = await scanSomebody();
    await undo(scan.id, fixture.facilitator.headers);

    const audit = await ctx.app.request(`/api/admin/void-audit?targetId=${scan.id}`, {
      headers: fixture.superadmin.headers,
    });
    const { items } = await ctx.json<{ items: unknown[] }>(audit);
    expect(items).toHaveLength(0);

    const scans = await ctx.app.request(`/api/fringe/rounds/${fixture.roundId}/scans`, {
      headers: fixture.facilitator.headers,
    });
    const logged = (await ctx.json<{ items: ScanView[] }>(scans)).items.find(
      (entry) => entry.id === scan.id,
    ) as ScanView;
    expect(logged.isVoided).toBe(true);
    expect(logged.undoneAt).not.toBeNull();
  });

  /*
   * And the other direction: a superadmin void is NOT an undo, so it leaves undone_at null.
   * Without this the new column would drift into meaning \"voided\", which is what is_voided
   * already says.
   */
  it('leaves undone_at null when a superadmin voids the scan instead', async () => {
    const { scan } = await scanSomebody();
    const voided = await ctx.app.request(
      `/api/admin/scans/${scan.id}/void`,
      jsonRequest({ reason: 'awarded to the wrong person' }, fixture.superadmin.headers),
    );
    expect(voided.status).toBe(200);

    const scans = await ctx.app.request(`/api/fringe/rounds/${fixture.roundId}/scans`, {
      headers: fixture.facilitator.headers,
    });
    const logged = (await ctx.json<{ items: ScanView[] }>(scans)).items.find(
      (entry) => entry.id === scan.id,
    ) as ScanView;
    expect(logged.isVoided).toBe(true);
    expect(logged.undoneAt).toBeNull();
  });
});
