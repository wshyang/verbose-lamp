import {
  agendaItemRequestSchema,
  messages,
  moveAgendaItemRequestSchema,
  toggleRequestSchema,
} from '@psd/contracts';
import { Hono } from 'hono';
import type { z } from 'zod';
import {
  activateAgendaItem,
  createAgendaItem,
  deactivateAgendaItem,
  listAllAgendaItems,
  moveAgendaItem,
  updateAgendaItem,
  type AgendaItemWrite,
} from '../db/entities/index.js';
import { badRequest, notFound, readBody, requireParam } from '../lib/http.js';
import { requireSuperadmin, type AppBindings } from '../lib/session.js';
import { agendaItemView } from '../views/agenda.js';

/**
 * ADR-177 — the day's programme, maintained by a superadmin.
 *
 * Superadmin only, matching the court and activity toggles it is modelled on. A facilitator
 * rewriting the run sheet mid-afternoon is reach with no undo, and the person who owns the
 * programme is the person holding the console.
 *
 * There is no DELETE. Cancelling is `PATCH .../active` with `isEnabled: false`, and the item
 * stays on the page struck through — somebody who memorised a 3pm item has to see that it is off
 * rather than find it silently missing. An item typed in by mistake is edited or left cancelled;
 * this repository invalidates rows, it does not remove them, and `npm run standards` enforces
 * that rather than leaving it to taste.
 */
export function superadminAgendaRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.get('/agenda', async (c) => {
    requireSuperadmin(c);
    const rows = await listAllAgendaItems(c.get('db'));
    return c.json({ items: rows.map(agendaItemView) });
  });

  routes.post('/agenda', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, agendaItemRequestSchema);
    const row = await createAgendaItem(c.get('db'), writeFrom(body));
    return c.json({ item: agendaItemView(row) }, 201);
  });

  routes.patch('/agenda/:itemId', async (c) => {
    requireSuperadmin(c);
    const itemId = requireParam(c, 'itemId');
    const body = await readBody(c, agendaItemRequestSchema);
    const row = await updateAgendaItem(c.get('db'), itemId, writeFrom(body));
    if (!row) throw notFound(messages.agendaItemNotFound);
    return c.json({ item: agendaItemView(row) });
  });

  /*
   * ADR-190 — the one write that is about position rather than content, so it answers with the
   * whole list: a move is only meaningful relative to its neighbours, and returning the single
   * moved row would leave the console to guess where everything else ended up.
   */
  routes.post('/agenda/:itemId/move', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, moveAgendaItemRequestSchema);
    const outcome = await moveAgendaItem(c.get('db'), {
      id: requireParam(c, 'itemId'),
      direction: body.direction,
    });
    if (outcome === 'missing') throw notFound(messages.agendaItemNotFound);
    if (outcome === 'timed') throw badRequest(messages.agendaItemNotTimeless);
    const rows = await listAllAgendaItems(c.get('db'));
    return c.json({ items: rows.map(agendaItemView) });
  });

  routes.patch('/agenda/:itemId/active', async (c) => {
    requireSuperadmin(c);
    const itemId = requireParam(c, 'itemId');
    const body = await readBody(c, toggleRequestSchema);
    const row = body.isEnabled
      ? await activateAgendaItem(c.get('db'), itemId)
      : await deactivateAgendaItem(c.get('db'), itemId);
    if (!row) throw notFound(messages.agendaItemNotFound);
    return c.json({ item: agendaItemView(row) });
  });

  return routes;
}

/**
 * The wire shape is nullish (absent or null); the column is nullable. `?? null` collapses the
 * two, so an omitted field clears rather than silently keeping the old value — which is what an
 * edit form that can empty a box has to mean.
 */
function writeFrom(body: z.infer<typeof agendaItemRequestSchema>): AgendaItemWrite {
  return {
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    title: body.title,
    location: body.location ?? null,
    detail: body.detail ?? null,
  };
}
