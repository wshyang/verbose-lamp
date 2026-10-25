import { readItem, removeItem, writeItem } from './localStore.js';

/**
 * ADR-133 (B4) — the last up-soon fixture this browser has already announced.
 *
 * **The floor exists because of ADR-118's restart button.** When the API restarts, every phone
 * reconnects and opens with a snapshot, and the up-soon watcher re-states the window to every
 * team in it. Without a floor that is a toast on every phone in the building at once, for news
 * every one of them already had — which is how an alert stops being believed. The same thing
 * happens on a quieter scale all afternoon: a backgrounded phone returning to the foreground
 * rebuilds its socket and gets a fresh snapshot (ADR-105).
 *
 * **Its own module, not a field in `announcementStore`.** `check-standards.mjs`'s
 * `storage-ownership` rule requires each key to sit behind the module that owns its meaning,
 * and these two mean different things: the announcement floor is a *reading position* in a
 * growing list, this is *the one fixture already shouted about*.
 *
 * **An id rather than a timestamp**, for ADR-082's reason unchanged: fixture ids are UUIDv7, so
 * comparing them as strings is comparing the server's own ordering, and a beach phone with a
 * wrong clock cannot mis-silence a toast.
 *
 * **Forward only.** A reconnect's snapshot and a live frame can arrive in either order, and the
 * poll fallback can answer with a picture already superseded. Letting the floor move backwards
 * would re-toast a fixture this phone has announced — the precise failure the floor is for.
 */

const KEY = 'psd.upsoon.floor.v1';

interface StoredFloor {
  fixtureId: string | null;
}

/**
 * Anything but the expected shape is absent rather than trusted. The failure modes point in
 * opposite directions and the safer one is chosen on purpose: a corrupt value read as a *floor*
 * would silence the toast for the rest of the day, while read as *absent* it costs at worst one
 * duplicate toast. Missing the call to a court is worse than hearing it twice.
 */
function parse(raw: string | null): StoredFloor | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { fixtureId } = parsed as { fixtureId?: unknown };
    if (fixtureId === null) return { fixtureId: null };
    return typeof fixtureId === 'string' ? { fixtureId } : null;
  } catch {
    return null;
  }
}

/** The fixture already announced on this browser, or null if none has been. */
export function readUpSoonFloor(): string | null {
  return parse(readItem(KEY))?.fixtureId ?? null;
}

/**
 * Should this fixture be announced?
 *
 * Strictly greater, so the fixture at the floor is the one already announced. A null fixture is
 * never announced: it is the frame that says the window has been LEFT, which moves the LED and
 * has nothing to shout about.
 */
export function shouldAnnounceUpSoon(fixtureId: string | null, floor: string | null): boolean {
  if (fixtureId === null) return false;
  return floor === null || fixtureId > floor;
}

/**
 * Records a fixture as announced and returns the new floor.
 *
 * `current` is passed in rather than re-read so the floor still advances in memory on a browser
 * that refuses writes — a private-mode Safari gets one toast per fixture per page load instead
 * of one per frame, which is the right degradation.
 */
export function advanceUpSoonFloor(fixtureId: string, current: string | null): string | null {
  const next = current !== null && current > fixtureId ? current : fixtureId;
  writeItem(KEY, JSON.stringify({ fixtureId: next } satisfies StoredFloor));
  return next;
}

/** Signing out forgets it, so the next participant on a borrowed phone hears their own call. */
export function forgetUpSoonFloor(): void {
  removeItem(KEY);
}
