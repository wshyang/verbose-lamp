import type { AppShellPolicyView, VenueView } from '@psd/contracts';
import { Hono, type Context } from 'hono';
import type { DatabaseHandle } from './db/client.js';
import { isStationOfflineEnabled } from './db/entities/index.js';
import { getEnv } from './env.js';
import { HTTPException } from 'hono/http-exception';
import { HttpError } from './lib/http.js';
import { sessionMiddleware, type AppBindings } from './lib/session.js';
import { authRoutes } from './routes-auth/index.js';
import { chatRoutes } from './routes-chat/index.js';
import { statusRoutes } from './routes-status/index.js';
import { teamChatRoutes } from './routes-team-chat/index.js';
import { superadminAnnouncementRoutes } from './routes-superadmin/announcements.js';
import { fringeRoutes } from './routes-fringe/index.js';
import { galleryRoutes } from './routes-gallery/index.js';
import { leaderboardRoutes } from './routes-leaderboard/index.js';
import { participantRoutes } from './routes-participants/index.js';
import { staffRoutes } from './routes-staff/index.js';
import { swagRoutes } from './routes-swag/index.js';
import { superadminSwagRoutes } from './routes-superadmin/swag.js';
import { superadminAccountRoutes } from './routes-superadmin/accounts.js';
import { superadminClusterRoutes } from './routes-superadmin/clusters.js';
import { superadminConfigRoutes } from './routes-superadmin/config.js';
import { superadminCorrectionRoutes } from './routes-superadmin/corrections.js';
import { superadminDirectoryRoutes } from './routes-superadmin/directory.js';
import { superadminSystemRoutes } from './routes-superadmin/system.js';
import { superadminAgendaRoutes } from './routes-superadmin/agenda.js';
import { superadminStandingsRoutes } from './routes-superadmin/standings.js';
import { superadminAwardBatchRoutes } from './routes-superadmin/awards.js';
import { superadminTeamRepairRoutes } from './routes-superadmin/teams.js';
import { refuseWhileSocialPaused } from './lib/socialPause.js';
import { teamRoutes } from './routes-teams/index.js';
import { deskRoutes, tournamentRoutes } from './routes-tournament/index.js';
import { compress } from 'hono/compress';
import { describeUnhandledError } from './lib/errorReport.js';
import { noteDatabaseError } from './lib/fatalDatabase.js';
import { jsonBodyLimit } from './lib/bodyLimit.js';
import { healthProbeFor } from './lib/health.js';

/**
 * The application object. Integration tests exercise exactly this via `app.request()` —
 * real router, real middleware, real cookies, no listening socket (AGENTS-testing.md §2).
 * `index.ts` is the only file that opens a port.
 */
/** A live stream: gzip would buffer it, and a buffered stream is a stalled one. */
/**
 * ADR-104 — walks the cause chain for Postgres's "invalid text representation" (22P02),
 * with the message as a fallback: PGlite and node-postgres wrap the database's complaint
 * at different depths, and a sweep probe must map to 404 whichever driver raised it.
 */
/**
 * ADR-230 — a look the database refuses is the participant's to change, not a fault on the server. Postgres's
 * check violation (23514) on the look's own constraint is a 422 with the field named, and it is not logged: the
 * look is in the request, and so is the photo that may come with it.
 */
function isLookRefused(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === '23514' && candidate.constraint === 'participant_avatar_look_check') return true;
    current = candidate.cause;
  }
  return false;
}

function isInvalidTextRepresentation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (candidate.code === '22P02') return true;
    if (
      typeof candidate.message === 'string' &&
      candidate.message.includes('invalid input syntax for type uuid')
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

/*
 * ADR-185 — every SSE endpoint, by SHAPE rather than by name.
 *
 * This was a hand-kept list of two: `/api/chat/stream` and `/api/status/stream`. Team chat
 * shipped its own stream at `/api/team-chat/stream` and nobody added it, so for its whole life
 * that room's frames have been going into the gzip buffer instead of to the phone — exactly the
 * failure ADR-046's carve-out exists to prevent, reintroduced by the carve-out being a list.
 *
 * A pattern cannot be forgotten by the next stream to be added, and the convention it encodes
 * is one the codebase already follows without exception: an SSE route is `/stream` at the end
 * of its own group. A test asserts the shape rather than the membership.
 */
const UNCOMPRESSED_STREAM = /^\/api\/[a-z-]+\/stream$/;

/**
 * Already-compressed bytes: gzipping a WebP or JPEG spends CPU to save approximately nothing.
 *
 * This is a pattern rather than a prefix because `/api/gallery/photos` is ALSO the JSON listing
 * and the upload route, and those should very much still be compressed — only the
 * `/{id}/{rendition}` blob beneath it should not.
 */
const UNCOMPRESSED_PATTERNS: readonly RegExp[] = [/^\/api\/gallery\/photos\/[^/]+\/[^/]+$/];

/** Exported so the carve-out is asserted directly, not inferred from response headers. */
export function skipsCompression(path: string): boolean {
  if (UNCOMPRESSED_STREAM.test(path)) return true;
  return UNCOMPRESSED_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * ADR-118 — the operations switch, applied before the three social route groups are mounted
 * so that a paused event sheds the request at the edge rather than inside each handler.
 * Scanning, teams, the leaderboard and the console are never listed here: pausing
 * the event's own scoring to save load would be a cure worse than the disease.
 */
function registerSocialPauseGuards(app: Hono<AppBindings>): void {
  for (const prefix of ['/api/chat/*', '/api/team-chat/*', '/api/gallery/*']) {
    app.use(prefix, refuseWhileSocialPaused());
  }
}

/**
 * ADR-147 — the app-shell policy, public and uncacheable.
 *
 * Public because the browser that must obey it asks before it has a session, and because a
 * facilitator whose session has expired is exactly the phone most likely to be holding a
 * worker nobody wants any more. There is nothing here to protect: it answers one boolean
 * about this deployment, which anyone can observe by looking at whether the app works
 * offline.
 *
 * `no-store`, with no etag, and that is the load-bearing header in this whole feature. An
 * answer that any layer may keep is a kill switch that cannot be flipped back.
 */
function registerAppShellPolicy(app: Hono<AppBindings>): void {
  app.get('/api/app-shell-policy', async (c) => {
    c.header('cache-control', 'no-store');
    const serveFromCache = await isStationOfflineEnabled(c.get('db'));
    return c.json({ serveFromCache } satisfies AppShellPolicyView);
  });
}

/**
 * ADR-295 — which venue this deployment runs at, so the app can wear the right theme.
 *
 * Public, because the scene and the palette are drawn on Landing and Sign-in before anyone has a
 * session. `no-cache` rather than `no-store`: a browser may keep the body but must ask again
 * before using it, so the day the venue changes is the day the next page load shows it. There is
 * nothing here to protect — it names a place the event is already advertised to be at.
 */
function registerVenue(app: Hono<AppBindings>): void {
  app.get('/api/venue', (c) => {
    c.header('cache-control', 'no-cache');
    return c.json({ venue: getEnv().PSD_VENUE } satisfies VenueView);
  });
}

/**
 * The public, session-less reads about this deployment itself: whether to keep an offline shell
 * (ADR-147) and which venue theme to wear (ADR-295). Grouped because they share a reason to be
 * public — a phone asks both before it has signed in — and so `createApp` stays a list of areas.
 */
function registerDeploymentFacts(app: Hono<AppBindings>): void {
  registerAppShellPolicy(app);
  registerVenue(app);
}

/**
 * Every superadmin surface, mounted on one prefix. Grouped into a function because the
 * console is eight route modules and growing, and `createApp` should stay a list of the
 * app's areas rather than a list of its files.
 */
function mountAdminRoutes(app: Hono<AppBindings>): void {
  app.route('/api/admin', superadminConfigRoutes());
  app.route('/api/admin', superadminClusterRoutes());
  app.route('/api/admin', superadminAccountRoutes());
  app.route('/api/admin', superadminCorrectionRoutes());
  app.route('/api/admin', superadminDirectoryRoutes());
  app.route('/api/admin', superadminAnnouncementRoutes());
  app.route('/api/admin', superadminSwagRoutes());
  app.route('/api/admin', superadminTeamRepairRoutes());
  app.route('/api/admin', superadminSystemRoutes());
  app.route('/api/admin', superadminStandingsRoutes());
  app.route('/api/admin', superadminAgendaRoutes());
  // ADR-248 — the award batch: the day's decisions, posted and reversed as units.
  app.route('/api/admin', superadminAwardBatchRoutes());
  // ADR-279 — the tournament console: Control, Timetable, and the writes behind them.
  app.route('/api/admin/tournament', deskRoutes());
}

/** ADR-324: every error that escapes a route, turned into the response for that one request. */
function handleError(error: Error, c: Context<AppBindings>): Response {
  // ADR-324 — a database that cannot come back is reported to whoever owns the process, which
  // replaces it; the request itself still answers 500 below.
  noteDatabaseError(error);
  if (error instanceof HttpError) {
    const body = { error: { message: error.message, field: error.field } };
    return c.json(body, error.status as 400);
  }
  /**
   * Hono's own middleware signals refusals with `HTTPException`, and without this branch every
   * one of them became a 500. `bodyLimit` is how that surfaced (ADR-048): a too-large upload
   * reported "something went wrong on our side" — blaming the server for the caller's mistake,
   * and telling a participant nothing they could act on.
   */
  if (error instanceof HTTPException) {
    return c.json({ error: { message: error.message } }, error.status as 400);
  }
  /**
   * ADR-104 — Postgres error 22P02 (invalid text representation) is what a path or body
   * value that is not a UUID becomes once it reaches a typed column: `/matches/1'OR'1`
   * names a row that cannot exist, which is a 404, not a server fault. Handling it HERE
   * makes every current and future route injection-shaped-input-safe at once, instead of
   * each handler remembering to validate. The code is read off the error AND its cause
   * chain, because drivers differ in how deeply they wrap the database's complaint.
   */
  if (isInvalidTextRepresentation(error)) {
    return c.json({ error: { message: 'Not found.' } }, 404);
  }
  if (isLookRefused(error)) {
    return c.json(
      { error: { message: 'That look could not be saved. Choose another look and try again.', field: 'avatarLook' } },
      422,
    );
  }
  // ADR-228 — the report, not the error: a failed query's error carries its bound values, photos included.
  console.error('[api] unhandled error', describeUnhandledError(error));
  return c.json({ error: { message: 'Something went wrong on our side.' } }, 500);
}

/**
 * ADR-324 — readiness, answered ahead of the session lookup: no cookie means no database read of
 * its own, so the only query this route makes is the probe's. Anonymous callers get check names
 * and ok/fail; a superadmin also gets latency, loop delay and the rejection count.
 */
function registerReadiness(app: Hono<AppBindings>, handle: DatabaseHandle): void {
  const probe = healthProbeFor(handle.db);
  app.get('/api/health/ready', async (c) => {
    const result = await probe.run();
    const actor = c.get('actor');
    const { detail, ...summary } = result;
    c.header('Cache-Control', 'no-store');
    const body = actor?.type === 'superadmin' ? { ...summary, detail } : summary;
    return c.json(body, result.ok ? 200 : 503);
  });
}

export function createApp(handle: DatabaseHandle): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  /**
   * ADR-034 — gzip, because a photo avatar is a few kilobytes of run-length text and a
   * leaderboard carries ten of them. Measured on the demo event: 41.8 kB of board
   * becomes 2.3 kB. Three hundred phones polling that every minute is the difference
   * between 200 kB/s and 11 kB/s out of one laptop on beach Wi-Fi.
   *
   * ADR-046 — but not on every path. gzip buffers in order to compress, which is precisely
   * wrong for `text/event-stream`: the chat room's frames would sit in the compressor instead
   * of reaching the phone, turning a live stream into a stalled one. Already-compressed binary
   * (a WebP photo) is the mirror-image case — it spends CPU to achieve nothing. Both are
   * carved out here rather than in the route, because by the time a handler runs the
   * middleware has already wrapped the response.
   */
  app.use('*', async (c, next) => {
    if (skipsCompression(c.req.path)) return next();
    return compress()(c, next);
  });

  // ADR-324 — before anything reads a body or touches the database: a refused body costs neither.
  app.use('/api/*', jsonBodyLimit());

  app.use('*', async (c, next) => {
    c.set('db', handle.db);
    await next();
  });
  app.use('*', sessionMiddleware());

  app.get('/api/health', (c) => c.json({ ok: true }));
  registerReadiness(app, handle);

  registerDeploymentFacts(app);

  registerSocialPauseGuards(app);
  app.route('/api/auth', authRoutes());
  app.route('/api', participantRoutes());
  app.route('/api/teams', teamRoutes());
  // ADR-277 — the rebuilt tournament, at the paths the kept surfaces already call.
  app.route('/api/tournament', tournamentRoutes());
  app.route('/api/fringe', fringeRoutes());
  app.route('/api/leaderboard', leaderboardRoutes());
  app.route('/api/chat', chatRoutes());
  app.route('/api/status', statusRoutes());
  // ADR-063 — no team id in the path: a participant addresses the room they are currently in.
  app.route('/api/team-chat', teamChatRoutes());
  app.route('/api/gallery', galleryRoutes());
  app.route('/api/staff', staffRoutes());
  app.route('/api/swag', swagRoutes());
  mountAdminRoutes(app);

  app.onError(handleError);

  app.notFound((c) => c.json({ error: { message: 'Not found.' } }, 404));

  return app;
}
