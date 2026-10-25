import { createAnnouncementRequestSchema } from '@psd/contracts';
import { Hono } from 'hono';
import {
  createAnnouncement,
  invalidateAnnouncement,
  listAnnouncements,
} from '../db/entities/index.js';
import { notFound, readBody, requireParam } from '../lib/http.js';
import { requireSuperadmin, type AppBindings } from '../lib/session.js';
import { publishAnnouncement, publishAnnouncementRetracted } from '../lib/statusBus.js';
import { announcementView } from '../views/announcements.js';

/**
 * Staff announcements (ADR-074) — superadmin only.
 *
 * Deliberately not a facilitator capability. A court marshal announcing to three hundred people is a
 * lot of reach with no undo beyond a retraction after the fact, and the earlier version of this idea
 * — canned messages for facilitators — existed only to serve a seeded demo line rather than a need
 * anybody stated. Facilitators keep their three spartan tabs.
 *
 * There is no rate limiter here. The global chat has one because a held-down send key is unbounded
 * INSERTs from any of three hundred phones; this route is reachable by the handful of people who hold
 * the superadmin passcode, on a laptop, and throttling them would only get in the way during the one
 * moment an announcement matters.
 */
export function superadminAnnouncementRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.get('/announcements', async (c) => {
    requireSuperadmin(c);
    const rows = await listAnnouncements(c.get('db'));
    return c.json({ announcements: rows.map(announcementView) });
  });

  routes.post('/announcements', async (c) => {
    const actor = requireSuperadmin(c);
    const { body } = await readBody(c, createAnnouncementRequestSchema);
    const row = await createAnnouncement(c.get('db'), {
      superadminId: actor.superadmin.id,
      authorLabelSnapshot: actor.superadmin.username,
      body,
    });
    const view = announcementView(row);
    // ADR-121 — the whole announcement travels on the frame. A phone must never be told to go
    // and fetch something: three hundred of them fetching at once is the stampede the stream
    // exists to avoid, and the row is already in hand here.
    publishAnnouncement(view);
    return c.json({ announcement: view }, 201);
  });

  /** Retracting is a soft hide: the row stays for the audit trail and drops out of every read. */
  routes.post('/announcements/:announcementId/retract', async (c) => {
    requireSuperadmin(c);
    const row = await invalidateAnnouncement(c.get('db'), requireParam(c, 'announcementId'));
    if (!row) throw notFound();
    // Published after the row comes back, so a retraction that changed nothing — a repeat, an
    // id that never existed — tells nobody anything.
    publishAnnouncementRetracted(row.id);
    return c.json({ announcement: announcementView(row) });
  });

  return routes;
}
