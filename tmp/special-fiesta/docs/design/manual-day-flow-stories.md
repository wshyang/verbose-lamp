# A manual-mode day, in ten flow stories

Fuel for the next user friction hunt. Each story is walked through the screens and routes that are in the tree
today, with the file that owns the behaviour named, so the hunt can check a claim in a minute instead of a
morning. Nothing below is a wish: where the design has a hole, the story says so and says which layer holds it
— screen, API, or data — because a friction hunt that cannot tell those three apart produces complaints nobody
can act on.

**"Manual mode"** here means the day is run by people, not by a scheduler. Matches are hand-started on a court
console, results are bumped by the marshal standing beside the court, fringe stations take one person at a time,
and every correction is a superadmin deciding something and writing a sentence about why. The schedule exists
(fixtures, rounds, courts, a queue), but nothing advances by itself: the queue's whole job is to have the right
pair at the top when somebody taps Start.

**The cast.**

| Actor | device | Signs in with | Surfaces |
|---|---|---|---|
| Participant | their phone | nickname + 4-digit PIN (`PIN_PATTERN`) | landing, feed tabs, leaderboard, line-ups, team, passport, photos, chat, QR home, agenda |
| Facilitator (marshal, station, swag) | shared tablet or their phone | username + 4-digit passcode (`passcodeSchema`) | station picker, court console, fringe station, swag station, sync queue, PIN reset |
| Superadmin (the desk) | laptop | superadmin passcode | dashboard, tournament, matches, scans, swag, participants, teams, clusters, courts, point config, court queue, audit, agenda, announcements, gallery, system, final standings |
| The hall screen | a laptop on a TV | a screen key | the projector view: board, live match, bracket, announcements |

**The day's clock.** Activation (a plan becomes fixtures, stage rows and a schedule) → pool rounds → close the
group stage (which draws the bracket) → knockout, plus the third-place play-off → the final → awards and
adjustments → the export. Four numbers run underneath: 10 seconds (a station's undo window,
`SCAN_UNDO_WINDOW_SECONDS`, `packages/contracts/src/schemas.ts:702`), 5 seconds (how long a board read is
cached and served to every viewer, `ttlMs: 5_000` / `swrMs: 25_000` in `db/entities/leaderboard.ts:239`), the
day's last slot (projected from `estimateStartTimes`, read by the admission check and `CourtQueuePage`), and
zero — the number of things that happen on their own.

---

## Positive

### P1 · A marshal plays the next fixture without ever meeting one

**Who / where.** A facilitator at Court 2, 09:04, forty people in a line.

**Step by step.** `/staff/sign-in` (`StaffSignInPage`) → `StaffHomePage.tsx:18` says *"Pick your station"* and
assembles the list from three reads — courts, fringe activities, swag counters (`useStaffTools.ts:26-58`) —
and each tile already carries its state: `Match in progress` or `Idle` on a court, `Round 3 · open` or
`No round open` on a station, with the disabled ones marked and a ★ on the station *assigned* to this account
(`default_station_type` / `default_station_id` on `facilitator_accounts`, `schema.sql:44-46`). Nothing about the
★ is remembered from use, and its CHECK only allows `court` or `fringe_activity` — so a swag marshal re-picks
their counter from scratch every single morning. Then the court console. `CourtPage` asks
`GET /api/tournament/courts/:courtId/current-match`; nothing is live, so the panel is *"Start a match"* with
the pair already in the pickers: `useCourtConsole.ts:72-73` takes `schedule.upNext[0]` into
`useSchedulePrepopulation` (same file, :291-308), which fills A and B once and then never touches a human's
choice again — ADR-089's rule, quoted in the code as *"prepopulate the suggestion, never fight the human"*.
The picker's own note says what the extra options are for (:104): *"the court's planned fixture; the rest
cover 'the scheduled team is missing but…"* — and the queue list under it labels each row `Up next here` or
`Queue #3` (`CourtPage.tsx:125`). One tap on **Start match**: `POST /api/tournament/matches` with a court and
two teams, no fixture id anywhere in the body.

**What the system answers.** `routes-tournament/index.ts:308-318` creates the match and then calls
`claimFixtureForMatch` (`db/entities/schedule.ts:276`), which looks for a pending fixture holding that pair in
either order and claims it with a guarded `UPDATE … WHERE status = 'pending'`, so two courts cannot take the
same one. The hall screen's now-playing panel moves, the queue advances, both teams' line-up pages show the
match, and the court flips to the scoreboard. The marshal never learned, and did not need to learn, that a row
in `tournament_fixture` existed.

**Why this is a good story.** The one hard idea in the design — a match may or may not *belong* to the
schedule — is absorbed by the pairing rule plus one sentence of feedback (N3 argues about where that sentence
stops). The prepopulation is the whole trick: the human confirms a pair instead of constructing one.

`GET /api/tournament/courts/:courtId/recent-teams` (`routes-tournament/index.ts:95`) is what pins the two
teams who just finished on this court to the top of the pickers (:104's comment explains why the list is longer
than the one planned fixture), so a back-to-back round costs no searching.

**Count this.** Seconds from "the teams arrive" to "live". Taps when the pair is *not* `upNext[0]` — how far
down the picker it is, and whether the pinned group helps or just re-sorts the same forty names. Whether
anybody has to ask the desk to move their ★.

### P2 · The score decides who won, and a knockout warns before the mistake

**Who / where.** Same court, 09:22, a marshal with a scorepad and a crowd with opinions.

**Step by step.** Every point is a tap on `MatchScoreboard` → `POST /api/tournament/matches/:matchId/score`, so
the projector moves while they play, and the two teams sit one to each side of the panel because that is how
the marshal is facing them (`MatchScoreboard.tsx:4`, ADR-114). If the match is a knockout or the
third-place play-off, a warning is above the board before anything is typed (`CourtPage.tsx:43-49`, ADR-152):
a knockout cannot be drawn — the point being that the marshal learns that *before* a level score, not when a
button fails to appear. At the whistle **Complete**, and nobody chooses a winner: `assertResultMatchesScore`
(`lib/matchResult.ts`) derives it from the numbers, and a level score in a pool *is* a draw, which pays both
sides the stage's `drawPoints`.

**What the system answers.** `POST /matches/:matchId/complete` (`routes-tournament/index.ts:323`) prices the
result through the stage row (`pointsForCompletion`, :337 and :371, over `stageRates` at
`db/entities/stages.ts:166`, with
`point_config` underneath it for a day that has no stage), freezes both rosters as they stand so the point
award cannot be gamed by late joiners (ADR-005), pays each roster member, moves the cluster board, and moves
the standings only if the stage's `pays_standings` says to (ADR-246) — that flag is why a friendly can pay a
cluster and still not touch a table. The read models are invalidated by tag (`TOURNAMENT_TAG`) and the feed row
is published. If the fixture fed a bracket seat, `advanceWinner` (`db/entities/schedule.ts:385`, reached only
when the settled fixture is not a group one and a winner exists) fills *every* seat it feeds — ADR-137: "its
winner goes up to the final and its loser goes across to the third-place match" — so the bracket needs no
engine: a seat is a row with a team id in it, and the completion handler writes it inside the same
transaction.

**Why this is a good story.** Two of the app's hardest bugs are structurally gone: a winner that disagrees with
the score, and a "who won" decision made by whoever happens to be tapping. A second match cannot be started on
this court meanwhile: `courtBusy`.

**Count this.** The scoreboard is not a `+1`: `scoreWindow` shows five numbers and enables only the two
neighbours of the current score (`MatchScoreboard.tsx:17-20`, `:56`), so a mis-tap is undone on the board
itself — *"there is no gesture here that can invent a score nobody played"*. What the console cannot do is reach a
result it already completed: that is the desk's (`courtBusy`, `routes-tournament/index.ts:404`, holds the slot
meanwhile), and the correction dialog arrives prefilled with the numbers as recorded (ADR-157). Count the
seconds between "the marshal knows it is wrong" and "the desk has the row open".

### P3 · Ninety seconds a person at a station, including the dropout

**Who / where.** The tug-of-war station, 13:10, a queue of twelve, marquee wifi that is not there.

**Step by step.** `FringeStationPage`. A person holds up their badge: `QrHomePage` draws the code in the browser
(`useQrCode`, `lib/hooks/useParticipantHome.ts`), says *"Show this at any station"*, shrinks itself to fit a
short screen so it is one glance and not a scroll (ADR-098), and reads out the fallback: *"Can't scan? Give the
facilitator your number:"* and four digits (`QrHomePage.tsx:45-50`, ADR-088) — or the person simply says
those four digits, and the facilitator types them into `#fringe-number`: a `text` input with
`inputMode="numeric"` because a
`type="number"` sheds leading zeros and accepts `e` and `-` (`FringeStationPage.tsx:199-213`). The tier comes
from the activity's award tiers, or is `PARTICIPATION_LABEL` when the round is participation-armed. `POST
/api/fringe/scans` carries `nickname`, `roundId`, `tierLabel`, `clientScanUuid`, `clientTimestamp`
(`routes-fringe/index.ts:124`).

**What the system answers.** `createScan` returns one of three outcomes
(`db/entities/scans.ts:68-89`) and the screen prints the sentence for it (`FringeStationPage.tsx:150-158`):
**created**; **retry**, which is what the same client key answers with after a flush, so nine queued scans
become nine awards and not eighteen; or **conflict** — this person already holds a slot in this round — which
renders `ReplaceAwardRow` ("*Replace award for Priya*" → `replaceScan`, ADR-116: void the old award and write
the new one in the same transaction, so the participant never loses points to the swap). The number field is
refocused after every outcome, by a `useEffect` whose comment is *"The queue is the point"* (:140-145), so a
marshal types twelve numbers without tapping the screen twelve times.

**And the dropout.** With no network the write goes to `lib/offline/scanQueue.ts`, and `SyncQueuePage.tsx:16`
states plainly which world it is in — *"Online · 4 waiting"* or *"Offline · 4 waiting"* — listing each item with
its attempt count and last error (:64). A scan is only a scan: the points, the passport stamp and the board are
computed on read (`GET /api/me/passport`), so a row that arrives two minutes late simply appears, and the
passport counts each station once rather than per award. The device keeps a warm-start copy of that view
(`lib/storage/cacheNames.ts:27`, ADR-239), so a phone with nothing to say to a station still has a passport
open on it.

**Count this.** Seconds per person at peak, and how many of those are *finding the person* — which is the part
no code can shorten, except that a dead battery ends at `PinResetPage` (`PUT /api/staff/participants/:id/pin`),
another device, another queue.

### P4 · The desk corrects a result while the day still fits it, and everything follows

**Who / where.** The laptop on the desk, 12:40. A marshal wrote 3–2; it was 2–3.

**Step by step.** `MatchesPage` — one filter, a status select (`matches__status-filter`, `MatchesPage.tsx:30`),
no search box, nothing in the URL — → the row's **Correct result** (`MatchesPage.tsx:121`, dialog title
*"Correct result — Red Lions vs Selco Bastion"*, :18). The dialog takes the whole result, not a delta: score A,
score B, a winner that is usually left blank, and `editReason`, 1–200 characters and required
(`matchEditReasonRequired`). The dialog is the shared `ReasonDialog` (`components/console/ReasonDialog.tsx`),
which pre-fills nothing for the reason, applies its own 3-character floor (`MIN_REASON_LENGTH`,
`useAdminCorrections.ts:24`) and refuses a short one with `voidReasonRequired`.
`POST /api/admin/matches/:matchId/result` → `assertCorrectionAllowed`
(`routes-superadmin/corrections.ts:273-300`) decides whether the day still permits it → `assertResultMatchesScore`
runs the marshal's own rule over the corrected numbers, so the desk cannot type a contradiction either →
`editMatchResult` writes, and `cascadeWinnerEdit` moves the winner into any downstream seat nobody has played
yet (ADR-157). The hook's comment states the philosophy behind the blank winner field
(`lib/hooks/useAdminCorrections.ts:176`): *"0 - 0 in a bracket names nobody and cannot be drawn, so a human
still decides."*

**What the system answers.** Standings, cluster board, hall screen, participants' feed, bracket, passport, day's
export — every one of them recomputed on read from the same rows, so there is no list of five places to fix and
no way to fix four of five (ADR-006). The old result is not deleted: the match keeps `edit_reason` and an
author, shown under the row as *"edited: transposed the scores"*, and `AuditPage` reads
`GET /api/admin/void-audit` for the whole day's decisions in both directions. If the match should not have
happened at all, **Void** takes a reason (`voidReasonRequired`) and **Unvoid** takes another; the ledger keeps
both.

**Why this is a good story.** It is the app's best answer to "a human got it wrong": refuse only what cannot be
undone downstream, and let one signed write move every reader.

**Count this.** The 20 seconds versus 3 minutes between "filter by status" and finding the row, and whether
that lookup is done from a `Void` at all. Whether
"downstream seat already played" is understood by the person holding the laptop, or arrives as a 409 they
have to interpret out loud to a team.

### P5 · Four strangers arrive at 11:20 and play the rest of the day

**Who / where.** Two phones at the gate, then the desk.

**Step by step.** They sign up. `App.tsx` puts a signed-out participant on `SignInPage`, whose escape hatch is
`FindNicknamePage` — and ADR-164's test pins the shape of that screen in its own words: *"nothing is asked for
until a cluster is chosen, the typed filter narrows what has already arrived rather than asking again, and
choosing a nickname lands on sign-in with the name filled in."* The code is the same shape:
`useNicknameFinder.ts:37` answers an empty cluster with an empty list and no request, and `GET
/api/participants/nicknames` refuses a cluster it does not recognise rather than returning nobody — ADR-172's
reason, in its own words, is that an empty list *"reads as 'nobody from there' rather than 'there is no such
place'."* A duplicate is caught at 11:20, not at 16:00, and a mistyped cluster is not silently nobody.
Team formed; the join code is read out to the other two — six characters from
`JOIN_CODE_ALPHABET` (`db/ids.ts:18`, no `0`, `1`, `I`, `L` or `O`, rejection-sampled so it is uniform) and
`JOIN_CODE_LENGTH = 6`, because this code is spoken across a marquee.

The desk opens `TournamentPage`, which now shows the teams standing outside the field
(`GET /api/admin/tournament/admissions`, `routes-superadmin/tournament.ts:242`) — before ADR-149 no screen in
the app could tell an organiser that four people were waiting for a match that would never exist — and admits
them **only if the day has room**, from the same plan the schedule is made of: `admissionClosed` if the group
stage has closed (:258), `admissionNoTimeLeft` if `plan.fitsFixtures < 1` (:280), `admissionTooManyMatches` if
the request is bigger than the remaining slots (:281).

**What the system answers.** They play, and their results price into the same ledgers as everyone else's. If the
desk later has to move a person between teams, the repair writes a line into that team's own history
(`TeamsDirectoryPage` / `TeamsRepairPage`, ADR-154/155) — and a captain can hide a *message* in their room but
not that line, which is `teamChatHideNotSaid`'s entire subject.

**And at 17:10 the day leaves the building.** `FinalStandingsPage` reads `GET /api/admin/standings/final`
(`routes-superadmin/standings.ts:15` → `lib/finalStandings.ts:26`), assembled from the readers the projector
already uses: the cluster rows, the individual rows, the group tables, the podium. A downloaded sheet cannot
disagree with the screen behind it (ADR-161).

**Count this.** Minutes from "four people at the gate" to "they're in a match" — and whether the *reason* an
admission was refused is legible to the four people, or only to the desk.

---

## Negative

### N1 · The day cannot be closed, and the button does not know the sentence that fixes it

**The moment.** 15:40, the sky opens, six pool fixtures are unplayed. The admin taps *Close group stage*.

**What happens.** The control is `tournament__close-group-stage` (`TournamentPage.tsx:232`), whose handler is
`closeGroupStageNow: () => void actions.close.run({})` (`lib/hooks/useAdminTournament.ts:151`) calling
`closeGroupStage()` (`lib/api/admin.ts:454`), which posts — literally — an empty object. The API answers
`groupStageUnresolved`, and the sentence is a list of three errands:
*"Resolve every group fixture first — play it, walkover it, or skip it."* (`packages/contracts/src/messages.ts:121`)

The fourth answer exists, and it was built for exactly this weather. The route takes
`closeGroupStageRequestSchema` with `force` and a 1–200-character `reason`
(`routes-superadmin/tournament.ts`, `closeGroupStage` in `db/entities/schedule.ts:670`, whose input type says so
plainly: *"`force` is what makes `reason` mandatory, and the pair of them is what the row remembers"*), the
stage row keeps `close_reason` beside `closed_by_superadmin_id`, and every unplayed fixture stays pending and
correctable. **No screen sends it.** So the operator's options are: skip six fixtures one dialog at a time
(`POST /api/admin/tournament/fixtures/:fixtureId/skip`, `tournament.ts:318`), walk over results nobody agreed
to (:299), or find a machine with a terminal and curl.

**Where the friction lives.** Screen, and only screen: the API and the data are right. Note what the refusal
does to a second attempt — it repeats itself, because the sentence was written for the day that *has* nothing
else, and it happens to be the one sentence that no longer describes this day. An answer that named the
organiser's own escape hatch ("or close it anyway, and say why") is a different experience at 15:41.

**Count this.** Taps per skip × 6. Whether the button gets pressed twice. Whether anybody shouts at anybody
with a laptop.

### N2 · The bracket has been drawn, so the result is permanent — and the tool that softens that has no screen

**The moment.** 16:20. A semi-final was recorded with the wrong winner, or a pool result that decided a
qualifier was.

**What happens.** `assertCorrectionAllowed` (`corrections.ts:273-300`) reads the fixture's `stage`: a *group*
fixture once the day has left `group_stage`, and any *knockout void* at any time, is refused with
`bracketLocked` — *"This result already fed the bracket — correct it on the sand, not in the data."*
(`messages.ts:122`). The rule is principled: a bracket seat cannot hold "nobody", and a void would leave the
round below it playing a team that no longer qualifies. Two carve-outs are already in it, and both are the
right kind of thinking: the third-place play-off is exempt because nothing feeds from it, and *every* friendly
is exempt because it feeds nothing either. Then it asks not just about the bracket but about **every**
downstream fixture (`findDownstreamFixtures`), because a semi-final also feeds the third-place match.

What the desk is not told is that there is now a third answer. Since ADR-248 an **award batch** can pay or
un-pay up to 64 teams and up to 64 people, ±100 a row, under one label, one reason, one author and one client
key — and be **reversed as a unit**, which puts the board, the standings and the export back where they were
while leaving the played result standing. That is precisely the tool for "the match was played fairly but the
points were wrong", and for "the semi-final counts, but Sandstorm were hard done by".

**Where the friction lives.** Screen, entirely. `grep -rl award-batches apps/web/src` is empty, and so is
`grep -rn "teams/.*awards" apps/web/src` — the read the batch's own preview needs, `GET
/api/admin/teams/:teamId/awards` whose `liveTotal` (`views/awards.ts:76-80`) is the number behind a design
sentence like *"+12 already on the books"*, has no caller. What the desk does have is `ParticipantDetailPage`'s
**Adjust score** panel (:141-155), which demands a station *and* a reason for one person and states its rule on
its face: *"Every entry is kept — reverse a mistake with an opposite adjustment."* (ADR-117). It cannot pay a
team at all. So an operator who has read the ADRs posts JSON from devtools; one who has not clicks a team
name, finds nothing, and tells the organiser to settle it on the sand.

**Count this.** How many people ever learn the batch exists. Whether "correct it on the sand" survives contact
with a team that lost a qualifier on the wrong number — the day's paper award, not the database, becomes the
record.

### N3 · The console promises "on the schedule", and the promise is made from a cache

**The moment.** Two courts, one round, both marshals tapping Start.

**What happens — and what is already good.** Once both teams are chosen, the console prints one line
(`court__schedule-note`, `CourtPage.tsx:148-155`): *"On the schedule — this match settles a fixture."* or
*"Friendly — not on the schedule, cluster points only."* The second half of that sentence is doing careful
work: a friendly pays `tournamentWinPoints` to the cluster board and nothing to the standings
(`pays_standings`), which is exactly what the marshal needs to know before announcing a result.

**The hole.** The line is computed from the client's cached schedule — `isPairScheduled(schedule.pendingPairs,
teamAId, teamBId)` (`useCourtConsole.ts:87`, and :312 notes it compares the unordered pair "like the server's
claim") — while the claim itself runs at POST time against the database with a scope
(`claimFixtureForMatch` at `schedule.ts:276`, scoped by `claimScope` at :329): the tournament being played, and
only the kinds the day can currently
play, so a hand-started match cannot eat a finished day's leftover or a drawn bracket seat. The two
computations are deliberately alike and not the same thing. Whenever they disagree — a schedule read that is 5
seconds stale on marquee wifi, or a pair that is pending but out of scope, which is a case ADR-247 *created* —
the console says **on the schedule**, the POST succeeds, `claimFixtureForMatch` returns null, and nothing
changes the sentence. The match then lives with no marker at all: the live scoreboard and `matchView` say
nothing about fixtures (the view carries `stage` but no fixture binding), so the answer to *"did that one
count?"* is not on the court, not on the projector, and not in the match view — it is on the desk's schedule
board, one pair of fixtures at a time.

**Where the friction lives.** Screen and API policy, and the cheapest fix in this whole document: a field on
the view (`isScheduled`, or the claimed `fixtureId`, which the row already has) and the same one-liner on the
live header, so the console tells the truth *after* the whistle instead of only before it. The house rule for
this class of thing is already written in `stagePairing.ts`'s own comment about force-close — *the organiser is
never blocked by the schedule, they are made to say why* — and the court console is the one surface in the day
that neither blocks nor says.

**Count this.** Whether anyone at a court can tell, in the two seconds they have, which kind the match *was*.
And what a marshal says to a team that won and did not advance.

### N4 · Awarding twelve teams from a phone, in the marquee, at 17:05

**The moment.** The day is over, the swag queue is out of the tent, and the awards have to go in now.

**What happens.** There is no screen, so what follows is the request the operator has to compose: `POST
/api/admin/award-batches` (`routes-superadmin/awards.ts:48`) with one `label` (1–40, `schema.sql:848`), one
`reason` (1–200, :849), a `clientBatchUuid` that the *caller* is supposed to mint and resend, and up to
`MAX_AWARD_BATCH_ROWS = 64` rows of `{teamId, points}` where points is a non-zero integer in ±100 (`:873`) —
every `teamId` a UUID, because ids are how this app addresses anything (ADR-154: nicknames are not handles).

The API's failure design is better than most of the app's success design: a replay of the same key is answered
200 with the original batch, a *different* payload under a used key is `awardBatchReplayMismatch`
("That batch key already holds a different set of awards", `messages.ts:140`), and an unknown `teamId` is a
404 naming the id. What is missing is every part of that a human can use:

- **No preview, and D7 deliberately removed the guard a preview would replace.** A team may appear twice in one
  batch and in ten batches; the design's answer is that the *operator* sees the repeat in the running total
  (`liveTotal`) and decides. With no console there is no total to look at, and the repeat is invisible except
  as a number the room does not believe.
- **No register.** `GET /award-batches` (`awards.ts:42`) is the day's list of who gave what and why; nothing
  renders it, so the operator cannot see whether the 30 they are about to post is already posted.
- **No handle on the idempotency key.** A timeout mid-post is the case `client_batch_uuid` exists for — and
  only a screen knows to resend the same key. Typed by hand, the retry is a coin flip between a replay and a
  second batch.
- **A field rule that reads as a bug.** Rows must belong to the tournament the batch names
  (`awardSubjectOutsideTournament`, `messages.ts:144`) — right, and load-bearing (an award to a team outside the
  field pays nobody) — but it means the four late arrivals from P5 must have been *admitted*, not merely
  present, and the sentence says "outside the tournament" to a person who watched them play all afternoon.
- **Reversal needs its own verb.** Reversing is `POST /award-batches/:id/reverse` with a fresh reason; nobody at
  17:05 is going to find it, and the single-person dialog's "post an opposite row" instinct does not work on a
  batch.

**Where the friction lives.** Screen, almost wholly — the irony worth testing is that the flow designed to end
a twenty-row hand-typing job is itself hand-typed. The 17 tests in `apps/api/src/tests/award-batches.test.ts`
all speak HTTP through `ctx.app.request`; not one clicks anything, because there is nothing to click.

**Count this.** Keystrokes per row × 12, with the queue watching. Whether the operator gives up and posts
twelve single-person adjustments for a team of six — which is 72 dialogs to do the work of one batch, and is
the state ADR-248 was written to end.

### N5 · Four clocks, and only one of them is on the screen

**10 seconds, and it is visible — then it is gone.** `FringeStationPage`'s undo is a button that counts down
against you: *"Undo (7s)"* (`UndoRow`, ticking every 500 ms, `SCAN_UNDO_WINDOW_SECONDS = 10`). At zero it
returns `null`: no greyed-out button, no "just missed it", no explanation on the panel. The API's answer is the
explanation — *"Too late to undo that one — a superadmin can still void it."* (`scanUndoExpired`, and the swag
station gets the identical sentence at `messages.ts:99`) — which is true and means: find the desk, describe the
scan, wait while they find it on `ScansPage` — whose only filter is the activity (`scans__activity-filter`,
`ScansPage.tsx:23`), so the last hour of a busy station is a scroll — open *Void scan — Priya R / Booth 3* and
write a reason, then void it
again if the desk voided the wrong one (Unvoid takes its own reason). The award is off the board and off the
passport in one read (ADR-006), so the system is instantaneous and the person is on foot. Note also what the
window guards against: `scanUndoNotYours` — "only the station that awarded this can undo it" (:176) — is
correct for double-award protection and useless to a marshal who is standing next to the *other* tablet.

**5 seconds on the server, 45–75 on the client.** Every board read is a `cachedRead` with `ttlMs: 5_000` /
`swrMs: 25_000` (`leaderboard.ts:239-240`, twice more at :280-281, one at `swrMs: 15_000`), invalidated by tag
on write — while every live surface re-reads on a *jittered* 45–75 s timer (`POLL_MIN_MS`/`POLL_MAX_MS`,
`useAsyncData.ts:53-60`, ADR-024's reason being that a fixed interval is "a metronome pointed at the one laptop
running the event"). So the projector and the phone board can be up to a minute apart from the desk's own
screen, and the answer to that gap is the reason the app makes one exception: `/api/me` and `/api/me/scans`
always revalidate, because a participant's own number may not lag the scan that earned it
(`points-freshness.test.tsx`). The hunt's job is to time each surface's worst case rather than assume one
number — and to ask whether the desk's own post-write view is covered by tag invalidation or by the next poll.

**"Invalid status transition."** The other sentence on the same dialog. A desk voiding a match that is still
in progress gets `invalidStatusTransition` — *"Invalid status transition."* (`messages.ts:63`, thrown at
`corrections.ts:75` and `:233`) — five words with no subject, no object and no advice, sitting next to
`bracketLocked`, which at least has a philosophy. Same dialog, two refusals, one sermon and one stack trace.

**The last slot.** The day's ceiling is a projection, not a deadline: `estimateStartTimes` feeds
`GET /api/admin/court-queue` (`routes-superadmin/courtQueue.ts:159`) and `CourtQueuePage`, which is a genuinely
good page — its own comment describes the question it exists to answer, about what opening Court 4 needs and
*"cannot get from a list of start times alone"*. And `admissionNoTimeLeft` consults the same plan, so entrants
are refused by arithmetic. What the day does **not** have is a lever on the clock: `matchMinutes` and
`gapMinutes` on `PUT /api/admin/point-config` (`routes-superadmin/config.ts:52`) stretch every slot, and the
agenda's own `startsAt` is editable and nullable (`routes-superadmin/agenda.ts:99`) — but the agenda is a
noticeboard, not the queue. A day that loses forty minutes to rain can re-pair (ADR-247) and can close out loud
(ADR-247/248); it cannot say "start at 13:20", so the projection printed at 09:00 quietly becomes fiction while
still looking like a plan.

**Where the friction lives.** Mostly screen and mostly messaging: the windows are sound and the handoffs they
create are unassisted, and a refusal that names another human's action has to say how to reach that human.

**Count this.** How many of the day's problems are solved by walking to another device. That number is the
friction budget for the next stage.

---

## Appendix A · what the API can do that no screen does (grep-verified today)

| Capability | Route | Screen |
|---|---|---|
| Force-close a stage with a reason | `POST /api/admin/tournament/close-group-stage`, body `{force, reason}` | the button posts `{}` (`lib/api/admin.ts:454`) |
| Re-pair a stage's pending fixtures | `POST /api/admin/tournament/stages/:stageId/fixtures` (`tournament.ts:185`) | none — the path appears in no web file |
| Post an award batch, reverse it, reinstate it | 6 routes, `routes-superadmin/awards.ts:42-86` | none |
| A team's award ledger and live total | `GET /api/admin/teams/:teamId/awards` (`awards.ts:77`) | none — and it is the award dialog's preview |
| A batch's register (totals, counts, reversal state) | `GET /api/admin/award-batches` (`awards.ts:42`) | none |

## Appendix B · the numbers a story can trip over

Undo window 10 s, counted down on the button · board cache 5 s TTL / 25 s stale (one read 15 s) · award batch
≤ 64 team rows and ≤ 64 participant rows, points a non-zero integer in ±100 in **both** ledgers, because
`awardAdjustmentPoints` is one constant (`packages/contracts/src/awards.ts:17-21`) · label 1–40, every reason
1–200 · re-pair request ≤ `MAX_REPAIR_PAIRS = 64` (`contracts/src/schemas.ts:929`) · courts 1–5 · PIN and scan
number both 4 digits on the same pattern (`PIN_PATTERN`) and deliberately nothing else alike (ADR-088) · team
join code 6 characters from a 31-character alphabet (`db/ids.ts:18-19`) · team chat 500 characters, the only
rate-limited route in the app, and a typing indicator that expires in 6 s (`TEAM_CHAT_TYPING_TTL_MS`) ·
`void_audit_entry.target_type` has four values: `fringescan`, `tournamentmatch`, `swagclaim`, `awardbatch`.

## Appendix C · how to walk these

Play each story as its actor, on the device that actor uses, with a stopwatch, and write four things at every
step: **taps**, **lookups** (any moment spent finding an id, a name or a number), **handoffs** (any moment spent
asking another human to do something the software is capable of), and **"is that right?" glances** (any moment
the actor checks a second surface to believe the first). The fixable friction is in the second and third
columns: this app is generous with taps, it says its sentences out loud, and it still has days — N1, N2, N4 —
where the answer exists one layer away from the person holding the problem.
