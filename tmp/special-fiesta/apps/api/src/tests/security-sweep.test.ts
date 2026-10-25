import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { teamNameFor } from './fixtures/names.js';
import {
  createTeam,
  createTestContext,
  jsonRequest,
  seedFringeReady,
  seedTeamsReady,
  type ActorSession,
  type TestContext,
} from './harness.js';

/**
 * ADR-104 — the OWASP sweep: EVERY registered endpoint, hostile inputs, no exceptions.
 *
 * Division of labour across the three security suites:
 *   - `authorization-matrix.test.ts` is A01 per endpoint: every route classified by actor
 *     kind, anonymous → 401 and wrong actor → 403 for each, with a coverage gate that fails
 *     on any unclassified route. That suite IS the per-endpoint permission segregation.
 *   - `security-matrix.test.ts` walks the Top 10 category by category with named scenarios
 *     (credential handling, rate limits, enumeration, …).
 *   - THIS suite is the per-endpoint half of A03/A05/A08: for every route it fires
 *     injection-shaped path parameters and malformed bodies, and requires a clean 4xx —
 *     never a 500, never a stack frame, never a non-JSON error — and proves the database
 *     survived the attempt. The route list comes from the app itself, so a new endpoint is
 *     swept the day it is registered.
 */

/** Classic hostile path segments: SQL, stacked statement, traversal, NUL. */
const INJECTIONS = [
  "1' OR '1'='1",
  '1; DROP TABLE participant;--',
  '../../../etc/passwd',
  'a%00b',
];

/** Hostile bodies for mutating routes: not JSON at all, and JSON of the wrong shape. */
const BAD_BODIES = ['this is not json {{', '[]'];

interface RouteUnderTest {
  key: string;
  method: string;
  path: string;
}

function collectRoutes(app: TestContext['app']): RouteUnderTest[] {
  const seen = new Map<string, RouteUnderTest>();
  for (const route of app.routes) {
    if (route.method === 'ALL') continue;
    if (!route.path.startsWith('/api')) continue;
    // SSE endpoints hold the connection open; their auth walls are covered by the matrix.
    if (route.path.endsWith('/stream')) continue;
    const key = `${route.method} ${route.path}`;
    if (!seen.has(key)) seen.set(key, { key, method: route.method, path: route.path });
  }
  return [...seen.values()].sort((left, right) => left.key.localeCompare(right.key));
}

describe('Security sweep — hostile inputs against every endpoint (ADR-104)', () => {
  let ctx: TestContext;
  let routes: RouteUnderTest[];
  let actors: { participant: ActorSession; facilitator: ActorSession; superadmin: ActorSession };

  beforeAll(async () => {
    ctx = await createTestContext();
    const teams = await seedTeamsReady(ctx);
    await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    await createTeam(ctx, participant, teamNameFor(ctx.runId));
    actors = {
      participant,
      facilitator: teams.facilitator,
      superadmin: teams.superadmin,
    };
    routes = collectRoutes(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** The actor most likely to get PAST the auth wall, so probes reach the database layer. */
  function actorFor(path: string): ActorSession {
    if (path.startsWith('/api/admin')) return actors.superadmin;
    if (
      path.startsWith('/api/staff') ||
      path.startsWith('/api/fringe') ||
      path.startsWith('/api/tournament')
    ) {
      return actors.facilitator;
    }
    return actors.participant;
  }

  /**
   * Sign-out succeeds whatever the body says, revoking the probe's OWN session — after
   * which every later probe would 401 and the sweep would stop reaching the layers it
   * exists to test. Nothing about a body-less self-revocation needs fuzzing.
   */
  function isSignOut(path: string): boolean {
    return path.includes('/signout');
  }

  function hostilePath(path: string, payload: string): string {
    return path
      .split('/')
      .map((segment) => (segment.startsWith(':') ? encodeURIComponent(payload) : segment))
      .join('/');
  }

  /**
   * ADR-118 — the one route whose 5xx is an answer rather than a failure.
   *
   * `POST /api/admin/system/restart` replies 503 when the process has no supervisor to restart
   * it, which is precisely the case under `app.request()`: nothing registered an exit because
   * nothing opened a port. That is a capability answer — well-formed request, authorised caller,
   * server genuinely cannot comply — and a 4xx would be a lie about whose fault it is. It is
   * swept like every other route; only its status is allowed to be this specific 503, and the
   * body must still be clean JSON with no stack trace.
   */
  const TOLERATED_5XX = new Map<string, number>([['/api/admin/system/restart', 503]]);

  /** A clean refusal: any 4xx, JSON-shaped, and not a single stack frame in the body. */
  async function expectCleanRefusalOrAnswer(
    response: Response,
    what: string,
    path: string,
  ): Promise<void> {
    const tolerated = TOLERATED_5XX.get(path);
    if (tolerated === undefined || response.status !== tolerated) {
      expect(response.status, `${what} must never be a 5xx`).toBeLessThan(500);
    }
    const text = await response.text();
    if (text !== '') {
      expect(text.includes('    at '), `${what} must not leak a stack trace`).toBe(false);
      expect(() => JSON.parse(text), `${what} must answer JSON`).not.toThrow();
    }
  }

  it('answers every injection-shaped path parameter with a clean 4xx, never a 500', async () => {
    for (const route of routes) {
      if (!route.path.includes('/:')) continue;
      for (const payload of INJECTIONS) {
        const headers = actorFor(route.path).headers;
        const init: RequestInit =
          route.method === 'GET'
            ? { headers }
            : {
                method: route.method,
                headers: { 'content-type': 'application/json', ...headers },
                body: '{}',
              };
        const response = await ctx.app.request(hostilePath(route.path, payload), init);
        await expectCleanRefusalOrAnswer(response, `${route.key} ← ${payload}`, route.path);
      }
    }
  });

  it('answers every malformed or wrong-shape body with a clean 4xx, never a 500', async () => {
    for (const route of routes) {
      if (route.method === 'GET' || route.method === 'DELETE') continue;
      if (isSignOut(route.path)) continue;
      for (const body of BAD_BODIES) {
        const headers = actorFor(route.path).headers;
        // Params get valid-shaped (but absent) uuids so the body is what is under test.
        const path = hostilePath(route.path, '00000000-0000-4000-8000-00000000dead');
        const response = await ctx.app.request(path, {
          method: route.method,
          headers: { 'content-type': 'application/json', ...headers },
          body,
        });
        await expectCleanRefusalOrAnswer(
          response,
          `${route.key} ← body ${body.slice(0, 20)}`,
          route.path,
        );
      }
    }
  });

  it('the database survived the sweep: nothing dropped, nothing truncated', async () => {
    // The stacked-statement payload named this table; it still answers with the crowd intact.
    const listed = await ctx.app.request('/api/staff/participants?search=', {
      headers: actors.facilitator.headers,
    });
    expect(listed.status).toBe(200);
    const body = await ctx.json<{ items: unknown[] }>(listed);
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('stores a script-tag chat message as inert data and returns it verbatim as JSON', async () => {
    // A03's output half: the API neither executes nor mangles markup — it is data, typed
    // application/json, and the render layer (React) owns escaping. Mangling it here would
    // break legitimate messages like "use <3 of your scans".
    const payload = '<script>alert(1)</script><img src=x onerror=steal()>';
    const posted = await ctx.app.request(
      '/api/chat/messages',
      jsonRequest({ body: payload }, actors.participant.headers),
    );
    expect(posted.status).toBe(201);

    const read = await ctx.app.request('/api/chat/messages', {
      headers: actors.participant.headers,
    });
    expect(read.headers.get('content-type')).toContain('application/json');
    const page = await ctx.json<{ messages: { body: string }[] }>(read);
    expect(page.messages.some((message) => message.body === payload)).toBe(true);
  });
});
