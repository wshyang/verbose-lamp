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
 * AGENTS-testing.md §3 — the session-scoping gate for EVERY route.
 *
 * Each registered route is classified by which actor types may reach it. The suite then
 * proves, with real signed-in sessions, that every other actor type is refused (401/403) and
 * that anonymous callers are refused on everything non-public.
 *
 * The coverage assertion is the point: a new route that no rule classifies FAILS this suite,
 * so "add the route, forget the negative test" cannot happen silently.
 */

type ActorKind = 'anonymous' | 'participant' | 'facilitator' | 'superadmin';

interface RouteRule {
  match: RegExp;
  allow: ActorKind[];
  note: string;
}

const RULES: RouteRule[] = [
  {
    match: /^(GET|POST) \/api\/tournament\/dumb\//,
    allow: ['facilitator'],
    note: 'ADR-321 — dumb courts are a facilitator station: court masters read their court and award/void points; the desk uses its own award routes',
  },
  {
    match: /^GET \/api\/health$/,
    allow: ['anonymous', 'participant', 'facilitator', 'superadmin'],
    note: 'liveness probe',
  },
  {
    match: /^GET \/api\/health\/ready$/,
    allow: ['anonymous', 'participant', 'facilitator', 'superadmin'],
    note: 'ADR-324 — readiness probe: check names and ok/fail only for anyone, detail for a superadmin',
  },
  {
    match: /^GET \/api\/app-shell-policy$/,
    allow: ['anonymous', 'participant', 'facilitator', 'superadmin'],
    note:
      'ADR-147 — one boolean about this deployment, which anybody can observe by reloading ' +
      'with the wifi off. The browser that must obey it asks before it has a session.',
  },
  {
    match: /^GET \/api\/venue$/,
    allow: ['anonymous', 'participant', 'facilitator', 'superadmin'],
    note:
      'ADR-295 — one display fact about this deployment (which theme to wear). The scene and ' +
      'palette are drawn on Landing and Sign-in, so it is asked before anyone has a session.',
  },
  {
    match: /^POST \/api\/admin\/service-state\/(enable|disable)-station-offline$/,
    allow: ['superadmin'],
    note: 'ADR-147 — the read is public; changing it installs or retires code on phones',
  },
  {
    match: /^GET \/api\/avatars$/,
    allow: ['participant', 'facilitator', 'superadmin'],
    note: 'ADR-035 — sprite bodies for faces already on the board, addressed by hash',
  },
  {
    match: /^GET \/api\/participants\/identities$/,
    allow: ['participant', 'facilitator', 'superadmin'],
    note: 'ADR-202 — faces and nicknames already visible to the caller, addressed by id',
  },
  {
    match: /^GET \/api\/clusters$/,
    allow: ['anonymous', 'participant', 'facilitator', 'superadmin'],
    note: 'B1 catalogue must load before signup (fds.md §7.1)',
  },
  {
    match: /^GET \/api\/agenda$/,
    allow: ['anonymous', 'participant', 'facilitator', 'superadmin'],
    note:
      'ADR-177 — the run sheet is on a poster by the registration tent. Somebody checking ' +
      'what time to turn up may not have signed in yet, and a login wall in front of a ' +
      'public timetable buys nothing. The writes are superadmin-only; that is the asymmetry.',
  },
  {
    match: /^GET \/api\/participants\/nicknames$/,
    allow: ['anonymous', 'participant', 'facilitator', 'superadmin'],
    note:
      'ADR-164 — the forgotten-nickname lookup. Anonymous by necessity: the only person who ' +
      'needs it is one who cannot sign in, and it answers with nicknames, which the ' +
      'leaderboard already shows to the room.',
  },
  {
    match: /^GET \/api\/stats\/participants\/count$/,
    allow: ['anonymous', 'participant', 'facilitator', 'superadmin'],
    note: 'pre-auth landing counter, no personal data',
  },
  {
    match: /^POST \/api\/auth\/(participants|facilitators|superadmins)\/sign(up|in)$/,
    allow: ['anonymous', 'participant', 'facilitator', 'superadmin'],
    note: 'credential exchange surfaces S1/S2/S18/S34',
  },
  {
    match: /^GET \/api\/auth\/session$/,
    allow: ['participant', 'facilitator', 'superadmin'],
    note: 'F3/F19 — any signed-in actor may read their own session',
  },
  {
    match: /^POST \/api\/auth\/signout$/,
    allow: ['anonymous', 'participant', 'facilitator', 'superadmin'],
    note: 'idempotent: signing out without a session clears the cookie and succeeds',
  },
  {
    match: /^GET \/api\/me(\/scans|\/passport)?$/,
    allow: ['participant'],
    note: 'S3/S6 own data only; ADR-239 the passport tab is the same session-bound read',
  },
  {
    match: /^(GET|POST) \/api\/chat\/messages$/,
    allow: ['participant', 'facilitator', 'superadmin'],
    note: 'ADR-046 — one global room, every signed-in actor may read it and post to it',
  },
  {
    match: /^GET \/api\/status\/stream$/,
    allow: ['participant'],
    note: 'ADR-121 — every frame on it is addressed to a participant: their dots, their team',
  },
  {
    match: /^GET \/api\/status\/screen$/,
    // Nobody. A screen reads this with its key, which is not an actor at all (ADR-140), so
    // every signed-in party is correctly refused — including the superadmin who minted it.
    allow: [],
    note: 'ADR-160 — a screen asking what it may show; the key is the credential, not a session',
  },
  {
    match: /^GET \/api\/chat\/stream$/,
    allow: ['participant', 'facilitator', 'superadmin'],
    note: 'ADR-046 — the live stream carries the same room, so it carries the same rule',
  },
  {
    match: /^POST \/api\/chat\/messages\/:messageId\/hide$/,
    allow: ['superadmin'],
    note: 'ADR-046 — moderation is a superadmin act; a soft hide, never a delete',
  },
  {
    match: /^POST \/api\/chat\/read$/,
    allow: ['participant'],
    note: "ADR-083 — the read marker feeds the Social tab's dot, which only participants have",
  },
  {
    match: /^(GET|POST) \/api\/team-chat\/(messages|read)$/,
    allow: ['participant'],
    note:
      'ADR-063 — a team room is its members, so participants only; staff and superadmins have no ' +
      'team. Membership is re-checked per request, and a participant with no team gets 403.',
  },
  {
    match: /^POST \/api\/team-chat\/typing$/,
    allow: ['participant'],
    note:
      'ADR-146 — the typing ping reaches the same room as the messages and so carries the ' +
      'same rule. It writes nothing, but it still names a person inside one team\'s room.',
  },
  {
    match: /^POST \/api\/team-chat\/messages\/:messageId\/hide$/,
    allow: ['participant'],
    note:
      'ADR-155 — participants only at this layer, and the captain check is inside the handler: ' +
      'a team room has no staff seat at all, so there is no role here that could stand in for ' +
      'the captain. The second half of the rule — the team id in the UPDATE, so a borrowed ' +
      "message id cannot reach another room — is pinned in teamChat.test.ts.",
  },
  {
    match: /^GET \/api\/team-chat\/stream$/,
    allow: ['participant'],
    note: 'ADR-063 — the live stream carries one team\'s room, so it carries the same rule',
  },
  {
    match: /^GET \/api\/me\/alerts$/,
    allow: ['participant'],
    note: 'ADR-063/074 — the nav dot and the announcement toast; own alerts only',
  },
  {
    match: /^(GET|POST) \/api\/admin\/announcements$/,
    allow: ['superadmin'],
    note:
      'ADR-074 — announcing to the whole event is a superadmin act. Deliberately NOT a facilitator ' +
      'capability: a court marshal reaching three hundred people has no undo but a retraction.',
  },
  {
    match: /^POST \/api\/admin\/announcements\/:announcementId\/retract$/,
    allow: ['superadmin'],
    note: 'ADR-074 — a soft hide, never a delete; the row stays for the audit trail',
  },
  {
    match: /^GET \/api\/gallery\/photos$/,
    allow: ['participant', 'facilitator', 'superadmin'],
    note: 'ADR-047 — everyone browses the gallery',
  },
  {
    match: /^GET \/api\/gallery\/photos\/:photoId\/:rendition$/,
    allow: ['participant', 'facilitator', 'superadmin'],
    note: 'ADR-047 — the bytes, streamed from disk; a hidden photo 404s for everybody',
  },
  {
    match: /^POST \/api\/gallery\/photos$/,
    allow: ['participant', 'facilitator'],
    note: 'ADR-047 — participants and facilitators contribute; a superadmin moderates instead',
  },
  {
    match: /^(POST|DELETE) \/api\/gallery\/photos\/:photoId\/vote$/,
    allow: ['participant'],
    note: 'ADR-047 — a like belongs to a participant; staff do not vote on the contest',
  },
  {
    match: /^POST \/api\/gallery\/photos\/:photoId\/report$/,
    allow: ['participant'],
    note: 'ADR-047 — the consent takedown path, reachable without finding a facilitator',
  },
  {
    match: /^POST \/api\/gallery\/photos\/:photoId\/(hide|unhide)$/,
    allow: ['superadmin'],
    note: 'ADR-047 — hiding is a superadmin act, a soft one, and reversible',
  },
  {
    match: /^GET \/api\/gallery\/photos\/:photoId\/archive$/,
    allow: ['superadmin'],
    note: 'ADR-050 — the untouched original is for Corporate archival only, never the gallery',
  },
  {
    match: /^GET \/api\/gallery\/moderation$/,
    allow: ['superadmin'],
    note: 'ADR-047 — the console read: hidden photos included, report counts first',
  },
  {
    match: /^PUT \/api\/me\/avatar$/,
    allow: ['participant'],
    note: 'S4 — a participant redraws their own avatar and nobody else\u2019s (ADR-021)',
  },
  {
    match: /^GET \/api\/teams(\/:teamId|\/mine)?$/,
    allow: ['participant', 'facilitator', 'superadmin'],
    note: 'S9/S10/S17 reads also feed the facilitator team picker S22',
  },
  {
    match: /^(POST|PATCH|DELETE) \/api\/teams/,
    allow: ['participant'],
    note: 'F6–F14 are participant-controlled; staff have no team override (fds.md §9.6)',
  },
  {
    match: /^(GET|POST) \/api\/swag\/(stations|stations\/:stationId|stations\/:stationId\/rounds|rounds\/:roundId\/(claims|advance|end)|claims|claims\/:claimId\/undo)$/,
    allow: ['facilitator'],
    note: 'ADR-110 — the swag counter console, a staff working surface like the fringe station; ADR-159 adds the counter\'s own undo, which is the same surface correcting itself',
  },
  {
    match: /^(GET|POST|PATCH|PUT) \/api\/admin\/swag-stations(\/:stationId(\/active)?)?$/,
    allow: ['superadmin'],
    note: 'ADR-110 — swag station administration, the activities admin surface mirrored',
  },
  {
    match: /^GET \/api\/teams\/:teamId\/matches$/,
    allow: ['participant', 'facilitator', 'superadmin'],
    note: 'S17 — a team\u2019s match history, restored by ADR-277; the same audience as the team page',
  },
  {
    match: /^GET \/api\/tournament\/(courts|matches\/feed|matches\/:matchId|bracket|lineups)$/,
    allow: ['participant', 'facilitator', 'superadmin'],
    note: 'ADR-277 — S60 feed, the courts, a match, the hall screen\u2019s bracket and the Line-ups tab: cross-role reads',
  },
  {
    match: /^GET \/api\/tournament\/(courts\/:courtId\/(current-match|recent-teams|lineups)|schedule)$/,
    allow: ['facilitator'],
    note: 'ADR-277 — the court console\u2019s own reads (S21, ADR-097, ADR-089)',
  },
  {
    match: /^GET \/api\/tournament\/mode$/,
    allow: ['facilitator', 'superadmin'],
    note: 'ADR-336 §5.4 — the mode is what a marshal and the desk both read; a participant learns it from Results',
  },
  {
    match: /^POST \/api\/tournament\/mode\/requests$/,
    allow: ['facilitator'],
    note: 'ADR-336 §5.4 — the ask is a facilitator capability: holding a station earns it, and the desk answers rather than asks',
  },
  {
    match: /^POST \/api\/tournament\/matches(\/:matchId\/(score|complete|cancel))?$/,
    allow: ['facilitator'],
    note: 'F22–F24 and the live score are facilitator actions; the desk corrects through /api/admin',
  },
  {
    match: /^(GET|POST) \/api\/fringe\//,
    allow: ['facilitator'],
    note: 'F26–F31 station operations',
  },
  {
    match: /^GET \/api\/leaderboard\/?$/,
    allow: ['participant', 'facilitator', 'superadmin'],
    note: 'F16/F49 same board for everyone signed in',
  },
  {
    match: /^(GET|PUT) \/api\/staff\//,
    allow: ['facilitator', 'superadmin'],
    note: 'fds.md §9.3 — PIN reset is authorised for both staff types',
  },
  {
    match: /^(GET|POST|PUT|PATCH) \/api\/admin\/tournament(\/.*)?$/,
    allow: ['superadmin'],
    note: 'ADR-279 — the tournament console: setup, corrections, contingency, the scheduler\u2019s off switch',
  },
  {
    match: /^(GET|POST|PUT|PATCH) \/api\/admin\//,
    allow: ['superadmin'],
    note: 'every configuration and correction surface S34–S59',
  },
  {
    // ADR-154 — the first DELETE under /api/admin, so the catch-all above did not reach it.
    // Deliberately its own rule rather than a widened catch-all: a DELETE appearing anywhere
    // in the console should have to be named, which is exactly what this gate just did.
    match: /^DELETE \/api\/admin\/teams\/:teamId\/members\/:participantId$/,
    allow: ['superadmin'],
    note: 'ADR-154 staff roster repair — removing a member on the captain’s behalf',
  },
];

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
    const key = `${route.method} ${route.path}`;
    if (!seen.has(key)) seen.set(key, { key, method: route.method, path: route.path });
  }
  return [...seen.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function ruleFor(route: RouteUnderTest): RouteRule | undefined {
  return RULES.find((rule) => rule.match.test(route.key));
}

describe('Authorization matrix — every route, every wrong party', () => {
  let ctx: TestContext;
  let routes: RouteUnderTest[];
  let sessions: Record<Exclude<ActorKind, 'anonymous'>, ActorSession>;
  let params: Record<string, string>;

  beforeAll(async () => {
    ctx = await createTestContext();
    const teamsFixture = await seedTeamsReady(ctx);
    const fringe = await seedFringeReady(ctx);
    const participant = await ctx.signUpParticipant();
    await createTeam(ctx, participant, teamNameFor(ctx.runId));

    const scan = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        {
          nickname: participant.nickname,
          roundId: fringe.roundId,
          tierLabel: fringe.tierLabel,
          clientScanUuid: crypto.randomUUID(),
          clientTimestamp: new Date().toISOString(),
        },
        fringe.facilitator.headers,
      ),
    );
    const scanBody = await ctx.json<{ scan: { id: string } }>(scan);

    sessions = {
      participant,
      facilitator: teamsFixture.facilitator,
      superadmin: teamsFixture.superadmin,
    };
    params = {
      ':teamId': teamsFixture.teamAId,
      ':participantId': participant.id,
      ':scanId': scanBody.scan.id,
      ':activityId': fringe.activityId,
      ':roundId': fringe.roundId,
      ':facilitatorId': teamsFixture.facilitator.id,
      ':superadminId': teamsFixture.superadmin.id,
      ':nickname': participant.nickname,
    };
    routes = collectRoutes(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  function concretePath(path: string): string {
    return path
      .split('/')
      .map((segment) => (segment.startsWith(':') ? (params[segment] ?? 'unknown') : segment))
      .join('/');
  }

  async function call(route: RouteUnderTest, headers: Record<string, string>) {
    const init: RequestInit =
      route.method === 'GET'
        ? { headers }
        : {
            method: route.method,
            headers: { 'content-type': 'application/json', ...headers },
            body: '{}',
          };
    return ctx.app.request(concretePath(route.path), init);
  }

  it('classifies every registered API route (coverage gate)', () => {
    const unclassified = routes.filter((route) => !ruleFor(route));
    expect(
      unclassified.map((route) => route.key),
      'Add a rule to RULES for each new route — see AGENTS-testing.md §3',
    ).toEqual([]);
    expect(routes.length).toBeGreaterThan(40);
  });

  it('refuses anonymous callers on every non-public route', async () => {
    const leaked: string[] = [];
    for (const route of routes) {
      const rule = ruleFor(route);
      if (!rule || rule.allow.includes('anonymous')) continue;
      const response = await call(route, {});
      if (response.status !== 401) leaked.push(`${route.key} → ${response.status}`);
    }
    expect(leaked).toEqual([]);
  });

  it('refuses a valid session belonging to the wrong actor type on every route', async () => {
    const leaked: string[] = [];
    const actorKinds: Exclude<ActorKind, 'anonymous'>[] = [
      'participant',
      'facilitator',
      'superadmin',
    ];
    for (const route of routes) {
      const rule = ruleFor(route);
      if (!rule) continue;
      for (const kind of actorKinds) {
        if (rule.allow.includes(kind)) continue;
        const response = await call(route, sessions[kind].headers);
        if (response.status !== 403) leaked.push(`${route.key} as ${kind} → ${response.status}`);
      }
    }
    expect(leaked).toEqual([]);
  });

  it('IDOR: a participant cannot read another participant\u2019s scans through an admin path', async () => {
    const other = await ctx.signUpParticipant();
    const response = await ctx.app.request(`/api/admin/participants/${other.id}`, {
      headers: sessions.participant.headers,
    });
    expect(response.status).toBe(403);
  });

  it('IDOR: /api/me/scans is bound to the session, never to a supplied id', async () => {
    const other = await ctx.signUpParticipant();
    const response = await ctx.app.request(`/api/me/scans?participantId=${other.id}`, {
      headers: sessions.participant.headers,
    });
    const body = await ctx.json<{ items: { participantId: string }[] }>(response);
    const foreign = body.items.filter((item) => item.participantId !== sessions.participant.id);
    expect(foreign).toEqual([]);
  });
});
