import { Hono } from 'hono';
import type { ScreenProfileView } from '@psd/contracts';
import { forbidden } from '../lib/http.js';
import { requireViewer, type AppBindings } from '../lib/session.js';
import { statusStreamResponse } from './stream.js';

/**
 * ADR-121 — the status stream, mounted on its own prefix rather than under `/api/chat`.
 *
 * Participant-or-screen. Every frame it carries used to be addressed to a participant: staff
 * surfaces have no nav dots to light and no team to be due on a court, and a facilitator
 * asking for it is not an error anybody needs to see — they simply have no stream to open.
 * ADR-140 added the one reader that is neither: the hall screen, whose entire job is the
 * global state this already publishes. A staff actor still gets nothing, because a console
 * still has nothing to light; a screen gets the global topic and never a team frame.
 *
 * Deliberately NOT behind the ADR-118 social pause. Pausing sheds chat and photos; being told
 * that your team is needed at a court is the opposite of non-essential, and the pause itself
 * is most useful precisely when the event is busiest.
 */
export function statusRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.get('/stream', (c) => {
    const viewer = requireViewer(c);
    if (viewer.type === 'participant') return statusStreamResponse(c, viewer.participant);
    if (viewer.type === 'screen') return statusStreamResponse(c, null);
    throw forbidden();
  });

  /**
   * ADR-160 — the projector's only question about itself: what am I, and what may I show?
   *
   * A screen has never had a "who am I" read, because until now there was nothing about a
   * key that changed what appeared on the wall. The scene set is a property of the KEY, and
   * it has to arrive here rather than at pairing time: a projector runs for eight hours and
   * nobody is walking to the booth to reload it after a change. The hook polls this, so a
   * tick in the console reaches the hall on the next cycle.
   *
   * Screens only. An actor asking has no screen to configure, and answering with somebody
   * else's key would be a quiet way to leak the layout of the building.
   */
  routes.get('/screen', (c) => {
    const viewer = requireViewer(c);
    if (viewer.type !== 'screen') throw forbidden();
    const profile: ScreenProfileView = {
      label: viewer.label,
      enabledScenes: viewer.enabledScenes,
    };
    return c.json(profile);
  });

  return routes;
}
