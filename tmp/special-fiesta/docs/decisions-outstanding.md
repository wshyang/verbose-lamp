# Outstanding decisions — the whole register, in one place

**Compiled:** 2026-10-03 · **Sources:** every `Open questions` / `Still open` section in
`docs/design/`, the judgement calls left in `docs/addenda/ADDENDA.md`, and everything parked
across this session.

Nineteen decisions were open when this was compiled. **Eighteen are now closed.** B1, B2 and B3
were decided and shipped on 2026-10-03 as ADR-125; the remaining fifteen were ruled on by the
user later the same day and each carries its ruling as a quoted note under its heading. **One
is still open: C2**, the service worker, pending the implications write-up the user asked for.

Nothing here is deleted once answered. The question and its background stay, because the
reasoning is what the build gets checked against — and a decision whose reasoning has been
thrown away is a decision that gets re-litigated six months later.

**Two rulings overrode my recommendation, and both are worth reading in full:** A1 (a walkover
pays nobody) and B4 (up soon *does* toast — results not toasting and up-soon toasting are two
separate rules, not a contradiction).

---

## Index

| # | Decision | Outcome | Blocks |
|---|---|---|---|
| **A — Points and rewards** |
| A1 | What does a walkover pay the team that showed up? | ✅ **DECIDED** — nobody; it stays a cancellation *(overrides my recommendation)* | — |
| A2 | Floor `tournament_loss_points` at 1? | ✅ **DECIDED** — no, keep 0 legal | — |
| A3 | Should taking part ever be self-serve? | ✅ **DECIDED** — staff only | — |
| A4 | Should collecting swag pay points? | ✅ **DECIDED** — no; the swag is the reward | — |
| A5 | Confirm the 0 – 0 rule shipped in ADR-114 | ✅ **CONFIRMED** — draw rate to both; win/loss/draw | — |
| **B — Real-time, LEDs and the stream** |
| B1 | What is a social feed's "last change" marker? | ✅ **SHIPPED** (ADR-125) — a server timestamp | — |
| B2 | Which feeds get a watermark? | ✅ **SHIPPED** (ADR-125) — chat, team chat, gallery | — |
| B3 | Where does "what I have seen" live? | ✅ **SHIPPED** (ADR-125) — on the device | — |
| B4 | How loud should "up soon" be? | ✅ **DECIDED** — it toasts, plus LED and notification; no sound | step ⑤ |
| B5 | Membership changing mid-stream | ✅ **DECIDED** — fix it; re-check on the frame | — |
| B6 | Should a completed match push the leaderboard? | ✅ **DECIDED** — yes, *and* keep the cache decorators | step ④ |
| B7 | Confirm the remaining SSE build order (steps ④ and ⑤) | ✅ **CONFIRMED** — proceed as written | the next build |
| **C — Traffic and caching** |
| C1 | Extend conditional requests (ETag/304) to the polled surfaces? | ✅ **DECIDED** — yes, as shared reusable code | — |
| C2 | Is a service worker acceptable operationally? | ⏳ **OPEN** — concrete plan + assessment at `docs/design/service-worker-plan.md` (2026-10-04); recommends **option B, stations only, not before the event**, and asks three questions | — |
| C3 | May `GalleryPhotoView` change shape for the per-viewer overlay? | ✅ **DECIDED** — yes, change the view | — |
| C4 | Should the board and court surfaces move onto the status stream? | ✅ **DECIDED** — no | — |
| **D — Tournament format** |
| D1 | Group ties beyond head-to-head: playoff or superadmin pick? | ✅ **DECIDED** — settled on court, not in the app | — |
| D2 | A third-place match? | ✅ **DECIDED & SHIPPED** — offered, default off, ADR-137 | — |
| D3 | Champion bonus points? | ✅ **DECIDED & SHIPPED** — one configurable bonus, ADR-136 | — |
| D4 | Consolation friendlies for knocked-out teams? | ⏸ **KIV** — time and court constraints | — |
| **E — Conventions and data** |
| E1 | `createdByUsername` is lazy-joined, against non-negotiable #7 | ✅ **DECIDED** — not needed; usernames cannot change | — |
| E2 | Should `fds.md` periodically absorb accepted addenda? | ✅ **DECIDED** — no | — |
| **F — Operations and UX** |
| F1 | An undo on a mis-scan at the station? | ✅ **DECIDED & SHIPPED** — ten-second station undo, ADR-138 | — |

---

# A — Points and rewards

## A1 · What does a walkover pay the team that showed up?

> **DECIDED 2026-10-03 — no.** A walkover stays a cancellation and nobody is paid. The
> recommendation above is overridden: a match that was not played does not produce points, and
> no `tournament_turnup_points` rate is added.

**Background.** Points have exactly two sources: an unvoided `fringe_scan` and an unvoided
*completed* `tournament_match`. A walkover resolves a fixture **without** writing a match row,
so today it pays nobody — including the team that turned up, changed, and waited. The day's
stated rule is "taking part in anything yields points, even if you lose", and this is the
largest remaining hole in it (`participation-points-gaps.md` G4). ADR-116 fixed the equivalent
hole on the fringe side with a day-level participation floor.

Implementation note already settled in the plan (W2): the fix should **write a synthesised
match row** rather than add a third union branch to the leaderboard CTE — one shape, one
fan-out path, one set of snapshot rules, and the ADR-115 standings code already ignores a match
with null scores.

**Options.**
1. **Turn-up points to the present team, zero to the absent one** *(recommended)* — punitive to
   the no-show, honest to the attendee. Implies recording *which* team was absent, which
   `walkover_winner_team_id` only implies; needs an explicit column or a derived rule.
2. **Loss points to the present team** — simplest, reuses an existing rate, but reads oddly:
   they didn't lose, nobody played.
3. **Win points to the present team** — treats a walkover as a win. Inflates the leaderboard
   for an event that never happened, and makes a no-show *profitable* to the opponent.
4. **Nothing** — status quo; the hole stays.

**Recommendation.** Option 1, with a new `tournament_turnup_points` rate in `point_config`
(there is no "turned up" rate today). It also gives G5/G6 — skipped and cancelled fixtures — a
rate to use later.

---

## A2 · Should `tournament_loss_points` be floored at 1?

> **DECIDED 2026-10-03 — keep 0 legal.** No floor.

**Background.** `CHECK (tournament_loss_points >= 0)` permits a superadmin to configure a
winner-takes-all tournament. Gap G7 asks whether "even if you lose" is *policy* (the schema
should enforce it) or *preference* (the default should express it, and an organiser may
override). The change is two lines plus a test.

**Options.**
1. **Floor it at 1** — the rule becomes structural; nobody can misconfigure the day.
2. **Leave it at 0** *(recommended)* — the default already expresses the policy; the floor
   removes a legitimate organiser choice, and the people most likely to want a zero are running
   a format we haven't imagined.

**Recommendation.** Option 2. I'd rather not weld shut a door you may want. If you say "it's
policy", it is a ten-minute change.

---

## A3 · Should taking part ever be self-serve?

> **DECIDED 2026-10-03 — staff only.** Scanning stays with staff; no self-serve path.

**Background.** `fringe_scan.facilitator_id` is `NOT NULL`: every point requires a staff member
to act on you, and everything a participant can do alone — gallery, chat, voting — pays zero.
In the demo seed that shows as a 7%-versus-100% split between the opt-out cohort and the
tournament cohort. ADR-092 made the facilitator the integrity boundary *deliberately*.

**Options.**
1. **Keep it staff-only** *(recommended for now)* — and if the opt-out cohort is under-scored,
   fix it with more roaming facilitators, not code.
2. **Self-scan via a station QR** — a participant scans the station rather than being scanned.
   Needs a per-participant per-station cap and a visible audit trail.
3. **A participant-raised queue a facilitator approves** — keeps the boundary, costs a staff tap.

**Recommendation.** Option 1 until you want to spend a design cycle on the anti-gaming model.
This is "a product question wearing an engineering costume" — shipping the code first would
risk solving the wrong problem.

---

## A4 · Should collecting swag pay points?

> **DECIDED 2026-10-03 — no.** The swag is itself the reward; it pays no points.

**Background.** Swag stations hand out items and record the handout; they award nothing
(gap G8). This may be exactly right — swag is a reward, not an achievement — but it has never
been ruled on, and it is the one remaining station type that pays zero.

**Recommendation.** Keep it glory-only. Paying for collection rewards queueing, and the swag
record already exists if you change your mind.

---

## A5 · Confirm the 0 – 0 rule as shipped (ADR-114)

> **DECIDED 2026-10-03 — confirmed as shipped.** 0 – 0 pays the draw rate to both teams. The
> model is three rates: win, loss and draw.

**Background.** You approved "higher score wins automatically". The edge that needed a rule:
`0 – 0` means *nobody touched the strip* — walkovers, corrections, and any match a marshal ran
without scoring — not "it ended goalless". So an **unscored** match keeps the old behaviour (a
human names the winner) and the feed prints no score line for it; once a single point exists
the score is authoritative and a contradicting `winnerTeamId` is rejected. This shipped; it was
never explicitly signed off.

**Recommendation.** Confirm. The alternative — refusing to close an unscored match — forces a
marshal to invent a 1 – 0 to free a court.

---

# B — Real-time, LEDs and the stream

## B1 · What is a social feed's "last change" marker? — ✅ SHIPPED (ADR-125)

**Decided 2026-10-03:** a **server timestamp**. The stream and the snapshot carry the time of
each social feed's most recent change; the phone compares it with its own last-read timestamp
for that feed and lights the LED when the feed's is the later one.

I had recommended the latest item's UUIDv7 id on clock-skew grounds. That objection **does not
apply to this design**, provided one discipline is kept, and it is the single most important
line in this section:

> **The locally stored last-read value is always a timestamp the server produced.** When you
> open a room, the device stores the server's "latest change" value for that feed — never
> `Date.now()`. Both sides of every comparison then come from the one clock, and a phone whose
> clock is an hour out still lights correctly.

Two consequences worth writing into the implementation:

- **Compare the strings, don't parse them.** `iso()` already emits fixed-width UTC
  (`2026-10-03T07:41:09.123Z`), which sorts lexicographically in exactly timestamp order. No
  `Date` objects, no timezone, no parse failure path.
- **"Latest change" is per feed, not per item,** so the wire carries three nullable strings and
  not a list. Null means "this feed has nothing in it", which is the one state that must never
  light an LED.

**What it costs and buys.** The two `EXISTS` probes in `readAlertsFor` disappear, and with them
the per-reader part of the status snapshot — three hundred reconnects after a restart then ask
three *shared* questions instead of six hundred keyed ones. `markChatRead` / `markTeamChatRead`
become unnecessary round-trips. `AlertsView.chatUnread` and `.teamChatUnread` leave the
contract and are replaced by the timestamps.

---

## B2 · Which feeds get a watermark? — ✅ SHIPPED (ADR-125)

**Decided 2026-10-03:** the **social** feeds — global chat, team chat, and the gallery. Not the
match feed, which changes all afternoon and whose LED would therefore mean nothing.

One subtlety the gallery introduces, which chat does not have: **a photo's "change" time is when
it became visible, not when it was taken.** A photo hidden by a moderator and later restored,
or one that lands after an upload backlog, has a `createdAt` well in the past; keying the
watermark on `createdAt` would let it appear in the grid without ever lighting the dot. The
gallery's marker must therefore be the latest **visibility** change among photos the viewer can
see, and a *hide* must not light anything — the dot means "there is something new to look at",
and removing a photo is not that.

---

## B3 · Where does "what I have already seen" live? — ✅ SHIPPED (ADR-125)

**Decided 2026-10-03:** on the **device**, as a last-read timestamp per feed in `localStorage`,
alongside the announcement-dismissal state that already lives there (ADR-082).

This settles the known wart in ADR-121 for free: an open room can no longer be lit by its own
incoming message, because the surface that is rendering a message is also the thing that moves
the marker.

**The one behaviour this changes, stated plainly.** Read markers are server-side today, so
reading on your phone clears the dot on your tablet. After this, it does not —
each device tracks its own. For a one-day event on one phone each that is the right trade, but
it is a real behaviour change and not an implementation detail.

**The first-sight rule.** A device with no stored marker for a feed — a new phone, a cleared
browser, a participant who has just joined a team — must **store the current value and show the
LED dark**. The alternative, treating "unknown" as unread, greets every new joiner with a lit
team-chat dot for a conversation that happened before they arrived. This also reproduces, on the
client, the `joinedAt` floor the server's team-chat probe applies today.

**Follow-on cleanup, once this ships.** `participants.chat_last_read_message_id` and
`team_membership.last_read_message_id` have no other reader — they exist solely to answer the
unread probes — so they and the two mark-read endpoints become dead weight. I would leave the
columns in place for one release rather than drop them in the same change.

---

## B4 · How loud should "up soon" be?

> **DECIDED 2026-10-03 — up soon toasts.** With a correction to how this was framed: "results
> never toast" and "up soon toasts" are two different rules about two different things, and
> there is no tension between them. Being needed at a court is exactly what a toast is for. LED
> plus browser notification plus toast; no sound. Step ⑤'s floor still ships first, so a
> reconnect cannot re-toast a fixture the participant has already been warned about.

**Background.** Since results stopped toasting anybody, this is the **only** interruption left
in the participant app — which raises the stakes rather than lowering them. Today it lights the
Feed tab LED and fires a browser notification (ADR-103, edge-triggered). There is no sound and
no in-app toast. The precedent to respect is ADR-104: replayed history must never sound like
arrival.

**Options.**
1. **LED + browser notification, as now** *(recommended)*.
2. **Add an in-app toast** — more visible for a phone already open, but the app competes with
   the announcement toast for the same strip of screen.
3. **Add a sound** — carries across a beach; also the thing people switch off first, and the
   one that misfires worst if a reconnect ever re-announces an old window.

**Recommendation.** Option 1, plus the `localStorage` floor on the last toasted `fixtureId`
(step ⑤) so a reload during the window cannot buzz twice. If you want a sound, I'd want the
floor shipped first.

---

## B5 · What happens when team membership changes mid-stream?

> **DECIDED 2026-10-03 — fix it.** `team.upsoon` re-checks membership on the frame, the way
> team chat already re-checks before each write.

**Background.** The status stream subscribes to `status.team.{id}` at connect, from the
membership it read then. If someone joins, leaves or is moved while connected, their socket is
pointed at the wrong topic until they reconnect. Team chat solves this by re-checking membership
before **every** write — now covered by a test (ADR-123).

**Options.**
1. **Re-check on the frame**, as team chat does *(recommended)* — one indexed read per team
   frame, and team frames are rare (a handful per team per day).
2. **Rely on the client reconnecting** on `visibilitychange` (ADR-105) — free, but a joiner who
   never backgrounds their phone can sit on the wrong topic for an hour.
3. **Do nothing and document it.**

**Recommendation.** Option 1 — cheap, and the stakes are "a team never told to walk to the
court".

---

## B6 · Should a completed match push the leaderboard?

> **DECIDED 2026-10-03 — yes, and keep the caches honest.** The leaderboard is pushed on
> completion. Explicitly carried with the decision: every dependent read must be behind a
> `cachedRead`, and every write that changes one of those answers must void its tag — the push
> is in addition to the cache discipline, never a substitute for it.

**Background.** This was priced as "a bigger payload that changes on every point, so it may want
throttling". ADR-120 changed that: the live scoreline rides `LIVE_MATCH_TAG`, and
`SCOREBOARD_TAG` is now voided only by **completion**, not by a point. So a leaderboard push is
a handful of frames per afternoon, not one per tap.

**Recommendation.** Yes — fold it into step ④ alongside `feed.match`, no throttle needed. It
retires the board's polls for participants, which are the heaviest remaining ones.

---

## B7 · Confirm the remaining SSE build order

> **DECIDED 2026-10-03 — proceed as written.** Steps ④ then ⑤.

**Background.** Steps ①–③ are shipped (ADR-120, ADR-121), hardened (ADR-122–124). Remaining:
**④** payload-carrying publishes at the remaining invalidation sites (`feed.match`, plus B6 if
you agree), and **⑤** the one client floor in `localStorage` — the last toasted `fixtureId` — so
a reload cannot re-buzz an up-soon window.

**Recommendation.** Proceed as written, taking B1–B3's watermarks as a step ⑥ once you have
answered them. Say the word and I start on ④.

---

# C — Traffic and caching

## C1 · Extend conditional requests to the polled surfaces?

> **DECIDED 2026-10-03 — yes, as shared reusable code.** One helper, not per-route
> hand-rolling.

**Background.** Gallery *images* already do this properly — `immutable` plus a strong ETag, so a
re-request costs a 304 with no body. Nothing else does: `useBoard` ×3, `useCourtConsole` ×2,
`useFringeStation` and the alerts fallback all re-send a full body every poll even when nothing
changed. The caching work (ADR-112/113) cut *requests*; this cuts *bytes per request that had to
happen anyway*.

**Recommendation.** Yes, as one shared helper rather than three one-off implementations — and
after the stream work, because every surface the stream retires is one fewer to ETag.

---

## C2 · Is a service worker acceptable operationally?

**Background.** It is the largest new surface in the batch-retrieval assessment: it would give
true offline paint and background revalidation, and it also gives you a cache you cannot purge
from the server, a new update-ritual to get wrong, and a class of "they're seeing yesterday's
app" support questions at an event where you cannot walk everyone through a hard reload.

**Recommendation.** Not yet. The `localStorage` layer already delivers the warm paint, and the
restart story (`restart-behaviour.md`) shows nothing blanks during a reboot without one.

### The implications, in full (written 2026-10-03 on request)

**What a service worker actually is here.** A script the browser installs *beside* the page and
keeps, which intercepts every network request the page makes — including the request for the page
itself. It survives tab closes, reboots and going offline. Nothing else in the browser can do
that: `localStorage` is a box the page reads when it runs, while a service worker decides whether
the page runs from the network at all.

**What it would buy.**

- **True offline paint.** Today a phone with no signal that reloads gets the browser's offline
  page. With a worker it gets the app shell from cache and the last-known data from
  `localStorage` — the difference between "the app is broken" and "the app is a few minutes
  stale" at a venue with one bar of signal.
- **Zero-request repeat loads.** The HTML, JS and CSS stop being fetched at all after the first
  visit — not even a 304. For 300 phones reloading through the day that is the single largest
  remaining traffic item, bigger than anything the polling work can reach, because C1's ETags
  still cost a round-trip each to be told "unchanged".
- **Background revalidation.** Data can refresh while the page is closed, so opening the app is
  instant rather than instant-then-flickering.

**What it would cost, concretely.**

- **A cache you cannot purge from the server.** This is the whole risk in one line. Ship a broken
  worker and the recovery is not "deploy a fix" — the broken worker is what decides whether the
  fix is ever fetched. On the day, with 300 phones you do not control, there is no remote
  invalidation and no support channel.
- **The update ritual.** A new worker installs but stays *waiting* until every tab of the app is
  closed; a phone with the app open all day never takes the update. That is the mechanism behind
  "they're seeing yesterday's app" — and skipping the wait (`skipWaiting`) swaps the code under a
  running page, which can leave a half-old, half-new app if any chunk is lazily loaded. Both
  horns need handling, and getting it wrong is invisible until the day.
- **A debugging surface that lies.** Every "I cleared my cache and it is still wrong" bug, for
  the rest of the project's life, has one more suspect — and it is the suspect that the usual
  gestures (hard reload, private window) do not clear.
- **It cannot be tested the way this repo tests everything else.** The sabotage discipline in
  `AGENTS-testing.md` wants a production line a test can break and watch fail. Worker lifecycle
  (install, waiting, activate, claim) is browser-state over time; it needs real Playwright
  journeys with reloads, not unit tests, and even then the interesting failure — a stale worker
  on a phone that has been open for six hours — is not reproducible in CI.

**What is left on the table by saying no.** Only the repeat-load asset fetches. Every *data*
saving a worker could give is already achieved or cheaply achievable without one: the ADR-009
`localStorage` layer gives the warm paint, the status stream removed the polls, the watermarks
removed the per-reader queries, and C1's ETags will collapse what remains to 304s. The worker's
unique contribution is the assets — which are already immutable-hashed and browser-cached, so the
real delta is the handful of revalidation requests per phone per reload, plus the genuinely
offline case.

**The honest summary.** It is the largest win per byte and the worst failure mode per incident,
and the failure mode lands on exactly the day you cannot intervene. My recommendation stands —
not before the event. *If* it is ever built, the safe order is: assets only (never data), a
visible "update available, tap to reload" prompt instead of `skipWaiting`, a kill-switch path
the worker checks before serving anything from cache, and a full Playwright reload journey.
Deploy it weeks before an event, never during the week of one.

---

## C3 · May `GalleryPhotoView` change shape for the per-viewer overlay?

> **DECIDED 2026-10-03 — adopt the recommendation.** The view changes shape; no second
> endpoint.

**Background.** The per-viewer bits (have I voted, may I hide this) are either folded into the
cached photo view — which makes the view per-viewer and so uncacheable — or served as a separate
small overlay endpoint keyed by viewer, leaving the big list shared.

**Recommendation.** Keep the list shared and add the overlay as its own small read. That is the
same shape ADR-074 used for announcements (one global list, per-browser floor) and it is the
reason that list can be one memo for three hundred phones.

---

## C4 · Should the board and court surfaces move onto the status stream?

> **DECIDED 2026-10-03 — no.** Staff surfaces stay on polls.

**Background.** Tempting — it is the version where a persistent connection pays for itself
broadly. But the status stream is participant-only by construction (ADR-121) and the court
console is a staff surface with a different lifetime, a different audience, and reads that must
come from the database rather than a memo ("is this team already playing" is enforced against
the row).

**Recommendation.** No. Push *participant* reads onto the stream (B6), leave staff on polls.

---

# D — Tournament format

These four were flagged as "cheap to decide now, expensive later". The engine shipped without
them; each is additive.

## D1 · Group ties that survive head-to-head

> **DECIDED 2026-10-03 — not an app problem.** A tie that survives head-to-head and point
> difference is settled on the court: another match, or extended time. The app does not need a
> tiebreak beyond what it already has.

Wins → head-to-head → mini-league → point difference (ADR-115) → entry seed resolves almost
everything deterministically. The remaining case is a genuine dead heat.
**Options:** a playoff fixture, or a superadmin pick. **Recommendation:** superadmin pick,
recorded in the audit trail — a playoff needs a court and a slot on a day that has neither to
spare, and the corrections ledger (ADR-117) already exists to make a human choice accountable.

## D2 · A third-place match

> **DECIDED 2026-10-03 — offer it, default off. SHIPPED as ADR-137.**

**Recommendation:** offer it, default off. It is one extra fixture and it keeps two teams
playing; defaulting it off keeps the short day short.

## D3 · Champion bonus points

> **DECIDED 2026-10-03 — yes.** One configurable champion bonus.

Everything today flows through per-match `point_config`, so winning the tournament pays only the
last match. **Recommendation:** yes — one configurable `tournament_champion_points`, awarded to
the winning team's roster snapshot on close. It is the cheapest way to make the knockout stage
feel like it mattered.

## D4 · Consolation friendlies for knocked-out teams

> **DECIDED 2026-10-03 — KIV.** Kept in view, not built: time and court constraints make the
> free slots the premise assumes unlikely to exist.

**Recommendation:** yes, as *unlinked suggestions* on the court console — no bracket meaning, no
points beyond the usual match rates. Half the field is eliminated before the final; this is the
difference between a buzzing beach and a watching one.

---

# E — Conventions and data

## E1 · `createdByUsername` is lazy-joined, against non-negotiable #7

> **DECIDED 2026-10-03 — not needed.** Usernames have no surface on which to change, so the
> lazy join cannot currently disagree with history. If a rename surface is ever added, this
> comes back with it.

**Background.** Non-negotiable #7 says never lazy-join a historical value: `fringe_scan`
snapshots `facilitator_username_snapshot`. The corrections ledger instead joins
`superadmin_account` live — and so do the two older audit surfaces (`audit.ts`,
`pointConfig.ts`). There is no row-vanishing risk (no `expires_at` on that table), so the
symptom is narrow: rename a superadmin and the history rewrites itself.

**Options.** (A) leave all three; (B) snapshot the username on write in all three; (C) snapshot
only new writes; (D) write the rule down — "staff display names on audit rows are snapshotted"
— so the next surface doesn't re-decide it.

**Recommendation.** B + D. Three surfaces is exactly the point at which a convention either gets
written down or quietly becomes the opposite convention.

---

## E2 · Should `fds.md` periodically absorb accepted addenda?

> **DECIDED 2026-10-03 — no.** The addenda stay the record; `fds.md` is not periodically
> rewritten to absorb them.

**Background.** `AGENTS-decisions.md` §4 says *do not silently edit the FDS to match the code* —
the divergence is the addendum. But ADR-092 did edit `fds.md` to add `award_tiers`, so the repo
has precedent both ways, and the addenda file is now 4 000+ lines carrying behaviour the FDS
does not describe.

**Options.** (1) Never — the FDS is the original brief and the addenda are the history.
(2) Absorb on a stated trigger *(recommended)* — e.g. at each event milestone, fold accepted
ADRs into the FDS and leave the ADR as the *why*. (3) Absorb continuously.

**Recommendation.** Option 2, with the trigger written into `AGENTS-decisions.md` so it is a
rule rather than a habit. The FDS is what a newcomer reads first; at some point "read these
hundred addenda too" stops being an onboarding path.

---

# F — Operations and UX

## F1 · An undo on a mis-scan

> **DECIDED 2026-10-03 — yes.** A ten-second undo at the station. **SHIPPED as ADR-138.**

**Background.** Award the wrong person at a station and the only remedy is a superadmin void —
a radio call, a walk, or a wait. The scan button is deliberately **not** behind a confirmation
(ADR-027): a queue of twenty cannot afford a modal per person. Undo is the right remedy, not a
prompt. ADR-116 made the round slot correctable and ADR-117 gave superadmins a corrections
ledger, so the machinery to undo safely now exists — this is a facilitator-facing shortcut to
it, not new semantics.

**Recommendation.** Yes: a ten-second "Undo" on the outcome line that voids the award it just
made, within the station console. Small, and it removes the most common reason a facilitator
has to interrupt somebody else's afternoon.

---

## How to answer

Fastest: **"take all recommendations"**, or a list of exceptions — *"all recommendations except
A2 (floor it) and C2 (yes to a service worker)"*. I will then apply them in dependency order,
one commit per coherent change, each with its ADR and its sabotage run, and report what landed.
