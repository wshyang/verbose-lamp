# Outstanding tasks — audited against the code, 2026-10-03; re-audited 2026-10-05

**Rewritten 2026-10-03 after a full audit of the tree against all 129 ADRs.** The previous
version of this file was the work queue implied by the 2026-10-03 rulings; five of its items
have since landed (ADR-126 … ADR-129) and the audit found six more things, four of them real.

> **Status, 2026-10-04 — the queue is empty.** Every item below has landed: T0…T11 and the
> audit's A-1…A-6, as **ADR-126 … ADR-139**, each in its own commit with its own ADR. What
> remains in this file is the record of how, plus the two things that are deliberately *not*
> built (**D4** consolation friendlies; **C2** the service worker is now built as ADR-147 but
> ships switched off), the Playwright e2e that this sandbox cannot run (now three specs written and
> unexecuted: `service-worker`, `team-chat-typing`, plus the deferral noted at T4), and the
> four questions that were waiting on a human, **all answered 2026-10-04** and recorded in
> §3a below: **F-1** ruled on reading **(b)** — draws DO score, reversing ADR-114 and a
> database CHECK (`docs/design/draw-rate.md`); **`publishChatHidden`** to be fixed *and* the
> team rooms audited for the same gap; roster-repair withdrawal confirmed as **skip**; the
> **font** fallback accepted as-is. Roster repair (**Gap #1**) shipped 2026-10-04 as **ADR-154**, server half then console. Next ADR number: the one after the last entry in `docs/addenda/ADDENDA.md`.

Companions: `docs/task-queue.md` (the execution checklist, struck off as work lands),
`docs/design/outstanding-tasks-implementation-plan.md` (the costed plan),
`docs/decisions-outstanding.md` (the rulings and their reasoning).

---

## 0. What the audit actually did

Not a reading — a check. Every `backtick-quoted` file path, function, constant and column in
all 129 ADRs was extracted and resolved against the tree (475 indexed files), then every
unresolved reference was triaged by hand into *historical* (the ADR is describing something it
deliberately removed — correct) and *drift* (the ADR describes the present tense and the
present tense disagrees).

| Check | Result |
|---|---|
| ADR numbering 001–129 | **Complete, no gaps.** 130 headings, 129 numbers — the extra is ADR-113's amendment heading, which is deliberate |
| `npm run verify` on the audited tree | **green** — typecheck, eslint, 12 standards rules / 406 files / 0 violations, web build, API suite, 945 web tests, coverage ratchet held |
| Machine-enforced invariants (no hand-written mappers, no hard deletes, id minting, component/hook split, JSX purity, test ids, theme separation, storage ownership, copy ownership, flag arguments, schema single source, no cycles) | **all hold** |
| ADR-084's eight strictness flags | **all eight actually set** in `tsconfig.base.json` |
| `fds.md` §4 invariants with a database guarantee behind them | **all present** in `schema.sql` (one-team-per-participant, one captain, winner ∈ {a,b}, one open/ended round, `client_scan_uuid`, case-insensitive nickname and team name) |
| ADRs with at least one unresolved reference | 26 — triaged below |

**The headline: no behavioural ADR has been silently broken.** Everything the register says the
system *does*, it still does. What the audit found instead is that the register has drifted
away from the code in its *naming*, and in two places it states a standard the build no longer
enforces.

---

## 1. Audit findings (6)

### A-1 · ADR-013 states a coverage gate the build does not have — ✅ FIXED, ADR-139

ADR-013 reads **Status: Accepted** and *"Statements, branches, functions and lines are all
gated at 100% for `apps/api` and `apps/web`"*, with the reasoning *"a threshold below 100% is a
budget for untested code and drifts downward."*

The actual gates:

| | lines | functions | branches | statements |
|---|---|---|---|---|
| `apps/api/vitest.config.ts` | 98 | 98.9 | **94.6** | 98 |
| `apps/web/vite.config.ts` | 98.97 | 98.26 | 98.34 | 98.97 |

ADR-080 made this change deliberately and argued it well — the 100s were never evaluated, so
the declared standard was fiction and the measured reality had drifted to 91.33 % (web) and
97.07 % (api). The decision is sound. **The defect is that ADR-013 was never marked.** A reader
grepping the register for the coverage standard finds two ADRs that contradict each other and
no indication which one is live. ADR-013 also still cites `apps/api/src/db/migrate-cli.ts` as
an exclusion; ADR-049 deleted that file.

### A-2 · Five ADRs cite ADR-013 for something ADR-013 does not say — ✅ FIXED, ADR-139 (it was six sites, not five)

ADR-013 is cited five times as *"(ADR-013, no headless browser in this workspace)"* — at the
avatar-sheet review, the sprite review, ADR-026's relates-to, and twice more. ADR-013's text
contains the word "browser" exactly once, in *"only browser/CLI entrypoints are excluded"*. It
is an ADR about coverage. It says nothing about headless browsers.

And the borrowed claim is now false anyway: `playwright.config.ts`, the `e2e/` suite and
ADR-044 (*"both engines by default"*, chromium + webkit) all exist. Five ADRs therefore carry a
citation that is wrong twice over — wrong about what it cites, and wrong about the world.

### A-3 · Eleven ADRs name identifiers that no longer resolve — ✅ FIXED, ADR-139 (all eleven are now in the supersession index)

All eleven are *renames that happened later and were never back-referenced*. None is a
behavioural defect; each is a reader who greps a name out of the register and finds nothing.

| ADR | Says | Is now |
|---|---|---|
| 046 | `UNCOMPRESSED_PATHS` | `UNCOMPRESSED_EXACT` + `UNCOMPRESSED_PATTERNS` |
| 046 | `touchParticipantSeen` | `touchParticipantsSeen` (batched) |
| 028 | `AVATAR_LOOK_AXES` | `AVATAR_INDEX_AXES` + `AVATAR_COLOUR_AXES` |
| 086 | `readDismissed`, `rememberDismissed` | `readAnnouncementFloor`, `advanceAnnouncementFloor`, `seedAnnouncementFloor`, `forgetAnnouncementFloor` |
| 107 | `upSoonForTeam` | `upSoonFixtureForTeam` |
| 120 | `upSoonFromDb` | folded into `upSoonPicture` |
| 083, 094 | `hasUnreadChat`, `hasUnreadTeamChat` | removed by ADR-125 (watermarks) |
| 097, 100 | `captainClusterCode` | removed — 100 reverses 097 |
| 092 | `fringe_activity.point_value` | replaced by award tiers |
| 046, 047, 049, 051, 102 | `snapshot.sql` | `schema.sql` — the rename *is* recorded, once, inside ADR-102's body |

The `snapshot.sql` row is the instructive one: the rename was recorded, in prose, in the middle
of an unrelated ADR, which is exactly as discoverable as not recording it. Six documents and
four `AGENTS*.md` files repeated the old name until it was fixed this morning.

**Correctly historical, needing nothing:** ADR-049's `migrate.ts` / `migrate-cli.ts` /
`schema_migrations` (it deleted them), ADR-081's six dead exports (it deleted them), ADR-021's
and ADR-029's numbered migration files (same), ADR-054's vendored detector bundles (never
committed, by design), ADR-126's `/sw.js` (a URL, not a file).

### A-4 · A roster event never lights the team-chat LED live — ✅ FIXED, ADR-130

`routes-team-chat/index.ts` publishes **both** frames when somebody sends a message:

```ts
publishTeamChatMessage(membership.teamId, view);
publishTeamChatActivity(membership.teamId, row.createdAt);   // the dot, for closed rooms
```

`db/entities/teams.ts` publishes **only the first** for a join or a leave (lines 133 and 186).
A roster line is a message in the room — ADR-063 built it precisely so the room is the team's
history — so under ADR-125 it should raise the dot for team-mates who do not have the room
open. It does not.

**Severity: low, and it self-corrects.** `createTeamChatMessage` *does* invalidate
`teamChatTag`, so the next snapshot or poll reports the true watermark and the dot appears
then. The gap is live-only: a phone with a socket open learns about a new team-mate up to a
poll later than it learns about a "hello". It is still an inconsistency between two call sites
that should agree, and it is exactly the class of thing B6's ruling asks step ④ to audit for.

### A-5 · Cache invalidation runs inside the transaction it belongs after — ✅ FIXED, ADR-130

`createTeamChatMessage` calls `invalidateTag(teamChatTag(...))` at insert time. Two of its
callers — `createTeamWithCaptain` and `invalidateMembership` — run it **inside a database
transaction**, and `recordRosterEvent`'s own doc comment already knows this is delicate: it
explains at length why *publishing* must wait for the commit.

Invalidation has the same problem and no such guard. The window is between `invalidateTag` and
`COMMIT`: a concurrent reader in that window re-populates the memo with pre-commit state, and
that stale entry then lives for the full TTL — **ten minutes** for `latestTeamChatActivity`. A
rollback is harmless (one wasted query); a concurrent read is not.

**Severity: low probability, awkward duration.** Two phones would have to interleave within a
few milliseconds. But the symptom — a team's LED stuck wrong for ten minutes with no write to
clear it — is the kind nobody will diagnose on the day.

### ~~A-6 · ADR-094's title over-claims~~ — ✅ **LANDED** as an ADR-094 amendment (with ADR-135)

The title is *"Every poll-fed read goes through the cache decorator"*. Its body enumerates the
participant-facing reads, and that enumeration is accurate. But the staff poll surfaces —
`listSwagStations`, `listSwagClaimsForRound`, and the fringe station's round reads — have no
`cachedRead`, and they are polled on the same 45–75 s jitter.

This is almost certainly right: twenty facilitators are not three hundred phones, and a memo
on a read that happens twice a minute buys nothing. The title should say so rather than claim
a universal the code deliberately does not meet. It also matters for T7 below: an ETag on an
uncached read still pays for the query.

---

## 2. Landed since the last version of this file (5)

| | Task | ADR |
|---|---|---|
| ✅ | Content-versioned art made cacheable; validator on every static file; missing file 404s instead of serving the SPA shell | 126 |
| ✅ | A5's phantom draw rate, `snapshot.sql` → `schema.sql`, the directory index in `AGENTS.md` | — |
| ✅ | `status-stream.test.ts` flake diagnosed (never timing) and fixed at the cause; budget restored 30 s → 10 s | 127 |
| ✅ | B5 — team frames re-check membership per delivery; stale topic left on first failure; socket kept open | 128 |
| ✅ | The two dead read-marker columns dropped, completing ADR-125 | 129 |

**ADR-126 is the one that changes another decision.** The art under `public/` was not merely
slow-cached, it was *uncacheable*: `no-cache` with no `etag` and no `last-modified` means the
revalidation is a full re-download. 223 content-versioned files, ~29 of them per page load.
Fixing it captured most of what the service worker was being weighed for, which is why C2's
case is weaker now than when it was last argued.

---

## 3. Decided, with no code behind them (8)

Unchanged, recorded so nobody re-opens them. A1 walkover pays nobody · A2 `tournament_loss_points`
keeps 0 legal · A3 participation scanning stays staff-only · A4 swag pays no points ·
~~**A5 the 0 – 0 rule is the *unscored* rule — there is no draw rate and the code refuses a
level match**~~ — **OVERRULED 2026-10-04.** The original wording was right and the
2026-10-03 "correction" was wrong: there are three rates, and a draw pays the third to both
teams. This reverses ADR-114 and `schema.sql:303`. See §3a and `docs/design/draw-rate.md`. ·
D1 group ties are settled on the court · E1 `createdByUsername` stays lazy-joined ·
E2 `fds.md` does not absorb the addenda.

**KIV, not built:** D4 consolation friendlies.

---

## 3a. Answered 2026-10-04 (4)

Four questions had been carried in the banner for several turns without ever being put to a
human. They were asked and answered together.

| # | Question | Ruling | Consequence |
|---|---|---|---|
| **F-1** | A5's "draw rate" — drafting slip, or real? | **Real (reading b).** Draws score. | ✅ **SHIPPED as ADR-152.** Reversed ADR-114 and narrowed the CHECK. **Four** silent-corruption sites found and closed (the fourth only by the compiler). Design note: `docs/design/draw-rate.md`. Follow-ups (b) wording and (c) champion bonus ✅ **shipped as ADR-156**; follow-up (a) ✅ **shipped as ADR-157** — the desk became a result correction under the court's own rule, which also gave the day its first way to correct a mistyped score. |
| **`publishChatHidden`** | Unread dot stays lit up to 75 s after a hide. | **Fix it, and audit the team rooms for the same gap.** | ✅ **SHIPPED as ADR-153.** The naive fix was a no-op — `applyFeedActivity` merges monotonically, so a *lower* watermark is discarded; it needed a new `chat.retracted` / `gallery.retracted` frame the client **assigns**. Audit: team rooms have **no hide at all** (dead `hidden_at` column — logged below); the **gallery** had the identical missing publish and is fixed too. |
| **Roster repair §7** | Withdrawn team's unplayed fixtures — skip or walkover? | **Skip.** | Confirms `docs/design/roster-repair.md` §7 as written. No phantom wins; the console states the asymmetry aloud. |
| **Fonts** | Self-host Press Start 2P / VT323? | **Accept the Courier New fallback.** | ✅ Closed, no work. A venue with no public internet renders legibly in the fallback face. |

---

## 4. Still outstanding (10)

Six from the original queue, plus the four audit findings that need work.

### Build queue

1. ~~**T4 · Step ④ — payload-carrying publishes (B6).**~~ ✅ **LANDED, ADR-131 + ADR-132.**
   Both frames, six publish sites, the `push-pairing` standards rule, and the browser half
   through a `boardLive` store. **One item deferred:** the Playwright e2e — this workspace
   cannot fetch the browsers and `npm run verify` does not run e2e, so it would have been
   committed unexecuted. The acceptance assertions it was for are covered by
   `eventSourceStub` one layer down.
2. ~~**T5 · Step ⑤ — the up-soon floor, then the toast (B4).**~~ ✅ **LANDED, ADR-133.**
   `AlertsView.teamUpSoon` is now the same `TeamUpSoonView` the live frame carries, so a
   reconnect's snapshot can be told from news; `upSoonStore.ts` floors the toast on the
   fixture id, and the toast is silent and yields to an announcement.
3. ~~**T6 · C3 — the `GalleryPhotoView` overlay.**~~ ✅ **LANDED, ADR-134.** `readGalleryPage`
   is keyed on the sort alone, `hasMyVote` has left `GalleryPhotoView`, and the per-viewer
   half travels as `myVoteIds` on the same response. The largest per-viewer fan-out is gone.
4. ~~**T7 · C1 — one shared ETag helper.**~~ ✅ **LANDED, ADR-135** (with an ADR-094 amendment
   discharging **A-6**). `respondCached` in `lib/http.ts` hashes the bytes it is about to send;
   five polled surfaces use it. The byte-stability assertion earned its keep immediately: the
   leaderboard's `generatedAt` made its hash unmatchable, and the fix — building the view
   inside the memo — also made the pushed frame and the HTTP body byte-identical.
5. ~~**T9 · D3 champion bonus, then D2 third-place match.**~~ ✅ **LANDED, ADR-136 + ADR-137.**
   The bonus is a fourth leaderboard CTE branch derived from the knockout fixture nothing feeds
   from, with only the amount snapshotted; default 0 means off. The third-place match is its own
   `third_place` stage, which is exactly the discriminator that keeps it out of that CTE — it
   would otherwise have matched "nothing feeds from it" and paid a second champion bonus.
6. ~~**T10 · F1 — a ten-second undo on a mis-scan.**~~ ✅ **LANDED, ADR-138.**
   `POST /api/fringe/scans/:scanId/undo`, facilitator-scoped, with the ten-second window
   enforced by the server clock inside a single guarded UPDATE; the console countdown is
   decoration. Offline the undo never reaches the network — the queue entry is dropped. The
   undo is stamped on the scan (`undone_at`), not written to ADR-117's superadmin ledger.

### From the audit

7. ~~**A-4 · roster events publish the activity frame too.**~~ ✅ **LANDED, ADR-130.**
8. ~~**A-5 · move invalidation to after the commit.**~~ ✅ **LANDED, ADR-130.**
9. ~~**A-1 + A-2 + A-3 · register integrity.**~~ ✅ **LANDED, ADR-139.** The supersession index
   is at the top of `ADDENDA.md`, in two tables — decisions superseded *in part* (ADR-013's
   thresholds by ADR-080, its exclusion list by ADR-049, and three others) and identifiers that
   moved (all eleven, each verified to resolve). ADR-013's status line points at both. The
   mis-citations were **six**, not five: four in the register and two in `docs/design/`, all
   repointed at ADR-139, which states the fact they were reaching for — the repository has
   Playwright (ADR-044); this sandbox cannot fetch its engines. `AGENTS-decisions.md` gained
   the rule that keeps the index alive: a rename is a register event, appended in the same
   change.
10. ~~**T11 · repository housekeeping.**~~ ✅ **DONE.** #1–#4 closed as superseded by #5, each
    with a comment stating how. #1, #3 and #4 are ancestors of this branch; #2 is not, and its
    comment says so — its work was re-landed as different commits and its photo-fixture corpus
    stays only on its own branch, which is why the branch is left in place.

---

## 4b. Proposed, not yet queued

**The hall screen** — one projected page that cycles the leaderboard, the live and finished
matches, the up-next line-ups and the two photo scenes, in the participant theme, watched
rather than used. Full design and costing in `docs/design/hall-screen-plan.md`: ≈ 4¼ days, one
ADR, **no schema change and no new write path**, because the board data is already live over
the status stream (ADR-131/132) and the gallery list is already shared (ADR-134). All four product calls are now made (2026-10-04): **build it, full
scope**; it authenticates with a **dedicated screen key** (✅ shipped, **ADR-140**); photos are
projected **live**, which turns three mitigations into requirements; and the status stream
**may** widen past participants, which it now has — by one null, with no second endpoint.

**In build.** ADR-140 shipped the server half (the key, the six-read allowlist, the widened
stream). **ADR-141 shipped the deck**: the filmstrip — every scene a frame on one horizontal
track, a scene change a visible sideways scroll, an alert a rapid dash to the frame and back
to where the cycle was — plus standards **rule 14** (nothing interactive under
`routes-screen/`), `screenKeyStore` and a screen-aware client, the `useLineups` split, and the
first three scenes (cluster board, top players, on court). **ADR-142 finished phases 2–3**:
the just-finished and up-next scenes, the screen's own status socket, and the dash that fires
when a match completes — floored, held for a scene still joining the strip, and silent about
the backlog when a projector restarts mid-event. **ADR-143 finished phase 4**: both photo scenes, with the
rule the filmstrip forced into the open — a scene joins the strip only once its images have
**decoded**, because every frame is mounted at once and a half-arrived photo is already on the
wall. It also fixed an image URL that carried no screen key, which would have made every photo
in the hall a broken glyph. **ADR-144 finished phase 5** and found the worst defect of the
build while doing it: `screen.css` read four `gb`-prefixed tokens that have never existed, so
the rows were being projected at **1.33:1** — black on black, titles only. Also in: the
no-error rule (nobody is holding a wall, so it never shows a failure message), a staleness mark
driven by failing reads rather than by the socket, and `AS OF hh:mm` on the board. **ADR-145 finished the build** with the superadmin
panel — mint a screen, see its `/screen?key=…` URL once, revoke it — having first made
`last_seen_at` true, since it had been stamped at creation and never written again and is read
immediately before a revoke. **ADR-150 added two more scenes** — `The Groups` and
`The Road to the Final`, the day's shape as a graph — which also required the superadmin's
format knobs to be persisted server-side (`tournament_plan`) so the wall can project a plan
nobody has activated yet. **The hall screen is done.** What remains is not code: a rehearsal
on real projector hardware (throw, contrast at ten metres, burn-in over six hours). **Typing indicators, which were next in the queue, are now built (ADR-146).**

**Typing indicators for team chat — ✅ BUILT 2026-10-04 as ADR-146.** All four phases of
`docs/design/typing-indicator-plan.md` shipped: `POST /api/team-chat/typing` (204 always, no
database write, its own 4-per-2 s bucket), a `typing` frame on the existing per-team SSE topic
carrying **no `id:`** so it cannot poison a resume cursor, a 3 s outbound throttle driven by
composer state, a 6 s self-expiring inbound map, and a reserved-height line above the composer
reading `A is typing…` / `A and B are typing…` / `3 people are typing…` past
`TEAM_CHAT_TYPING_NAMES_MAX`. Nothing is broadcast outside the room. Original assessment
follows.

**Typing indicators for team chat (assessed 2026-10-04)** — assessed in
`docs/design/typing-indicator-plan.md`. This is the feature
`docs/design/persistent-connection-assessment.md` §4C named as the condition for reopening the
WebSocket question, so it was reopened: **the answer is still SSE**, because that condition
assumed a POST per keystroke and a throttled, self-expiring ping is ~0.33 req/s per active
typist with **zero database writes**. One new route, one new frame kind on the existing
per-team topic, no migration, no change to `index.ts`. ≈ 1 day, one ADR. Recommended sequencing:
**after** hall-screen phase 5 and the superadmin screen-key page, since a projector nobody but a
developer can switch on outranks three animated dots in a five-person room.

## 4c. Superadmin event-day gaps (assessed 2026-10-04)

`docs/design/superadmin-event-day-gaps.md` — the console read from one seat: a superadmin at
a laptop between 08:00 and 16:00. It is good at **configuring** the event and at **correcting
the record**, and thin at **running the day while it happens**. Seven gaps, with the four
plausible ones that turned out not to be gaps listed too (PIN reset works; there is no clock
to fall behind; walkovers exist; the offline announcement refusal is correct).

In recommended order: ~~**scan-number search**~~ ✅ **BUILT as ADR-148**, and
~~**teams outside the tournament**~~ ✅ **BUILT as ADR-149** (late teams can now be admitted
into a running group stage, for as many matches as the clock has room for — the cap is
wall-clock arithmetic and the console says so) (a digits-only query
is unambiguous because ADR-088 banned all-digit nicknames, so one box serves both
identifiers; matched by prefix, and the number is now shown on the row); ~~**an operations
overview of the last 15 minutes** plus **facilitator presence**~~ ✅ **BUILT as ADR-151**
(one `GET /api/admin/operations`, a panel above the now-honestly-named "Totals so far":
window counts, quiet stations first, overdue matches measured against the superadmin's own
`matchMinutes`, and a nullable `last_seen_at` on `facilitator_account` so "never opened the
app" stays distinguishable from "gone quiet"); **roster
repair** (~1½ d — `/admin/teams` is read-only by design and the captain is a single point of
failure with a phone at 4 %); ~~**a warning for teams formed after the tournament was
activated**~~ ✅ **ADMISSION BUILT as ADR-149, WARNING as ADR-158** (the task list carried
this after the design doc had already struck it — ADR-149 built the whole admissions desk on
the Tournament page, so all that was left was telling someone it was there. ADR-158 puts the
count on the Operations panel the superadmin actually watches: a sentence and a link, not a
second implementation, and the number stays visible after the group stage closes so silence
is never mistaken for resolution); ~~**a void for swag claims**~~ ✅ **BUILT as ADR-159** (both reversals the fringe scan
already had, not just the admin one: a ten-second take-back at the counter and a superadmin
void/unvoid behind it. The flag was the easy half — the half that mattered is that a voided
claim stops consuming the per-round allowance, so the participant who never received the item
can still be given one);
~~**a final standings export**~~ ✅ **BUILT as ADR-161** (the last §4c item. One read behind a
printed sheet and three CSVs, so the paper and the spreadsheets cannot disagree; every
participant rather than the board's top ten, because a record that omits everybody on zero
cannot answer whether a cluster turned up; and available at every hour of the day with a
PROVISIONAL warning printed onto the paper rather than refused until the tournament closes).
**§4c is now empty.** Of design-doc §8's three smaller ones, **nickname rename is CLOSED — not
deferred, ruled out** (2026-10-05: nicknames are immutable, see §5a). What remains is duplicate
sign-up handling and a wider audit, both re-assessed by the 2026-10-05 audit in §7 below.

**If only one is built: the operations overview.** Everything else is something the
superadmin reacts to; that one is what tells them there is something to react to.

### Found by the ADR-153 audit (2026-10-04): team chat cannot be moderated at all

**✅ SHIPPED 2026-10-04 as ADR-155.** Built as ruled: captain-only
`POST /api/team-chat/messages/:messageId/hide`, the `hidden` frame on `team.chat.${teamId}`,
and a new `team.chat.retracted` on the team's status topic so the dot follows the watermark
down. Two refusals came out of the build rather than the brief: a non-captain member gets 403,
and a **roster line gets 409** — ADR-154 made those lines the only record of a staff repair, so
a captain who could hide them could erase the record of their own team being changed. The dead
column and its partial index are live. **Original ruling, for the record:** The organiser chose option (b):
the captain gets a hide in their own room. They are the one person who can both read the room
and has standing in it, so this needs no change to the privacy ruling. The dead `hidden_at`
column and its partial index become live. **Not started.** Scope: a `hideTeamChatMessage`
entity write, a captain-only `POST /api/team-chat/messages/:id/hide`, the `hidden` frame on
`team.chat.${teamId}`, and — per ADR-153 — a **team-chat retraction frame** so the room's dot
follows the watermark down, plus the matching `PUSH_PAIRS` entry.

The original finding, for the record:

`team_chat_message` carries a `hidden_at` column **and** a partial index
`WHERE hidden_at IS NULL`, and **nothing in the codebase ever writes it**. `routes-team-chat`
exposes four routes (`GET /messages`, `GET /stream`, `POST /messages`, `POST /typing`) and
`teamChat.ts` four functions, none of which hide. So a captain's room has the storage and the
index for moderation and no way to perform it — a dead column, not a broken frame, which is
why ADR-153 did not "fix" it.

Whether that matters is a judgement for the organiser, and it collides with a standing ruling:
**no superadmin can read team chat** (the roster-repair ruling, reaffirmed). Moderating a room
nobody with authority can read is a strange power, so the honest options are (a) leave it, and
drop the column and index as dead weight; (b) give the captain a hide in their own room; or
(c) revisit the privacy ruling. **Not started, ≈ 1 d for (b).** Flagged, not assumed.

## 5a. Ruled 2026-10-05 — a nickname is immutable

**The organiser's ruling: nicknames cannot be changed, by anybody, ever. The rename route is
not deferred — it is cancelled.** `superadmin-event-day-gaps.md` §8 listed "a nickname cannot
be changed by anybody" as a ~½ day gap. It is not a gap. It is the design.

What this settles, so nobody re-opens it:

- **There is no rename route for any actor, and there must not be one.** Not for the
  participant, not for the superadmin. The sign-up form is the only place a nickname is ever
  written.
- **An unfortunate sign-up is unfixable by renaming**, and that is accepted. The remedy, if
  one is ever wanted, is the duplicate-sign-up work below — a second identity — not an edit
  to the first.
- **The code already complies.** `participant.nickname` has no `UPDATE` path anywhere:
  `createParticipant` is the only writer of the column, and the three `UPDATE`s that exist
  on `participant` set `last_seen_at`, `pin` and the avatar fields respectively — verified
  by grep on 2026-10-05, not assumed. No work is required to honour this ruling; it is
  recorded so a future reader does not mistake the absence of a rename for an oversight.

The immutability is also load-bearing in four places that would each need rework if it were
ever reversed: the nickname is the **sign-in credential** (`POST /api/auth/participants/signin`
takes nickname + PIN, so a rename is a credential change); it is **snapshotted into chat
messages and roster announcements**, which would silently disagree with the live board; it is
the **spoken identifier** a marshal uses at a station; and it is three metres wide on the hall
screen all day.

---

## 5. Still open as a decision (1)

**C2 · the service worker. ✅ BUILT 2026-10-04 as ADR-147 — stations only, behind a switch,
shipped OFF.** The park was lifted by a change of shape rather than a change of mind: a
superadmin toggle on the Operations page (`service_state.is_station_offline_enabled`, default
false, read by a public `no-store` `GET /api/app-shell-policy`) means the feature does not
exist until somebody turns it on. Registered only on `/staff` pages — participants and the
hall screen are excluded in code — caching an allowlist of the four content-addressed
directories and nothing else, with standards rule 15 making it a build failure for the worker
to so much as name an API path. **Before it is switched on at an event:
`e2e/exclusive/service-worker.spec.ts` must be run on a machine with a real browser; it is committed
unexecuted.** Remaining and unchanged: self-hosting the two Google fonts, without which
offline paint is in Courier New. The original assessment follows.

**C2 (original assessment) — PARKED 2026-10-04 by decision.**
Recommendation unchanged — **not before the event**, and ADR-126
weakened the case further. The measurable win was zero-request repeat loads; ADR-126 captured
that for the 223 content-versioned files with no new failure mode, no un-purgeable cache and
no update ritual. What remains for a worker is **true offline paint alone**: 4–5 days, against
the one cache a server cannot purge, on three hundred phones you do not control, on the day you
cannot intervene.

ADR-126 did remove its Phase-0 blocker as a side effect: `GET /sw.js` used to answer 200
`text/html` via the SPA fallback, so a shipped worker could never have been withdrawn — a
browser retires a worker only when its script 404s. It now 404s. The door is unlocked whether
or not anyone walks through it.

**Stakeholder assessment 2026-10-04 in `docs/design/service-worker-stakeholders.md`** — who
the feature is actually for, which is the question that should settle before the build plan.
Five parties now. Only one benefits (**the facilitator standing at a station**, whose reload
currently ends their shift); the participant gets the largest payload for the weakest need;
the superadmin gains a duty rather than a benefit; and **the hall screen, the most tempting
target in the app, is an explicit exclusion** — it already survives the network by design
(ADR-144 staleness), what a wall needs is fresh data, which rule D-3 rightly refuses to cache,
and its photo URLs carry credentials. Independent finding, true today: **the web fonts are
fetched from Google**, so a venue LAN with no public internet already renders the participant
theme in Courier New. Self-hosting two woff2 files is ~½ day and should be decided first.

**Re-assessed 2026-10-04 in `docs/design/service-worker-plan.md`**, which supersedes the
five-phase plan in the implementation plan §3.3 (that one was costed before ADR-126 shipped).
The recommendation is unchanged but the reasoning is now the other way round, and it found a
third option: the audience that needs offline paint operationally is the **facilitator at a
station**, who uses none of the 243 art files, while the audience the cheap version of the
feature serves — three hundred participant phones you cannot reach — is the one that barely
needs it. So **option B, a worker scoped to the staff consoles only, is 2–2½ days rather than
4–5** and its blast radius is twenty phones you can walk to. Also measured there: a Chromium
binary *can* be fetched into this sandbox (`@sparticuz/chromium`) and **does not run**, so the
one test that justifies the whole feature — reload while offline — cannot be executed here.
The gate stands: a staging environment to rehearse the update ritual and the withdrawal
against a real deploy, and **at least two clear weeks** before an event.

---

## 6. Proposed implementation plan

```
  ① A-4 + A-5   the two live defects from the audit      ✅ LANDED, ADR-130
  ② T4          feed.match + the push-pairing rule     ✅ LANDED, ADR-131 + ADR-132
  ③ T5          the up-soon floor, then the toast      ✅ LANDED, ADR-133
  ④ T6          gallery overlay                        ✅ LANDED, ADR-134
  ⑤ T7          the shared ETag helper                 ✅ LANDED, ADR-135
  ⑥ T9          champion bonus + third place     ✅ LANDED, ADR-136 + ADR-137
  ⑦ T10         ten-second station undo                  ✅ LANDED, ADR-138
  ⑧ A-1..A-3    register integrity + supersession index  ✅ LANDED, ADR-139
  ⑨ T11         PR housekeeping                          ✅ DONE
 ────────────────────────────────────────────────────────────────────────────
  ⟲ C2          service worker                           4–5 d  gated, see §5
```

**About 9½ working days.** Four real dependencies and no others:

1. **A-4 before or inside ②.** The publish/invalidate audit is the thing that would have caught
   A-4; building the rule first and then fixing the instance it finds is the honest order, and
   it means the rule is proven against a real defect rather than against nothing.
2. **② before ③.** The floor in ⑤ exists so a reconnect cannot re-toast. Every publish site ②
   adds is another way to buzz a phone that was already told, so the floor must be designed
   against the finished set of publishers.
3. **③'s floor strictly before ③'s toast.** B4's ruling, verbatim. ADR-118's restart button
   re-states the up-soon window to every team in it; ship the toast first and it sets off every
   phone in the building at once.
4. **④ before ⑤.** A shared list has one ETag for everybody instead of one per viewer, so C3
   makes C1 both cheaper and more effective.

**Why the register work is late rather than early.** It is the least urgent and the most likely
to be invalidated by the work above it — ② and ③ will both rename things, and an index built
before them is an index that needs rebuilding. Doing it last means it is written once, against
a settled tree.

**If the day arrives before the queue empties**, cut in this order: C2 (already out), D2
third-place (default-off, costs a court slot when the day runs latest), T7 (saves bytes once T6
has saved the queries), D3 champion bonus (a nice-to-have on a leaderboard that is already
correct). **Keep, whatever happens:** ① (two live defects), ③ (the restart button is a shipped
feature and without the floor it buzzes the building), and ⑦ (a facilitator with no undo means
a superadmin interrupt during the event).

**Every item ships the same way** (`AGENTS.md` §6): tests first including a wrong-party
negative for every route touched, the `ADR-NNN` in the same commit, a sabotage run watched to
fail, a commit message naming the validation layers that actually ran, and
`docs/task-queue.md` struck off in that same commit. Next ADR number is the one after the last entry in `docs/addenda/ADDENDA.md`.

---

## 7. Re-audit, 2026-10-05 — all 161 ADRs, from scratch

The 2026-10-03 audit (§0) resolved every backtick-quoted identifier in 129 ADRs against the
tree. Repeating that exercise would mostly re-prove a settled result, so this one was run
**empirically instead of textually**: the questions were chosen to be ones a grep cannot
answer, and most were answered by breaking the code and watching what failed.

### What was checked, and what it found

| # | Check | Method | Result |
|---|---|---|---|
| 1 | ADR record integrity | 1…161 extracted from headings | **Clean.** No gaps, no duplicate numbers. 163 headings = 161 ADRs + 2 signed amendments (094, 113). One cosmetic defect — see B-4. |
| 2 | Dead exports | 1,537 exported symbols, cross-referenced | **7 dead** — see B-1 |
| 3 | Dead refusal messages | 139 `messages` keys | **11 unused** — all benign, see B-2 |
| 4 | Dead empty states / wire types | 24 + all of `wire.ts` | **Clean.** Every one is reachable. |
| 5 | Orphan schema columns | 262 columns vs all TS | **Clean.** Every column has a reader or a writer. |
| 6 | Orphan modules | every non-test `.ts`/`.tsx` | **Clean.** The ten unreferenced files are CLIs, test harnesses and the service worker, all loaded by path rather than import. |
| 7 | Unrendered components | 76 exported components | **Clean.** All 76 are rendered somewhere. |
| 8 | Route test coverage | 146 registered routes | **Clean.** Every route's path appears in an API test. |
| 9 | Debt markers | `TODO`/`FIXME`/`XXX`/`HACK`/`@ts-ignore`/`eslint-disable` | **1**, and it is justified (`no-control-regex` in the gallery filename guard). |
| 10 | **Live pushes actually pinned** | **28 sabotage runs** — every `publish*` function no-opped, then every multi-site call site deleted individually | **3 survived** — see B-3. This is the finding. |

### B-1 · Seven exports nothing imports — ~~open~~ **five deleted, two kept**

```
TournamentEntryRow            apps/api/src/db/schema/tournament.ts
ART_ANCHORS                   apps/web/src/lib/avatarArt.ts
DeckFrame                     apps/web/src/lib/hooks/useScreenDeck.ts
markChatReadRequestSchema     packages/contracts/src/schemas.ts
markTeamChatReadRequestSchema packages/contracts/src/schemas.ts
PARTICIPANT_TITLE_MAX_LENGTH  packages/contracts/src/titles.ts
ParticipantTitle              packages/contracts/src/titles.ts
```

The two `markChatRead*` schemas are the interesting pair: **ADR-129 removed the server-side
read marker** (ADR-125 had moved it onto the device) and dropped the column, the route and
the handler — but left the request schemas behind. They describe a request no client can
send to a route that does not exist. Same shape as ADR-081's six dead exports, which were
deleted for the same reason. ~~*Cost: minutes. Delete all seven.*~~ **Five deleted.** `ParticipantTitle` and
`PARTICIPANT_TITLE_MAX_LENGTH` are **kept by the organiser's 2026-09-30 instruction** — see §12.

### B-2 · Eleven refusal messages nothing throws — ~~open~~ **DONE**

An unused refusal string can mean a **missing refusal**, so each was traced to the behaviour
it describes rather than simply deleted. All eleven are **superseded strings**; in every case
the guard exists and throws something better:

| Unused | The guard that actually runs |
|---|---|
| `chatClosed`, `galleryClosed`, `galleryUploadsClosed`, `socialResumed` | ADR-118's `refuseWhileSocialPaused` middleware, mounted on `/api/chat/*`, `/api/team-chat/*`, `/api/gallery/*`, 503 `socialPaused` — one message for all three surfaces |
| `courtDisabled` | `matchOnDisabledCourt` |
| `tournamentInPlay` | `tournamentAlreadyActive` |
| `singleCaptain` | the partial unique index `ux_team_membership_active_captain` |
| `screenKeyRevoked` | `findActiveScreenKey` returns null, so the request is simply not a screen and falls to 401 |
| `roundNumberConflict`, `activityMismatch`, `galleryRawMissing` | superseded by the more specific messages beside them |

~~*Cost: minutes. Delete all eleven.*~~ **All eleven deleted**, each replacement guard
re-verified against the tree first. No behaviour changes.

### B-3 · Three live pushes that no test pins — **the real finding**

A `publish*` call is invisible to every test except one that opens the stream and waits for
the frame, which is why this was checked by sabotage rather than by reading. Every one of the
**14 publisher functions** is pinned. But six of them have more than one call site, and
deleting the sites one at a time found **three that no test notices**:

| Site | What stops happening | The comment already sitting above it |
|---|---|---|
| `lib/upSoonWatch.ts:77` | A team that **leaves** the up-soon window is never told. Entering is pinned; leaving is not. | *"Without it the Feed tab's LED would stay lit for a team whose match has already been played, which is how a signal stops being believed."* |
| `routes-gallery/index.ts:293` | **Restoring** a hidden photo does not light the gallery dot. Hiding is pinned; restoring is not. | *"a restored photo is new to everyone who never saw it, so it lights the dot."* |
| `routes-superadmin/corrections.ts:106` | The superadmin's **knockout winner correction** does not move the live feed row. The other correction path is pinned. | *"a correction moves the feed row and the board with it."* |

In each case **the sibling call site is pinned and the second one is not** — the same
one-instance-not-the-class shape the organiser ruled on for `publishChatHidden` in ADR-153.
The code is believed correct; what is missing is any test that would notice if it stopped
being. All three are also *silent* failures: nothing errors, a signal simply never arrives.

*Cost: ~½ day for three stream tests. **This is the top of the queue.***

### B-4 · The ADR record's heading levels disagree — ~~open~~ **DONE**

ADR-121…129 and ADR-141…151 are `##`; the other 141 are `###`. Twenty headings, one level
out, invisible when reading and fatal to anything that builds a contents list by level — the
first pass of this audit silently reported them as twenty missing ADRs. ~~*Cost: one `sed`.*~~ **Done** — all 165 ADR headings are now `###`.

### Duplicate sign-up, re-assessed — ~~blocked on a ruling~~ **PREVENTED (ADR-164)**

Design-doc §8 says "a duplicate sign-up is permanent" and leaves it there. Having read the
code, the gap is both narrower and wider than that sentence.

**It cannot be prevented, by construction.** Identity is nickname + 4-digit PIN
(`signUpRequestSchema`), and nothing else — no email, no phone, no pre-loaded roster. The
only uniqueness the database enforces is `ux_participant_nickname_lower`, which stops two
people taking *the same* nickname and does nothing about one person taking *two*. There is no
field on which a duplicate could be detected, so no amount of validation will catch one.

**The realistic trigger is a forgotten nickname, not a forgotten PIN.** A superadmin can
already reset a PIN from the participant detail page, so a participant who remembers who they
are can always be let back in. A participant who has forgotten *which* nickname they chose
has no route back, and the fastest thing a marshal can do on a busy morning is sign them up
again.

**What a duplicate costs, confirmed against the schema.** Every per-participant guarantee in
the system is keyed on `participant_id`, so a second row is a second entitlement:

- `ux_fringe_scan_live_slot (participant_id, round_id)` — the duplicate can **score the same
  activity round twice**.
- The swag limit is per participant per round — the duplicate can **claim the same item
  twice**.
- `ux_team_membership_active_participant` — the duplicate can be on a **second team**, which
  is the only one of these that can affect a tournament result.
- Both rows appear on the individual board and in ADR-161's export, and both count toward
  their cluster's `participantCount`; points earned under the first are stranded there.

**Nothing can be done after the fact.** There is no merge, no hide, no deactivate. The
`participant` table has no `is_hidden`, no `merged_into`, no `withdrawn_at`, and `no-hard-delete`
(standards rule) forbids deleting the row. The ghost is permanent and fully visible.

~~**This is a decision, not a task**, and it needs the organiser before any code.~~ **Ruled
2026-10-05: build the PREVENT remedy, not a merge and not a hide**, with the organiser
accepting that it does nothing for ghosts that already exist. Asked whether the lookup should
be restricted, the ruling was **no — these are all nicknames**. Shipped as **ADR-164**; see
§13. The merge stays unbuilt and unproposed: it is the only thing that could recover stranded
points, and it was explicitly not what was asked for.

### Gates at the time of audit (`89b27f5`)

standards **481/0** · eslint clean across four roots · both `tsc --noEmit` clean ·
API **665 passed, 3 skipped** (branches 94.68 / 94.60 floor) ·
web **1223 passed** (branches 98.40 / 98.38, functions 98.76, statements 99.17).

### The queue after this audit

1. ~~**B-3** — three stream tests.~~ **DONE (`104542f`)**; all three re-sabotaged and caught.
2. ~~**The seven remaining SSE gaps of §8.**~~ **DONE** — six closed (S4, T3, T4, S8, S9, C4);
   T2 documented as an accepted residual. §9's cache audit is likewise complete.
3. ~~**B-1 + B-2 + B-4** — delete 18 dead symbols, fix 20 headings.~~ **DONE** — 16 deleted,
   20 headings fixed; **two kept by standing instruction** (see §12).
4. ~~**Duplicate sign-up** — ruled `prevent`; build the nickname lookup.~~ **DONE** — ADR-164.
5. Unchanged and deliberate: **D4** unbuilt; three Playwright specs unexecuted here; the
   projector rehearsal is physical.

**Dropped from the queue, permanently:** the nickname rename (§5a).

---

## 8. The SSE audit, 2026-10-05 — twenty mutations against the three streams

The organiser asked for the stream suites to be audited in their own right, "given how
important it is", over and above the §7 pass. That is the correct instinct: the three SSE
endpoints are the only code in the tree whose failure mode is **silence**. A broken HTTP route
returns a status code somebody sees; a broken socket simply stops saying things, and on the day
that looks exactly like a quiet afternoon.

Counting tests does not measure a stream suite. There are 2,517 lines of test against 561 lines
of stream route — a four-to-one ratio that looks excellent and tells you nothing about which
*properties* are pinned. So the audit was done by mutation: twenty plausible regressions
introduced one at a time into `routes-status/stream.ts`, `routes-chat/stream.ts`,
`routes-team-chat/stream.ts` and `lib/statusBus.ts`, each run against the full API suite.

**Eleven were caught. Nine survived all 665 tests.** **Eight of the nine are now closed**
(`f75c4f2`, then the connect-race and heartbeat work); only T2 remains, for the reason below.

**T2 is the one left open, and this is the honest reason.** Setting `open = false` stops
deliveries at once, but the `while` loop only notices at its next heartbeat tick, so the
observable difference is a socket that closes twenty-five seconds later. A fake clock looked
like the answer — it is what closed S9 — and it does not work here: by the time the test has
finished draining the room's backlog the handler is already awaiting a `sleep` that was
scheduled on the real clock, and `vi.useFakeTimers()` cannot retroactively capture a timer that
already exists. Installing the fake clock earlier is not available either, because the setup
this test needs (create a team, join it, remove a member) is all real database work.

What T2 actually costs is worth stating plainly, because it is not a data leak: an ex-member's
socket stays open and receives **nothing** — T1 is pinned and guarantees that. The cost is a
connection that is never dropped, so the phone never reconnects and never meets the `403` that
would tell it the room is gone. That is a resource and a UX fault, not a privacy one, which is
why it is acceptable to leave it documented rather than contrive a test for it.

### Caught (11) — these properties are genuinely pinned

| # | Mutation | Failures |
|---|---|---|
| S2 | the status team-gate always authorises | 1 |
| S3 | forgetting a team does not leave its bus topic | 1 |
| S5 | the stream never goes live, so everything stays buffered | 14 |
| S6 | no reconnect delay on the snapshot | 1 |
| S7 | abort does not unsubscribe (status) | 1 |
| S10 | gallery activity sent under the chat event name | 2 |
| C1 | global chat re-sends messages at or below the resume cursor | 1 |
| C2 | a hide carries an `id:`, winding the resume cursor backwards | 1 |
| C3 | global chat drops frames arriving in the connect window | 1 |
| C5 | global chat sends no reconnect delay | 1 |
| T1 | team chat never re-reads membership before a write | 1 |

### Survived (9) — real gaps, in rough order of what they would cost on the day

| # | Mutation | What breaks, unobserved |
|---|---|---|
| ~~**B1**~~ | ~~a team bus topic is delivered to **every** team~~ **CLOSED `f75c4f2`** | **Cross-team leakage.** Every team's chat and up-soon frames on every phone. The single worst outcome on this list, and nothing fails. |
| **T2** | a former member keeps the socket instead of losing it | ADR-123's expiry is half-pinned: T1 proves the *check* happens, nothing proves the socket *closes*. Someone removed from a team keeps reading it until they reload. |
| ~~**S1**~~ | ~~a retraction stops being a team frame~~ **CLOSED `f75c4f2`** | ADR-155's explicit widening. A former member is told about a hide in a room they can no longer read. |
| ~~**T4**~~ | team chat re-sends messages at or below the cursor | Duplicate messages after every reconnect. Pinned for the global room (C1), not for the team room — the same one-instance-not-the-class shape as B-3. |
| ~~**S4**~~ | status drops frames arriving in the connect window | The announcement published while the snapshot is in flight is lost. Pinned for chat (C3), not for status. |
| ~~**T3**~~ | typing is delivered before the replay finishes | ADR-146's stated reason for the `pending.live` guard, unpinned. |
| ~~**S9**~~ | no heartbeat at all | ADR-043/119: the tunnel drops the socket at ~100 s and the phone goes quiet. |
| ~~**S8**~~ | the status `finally` does not unsubscribe | Listener leak on every normal close. |
| ~~**C4**~~ | global chat's abort does not unsubscribe | Listener leak on every abort. `onAbort` IS pinned for status (S7) and not for chat. |

### The pattern worth naming

Seven of the nine are the **same** shape: a property pinned on one stream and not on its
sibling. C1/T4, C3/S4, S7/C4 are three matched pairs where one half is guarded and the other is
not. This is the `publishChatHidden` finding (ADR-153) and the B-3 finding over again — the
tests were written per-incident rather than per-class, and each time the class has three or four
members. The remedy is the same one the organiser ruled on then: **close the class.**

The two that are not that shape — B1 and S9 — are worse, because they are properties nobody
wrote a test for at all: topic isolation, and the existence of the heartbeat.

### Queue position

This sits ahead of the §7 B-1/B-2/B-4 cleanup. Deleting dead exports is tidying; an unpinned
cross-team leak is the event's privacy ruling resting on nothing.

---

## 9. The cache audit, 2026-10-05 — the invalidation surface behind the streams

Asked for alongside the SSE audit: do the stream branches have sound cache decorators and
invalidation surfaces. Audited the same way, by mutation, because the §8 pass had just shown
that reading the code and believing it is how nine gaps got there.

### What a stream actually reads through the cache

A frame is pushed and costs no read. The cache only matters at the **other** end of the socket:
the snapshot or backlog a phone gets when it *connects*. That read is the whole exposure, and
it is five cached values plus one uncached:

| Read at stream-open | Decorator | Tag | TTL |
|---|---|---|---|
| `readLiveAnnouncements` (status snapshot) | yes | `ANNOUNCEMENT_TAG` | 5 s |
| `latestChatActivity` (status snapshot) | yes | `CHAT_TAG` | **10 min** |
| `latestGalleryActivity` (status snapshot) | yes | `GALLERY_TAG` | **10 min** |
| `latestTeamChatActivity` (status snapshot) | yes | `teamChatTag(team)` | **10 min** |
| `upSoonFixtureForTeam` (status snapshot) | yes | `TOURNAMENT_TAG` | — |
| `readVisibleMessages` (global chat backlog) | yes | `CHAT_TAG` | 2 s |
| `readTeamChatMessages` (team chat backlog) | **no** | — | — |

**This is the failure mode worth naming.** A write publishes a frame AND must void the tag
behind the matching reconnect read. Do the first and not the second and the system splits in
two: phones that stayed connected are correct, phones that reconnect are wrong — and on the
three ten-minute watermarks they are wrong for *ten minutes*. It is invisible from either
phone's own screen, and it reads as "the dots are flaky".

### Result: ten mutations, nine caught

Every `invalidateTag` that backs an SSE read was deleted in turn and the full suite run.

**Caught (9):** `createChatMessage` (8 failures), `invalidateChatMessage` (3),
`createTeamChatMessage` (2), `hideTeamChatMessage` (1), `announceRosterEvent` (1),
`createAnnouncement` (2), `createGalleryPhoto` (2), `restoreGalleryPhoto` (1),
`invalidateGalleryPhoto` (2).

This is a much better result than §8's 11-of-20, and the reason is structural rather than
lucky: **invalidation lives inside the entity write, not at the route.** A route cannot forget
what it never had to remember. `announceRosterEvent` is the one case where it could not —
`createTeamChatMessage` runs inside the caller's transaction, so its own void lands before the
COMMIT and a reader in that window can pin pre-commit state for the full ten minutes — and the
answer there was to export a single seam that voids again after the commit, which the audit
confirms is pinned.

**Survived (1) — K7, `invalidateAnnouncement`.** Closed in this commit. The code was always
correct; nothing proved it. The existing retraction test passes with the invalidation deleted
because it never puts the pre-retraction answer into the cache: it announces (voiding the tag),
retracts, then reads, so the read it asserts on is the first one after the write and is fresh
either way. **A cache test that never warms the cache is testing nothing** — that is the
generalisable lesson, and it is worth checking against any future cache test. The new test
warms the list, retracts, then asserts on both the poll and a freshly-opened stream's snapshot.

### Tag coverage

No dead tags: all eight (`SCOREBOARD`, `CHAT`, `GALLERY`, `ANNOUNCEMENT`, `TOURNAMENT`,
`COURT`, `LIVE_MATCH`, `teamChatTag`) have both cached readers and invalidating writers.
`reportPhoto` correctly does *not* invalidate — the gallery page carries no report count, so a
report changes nothing a reader can see.

### Two deliberate non-cachings, both correct

- **`readTeamChatMessages` is uncached while the global backlog is cached.** Right, and the
  asymmetry is the point: a reconnect storm puts three hundred phones on the global room's one
  key, where the memo collapses them to one query. The same storm spreads across sixty team
  rooms at about five phones each, where a cache would buy almost nothing and add sixty keys.
- **`findActiveMembership` is uncached and runs per frame delivery** on both streams. See
  below — this is the one open question.

### OPEN — should the per-delivery membership check be cached?

`findActiveMembership` is the hottest uncached read on the SSE path: once per connect, then
again for **every** team frame delivered (the status stream's gate) and **every** team chat
message (`stillAMember`). A chatty team room costs roughly two indexed point-reads per member
per message.

Caching it is a real optimisation and also **the most dangerous place in this codebase to put a
cache**, because a stale hit is not a slow page — it is an ex-member reading a room they were
removed from, which is the exact property ADR-123 and ADR-128 exist to guarantee. A TTL alone
is unacceptable for the same reason. It would have to be a tag voided by every membership write
— join, leave, captaincy transfer, roster add, roster remove, disband, withdraw — which is a
seven-site surface where one miss is a privacy failure rather than a stale number.

**RULED 2026-10-05: cache it, with invalidation.** The organiser overruled the recommendation
below, and was right to — the premise was wrong. The surface is nine writes in two entity
modules funnelling through **four** post-commit seams, which is narrower than `TOURNAMENT_TAG`.
Built as **ADR-162**: a coarse `MEMBERSHIP_TAG`, a deliberately tiny one-second TTL (a blast
radius, not a freshness policy), no stale-while-revalidate, voids after the COMMIT, a
`membership-void` standards rule, and tests at all four seams. Two of those seams — the
superadmin roster repairs and the participant captaincy handover — were pinned by **nothing**
before this, which is the vindication of asking the question.

The original recommendation, kept for the record: ~~leave it uncached.~~

~~**Recommendation: leave it uncached.**~~ The read is a single indexed point lookup, the load is
tens per second at peak, and the current cost is the cheapest insurance in the system. Raised
here because it is a genuine judgement call rather than an oversight, and because the next
person to profile the stream will find it and be tempted.

---

## 10. Closing the SSE gaps, 2026-10-05 — what it took

Six of §8's seven remaining gaps are closed. The work is worth recording because four of them
could not be closed by writing an ordinary test, and the reasons generalise.

### The connect window cannot be raced for; it has to be held open

S4 (status drops frames published while the snapshot is in flight), T3 (typing delivered before
the replay finishes) and T4 (team chat sends a buffered message twice) all live in the gap
between "subscribed to the bus" and "finished the opening read". Publishing into that gap by
hand is a race: it would pass on a quiet machine, fail on a loaded one, and be deleted within
six months as flaky.

So the window is held open on purpose. `readAlertsFor` and `readTeamChatMessages` are wrapped
in their own test files with a gate the test releases, which makes the window deterministic and
arbitrarily wide. A module mock applies to a whole file, which is why these are
`status-stream-connect-race.test.ts` and `team-chat-connect-race.test.ts` rather than three
more cases in the existing suites.

**Which side of the real read the gate holds is itself the design.** S4 holds *after* it, so
the snapshot is genuinely pre-publish and the test can prove the frame was missing from it.
T4 holds *before* it, so a message sent inside the window is both committed (and therefore in
the backlog) and already on the bus (and therefore in the buffer) — the exact overlap the
cursor guard exists to resolve, and otherwise nearly impossible to arrange.

### Two tests passed against the very bug they were written for

Worth recording without euphemism, because both were caught only by re-sabotaging:

- The first T4 test stopped reading as soon as the message arrived, so it could never see the
  second copy. It passed with the cursor guard deleted. Fixed by sending a *later* line and
  reading past the duplicate.
- The first S8 test polled for subscribers after a throwing snapshot read, found none, and
  passed — but would have passed just as happily against a handler that never subscribed at
  all. Fixed by holding the handler mid-flight, asserting a subscriber exists, and only then
  pushing it down the failure path.

Both are the same error in different clothes: **asserting an absence without first establishing
the presence it is an absence of.** It is the sibling of §9's "a cache test that never warms
the cache", and between them they account for three of the four weak tests found today.

### S8 and C4 are redundancy, not gaps

Deleting the status `finally` alone changes nothing observable, because `onAbort` covers the
ordinary close; deleting chat's `onAbort` alone changes nothing, because the `finally` does.
The tests therefore pin the **outcome** — a closed socket leaves no listener — and both fail
when all cleanup is removed. S8 additionally has a genuine test of its own: a throw between
subscribing and the heartbeat loop is a path `onAbort` never sees, and it now fails when only
the `finally` is deleted.

`chatBus` gained `chatSubscriberCountForTests()` for this. Declared honestly as a test seam
rather than given an invented production caller — `statusBus` can answer the same question from
real code because `hasStatusSubscribers` gates the leaderboard aggregate, and nothing on the
chat path needs it.

### S9 needed a fake clock

Twenty-five seconds is not waitable. `vi.useFakeTimers()` works provided every database call is
made first — PGlite's scheduling must not be driven by the test clock — and provided the sleep
being advanced is scheduled *after* the fake clock is installed. That second condition is
exactly what makes T2 unreachable; see §8.

### Result

api **683 passed**, branches **94.89** (up from 94.68), standards 485/0 over 16 rules.

---

## 11. The "new messages" separator — ADR-163, 2026-10-05

~~Draw a boundary in both chat rooms showing where the reader stopped last time.~~ **SHIPPED.**

New: `apps/web/src/lib/hooks/useNewMessageBoundary.ts`,
`apps/web/src/components/participant/NewMessagesDivider.tsx` (+ the hook's test file).
Wired into `routes-participant/ChatPanel.tsx` and `components/participant/TeamChatPanel.tsx`;
`.gb-new-messages` added to `styles/gameboy.css`. Full reasoning in the ADR-163 addendum.

**What was nearly got wrong, in order of how quietly it would have failed:**

1. **Reading the mark in a `useMemo` over storage** instead of freezing it on the first render.
   The room marks its own feed read on open, so the line would have appeared and then vanished
   a tick later. The organiser's first ruling exists precisely because this is the default
   behaviour of the obvious implementation.
2. **Treating "no mark" and "mark before everything" as the same thing.** They are opposite
   cases: the first draws no line (nothing is known to have been read), the second draws it
   above the whole page (everything is new). The ref holds `undefined` for "not captured yet"
   and `null` for "captured, and there was none" to keep them apart.
3. **A `>=` comparison**, which puts the line above a message the reader has already seen,
   every time they open a room they are caught up on.
4. **A `<div>` inside the `<ul>`.**

**Residual:** none outstanding. The scroll is unobservable in jsdom (no layout), so it is pinned
through the ref callback with a stubbed `scrollIntoView` rather than through a rendered panel;
that the rule is *reachable* in a real browser is the one thing the suite cannot prove and the
physical rehearsal should check.

---

## 12. B-1/B-2/B-4 — the dead-symbol sweep, 2026-10-05

**16 of the 18 symbols deleted, 20 headings levelled.** Nothing here changes behaviour; the
value is that the next audit does not have to re-derive the same eighteen answers.

**Two are kept, and the audit was wrong to list them.** `ParticipantTitle` and
`PARTICIPANT_TITLE_MAX_LENGTH` were already ruled on: `docs/cleanup/2026-09-30-orphan-cleanup.md`
§4.1 records the organiser's instruction that the titles module stays untouched, *those two
zero-consumer exports included*. A later audit rediscovering them as "dead" and deleting them
is how a standing instruction gets quietly reversed by attrition. They stay, and the cleanup
doc is the reason. `PARTICIPANT_TITLE_MAX_LENGTH` also documents the column's `CHECK` in
`schema.sql`, which is worth something on its own.

**`ART_ANCHORS` needed the generator, not the file.** `apps/web/src/lib/avatarArt.ts` is
generated. Deleting the export there would have been undone by the next `npm run art`, so the
emission was removed from the template in `apps/web/scripts/generate-avatar-art.mjs` and the
file regenerated — `ART_VERSION` is unchanged (`8222f306`), since the digest covers the art and
not the template, and the regeneration produced exactly the intended six-line deletion. The
generator keeps its own `ANCHORS`: it uses them at `:88` to check that no prop covers the eyes
across all 500 combinations. The constant was dead *downstream*, not in the tool that cares.

**One stray comment moved.** The ADR-138 note explaining the two undo refusals sat three keys
above the refusals it describes, where it read as a remark about screen keys. It now sits above
`scanUndoExpired`.

**`chatCursorSchema` survives its two orphaned consumers.** Deleting the two `markChatRead*`
schemas (ADR-129 dropped the route and the column but left the request shapes behind) does not
orphan the cursor schema — both chat routes still parse their `after` parameter with it.

**A flake fixed on the way, and it was not a flake about the machine.**
`useScreenPhotos.test.ts` failed roughly one run in six. The test settled its stubbed image
loads **once**, up front, which only delivers bytes to the requests that are open at that
instant — and the hook reaches its preloads through an async chain, so a batch issued a tick
later never gets its bytes and `photos` sits at zero until the wait expires. The symptom is a
value that is never coming, not one arriving slowly, which is why raising the timeout (twice
already, in ADR-161) never fixed it. The settle now runs inside the retry, alongside the
assertion. Ten consecutive clean runs of the file, and a clean full suite.

**Gates:** standards 488 files / 16 rules / 0 violations; tsc clean in contracts, api and web;
eslint clean; api 683 passed / 3 skipped, branches 94.90; web 1239 passed, branches 98.40.

---

## 13. The duplicate sign-up, prevented — ADR-164, 2026-10-05

~~The last open item in the queue.~~ **SHIPPED.** Full reasoning in the ADR-164 addendum; what
follows is what the work turned out to be, as opposed to what the audit expected.

**The audit framed this as unfixable and it was half right.** A duplicate cannot be detected
and cannot be undone — both of those survive this change. What the audit missed is that the
defect has a *mechanism*, and the mechanism is narrow: the only realistic way a duplicate gets
made is somebody who has forgotten their nickname being told, in effect, to sign up again.
There was no route back for a forgotten nickname, while a forgotten PIN has had one all along.
Close that one gap and the common case disappears.

**The placement is the feature.** The same component reached from the sign-in page would have
been nearly worthless: anyone who takes "I already have a nickname" has already remembered it.
It had to go **above the nickname field on the sign-up form**, where it interrupts the person
about to create the duplicate. That is the one decision in this piece of work that would be
easy to get wrong while shipping something that demos identically.

**Two things were deliberately not built.** No merge — it is the only remedy that recovers
stranded points, and it was explicitly not what was asked for. And no cache on the new read,
against the house habit: it runs a handful of times per event, and §9's rule is that a cached
read needs an invalidation surface, so a tag voided by every sign-up would be risk bought for
nothing.

**New surface.** `GET /api/participants/nicknames?clusterCode=XX` (anonymous, classified in the
authorization matrix), `listNicknamesInCluster` in `db/entities/participants.ts`,
`lib/hooks/useNicknameFinder.ts`, `routes-participant/FindNicknamePage.tsx` at `/find-nickname`,
entry points on `SignUpPage` and `SignInPage`, an optional `initialNickname` on
`useParticipantSignIn`, and a cluster filter on the superadmin directory.

**Residual, honestly stated:** every ghost already in the database is still there, still
scoring, still on the board and still in the standings export. Nothing in this change touches
them, and nothing can without a merge.

**Gates:** standards 491 / 16 rules / 0 violations; tsc and eslint clean across contracts, api
and web; api 690 passed / 3 skipped, branches 94.91; web 1252 passed, branches 98.41. Eight
sabotages watched to fail.

---

## 14. Sabotage sweep of the participant surfaces, 2026-10-05

The SSE and cache layers had each been swept; the participant-facing surfaces — the ones every
attendee actually touches — never had been. **28 mutations across `routes-participant`,
`components/participant` and `lib/`, run against the 888-test scoped suite. 25 caught, 2 real
survivors, 1 false survivor that was the sweep's own fault.**

Better than the SSE sweep's 11-of-20, and for a structural reason: these surfaces are rendered,
so most promises are visible to a test that looks at the screen. The two that got through are
both promises you **cannot see on the screen**.

### The two gaps, both closed

**P25 — `useLocalCachedData` threw away nothing.** Deleting
`if (!isMountedRef.current || activeKey.current !== key) return;` broke no test at all. This is
the guard that stops a read started for one surface landing on another, and it matters twice
over: the late answer is not merely *displayed* in the wrong place, it is also written to the
device cache under whatever name and actor are current when it resolves — so the wrong answer
**outlives the page that asked for it** and is served instantly on the next visit. On a shared
phone the actor half of that key is another participant. Now pinned by two tests, one per door
(a route change mid-flight, and an unmount mid-flight), and each half of the condition verified
to fail on its own.

**P16 — the typing sweep's re-render shortcut.** `useTypingWatchers` prunes expired typists on
a one-second timer and returns the *same object* when nothing expired, so a room with somebody
holding a key down does not re-render every message, avatar and timestamp once a second. Purely
a cost promise, invisible through a rendered panel, and nothing held it. Now pinned in a new
`useTypingWatchers.test.ts`, alongside three tests that stop the cheap way of passing it
(deleting the sweep).

### The false survivor, which is the more useful lesson

**P24 was scored SURVIVED and was nothing of the kind.** The mutation deleted the `if` from an
`if/else` and left the `else` dangling, so the file did not parse — vitest reported a failed
test *file* and **zero failed tests**, and a classifier looking for `Tests N failed` read that
as "nothing noticed". A sweep that cannot tell "no test caught this" from "this did not
compile" will quietly under-report, and every verdict it produces is suspect. The classifier
now treats a failed file as `INVALID`, and P24 re-ran as CAUGHT.

### And the flake that was never a flake

`useScreenPhotos.test.ts` has now failed intermittently across three sessions, and had been
"fixed" twice by raising `waitFor` timeouts to five seconds — most recently by me, in
`f7bdac6`. **Those raises could never have worked.** Vitest's default budget for a whole test
is also five seconds, so a five-second wait inside it can never be spent: under load the test
died of the *test* timeout while its wait was still waiting. The number that had to move was
the test's own, not the wait's. Both tests in that file carrying long waits now declare a
20-second budget. Six consecutive clean full runs, against roughly one failure in five before.

**Gates:** standards 493 files / 16 rules / 0 violations; tsc and eslint clean; web 1258 passed,
branches 98.42, functions 98.69, statements 99.18. The api suite is untouched by this work and
stands at 690 passed / 3 skipped from `eef65b4`.

## 15. The station-pages flake — open, instrumented, not reproduced

`routes-facilitator/station-pages.test.tsx` → *"routes typing from anywhere on the page into
the number box (ADR-105)"* failed **once**, inside a full-suite run, in 32 ms — a fast
assertion failure, not a timeout.

**Not reproduced in fifteen further attempts:** three full web-suite runs (1266 passed each)
and twelve standalone runs of the file under four-way CPU starvation (`yes > /dev/null` ×4 on
a 2-core host). The earlier session also ran it standalone twenty times, clean. Whatever the
trigger is, it is neither CPU contention on its own nor anything inside the file's own order.

**Hypotheses eliminated by reading the code, not by running it:**

| Candidate | Why it is not the cause |
| --- | --- |
| `navigator.onLine` left false by another test, disabling the box | The describe's `beforeEach` calls `setLink(true)` before every test |
| A leaked confirm dialog suppressing capture (`disabled: confirm.request !== null`) | `useConfirm` is plain `useState`, per render tree — it cannot outlive a test |
| Cross-file jsdom pollution | Vitest 3.2.7 defaults to `isolate: true`; each file gets a fresh environment |
| CPU starvation making the effect attach late | Twelve starved runs, all green |

**What was changed:** nothing in the product, and nothing that weakens the test. The two
conditions under which `useTypeAnywhere` *correctly* declines — a disabled box, and a confirm
dialog being up — are now asserted on their own lines before the keystroke is dispatched. Both
were verified to discriminate: forcing the station offline fails on `toBeEnabled()`, and
opening a real dialog fails on the dialog assertion. The final `toHaveFocus()` is unchanged.

The point is diagnosability. `toHaveFocus()` failing reported only "the box is not focused",
which is the one fact already known; the next occurrence will name which precondition broke.
**Do not quarantine or retry-wrap this test** — it has failed once in well over thirty runs,
and if it is reporting a real fault, that report is the only evidence anyone will get.
