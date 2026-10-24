# The first day: eight teams, one court, nothing to configure

Written because the two plan documents had grown fourteen decisions, twelve of them about values the day above never
asks for. This is the story we are actually building for, and it is the yardstick: **every screen, field, column and
rule that the day below does not use is a thing we should be able to cut.** Bar: *less is more; simplicity trumps
complexity.*

**If you read one section, read §5.** It is nine lines of "the day does not need this", and three of them are the
whole build: an open `format`, a started match that counts, and a Start button that is also the plan.

One fact to say before the story, because the story keeps running into it: **manual mode does not exist in the app.**
`format` has exactly two values (`schema.sql:627` — `round_robin | world_cup`), the tournament page offers exactly
those two (`TournamentPage.tsx:66-78`), and every hand-made pairing a facilitator starts today is *deliberately not
counted*: `apps/api/src/tests/tournament-schedule.test.ts:717` is named *"keeps a friendly off the books: an
unscheduled pair claims nothing"*. So the day below is not a variant of what ships. It is the missing core, and the
structured modes become what they should be — an option on top of it.

---

## 1. The day, end to end

Faridah runs the day. Wei Lin is on the sand. Eight teams of four, one court, a single table, no elimination:
everyone plays everyone, and the standings at 16:30 are the day.

| time | who | where | what happens |
|---|---|---|---|
| 08:50 | Faridah | `/admin/signin` | username + passcode. The account is the one the boot seeded (`AGENTS-database.md` §6). |
| 08:51 | Faridah | `/admin` | the dashboard says the day cannot start yet, and says why, in one line: rates, a court. |
| 08:52 | Faridah | `/admin/points` | 12 minutes a match, 3 to change over, one court: **7h00m of sand for 28 matches**. She tries 10 and 2, and the line says **5h36m — fits**. Save. |
| 08:53 | Faridah | `/admin/courts` | "Court 1" already in the name box. Add. One court exists. |
| 08:54 | Faridah | `/admin/facilitators` | Wei Lin, PIN on paper. Done for the day. |
| 09:05 | the eight teams | `/signup`, `/teams` | captains sign up and form their own teams; members join by nickname. Not Faridah's job, and the app already has it (`routes-teams/index.ts:79-85`). |
| 09:12 | Faridah | `/admin/tournament` | one question: *how does the day play?* She picks **Open day**. The answer is the whole setup. |
| 09:13 | Faridah | same screen | the picture says: 8 teams, 28 matches, one court, 5h36m of court time. It fits. **Start the day.** |
| 09:30 | Wei Lin | `/staff` | one station, so one button: the court. No picker to think about. |
| 09:30 | Wei Lin | the court | "Up next: **Red Vipers v Blue Marlins**" and one button to put them on. |
| 09:41 | Wei Lin | the scoreboard | tap the score up, tap *End match*. The table moves; the hall screen moves. |
| all day | Wei Lin | the court | the same four taps, 27 more times, plus whatever actually happens (§3). |
| 16:20 | Faridah | `/admin/tournament` | "Close the day". One press. |
| 16:30 | Faridah | `/admin/standings` | the sheet prints, all eight teams and all thirty-two people on it. |

The arithmetic is the story's first real ask. `match_minutes` and `gap_minutes` ship at 12 and 3
(`schema.sql:275-277`), which is 15 minutes a match on one court and 7 hours of a 28-match day — a day that does not
fit, discovered only by the queue running long at 16:00. The app already *can* do this sum for a scheduled day
(`admission__capacity`, `TournamentPage.tsx:331`), just not where the numbers are typed. So the story's rates screen
is five numbers — the two that decide the day's length on top — and one sentence about what they cost. That
sentence is the most useful thing the setup does.

---

## 2. Act one — the setup, as it should feel

**"How does the day play?" is the only question.** Three pictures, chosen with one tap:

* **Open day** — we call them as we go. Every match is started by hand, every match counts, nobody is out. Faridah's
  day above is this one, and it is the picture the story is told from.
* **Two groups then a knockout** — the world-cup shape, eight teams into two groups of four, top two through.
* **Everyone plays everyone** — one table, no knockouts, the long fair day.

The first picture is what the app does not have. The other two are what it has, and they stay exactly as they are.

**What today puts in front of Faridah instead** (`TournamentPage.tsx:55-208`): a *format* select with two options;
then, for `world_cup`, a *group size* number box (3 to 6, `:85-97`), an *advance per group* number box (1 to 2,
`:99-110`), a *third-place match* checkbox with an honest hint about what it costs (`:117-131`), and a *knockout
pairing* choice (`:135-150`);
then **Preview draw** (`:164-171`) and **Activate** (`:172-186`) — and between them a plan that is saved
*silently*, once per knob change (`useAdminTournament.ts:88` wires the knob state to `savePlan`). So the same five
numbers have two writers, and there is no screen that shows both: a preview to discover a wrong number, and a saved
intent that the desk never reads back. None of that is *hard*, but all of it is *load*: an organiser running an open
day has to read past every one of those fields to find the day they mean.

**What she has to have done before the page will work at all:** saved the rates, because `point_config` is not seeded
and its absence "is the bootstrap gate that blocks match creation" (`AGENTS-database.md` §6); and created a court, one
`POST` at `routes-superadmin/config.ts:111-114`. Both are legitimate — a day does need a length and a place — so the
story does not ask to delete them. It asks for them to be *prefilled and one-keystroke*, and for the dashboard to say
which of the two is missing rather than letting the first match fail later.

---

## 3. Act two — Wei Lin on the sand

The loop is four taps, and the code already has it: an idle court shows *up next*, and ADR-108's speed-starts put a
one-tap button on every pair that can take the sand now (`CourtPage.tsx:85-127`). Below that are the two team
pickers for when the pair is not the one offered (`:133-141`), a line that says whether this is a scheduled match or
a friendly (`:148-150`), and Start (`:157`). In progress, the scoreboard is two columns of +1 and −1 steppers
(`MatchScoreboard.tsx:34-62`) and a cancel that asks first (`CourtPage.tsx:62-76`).

That is a good day-of interface, and the story changes none of it. What it changes is **what a match means**:

* **An open day counts what the desk starts.** No fixture has to exist for a match to feed the table — which is the
  one real addition this story asks for, and it inverts today's rule (`tournament-schedule.test.ts:717`).
* **A no-show is an answer, not an error.** The fixture rows already have walkover buttons
  (`TournamentPage.tsx:465-510`); on an open day the same word sits on the *court*, where the person who can see the
  empty sand is standing.
* **"We only have six people here" plays on.** Today that is a friendly, and a friendly is invisible to the
  standings. On an open day it is a match with six players; the roster snapshot records who actually played.
* **Level at time is a draw.** Group matches already allow one (`matchResult.ts:59`), and the scoreboard should not
  ask a facilitator to invent a winner for a game that was tied.
* **She can reorder the queue, not redraw the day.** "These two next, this pair later" is a nudge; the re-pair lever
  that writes `pairs[]` (`packages/contracts/src/schemas.ts:934-945`) is a *structured-mode* tool and stays on
  Faridah's page.

Off-script, at 13:40: two teams arrive late, so Wei Lin plays the other four first. The court list is a queue she
pushes down, not a schedule she breaks. Nothing in the story requires her to know the word *fixture*.

---

## 4. Act three — the end of it

Closing the day is one press because on an open day there is nothing to advance: no bracket to draw (`schedule.ts:708`),
no qualifier list to compute (`engine.ts:546-558`), no promotion to pay. The final table is the table. The sheet the
prize-giving reads out already prints every team and every person whether or not they scored
(`wire.ts:934-947`'s own comment: *"a record that omits them is not a record"*), so the last act of the app is to stop
writing and let people read.

---

## 5. What the day does not need

Each of these is a thing today's flow asks for and this story cannot find a use for. Verdicts are proposals, and the
first three are all the story needs to be true.

| # | the thing | why the story cuts it | what to touch |
|---|---|---|---|
| 1 | **the five shape knobs, as knobs** | an open day has no group size, no advance count, no third-place match, no pairing rule. Four of them exist only to feed a draw that this day never draws. | keep them for the two structured pictures; a `format = 'open'` activation ignores them and writes nothing of them |
| 2 | **plan-then-activate, for a day with no plan** | the plan is a *forecast of a draw* — `schema.sql:651`: "the day's INTENDED shape, saved before anything is drawn."  A day with no draw has no intent to save; pressing Start is the whole act. | `PUT /plan` stays for the structured modes; on an open day the tournament page's one button activates |
| 3 | **a match that does not count** | the story's day is *made of* hand-started matches. Today they are friends, and a friend is off the books by design. | the counted-by-default rule, one branch in the completion path, plus its test flipped to assert the opposite of `:717` |
| 4 | **capacity arithmetic as a gate** | "only for as many matches as the clock still has room for — so the later they form, the less they play" (`TournamentPage.tsx:59-64`) is the *admissions* rule of a scheduled day. On one court in an open day, the queue *is* the clock. | keep it as an estimate printed under the queue; refuse nothing |
| 5 | **`is_current` and `promote_count`** | already deleted by the other two documents; here it earns its keep — this day has no "current stage" and no number who go through. | M1 + M2 as written; the story needs nothing extra |
| 6 | **the advancement table, for this day** | `tournament_stage_advancement` is about *getting out*. Nobody gets out of an open day, so the core does not need it: it is a structured-mode object, and the day above is the reason it must not be in the critical path. | move M7 from "the core's missing act" to "what a knockout day adds later" |
| 7 | **the court picker, on a one-court day** | `StaffHomePage.tsx:24-42` lists stations and links to `/staff/court/:id` (`:51`). With one court the list is a ceremony. | if `stations.length === 1`, the facilitator lands on it |
| 8 | **fringe fields on the setup screen** | `point_config` carries nine numbers (`schema.sql:266-295`); an open tournament day uses five, and the demo's row shows the other four are a different day's business (`seed-demo.sql:461-462`). | fold them under "fringe and passport", prefilled, on the same record — no schema change, one form change |
| 9 | **per-round prices, this week** | the story's day has one price list for the whole day because it has one kind of match. Per-round pricing is free at the schema level (the rows already carry the rates), and it is *nothing like* free at the desk. | keep §3b of the schema doc as an unlocked capability, with no UI in this move |

## 6. What the day needs and the app does not have

Four things, and none of them is a table:

1. **`open` as a `format` value** — one value in the CHECK at `schema.sql:627`, one card on the tournament page, one
   branch in activation that creates no fixtures. This is the whole of "manual mode", and it is the only genuinely new
   noun in this story.
2. **A started match is a counted match** on that format, with the same `points_awarded_snapshot` behaviour the
   scheduled ones have, so the board is one mechanism and not two.
3. **A queue the desk can reorder** — the court's pending list, up and down. Not a redraw.
4. **A day that says *start* and means it** — rates saved, one court, two teams formed. That is the entire precondition
   set; the rest of the app's readiness messages become unnecessary rather than rewritten.

## 7. How the two other documents shrink under this story

`tournament-schema-tobe.md` and `tournament-harmony-work-orders.md` stay, and they get shorter. The story decides what
is core, so: the schema doc's one new table becomes optional (§5.6), the per-round pricing section becomes an unlocked
capability with no screen (§5.9), and of the fourteen decisions in the work orders **eleven are answered by this
story without needing you**: D-1 (seed the day's stages, or have nothing to seed on an open day), D-6 (no enforcement
in the manual path), D-10/D-11/D-12 (the desk may do anything, so invent nothing to ask permission for) and
D-2/D-3 (no prizes) all read as consequences of the day above rather than rulings about the schema.

Two survive, and they are small:

* **D-13** — does a fresh install get a *day* row from `seed-default.sql`, so activation stamps a day instead of
  creating one? For an open day it barely matters, which is itself an answer: on an open day activation writes one
  status change and nothing else.
* **D-14** — does a forced close still require a sentence? On this day there is no close to force. So the answer only
  binds the structured modes, and the manual path is left alone.

The acceptance criterion is the story itself: **`apps/web/src/acceptance/first-day.test.tsx`**, eight teams formed,
rates saved, one court, Start the day, four taps per match, close, sheet — in the same style as the journeys that are
already there (`declare-winner.test.tsx`, `void-match.test.tsx`). It is worth knowing that no such day is recorded in
the repo's demo data (`seed-demo.sql:464` reads `-- tournament: no rows`), so this test would be the first machine-
checked picture of what a tournament day is. That is the argument for writing it before any of the moves above.

---

## 8. What building it on its own tables returned

The instruction this section answers was not "build manual mode". It was: build it **completely distinct** from the
existing implementation, so that (a) what is genuinely superfluous becomes visible instead of load-bearing, and (b) the
core gets an MVP-minimal second draft on the way. So nothing here reuses `tournament`, `tournament_plan`,
`tournament_stage`, `tournament_fixture`, `tournament_match`, `point_config`, `team` or `participant`. The day owns
three tables — `manual_day` (`schema.sql:901`), `manual_team` (`:934`), `manual_match` (`:948`) — one contract file
(`packages/contracts/src/manualDay.ts`), nine API modules (`apps/api/src/manual/`, 1 234 lines), one web api module,
one hook and eight components. It reads exactly one existing table, `court`, and reads it only: the sand is the same
sand, and pretending the club had two sets of courts would have been the experiment ruining itself.

Nothing is wired. `apps/api/src/manual/index.ts` exports `manualRoutes()` and no caller imports it; the mount is one
line, `api.route('/api/manual', manualRoutes())`, recorded in `routes.ts`'s header. `apps/api/src/tests/manual-day.test.ts`
mounts the routes on its own test app, so that file *is* the wiring check — it keeps passing the moment the line lands.
One of its tests asserts, out loud, that after a day is opened and played the six scheduled tables are still empty; that
assertion is the whole point of the exercise, and a build that reused the old rows could not have made it.

### The verdicts, as the build returned them

| what the day refused to carry | the scheduled path's reason for having it | what the day does instead |
|---|---|---|
| `points_awarded_snapshot` | rates can change under a running tournament, so a completed match must remember what it was worth | the day owns its three point values, so nothing can move under it — the repricing bug class is not fixed, it is not *possible* |
| `tournament_plan` + `tournament_stage` for history | a day's shape has to be declared, opened and then shut, so the record of what was intended is separate from the record of what happened | a day is a row that stops: `closed_at` and `close_reason` on the day itself, and `ux_manual_day_one_open` (`status`) WHERE `status = 'open'` is what "one day at a time" means |
| a winner on the request | three copies of "who won" — route, console, correction desk — argued about in ADR-157 | `ck_manual_match_result`: `finished ⇒ (winner is null) = (score_a = score_b)`. There is no winner field on any request, and one CHECK replaces the three copies |
| the standings engine | 447 lines because a *drawn* tournament must decide who advances: cohorts, head-to-head mini-leagues, `advancement_rule` jsonb, `rankQualifiers` | `manual/table.ts` (145 lines) folds this day's `finished` matches on four rungs — points, difference, points for, the order the names were typed — and `manual-table.test.ts` points at each rung without a database |
| `isFullyScored` / a provisional flag | a fixture list defines what a group still owes, so a table read early must be marked as moving | **no flag**: a day with no fixture list owes nothing, so what it holds is final as of now. The warning is the day's own counts (`totalMatches − playedMatches`) rendered by `DayHeader` |
| the fixture rows and their claim protocol | fixtures are generated, then claimed `pending → claimed → played`, then projected onto courts | `manual/queue.ts` (88 lines) regenerates the offers from the teams and the finished matches on every read. There is nothing to claim, so nothing to lose, and two tablets agree because the arithmetic is the same, not because either wrote anything down |
| a round number on the offer | rounds exist because a draw produced them | the offer carries no round. A queue rebuilt per read has one true thing to say: *these pairs are available now* |
| a participant behind the team | `team_membership` buys the person economy: board, passport, awards, chat | no participant column at all. The day is a list of names the desk typed, and the answer to "how much of a day works without a person record" turned out to be: all of the playing, none of the prizes |
| `cachedRead` / `invalidateTag` / the SSE bus | a tournament's reads are expensive because they fold an entire draw | no cache, no socket, no feed publish: the console polls one `Promise.all` and every number in it is a count or a fold of rows it already has |
| a projected end time | the queue is bounded by the clock, so the hall wants to know when it stops | `remainingCourtMinutes` only — court-minutes, the day's own pace (`12 + 3` vs `10 + 2` in §1's arithmetic), and no claim about the wall clock |
| eight tables for an afternoon | plan, stage, fixture, match, point config, team, membership, award batch | three: a day, a name, a match. `GET /days` is then free, which is why history needs no plan or stage table: a row that stops can be listed, a row that is overwritten cannot |

Two smaller returns, both about who is allowed to press what. **The day has two actors and it is awkward**: opening and
closing belong to a superadmin, every on-sand press to a facilitator, and reads to either — so one screen needs two
different credentials in it, and `DaySetup`'s start button is visible to a facilitator who will be refused. The old app
hides this by putting the tournament's activation behind the admin surface entirely. Whether a manual day's *start*
belongs to the desk running it is a real question this build surfaces rather than answers. And **the console forced one
rule back into the API**: seven endpoints polled together must not include one that fails because the afternoon ended,
so reads never refuse — a closed day lists its teams, its matches and its table, and only the queue, which exists to be
played, answers empty. `GET /day` is the single read whose subject is the day, so it is the only place "there is no day
yet" is said (§6.4's "a day that says *start* and means it", arrived at from the other direction).

### What it caught by failing

* **The CHECK found the bug the code would have shipped.** `closeDay` set `closed_at`, `closed_by_superadmin_id` and
  `close_reason` and left `status` alone — a day that is closed and open at once. Every test that did not read the day
  afterwards passed. `ck_manual_day_closure` rejected the write, and the fix was one line. A rule that lives in the
  table is a rule the next author cannot forget by accident, and this is the concrete case for that over "validate in
  the store".
* **A correlated subquery has to name its outer table.** `listDays`' counts were written
  ``sql`(select count(*)::int from manual_team t where t.day_id = ${manualDays.id})` `` and Drizzle rendered the
  interpolated column as the bare name `"id"`, which Postgres resolved against `manual_team` — every history row
  cheerfully reported zero teams and zero matches, with no error. `manual_day.id` spelled out is correct. Worth knowing
  because it is a *wrong answer*, not a crash.
* **`count` is a bigint.** Without `::int` the numbers arrive as strings, which is why every count elsewhere in this
  schema casts and why this one now does too.

### Two questions the isolation left open, in the open

1. **A walkover cannot be expressed.** Because the scores are the result, a pair that never turned up has two
   available answers, both false: `10–0` says points were played, `0–0` says a draw. The scheduled path needs
   `walkover_winner_id` on a fixture for exactly this case, and no amount of schema economy removes the need — it is
   the one place where "the score is the whole truth" costs something. The build ships without it, so that the cost is
   on the table rather than in a footnote.
2. **A cancelled match says nothing about why.** `cancelMatch` sets `status = 'cancelled'` and that is all: no reason
   field, no audit register, no actor beyond who started the match. For a no-show at an open day this is probably
   proportionate — the old app needs a reason because voiding a *counted* result moves points and prizes. If a manual
   day's cancellations ever need defending, this is the second place the minimal core is too minimal.

### What is deliberately not here

No awards, no prize-giving, no printed sheet, no gallery, no chat, no announcements, no hall screen, no offline queue,
no per-person points, no join codes, no roster. The day ends with a table the desk reads off the screen, and §1's last
act — the announcement that reads the sheet out loud — is not in this build. That absence is the point of measuring
against it: **22 API tests** (`manual-day.test.ts` 16, `manual-table.test.ts` 6) and **10 console tests**
(`apps/web/src/acceptance/manual-day.test.tsx`) cover the whole afternoon in 1 024 lines of test. The nine API modules are
at 99.7 % statements and 96.8 % branches — the uncovered arms are the closed-day race guards, which a router that already
refused the press cannot reach — and the console's nine files are at 100 % of every measure.

This supersedes three verdicts above, all of which assumed the day would be built *on* the existing rows: §5.2's
"activation writes one status change" (it writes a day row instead), §5.3's "one branch in the completion path" (there
is no completion path to branch; a started match counts because there is nothing else for it to do), and §6.2's
"same `points_awarded_snapshot` behaviour, so the board is one mechanism and not two" (the day has no snapshot to share
and no board to be one with, and being two mechanisms turned out to be how the first one got simpler).

---

## 9. The two other modes, ported as extensions of the base

The manual day is the field; `round_robin` and `world_cup` are what the day becomes when somebody draws a
structure on it. They are rebuilt on `manual_day`/`manual_team`/`manual_match` rather than ported off
`tournament`/`tournament_stage`/`tournament_fixture`, in three tables of their own — `manual_draw`,
`manual_slot`, `manual_advance` — and the questions the port had to answer first were not about the code.

**Where does the drawn structure live? Three things, and only three.** The five questions a bracket asks of
storage each have a different answer, and writing them down separately is what made the old path need six
tables, a claim protocol and a projection:

- *The shape* — group size, how many advance, the pairing rule, whether third place is played — **stored**, as
  four knobs on `manual_draw`. Nothing derives them; they are the organiser's decision.
- *The randomness* — who landed in which group — **stored, as one integer**. The old app shuffles with
  `randomInt` at activation and freezes the result in `tournament_entry` rows, one per team. A day that owns
  its tables can store the seed instead and re-derive the deck on every read: same number, same groups, on
  every tablet, in the printout, and in the argument at six o'clock.
- *The schedule* — the fixtures, the rounds, the byes, the tree, the third-place match — **not stored**. It is
  `dealGroups`, `circleRounds`, `groupFixtureDrafts`, `knockoutDrafts` and `semiFinalRoundIndex` run over the
  two things above, which is `apps/api/src/lib/tournament/engine.js`: imported, not copied, so the rule cannot
  disagree with itself across the two paths.
- *The results* — which address each played match filled — **stored**, as `manual_slot`, for one reason that
  cannot be argued away: **the pair does not identify the slot**. Two teams can meet twice in a knockout —
  they meet in the first round and meet again in the final if both win through — so a `unique (day, pair)`
  index would refuse a real final, and an address that outlives the teams filling it is the minimum a
  derivation needs to know what has been played. `slot_index` is therefore dense within (stage, round) across
  groups, and `group_code` rides along as a label for the printout rather than as part of the identity.
- *The advancement* — who crossed the line — **stored**, as `manual_advance`, because the desk may put in a
  team the table did not pick, and a decision is a fact no function can recover.

**Two modes or one? One engine, two names, because they always were.** The old engine's header already said
"round robin is one group that nobody advances out of", and the port found the sentence true in the strong
sense: there is no `mode` column on `manual_day`, no `format` CHECK anywhere, and no branch in the extension.
`advance_count = 0` *is* round robin. The word "World Cup" appears exactly once, as a label computed from that
number for a header line. What the manual core had that neither mode has is a queue *grown* from the day's
history rather than *drawn* from a field: the open day's `owedPairs` gives an as-even-as-possible next pair and
keeps offering rematches, and a drawn day replaces the offer with the sheet's own addresses.

**May the desk advance a team the table did not pick? Yes, and that answer is what bought the third table.**
The route is "close the group", which writes the seats the desk named — the whole list in one act, so a partly
recorded group is not a state the day can be in — and the sheet then reads its bracket from those rows rather
than from a table a correction can still move. The proposal is never stored: an `advances` row with a null
`reason` is the table's own answer written down, and one with a sentence is the desk overruling it. There is no
void, and that is a decision rather than an omission: undoing an advancement is closing the group again, which
is refused once a match has been played from the list — the *only* re-write the day cannot undo is one that
already sent someone onto the sand. `tournament_stage_advancement` needs its `is_voided` triple because a
fixture and an award have to be un-run too; here the only thing to un-run is a read.

**What decides a group table, once a seat hangs on it? The base's four rungs, unchanged, plus a lock on the
bracket.** The old stack — wins, draws, head-to-head, mini-league, difference, seed, ranked cohort-wise so no
comparator is intransitive (ADR-106) — was read, and is not here. Two of its parts cannot exist on this day at
all: `isFullyScored` guards against a walkover carrying no score, and a day whose score *is* its result has no
unscored finished match to be careful about. What it protects against — an unplayed team floating above a team
that lost 15–21, deciding who advances — is instead closed by the rule that a knockout slot is not an offer
until every group has been closed: a provisional table proposes seats, it never fills one. So the mode inherits
one fold (`manual/table.ts`'s `foldRows`, called per group) and leaves the tiebreak argument where it belongs —
outside the core, in the extension, if a real afternoon ever shows a tie at the cut line.

### What the seam cost, and it is two lines

`manual-draw` imports the core; the core imports nothing from it — a directory the app does not know about, so
the base day's code is the code it was, and deleting the mode is three `DROP TABLE`s. The one thing the core
had to grow is a transaction its caller can join: `startMatch` and `finishMatch` are now thin wrappers over
`insertMatch(tx, …)` and `stampResult(tx, …)`, because a press that writes a match *and* its address has to
write both or a slot can be left open under a played match, and because a rule about the row being ended has to
be asked while the row is locked. The alternative — an `onInserted` hook the core runs — is one more general
mechanism for one caller, and a core with a hook has two owners of the write.

### What it caught by failing

- **The `exists` that answered nothing.** `isPlayedFrom` asked for `m.id = ${manualSlots.matchId}` inside a
  `sql` fragment, and Drizzle hands an interpolated column to a raw fragment as a **bare name** — so the
  subquery read `manual_match`'s own row and every redraw was legal. `listDays` in the base met exactly this
  (§8) and the lesson did not travel: a correlated subquery must spell `manual_slot.match_id`. Caught by the
  test that expects a redraw to be refused.
- **A snake-cased row that was camelCase.** `readDraw` did `select()` — Drizzle's camelCase — and cast the
  result to a hand-written snake_case record, so `group_size` read `undefined`, `ceil(n / undefined)` was `NaN`,
  `Array.from({ length: NaN })` was `[]`, and `dealGroups` threw `Cannot read properties of undefined (reading
  'teamIds')` on the way to a 500. The fix was to drop the twin type and use `$inferSelect`; the lesson is that
  a hand-written record is only worth its risk when a join's aliases make it necessary.
- **A PUT that was a POST.** The harness's `jsonRequest` *is* a POST, so a test that reuses it for the score
  press got 404 "Not found." and a knockout match stayed level; only `withMethod` carries the verb. The
  failure was in the test and the finding it produced is the assertion the file now keeps.
- **The 500 that should have been a sentence.** `ck_manual_draw_advance` refuses "advance all four of a group of
  four", and a CHECK is a net, not an answer: the route now refuses with `advanceTooBig` and the constraint stays
  behind it. Same for `group-of-one` and `too-many-groups`, both of which `dealGroups` answers by throwing or by
  producing a group nobody can play.


### On screen, the extension is composition

`DrawnDayConsole` does not fork the manual console. It keeps `DayHeader`, `DaySetup`, `DayEntrants`,
`DaySand` and `DayHistory`; it adds `DrawSetup`, `DrawGroups` and `DrawSheet`; and until a sheet exists it
still shows the base queue and table. Two adapters carry the mode's stricter meaning: adding a name goes
through `/api/manual-draw/teams`, and finishing a match goes through the drawn finish route, while scoring,
cancelling and withdrawing remain the base presses. That is the same one-way dependency as the API, visible
in the component tree.

The evidence is deliberately in the same shape as the base day's: `manual-slate.test.ts` pins the derivation
without a database (23 tests), `manual-draw.test.ts` runs the mode through its routes against a real one
(12 tests), and `apps/web/src/acceptance/manual-draw.test.tsx` plays a drawn afternoon through the console
(11 tests). The full gate is green — typecheck, lint, standards (644 files), web build, API tests
(922 passed, 3 skipped; 94.74 % branches against a 94.6 % floor) and web tests (1 635 passed; 98.53 %
branches against a 98.4 % floor). Playwright was not run.

### What the port left open, in the open

- **A late team re-deals the sheet, and the core cannot stop it.** The mode's own `POST /teams` refuses a name
  once anything has been played from the sheet, because the deal is by *position* — a sixth team changes
  `ceil(n / size)` and moves the others — and the base route, which must not know a draw exists, still admits
  one. `manual-slate.test.ts` pins the half that is arithmetic (a deck order a newcomer cannot disturb) and the
  half that is not (the deal), and `manual-draw.test.ts` demonstrates the consequence out loud rather than
  asserting it away. The old app's answer was ADR-149: 182 lines, a frozen `tournament_entry` and a projection
  rebuild. Which answer is right for a day is the overhaul's, not this port's.
- **A walkover still cannot be said.** The base's §8 open question became load-bearing here: a knockout that
  ends without a score has no representation at all, so a forfeit is currently "correct the group result so the
  other team's table does it for you", which is a workaround wearing a sentence.
- **An un-slotted match is counted and not placed.** A stray match between two teams in one group moves the
  table and fills no address, so the group still owes the fixture and the desk may play it again. That is
  deliberate — it is what makes a stray harmless — but a printed sheet would want to say "played twice", and
  nothing does yet.
