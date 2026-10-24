import { readItem, removeItem, writeItem } from './localStore.js';

/**
 * ADR-082 — how far into the announcements this browser has already read.
 *
 * The module that owns `psd.announcements.floor.v1`, reaching the browser store only through
 * `localStore.ts` (ADR-009/019): that module is the one place that knows how the store misbehaves, and
 * a private-mode Safari that refuses writes must not take the toast down with it. When storage refuses,
 * the floor lasts for the life of the page — the toast returns on the next load, which is the correct
 * degradation for a message that mattered.
 *
 * **One value, not two.** "Ignore everything from before I signed in" and "ignore everything up to the
 * one I last dismissed" are the same statement — *ignore everything at or before this point* — so they
 * are one stored id with one comparison rather than two timestamps. It is seeded at sign-in to the
 * **second-newest** announcement, which is what makes the final announcement before sign-in stick while
 * everything older is ignored, and it advances to each announcement the reader dismisses.
 *
 * **An id rather than a time, deliberately.** Ids are UUIDv7, so comparing them as strings is comparing
 * the server's own ordering, and a beach phone whose clock is hours out cannot mis-hide a notice.
 * Recording "when I logged on" locally and comparing it against the server's `createdAt` would mix two
 * clocks for no gain. This is the trick ADR-046 already relies on for chat cursors.
 *
 * **Deliberately per-browser rather than per-participant on the server.** A row per reader per
 * announcement is state the server does not need to hold, and keeping it out means the live read is
 * identical for everybody and can be cached once for the whole event (ADR-074). The cost is that a
 * second phone shows the toast again, which for a notice is arguably right: being told twice beats
 * missing it.
 *
 * A high-water mark is also bounded by construction, which is why this replaced a list of dismissed ids
 * rather than joining it — that list came with pruning logic whose only job was to stop it growing for
 * the life of the device.
 */

const KEY = 'psd.announcements.floor.v1';

interface StoredFloor {
  floorId: string | null;
}

/**
 * Anything but the expected shape is treated as absent rather than trusted: this key is
 * hand-editable, and a malformed value must not hide every announcement for the rest of the day.
 */
function parse(raw: string | null): StoredFloor | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { floorId } = parsed as { floorId?: unknown };
    if (floorId === null) return { floorId: null };
    return typeof floorId === 'string' ? { floorId } : null;
  } catch {
    return null;
  }
}

/** The id at or before which announcements are ignored, or null to show everything live. */
export function readAnnouncementFloor(): string | null {
  return parse(readItem(KEY))?.floorId ?? null;
}

/**
 * Whether this browser has been seeded for the current sign-in.
 *
 * Distinct from "the floor is null", and the distinction is load-bearing: without it, a browser that
 * signed in while nothing had been announced would seed again on every poll, and an announcement made
 * *after* sign-in would be mistaken for one made before it and silently ignored.
 */
export function hasAnnouncementFloor(): boolean {
  return parse(readItem(KEY)) !== null;
}

function store(floorId: string | null): string | null {
  writeItem(KEY, JSON.stringify({ floorId } satisfies StoredFloor));
  return floorId;
}

/**
 * Seeds the floor from what was already live at sign-in, and returns it.
 *
 * The list arrives oldest first, so the second-to-last entry is the second-newest announcement: above
 * it sits exactly one, which is the final thing said before this reader arrived. Fewer than two live
 * means there is nothing to ignore and the floor is null — but the key is still written, so the browser
 * counts as seeded.
 */
export function seedAnnouncementFloor(live: readonly { id: string }[]): string | null {
  return store(live.at(-2)?.id ?? null);
}

/**
 * Advances the floor past an announcement the reader has dismissed, and returns the new floor.
 *
 * Forward only. Two tabs polling the same event can report positions out of order, and winding the
 * floor back would resurrect announcements this reader has already cleared. `current` is passed in
 * rather than re-read so the mark still advances in memory on a browser that refuses writes.
 */
export function advanceAnnouncementFloor(id: string, current: string | null): string | null {
  return store(current !== null && current > id ? current : id);
}

/**
 * Signing out forgets the floor, so the next participant on a shared phone seeds their own.
 *
 * The bug this prevents is ADR-064's, one feature over: the chat cursor was not cleared at sign-out, so
 * the next participant on a borrowed phone opened an empty room. An inherited floor would hide
 * announcements the new reader has never seen.
 */
export function forgetAnnouncementFloor(): void {
  removeItem(KEY);
}
