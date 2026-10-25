import { cachified, type CacheEntry } from '@epic-web/cachified';
import { LRUCache } from 'lru-cache';

/**
 * ADR-038 — read decorators that shield the database from the polling crowd.
 *
 * Three hundred phones poll the leaderboard on a jittered minute, and every poll was two
 * heavy aggregates over every scan and match of the day. The answers barely change
 * between polls, so the reads that carry the polling load are wrapped in a decorator
 * that remembers the answer for a few seconds — and is *told*, by every write that could
 * change a score, to forget it. Freshness comes from the invalidation; the TTL is only
 * the safety net under a write path someone adds later and forgets to tag.
 *
 * The machinery is deliberately bought, not built:
 * `lru-cache` is the bounded store, `@epic-web/cachified` the wrapper that adds the two
 * things a poll stampede actually needs — concurrent calls for the same key share ONE
 * database query, and a just-expired entry is served stale while one caller refreshes it
 * in the background.
 *
 * Scoping: entities take an `Executor`, and the test harness runs many databases in one
 * process, so every key is prefixed with the identity of the executor it was read
 * through (a WeakMap — handles are compared, never kept alive). Invalidation crosses
 * scopes on purpose: forgetting too much is a wasted query, remembering too much is a
 * wrong answer.
 */

/**
 * Bounded hard: aggregates are a few kilobytes each, so this is megabytes at worst.
 *
 * NEVER put image bytes or any other blob in this store. `max` counts ENTRIES, not bytes, and
 * there is no `sizeCalculation` — so 5,000 entries of a 300 kB photo is 1.5 GB of resident
 * memory, silently. Binary renditions are served from disk by their own module for exactly
 * this reason (ADR-047); if a byte-budgeted cache is ever wanted, it gets its own LRUCache
 * with `maxSize` and `sizeCalculation`, not this one.
 */
/**
 * ADR-324 — and bounded in BYTES as well. The warning above was about image bytes, but the same
 * arithmetic applies to any large answer: a chat page is up to 200 rows of 500 characters, keyed by
 * a cursor the caller supplies, so one signed-in user could file thousands of distinct ones and fill
 * memory while evicting the leaderboard. `maxSize` + `sizeCalculation` makes the entry count a
 * second limit rather than the only one; the JSON length is a close-enough measure of resident size.
 */
export const CACHE_MAX_BYTES = 96 * 1024 * 1024;

function entrySize(entry: CacheEntry): number {
  const text = JSON.stringify(entry.value ?? null);
  return Math.max(1, text.length);
}

const store = new LRUCache<string, CacheEntry>({ max: 5000, maxSize: CACHE_MAX_BYTES, sizeCalculation: entrySize });

/** tag → every cache key ever filed under it, so a write can void them all at once. */
const keysByTag = new Map<string, Set<string>>();

const scopes = new WeakMap<object, number>();
let nextScope = 1;

/** A stable name for "this database" without holding the handle alive. */
export function scopeOf(db: object): number {
  const known = scopes.get(db);
  if (known !== undefined) return known;
  const created = nextScope;
  nextScope += 1;
  scopes.set(db, created);
  return created;
}

export interface CachedReadOptions<Args extends unknown[]> {
  /** Names the family of keys; must be unique per decorated function. */
  name: string;
  /** How long an answer may be served without asking the database again. */
  ttlMs: number;
  /** For this long past the TTL, serve the stale answer and refresh in the background. */
  swrMs?: number;
  /**
   * The writes that void this read call `invalidateTag` with one of these. A function makes
   * the tag depend on the arguments — one tag per team's chat room, say — so a write to one
   * room never empties the memo of the other fifty-nine (ADR-094).
   */
  tags?: readonly string[] | ((...args: Args) => readonly string[]);
  /** Distinguishes calls with different arguments; omit when the arguments never vary. */
  key?: (...args: Args) => string;
}

/**
 * The decorator: takes a read of shape `(db, ...args)` and returns the same function,
 * remembering answers per database and per argument list. The wrapped read keeps its
 * exact signature, so a call site cannot tell — which is the point.
 */
export function cachedRead<Db extends object, Args extends unknown[], Result>(
  read: (db: Db, ...args: Args) => Promise<Result>,
  options: CachedReadOptions<Args>,
): (db: Db, ...args: Args) => Promise<Result> {
  return async (db: Db, ...args: Args): Promise<Result> => {
    const key = `${options.name}:${scopeOf(db)}:${options.key?.(...args) ?? ''}`;
    const tags = typeof options.tags === 'function' ? options.tags(...args) : (options.tags ?? []);
    for (const tag of tags) {
      const keys = keysByTag.get(tag) ?? new Set<string>();
      keys.add(key);
      keysByTag.set(tag, keys);
    }
    return cachified({
      key,
      cache: store,
      ttl: options.ttlMs,
      staleWhileRevalidate: options.swrMs ?? 0,
      getFreshValue: () => read(db, ...args),
    });
  };
}

/** Every write that can change what a tagged read would answer calls this. */
export function invalidateTag(tag: string): void {
  const keys = keysByTag.get(tag);
  if (keys === undefined) return;
  for (const key of keys) store.delete(key);
  keys.clear();
}

/** The tag over everything the scoreboard is computed from (scans, matches, avatars). */
export const SCOREBOARD_TAG = 'scoreboard';

/**
 * ADR-172 — the signup catalogue, cached for a minute by ADR-038. Editable now, so an edit has
 * to be able to void it; without this a renamed or retired cluster would keep being offered for
 * up to sixty seconds, which on a signup queue is a long time to hand out a wrong answer.
 */
export const CLUSTER_TAG = 'clusters';

/**
 * ADR-046 — the tag over the chat room's catch-up read, voided by each send. What this buys is
 * narrow but real: a Wi-Fi blip reconnects three hundred phones at once, and they all ask the
 * same "what did I miss" question, which collapses to about one query per TTL window.
 */
export const CHAT_TAG = 'chat';

/**
 * ADR-047 — the tag over the gallery's listing, voided by a vote, an un-vote or a hide. Only
 * metadata and counts are cached under it: the photo bytes are files on disk and must never
 * enter this store, for the reason spelled out at `store` above.
 */
export const GALLERY_TAG = 'gallery';

/** ADR-074 — the live announcement list, shared by every participant's alerts poll. */
export const ANNOUNCEMENT_TAG = 'announcement';

/** ADR-177 — the day's programme, voided by every agenda write. */
export const AGENDA_TAG = 'agenda';

/**
 * ADR-094 — the tournament, its fixtures and the up-soon lookups, voided by every fixture or
 * tournament write and by any court write (how many courts are enabled IS the "soon" window).
 */
export const TOURNAMENT_TAG = 'tournament';

/** ADR-094 — the court list, voided by create, update, enable and disable. */
export const COURT_TAG = 'court';

/**
 * ADR-120 — the matches being played *right now*, voided by every write that can change the
 * answer: a match starting, a point, a completion, a cancellation.
 *
 * Its own tag rather than a share of `SCOREBOARD_TAG`, and the difference matters in both
 * directions. A point press must void this read or the public feed would show a stale score —
 * but it must NOT void the scoreboard, because a point awards nobody anything until the match
 * is completed, and throwing away the leaderboard's memo on every tap of the strip would cost
 * far more than the feed's cache saves. Equally, voiding a long-finished match changes the
 * scoreboard and leaves this list untouched.
 */
export const LIVE_MATCH_TAG = 'live-match';

/**
 * ADR-094 — one tag per team room, so sixty teams' unread probes never void each other:
 * a message in one room invalidates that room's entries and no one else's.
 */
export function teamChatTag(teamId: string): string {
  return `team-chat:${teamId}`;
}

/**
 * ADR-162 — the active-membership lookup, which is the hottest read on the SSE path and the
 * only cached read in this system that is an **authorisation decision** rather than a display
 * value.
 *
 * `findActiveMembership` runs once per stream connect and then again for every team frame
 * delivered (the status stream's gate, ADR-128) and every team chat message (`stillAMember`,
 * ADR-123). A chatty room costs roughly two indexed point-reads per member per message, which
 * is the only uncached work that scales with traffic rather than with people.
 *
 * **Three rules follow from it being an authorisation check, and none of them are optional.**
 *
 * 1. **Freshness comes from the invalidation, never from the TTL.** Everywhere else in this
 *    file the TTL is the safety net under a write path someone forgets to tag. Here a missed
 *    void is not a stale number on a screen, it is an ex-member reading a room they were
 *    removed from — so the TTL is a blast radius, not a policy.
 * 2. **Therefore the TTL is one second**, far shorter than anything else here (see
 *    `MEMBERSHIP_CACHE_TTL_MS`). The deliveries this exists to collapse all happen in the same
 *    tick as the message that caused them, so a one-second window captures essentially the
 *    whole burst while bounding any future missed void to one second.
 * 3. **No stale-while-revalidate, ever.** Serving a deliberately stale answer is precisely the
 *    failure being guarded against.
 *
 * Coarse on purpose — one tag for every participant's membership rather than one per
 * participant. Membership changes are rare (a few hundred across a whole event) and the reads
 * are constant, so the cost of over-voiding is a handful of wasted point-reads. The benefit is
 * that no caller can get *which* participant wrong, and several writes touch more than one
 * person: a disband ends five memberships, a staff move ends one and creates another. A
 * per-participant tag would be an invitation to void one of the two. This file's own rule,
 * applied where it matters most: forgetting too much is a wasted query, remembering too much
 * is a wrong answer.
 */
export const MEMBERSHIP_TAG = 'membership';

/**
 * ADR-324 — the pause switch (`service_state`), voided by every write to it. `isSocialPaused` runs
 * on every chat, team-chat and gallery request, photo bytes included, which made it an extra
 * query per request across three hundred phones. The write voids this tag, so a pause is seen on
 * the next request; the TTL below exists only to bound a missed void.
 */
export const SERVICE_STATE_TAG = 'service-state';

/**
 * ADR-038 — sprite bodies, cached by content hash.
 *
 * A sprite id *is* a hash of the sprite (ADR-035), so an entry here can never go stale:
 * the worst a hit can be is a face that has since been taken off — and the only cost of
 * that is a picture the phone was about to ask for anyway. Keys carry the executor
 * scope all the same, so one test's faces never answer for another's database.
 */
/** ADR-324 — 4,000 sprites at their 50 kB maximum would be 200 MB; the byte budget is the real limit. */
export const SPRITE_CACHE_MAX_BYTES = 32 * 1024 * 1024;

export const spriteBodies = new LRUCache<string, string>({
  max: 4000,
  maxSize: SPRITE_CACHE_MAX_BYTES,
  sizeCalculation: (body) => Math.max(1, body.length),
});

/*
 * ADR-228 — a face that has been taken off must not come back from this cache.
 *
 * ADR-038 accepted a stale face because a hit was only ever a picture the phone was about to ask for
 * anyway. A participant who removes a photo is asking for something else: the picture gone. So a removal
 * forgets the body, and bumps `spriteEpoch`. A read takes the epoch before it queries the table and
 * writes back only if the epoch is still the same, so a read that was in flight when the face came off
 * cannot put it back. This holds for one process, which is one container (ADR-043).
 */
let spriteEpoch = 0;

/** The epoch to read under: take it before the query, and pass it to `rememberSpriteBody`. */
export function spriteEpochNow(): number {
  return spriteEpoch;
}

/** Write a body found by a read that started at `epoch`; does nothing if a face came off since. */
export function rememberSpriteBody(found: {
  scope: number;
  id: string;
  sprite: string;
  epoch: number;
}): void {
  if (found.epoch !== spriteEpoch) return;
  spriteBodies.set(`${found.scope}:${found.id}`, found.sprite);
}

/**
 * ADR-324 — ids a full scan could not find, so asking for them again does not scan again.
 *
 * Keyed by scope and id, and cleared whenever ANY photo is saved (`forgetMissingSprites`), because
 * saving one is the only thing that can make a missing id exist. Bounded, so a loop of made-up ids
 * fills a small set and not memory. An id is 16 hex characters, so an entry is a few dozen bytes.
 */
export const missingSpriteIds = new LRUCache<string, number>({ max: 10_000 });

/** What the set stores for a member; the value carries nothing, only presence matters. */
export const MISSING = 1;

/** A photo has been saved somewhere: any id previously not found may exist now. */
export function forgetMissingSprites(): void {
  missingSpriteIds.clear();
}

/** A face has been taken off in this scope: forget its body, and stop any read in flight from keeping it. */
export function forgetSpriteBody(scope: number, id: string): void {
  spriteEpoch += 1;
  spriteBodies.delete(`${scope}:${id}`);
}

/** Tests only — a fresh process-wide slate, because the module state outlives a suite. */
export function resetCachesForTests(): void {
  store.clear();
  spriteBodies.clear();
  keysByTag.clear();
}
