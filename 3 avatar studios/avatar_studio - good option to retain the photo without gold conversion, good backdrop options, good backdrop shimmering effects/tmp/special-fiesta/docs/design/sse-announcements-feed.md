# SSE for announcements and feed notifications, without blowing up the database

A design note, 2026-10-02, at `a094604`. Companion to
`docs/design/persistent-connection-assessment.md`.

---

## 1. The headline: done correctly, this *reduces* database load

The worry in the question is the right worry — but for these two surfaces the arithmetic runs
the other way. Both are **polled today**, and polling is what costs queries.

| | Today (polling) | With SSE |
| --- | --- | --- |
| **Announcements** | 300 phones × 1 poll/60 s = ~5 req/s. `readLiveAnnouncements` is `cachedRead` under a single global key `'live'`, so ~1 query per TTL window | **0 queries.** One publish when a superadmin posts |
| **Match feed** | ~5 req/s, each running an **uncached** `listMatches(status:'in_progress')` plus the cached completed read → **~5 queries/s, all day** | **0 queries** in steady state. One publish per score change |

The feed is the live one to care about: `routes-tournament/index.ts:89` calls `listMatches`,
which is a plain function with no `cachedRead` wrapper, so every poll from every phone is a
real query. That cost scales with **crowd size × clock**, and it is paid whether or not
anything happened.

An SSE feed costs queries proportional to **things actually happening** — a few hundred score
events across a whole day, against roughly 400,000 polled queries for the same period at 300
phones. So the honest framing is not "can we afford SSE here" but "SSE is the cheaper design,
provided we avoid three specific traps."

---

## 2. The one rule: publish payloads, not signals

Everything hinges on this.

**The trap:** the obvious implementation publishes a *nudge* — "the feed changed" — and each
connected stream (or each client) then reads the new state. That is **N queries per event**,
or worse, N simultaneous HTTP requests. At 300 phones a single score update becomes a
300-query spike. That is the version that blows up the database, and it is strictly worse than
the polling it replaced, because polling is at least jittered (ADR-024) while an
event-triggered stampede is perfectly synchronised.

**The rule:** the bus frame carries the **fully rendered view**, computed exactly once by the
writer that caused the change. Streams then do nothing but write bytes to a socket — no
database access on the read path at all. This is already the proven pattern in `chatBus.ts`:
sending a message costs one INSERT and zero reads, because `publishChatMessage` hands the
`ChatMessageView` itself to every listener.

Applied here:

```ts
// announcementBus.ts — same shape as chatBus, one global topic each.
export function publishAnnouncement(view: AnnouncementView): void { ... }
export function publishAnnouncementRetracted(id: string): void { ... }
export function publishFeedItem(view: MatchView): void { ... }
```

---

## 3. Why these two surfaces are the easy case

Both are **viewer-independent** — the same bytes for all 300 phones:

- `readLiveAnnouncements` is keyed `'live'`, with no viewer in the key.
- `/matches/feed` maps `matchView(match)` with no viewer argument.

That is what makes them cheaper than chat unread (per-participant) or the gallery page (keyed
per viewer for `hasMyVote`). One computation serves every connection, so the payload can be
built once by the writer and fanned out from memory.

Announcements have a second helpful property: **dismissal is already a browser-local concern.**
`useAlertsStore` keeps an announcement floor in `localStorage` (ADR-074/082) and there is no
dismissal route. So live announcement delivery needs no per-viewer server state whatsoever.

---

## 4. Where the publishes hook in

This is the part that is usually guesswork, and here it is already solved: **every place that
calls `invalidateTag` is, by construction, the audited list of "things that change this
resource."** That list was built and reviewed when the caches were added.

- Announcements → the `ANNOUNCEMENT_TAG` sites (create, retract).
- Feed → the `SCOREBOARD_TAG` sites: `matches.ts:264` (completion), `:305` and `:319` (winner
  edit, void), plus `adjustments.ts:62` and `participants.ts:68`.

Two ways to wire it:

**(a) Publish next to each `invalidateTag` call.** Explicit, greppable, no coupling between
the cache and the transport. The risk is a future write path that invalidates and forgets to
publish — a stale feed on open phones.

**(b) Make `invalidateTag` itself notify.** One place, impossible to forget. The cost is
coupling cache invalidation to transport, and a recompute-and-broadcast on every invalidation
even when the change is irrelevant to the feed.

I would start with **(a)**, because `SCOREBOARD_TAG` covers more than the feed (it also backs
the leaderboard), so (b) would broadcast feed frames for changes the feed does not show. If
the forget-to-publish risk materialises, a standards check (`scripts/check-standards.mjs`
already does this class of lint) can assert that every `invalidateTag(SCOREBOARD_TAG)` sits
within a few lines of a publish.

---

## 5. Frame design

### Announcements

```
event: announcement
data: {"id":"01a0...","body":"Lunch is at the main tent","createdAt":"..."}
id: 01a0...
```

Retraction reuses the lesson already learned in `routes-chat/stream.ts` — **a retraction frame
must carry no `id:` field.** The announcement it retracts is older than everything already
sent, so putting its id on the frame would wind the client's resume cursor *backwards* and
turn the next reconnect into a full replay:

```
event: announcement.retracted
data: {"announcementId":"01a0..."}
```

### Feed

**Send the changed match, not the whole feed.** The feed grows all day; re-broadcasting the
entire list on every score would be O(feed size × connections) in bytes for an O(1) change.
One match per frame, merged client-side by id — and `mergeById` already exists in
`lib/hooks/liveRoom.ts`, written for exactly this and ordering by UUIDv7 so it needs no date
parsing.

```
event: feed.match
data: {"id":"01a0...","status":"completed","teamA":...,"scoreA":21,...}
id: 01a0...
```

A void is not a deletion either — it is a status change on a match the client already has, so
it rides the same frame shape and `mergeById` replaces the row in place. No special case.

---

## 6. The three ways this could still blow up the database

### Trap 1 — reading per connection on each event

Covered in §2. Publish the rendered view. **Zero reads on the event path.**

### Trap 2 — the thundering herd on reconnect

This is the one that genuinely bites, and it is not hypothetical: the Cloudflare tunnel drops
idle connections, beach Wi-Fi drops everything, and a server restart (ADR-118's restart
button!) disconnects all 300 phones **simultaneously**. Each then reconnects and needs current
state — that is 300 connect-time reads in the same second.

Two guards, both cheap:

1. **The connect-time read must be `cachedRead`-wrapped.** Then 300 simultaneous reconnects
   collapse to roughly one query per TTL window. `readLiveAnnouncements` already is. The feed's
   `listMatches(in_progress)` is **not**, and should be wrapped before any of this ships — it
   is worth doing on its own merits regardless, since it is the uncached query behind today's
   ~5 req/s.

2. **Jitter the reconnect.** The repo is careful about this for polling — `nextPollDelay()`
   spreads clients across a 45–75 s window precisely so "two hundred phones that opened the
   board together do not come back together". **`EventSource` has no such jitter**: its native
   retry is a fixed interval, so a mass drop reconnects in lockstep — the metronome ADR-024
   exists to prevent, reintroduced by the transport.

   The fix is one line, and it is a nice property of SSE that few people use: the `retry:`
   field is **per connection**, and Hono's `writeSSE` accepts it (`SSEMessage.retry?: number`,
   verified in `hono@4.9`). So each stream can be told its own reconnect delay on connect:

   ```ts
   await stream.writeSSE({ event: 'hello', data: '', retry: 3_000 + Math.floor(Math.random() * 7_000) });
   ```

   Three hundred phones now come back spread over seven seconds instead of all at once.

### Trap 3 — computing for an audience that is not there

If a publish renders a view whether or not anyone is listening, a quiet event still pays for
it. Minor here (the view is already in hand from the write), but worth the guard: publish only
when the topic has subscribers. `EventEmitter.listenerCount(topic) > 0` is the whole check.

---

## 7. What I would build

1. **Wrap `listMatches(status:'in_progress')` in `cachedRead`** under `SCOREBOARD_TAG`. Do this
   first and independently: it removes the ~5 queries/s the feed costs today, needs no new
   transport, and is the prerequisite that makes reconnects safe.
2. **Extend the status stream** from the companion assessment (option A) rather than opening a
   third socket. Announcements and feed frames are additional `event:` types on the one
   shell-level connection — a phone holds one socket, not three.
3. **Publish from the `invalidateTag` sites**, payload-carrying, per §4(a).
4. **Set a jittered `retry:` on connect** (§6, trap 2).
5. Keep the existing polls as the `EventSource`-less fallback, exactly as chat does. They stay
   correct; they simply stop being the primary path.

## 8. Open questions

> **All three were answered on 2026-10-03.** The first: a live list, and nothing more — a result
> toasts nobody (§10). The second: yes, push the leaderboard, and on completion only, which also
> dissolved the throttling worry — see the note on it below. The third: confirmed, the ADR-082
> floor governs which announcements toast, and step ⑤ adds the same shape of floor for up-soon.
> The questions are kept because the reasoning is the record.

- **Does "feed notifications" mean the feed list updating live, or a badge/toast when
  something lands?** The list is purely global and is fully covered above. A *notification*
  ("your team's match just ended") is per-viewer — still free of queries, since the stream can
  compare the frame's team ids against the viewer's membership held in memory from connect,
  but it needs a product decision about what is worth interrupting someone for.
- Should a score change also push the **leaderboard**? It rides the same `SCOREBOARD_TAG`, so
  it is nearly free to add — but it is a bigger payload and changes on every point, so it may
  want throttling (publish at most once per second) rather than per event.

  > **Answered 2026-10-03 (B6): yes, and the throttling question answered itself.** ADR-120
  > moved live scores onto `LIVE_MATCH_TAG`, so `SCOREBOARD_TAG` no longer voids on every
  > point — it voids on completion, a few dozen times a day. There is nothing left to throttle.
  > Carried with the decision: the push is *in addition to* the cache discipline, never a
  > replacement for it. Every dependent read stays behind a `cachedRead` and every write that
  > changes one of those answers still voids its tag, because the stream is an optimisation for
  > phones that happen to be connected and the poll fallback must stay correct on its own.
- Announcements are currently dismissed browser-side with a `localStorage` floor. If live
  announcements should also *toast*, confirm the floor logic still governs which ones do —
  otherwise a reconnect replaying recent announcements will re-toast ones already dismissed.

---

# Part II — What "feed notifications" actually are

Clarified by the user: **(a) the results of tournament games, and (b) an alert that the
user's team is needed at the court soon.** Those are two different shapes and want two
different mechanisms. Added 2026-10-02.

**Updated 2026-10-03:** only (b) is a *notification*. Results are a live list that updates
itself and interrupts nobody — see the decision at §10. Read "feed notifications" below as
covering one buzz and one quietly-rewriting list, not two buzzes.

## 9. "Your team is needed at the court soon" — and a correction

### 9.1 I was wrong about this in the companion document

In `persistent-connection-assessment.md` §7.3 I wrote that `teamUpSoon` is "a function of the
clock, not of an event" and would need a server-side ticker. **That is incorrect**, and the
correction makes the design much simpler.

Reading `upSoonFromDb` (`apps/api/src/db/entities/schedule.ts:552`): **"soon" is measured in
queue position, not in wall-clock time.**

```ts
const index = unresolved.findIndex((f) => f.teamAId === teamId || f.teamBId === teamId);
if (index === -1) return null;
const courtCount = (await enabledCourtIds(db)).length;
if (index >= Math.max(1, courtCount)) return null;
return { fixtureId: unresolved[index].id, gamesAway: index };
```

There is no timestamp anywhere in it. A team is "up soon" when its first unresolved fixture
sits within the first *enabled-court-count* positions of the queue. So the state changes only
when:

- a fixture ahead of them resolves, shifting the queue — `schedule.ts:347`;
- a court is enabled or disabled, resizing the window — `courts.ts:49-50`;
- the schedule itself is built or reordered — the other `TOURNAMENT_TAG` sites;
- the tournament's status changes.

**Every one of those is already an event, and every one already calls
`invalidateTag(TOURNAMENT_TAG)` or `invalidateTag(COURT_TAG)`** — which is precisely what the
cached read declares in `tags: [TOURNAMENT_TAG, COURT_TAG]`. The publish hooks are the same
sites §4 identified for results. No ticker, no timers, no clock.

### 9.2 One query answers it for every team at once

The naive version recomputes per team: 40 teams means 40 evaluations. That is also what
happens **today** — `upSoonFixtureForTeam` is keyed `(teamId) => teamId`, so every team gets
its own cache entry running the same two queries, the same per-viewer fan-out found in the
gallery page.

It is unnecessary. `upSoonFromDb` already fetches **the whole unresolved queue** and then
throws all of it away except one team's index. The same list answers the question for
everybody:

```ts
async function upSoonPicture(db: Executor): Promise<Map<string, number>> {
  const unresolved = await unresolvedFixturesInSequence(db);   // the query already run today
  const width = Math.max(1, (await enabledCourtIds(db)).length);
  const picture = new Map<string, number>();                   // teamId -> gamesAway
  for (const [index, fixture] of unresolved.slice(0, width).entries()) {
    if (fixture.teamAId) picture.set(fixture.teamAId, index);
    if (fixture.teamBId) picture.set(fixture.teamBId, index);
  }
  return picture;
}
```

With four courts that is at most eight teams. **One query per event, regardless of how many
teams exist or how many phones are connected** — and it replaces N cached entries with one.
Cheaper than the status quo, which is the recurring theme of this whole exercise.

### 9.3 Publish transitions, not states

Hold the previous picture in process memory and publish only the **differences**:

```ts
function onScheduleOrCourtChange(db) {
  const next = await upSoonPicture(db);
  for (const [teamId, gamesAway] of next)
    if (previous.get(teamId) !== gamesAway) publishTeamUpSoon(teamId, { upSoon: true, gamesAway });
  for (const teamId of previous.keys())
    if (!next.has(teamId)) publishTeamUpSoon(teamId, { upSoon: false });
  previous = next;
}
```

Process memory is legitimate here for the same reason as the chat bus, the rate limiter and
ADR-082's presence sets: there is exactly one API process (ADR-003/043). A restart loses the
previous picture, which self-heals on the next event — and §9.4 makes that harmless anyway.

Fan-out needs nothing new: `chatBus.ts` already has **per-team topics** (`teamTopic(teamId)`),
written so "a message wakes five listeners instead of three hundred, and a stream cannot be
handed a message from a room it is not in". A status stream subscribes to its own team's topic
at connect, using the membership lookup it already performs. Teamless participants subscribe
to nothing and receive nothing — which is correct, since being teamless is a legitimate way to
attend.

### 9.4 The frame must describe state, not command a buzz

This is the part most likely to go wrong in a way that is visible at the actual event.

A reconnect replays current state, and **ADR-118's restart button disconnects all 300 phones
at once.** If the frame means "notify the user now", every reconnect re-buzzes every team
whose fixture is still in the window — a restart would set off a few hundred phones
simultaneously, for news they already had.

So the frame carries **state**, and the decision to interrupt is the client's:

```
event: team.upsoon
data: {"upSoon":true,"gamesAway":1,"fixtureId":"01a0..."}
```

The client toasts only when `fixtureId` differs from the last one it toasted, keeping that
value in `localStorage` — the same floor pattern ADR-074/082 already uses for announcements,
and for the same reason. Idempotent delivery, one buzz per fixture, reconnect-safe.

`gamesAway` is already in the server's answer, so the copy can be honest — "you are up next"
at 0, "one game away" at 1 — rather than a flat "soon".

## 10. "The results of the games"

This is the global half, and it is the design already in §5: one `feed.match` frame per
changed match, merged client-side by id with the existing `mergeById`. Viewer-independent, one
publish, zero reads.

> **Decided 2026-10-03 (the user, answering the §12 open question): a game result never
> toasts anybody — not the winners, not the losers, not the neighbours. The only thing worth
> interrupting a participant for is being needed at a court.** Announcements still toast,
> because a human being deliberately pressed a button to interrupt everybody; that is what
> the surface is for. This section is kept below with the parts it rules out struck through,
> because the reasoning for *not* buzzing is the more useful record.

So the whole of "results" is a **live list, not a notification**. `feed.match` frames arrive,
`mergeById` replaces rows in place, the feed re-renders, and nothing buzzes, dings or toasts.
A participant who wants to know how their team did looks — which is exactly what they were
doing anyway, since the feed is the surface they already keep open.

What this decision buys, beyond the obvious one of not buzzing forty teams' worth of phones
every couple of minutes:

- **The stream no longer needs to know who is watching it.** The "decide on the client from
  the viewer's membership" design below was cheap, but it still meant the client held its
  membership against every frame. Now a result frame is pure data for a list, identical for
  every connection, and the socket stays genuinely viewer-independent.
- **The void/correction problem disappears rather than being solved.** ADR-117 lets a result
  change after the fact, which would have meant a second floor — "the last status I announced
  for this match" — purely to stop a correction re-toasting. Nothing is announced, so nothing
  can be re-announced. `mergeById` quietly replaces the row and the list is simply right.
- **One toast kind means one floor.** Step 5 of the build order halves: `localStorage` holds
  the last toasted `fixtureId` and nothing else.

~~**A result is worth interrupting for only if it is yours.** The frame already carries both
team ids, and the stream already knows the viewer's membership from connect — so "your team
won" can be decided on the client, from the frame, with no server work and no per-viewer
topic. Everyone receives the same global frame; only members of the two teams in it toast.~~

~~**Voids and corrections must retract cleanly.** The client should suppress the toast when a
frame merely *corrects* a match it has already announced — compare against the last announced
status, same floor technique as §9.4.~~ The merge behaviour still stands and is unaffected:
because the frame is a whole match keyed by id rather than an append-only event, `mergeById`
replaces the row in place and a void is just another status.

## 11. Revised build order

1. **Wrap the feed's `listMatches(in_progress)` in `cachedRead`** (§7) — still first, still
   independent, still removes ~5 queries/s today.

   > **Done 2026-10-03 (ADR-120), with one correction.** This document said to hang it off
   > `SCOREBOARD_TAG`. That is wrong in both directions: `setMatchScore` invalidates nothing
   > today, so the feed would have shown a frozen scoreline for up to the SWR tail — and
   > making the score write void `SCOREBOARD_TAG` would throw the leaderboard's memo away on
   > every tap of the strip. Shipped under its own `LIVE_MATCH_TAG`, voided by exactly the
   > four writes that change the answer: start, point, completion, cancellation.

2. **Add `upSoonPicture`** as a single all-teams read and point the existing
   `/api/me/alerts` handler at it. This removes the per-team cache fan-out **before** any
   streaming work, and is independently worth doing.

   > **Done 2026-10-03 (ADR-120).** `upSoonFixtureForTeam` kept its signature and became a
   > lookup into the one picture, so both callers were untouched.
3. **Status stream** carrying four event types on one socket: `announcement`,
   `announcement.retracted`, `feed.match`, `team.upsoon`.

   > **Done 2026-10-03 (ADR-121), minus `feed.match`.** `GET /api/status/stream` ships with
   > `status.snapshot`, `announcement`, `announcement.retracted`, `team.upsoon` and the two
   > bodyless activity frames that raise the chat dots. `feed.match` waits for step 4, which
   > is where its publish sites are: the stream is the cheaper half of the work and there was
   > no reason to hold it behind the half that touches four write paths. The shell is
   > stream-first and poll-as-fallback — the mount read stays, only the repeating one goes.
4. **Publishes** at the `SCOREBOARD_TAG`, `TOURNAMENT_TAG`, `COURT_TAG` and `ANNOUNCEMENT_TAG`
   invalidation sites, payload-carrying.
5. **The client floor** in `localStorage` for the one toast kind there is — the last
   `fixtureId` toasted (§9.4) — and a jittered `retry:` (§6). Results need no floor: they
   never toast (§10).

   > The jittered `retry:` half shipped early, as ADR-122. The floor is still to build, and
   > B4's ruling keeps it ahead of the toast itself.
6. **Feed watermarks** — the social LEDs, computed by comparing a server-published "last
   changed" timestamp per feed against a last-read timestamp held on the device.

   > **Done 2026-10-03 (ADR-125), out of order and deliberately so.** This step did not exist
   > when the order was written; it was added and taken first because it *removes* work from
   > every other step rather than adding to it. `readAlertsFor` no longer takes the reader at
   > all, so a mass reconnect asks three cached questions instead of six hundred keyed ones —
   > which shrinks precisely the thundering-herd cost (§6, trap 2) that steps ④ and ⑤ have to
   > survive. It also deleted both mark-read endpoints and fixed ADR-121's open-room flicker
   > by construction.

Steps 1 and 2 are pure wins with no transport change, and both make the streaming work safer
by shrinking what a mass reconnect costs. They are worth shipping even if the stream is never
built.

## 12. Still open — nothing, as of 2026-10-03

- ~~**How loud should "up soon" be?**~~ **Answered 2026-10-03 (B4): it toasts** — plus the LED
  and a browser notification, and no sound. The framing in this bullet was subtly wrong and the
  correction is worth keeping: "a result never toasts" and "up soon toasts" are two rules about
  two different events, not a tension to be balanced. Being needed at a court is the one thing
  worth interrupting someone for, which is exactly why results were taken away from the toast
  — not so that nothing uses it. The blip precedent still binds: §9.4's floor ships first, so a
  reconnect replaying the window cannot re-toast a fixture already announced.
- ~~**Should a result toast for teams you are not on?**~~ **Answered 2026-10-03: a result
  toasts nobody at all**, your own team included. Being needed at a court is the only thing
  that interrupts a participant. The global feed list still updates live (§10).
- ~~**What happens when membership changes mid-stream?**~~ **Answered 2026-10-03 (B5): fix it.**
  `team.upsoon` re-checks membership on the frame, the way team chat already re-checks before
  each write — for the same reason, which is that a socket can outlive the membership that
  authorised it. Not deferred.
