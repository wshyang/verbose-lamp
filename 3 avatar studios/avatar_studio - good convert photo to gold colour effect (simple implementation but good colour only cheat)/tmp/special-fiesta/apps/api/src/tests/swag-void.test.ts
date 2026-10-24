import { SCAN_UNDO_WINDOW_SECONDS, messages } from '@psd/contracts';
import type { SwagClaimView, SwagStationView, VoidAuditEntryView } from '@psd/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { undoSwagClaimAtStation } from '../db/entities/index.js';
import { swagClaims } from '../db/schema/index.js';
import {
  createTestContext,
  jsonRequest,
  type ActorSession,
  type TestContext,
} from './harness.js';

/**
 * ADR-159 — a handout can be taken back.
 *
 * Two reversals with different owners: the counter's own ten-second undo (ADR-138's shape)
 * and the superadmin void that outlives it. The assertion that matters in almost every test
 * below is not the flag on the row — it is that the ALLOWANCE came back. A void that left
 * `is_voided = true` but still counted toward the per-round limit would look entirely
 * correct in the console and leave the participant unable to collect the item they never
 * actually received, which is the failure the design doc was describing.
 */

let ctx: TestContext;
let superadmin: ActorSession;
let facilitator: ActorSession;
let other: ActorSession;
let stationId: string;
let roundId: string;
let nickname: string;

interface ErrorBody {
  error: { message: string };
}

beforeAll(async () => {
  ctx = await createTestContext();
  superadmin = await ctx.signInSuperadmin();
  facilitator = await ctx.createFacilitator();
  other = await ctx.createFacilitator();
  nickname = (await ctx.signUpParticipant()).nickname;

  const created = await ctx.app.request(
    '/api/admin/swag-stations',
    jsonRequest(
      {
        stationName: `Void Counter ${ctx.runId.slice(0, 4)}`,
        // A limit of one is the sharpest allowance test: it is spent by a single claim.
        items: [{ label: 'Tote bag', limit: 1 }],
      },
      superadmin.headers,
    ),
  );
  expect(created.status).toBe(201);
  stationId = (await ctx.json<{ station: SwagStationView }>(created)).station.id;

  const opened = await ctx.app.request(
    `/api/swag/stations/${stationId}/rounds`,
    jsonRequest({}, facilitator.headers),
  );
  expect(opened.status).toBe(201);
  roundId = (await ctx.json<{ round: { id: string } }>(opened)).round.id;
});

afterAll(async () => {
  await ctx.close();
});

async function handOut(
  headers: Record<string, string> = facilitator.headers,
): Promise<SwagClaimView> {
  const response = await ctx.app.request(
    '/api/swag/claims',
    jsonRequest(
      { nickname, roundId, itemLabel: 'Tote bag', clientClaimUuid: crypto.randomUUID() },
      headers,
    ),
  );
  expect(response.status).toBe(201);
  return (await ctx.json<{ claim: SwagClaimView }>(response)).claim;
}

/** Does the counter believe this participant may still take one? */
async function allowanceIsFree(): Promise<boolean> {
  const response = await ctx.app.request(
    '/api/swag/claims',
    jsonRequest(
      { nickname, roundId, itemLabel: 'Tote bag', clientClaimUuid: crypto.randomUUID() },
      facilitator.headers,
    ),
  );
  if (response.status === 201) {
    /*
     * Put the allowance back the way the test found it, so cases stay independent — and do
     * it through the feature under test rather than by deleting the row, because a probe
     * that reached behind the API could pass while the API itself was broken.
     */
    const { claim } = await ctx.json<{ claim: SwagClaimView }>(response);
    expect((await adminVoid(claim.id, 'void', 'Allowance probe.')).status).toBe(200);
    return true;
  }
  expect(response.status).toBe(409);
  expect((await ctx.json<ErrorBody>(response)).error.message).toBe(messages.swagLimitReached);
  return false;
}

/** Rewrite when the handout happened — the only honest way to test a window. */
async function ageClaimBy(claimId: string, seconds: number): Promise<void> {
  await ctx.handle.db
    .update(swagClaims)
    .set({ claimedAt: new Date(Date.now() - seconds * 1000) })
    .where(eq(swagClaims.id, claimId));
}

async function undo(claimId: string, headers: Record<string, string>): Promise<Response> {
  return ctx.app.request(`/api/swag/claims/${claimId}/undo`, { method: 'POST', headers });
}

async function adminVoid(
  claimId: string,
  action: 'void' | 'unvoid',
  reason = 'Scanned the wrong badge.',
): Promise<Response> {
  return ctx.app.request(
    `/api/admin/swag-claims/${claimId}/${action}`,
    jsonRequest({ reason }, superadmin.headers),
  );
}

describe('ADR-159 — the counter takes its own handout back', () => {
  it('frees the allowance again, so the right person can still be given one', async () => {
    const claim = await handOut();
    expect(await allowanceIsFree()).toBe(false);

    const undone = await undo(claim.id, facilitator.headers);
    expect(undone.status).toBe(200);
    const body = await ctx.json<{ claim: SwagClaimView }>(undone);
    expect(body.claim.isVoided).toBe(true);
    // ADR-138's distinction, kept: a counter undo stamps the row, a superadmin void does not.
    expect(body.claim.undoneAt).not.toBeNull();

    expect(await allowanceIsFree()).toBe(true);
  });

  /*
   * The window is the feature. A test that only undoes immediately cannot tell a server-side
   * window from no window at all, and the first person to find out would be whoever undid a
   * handout from an hour ago.
   */
  it('refuses once the window has passed, and points at the superadmin', async () => {
    const claim = await handOut();
    await ageClaimBy(claim.id, SCAN_UNDO_WINDOW_SECONDS + 1);

    const refused = await undo(claim.id, facilitator.headers);
    expect(refused.status).toBe(409);
    expect((await ctx.json<ErrorBody>(refused)).error.message).toBe(messages.swagUndoExpired);
    // A refused undo must not half-apply: the allowance is still spent.
    expect(await allowanceIsFree()).toBe(false);

    await adminVoid(claim.id, 'void');
  });

  it('still allows it at the very edge of the window', async () => {
    const claim = await handOut();
    await ageClaimBy(claim.id, SCAN_UNDO_WINDOW_SECONDS - 1);

    expect((await undo(claim.id, facilitator.headers)).status).toBe(200);
    expect(await allowanceIsFree()).toBe(true);
  });

  it('refuses a counter undoing a handout that was never theirs', async () => {
    const claim = await handOut();

    const refused = await undo(claim.id, other.headers);
    expect(refused.status).toBe(403);
    expect((await ctx.json<ErrorBody>(refused)).error.message).toBe(messages.swagUndoNotYours);
    expect(await allowanceIsFree()).toBe(false);

    await adminVoid(claim.id, 'void');
  });

  it('is silent about claims that do not exist', async () => {
    const missing = await undo('00000000-0000-4000-8000-00000000dea1', facilitator.headers);
    expect(missing.status).toBe(404);
  });

  /*
   * Asserted directly, because over HTTP it is invisible: the route's 403 refuses first, so
   * deleting this predicate from the WHERE leaves every route test green. ADR-138 hit exactly
   * the same wall and answered it the same way. The scope stays — the statement must be safe
   * on its own, not safe because of the caller it happens to have today.
   */
  it('scopes the statement itself to the counter that made the handout', async () => {
    const claim = await handOut();

    const stolen = await undoSwagClaimAtStation(ctx.handle.db, {
      claimId: claim.id,
      facilitatorId: other.id,
      windowSeconds: SCAN_UNDO_WINDOW_SECONDS,
    });
    expect(stolen).toBeNull();
    expect(await allowanceIsFree()).toBe(false);

    await adminVoid(claim.id, 'void');
  });

  /*
   * ADR-138's ruling, inherited: the ledger records a human overruling the day, and a counter
   * fixing its own slip inside ten seconds is not that. If this ever starts writing, the audit
   * becomes a log of ordinary clumsiness and stops being worth reading.
   */
  it('writes nothing to the void ledger', async () => {
    const claim = await handOut();
    expect((await undo(claim.id, facilitator.headers)).status).toBe(200);

    const audit = await ctx.app.request(
      `/api/admin/void-audit?targetType=swagclaim&targetId=${claim.id}`,
      { headers: superadmin.headers },
    );
    expect((await ctx.json<{ items: VoidAuditEntryView[] }>(audit)).items).toHaveLength(0);
  });

  it('refuses a second tap, rather than re-stamping a claim already taken back', async () => {
    const claim = await handOut();
    expect((await undo(claim.id, facilitator.headers)).status).toBe(200);

    const again = await undo(claim.id, facilitator.headers);
    expect(again.status).toBe(409);
  });
});

describe('ADR-159 — the superadmin void, after the counter has moved on', () => {
  it('voids a claim, frees the allowance, and records the reason in the ledger', async () => {
    const claim = await handOut();
    await ageClaimBy(claim.id, SCAN_UNDO_WINDOW_SECONDS + 1);
    expect(await allowanceIsFree()).toBe(false);

    const voided = await adminVoid(claim.id, 'void', 'Handed to the wrong cluster.');
    expect(voided.status).toBe(200);
    const body = await ctx.json<{ claim: SwagClaimView }>(voided);
    expect(body.claim.isVoided).toBe(true);
    /*
     * Null, deliberately. `undone_at` means "the counter took it back itself"; a superadmin
     * reversal is a different act with a different record, and flattening them would lose
     * the only on-row evidence of which one happened.
     */
    expect(body.claim.undoneAt).toBeNull();

    expect(await allowanceIsFree()).toBe(true);

    const audit = await ctx.app.request(
      `/api/admin/void-audit?targetType=swagclaim&targetId=${claim.id}`,
      { headers: superadmin.headers },
    );
    expect(audit.status).toBe(200);
    const { items } = await ctx.json<{ items: VoidAuditEntryView[] }>(audit);
    expect(items).toHaveLength(1);
    expect(items[0]?.action).toBe('void');
    expect(items[0]?.reason).toBe('Handed to the wrong cluster.');
  });

  it('unvoids, which spends the allowance again and appends a second ledger row', async () => {
    const claim = await handOut();
    expect((await adminVoid(claim.id, 'void')).status).toBe(200);
    expect(await allowanceIsFree()).toBe(true);

    const restored = await adminVoid(claim.id, 'unvoid', 'Void entered against the wrong row.');
    expect(restored.status).toBe(200);
    expect((await ctx.json<{ claim: SwagClaimView }>(restored)).claim.isVoided).toBe(false);
    expect(await allowanceIsFree()).toBe(false);

    const audit = await ctx.app.request(
      `/api/admin/void-audit?targetType=swagclaim&targetId=${claim.id}`,
      { headers: superadmin.headers },
    );
    // Append-only: the void was not rewritten, the unvoid was added beside it.
    const { items } = await ctx.json<{ items: VoidAuditEntryView[] }>(audit);
    expect(items.map((entry) => entry.action).sort()).toEqual(['unvoid', 'void']);

    await adminVoid(claim.id, 'void');
  });

  it('lists claims for the superadmin, voided ones included', async () => {
    const claim = await handOut();
    expect((await adminVoid(claim.id, 'void')).status).toBe(200);

    const listed = await ctx.app.request(`/api/admin/swag-claims?roundId=${roundId}`, {
      headers: superadmin.headers,
    });
    expect(listed.status).toBe(200);
    const { items } = await ctx.json<{ items: SwagClaimView[] }>(listed);
    /*
     * The voided row stays on the list. A void that removed the line would be
     * indistinguishable from a handout that never registered, which is exactly the
     * confusion that gets a second tote bag handed across the table.
     */
    const found = items.find((entry) => entry.id === claim.id);
    expect(found?.isVoided).toBe(true);
  });

  it('is silent about claims that do not exist', async () => {
    const missing = await adminVoid('00000000-0000-4000-8000-00000000dea1', 'void');
    expect(missing.status).toBe(404);
  });
});
