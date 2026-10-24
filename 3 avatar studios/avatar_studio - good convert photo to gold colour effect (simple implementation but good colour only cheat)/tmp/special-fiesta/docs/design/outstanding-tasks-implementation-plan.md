# Implementation plan for the outstanding tasks — including the service worker

**Written 2026-10-03**, against `arena/01a0fa4b-special-fiesta` @ `f1e2af7` ("docs: record the
2026-10-03 rulings and the work queue they imply"), read into a clean workspace and verified
there. Companion to `docs/outstanding-tasks.md` (the queue) and `docs/decisions-outstanding.md`
(the reasoning). This file is the *how*: what each item actually touches, what it costs, what
order survives the day, and a full build plan for C2 — the one item still open.

---

## 0. The baseline is real

Everything below is costed against a tree that is genuinely green, not one assumed to be.
`npm install && npm run verify` was run end to end in this workspace:

| Gate | Result |
|---|---|
| `tsc -b` across contracts, api, web | clean |
| `eslint .` | clean |
| `scripts/check-standards.mjs` | 406 files, 12 rules, **0 violations** |
| `vite build` (web) | 780 kB raw / 230 kB gzip, one chunk |
| API integration suite (PGlite, real DB) | **438 passed**, 3 skipped, 31 files |
| Web unit suite | **945 passed**, 96 files |
| Coverage ratchet | held (`lines 98.97 / functions 98.26 / branches 98.34 / statements 98.97`) |

Playwright was not run — no browsers are installed here — so every e2e claim below is a plan,
not a result. **Everything else in this document was measured, not inferred**; §0.5 records the
experiments and what they changed.

**This matters for estimating.** A tree with no slack in the coverage ratchet means test-writing
is the *majority* of every number in this document, not the trim at the end. Where I give a
size, assume roughly one-third implementation and two-thirds tests, ADR prose and verification.

---

## 0.5 What the deep check proved — and where my first draft was wrong

Five experiments were run against this tree. Three confirmed a finding, **one corrected it in my
favour and made it much worse**, and one closed an open housekeeping item outright.

### E-1 · The static assets are not slow-cached — they are *uncacheable*

I originally wrote that the motifs and scene art cost "a handful of 304s per reload". That was
too generous. `serveFile` (`webStatic.ts:38-49`) emits **`content-type`, `content-length` and
`cache-control` — and no validator at all.** No `etag`, no `last-modified`.

`cache-control: no-cache` means "you may store this, but revalidate before every use". With no
validator there is nothing to revalidate *with*, so the browser cannot issue a conditional
request and must refetch in full. Proven by sending one:

```
GET /motifs/merlion.svg?v=096a2fb2
  if-none-match: W/"anything"   if-modified-since: <now>
→ 200, 1418 bytes of body        (a 304 is impossible — the server has no validator to match)
```

Served through the real `withStaticWeb` against the real `apps/web/dist`:

| Path | Status | `cache-control` |
|---|---|---|
| `/assets/index-DP5OyLmB.js` | 200 | `public, max-age=31536000, immutable` ✅ |
| `/index.html` | 200 | `no-cache`, **no validator** |
| `/motifs/merlion.svg?v=096a2fb2` | 200 | `no-cache`, **no validator** |
| `/scene/panorama.png?v=58892259` | 200 | `no-cache`, **no validator** |

**223 content-versioned files** are affected (193 motifs + 15 `scene` + 15 `scene-2x`), totalling
242 kB. *(My first draft said "33 scene images"; it is 30.)*

What one participant page load actually re-downloads, every single time, measured from the built
bundle and the components that render it:

| | Files | Bytes |
|---|---|---|
| `index.html` | 1 | 745 |
| `BeachScene` → `SCENE_PARTS` (1×) | 15 | 23,682 |
| Shell motifs — `psd`, `merlion`, 6 nav icons | 8 | 10,019 |
| `gameboy.css` background motifs (unique extras) | 5 | 4,512 |
| **Total, per page load, forever** | **29** | **≈ 38 kB** |

At 300 phones reloading five times across the day that is **~43,500 avoidable requests and
~57 MB** of entirely redundant transfer on beach Wi-Fi — for bytes whose URLs already carry a
content hash (`?v=MOTIF_VERSION`, ADR-014/067) and therefore *cannot* go stale. The 780 kB
JavaScript bundle, by contrast, is correctly `immutable` and downloaded once.

This makes item ⓪ (§3.1) a bug fix rather than an optimisation, and it splits into two parts —
see the revised §3.1.

### E-2 · `/sw.js` currently returns **200 `text/html`** — a trap sitting in C2's path

`withStaticWeb` falls back to `index.html` for every unmatched GET. Verified:

```
GET /sw.js                → 200  text/html   (index.html)
GET /manifest.webmanifest → 200  text/html   (index.html)
```

Registration would fail loudly on the MIME type, which is survivable. **The dangerous half is
un-shipping.** The standard way to retire a service worker is to make its URL 404 or serve a
no-op; a browser that re-fetches its worker script and gets `200 text/html` does not treat that
as "the worker is gone". So in this repo, as it stands, *you could ship a worker and then be
unable to withdraw it by deleting the file.* That is C2's headline risk — "a cache you cannot
purge from the server" — made concrete and specific, and it is a mandatory Phase-0 fix.

### E-3 · The gallery fan-out is real, and now has numbers (with a control)

Measured by wrapping the app's Drizzle executor and counting real `select` calls through
`app.request()` on the live app and a real database:

| Path | 1st request | each **new** viewer | each **repeat** viewer |
|---|---|---|---|
| `GET /api/gallery/photos` | 7 selects | **7** | 4 |
| `GET /api/me/alerts` *(control)* | 6 selects | **3** | 3 |

The control is the point. ADR-125 did exactly what it claimed: the alerts path costs the same
whether the viewer is new or returning — no per-viewer fan-out left. The gallery still pays
**3 extra selects per distinct viewer**, because `hasMyVote` is baked into the cached row.

`GALLERY_CACHE_TTL_MS` is 5 s, so at 300 people on the photo wall that is **~900 avoidable
selects per 5-second window — roughly 10,800 per minute**, all day. C3 is confirmed as the
largest remaining database win, ahead of C1.

### E-4 · The dead columns really are dead — but the task list misses a file

I removed `participant.chat_last_read_message_id` and `team_membership.last_read_message_id`
from `schema.sql`, both Drizzle schemas and the four `seed-demo.sql` INSERTs, then ran the full
API suite. **437 of 438 passed** — the only failure was the status-stream flake (E-5), which is
unrelated and reproduces on an untouched tree.

But `tsc` found a reference my grep had missed, and `docs/outstanding-tasks.md` misses it too:

```
apps/api/src/db/entities/participants.ts:185
      chatLastReadMessageId: participants.chatLastReadMessageId,
```

It is selected by `listParticipants` — the admin/staff directory read — and **never read back**
anywhere. A dead field inside a live query. The task list's "touches `schema.sql`, the Drizzle
schema in `db/schema/{identity,teams}.ts`, and four `seed-demo.sql` INSERTs" is therefore
incomplete; without this fifth file the build does not compile. *(The tree was restored
afterwards; nothing from this experiment is committed.)*

### E-5 · The `status-stream.test.ts` flake is **diagnosed**. It was never a timing problem.

The housekeeping note says the flake is "mitigated, not diagnosed" — the `waitFor` budget went
from 10 s to 30 s — and that "if it returns, that message is the diagnosis." It returned, and
the message was indeed the diagnosis.

It reproduces **running that one test alone, with no coverage and no suite load** — which rules
out the timing explanation entirely. Observed rate: **1 in 10**, then **2 in 8**.

Every failure carries the same signature: the snapshot says `"teamUpSoon":false`. The socket's
own participant is *not* in the up-soon window at connect, so the frame it waits for can never
arrive. No budget could ever have fixed it.

The cause is the test's captain selection, in `'tells a team when it crosses into the up-soon
window, once'`:

```ts
const front = fixtures[0] as FixtureView;
const captain = front.teamAId === fixture.teamAId ? fixture.captainA : fixture.captainB;
```

That `describe`'s `beforeAll` seeds **three** teams — `seedTournamentReady`'s A and B, plus an
`outsider` with a team of their own — so the round robin has three fixtures, and the draw is
**shuffled with crypto randomness** (`schedule.ts:51`). When the shuffle puts
`outsider v teamA` at the front, the condition is false, the test picks **captainB** — whose
team is not in the front fixture and so is not in the up-soon window — and waits forever for a
frame addressed to somebody else.

Instrumented across 8 runs, the correlation is perfect and has no exceptions:

```
FAIL | front= 5790ved3c | teamA= ed3c teamB= d194 | picked= captainB(teamB) | inFront= NO
pass | front= 0e51v483a | teamA= 4147 teamB= 0e51 | picked= captainB(teamB) | inFront= YES
pass | front= d08av66af | teamA= 66af teamB= d08a | picked= captainB(teamB) | inFront= YES
pass | front= e677vc232 | teamA= c232 teamB= e677 | picked= captainB(teamB) | inFront= YES
pass | front= 0a91v39f0 | teamA= 39f0 teamB= 0a91 | picked= captainB(teamB) | inFront= YES
pass | front= 13b8vf7c3 | teamA= 13b8 teamB= f7c3 | picked= captainA(teamA) | inFront= YES
pass | front= 409cv9232 | teamA= 409c teamB= 9232 | picked= captainA(teamA) | inFront= YES
FAIL | front= 8d25v6dfb | teamA= 6dfb teamB= 213e | picked= captainB(teamB) | inFront= NO
```

Exactly one of the six possible front orientations fails — `outsider v teamA` — which predicts
~17% and matches the observed 1/10 and 2/8.

**The fix is in the test, not the server, and it is a few lines.** Build a team-id → captain map
covering all three teams (the outsider is the captain of their own team) and take
`captainByTeam.get(front.teamAId)`, rather than assuming the front fixture involves `teamA`.
`front` must stay `fixtures[0]`, because the up-soon window is only as wide as the enabled court
count. **½ day including watching it fail deliberately**, and the 30-second budget can then go
back down to something that fails fast.

---

## 1. Seven findings that change the queue before you start

### F-1 · A5's one-line summary contradicts the shipped code — settle this first

`docs/outstanding-tasks.md` files A5 under **"Decided with no code behind them"** and summarises
it as:

> **A5 · The 0 – 0 rule is confirmed as shipped** — the draw rate to both. Three rates: win,
> loss, draw.

There is no draw rate in this codebase, and there never was.

- `schema.sql:246-247` has exactly two: `tournament_win_points`, `tournament_loss_points`.
- `PointConfigInput` (`db/entities/pointConfig.ts`) carries two.
- `leaderboard.ts:47-58` pays `winPoints` to the roster whose team id matches `winner_team_id`
  and `lossPoints` to the other. There is no third branch and no null-winner branch.
- `routes-tournament/index.ts:314` **refuses** to complete a level match:
  `if (match.scoreA === match.scoreB) throw badRequest(messages.drawCannotEnd)` — *"The score is
  level, so there is no winner yet. Add the deciding point first."*
- ADR-114 states the rule in the same words: *"A level score names no winner, so completing a
  tied match is refused."*
- **And the database enforces it.** `schema.sql:288` carries
  `CHECK (status <> 'completed' OR winner_team_id IS NOT NULL)` — a completed match without a
  winner is not merely unimplemented, it is structurally impossible.

So A5 as written is either a drafting slip or half a day of unplanned work hiding in the bucket
marked "needs nothing written":

- **Reading (a), the one I believe is intended:** A5 confirms ADR-114's *unscored* rule — a
  `0 – 0` match is one nobody scored, the human names the winner, and the feed prints no score
  line. Nothing to build. **Fix the sentence in `outstanding-tasks.md`.**
- **Reading (b), if a real draw rate is wanted:** a new `tournament_draw_points` column with its
  `CHECK`, **dropping the `status <> 'completed' OR winner_team_id IS NOT NULL` constraint**, a
  contract field, a `PointConfigView` field and a control on S36, a third branch in the
  `participantPoints` CTE keyed on `winner_team_id IS NULL`, the removal of `drawCannotEnd`, a
  completion path that writes a null winner, and the knock-on into ADR-115's standings fold (a
  draw is unrepresentable there too). **Call it 2 days**, and it relaxes a schema invariant on
  the eve of an event — the kind of change that turns a data bug into an unnoticed one.

**Recommendation: (a).** Correct the line and move on. But it cannot be left ambiguous, because
the two readings differ by two days and by a schema edit.

### F-2 · Step ⑤ is not a client-only change — the snapshot cannot carry the floor

The task list bills the up-soon floor as "`localStorage` holds the last `fixtureId` toasted".
The stream frame can support that today: `TeamUpSoonView` already carries
`{ upSoon, gamesAway, fixtureId }` and `upSoonWatch.ts` publishes all three.

The **snapshot** cannot. `AlertsView.teamUpSoon` is a bare `boolean`, and `readAlertsFor`
collapses the answer on the way out:

```ts
const teamUpSoon =
  membership === null ? false : (await upSoonFixtureForTeam(db, membership.teamId)) !== null;
```

Every reconnect opens with that snapshot, and the poll fallback returns the same shape. So the
exact scenario the floor exists to prevent — ADR-118's restart button dropping 300 phones, all
of which reconnect and open with `teamUpSoon: true` — arrives with **no fixture id to floor
against**. The client would have to either toast (the bug) or never toast on a snapshot (which
breaks the phone that was asleep when the transition frame went out).

`useAlertsStore.applyUpSoon` discards the frame's fixture too — it keeps only
`{ teamUpSoon: boolean }` in `AlertFlags`.

**Consequence:** step ⑤ grows an API and contract edit. `AlertsView.teamUpSoon` becomes the same
shape as `TeamUpSoonView` (or gains `upSoonFixtureId` / `upSoonGamesAway` beside it),
`readAlertsFor` stops collapsing, `AlertFlags` holds the fixture, and the poll path gets the same
treatment. Small — half a day — but it is API work billed as browser work, and it is on the
critical path for the toast.

### F-3 · C3 is the largest remaining database win, larger than C1 — consider moving it up

`gallery.page` is the last per-viewer-keyed read of any size in the app:

```ts
export const readGalleryPage = cachedRead(readPhotoPage, {
  name: 'gallery.page',
  tags: [GALLERY_TAG],
  key: (sort, viewerId) => `${sort}:${viewerId ?? 'anon'}`,   // ← the viewer is in the key
});
```

Three hundred phones on the photo wall are three hundred cache entries and three hundred
executions of `readPhotoPage` (a page select plus `tallyVotes`) per TTL window. This is precisely
the fan-out ADR-125 just finished removing from the alerts path — it survives here only because
`hasMyVote` is baked into the row.

**Measured, with the alerts path as a control (E-3):** a gallery request costs **7 selects for a
new viewer against 4 for a repeat**, while alerts costs **3 either way**. At a 5-second TTL and
300 viewers that is **~900 avoidable selects every 5 seconds — ~10,800 a minute.**

C1 (ETags) saves *bytes*: a polled surface that has not changed answers 304 instead of re-sending
a body. It still costs a round trip and, crucially, it still costs **the query**, because the
ETag has to be computed from something. C3 saves the query itself, and it is the same shape
ADR-074 used for announcements.

**Recommendation:** swap C3 and C1 in the queue. C3 also makes C1 cheaper when it lands, because
a shared list has one ETag for everybody instead of one per viewer.

### F-4 · `AGENTS.md` names a schema file that does not exist

§2 and §5 both say `apps/api/src/db/snapshot.sql`. The file is `apps/api/src/db/schema.sql`.
Non-negotiable #5 ("schema changes edit `snapshot.sql` in place") therefore points at nothing.
Task 6 edits that file anyway — fix the index in the same commit.

### F-5 · `notifyUpSoon` already exists; do not rebuild it

`apps/web/src/lib/notify.ts` already has an edge-triggered `notifyUpSoon({ isUpSoon })` with
module-level dedup that survives navigation, wired from `useAlertsStore`'s `useBrowserMirror`.
B4's "plus a browser notification" half is **done**. What is missing is (a) the durable
`localStorage` floor, which the in-memory dedup cannot provide across a reload, and (b) the toast
itself. Scope step ⑤ to those two.

### F-6 · B5's pattern is already written, one directory over

`routes-team-chat/stream.ts:52` has `stillAMember()` — re-read the membership, compare the team
id, close the stream if it no longer matches — with the reasoning comment already in place.
B5 is that function copied into `routes-status/stream.ts`, applied to `team.upsoon` frames only.
Roughly twenty lines and two tests, and `teamChat.test.ts` already has the negative test to copy
("stops delivering to a socket whose owner has left the team").

### F-7 · Four PRs are open and only one is live

`#4` is the current branch and is eight ADRs stale in its body (last written at ADR-118). `#1`,
`#2` and `#3` are open against `arena/01a0eb1c`, `arena/01a0ee79` and `arena/01a0ee7b` — branches
whose work is already in `#4`'s lineage. Close them or mark them superseded; a reviewer opening
this repo today cannot tell which PR is the one to read.

---

## 2. The build queue, costed

Ordered as I would actually build it. The ordering differs from `outstanding-tasks.md` in one
place only — C3 moves ahead of C1, per F-3.

### ① B5 · `team.upsoon` re-checks membership on the frame — **½ day**

**Why first:** independent of everything, closes a correctness hole, and its pattern is already
proven.

| | |
|---|---|
| **Touches** | `apps/api/src/routes-status/stream.ts` |
| **Shape** | A `stillAMember()` closure over `participant.id` + `membership.teamId`, awaited inside `writeFrame`'s `team.upsoon` branch only. Global frames are unaffected — an announcement is addressed to everybody. |
| **Cost** | One indexed read per up-soon frame per connected member of that team. The bus topic already narrows delivery to ~5 listeners, and a team hears a handful of these a day. Negligible, and the same bargain team chat already makes per *message*. |
| **Tests** | Integration, `status-stream.test.ts`: (1) a member who leaves mid-stream stops receiving `team.upsoon`; (2) a member who stays keeps receiving it; (3) global frames keep flowing to the departed member — they are still a participant. |
| **Sabotage** | Delete the check and watch (1) fail. |
| **ADR** | ADR-126. |

**Decide while building:** does losing membership close the socket (team chat's behaviour) or
just suppress team frames? Team chat closes because the *whole room* was the authorisation. Here
the socket also carries announcements and the three social watermarks, which a teamless
participant is entitled to. **Suppress, do not close** — and say so in the ADR, because it is a
deliberate divergence from the pattern being copied.

### ② Step ④ · payload-carrying publishes, including the leaderboard (B6) — **2 days**

**Why second:** it is the largest single item and the last of the four event types; everything
downstream is smaller.

| | |
|---|---|
| **Touches** | `lib/statusBus.ts` (a `feed.match` frame + `publishFeedMatch`), `routes-status/stream.ts` (write it), `packages/contracts` (`STATUS_FEED_MATCH_EVENT`), `apps/web/src/lib/api/statusStream.ts` + `useStatusStream.ts` + `useAlertsStore.ts` or a new feed hook (`mergeById` in `lib/hooks/liveRoom.ts` already exists for this), and the publish sites. |
| **Publish sites** | The `invalidateTag` audit is the list, and it is longer than the design note's summary: `matches.ts:181,183,242,279-282,294-295,322,336`, `adjustments.ts:62`, `participants.ts:68,156`, `scans.ts:86,111,199`, `schedule.ts:110,252,265,284,347,362,494,528,647`, `courts.ts:49-50`, `announcements.ts:40,81`. **Not all of them publish a `feed.match`** — only the ones that change a match the feed shows. Sort them before writing code. |
| **The invariant** | B6's ruling, in the ADR verbatim: the push is *in addition to* the cache discipline. Every dependent read stays behind `cachedRead`; every write still voids its tag. **The acceptance test is that turning the stream off entirely leaves the app correct, only chattier** — assert that by running the feed e2e with `EventSource` stubbed out. |
| **Tests** | Integration: a completion publishes exactly one frame carrying the rendered `MatchView`; a void publishes a frame and the merged list replaces the row in place; **zero database reads happen on the publish path** (assert by counting, not by inspection); a publish with no subscribers does no work (`hasStatusSubscribers`). Web: `mergeById` replaces by id and orders by UUIDv7; a frame for a match the client has never seen is inserted, not dropped. |
| **The audit half** | Part of this step is proving every new publish site has its matching `invalidateTag`. Do it as a **13th rule in `scripts/check-standards.mjs`**, not as a review note — the design doc already predicted the forget-to-publish risk, and this repo's answer to "somebody will forget" is a machine check. |
| **ADR** | ADR-127. |

**The leaderboard half is cheaper than it looks.** ADR-120 moved live scores onto
`LIVE_MATCH_TAG`, so `SCOREBOARD_TAG` now voids on completion only — a few dozen times a day. The
throttling question answered itself; do not reintroduce it.

### ③ Step ⑤ · the up-soon floor, then the toast (B4) — **1½ days** *(was ½ — see F-2)*

**Build the floor before the toast.** Without it, ADR-118's restart button sets off every phone
in the building at once for news they already had.

| | |
|---|---|
| **Touches (server, per F-2)** | `packages/contracts/src/wire.ts` (`AlertsView` carries the fixture), `apps/api/src/lib/alerts.ts` (stop collapsing to a boolean), `db/entities/schedule.ts` if `upSoonFixtureForTeam` needs to return `gamesAway` to this caller. |
| **Touches (client)** | A new `apps/web/src/lib/storage/upSoonStore.ts` — **its own module**, because `check-standards.mjs`'s `storage-ownership` rule requires each key to sit behind the module that owns its meaning. Model it on `announcementStore.ts`: one key `psd.upsoon.floor.v1`, a defensive `parse`, forward-only advance, cleared at sign-out. Then `useAlertsStore` holds the fixture in `AlertFlags`, and the toast fires only when `fixtureId !== floor`. |
| **The toast** | `AnnouncementToast` is the precedent and has a test file already. Copy to the second toast kind, with the `gamesAway` copy the frame affords — *"You're up next"* at 0, *"One game away"* at 1. **Copy goes in `packages/contracts/src/messages.ts`**, never inline — `copy-ownership` enforces this. No sound (B4). |
| **Tests** | Storage unit tests mirroring `announcementStore.test.ts` (malformed value → absent; forward-only; sign-out forgets). Hook test: two snapshots carrying the same fixture toast once. **The restart test is the one that matters** — simulate a reconnect snapshot after a toast and assert silence. e2e: the toast appears, is dismissible, and does not return on reload. |
| **Sabotage** | Remove the floor and watch the reconnect test fail. |
| **ADR** | ADR-128, and it must record the contract change F-2 forces. |

### ④ C3 · the `GalleryPhotoView` overlay — **1 day** *(moved up, per F-3)*

| | |
|---|---|
| **Touches** | `db/entities/gallery.ts` (split `readPhotoPage` into a viewer-free list and a `myVotes(viewerId)` set), `views/gallery.ts` (`hasMyVote` leaves `galleryPhotoView`), `routes-gallery/index.ts`, `packages/contracts` (`GalleryPhotoView` loses `hasMyVote`; the response gains a `myVotes: string[]` block), `apps/web/src/lib/hooks/useGallery.ts` (join the two client-side). |
| **Shape** | One shared cached read keyed `${sort}` with `GALLERY_TAG`; one small per-viewer read of the viewer's own vote ids, which is an index-only scan and does not need a memo at all. Same shape ADR-074 used for announcements and for the same reason. |
| **Payoff** | 300 cache entries → 1. The vote tally inside `tallyVotes` stops being recomputed per viewer. |
| **Tests** | Integration: two different viewers share one cached list (assert the query count, which the harness can already do); each still sees their own `hasMyVote`; a vote by viewer A does not change viewer B's overlay but *does* change the shared count. Negative: a staff viewer gets an empty overlay rather than somebody else's. |
| **ADR** | ADR-129. |

### ⑤ C1 · conditional requests on the polled surfaces — **1 day**

| | |
|---|---|
| **Touches** | One new helper in `apps/api/src/lib/http.ts` — there is no ETag code there today; the only ETags in the repo are `galleryStore.ts:119-168`, which are for immutable binaries and are the wrong shape to generalise from. |
| **Shape** | `respondCached(c, body)`: hash the serialised body, set `etag`, compare `if-none-match`, return a bodyless 304 on a match. **One helper, zero per-route hand-rolling** — that is the decision, and a second hand-rolled ETag anywhere should fail review. |
| **Surfaces** | Whatever still polls after ④: `useBoard` (leaderboard), `useCourtConsole`, `useFringeStation`, `useSwagStation`, `useGalleryModeration`, and `useAlertsStore`'s fallback. Staff surfaces stay on polls by C4's ruling, so they are the main beneficiaries. |
| **Honest limit** | A 304 still costs the query that produced the body to hash. Pair it with the `cachedRead` the surface already has, or it saves bytes and nothing else. |
| **Tests** | One shared test over the helper (identical body → 304, changed body → 200 with a new ETag, absent header → 200), plus one round-trip per surface. |
| **ADR** | ADR-130. |

### ⑥ Drop the two dead read-marker columns — **½ day**

| | |
|---|---|
| **Touches** | `db/schema.sql:86-87,120`; `db/schema/identity.ts:53`; `db/schema/teams.ts:29`; `db/seed-demo.sql:13,54,109,150` (four INSERT column lists); **`db/entities/participants.ts:185` — missing from the task list, and `tsc` fails without it (E-4)**; the explanatory aside in `apps/web/src/lib/storage/feedReadStore.ts:12` becomes past tense. |
| **Confirmed dead, by removal** | Not by grep — the columns were actually deleted and the full API suite run: **437/438 passed**, the only failure being the unrelated status-stream flake (E-5). `chatLastReadMessageId` survives solely as a selected-but-never-read field in the admin directory query. |
| **Watch for** | `scripts/demo-participants.dump.json` and `scripts/record-demo-seed.mjs` regenerate the seed; re-record rather than hand-editing, or the next `npm run demo:record` puts them back. |
| **Free win** | `findActiveMembership`'s generated SELECT currently lists `last_read_message_id` on every call — it appears in the PGlite error text in the test log. Dropping the column shortens the hottest query in the app. |
| **ADR** | ADR-131, and fix F-4's `snapshot.sql` reference in the same commit. |

### ⑦ D2 and D3 · third-place match and champion bonus — **2 days**

Two unrelated features sharing a queue slot; split them in the commits.

**D3 (champion bonus) — ~¾ day.** A `tournament_champion_points` column (default 0, `CHECK >= 0`),
a `PointConfigView` field, a control on S36, and a fourth branch in the `participantPoints` CTE.
**The interesting question is where it attaches:** the leaderboard pays per *participant* from
roster snapshots, so the bonus has to resolve to a roster — use the winning team's final match
roster snapshot, and say so in the ADR, because "the team that won" and "the people on the team
when it won" diverge if anybody left afterwards. Snapshot at write time (non-negotiable #7).

**D2 (third-place match) — ~1¼ days.** A `thirdPlaceMatch: boolean` on the tournament,
**default off** (it costs a court slot exactly when the day is running latest). It is a knockout
fixture whose two seats are fed by the *losers* of the semis, which is a feeder direction
`schedule.ts`'s knockout builder does not currently express — check `findDownstream` and
`cascadeWinnerEdit` before estimating further; ADR-089's cascade must not place a third-place
loser into a final.

**Tests:** D3 — the bonus lands on exactly the champion roster and exactly once; voiding the
final removes it. D2 — the preview shows the extra slot only when enabled; a corrected semi
cascades into the third-place fixture *and* the final without crossing them.
**ADRs:** ADR-132 (D3), ADR-133 (D2).

### ⑧ F1 · a ten-second undo on a mis-scan — **1 day**

| | |
|---|---|
| **Today** | Only a superadmin can void (`routes-superadmin/corrections.ts`). A facilitator who scans the wrong person has no remedy at the station. |
| **Shape** | A facilitator-scoped void on the scan **they** just wrote, with a server-enforced window. Three guards, all server-side: the actor must be the scan's own `facilitator_id`; `scanned_at` must be within the window; the scan must not already be voided. The client's countdown is decoration — a ten-second timer in a browser is not a security boundary. |
| **Reuses** | `setScanVoided` and `appendVoidAudit` already exist and already write a `VoidAuditEntry` with a reason. Supply a canonical reason (`messages.scanUndoneAtStation`) rather than prompting a wet-handed facilitator for free text. Void stays reversible by a superadmin (non-negotiable #8) — the undo is a void, not a delete. |
| **Offline** | ADR-009 queues scans that cannot reach the server. An undo of a *queued* scan should drop the queue entry rather than post a void for a row that does not exist yet. That branch is the one most likely to be missed; write its test first. |
| **UI** | On the outcome line in `useFringeStation`'s `ScanOutcome`, as a sixth state or an affordance on `awarded`. Huge button, text only (the facilitator theme). |
| **Tests** | Positive: the scanner undoes within the window and the leaderboard drops the points. **Wrong-party negative (mandatory):** a *different* facilitator's valid session is refused — this is the session-scoping test non-negotiable #2 requires. Expiry: the eleventh second is refused. Audit: the entry exists with the canonical reason. Offline: the queued entry is removed and nothing is posted. |
| **ADR** | ADR-134. |

---

## 3. C2 · the service worker

### 3.1 The arithmetic has changed — and it argues *against* the worker more strongly

The C2 write-up says the worker's unique remaining contribution is "the handful of revalidation
requests per phone per reload, plus the genuinely offline case." I measured the handful, and it
is not a handful of revalidations — **it is ~29 full re-downloads, ~38 kB, on every single page
load, and a service worker is the wrong tool for all of them** (E-1).

`apps/api/src/webStatic.ts:30-36` decides caching by one test:

```ts
function cacheControlFor(filePath) {
  return filePath.includes(`${sep}assets${sep}`)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}
```

Only Vite's hashed bundle output lives under `assets/`. Everything in `apps/web/public/` is
copied to the dist **root** and therefore gets `no-cache` — and, because `serveFile` sets no
`etag` and no `last-modified`, there is no validator with which to satisfy that revalidation.
The browser must refetch the whole body. Every time.

- `public/motifs/` — **193 SVGs**
- `public/scene/` + `public/scene-2x/` — **30 PNGs**

And every one of those URLs is *already content-addressed by the application*:

```ts
// apps/web/src/lib/motifs.ts:221
return `/motifs/${name}.svg?v=${MOTIF_VERSION}`;      // MOTIF_VERSION = content hash
// apps/web/src/lib/sceneArt.ts:15
panorama: { src: '/scene/panorama.png?v=58892259', ... }
```

ADR-014/067 built the versioning precisely so "a redrawn motif can never be served from a stale
cache under its old name" — and then the server refuses to let any cache hold them at all.

**So the first thing to do about C2 is not to build C2.** The fix has two parts, and the second
is the one my first draft missed:

**(a) Grant `immutable` to the content-versioned public directories.** Their URLs already carry
a content hash, which is exactly the safety argument `assets/` relies on:

```ts
const IMMUTABLE_DIRS = [`${sep}assets${sep}`, `${sep}motifs${sep}`, `${sep}scene${sep}`, `${sep}scene-2x${sep}`];
```

**(b) Give everything else a validator**, so that `no-cache` can actually produce a 304 instead
of a full re-send. `index.html` is 745 bytes, so the saving is small — but a `no-cache` response
with no `etag` is a cache directive the server has made impossible to honour, and that is worth
correcting on its own terms. `galleryStore.ts:119-168` already has the pattern to copy, and the
helper is the same one C1 wants in §2 ⑤.

**Three hours including tests** — `web-static.test.ts` already covers this function and already
asserts the `assets/` and `no-cache` branches, so the new cases slot straight in. Together they
capture the whole of the "zero-request repeat loads" benefit the worker was being weighed for,
with none of the un-purgeable-cache risk.

**Guard it with a test**: `/sw.js` must keep `no-cache` (E-2), and a careless `IMMUTABLE_DIRS`
entry must not be able to catch it.

Call it **ADR-135**, and schedule it as item ⓪ — ahead of everything in §2. It is the single best
ratio of benefit to risk left anywhere in this queue.

### 3.2 What the worker would still buy after that

Exactly one thing: **true offline paint.** A phone with no signal that reloads currently gets the
browser's offline page. With a worker it gets the shell from cache and the last-known data from
the ADR-009 `localStorage` layer — "a few minutes stale" instead of "broken".

That is a real benefit at a beach venue. It is also the *only* remaining one, and it has to be
weighed against a failure mode that lands on the day you cannot intervene.

### 3.3 If you build it: the safe shape, in five phases

Written so the decision is costed, not so it is recommended. Total: **4–5 days**, and the last
phase cannot be compressed.

**Phase 0 — prerequisites (½ day).**

- **Hand-write `apps/web/public/sw.js`. Do not add `vite-plugin-pwa`.** A generated worker is a
  black box, and this repo's discipline (`AGENTS-testing.md` §1.1) is to sabotage a production
  line and watch the test fail — you cannot sabotage a plugin's generated output meaningfully.
  Hand-written also keeps the file unhashed and at the dist root, which is where a worker must be
  served from to claim root scope.
- **Fix the `index.html` fallback for `/sw.js` first — this is a blocker, not a detail (E-2).**
  Today `GET /sw.js` returns **200 `text/html`**, because `withStaticWeb` falls back to
  `index.html` for every unmatched GET. Registration would fail on the MIME type, which is
  survivable; the un-survivable half is that **you could not later withdraw the worker by
  deleting the file**, since a re-fetch would return 200 HTML rather than the 404 a browser
  needs in order to drop it. The one escape hatch C2's risk analysis depends on is currently
  welded shut. `withStaticWeb` must 404 a missing `/sw.js` (an explicit non-fallback list)
  before a single line of worker code is written.
- **Verify the worker's own cache headers.** `sw.js` lands at the dist root, so `cacheControlFor`
  gives it `no-cache` — which is exactly right and must stay right. Pin it with a test, because
  §3.1 changes that function and a careless `IMMUTABLE_DIRS` entry could catch it.
- A build-time version stamp in the worker, from the same mechanism as `MOTIF_VERSION`.

**Phase 1 — assets only, never data (1 day).**

- Precache the shell: `index.html`, the hashed `assets/*` bundle, and the motif/scene sets.
- Cache-first for anything under the immutable directories (safe by construction — the URL is the
  content hash). Network-first with a cached fallback for `index.html`.
- **Nothing under `/api` is ever cached.** Not the leaderboard, not the feed, not the gallery
  listing. The `localStorage` layer already provides the warm data paint and it is purgeable by
  code you ship; a worker-cached API response is not. Enforce it with a standards rule, not a
  comment.

**Phase 2 — the update ritual (1 day).**

- **No `skipWaiting`.** Swapping code under a running page can leave a half-old, half-new app the
  moment any chunk is lazily loaded, and the build is one chunk today but will not always be.
- Detect `registration.waiting` and show an explicit "A new version is ready — tap to reload"
  banner. `postMessage({type:'SKIP_WAITING'})` only on the tap, then `clients.claim()` and reload.
- This is also the answer to "a phone with the app open all day never takes the update": it is
  told, and the telling is a product surface with copy in `@psd/contracts`, not a silent lifecycle
  event.

**Phase 3 — the kill switch (½ day).**

- The worker checks a tiny server flag before serving anything from cache — reuse the operations
  switch already in `routes-superadmin/system.ts` rather than inventing a second one. If it says
  off: `caches.delete(...)` everything, `registration.unregister()`, pass through to the network.
- **State the limit honestly in the ADR.** A kill switch needs the network, so it cannot rescue a
  phone that is offline. But the incident it exists for — a bad deploy on event morning — is one
  where the network is fine and the *cache* is the problem. It covers the case you actually fear.

**Phase 4 — the tests, and the ones that are impossible (1½–2 days).**

Playwright journeys, all with reloads, because nothing below is reachable from a unit test:

1. First visit installs; second visit paints with zero network requests for assets (assert via
   `page.route` counting, not by eye).
2. `context.setOffline(true)` then reload → the shell paints and the data is the `localStorage`
   copy. This is the journey that justifies the whole feature; write it first and watch it fail.
3. Deploy a new build → the banner appears, the old page keeps working until the tap, the tap
   loads the new version.
4. Flip the kill switch → the next navigation unregisters and serves from the network.

**And write down what cannot be tested**, because pretending otherwise is the failure: a stale
worker on a phone that has had the tab open for six hours is browser state over time and is not
reproducible in CI. That residual risk is the real argument, and it should be in the ADR rather
than discovered on the day.

### 3.4 Recommendation

**Unchanged: not before the event — and after §3.1 lands, the case is weaker still.**

The honest position in one line: the worker's measurable win was the repeat-load asset fetches,
and **two hours of `cacheControlFor` captures them with no new failure mode at all**. What remains
is offline paint, which costs four to five days, introduces the one cache you cannot purge from
the server, and whose worst failure is invisible until the morning you have three hundred phones
you do not control and no support channel.

**The gate I would put on it, if you want one:** build it only when (a) §3.1 has shipped and the
remaining traffic has been measured rather than estimated, (b) there is a staging environment
where the update ritual can be rehearsed against a real deploy, and (c) there are **at least two
clear weeks** before the next event. Never during the week of one.

---

## 4. The schedule

| # | Item | Size | Depends on | ADR |
|---|---|---|---|---|
| ⓪ | **Cacheable static assets: immutable dirs + a validator** (§3.1) | 3 h | — | 135 |
| ⓪b | **Fix the `status-stream.test.ts` flake** (E-5) — diagnosed, cause known | ½ d | — | — |
| — | *Settle F-1 (A5's draw rate)* | decision | — | — |
| ① | B5 · membership re-check on the frame | ½ d | — | 126 |
| ② | Step ④ · payload publishes + leaderboard | 2 d | — | 127 |
| ③ | Step ⑤ · up-soon floor, then the toast | 1½ d | ② (same frame plumbing), F-2 | 128 |
| ④ | C3 · gallery overlay | 1 d | — | 129 |
| ⑤ | C1 · shared ETag helper | 1 d | ④ (shared list = one ETag) | 130 |
| ⑥ | Drop the dead read-marker columns | ½ d | — | 131 |
| ⑦ | D3 champion bonus / D2 third-place | ¾ d + 1¼ d | — | 132, 133 |
| ⑧ | F1 · ten-second station undo | 1 d | — | 134 |
| — | Housekeeping: PR #4 body, close #1–#3, `AGENTS.md` §2/§5 | 2 h | — | — |
| ⟲ | C2 · service worker | 4–5 d | gated — see §3.4 | — |

**About 10 working days** for everything except C2, and the items are independent enough that
⓪, ⓪b, ①, ④, ⑥, ⑦ and ⑧ can be done in any order or in parallel. The only real chain is
**② → ③**, and the only shared-file contention is `routes-status/stream.ts` between ① and ②
(and `status-stream.test.ts` between ⓪b and ①, which is an argument for doing ⓪b first —
you do not want to be adding B5's tests to a file that fails one run in five).

### If the day arrives before the queue empties

Cut in this order, and the reasoning is "what does the event actually need":

1. **C2** — already recommended out.
2. **D2 third-place match** — it is default-off and costs a court slot when the day runs latest.
3. **C1** — saves bytes once C3 has saved the queries.
4. **D3 champion bonus** — a nice-to-have on a leaderboard that is already correct.

Keep, whatever happens: **⓪** (two hours, helps every phone), **①** (a correctness hole),
**③** (the restart button is a live feature and without the floor it buzzes the building), and
**⑧** (a facilitator with no undo means a superadmin interrupt during the event).

---

## 5. Housekeeping carried from `outstanding-tasks.md`

- **`status-stream.test.ts` is diagnosed — close this item.** It is not a timing flake: it
  reproduces on one test alone with no load, at roughly 1 run in 5, and the cause is a captain
  chosen on the assumption that the front of a *randomly shuffled* draw involves `teamA` or
  `teamB`. Full evidence and the fix in **E-5**. The 30-second `waitFor` budget was treating a
  symptom that was never timing, and can come back down once the selection is fixed. The
  improved failure message did its job exactly as intended — it printed the snapshot showing
  `"teamUpSoon":false`, which is the whole diagnosis.
- **PR #4's body** is eight ADRs stale, and three superseded PRs are still open (F-7).
- **`AGENTS.md` §2/§5** point at `snapshot.sql` (F-4) — fix with item ⑥.
- **`docs/outstanding-tasks.md` A5** needs the correction from F-1 whichever way it is ruled.

---

## 6. Second review — findings confirmed, and five amendments

**Added 2026-10-03** by a second pass over the same tree (merged to
`arena/01a10097-special-fiesta`, `npm install && npm run verify` → exit 0, independently: 945
web tests across 96 files, API suite green, coverage ratchet held). The purpose of the pass was
to check this plan against the code rather than to restate it, so what follows is only where the
second reading adds or disagrees.

### 6.1 The four load-bearing findings are confirmed

Checked against the source, not against the prose:

| Finding | Verdict | Evidence re-read |
|---|---|---|
| **F-1** · no draw rate exists | **Confirmed.** `schema.sql:246-247` has exactly `tournament_win_points` and `tournament_loss_points`; there is no `tournament_draw_points` anywhere in `schema.sql`, `db/schema/tournament.ts:29`, or `packages/contracts/src/schemas.ts:443`. ADR-114's own text says a level score is *refused*, not paid. A5's "three rates: win, loss, draw" is a drafting slip. | ✔ |
| **F-2** · the snapshot cannot carry the floor | **Confirmed, and it is the most consequential item in this document.** `AlertsView.teamUpSoon` is a bare `boolean` (`wire.ts:430`) and `readAlertsFor` (`lib/alerts.ts`) collapses the fixture away on the line `(await upSoonFixtureForTeam(...)) !== null`. The stream frame has the fixture; the snapshot and the poll do not. Step ⑤ is API work. | ✔ |
| **F-3** · C3 is a bigger win than C1 | **Confirmed.** `db/entities/gallery.ts:130-134` puts `viewerId` in the cache key. The reasoning that a 304 still pays for the query is right, and it is the reason the swap is correct rather than merely tidy. | ✔ |
| **§3.1** · the motif/scene headers | **Confirmed and this is the headline.** `apps/api/src/webStatic.ts:33-37` grants `immutable` only to `${sep}assets${sep}`; `ls` gives **193** files in `public/motifs` and ~~33~~ **30** across `public/scene` + `public/scene-2x`, every one already content-addressed (`?v=MOTIF_VERSION`). ~~Two~~ **Three** hours of header work genuinely does capture most of what C2 was being weighed for — **and it understates the problem: see E-1, there is no validator either, so these are full re-downloads rather than 304s.** Item ⓪ stands, in two parts. | ✔ |

### 6.2 Five amendments

**A · F-4 is bigger than one filename.** `AGENTS.md` §5's directory tree is also missing six
route directories that exist — `routes-chat/`, `routes-gallery/`, `routes-staff/`,
`routes-status/`, `routes-swag/`, `routes-team-chat/` — and the whole `views/` layer. An index
that omits the status-stream directory is an index that sends the next agent to the wrong place
on the item at the top of this queue. Fix all of it with item ⑥, not just the `snapshot.sql`
line.

**B · ① should unsubscribe, not just suppress.** The plan's call — suppress the team frame,
keep the socket — is right. Add one step: on the first failed check, also run the team topic's
unsubscribe. Otherwise a departed member's socket keeps paying an indexed membership read for
every frame their old team generates for the rest of the day. It is three lines on top of the
guard and it turns an unbounded cost into a one-off one.

**C · ⑦ D3 — consider the adjustments ledger instead of a fourth CTE branch.** The plan routes
the champion bonus through a new branch in the `participantPoints` CTE. The alternative is to
write it as an **adjustment** (`db/entities/adjustments.ts`, ADR-117) at tournament close. The
trade-off, stated so it can be decided rather than defaulted:

- *CTE branch:* the bonus is derived, so it cannot drift from the config and it needs no write
  path. But it is a **fourth scoring source** in the hottest aggregate in the app, and
  double-count bugs live in exactly that kind of change.
- *Adjustment row:* void/unvoid, the corrections ledger and the audit trail all come free
  because they already exist for adjustments; the bonus becomes visible as a line a human can
  read and argue with, which is what ADR-117 built the ledger for. The cost is that it is a
  write, so it needs an idempotency guard against closing a tournament twice, and changing the
  config afterwards does not retroactively change the award.

Given the day is a single event with a closing ceremony, the award being a *recorded decision*
rather than a derived number reads better and is cheaper to correct in front of an audience.
Recommend the adjustment, but the ADR must say which and why.

**D · ⑤ C1 — pin the ETag's byte-stability.** `respondCached` hashing the serialised body is the
right shape, but it only pays if the body is byte-identical between unchanged reads: same key
order, same number formatting. The views in `apps/api/src/views/` build plain object literals in
a fixed order, so it holds today — and nothing stops a future `Object.entries(...).map(...)` from
quietly breaking it, at which point every poll gets a fresh ETag and the feature becomes pure
overhead that no test notices. Add one assertion to the shared helper test: two consecutive
reads of an unchanged surface produce the **identical** ETag string. Cheap, and it is the only
thing standing between this feature and silently doing nothing.

**E · C2 Phase 3 — the kill switch must fail open.** The check should be
`fetch(..., { cache: 'no-store' })` with a short timeout, and **a network failure must mean
"keep serving from cache"**, never "unregister". Failing closed would turn the offline case —
the single benefit the worker exists for (§3.2) — into the thing that disables it. The switch
can then only ever fire when the server is reachable, which is precisely the bad-deploy-on-event-
morning incident it is for, and is the honest limit §3.3 already asks the ADR to record.

### 6.2b Where the measured pass (§0.5) and this one disagree

The two reviews were independent and agree everywhere that matters. Three reconciliations:

1. **Scene file count: 30, not 33.** `ls public/scene public/scene-2x | wc -l` counts the two
   directory headers and a blank line. It is 15 + 15. The total of content-versioned files
   served uncacheable is **223**, not 226.
2. **Item ⓪ is two hours plus a second half.** This pass found the missing `immutable`; the
   measured pass (E-1) found that `serveFile` emits **no `etag` and no `last-modified` either**,
   which it proved by issuing a conditional request and receiving a 200 with a full body. So the
   cost is not "a revalidation per asset" but "a full re-download per asset", and the fix needs a
   validator as well as an immutable list. **Three hours.**
3. **Amendment E and finding E-2 point at each other, and the combination is the real
   constraint.** Amendment E is right that the kill switch must fail open. But a fail-open switch
   can only ever fire when the server is reachable — so the *other* retirement path, making the
   worker's own script 404, becomes the only unconditional way out. E-2 shows that path is
   currently closed: `GET /sw.js` returns **200 `text/html`** from the SPA fallback, so deleting
   the file would not retire anything. **Taken together: with the switch failing open and the
   script URL unable to 404, a bad worker would have no reliable withdrawal path at all.** Both
   must be fixed in Phase 0, and neither is optional.

### 6.3 Nothing else changed

The queue, the ordering (⓪ first, then ① → ②  → ③ with C3 ahead of C1), the sizes and the C2
recommendation all survive the second reading unchanged — and the measured pass in §0.5 did not
disturb them either, beyond adding **⓪b** (the now-diagnosed status-stream flake, E-5) and a
fifth file to item ⑥ (E-4). The one decision still owed by a human
is F-1's reading of A5 — (a) a drafting slip, or (b) two days and a schema edit — and it should
be settled before anything in §2 starts, because it is the only item that could change the
shape of the tournament tables.
