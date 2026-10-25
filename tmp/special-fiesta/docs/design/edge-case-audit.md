# Edge-case audit — non-obvious bugs, sharp edges, and verified-safe races

Date: 2026-10-01 · Scope: full codebase, with every claim checked against the code (file
references inline). Three buckets: **found and fixed**, **sharp edges to know about**
(accepted or needing a product call), and **suspected-then-cleared** — the races and edge
cases that were hunted and proven safe, listed so nobody re-hunts them.

## 1. Found and fixed

### 1.1 Three-way circular ties were ranked by sort-engine luck (fixed — ADR-106)

`foldStandings` (`apps/api/src/lib/tournament/engine.ts`) broke win-ties with pairwise
head-to-head *inside an `Array.sort` comparator*. Head-to-head is **not transitive**: in a
three-way circle (A beat B, B beat C, C beat A) the comparator says A<B, B<C, C<A — an
inconsistent comparator, for which ECMAScript explicitly makes the sort order
**implementation-defined**. The documented final tiebreak (entry seed) could never fire
between circle members, and the order decided **who advances to the knockout**.

Fixed by ranking cohort-wise: cohorts ordered by wins; inside a cohort, a two-way tie uses
the head-to-head result, a larger tie uses a mini-league (wins among the tied teams only —
consistent by construction), and a perfect circle falls through to the entry seed,
deterministically. Regression tests pin the circle and the pair cases.

## 2. Sharp edges — working as coded, worth knowing

| # | Edge | Where | Assessment |
|---|---|---|---|
| 2.1 | **Drain-time tier repricing.** An offline-queued scan is priced from the tier list *at drain time*. If the superadmin edits a tier's points while a facilitator is offline, the drained scan pays the NEW price — the confirm dialog promised the old one. (A tier *rename* parks the entry with a named error — that half is handled, ADR-092/093.) | `recordScan`, `routes-fringe/index.ts` | Accepted-by-design ("the server prices it; a number never travels"). If event ops edit prices mid-day, the honest fix is surfacing the repriced delta on S32. |
| 2.2 | **iOS keyboard vs the viewport-locked shell (ADR-098).** With the document never scrolling, focusing the chat composer relies on iOS scrolling the *visual viewport* over the fixed layout. Believed fine, but it is exactly the kind of thing only a real device shows. | `gameboy.css` | Manual device check recommended on event week. |
| 2.3 | **Join-code modulo bias.** `byte % 31` slightly favoured the first 8 alphabet letters. | `db/ids.ts` | **Fixed (ADR-107)** — rejection sampling, test-forced. |
| 2.4 | **`upSoon` staleness window.** The alert threshold is "number of enabled courts"; the cached read ignored court writes. | `schedule.ts` | **Fixed (ADR-107)** — rides COURT_TAG; toggles reshape the alert instantly. |
| 2.5 | **Session token in gallery `<img>` URLs.** The ADR-103 query carrier means the opaque token appears in same-origin image URLs (browser memory/history only; no referrer leaves the origin, no server access log exists). | `galleryUrls.ts` | Documented tradeoff; cookie carrier remains primary. |
| 2.6 | **Chat length counts UTF-16 units.** Emoji cost 2 against `CHAT_BODY_MAX_LENGTH` in JS, 1 in Postgres `length()` — the client/zod side is the *stricter* one, so nothing valid is ever rejected server-side. | schemas + schema.sql | Consistent-safe. |

## 3. Suspected, hunted, and cleared

| Suspicion | Verdict | Evidence |
|---|---|---|
| Two facilitators claim the same fixture simultaneously | **Safe** — compare-and-swap `UPDATE … WHERE status='pending'`; loser's match proceeds as a friendly | `schedule.ts claimFixtureForMatch` |
| Two live matches on one court | **Safe** — partial unique index `ux_tournament_match_live_court` | schema.sql |
| Same-name team/nickname/activity race under concurrency | **Safe** — all uniqueness is DB-level `lower()` indexes (partial for active teams), not app checks | schema.sql |
| Double-award from offline retry | **Safe** — idempotency UUID minted at *enqueue* (stable across retries), `client_scan_uuid UNIQUE`, `(participant, round)` UNIQUE, refusals park (ADR-093) | `scanQueue.ts`, schema.sql |
| Editing/voiding results after the bracket is drawn corrupts it | **Safe** — group edits refused after close (`bracketLocked`), knockout voids always refused, knockout edits only while downstream pending | `corrections.ts assertCorrectionAllowed` |
| Voided scans/matches still count somewhere | **Safe** — every leaderboard/feed aggregate filters `is_voided = false` | `leaderboard.ts` |
| Awkward team counts (e.g. 5 teams, groups of 4) produce a one-team group | **Safe** — teams are dealt round-robin across `ceil(n/size)` groups (5 → 3+2); knockout byes go to top seeds and skip the round rather than making a one-team "fixture" | `engine.ts dealGroups/knockoutDrafts` |
| Offline scan drained into a closed round fails | **By design, allowed** — "the client's round is authoritative at sync time" (ADR-009) | `recordScan` |
| Garbage `clientTimestamp` becomes an Invalid Date 500 | **Safe** — zod `datetime({ offset: true })` at the edge | schemas.ts |
| Leaderboard FLIP jitter on equal points | **Safe** — fully deterministic ordering: points DESC, *first-to-reach* ASC, code/nickname ASC | `leaderboard.ts` |
| Scan-number mint loops forever as the space fills | **Safe** — bounded attempts with the collision math documented (p ≤ 0.03 at 300 heads) | `participants.ts` |
| No team-size cap = bug? | **Per spec** — fds.md explicitly: one-team-per-participant is the only roster rule; no superadmin override, "participant-controlled social dynamics" | fds.md §R2, §864 |
| Confusable join codes (0/O/1/I/L) misread in sunlight | **Safe** — alphabet excludes them | `ids.ts` |
| Poll timer leaks on re-render | **Safe** — jittered chain keeps one timer, cleaned on unmount; callback rides a ref | `useAsyncData.ts` |
