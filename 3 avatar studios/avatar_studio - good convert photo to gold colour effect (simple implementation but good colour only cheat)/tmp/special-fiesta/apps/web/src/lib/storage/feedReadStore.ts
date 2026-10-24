import { readItem, removeItem, writeItem } from './localStore.js';

/**
 * ADR-125 — how far into each social feed this device has already read.
 *
 * The module that owns `psd.feeds.read.v1`, reaching the browser store only through
 * `localStore.ts` (ADR-009/019). A phone that refuses writes keeps its marks in memory for the
 * life of the page, which degrades to "the dots come back on the next reload" rather than to a
 * crash.
 *
 * **Why the mark lives here and not in a column.** It used to live on the server, in two
 * columns that ADR-129 has since dropped — `participant.chat_last_read_message_id` and
 * `team_membership.last_read_message_id` — and that is
 * what forced the unread question to be asked per reader: the dot was computed from *your*
 * marker, so three hundred reconnects were three hundred keyed queries. Moving the mark to the
 * device turns the server's job into one shared fact per feed. It also removes a mark-read
 * round-trip from every room visit, and it fixes ADR-121's known wart for free — a room that is
 * open cannot light its own dot, because the surface rendering the message is the thing that
 * moves the mark.
 *
 * The price is honest and worth stating: dots are no longer account-wide. Reading on your phone
 * no longer clears the dot on your tablet. For a one-day event with a phone each, that is the
 * right side of the trade.
 *
 * **Timestamps, and never this device's clock.** Every value written here is a string the server
 * produced — the watermark it reported for that feed. Both sides of the comparison are therefore
 * on the server's clock, and a phone set two hours fast still lights correctly. Recording
 * `Date.now()` at the moment of reading would be the bug this comment exists to prevent. The
 * strings are fixed-width UTC ISO, so `>` on them is `>` on the instants: compare, never parse.
 */

const KEY = 'psd.feeds.read.v1';

/** The three feeds with an LED. Named rather than free-form so a typo cannot invent a fourth. */
export type FeedName = 'chat' | 'teamChat' | 'gallery';

export type FeedMarks = Record<FeedName, string | null>;

const FEEDS: readonly FeedName[] = ['chat', 'teamChat', 'gallery'];

/** Nothing read anywhere — the state of a device that has never been seeded. */
export const NO_MARKS: FeedMarks = { chat: null, teamChat: null, gallery: null };

/**
 * Anything but the expected shape is treated as absent rather than trusted: this key is
 * hand-editable, and a malformed value must not blind every LED for the rest of the day.
 */
function parse(raw: string | null): FeedMarks | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const marks: FeedMarks = { ...NO_MARKS };
    for (const feed of FEEDS) {
      const value = record[feed];
      if (typeof value === 'string') marks[feed] = value;
    }
    return marks;
  } catch {
    return null;
  }
}

/** What this device has read, per feed. All null when it has never stored anything. */
export function readFeedMarks(): FeedMarks {
  return parse(readItem(KEY)) ?? NO_MARKS;
}

/**
 * Whether this device has been seeded at all.
 *
 * Distinct from "every mark is null", and the distinction is load-bearing in exactly the way
 * ADR-082's is. A device that arrived while every feed was empty has three null marks, and
 * without this flag it would re-seed on every snapshot — so the first message ever sent would be
 * mistaken for history and silently swallowed.
 */
export function hasFeedMarks(): boolean {
  return parse(readItem(KEY)) !== null;
}

function store(marks: FeedMarks): FeedMarks {
  writeItem(KEY, JSON.stringify(marks));
  return marks;
}

/**
 * Moves one feed's mark to a watermark the reader has now seen, and returns the whole set.
 *
 * Forward only. Two tabs can report positions out of order, and winding a mark back would
 * relight a dot the reader has already cleared. `current` is passed in rather than re-read so
 * the mark still advances in memory on a device whose storage refuses writes.
 *
 * A null watermark is not a position, so it moves nothing: an empty feed has nothing to read.
 */
export function advanceFeedMark(feed: FeedName, at: string | null, current: FeedMarks): FeedMarks {
  if (at === null) return current;
  const existing = current[feed];
  if (existing !== null && existing >= at) return current;
  return store({ ...current, [feed]: at });
}

/**
 * The first-sight rule: a device that has never been seeded adopts the current watermarks and
 * shows every LED dark.
 *
 * This is what stops a new phone or a cleared browser being greeted by three lit dots for a day
 * it was not present for — and it is where the team room's `joined_at` floor now lives, which is
 * what let the server's watermark query drop the floor and collapse to one cache entry per room.
 *
 * Seeding writes nulls for feeds that are empty and still counts as seeded, which is what
 * `hasFeedMarks` exists to express.
 *
 * Joining a team *after* being seeded deliberately does light the team dot: the room's history
 * is older than the null mark the device is holding, so the first snapshot after the join reads
 * as news. That is the right answer for a tab the participant has never opened — a new room is
 * worth a look — and it is also unavoidable without putting the join time back on the wire.
 */
export function seedFeedMarks(watermarks: FeedMarks): FeedMarks {
  if (hasFeedMarks()) return readFeedMarks();
  return store({ ...watermarks });
}

/**
 * Signing out forgets the marks, so the next participant on a shared phone seeds their own.
 *
 * The bug this prevents is ADR-064's: the chat cursor was not cleared at sign-out, so the next
 * participant on a borrowed phone opened an empty room. An inherited mark would hide messages
 * the new reader has never seen — and, for the team room, would hide a different team's.
 */
export function forgetFeedMarks(): void {
  removeItem(KEY);
}

/**
 * Is this feed showing something the reader has not seen? The whole of the LED rule, in one
 * place so the nav, the tabs and the tests cannot each write their own slightly different
 * version of it.
 *
 * An empty feed is never unread. An unseeded mark is treated as unread so that a device which
 * somehow misses seeding errs towards telling the participant rather than hiding from them —
 * seeding happens on the very first snapshot, so in practice this arm is the corrupt-storage
 * case.
 */
export function isFeedUnread(watermark: string | null, mark: string | null): boolean {
  if (watermark === null) return false;
  return mark === null || watermark > mark;
}
