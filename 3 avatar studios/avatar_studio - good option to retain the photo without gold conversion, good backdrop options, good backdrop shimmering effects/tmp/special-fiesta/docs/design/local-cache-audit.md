# Local-cache deep dive — every participant surface, every read, measured

Date: 2026-10-01 · Payload sizes measured against the live demo day (80 participants,
knockout in progress). Goal: where can **aggressive localStorage caching** genuinely cut
traffic — and where would it only cut correctness.

## 0. What is ALREADY cached (credit where due)

| Layer | What | Mechanism |
|---|---|---|
| localStorage | **Photo sprites** — the big one | Content-addressed (`psd.sprites.v1`, id = hash of pixels, LRU, ~2 MB budget): each face fetched **once ever per device**; every later payload carries a 16-char id (ADR-035/037) |
| localStorage | Chat **cursor**, announcement floor, backdrop, scan queue, session token/carrier, last path | Each with a single owning module (ADR-019 one-owner rule) |
| Browser HTTP | Gallery image bytes, motifs, app bundle | `immutable` on content-addressed URLs — re-opens cost zero bytes |
| Server (ADR-038/094) | board, feed, schedule, alerts probes | Collapses 300 phones into ~1 query; this audit is about the *wire*, not the DB |

## 1. The read inventory — measured

| Surface | Endpoint | Trigger | Size | localStorage verdict |
|---|---|---|---|---|
| every page (shell) | `/api/me/alerts` | poll 45–75 s | 0.7 KB | **Never.** It IS the freshness signal (LEDs, toasts, up-soon). Caching it = caching staleness. It is also the *dominant steady-state cost* (~60 calls/phone/hour); honesty requires saying no cache below can touch that floor. |
| boot | `/api/auth/session` | per page-load | 0.3 KB | **Warm-start only**: render last identity instantly, always revalidate. Never TTL-skip an auth check. |
| QR home, profile | `/api/me` | per mount | 0.4 KB | **Cache + TTL + own-mutation invalidation.** Changes only when *you* edit your look — invalidate on avatar save, else serve for the session. |
| profile, teams, my team | `/api/teams/mine` | per mount — the most re-fetched read in the app (Teams redirect, Profile row, My Team all mount it) | 1.9 KB | **Cache, TTL ≈ 60 s + invalidate on join/leave/add/lock.** Third-party roster changes reach you one TTL late — the team chat roster events already tell you louder. |
| teams browse | `/api/teams` | per mount | 1.6 KB | Cache, TTL ≈ 30 s. Join-code flows unaffected (writes bypass). |
| team detail | `/api/teams/:id` + `/matches` | per mount | ~2 KB | Same 30 s pattern. |
| board | `/api/leaderboard` | poll + per mount | 5.6 KB | **Warm-start + mount-skip inside the poll floor**: render the last snapshot instantly; if it is younger than 45 s (the poll's own minimum), *skip the mount fetch entirely* — a tab-hopper stops re-paying 5.6 KB per hop, and staleness stays within what the poll already accepts. |
| feed (results) | `/matches/feed` | poll + per mount | 7.0 KB | Same pattern. |
| line-ups | `/lineups` | poll + mount + PTR | 2.1 KB | Same pattern; **pull-to-refresh must always bypass** — that gesture is a promise. |
| scan history | `/api/me/scans` | per mount | ~1 KB | Cache + invalidate on own scan ding; low churn page. |
| **global chat** | `/api/chat/messages` tail | **per room open** | **11.8 KB** | **The prize.** The cursor is already persisted but the *messages* are not, so every room open deliberately refetches the full 50-row tail (ADR-064 chose safe-over-clever). Persist the tail per room → mount renders cache and fetches only the `after`-cursor **delta** (usually 0 rows). Biggest honest per-action cut in the app. |
| team chat | `/api/team-chat/messages` | per room open | ~6 KB | Same as global chat, keyed per team. |
| photos list | `/gallery/photos` | poll + mount | ~1 KB JSON (bytes already immutable) | Warm-start + mount-skip; votes/reports bypass. |

## 2. The design — one primitive, one policy, one purge

**`localCachedRead` (new, in `lib/storage/`)** — the client twin of ADR-038's server
`cachedRead`, wrapping `useAsyncData`:

- **Key**: `psd.cache.v1.<name>.<actorId>` — *namespaced per participant*. Two people on
  one phone must never see each other's team or chat through the cache.
- **Policy per surface** (the table above): `warm` (render cached, always revalidate),
  `ttl(ms)` (skip the network while younger), with **explicit invalidation hooks** after
  own mutations — the same philosophy as the server's tags.
- **Purge on sign-out and on token change** — one call in `endSession`/sign-in. This is
  also the privacy answer: cached chat on a handed-over phone dies with the session.
- **Budget**: JSON caches capped ~256 KB total (LRU file like the sprite cache), beside
  the existing 2 MB sprite budget; well inside the 5 MB quota, degrade-to-nothing when
  storage refuses (localStore already never throws).
- **ADR-099 interaction**: cached data is a legitimate "yes" state — pages render it with
  `isLoading false`; the three-state rule is preserved because the cache only ever holds
  *server answers*, never guesses.

## 3. What this buys (honest arithmetic)

For a chatty participant (6 room opens, 20 tab hops, 10 identity-page navs per hour):
chat tails ~70 KB + 300 rows saved, poll-floor mount-skips ~100 KB, identity re-reads ~25
calls — roughly **a third to half of all non-alert calls disappear**, and the app *feels*
instant on every navigation (warm-start). What it does NOT buy: the alerts poll floor
(~60 calls/phone/hour) is untouchable by caching — that is the price of the LEDs, and the
server already absorbs it for ~one query per interval.

## 4. Risks named, not waved at

- **Moderated chat lines** could resurface from a cached tail until the next delta —
  mitigation: cap cached-tail age (hours, not days) and let the live stream's hide frames
  do their existing job; the window is seconds on an open room.
- **Cross-participant leakage** — killed by actor-namespaced keys + sign-out purge.
- **Schema drift** — versioned keys (`.v1`) discard rather than migrate, like every
  existing store.
- **Never cache**: alerts, auth decisions, anything a write just changed, SSE streams,
  and all staff/admin surfaces (correctness tools, out of scope by design).

## 5. Adoption order (each step independently shippable)

| # | Step | Cut | Effort |
|---|---|---|---|
| 1 | `localCachedRead` primitive + sign-out purge | — (foundation) | S–M |
| 2 | Chat + team-chat tail persistence (delta-only opens) | ~12 KB + 50 rows per room open | M |
| 3 | Identity trio (`/me`, `/teams/mine`, session warm-boot) + mutation invalidation | ~25 calls/h/phone | S–M |
| 4 | Poll-floor mount-skip for board/feed/line-ups/gallery | ~8 polls/h/phone per hopper | S |
| 5 | Teams browse + team detail + scan history TTLs | long tail | S |

## 6. Delivery status — 2026-10-02

All five adoption steps are now present on the participant client:

1. **Foundation** — `cacheStore` / `useLocalCachedData`, true LRU recency, actor namespaces,
   parameterised-key invalidation, and token-change/sign-out purge (ADR-112).
2. **Chat** — global and team-tail delta opens, scoped to the current participant and (for teams)
   current team, with the six-hour moderation horizon (ADR-112).
3. **Identity** — `/teams/mine` uses a 60-second TTL (the set's one real cut); `/me` and
   scan history are **warm-start only**, because both carry the live points total and a
   scan happens on somebody else's device (ADR-113 amendment); `/auth/session` paints only
   a token-matched warm identity and still revalidates immediately (ADR-113).
4. **Poll floor** — board, match feed, line-ups, and each gallery sort skip only a mount inside
   the 45-second minimum poll interval; scheduled polls and pull-to-refresh still bypass it
   (ADR-113).
5. **Long tail** — team browse, public team detail, and team match history use 30-second TTLs;
   team/avatar writes invalidate their read families rather than waiting for time to pass
   (ADR-113).

`/api/me/alerts`, SSE frames, auth authorization, and every facilitator/superadmin surface
remain deliberately uncached.
