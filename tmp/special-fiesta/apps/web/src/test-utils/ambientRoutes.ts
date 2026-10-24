import { ALL_SCREEN_SCENE_IDS } from '@psd/contracts';
import type {
  OperationsOverviewView,
  ParticipantIdentityView,
  ScreenProfileView,
  TeamChatPageView,
} from '@psd/contracts';
import type { RouteTable } from './fetchStub.js';

/**
 * ADR-211 — the requests the app makes that no individual test is about.
 *
 * A test for the Agenda tab renders the participant shell, and the shell polls for alerts. A
 * test for a swag station renders the facilitator shell, and that one asks which stations
 * exist. None of this is what those tests are checking, but all of it is real traffic, and
 * before ADR-211 it went unstubbed — rejecting into whichever test happened to be on screen
 * when it landed.
 *
 * The temptation on finding 117 such failures was a catch-all: let the stub answer anything it
 * does not recognise with `{}`. That would have made the suite green and thrown away exactly
 * the signal just built — a test that quietly calls an endpoint nobody listed is a test whose
 * author did not know what their component does, and that is worth being told about. So this
 * is the opposite: a NAMED, TYPED, OPT-IN bundle. A file spreads in the ambient routes it
 * needs, which keeps the admission visible in the file's own route table, and anything outside
 * the bundle still fails loudly.
 *
 * Every body is the empty-but-valid shape of its contract view, and typed as that view so a
 * fixture that drifts from the wire format fails the typecheck rather than the test. They are
 * deliberately boring: a test that cares what is IN one of these responses should stub it
 * itself, and overriding is just a later key in the same object literal.
 */

/** The participant shell: alerts badge, the team the viewer belongs to. */
export function participantShellRoutes(): RouteTable {
  return {
    'GET /api/me/alerts': { body: { announcements: [], teamChatUnread: 0 } },
    'GET /api/teams/mine': { body: { team: null } },
  };
}

/** The facilitator shell and its station pickers. */
export function facilitatorShellRoutes(): RouteTable {
  return {
    // ADR-321 — the picker asks whether the courts are dumb today; on an ordinary day they are not.
    'GET /api/tournament/dumb/status': { body: { active: false } },
    // ADR-336 §5.4 — the same picker shows a marshal's ask, and polls for the desk's answer.
    'GET /api/tournament/mode': {
      body: { mode: 'fixtures', isAwarding: false, pendingRequest: null },
    },
    'GET /api/swag/stations': { body: { items: [] } },
    'GET /api/staff/participants': { body: { items: [] } },
  };
}

/** The superadmin dashboard's live operations panel, which polls while the page is open. */
export function superadminShellRoutes(): RouteTable {
  const overview: OperationsOverviewView = {
    generatedAt: '2026-10-07T06:00:00.000Z',
    windowMinutes: 30,
    matchMinutes: 12,
    scanCount: 0,
    claimCount: 0,
    matchesCompleted: 0,
    teamsOutside: { count: 0, canAdmit: false },
    stations: [],
    liveMatches: [],
    facilitators: [],
  };
  return { 'GET /api/admin/operations': { body: { overview } } };
}

/**
 * The court console's two background reads.
 *
 * `recent-teams` is the one that caused ADR-192's original misattribution: `CourtPage` fires it
 * on every render, nobody awaits it, and the rejection landed on a neighbour.
 */
export function courtConsoleRoutes(): RouteTable {
  return {
    'GET /api/tournament/schedule': { body: { upNext: [], pendingPairs: [] } },
    'GET /api/tournament/courts/:courtId/recent-teams': { body: { teamIds: [] } },
    // ADR-336 §5.4 — the court page asks the room's mode (and whether a desk answer is waiting).
    'GET /api/tournament/mode': {
      body: { mode: 'fixtures', isAwarding: false, pendingRequest: null },
    },
  };
}

/**
 * The superadmin console's shared background reads.
 *
 * `admin/participants` is the directory combobox, which fires a search on EVERY keystroke --
 * and each keystroke is a different query string. A test that stubs only the finished word
 * leaves every prefix unstubbed, which is why this is keyed without a query: the stub matches
 * on the path first, so one entry covers the whole typing sequence.
 *
 * ⚠️ That same precedence is a trap. `matchRoute` tries the path WITHOUT its query before the
 * path with it, so adding this bundle to a file that stubs `'GET /api/admin/participants?
 * search=nadia'` SHADOWS that entry and hands the test an empty list instead. It cost two
 * passing tests when this bundle was first dropped into `TeamsRepairPage.test.tsx`. Prefer
 * query-less keys with a handler that reads `url`; where a file already keys by query, leave
 * it alone and stub the prefixes it is missing.
 */
export function adminConsoleRoutes(): RouteTable {
  return {
    'GET /api/admin/participants': { body: { items: [] } },
    'GET /api/admin/void-audit': { body: { items: [] } },
    'GET /api/admin/clusters': { body: { items: [], scoringStarted: false } },
    'GET /api/admin/activities': { body: { items: [] } },
  };
}

/** A fringe round's scan list, polled by the station page while the round is open. */
export function fringeStationRoutes(): RouteTable {
  return { 'GET /api/fringe/rounds/:roundId/scans': { body: { items: [] } } };
}

/**
 * The hall screen asking what it is allowed to show (ADR-160).
 *
 * EVERY scene, not none. The first draft defaulted to an empty list and broke twenty-one
 * ScreenPage tests, because an empty list is not the neutral value here -- ADR-160 is explicit
 * that "a key minted without an opinion shows everything; the feature is subtraction". A
 * default that contradicts the domain's own default is not a default, it is a second opinion.
 */
export function screenRoutes(): RouteTable {
  const profile: ScreenProfileView = { label: 'Screen', enabledScenes: [...ALL_SCREEN_SCENE_IDS] };
  return { 'GET /api/status/screen': { body: profile } };
}

/**
 * ADR-202's identity resolver, which every chat surface uses.
 *
 * Worth a note: `fetchParticipantIdentities` already ends in `.catch(() => ({ items: [] }))`,
 * so these misses never floated as rejections — they were harmless. They are stubbed anyway,
 * because "harmless today" is a property of one call site's error handling, and the register
 * exists to say what the app asked for, not what it got away with.
 */
export function identityRoutes(): RouteTable {
  const items: ParticipantIdentityView[] = [];
  return { 'GET /api/participants/identities': { body: { items } } };
}

/** The team room: its first page, and the typing ping it fires while you write. */
export function teamChatRoutes(): RouteTable {
  const page: TeamChatPageView = { messages: [], hasOlder: false };
  return {
    'GET /api/team-chat/messages': { body: page },
    'POST /api/team-chat/typing': { status: 204 },
  };
}
