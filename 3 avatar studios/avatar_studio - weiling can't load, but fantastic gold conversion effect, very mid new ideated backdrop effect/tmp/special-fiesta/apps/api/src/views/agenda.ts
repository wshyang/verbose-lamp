import type { AgendaItemView, AgendaView } from '@psd/contracts';
import type { AgendaItemRow } from '../db/schema/index.js';

/**
 * ADR-177 — the programme on the wire, and the derivation of "now" and "next".
 */

export function agendaItemView(row: AgendaItemRow): AgendaItemView {
  return {
    id: row.id,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    title: row.title,
    location: row.location,
    detail: row.detail,
    isActive: row.isActive,
  };
}

/**
 * Which item is happening, and which is up next, at `asOf`.
 *
 * Derived on every read and never stored, for the same reason as the champion bonus (ADR-006)
 * and the passport (ADR-176): a stored `is_current` flag is only true until the next minute, and
 * keeping it true needs a scheduler this app does not have and should not grow one for.
 *
 * Three rules, each of which is a decision rather than an implementation detail:
 *
 *   - **A cancelled item is never now or next.** It stays in the list, struck through, because
 *     somebody who memorised it needs to see that it is cancelled — but it must not be what the
 *     screen says is happening.
 *   - **A timeless item is never now or next.** "Have an early lunch before you leave" has no
 *     clock on it and cannot be the thing you are in the middle of.
 *   - **An item with no end is a moment, not a block.** "1.45pm, meet at the pavilion" is never
 *     "now" — the instant passes — so it falls through to being "next" until it is in the past.
 *     Treating a null end as "runs until the following item" was the tempting alternative and is
 *     wrong: the gap after a moment is not part of it.
 */
export function agendaView(rows: readonly AgendaItemRow[], asOf: Date): AgendaView {
  const live = rows.filter((row) => row.isActive && row.startsAt !== null);
  const current = live.find(
    (row) => row.endsAt !== null && row.startsAt! <= asOf && row.endsAt > asOf,
  );
  const upcoming = live.find((row) => row.startsAt! > asOf);
  return {
    items: rows.map(agendaItemView),
    nowId: current?.id ?? null,
    nextId: upcoming?.id ?? null,
    asOf: asOf.toISOString(),
  };
}
