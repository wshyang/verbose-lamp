import { eq, sql } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { AGENDA_TAG, cachedRead, invalidateTag } from '../../lib/cache.js';
import { newId } from '../ids.js';
import { agendaItems } from '../schema/index.js';
import type { AgendaItemRow } from '../schema/index.js';
import { firstOrNull, firstOrThrow } from '../rows.js';

/**
 * ADR-177 — the day's programme.
 *
 * The read is identical for every participant — there is no per-reader state on an agenda, the
 * way there is none on an announcement (ADR-074) — so it is worth caching once for the whole
 * event rather than once per phone. Three hundred devices opening the tab at 2.29pm share one
 * query per TTL window.
 *
 * The TTL is longer than the announcement feed's because a programme changes a handful of times
 * in an afternoon, not continuously, and every change invalidates the tag anyway.
 */

export interface AgendaItemWrite {
  startsAt: Date | null;
  endsAt: Date | null;
  title: string;
  location: string | null;
  detail: string | null;
}

const AGENDA_CACHE_TTL_MS = 15_000;

/**
 * Sort order for every read: by start time, then by hand, then by insertion.
 *
 * NULLS FIRST is the whole reason this is written out rather than left to `orderBy` — a timeless
 * item ("before departure: have an early lunch") belongs at the top of the day, and Postgres
 * defaults to NULLS LAST on an ascending sort, which would file it after the group photo.
 *
 * ADR-190 — `display_order` sits BETWEEN the two, which is what confines hand-ordering to the
 * items that have no clock. Anything with a `starts_at` has already been placed by the first
 * term and never reaches the second, so the ordering a participant reads still cannot disagree
 * with the time printed next to it. NULLS LAST so an item nobody has moved keeps its old place
 * below the ones that have been arranged, rather than jumping to the top of the day.
 */
const AGENDA_ORDER = sql`${agendaItems.startsAt} ASC NULLS FIRST,
  ${agendaItems.displayOrder} ASC NULLS LAST, ${agendaItems.createdAt} ASC`;

export async function createAgendaItem(
  db: Executor,
  input: AgendaItemWrite,
): Promise<AgendaItemRow> {
  const row = firstOrThrow(
    await db
      .insert(agendaItems)
      .values({ id: newId(), ...input })
      .returning(),
    'Agenda item insert returned no row',
  );
  invalidateTag(AGENDA_TAG);
  return row;
}

export async function updateAgendaItem(
  db: Executor,
  id: string,
  input: AgendaItemWrite,
): Promise<AgendaItemRow | null> {
  const row = firstOrNull(
    await db.update(agendaItems).set(input).where(eq(agendaItems.id, id)).returning(),
  );
  if (row) invalidateTag(AGENDA_TAG);
  return row;
}

/*
 * Two named calls rather than one taking a boolean, matching `enableCourt`/`disableCourt`.
 * A call site that reads `setAgendaItemActive(db, id, flag)` hides which way it went — which is
 * also what `npm run standards`' flag-parameter rule is there to stop.
 */
export async function activateAgendaItem(db: Executor, id: string): Promise<AgendaItemRow | null> {
  const row = firstOrNull(
    await db
      .update(agendaItems)
      .set({ isActive: true })
      .where(eq(agendaItems.id, id))
      .returning(),
  );
  if (row) invalidateTag(AGENDA_TAG);
  return row;
}

/**
 * Cancelling an item. There is deliberately **no hard delete on this table.**
 *
 * The first draft had one, on the argument that "cancelled" and "typed in by mistake" are
 * different acts deserving different verbs. `npm run standards` rejected it, and the rule is
 * right: this repository invalidates rows, it does not remove them. An item entered in error is
 * rare, costs one struck-through line until somebody edits its title, and is not worth an
 * irreversible operation on a table a superadmin edits from a phone in a hurry.
 */
export async function deactivateAgendaItem(
  db: Executor,
  id: string,
): Promise<AgendaItemRow | null> {
  const row = firstOrNull(
    await db
      .update(agendaItems)
      .set({ isActive: false })
      .where(eq(agendaItems.id, id))
      .returning(),
  );
  if (row) invalidateTag(AGENDA_TAG);
  return row;
}

export async function findAgendaItemById(
  db: Executor,
  id: string,
): Promise<AgendaItemRow | null> {
  return firstOrNull(await db.select().from(agendaItems).where(eq(agendaItems.id, id)));
}

/**
 * ADR-190 — move one timeless item one place up or down.
 *
 * Only the timeless ones, and the refusal is the feature: an item with a clock is placed by its
 * clock, so "move it up" could only mean "change the time", which is a different act with a
 * different input already on the form. Asking for it here is a mistake worth a 400 rather than
 * a surprise rewrite of the programme.
 *
 * Every timeless item is renumbered densely from zero on each move. That is more writes than
 * swapping a pair, and it is worth it: it means a row that arrived with a NULL order, or a gap
 * left by an earlier edit, cannot accumulate into an order nobody can reason about.
 */
export async function moveAgendaItem(
  db: Executor,
  input: { id: string; direction: 'up' | 'down' },
): Promise<'moved' | 'timed' | 'missing' | 'edge'> {
  const timeless = (await db.select().from(agendaItems).orderBy(AGENDA_ORDER)).filter(
    (item) => item.startsAt === null,
  );
  const from = timeless.findIndex((item) => item.id === input.id);
  if (from === -1) return (await findAgendaItemById(db, input.id)) ? 'timed' : 'missing';
  const to = input.direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= timeless.length) return 'edge';

  const reordered = [...timeless];
  const [moved] = reordered.splice(from, 1);
  if (moved) reordered.splice(to, 0, moved);
  for (const [position, item] of reordered.entries()) {
    await db
      .update(agendaItems)
      .set({ displayOrder: position })
      .where(eq(agendaItems.id, item.id));
  }
  invalidateTag(AGENDA_TAG);
  return 'moved';
}

/** Every item including the cancelled ones — the superadmin console's read. */
export async function listAllAgendaItems(db: Executor): Promise<readonly AgendaItemRow[]> {
  return db.select().from(agendaItems).orderBy(AGENDA_ORDER);
}

async function readProgramme(db: Executor): Promise<readonly AgendaItemRow[]> {
  return db.select().from(agendaItems).orderBy(AGENDA_ORDER);
}

/**
 * The participant read.
 *
 * Note that it returns cancelled items too, rather than filtering them out. That is the point of
 * `is_active` being a flag and not a delete: somebody who memorised a 3pm item has to be able to
 * see that it is cancelled. The view layer strikes it through; hiding it here would make the item
 * simply vanish, which is the failure this models around.
 */
export const readAgenda = cachedRead(readProgramme, {
  name: 'agenda.programme',
  ttlMs: AGENDA_CACHE_TTL_MS,
  tags: [AGENDA_TAG],
});
