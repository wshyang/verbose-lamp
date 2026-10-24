/**
 * ADR-112 — the names of the device caches, in one place.
 *
 * A cache name is a contract between the hook that FILLS it and the mutation that
 * INVALIDATES it, and those two are rarely in the same file: the roster verbs live in
 * `useTeams`, the team read behind them is also mounted by `useLineups`, and a typo
 * between the two would not fail a build — it would silently serve a stale roster for an
 * hour. Naming them here makes that a compile error instead.
 */

/** `/api/me` — the viewer's own card, including the current points total. */
export const ME_CACHE = 'me';

/** `/api/teams/mine` — the most re-fetched read in the app (Teams, Profile, My Team, Line-ups). */
export const MY_TEAM_CACHE = 'teams.mine';

/**
 * The one aggressive TTL in the identity set, and it lives beside the name because four
 * surfaces share the entry: if they disagreed on how long it may be served, the cache's
 * staleness would depend on which tab you happened to open first.
 */
export const MY_TEAM_TTL_MS = 60_000;

export const SCANS_CACHE = 'scans.mine';

/**
 * ADR-239 — `/api/me/passport`. Warm-start only, like the scans it sits beside: a station's
 * completion moves the moment a facilitator scans, and nothing on this device hears about it.
 */
export const PASSPORT_CACHE = 'passport.mine';

/**
 * `/api/me` and `/api/me/scans` are warm-start ONLY — paint the known answer, always ask
 * again. They look like identity reads and are not: both payloads carry the running
 * points total, and `/api/me/scans` is literally the page a participant opens to check
 * that a scan landed. fds.md §642 makes a scan's effect on the total immediate, and
 * nothing on this device learns that a scan happened — it occurs on a facilitator's phone
 * and `/api/me/alerts` carries no total — so there is no signal to invalidate on and no
 * honest way to skip the request.
 *
 * Zero is not an oversight here; it is the policy, and it saves no traffic on purpose.
 * See `points-freshness.test.tsx`, which fails the moment this becomes a TTL again.
 */
export const POINTS_BEARING_WARM_MS = 0;

/** The global room's last tail, so a room open costs a delta (ADR-112 step 2). */
export const CHAT_TAIL_CACHE = 'chat.tail';

/** The team room's last tail. */
export const TEAM_TAIL_CACHE = 'teamChat.tail';
