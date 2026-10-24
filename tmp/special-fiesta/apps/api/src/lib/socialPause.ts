import { messages } from '@psd/contracts';
import type { MiddlewareHandler } from 'hono';
import { isSocialPaused } from '../db/entities/serviceState.js';
import type { AppBindings } from './session.js';

/**
 * ADR-118 — load shedding for the two surfaces that cost the most and score nothing.
 *
 * **It sheds by actor, not by path.** The traffic worth shedding is three hundred phones
 * holding SSE connections open and pulling photo bytes; it is never the two people in the
 * admin console. Gating the path alone would have taken the gallery moderation queue
 * (`/api/gallery/moderation`, `/photos/:id/hide`) down with it — the superadmin loses the
 * ability to deal with a reported photo at precisely the moment they have decided the
 * event is under strain. So staff and superadmin sessions pass through untouched.
 *
 * 503 rather than 404: the room still exists, it is closed. A 404 would tell the phone to
 * forget the route, and tells a reader of the logs that something is broken.
 */
export function refuseWhileSocialPaused(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const actor = c.get('actor');
    if (actor && actor.type !== 'participant') return next();
    if (!(await isSocialPaused(c.get('db')))) return next();
    return c.json({ error: { message: messages.socialPaused } }, 503);
  };
}
