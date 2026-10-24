import {
  ALL_SCREEN_SCENE_IDS,
  SCREEN_KEY_LABEL_MAX,
  isScreenSceneId,
  messages,
  systemResetRequestSchema,
  type ScreenSceneId,
  type ServiceStateView,
  type SystemResetView,
} from '@psd/contracts';
import { Hono } from 'hono';
import {
  createScreenKey,
  disableStationOffline,
  enableStationOffline,
  findServiceState,
  invalidateScreenKey,
  listScreenKeys,
  pauseSocial,
  resetEventData,
  setScreenKeyScenes,
  resumeSocial,
} from '../db/entities/index.js';
import { isShutdownSupported, requestShutdown } from '../lib/lifecycle.js';
import { readOperationsOverview } from '../lib/operations.js';
import { consumeResetChallenge, issueResetChallenge } from '../lib/resetChallenge.js';
import { requireSuperadmin, type AppBindings } from '../lib/session.js';
import { badRequest, forbidden, notFound, readBody } from '../lib/http.js';
import { screenKeyView, serviceStateView } from './views.js';

/**
 * ADR-118 — S61, the operations surface: pause the non-essentials, and restart the app.
 *
 * Both controls are deliberately NOT in `config.ts`. Point config, activities and courts
 * describe how the event scores; these two describe whether it is serving, and an operator
 * reaching for them is having a bad afternoon. They deserve a page of their own with its
 * own confirmations rather than a corner of the settings screen.
 */
export function superadminSystemRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  /**
   * `canRestart` is a sibling of `state`, not a field inside it: the pause is an event-day
   * decision somebody made and the database remembers, while this describes the process that
   * happens to be serving the request. Folding a process capability into a stored row would
   * invite somebody to persist it.
   */
  /**
   * ADR-151 — the last fifteen minutes. Sits here rather than on the dashboard route because
   * this file is the operations surface and the dashboard's reads are bootstrap counts: one
   * answers "is the event configured", the other "is the event happening".
   */
  routes.get('/operations', async (c) => {
    requireSuperadmin(c);
    return c.json({ overview: await readOperationsOverview(c.get('db')) });
  });

  routes.get('/service-state', async (c) => {
    requireSuperadmin(c);
    return c.json({
      state: serviceStateView(await findServiceState(c.get('db'))),
      canRestart: isShutdownSupported(),
    });
  });

  routes.post('/service-state/pause-social', async (c) => {
    const session = requireSuperadmin(c);
    const state = await pauseSocial(c.get('db'), session.superadmin.id);
    return c.json({ state: serviceStateView(state) satisfies ServiceStateView });
  });

  routes.post('/service-state/resume-social', async (c) => {
    const session = requireSuperadmin(c);
    const state = await resumeSocial(c.get('db'), session.superadmin.id);
    return c.json({ state: serviceStateView(state) satisfies ServiceStateView });
  });

  /**
   * 202, not 200: the process is still alive when this answers, and has to be — the
   * response must reach the browser before the socket dies with the process. `index.ts`
   * schedules the exit a moment later for exactly that reason.
   *
   * There is no "shut down and stay down" here. Under supervisord every exit is a restart
   * (ADR-043), so the honest name for this button is Restart, and a superadmin who wants
   * the event genuinely offline wants `docker compose stop`, at a keyboard, on purpose.
   */
  routes.post('/system/restart', async (c) => {
    const session = requireSuperadmin(c);
    const accepted = requestShutdown(`superadmin ${session.superadmin.username}`);
    if (!accepted) return c.json({ error: { message: messages.restartUnavailable } }, 503);
    return c.json({ restarting: true, message: messages.restartScheduled }, 202);
  });

  registerStationOffline(routes);
  registerScreenKeys(routes);
  registerSystemReset(routes);

  return routes;
}

/**
 * ADR-307 — the system reset, behind the strongest guard in the console.
 *
 * Two proofs, both checked against the server's own records: the acting
 * superadmin's passcode, re-entered (a signed-in console left open on a desk
 * must not be enough), and the exact confirmation the challenge route minted
 * for this attempt — `DELETE` plus a random ten characters. Asking for the
 * challenge is a separate call so the code on screen is the server's, never
 * the client's invention; every attempt spends the challenge, so neither
 * proof can be ground through by repetition.
 */
function registerSystemReset(routes: Hono<AppBindings>): void {
  routes.post('/system/reset/challenge', async (c) => {
    const session = requireSuperadmin(c);
    return c.json(issueResetChallenge(session.superadmin.id));
  });

  routes.post('/system/reset', async (c) => {
    const session = requireSuperadmin(c);
    const body = await readBody(c, systemResetRequestSchema);
    const expected = consumeResetChallenge(session.superadmin.id);
    if (expected === null) throw badRequest(messages.resetChallengeExpired, 'confirmation');
    if (body.confirmation !== expected) {
      throw badRequest(messages.resetConfirmationMismatch, 'confirmation');
    }
    if (body.passcode !== session.superadmin.passcode) {
      throw forbidden(messages.resetPasscodeRejected);
    }
    const counts = await resetEventData(c.get('db'), session.sessionId);
    return c.json({
      reset: { ...counts, resetAt: new Date().toISOString() } satisfies SystemResetView,
    });
  });
}

/**
 * ADR-147 — the switch that decides whether facilitator phones keep a copy of the app shell.
 *
 * Two named routes rather than one taking a boolean, matching the pause above: a caller
 * reading `POST /service-state/station-offline` with `{enabled:false}` in a log cannot tell
 * at a glance what was turned off, and this is a switch people will read logs about.
 *
 * Superadmin-only, like everything else on this page — but note the *read* of the resulting
 * state is public (`GET /api/app-shell-policy`), because the phone that has to obey it may
 * not be signed in yet. The asymmetry is deliberate and is the whole mechanism: anybody may
 * learn the policy, one person may change it.
 */
function registerStationOffline(routes: Hono<AppBindings>): void {
  routes.post('/service-state/enable-station-offline', async (c) => {
    const session = requireSuperadmin(c);
    const state = await enableStationOffline(c.get('db'), session.superadmin.id);
    return c.json({ state: serviceStateView(state) satisfies ServiceStateView });
  });

  routes.post('/service-state/disable-station-offline', async (c) => {
    const session = requireSuperadmin(c);
    const state = await disableStationOffline(c.get('db'), session.superadmin.id);
    return c.json({ state: serviceStateView(state) satisfies ServiceStateView });
  });
}

/**
 * ADR-140 — the hall screen's keys live on the operations page, next to the pause and the
 * restart, because they are the same kind of control: something an operator reaches for when
 * the room is not doing what it should.
 */
function registerScreenKeys(routes: Hono<AppBindings>): void {
  routes.get('/screen-keys', async (c) => {
    requireSuperadmin(c);
    return c.json({ items: (await listScreenKeys(c.get('db'))).map(screenKeyView) });
  });

  /**
   * The only response in the app that carries a live credential, and the only one that ever
   * will: the token is shown once, with the URL built around it, and is unrecoverable
   * afterwards. Losing it costs one revoke and one create — which is cheaper than a list page
   * that hands out every projector key in the building to anybody who glances at the laptop.
   */
  routes.post('/screen-keys', async (c) => {
    const session = requireSuperadmin(c);
    const body = await c.req
      .json<{ label?: unknown; enabledScenes?: unknown }>()
      .catch(() => ({ label: undefined, enabledScenes: undefined }));
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (label === '' || label.length > SCREEN_KEY_LABEL_MAX) {
      throw badRequest(messages.screenKeyLabelRequired, 'label');
    }
    const row = await createScreenKey(c.get('db'), {
      label,
      superadminId: session.superadmin.id,
      enabledScenes: readScenes(body.enabledScenes),
    });
    return c.json({ screenKey: screenKeyView(row), token: row.token }, 201);
  });

  /**
   * ADR-160 — change what an existing screen shows, without touching the projector.
   *
   * Scenes only, and that is the organiser's decision rather than an omission: a key's name
   * is its identity in the revoke list and in "what was projecting that day", so a screen
   * that moves rooms gets a new key instead of a renamed one.
   *
   * PATCH rather than PUT because the row has plenty this does not touch, and the body is
   * the whole scene set rather than a diff — a checklist is naturally read as a set, and a
   * diff would need an answer for "the superadmin and a colleague both ticked one box".
   */
  routes.patch('/screen-keys/:screenKeyId/scenes', async (c) => {
    requireSuperadmin(c);
    const body = await c.req
      .json<{ enabledScenes?: unknown }>()
      .catch(() => ({ enabledScenes: undefined }));
    const updated = await setScreenKeyScenes(c.get('db'), {
      id: c.req.param('screenKeyId'),
      enabledScenes: readScenes(body.enabledScenes, { required: true }),
    });
    // Null is "no LIVE key by that id" — never existed, or revoked. The caller's next move
    // is the same either way, so they get the same answer.
    if (!updated) throw notFound(messages.notFound);
    return c.json({ screenKey: screenKeyView(updated) });
  });

  routes.post('/screen-keys/:screenKeyId/revoke', async (c) => {
    requireSuperadmin(c);
    const revoked = await invalidateScreenKey(c.get('db'), c.req.param('screenKeyId'));
    if (!revoked) throw notFound(messages.notFound);
    return c.json({ screenKey: screenKeyView(revoked) });
  });
}

/**
 * ADR-160 — read a scene set off the wire, refusing the two ways it can be wrong.
 *
 * An unknown id is rejected rather than dropped. Silently filtering would let a typo or a
 * stale client save a key with fewer scenes than the superadmin ticked, and they would find
 * out from a wall in front of an audience.
 *
 * Omitting the field entirely is only allowed at creation, where it means "all of them" —
 * the behaviour every key had before this existed. On the edit route it is required, because
 * a PATCH that silently reset a carefully-chosen screen to everything would be the worst
 * possible reading of an empty body.
 */
function readScenes(value: unknown, options: { required?: boolean } = {}): ScreenSceneId[] {
  if (value === undefined || value === null) {
    if (options.required) throw badRequest(messages.screenKeyNeedsAScene, 'enabledScenes');
    return [...ALL_SCREEN_SCENE_IDS];
  }
  if (!Array.isArray(value)) throw badRequest(messages.screenKeyNeedsAScene, 'enabledScenes');
  for (const entry of value) {
    if (!isScreenSceneId(entry)) throw badRequest(messages.screenKeySceneUnknown, 'enabledScenes');
  }
  // De-duplicated, then ordered by the canonical running order, so two keys ticked in a
  // different sequence are stored identically and the console never renders them shuffled.
  const chosen = new Set(value as ScreenSceneId[]);
  const ordered = ALL_SCREEN_SCENE_IDS.filter((id) => chosen.has(id));
  if (ordered.length === 0) throw badRequest(messages.screenKeyNeedsAScene, 'enabledScenes');
  return [...ordered];
}
