import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestContext,
  jsonRequest,
  seedFringeReady,
  withMethod,
  type TestContext,
} from './harness.js';

/**
 * OWASP Top 10 (2021) applicability assessment for this API (AGENTS-testing.md §4).
 * Every category is either exercised here or recorded as assessed-and-accepted with the
 * reason — never silently skipped.
 *
 * A01 Broken Access Control ........ exercised here + authorization-matrix.test.ts
 * A02 Cryptographic Failures ....... ACCEPTED RISK: plaintext PIN is a product directive
 *                                    (fds.md §9.6). Mitigation asserted: no credential is
 *                                    ever echoed by the API, and the cookie is an opaque
 *                                    server-side token, not the credential (ADR-004).
 * A03 Injection .................... exercised (parameterised Drizzle/SQL, hostile input)
 * A04 Insecure Design .............. exercised (bootstrap gates, reversible corrections)
 * A05 Security Misconfiguration .... exercised (no stack traces or HTML error leakage)
 * A06 Vulnerable Components ........ out of runtime scope; `npm audit` belongs in CI
 * A07 Auth & Session Failures ...... exercised (generic errors, sign-out invalidation)
 * A08 Data Integrity Failures ...... exercised (append-only audit, snapshot immutability)
 * A09 Logging & Monitoring ......... exercised (every correction leaves an audit row)
 * A10 SSRF ......................... NOT APPLICABLE: the API makes no outbound requests
 */

describe('Security matrix (OWASP Top 10)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('A02: no endpoint ever echoes a PIN or passcode', async () => {
    const participant = await ctx.signUpParticipant({ pin: '3141' });
    const superadmin = await ctx.signInSuperadmin();
    const facilitator = await ctx.createFacilitator();
    const payloads = await Promise.all(
      [
        ctx.app.request('/api/me', { headers: participant.headers }),
        ctx.app.request('/api/auth/session', { headers: participant.headers }),
        ctx.app.request('/api/admin/participants', { headers: superadmin.headers }),
        ctx.app.request(`/api/admin/participants/${participant.id}`, {
          headers: superadmin.headers,
        }),
        ctx.app.request('/api/admin/facilitators', { headers: superadmin.headers }),
        ctx.app.request('/api/staff/participants', { headers: facilitator.headers }),
      ].map(async (promise) => (await promise).json()),
    );
    for (const payload of payloads) {
      expect(findCredentialLeak(payload, ['3141', '1111'])).toBeNull();
    }
  });

  it('A02: the session cookie is an opaque token, HttpOnly, and not the credential', async () => {
    const response = await ctx.app.request(
      '/api/auth/participants/signup',
      jsonRequest({
        nickname: `Opaque_${ctx.runId}`,
        pin: '2718',
        clusterCode: 'ITC',
        gender: 'female',
        avatarVariant: 4,
        avatarLook: '4-2-3-1-5-2',
      }),
    );
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('2718');
  });

  it('A03: hostile input in a search filter is parameterised, not executed', async () => {
    const superadmin = await ctx.signInSuperadmin();
    await ctx.signUpParticipant();
    const response = await ctx.app.request(
      `/api/admin/participants?search=${encodeURIComponent("'; DROP TABLE participant; --")}`,
      { headers: superadmin.headers },
    );
    expect(response.status).toBe(200);
    const body = await ctx.json<{ items: unknown[] }>(response);
    expect(body.items).toEqual([]);

    const stillThere = await ctx.app.request('/api/admin/participants', {
      headers: superadmin.headers,
    });
    const rows = await ctx.json<{ items: unknown[] }>(stillThere);
    expect(rows.items.length).toBeGreaterThan(0);
  });

  it('A03: a nickname outside the contract pattern is rejected before it reaches SQL', async () => {
    const response = await ctx.app.request(
      '/api/auth/participants/signup',
      jsonRequest({
        nickname: "Robert'); DROP TABLE participant;--",
        pin: '1234',
        clusterCode: 'BP',
        gender: 'male',
        avatarVariant: 1,
        avatarLook: '4-2-3-1-5-2',
      }),
    );
    expect(response.status).toBe(400);
  });

  it('A04: the PointConfig bootstrap gate cannot be bypassed by a direct match POST', async () => {
    const facilitator = await ctx.createFacilitator();
    const response = await ctx.app.request(
      '/api/tournament/matches',
      jsonRequest(
        {
          courtId: crypto.randomUUID(),
          teamAId: crypto.randomUUID(),
          teamBId: crypto.randomUUID(),
        },
        facilitator.headers,
      ),
    );
    expect([400, 404]).toContain(response.status);
  });

  it('A05: unknown routes and errors return JSON without stack traces', async () => {
    const response = await ctx.app.request('/api/does-not-exist');
    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text.startsWith('{')).toBe(true);
    expect(text).not.toContain('at ');
    expect(text).not.toContain('node_modules');
  });

  it('A07: sign-out invalidates the server-side session, so a replayed cookie fails', async () => {
    const participant = await ctx.signUpParticipant();
    await ctx.app.request('/api/auth/signout', { method: 'POST', headers: participant.headers });
    const replay = await ctx.app.request('/api/me', { headers: participant.headers });
    expect(replay.status).toBe(401);
  });

  it('A07: a forged session token is rejected', async () => {
    const response = await ctx.app.request('/api/me', {
      headers: { cookie: 'psd_session=not-a-real-token' },
    });
    expect(response.status).toBe(401);
  });

  it('A08/A09: corrections are append-only and always attributable', async () => {
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
    const { scan } = await ctx.json<{ scan: { id: string } }>(scanned);
    await ctx.app.request(
      `/api/admin/scans/${scan.id}/void`,
      jsonRequest({ reason: 'Wrong participant scanned' }, fixture.superadmin.headers),
    );
    await ctx.app.request(
      `/api/admin/scans/${scan.id}/unvoid`,
      jsonRequest({ reason: 'Station confirmed it was correct' }, fixture.superadmin.headers),
    );
    const audit = await ctx.app.request(`/api/admin/void-audit?targetId=${scan.id}`, {
      headers: fixture.superadmin.headers,
    });
    const body = await ctx.json<{
      items: { action: string; performedByUsername: string; reason: string }[];
    }>(audit);
    expect(body.items).toHaveLength(2);
    expect(body.items.every((entry) => entry.performedByUsername === 'superadmin')).toBe(true);
  });

  it('A08/A09: a manual adjustment cannot be erased, only answered (ADR-117)', async () => {
    const fixture = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    const url = `/api/admin/participants/${participant.id}/adjustments`;
    const grant = (points: number, reason: string) =>
      ctx.app.request(
        url,
        jsonRequest(
          { activityId: fixture.activityId, points, reason },
          fixture.superadmin.headers,
        ),
      );

    await grant(40, 'Station tablet died, awarded by hand');
    const { adjustment } = await ctx.json<{ adjustment: { id: string } }>(
      await grant(-40, 'Entered against the wrong person'),
    );

    // The ledger is the audit trail, so the powerful surface must have no way out of it:
    // no delete, no edit, and no anonymous entry.
    for (const method of ['DELETE', 'PATCH', 'PUT']) {
      const attempt = await ctx.app.request(`${url}/${adjustment.id}`, {
        method,
        headers: fixture.superadmin.headers,
      });
      expect([404, 405]).toContain(attempt.status);
    }

    const detail = await ctx.app.request(`/api/admin/participants/${participant.id}`, {
      headers: fixture.superadmin.headers,
    });
    const body = await ctx.json<{
      totals: { totalPoints: number };
      adjustments: { points: number; createdByUsername: string }[];
    }>(detail);
    expect(body.adjustments).toHaveLength(2);
    expect(body.adjustments.every((entry) => entry.createdByUsername === 'superadmin')).toBe(true);
    expect(body.totals.totalPoints).toBe(0);
  });

  it('A08: a scan is immutable — there is no update path, only void', async () => {
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
    const { scan } = await ctx.json<{ scan: { id: string } }>(scanned);
    const attempt = await ctx.app.request(
      `/api/admin/scans/${scan.id}`,
      withMethod('PUT', { pointsAwardedSnapshot: 9999 }, fixture.superadmin.headers),
    );
    expect(attempt.status).toBe(404);
  });
});

/**
 * Structural credential check: walk the parsed payload rather than grepping the raw text, so
 * a UUID that happens to contain the digits cannot make this assertion flaky.
 */
function findCredentialLeak(payload: unknown, secrets: string[], path = '$'): string | null {
  if (typeof payload === 'string') {
    return secrets.includes(payload) ? `${path} = "${payload}"` : null;
  }
  if (Array.isArray(payload)) return findLeakInArray(payload, secrets, path);
  if (payload === null || typeof payload !== 'object') return null;
  return findLeakInObject(payload as Record<string, unknown>, secrets, path);
}

function findLeakInArray(items: unknown[], secrets: string[], path: string): string | null {
  for (const [index, item] of items.entries()) {
    const found = findCredentialLeak(item, secrets, `${path}[${index}]`);
    if (found) return found;
  }
  return null;
}

function findLeakInObject(
  record: Record<string, unknown>,
  secrets: string[],
  path: string,
): string | null {
  for (const [key, value] of Object.entries(record)) {
    if (key === 'pin' || key === 'passcode') return `${path}.${key}`;
    const found = findCredentialLeak(value, secrets, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}
