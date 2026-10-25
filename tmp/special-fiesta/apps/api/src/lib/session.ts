import type { ScreenSceneId } from '@psd/contracts';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getEnv } from '../env.js';
import type { AppDatabase } from '../db/client.js';
import {
  findFacilitatorById,
  findSuperadminById,
  type FacilitatorRecord,
} from '../db/entities/accounts.js';
import { findParticipantById } from '../db/entities/participants.js';
import { createSession, findActiveSession, invalidateSession } from '../db/entities/sessions.js';
import { findActiveScreenKey } from '../db/entities/screenKeys.js';
import { noteScreenKeySeen } from './presence.js';
import { noteFacilitatorSeen, noteParticipantSeen, noteSessionSeen } from './presence.js';
import type { ParticipantRow, ScreenKeyRow, SuperadminRow } from '../db/schema/index.js';
import { forbidden, unauthorized } from './http.js';
import { required } from '../db/rows.js';

/** ADR-004 — long-lived opaque cookie sessions for all three actor types. */

export const SESSION_COOKIE = 'psd_session';

/**
 * Carriers for the same opaque token, tried in this order (ADR-016). A proxy or an embedding
 * page can take any one of them away, so the credential is never tied to a single channel:
 * the cookie for a first-party tab, a private header for an embedded one, `Authorization` for
 * scripts and curl, and the query string for the rare intermediary that rewrites headers.
 */
export const SESSION_HEADER = 'x-psd-session';
export const SESSION_QUERY_PARAM = 'session_token';

export interface ParticipantActor {
  type: 'participant';
  sessionId: string;
  participant: ParticipantRow;
}

export interface FacilitatorActor {
  type: 'facilitator';
  sessionId: string;
  facilitator: FacilitatorRecord;
}

export interface SuperadminActor {
  type: 'superadmin';
  sessionId: string;
  superadmin: SuperadminRow;
}

export type Actor = ParticipantActor | FacilitatorActor | SuperadminActor;

/**
 * ADR-140 — the projector in the hall, which is a thing rather than a person.
 *
 * Deliberately NOT a member of `Actor`. Every `requireAnyActor` endpoint — the chat room
 * included — would otherwise admit a credential that lives in a URL on a laptop nobody is
 * watching. What a screen may read is an allowlist (`requireViewer`, six endpoints), so the
 * question "what can this key reach?" is answered by grepping for one function rather than by
 * auditing every shared read in the app.
 */
export interface ScreenViewer {
  type: 'screen';
  screenKeyId: string;
  label: string;
  /**
   * ADR-160 — carried on the viewer because `loadScreen` has already read the row. A screen
   * asking what it may show would otherwise cost a second query on a request the projector
   * repeats all day.
   */
  enabledScenes: ScreenSceneId[];
}

/** Whoever is allowed to look at the shared, non-personal reads: any actor, or a screen. */
export type Viewer = Actor | ScreenViewer;

export const SCREEN_HEADER = 'x-psd-screen';
/**
 * `EventSource` cannot set a header, and the screen's whole point is the live stream, so the
 * query carrier is not a fallback here — it is the primary one. Same reasoning as ADR-016's
 * `session_token`, and the same opaque token shape, so neither is more exposed than the other.
 */
export const SCREEN_QUERY_PARAM = 'screen_key';

export interface AppBindings {
  Variables: {
    db: AppDatabase;
    actor: Actor | null;
    screen: ScreenViewer | null;
  };
}

export type AppContext = Context<AppBindings>;

async function loadActor(db: AppDatabase, token: string): Promise<Actor | null> {
  const session = await findActiveSession(db, token);
  if (!session) return null;
  // ADR-082 — a note in memory, not a write: last-seen stamps are batched by the presence
  // flusher, so the request path performs no UPDATE and a burst of polls costs no writes.
  noteSessionSeen(session.id);
  // Each actor column is a foreign key and `ck_session_one_actor` allows exactly one of
  // them, so a live session always resolves to an account row that still exists.
  if (session.participantId) {
    const participant = required(
      await findParticipantById(db, session.participantId),
      'Session participant',
    );
    noteParticipantSeen(participant.id);
    return { type: 'participant', sessionId: session.id, participant };
  }
  if (session.facilitatorId) {
    const facilitator = required(
      await findFacilitatorById(db, session.facilitatorId),
      'Session facilitator',
    );
    noteFacilitatorSeen(facilitator.id);
    return { type: 'facilitator', sessionId: session.id, facilitator };
  }
  const superadminId = required(session.superadminId, 'Session actor');
  const superadmin = required(await findSuperadminById(db, superadminId), 'Session superadmin');
  return { type: 'superadmin', sessionId: session.id, superadmin };
}

/**
 * The cookie is the primary carrier, but it is not always available: a browser that treats
 * this app as a third party (embedded in another page) refuses to store it at all, and no
 * server-side attribute can change that. The same opaque token is therefore also accepted
 * from a header or, if even headers do not survive the trip, from the query string (ADR-016).
 */
function readBearer(c: AppContext): string | null {
  const [scheme, value] = (c.req.header('authorization') ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value;
}

function readSessionToken(c: AppContext): string | null {
  return (
    getCookie(c, SESSION_COOKIE) ??
    c.req.header(SESSION_HEADER) ??
    readBearer(c) ??
    c.req.query(SESSION_QUERY_PARAM) ??
    null
  );
}

function readScreenToken(c: AppContext): string | null {
  return c.req.header(SCREEN_HEADER) ?? c.req.query(SCREEN_QUERY_PARAM) ?? null;
}

/**
 * The screen key is read here rather than inside the guard so that `requireViewer` stays
 * synchronous like its three siblings — a guard that suddenly needed awaiting would be the
 * kind of asymmetry somebody eventually forgets. A request with no screen carrier costs no
 * query at all.
 */
async function loadScreen(db: AppDatabase, token: string): Promise<ScreenViewer | null> {
  const key: ScreenKeyRow | null = await findActiveScreenKey(db, token);
  if (!key) return null;
  // ADR-145 — in memory, flushed on the interval (ADR-082). A projector's eight hours of
  // polling must not add a write to every read it makes.
  noteScreenKeySeen(key.id);
  return { type: 'screen', screenKeyId: key.id, label: key.label, enabledScenes: key.enabledScenes };
}

export function sessionMiddleware(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const token = readSessionToken(c);
    const actor = token ? await loadActor(c.get('db'), token) : null;
    c.set('actor', actor);
    const screenToken = readScreenToken(c);
    c.set('screen', screenToken ? await loadScreen(c.get('db'), screenToken) : null);
    await next();
  };
}

export interface SignInInput {
  actorType: 'participant' | 'facilitator' | 'superadmin';
  actorId: string;
}

/**
 * The attributes are environment-driven because the same build runs first-party (its own tab)
 * and embedded (inside another site's frame), and those need different cookies. Deleting must
 * repeat the attributes: a browser only drops a cookie when they match.
 */
function sessionCookieOptions() {
  const env = getEnv();
  return {
    httpOnly: true,
    sameSite: env.COOKIE_SAMESITE,
    secure: env.COOKIE_SECURE,
    partitioned: env.COOKIE_PARTITIONED,
    path: '/',
  };
}

/** Returns the token so the sign-in response can carry it for cookie-less clients. */
export async function startSession(c: AppContext, input: SignInInput): Promise<string> {
  const env = getEnv();
  const session = await createSession(c.get('db'), { ...input, ttlDays: env.SESSION_TTL_DAYS });
  setCookie(c, SESSION_COOKIE, session.token, {
    ...sessionCookieOptions(),
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
  });
  return session.token;
}

export async function endSession(c: AppContext): Promise<void> {
  const actor = c.get('actor');
  if (actor) await invalidateSession(c.get('db'), actor.sessionId);
  deleteCookie(c, SESSION_COOKIE, sessionCookieOptions());
}

export function requireParticipant(c: AppContext): ParticipantActor {
  const actor = c.get('actor');
  if (!actor) throw unauthorized();
  if (actor.type !== 'participant') throw forbidden();
  return actor;
}

export function requireFacilitator(c: AppContext): FacilitatorActor {
  const actor = c.get('actor');
  if (!actor) throw unauthorized();
  if (actor.type !== 'facilitator') throw forbidden();
  return actor;
}

export function requireSuperadmin(c: AppContext): SuperadminActor {
  const actor = c.get('actor');
  if (!actor) throw unauthorized();
  if (actor.type !== 'superadmin') throw forbidden();
  return actor;
}

/** fds.md §9.3 — PIN reset is authorised for facilitators AND superadmins. */
export function requireStaff(c: AppContext): FacilitatorActor | SuperadminActor {
  const actor = c.get('actor');
  if (!actor) throw unauthorized();
  if (actor.type === 'participant') throw forbidden();
  return actor;
}

export function requireAnyActor(c: AppContext): Actor {
  const actor = c.get('actor');
  if (!actor) throw unauthorized();
  return actor;
}

/**
 * ADR-140 — the shared, non-personal reads: the leaderboard, the match feed, the line-ups and
 * the gallery listing. Any signed-in human, or a projector carrying a live screen key.
 *
 * A screen presenting a key that has been revoked is not an actor at all, so it falls through
 * to the same 401 as presenting nothing — which is what makes revocation take effect on the
 * next request rather than at the next restart.
 */
export function requireViewer(c: AppContext): Viewer {
  const actor = c.get('actor');
  if (actor) return actor;
  const screen = c.get('screen');
  if (screen) return screen;
  throw unauthorized();
}
