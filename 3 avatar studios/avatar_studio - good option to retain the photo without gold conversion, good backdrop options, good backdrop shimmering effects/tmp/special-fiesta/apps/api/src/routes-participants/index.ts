import {
  AVATAR_SPRITE_ID_PATTERN,
  clusterCodeSchema,
  messages,
  updateAvatarRequestSchema,
} from '@psd/contracts';
import { Hono } from 'hono';
import {
  findActiveMembership,
  listAvatarSprites,
  listParticipantIdentities,
  listNicknamesInCluster,
  listOpenClusters,
  listActivities,
  listPassportCompletionCounts,
  listScansForParticipant,
  readParticipantTotals,
  updateParticipantAvatar,
  readAgenda,
} from '../db/entities/index.js';
import { readAlertsFor } from '../lib/alerts.js';
import { assertClusterExists } from '../lib/clusterGuards.js';
import type { Executor } from '../db/client.js';
import { CLUSTER_TAG, cachedRead } from '../lib/cache.js';
import type { AppBindings } from '../lib/session.js';
import { requireAnyActor, requireParticipant } from '../lib/session.js';
import { scanView } from '../views/fringe.js';
import { passportView } from '../views/passport.js';
import { participantTotalsView, participantView } from '../views/participants.js';
import { agendaView } from '../views/agenda.js';
import { badRequest, readBody, respondCached } from '../lib/http.js';
import { required } from '../db/rows.js';

/** One request carries a whole leaderboard's worth of faces, and no more. */
const AVATAR_SPRITE_BATCH = 60;
/**
 * ADR-202 — one page of a chat room is fifty messages, so sixty covers the worst case of a
 * page in which nobody speaks twice, with room to spare. Anything beyond it is a second
 * request, which is what the client's store already does for sprites.
 */
const IDENTITY_BATCH = 60;
/** Anything that is not a UUID cannot be a participant id, so it never reaches the database. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ADR-038 — the sixteen clusters are seeded once and never edited on the day, yet every
 * phone that opens the signup form asked the table for them. A minute of memory is
 * indistinguishable from fresh here and costs the database sixteen rows a minute, total.
 */
const readClusterRows = cachedRead(
  async (db: Executor) => listOpenClusters(db),
  // ADR-172 — tagged so a catalogue edit takes effect at once rather than within the minute.
  { name: 'clusters.catalogue', ttlMs: 60_000, tags: [CLUSTER_TAG] },
);

/** S3/S4/S6 — the participant's own data. Everything here is scoped to the session. */
/**
 * ADR-063 — what needs the participant's attention, as booleans rather than counts.
 *
 * Its own function because the nav dot is drawn on every surface, so it must be answerable without
 * loading a profile or a roster. One indexed existence probe per call, and after that the SSE stream
 * keeps the dot current, so there is nothing to poll — which matters because every authenticated
 * request already performs two writes before the handler runs.
 *
 * A participant with no team has nothing to be alerted about, and that is not an error.
 */
function mountAlerts(routes: Hono<AppBindings>): void {
  routes.get('/me/alerts', async (c) => {
    const actor = requireParticipant(c);
    /*
     * ADR-121 — the same answer the status stream opens with, from the same function. This
     * route is now the fallback rather than the primary path: a phone whose stream is live
     * stops polling it, and a phone without `EventSource` (or behind something that eats
     * streams) still works exactly as it did.
     */
    const db = c.get('db');
    const membership = await findActiveMembership(db, actor.participant.id);
    /*
     * ADR-135 — the fallback poll, answered conditionally. This is the surface where a 304
     * pays best in proportion: the body is small, and for most of the afternoon every byte of
     * it is the same four nulls and an empty list.
     */
    return respondCached(c, await readAlertsFor(db, membership));
  });
}

/**
 * The two reads a phone makes before it has a session: the cluster catalogue the sign-up form
 * is built from, and ADR-164's way back for somebody who has forgotten which nickname they
 * chose.
 *
 * **The nickname finder exists to prevent a write, not to serve a read.** A duplicate sign-up cannot be
 * detected (identity is nickname + PIN and nothing else) and cannot be undone (`no-hard-delete`,
 * and nothing merges), so the only place it can be addressed at all is the few seconds before
 * it happens — when somebody who is already signed up is standing in front of the sign-up form
 * because they cannot remember what they called themselves.
 *
 * **Anonymous on purpose**, like the catalogue beside it: the only person who needs it is one
 * who cannot sign in. A nickname is already shown to every participant on the leaderboard, in
 * chat and on a team roster, so this publishes nothing that the event does not already project
 * onto a wall — and the organiser ruled on exactly that question before this was built.
 *
 * The cluster is required rather than optional. Not as a secret — it is a dropdown on the
 * sign-up form — but because an answer of "every nickname at the event" is a list nobody can
 * read down, and the cluster is the one fact a participant has certainly not forgotten.
 */
function mountGuestReads(routes: Hono<AppBindings>): void {
  // The cluster catalogue must load before signup (fds.md §7.1 step 5).
  routes.get('/clusters', async (c) => {
    /*
     * ADR-172 — the table is the catalogue now, so this returns what it holds instead of
     * walking `CLUSTER_CODES` and looking each one up. The old shape could not have worked
     * once the list was editable: a cluster added today is absent from the constant, so it
     * would have been dropped silently, and a retired one was still offered.
     */
    const rows = await readClusterRows(c.get('db'));
    const items = rows.map((row) => ({ code: row.code, displayName: row.displayName }));
    return c.json({ items });
  });

  /*
   * ADR-177 — the day's programme.
   *
   * A guest read, alongside the cluster catalogue, rather than behind a session. Two reasons:
   * the run sheet is printed on a poster by the registration tent and is in no sense private,
   * and somebody checking what time to turn up has not necessarily signed in yet. Making the
   * one screen that answers "where should I be" require an account would be a strange place to
   * put a gate.
   *
   * `now` and `next` are derived here, from the server's clock, so three hundred phones with
   * three hundred slightly different times all agree about what is happening.
   */
  routes.get('/agenda', async (c) => {
    const rows = await readAgenda(c.get('db'));
    return c.json(agendaView(rows, new Date()));
  });

  routes.get('/participants/nicknames', async (c) => {
    const parsed = clusterCodeSchema.safeParse(c.req.query('clusterCode'));
    if (!parsed.success) throw badRequest(messages.clusterRequired, 'clusterCode');
    /*
     * ADR-172 — the schema stopped being a `z.enum`, so it can no longer tell a real cluster
     * from a well-formed string. Without this, `?clusterCode=NOPE` answered 200 and an empty
     * list, which reads as "nobody from there" rather than "there is no such place".
     */
    await assertClusterExists(c, parsed.data);
    return c.json({ nicknames: await listNicknamesInCluster(c.get('db'), parsed.data) });
  });
}

/**
 * ADR-202 — its own mount, like the alerts and the guest reads above it, because the
 * route table is a 50-line function and this route is mostly the argument for why it is
 * allowed to exist at all.
 */
function mountIdentities(routes: Hono<AppBindings>): void {
/**
 * ADR-202 — the identities behind a set of participant ids.
 *
 * Sibling to `/avatars` above and justified the same way: these are faces and nicknames
 * that already appear on the board, in a roster, or beside every line of the room the
 * caller is reading. What it adds over `/avatars` is the *drawn* half of an avatar —
 * gender, variant and look — which a sprite id cannot answer because most participants
 * have no photo at all.
 *
 * Asked for by id, never listed: there is no "everyone" here. A caller can only learn
 * about people it could already name, which is the same bargain `/avatars` strikes.
 */
routes.get('/participants/identities', async (c) => {
  requireAnyActor(c);
  const asked = (c.req.query('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => UUID_PATTERN.test(id))
    .slice(0, IDENTITY_BATCH);
  return c.json({ items: await listParticipantIdentities(c.get('db'), asked) });
});
}

export function participantRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  /**
   * ADR-035 — the sprite bodies for a set of ids, asked for once per browser.
   *
   * Any signed-in actor may read these: they are faces that already appear on the board
   * and the rosters that actor can see, and the id is a hash, so nothing can be
   * enumerated by guessing.
   */
  routes.get('/avatars', async (c) => {
    requireAnyActor(c);
    const asked = (c.req.query('ids') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => AVATAR_SPRITE_ID_PATTERN.test(id))
      .slice(0, AVATAR_SPRITE_BATCH);
    const found = await listAvatarSprites(c.get('db'), asked);
    return c.json({ items: [...found].map(([id, sprite]) => ({ id, sprite })) });
  });

  mountIdentities(routes);
  mountAlerts(routes);
  mountGuestReads(routes);

  routes.get('/me', async (c) => {
    const actor = requireParticipant(c);
    const totals = await readParticipantTotals(c.get('db'), actor.participant.id);
    return c.json({
      participant: participantView(actor.participant),
      totals: participantTotalsView(totals),
    });
  });

  // S6 #surf-my-scans — own scans only; another participant's id is not addressable here.
  routes.get('/me/scans', async (c) => {
    const actor = requireParticipant(c);
    const scans = await listScansForParticipant(c.get('db'), actor.participant.id);
    const totals = await readParticipantTotals(c.get('db'), actor.participant.id);
    return c.json({
      items: scans.map(scanView),
      totals: participantTotalsView(totals),
    });
  });

  // ADR-239 — the passport tab: every station the day has, and which of them this participant
  // has completed. Own data only: the session decides whose passport this is.
  routes.get('/me/passport', async (c) => {
    const actor = requireParticipant(c);
    const activities = await listActivities(c.get('db'));
    const completionCounts = await listPassportCompletionCounts(c.get('db'), actor.participant.id);
    return c.json(passportView({ activities, completionCounts }));
  });

  // S4 #surf-my-profile — a participant redraws their own avatar; nobody else's (ADR-021).
  routes.put('/me/avatar', async (c) => {
    const actor = requireParticipant(c);
    const body = await readBody(c, updateAvatarRequestSchema);
    const updated = await updateParticipantAvatar(c.get('db'), {
      participantId: actor.participant.id,
      ...body,
    });
    return c.json({ participant: participantView(required(updated, 'Participant')) });
  });

  return routes;
}
