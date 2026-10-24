# Task queue — working through the outstanding work

**Opened 2026-10-03.** The execution checklist derived from
`docs/design/outstanding-tasks-implementation-plan.md` (the plan, with sizes and reasoning),
which in turn comes from `docs/outstanding-tasks.md` (the queue) and
`docs/decisions-outstanding.md` (the rulings).

This file is the *progress record*. Each task is struck off here in the same commit that lands
it, so the state of the work is always readable from the tree rather than from chat.

**Conventions.**

- `[ ]` not started · `[~]` in progress · `[x]` landed · `[—]` deliberately not done
- ADR numbers are assigned **in the order items actually land**, sequentially from ADR-126
  (`docs/addenda/ADDENDA.md` currently ends at ADR-125). The plan's provisional numbers are
  ignored where the build order differs — append, never insert.
- Every landed task carries: tests written first, the ADR in the same commit, and a commit
  message naming the validation layers that actually ran (`AGENTS-workflow.md` §4).

---

## Decision still owed by a human

- [x] **`publishChatHidden` · the unread dot after a hide — SHIPPED 2026-10-04 as ADR-153.**
  The organiser chose the wider brief (fix the class, not the instance) and it paid: the team
  rooms turned out to have no hide at all, while the **gallery** had the identical missing
  publish. The naive fix was a no-op — the client's watermark merge is monotonic, so lowering
  it needed a new retraction frame the client assigns rather than compares.

- [x] **Captain-hide for team chat — SHIPPED 2026-10-04 as ADR-155.** The room had `hidden_at`,
  a partial index on it, and nothing that ever wrote either, because the only actor with
  moderation authority elsewhere in the app is barred from reading the room. The captain gets
  the hide; a non-captain gets 403 and a roster line gets 409, because ADR-154 made those
  lines the only record of a staff repair. Two frames (`hidden` + `team.chat.retracted`), now
  enforced by a `push-pairing` entry.

- [x] **ADR-152 follow-ups (b) and (c) — SHIPPED 2026-10-04 as ADR-156.** Every surface that
  reports a result, re-read against a day in which a draw exists. Three were lying: the feed
  line showed a finished draw as a live fixture, two record tallies counted a draw as a loss
  (`losses = played - wins`, true only while a finished match had a winner), and the view
  boundary was dropping the `draws` column the fold had carried since ADR-152. ADR-136's
  champion CTE needed no change — its `winner_team_id IS NOT NULL` filter already stops the
  `ELSE` branch crowning the runner-up — and is now pinned by a test, because the line is
  load-bearing for a reason it was not written for. ADR-114's "the score IS the result" made
  the hall screen's finished rows correct for free.

- [x] **ADR-152 follow-up (a) · correcting a result to or from a draw — SHIPPED 2026-10-04 as
  ADR-157.** The organiser ruled the desk and the court are one surface: if two teams have the
  same score it is a draw, whoever is typing. So `POST /matches/:id/winner` became
  `POST /matches/:id/result`, taking the whole result and validated by the completion route's
  own `assertResultMatchesScore` — moved into a shared module, with `stageCanDraw` and
  `readMatchOutcome` moved further into `@psd/contracts` because the court console had a third
  copy. The dialog lost its winner picker: it asks for the score and says what the score means.
  Closes a gap older than the draw that exposed it — until now **no route anywhere could change
  a score after a match ended**, so a marshal's typo was permanent.

- [x] **Gap #1 · roster repair — SHIPPED 2026-10-04 as ADR-154.** Five actions on the team
  directory (move, add, remove, transfer captaincy, force-unlock), each behind a confirmation
  that names its consequence. Two of those consequences are invisible from the directory row —
  the team being on court (the mover loses that match's points, ADR-005) and this being the
  last member (removing them disbands the team) — so remove and move **read**
  `GET /api/admin/teams/:teamId/repair-context` before they ask. The design's sixth action,
  withdrawal, turned out not to exist: the ruling that it must refuse while the team has
  members leaves it no reachable state. Design: `docs/design/roster-repair.md`.

- [x] **F-1 · A5's "draw rate" — RULED (b) and SHIPPED 2026-10-04 as ADR-152.**
  *(The earlier "proceeded on (a)" reading is overruled. This is now a ~2¾ d build that
  reverses ADR-114 and the `winner_team_id IS NOT NULL` CHECK — see `docs/design/draw-rate.md`,
  whose §2 lists three places that would otherwise fail silently.)* Original framing: `docs/outstanding-tasks.md` says *"the draw rate to both.
  Three rates: win, loss, draw."* There is no draw rate: `schema.sql:246-247` has two, and
  `routes-tournament/index.ts:314` refuses to complete a level match (ADR-114). Reading (a) =
  a drafting slip, fix the sentence, zero code. Reading (b) = a real draw rate, ~2 days and a
  schema change. **Proceeding on (a)** and correcting the sentence in T1; say the word and (b)
  becomes a task instead.

---

## The queue

### T0 · Item ⓪ — stop re-downloading the content-versioned art — **✅ LANDED (ADR-126)**

The best benefit-to-risk ratio left anywhere, and it is most of what the service worker was
being weighed for. Measured, not assumed: 223 content-versioned files under `public/` are
served with `no-cache` **and no validator**, so they are re-downloaded in full on every load.

- [x] **T0a** `cacheControlFor` grants `immutable` to the content-addressed public directories
      (`motifs/`, `scene/`, `scene-2x/`) alongside `assets/`. Safe because every URL already
      carries `?v=<content hash>` (ADR-014/067). `index.html` must stay `no-cache`.
- [x] **T0b** `serveFile` emits a validator (`etag` from size+mtime, or `last-modified`) and
      honours `if-none-match` / `if-modified-since`, so everything still on `no-cache` can at
      least 304 instead of re-sending a body.
- [x] **T0c** A root-level request for a missing `.js`/`.json` 404s instead of falling through
      to `index.html`. Today `GET /sw.js` returns 200 `text/html`, which welds shut the only
      unconditional retirement path a future service worker would have (E-2).
- [x] ADR-126 + twelve new cases in `web-static.test.ts`.

### T1 · Housekeeping that unblocks reading the repo — **✅ LANDED**

- [x] **T1a** Correct A5's sentence in `docs/outstanding-tasks.md` per F-1 reading (a).
- [x] **T1b** `AGENTS.md` §2/§5 named `snapshot.sql`; the file is `schema.sql`. Fix.
- [x] **T1c** `AGENTS.md` §5's tree omitted `routes-chat/`, `routes-gallery/`, `routes-staff/`,
      `routes-status/`, `routes-swag/`, `routes-team-chat/` and `views/`. Add them.

### T2 · Fix the `status-stream.test.ts` flake at its cause — **✅ LANDED (ADR-127)**

Diagnosed (E-5): not timing. The test picks a captain assuming the front of a
cryptographically shuffled draw involves `teamA` or `teamB`; ~1 run in 5 it does not. Fix the
test, and restore the `waitFor` budget that was raised to mask it. **Do this before T3/T4**,
which both add tests to that file.

- [x] Test fixed at the cause, budget restored to 10 s, 10 consecutive green runs, and a
      sabotage run that reproduced the flake 2/10 with the original message.

### T3 · ① B5 — `team.upsoon` re-checks membership on the frame — **✅ LANDED (ADR-128)**

- [x] A per-connection `TeamGate` in `routes-status/stream.ts`, on team frames only; global
      frames unaffected.
- [x] On the first failed check it leaves the stale topic (amendment B) — so one read, not an
      unbounded series. Frame dropped, socket kept.
- [x] One test covering all three: works, then drops the team frame after leaving, then still
      delivers an announcement. Buffered frames re-checked at flush too.
- [x] ADR-128, and a sabotage that fails exactly that test.

### T4 · ② Step ④ — payload-carrying publishes, including `feed.match` (B6) *(2 d)*

✅ **LANDED — ADR-131 (server) + ADR-132 (browser).** One item deferred, see below.

- [x] `feed.match` + `leaderboard` frames, `publishFeedMatch`/`pushLeaderboard`, contract event
      names. The frame is the object the HTTP response already carries, so it costs no read.
- [x] Published at the six match write paths; the three that change a *result* push the board
      too. A score tap moves the feed and not the board (ADR-120), with a test to keep it so.
- [x] **The audit half:** the thirteenth standards rule, `push-pairing`. Written before the
      feature; it named all six sites unaided. Scoped wider than the original wording — the
      publish lives in the route and the `invalidateTag` in the entity, so a same-file rule
      would have been five-sixths false positives.
- [x] Acceptance (server side): with no subscriber at all the polled feed and board are still
      correct. The push is in addition to the cache discipline, never a substitute.
- [x] **Browser half (ADR-132):** a module-level `boardLive.ts` between the one socket and the
      board surfaces; `useMatchFeed`/`useLeaderboard` read it via `useSyncExternalStore`. An
      unseen match is inserted; a cancelled one is removed. `mergeById` was NOT reusable — it
      sorts by id, which for this list is nonsense — so `mergeMatchFeed` mirrors the endpoint's
      three ordering rules, each with its own test.
- [x] **Acceptance (browser):** done with `test-utils/eventSourceStub.ts` driving the real
      stream client, which is the same instrument one layer down.
- [—] **Playwright e2e:** deferred. This workspace cannot fetch the browsers (`playwright
      install chromium` fails against the CDN) and `npm run verify` does not run e2e, so the
      spec would have been committed unexecuted. Worth adding where the browsers are available.
- [x] ADR-131, ADR-132.

### ~~T5 · ③ Step ⑤ — the up-soon floor, then the toast (B4)~~ ✅ LANDED (ADR-133)

- [x] **Server first (F-2):** `AlertsView.teamUpSoon` is now the same `TeamUpSoonView` the live
      frame carries; `readAlertsFor` keeps the entry `upSoonFixtureForTeam` already returned
      instead of discarding it to a `!== null`.
- [x] **The floor:** `lib/storage/upSoonStore.ts`, `psd.upsoon.floor.v1`, forward-only,
      strictly-greater on the fixture id, corrupt reads as absent, cleared at sign-out.
- [x] **Then the toast:** `UpSoonToast` in the shell, sharing the announcement's overlay slot
      and yielding to it. No sound, no vibration. Copy lives with the component, beside the
      three cases `LineupsPage` already draws.
- [x] The restart test: a reconnect re-stating the same fixture toasts nobody, and neither does
      the same fixture moving from "one to go" to "up next" — the floor keys on the fixture
      alone because `upSoonWatch` republishes on `gamesAway`.
- [x] ADR-133.

### ~~T6 · ④ C3 — the `GalleryPhotoView` overlay~~ ✅ LANDED (ADR-134)

Moved ahead of C1 (F-3): measured at 7 selects for a new viewer vs 4 for a repeat, ~900
avoidable selects per 5-second window at 300 viewers.

- [x] Shared list keyed by sort only (`key: (sort) => sort`); per-viewer vote ids as
      `myVoteIds` on the same response, read uncached because it is one index scan and a
      per-viewer entry would be voided by every like in the event.
- [x] `hasMyVote` derived in the hook — one `Set` per answer on a `GalleryPhoto` type — never
      in JSX. `PhotosPanel` is untouched.
- [x] The saving asserted as a query count, not a response comparison: a read on the shared
      entry costs exactly two selects fewer than the same read with the tag voided.
- [x] ADR-134.

### ~~T7 · ⑤ C1 — one shared ETag helper for the polled surfaces~~ ✅ LANDED (ADR-135)

- [x] `respondCached(c, body)` in `lib/http.ts`; no per-route hand-rolling. Applied to
      `/api/leaderboard`, `/api/tournament/matches/feed`, `/api/tournament/courts`,
      `/api/me/alerts`, `/api/gallery/photos`. `/api/tournament/lineups` deliberately left out:
      `estimatedStartAt` moves with the clock, so a validator there would be theatre.
- [x] **Byte-stability assertion** (amendment D): 18 parameterised tests in
      `conditional-reads.test.ts`. It caught the real thing — `/api/leaderboard` stamped
      `new Date()` at serialisation, so its hash could never match twice. `readLeaderboardView`
      now builds the view inside the memo, which also makes the pushed frame and the HTTP body
      byte-identical (ADR-131's rule, now true of the value and not just the shape).
- [x] A-6's caveat carried into the helper's doc comment: a 304 saves bytes, not query time.
- [x] ADR-135, plus an **ADR-094 amendment** for A-6.

### T8 · ⑥ Drop the two dead read-marker columns — **✅ LANDED (ADR-129)**

- [x] `schema.sql`, both Drizzle schemas, the stray projection in `participants.ts` (E-4 found
      this fifth site the task list omitted), and the four `seed-demo.sql` INSERTs — 134 tuples,
      every value verified `NULL` first.
- [x] ADR-129, plus a real `PSD_SEED=demo npm run db:setup` from empty as the proof.

### T9 · ⑦ D3 champion bonus, then D2 third-place match — ✅ DONE

- [x] **D3:** ✅ ADR-136. A fourth CTE branch, **overruling** amendment C's recommended
      adjustment row: ADR-006's computed board makes void/unvoid/winner-edit correct by
      construction, and ADR-117's ledger records *human* decisions only. Only the amount is
      stored (`tournament.champion_points_snapshot`, frozen at close); the winner is always
      re-derived. Default 0 = off.
- [x] **D2:** ✅ ADR-137. A `third_place` stage of its own — the discriminator the hazard
      needed: the champion CTE's existing `stage = 'knockout'` predicate now excludes it, and
      `advanceWinner` only completes the day for a knockout fixture with no knockout successor.
      A semi-final feeds two fixtures now (winner up, loser across), so the correction guard
      widened to "every seat this result feeds". Default off; voidable and skippable, which is
      what makes offering it safe.
- [x] Two ADRs, two commits: ADR-136 (`9f9f11c`) and ADR-137.

### T10 · ⑧ F1 — a ten-second undo on a mis-scan *(1 d)* — ✅ LANDED, ADR-138

- [x] ✅ **ADR-138.** Facilitator-scoped void with a **server-enforced** window: one guarded
      `UPDATE … RETURNING` carrying id + facilitator + not-voided + `now() - scanned_at <=
      make_interval(...)`, so expired / already-voided / raced collapse into one honest 409.
      The client countdown is decoration.
- [x] The offline branch: undoing a queued-but-unsynced scan calls `removeFromQueue` and posts
      nothing. Test written first.
- [x] Wrong-party negative: 403 from the route (its own message), plus a direct test on the
      statement's own facilitator scope — sabotage showed HTTP alone cannot see that predicate.
- [x] Recorded on the row (`undone_at`), **not** in ADR-117's ledger: that ledger's author
      column is NOT NULL and records a superadmin's decision.
- [x] ADR-138, own commit.

### T11 · Repository housekeeping *(2 h)* — ✅ DONE

- [x] PRs #1–#4 closed as superseded by #5, each with a comment saying **how** it is
      superseded. #1, #3 and #4 are strict ancestors of this branch (`git merge-base
      --is-ancestor`), so #5's diff already contains them.
- [x] #2 is the exception and was labelled as such: its six commits are *not* ancestors — the
      128 px sprite and hot-path cache were re-landed later (`fa49aed`, `ee3fd93`) and
      `snapshot.sql` has since become `schema.sql`, so they could not replay unchanged. Its
      photo-fixture corpus is **not** carried over; the branch is left in place for it.
- [x] #4's body was *not* refreshed: it is an ancestor of #5, so the two can never both merge
      and a second maintained description is just somewhere else for the story to drift.

---

## Added by the ADR audit of 2026-10-03

Every backticked path, function, constant and column in all 129 ADRs resolved against the tree
(475 files), then triaged by hand into *historical* (the ADR describing what it removed —
correct) and *drift*. Full findings in `docs/outstanding-tasks.md` §1. **No behavioural ADR was
found silently broken**; the machine-enforced invariants, ADR-084's eight strictness flags and
every `fds.md` §4 rule with a database guarantee behind it all hold.

- [x] **A-4 · a roster event never lights the team-chat LED live.** ✅ LANDED, **ADR-130**. `routes-team-chat` publishes
  both `publishTeamChatMessage` and `publishTeamChatActivity`; `db/entities/teams.ts` publishes
  only the first for a join or a leave. A roster line is a message in the room (ADR-063), so
  under ADR-125 it should raise the dot. Self-corrects on the next snapshot — the tag *is*
  invalidated — so the gap is live-only. **Fold into T4**, whose audit is what should have
  caught it. *1 h.*
- [x] **A-5 · `createTeamChatMessage` invalidates inside the transaction.** ✅ LANDED, **ADR-130**. Its own doc comment
  explains why *publishing* must wait for the commit; invalidation has the same problem and no
  guard. A reader landing between `invalidateTag` and `COMMIT` re-populates the memo with
  pre-commit state, which then lives the full TTL — ten minutes for `latestTeamChatActivity`.
  Low probability, awkward duration. *½ d.*
- [x] **A-1 + A-2 + A-3 · register integrity.** ✅ LANDED, **ADR-139** — a supersession index at
  the top of `ADDENDA.md` (decisions superseded in part + identifiers that moved), ADR-013's
  status line repointed at ADR-080/ADR-049, all six "no headless browser (ADR-013)" citations
  corrected, and one new rule in `AGENTS-decisions.md`: a rename is a register event. The
  original finding, for the record: ADR-013 still read *Accepted* and claimed 100 %
  coverage gates for both workspaces; the real gates are 98/98.9/94.6/98 (api) and
  98.97/98.26/98.34/98.97 (web), set deliberately by ADR-080, which never marked ADR-013. Five
  other ADRs cite ADR-013 for *"no headless browser in this workspace"* — a claim its text does
  not contain, and one Playwright has since falsified. Eleven ADRs name identifiers lost to
  later renames. Fix: mark ADR-013 superseded-in-part, correct the five citations, and add a
  **supersession index** mapping each renamed identifier to its replacement and the ADR that did
  it. The register is append-only, so the fix is an index, never a rewrite. *½ d.*
- [x] ~~**A-6 · ADR-094's title over-claims.**~~ ✅ **LANDED** as an ADR-094 amendment beside
  ADR-135. Read the title as *"every poll-fed **participant** read"*; the staff poll surfaces
  have no memo on purpose. The caveat it existed for — a 304 on an uncached read still pays for
  the query — is in `respondCached`'s doc comment.

---

## Not being built

- [—] **C2 · the service worker.** Recommendation unchanged: not before the event, and after
  T0 the case is weaker still — T0 captures the repeat-load win with no new failure mode,
  leaving only true offline paint for 4–5 days and a cache the server cannot purge. The
  five-phase build plan is in the plan document §3.3 if it is ever scheduled; T0c removes its
  Phase-0 blocker either way.
- [—] **D4 · consolation friendlies.** KIV by ruling — the free court slots it assumes will not exist.

---

## Progress log

Newest last. One line per landed task.

- **T0 · ADR-126** — `immutable` for the three content-addressed art directories, an
  `etag`/304 validator on every static file (they had none, so `no-cache` meant full
  re-download), and a 404 for a missing file instead of the SPA shell — which also unwelds
  C2's only escape hatch. 18 tests in `web-static.test.ts`, up from 6.
- **T1** — A5's "three rates: win, loss, draw" corrected (there is no draw rate; ADR-114 refuses
  a level match), `snapshot.sql` renamed to `schema.sql` across `AGENTS.md`, `AGENTS-database.md`,
  `AGENTS-workflow.md` and `README.md`, and §5's tree given the six missing route directories,
  `views/`, `lib/storage/` and `webStatic.ts`.
- **T2 · ADR-127** — the flake diagnosed: not timing. A third team in the describe meant the
  shuffled front fixture sometimes involved neither known captain, and the test watched a socket
  the server was correct never to write to. Fixed at the cause, `waitFor` budget restored from
  30 s to 10 s, sabotage reproduced it 2/10.
- **T3 · ADR-128** — team frames re-check membership per delivery; the stale topic is left on
  the first failure so the cost is one read, not one per frame. Diverges from team chat by
  keeping the socket open: this one also carries announcements, which a teamless participant is
  still entitled to.
- **T8 · ADR-129** — both read-marker columns gone, completing ADR-125. Found and removed a
  fifth site the task list missed: the superadmin directory query still selected the dead column.
  The recorded demo seed re-verified by applying it to an empty database.
- **Audit, 2026-10-03** — no task landed; the whole tree re-checked against all 129 ADRs. Six
  findings (`docs/outstanding-tasks.md` §1), four of them real: two live defects (A-4, A-5) and
  two register contradictions (A-1, A-2). Added to the queue above; the revised order and the
  reasoning for it are in `docs/outstanding-tasks.md` §6.
- **A-4 + A-5 · ADR-130** — the three obligations of a committed roster line (void the tag,
  publish the line, publish the watermark) collapsed into one exported `announceRosterEvent`,
  called after the commit by both roster paths. The deciding evidence for A-4 was in the query,
  not either publisher: `latestTeamChatActivityFromDb` has no kind filter, so the snapshot
  already counted roster rows and only the live path disagreed. A-5's insert-time void is kept
  for the non-transactional callers and repeated after the commit, which discards anything a
  reader won during the window. 4 tests; each half sabotaged separately and watched to fail.
- **T4 (server half) · ADR-131** — `feed.match` and `leaderboard` frames, published at six
  mutation sites. The frame is literally the object the HTTP response carries, so the push costs
  no read and the socket cannot disagree with the body. The board is gated on
  `hasStatusSubscribers()` and stays off the per-point path (ADR-120). Thirteenth standards rule
  `push-pairing` written first; it named all six sites unaided. 8 tests, 4 sabotages. **Still
  open: the browser half** — `useBoard` consuming the frames, and the `EventSource`-stubbed e2e.
- **T4 (browser half) · ADR-132** — `boardLive.ts` holds what the socket pushed, retained so a
  surface mounting after the frame still gets it. The board prefers the pushed answer only when
  `generatedAt` says it is newer, so an in-flight poll cannot make the push a regression. 23
  tests, 5 sabotages — including the `useSyncExternalStore` snapshot-identity trap, which takes
  12 tests down when you get it wrong. T4 is now complete bar a Playwright e2e this sandbox
  cannot run.
