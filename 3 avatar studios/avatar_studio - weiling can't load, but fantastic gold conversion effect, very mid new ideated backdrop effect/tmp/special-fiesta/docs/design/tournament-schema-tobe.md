# The tournament tables: what they are now, and what they should be

The work orders (`tournament-harmony-work-orders.md`) are written from the code outward. This one is written from
the data outward, because that is the order that catches the most: seven structural facts are visible in the DDL
alone, and every one of them explains a mess somewhere else. Nothing here is built.

**The frame, as decided.** Manual mode is the core, and the core's tournament fact is small: **the teams that
survive a stage go deeper.** It does not matter what a stage is — a bracket, a table, a hybrid, something invented on
the afternoon. So the schema must record *advancements*, not *round rules*: no per-stage promotion number, no new
stage kinds, no status value that the day's own progress forces, nothing that requires the database to know what kind
of round produced the survivor. That closes F-2 (below), and it is why this document now adds exactly one table and
deletes two columns.

**Four words, one each** (asked: *"What is markPhase? we seem to have a mixture of references to `stage` and
`phase`, perhaps we harmonise on one?"*). The mixture is real, and it is in the prose rather than in the schema,
mine included. The four objects are already distinct, so harmonising means naming them once each and never letting the
names swap:

| word | the thing it names | where it lives |
|---|---|---|
| **stage** | one row: a kind, optionally one round of that kind, a label, a price, a close stamp | `tournament_stage`, `db/entities/stages.ts` |
| **kind** | which of the three slices of the day a *fixture* belongs to | `kind` (`:776`), the wire's `MatchStage` |
| **status** | where in the day the tournament itself has got to | `tournament.status` (`:628`), three values |
| **advance** | one team surviving one stage, recorded once | the new `tournament_stage_advancement` |

`phase` is retired. It is the word `docs/design/tournament-phases-assessment.md` opened with, and that document's
own §1 item 7 records why it lost: *"the owner's own word for this was `stage`, not phase — and taking that literally
turned out to be the cheaper design too"*, because reading `stage` + `round_number` as a stage's identity "buys the
flexibility asked for without adding a column to anything". That assessment also proposed a `tournament_phase` table
and a `phase_id` on the fixture; **neither was ever built** — `grep -n "tournament_phase\|phase_id"
apps/api/src/db/schema.sql` returns nothing, and `:772-776` is the shipped answer to the same question. So there is
no second table to reconcile with, this decision costs no DDL, and the only code-shaped consequence is that a
function I had sketched as "the phase writer" is named `markDayStatus` instead, after the one column it is allowed to
write.

**Two of your answers shrink this plan, and they shrink it further than the questions they answer.**

* *"our app responsible for scoring clusters and people only, we don't track prizes."* So the prize-shaped items are
  out: D-2 and D-3 (which column a day prize lands in) and the `score_adjustment.activity_id` relaxation that went
  with them. `award_batch` and `team_award` stay, not as prizes but as the day's only points ledger for a whole team
  — which is what a promotion bonus is paid through, and what a facilitator's manual correction is made of
  (`score_adjustment`, ADR-117). Points by decision stay in scope; what the points buy does not.
* *"with our core manual mode, there is no enforcement, the manual changes reign supreme … but with the other modes
  we add in the enforcements."* Stated once here because it decides several sections below: in the manual path the
  app **offers, records, and never refuses**. A gate belongs to a mode where the day is a plan being executed; a day
  that is being improvised cannot be gated without the gate becoming the schedule. So the close's `force`/`reason`
  pair becomes an optional sentence (D-14), the per-round bonus becomes a question rather than a consequence (D-7),
  "a day with no stage rows" stops being a case in the code because the rows are seeded (§3c), and the only checks
  left are ones that stop a *row* from being nonsense rather than a *human* from being surprised.

**How to read a "to be" in this repo.** `apps/api/src/db/schema.sql` is the definition of a *fresh* database, and its
foot is an additive tail whose own comment states the rule (`:893-896`):

> This is still not a migration system: it adds, it never alters or drops. Keep each line identical in type and
> default to the definition above, or the two will disagree depending on how old a database is.

So a retired column is removed from the definition above (new databases never have it) and left in place for old
ones, unread. Making it physically gone is `./dev-reset.sh` (`db/bootstrap.ts:10-19`), which is the sanctioned remedy
and not a migration. Changing a CHECK is the exception the file allows itself, by name, drop-then-add (ADR-173 at
`:924-925`, ADR-248 at `:944-945`), and changing a DEFAULT too (ADR-203 at `:902-909`, whose comment is the argument
for a good part of this document: *"a column default that disagrees with the application's default is exactly the
kind of latent disagreement this section exists to prevent"*).

---

## 1. The ten tables, and what each one is carrying

| table | what it is for | the columns that matter | what it duplicates, or lacks |
|---|---|---|---|
| `tournament_plan` (`:661`) | the day's **intended** shape, editable until activation | `format` `:664`, `group_size` `:665`, `advance_count` `:666`, `has_third_place` `:667`, `knockout_pairing` `:669` | the five knobs, at a different time — by design (`:659`: *"deliberately NOT merged"*); and read by nothing that draws a match (F-7) |
| `tournament` (`:624`) | the day's **frozen** shape, its status, one freeze | `format` `:627`, `status` `:628`, `group_size` `:629`, `advance_count` `:630`, `champion_points_snapshot` | the day's status, twice (F-1); a promotion number that decides nothing (F-2) |
| `tournament_stage` (`:771`) | a stage: a name, a scoring policy, a close stamp | `kind` `:776`, `round_number` `:777`, `label` `:780`, `ordinal` `:783`, `promote_count` `:787`, `promotion_points` `:788`, `win/loss/draw_points` `:792-794`, `pays_standings` `:800`, `closed_at` `:802`, `close_reason` `:806` | `is_current` `:801` (F-1); and **no record of who got out** (F-2) |
| `tournament_entry` (`:678`) | the field, frozen at activation; a late team appends | `group_code`, `seed` | nothing |
| `tournament_fixture` (`:691`) | a **suggestion**: who will play, in which stage and round, and which match took it | `stage`, `round_number`, `sequence`, `status`, `match_id uuid UNIQUE` | nothing; the text-not-FK choice is defended in §5 |
| `tournament_match` (`:305`) | the **truth**: two teams, a court, a score, a winner, an undo trail | `court_id`, `status`, `score_a/b`, `winner_team_id`, four snapshots, `is_voided`, `edit_reason` | nothing |
| `point_config` (`:266`) | one row: the day's rates and pacing | the three tournament rates, `match_minutes`, `gap_minutes`, `fringe_participation_points`, `tournament_champion_points`, `fringe_passport_*` | nothing — this is the inheritance source the stage overrides lean on |
| `award_batch` (`:839`) / `team_award` (`:864`) / `score_adjustment` (`:369`) | two ledgers under one header | header: `stage_id` `:847`, `label`, `reason`, `is_reversed` + stamp; rows: `points`, `batch_id` (`:869` NOT NULL / nullable at `:933`), `stage_id` `:872`, `roster_snapshot` | opposite `batch_id` nullability (F-4); a NOT NULL that makes a day prize need a station (F-5) |

## 2. Seven structural facts

**F-1 · The day's status is stored twice.** `tournament.status` (`:628`) and `tournament_stage.is_current` (`:801`),
the latter with its own `CHECK` (`:814`) and its own partial unique index (`ux_tournament_stage_one_open`,
`:826-827`). The flag has one predicate (`findCurrentStage`, `db/entities/stages.ts:177-188`) and two callers
(`db/entities/schedule.ts:332`, `:638`), and no client ever sees it. It is a projection of `status` — the mapping is
in work orders §3 — and under the frame above it is worse than redundant: *"which stage is the day on"* is answered
by the advancements and by `closed_at`, so a pointer would be a third story about one act.
**One value owns the day's status.**

**F-2 · The day cannot say who survived.** This is the core's gap, and it was found by asking the wrong question
first (mine was "which table owns `promote_count`?"). What the code does at the only stage boundary it knows:

```
computeStandings → rankQualifiers(standings, promoteCount) → knockoutDrafts → drawBracket
   (schedule.ts:678)      (engine.ts:546-558)                              (schedule.ts:692)
```

`rankQualifiers` walks `rank = 1..advanceCount` across the groups and takes each group's Nth row — **it does not care
what the round is**, which is the right instinct, but it is also the only instinct the schema has. The desk's half of
the act is missing entirely: `closeGroupStageRequestSchema` (`packages/contracts/src/schemas.ts:965-977`) is
`{ force, reason }`. A close can be *forced*, with a sentence, by a named person — and it cannot be *steered*. The one
lever an operator has to advance a team the table did not rank is to hand-write the next stage's pairings through
ADR-247's repair body — `pairs: [{ fixtureId, teamAId, teamBId }]` (`schemas.ts:937-948`, applied by
`stagePairing.ts:203`) — or to move points on the board so the rank comes out right. **Both are overlay levers doing
the core's job**, and both record the wrong noun: they record "these two play" or "these points moved", never "these
teams survived, on my authority, because…". Meanwhile the row that *is* the day's decision carries `promote_count`
(`:787`) — a number nobody can set, whose only read (`schedule.ts:685`) exists to forgive the case where there are no
rows at all.

**F-3 · `promotion_points` has no payer.** The column is documented as a promise — *"Promotion: how many go out of
this stage, and **what going through is worth**. A NULL bonus is the feature OFF … so an organiser turns it on
deliberately rather than finding it in the standings"* (`:785-786`) — and it is in the mirror
(`db/schema/tournament.ts:135`), in `insertStageRow`'s input (`stages.ts:52`, `:75`), and in no reader at all: the
only other "promotion" in the API is a roster comment. The seeder never sets it, so every row on every day is NULL,
which is why nothing noticed. It gets its payer in F-2's fix, and it is the reason the fix is not just an endpoint.

**F-4 · Two ledgers with the same header, one of which cannot be singly entered.** `team_award.batch_id` is
`NOT NULL REFERENCES award_batch (id)` (`:869`) while `score_adjustment.batch_id` is nullable (`:933`, ADR-248:
*"NULL keeps meaning 'posted one at a time at the desk', which is what every row already in the ledger was"*). The
newer, stricter side copied the constraint and lost the forgiveness.

**F-5 · A day prize needs a fringe station to exist — and prizes are out of scope.** `score_adjustment.activity_id` is
`NOT NULL REFERENCES fringe_activity (id)` (`:372`), so an award the *day* gave is not representable in the person
ledger, and the route answers the attempt with a 404 (`routes-superadmin/awards.ts:142-144`). The NOT NULL is a
written decision (`db/entities/awards.ts:149-152`, `packages/contracts/src/awards.ts:56-59`).

*Ruled, so the finding is left as it is:* "our app responsible for scoring clusters and people only, we don't track
prizes." A row that cannot exist is a prize-shaped row, and prizes are not what this app records; the 404 is the
honest answer to a request for one. D-2 and D-3 are withdrawn and the relaxation that went with them is deleted from
§3's tail — which also means `score_adjustment` keeps its shape and the two ledgers are harmonised where they are
*points*: one liveness predicate, no new columns (work orders M4).

**F-6 · The same two columns, bounded four different ways.** `tournament_plan.group_size` is
`CHECK … BETWEEN 2 AND 8` and `advance_count` is `BETWEEN 0 AND 4` (`:665-666`); on `tournament` they are `>= 2` and
`>= 0` (`:629-630`); the two request schemas disagree with both (`activateTournamentRequestSchema` at `:875` allows
`groupSize` 3–6 and `advanceCount` 1–2, `tournamentPlanRequestSchema` at `:905` allows the wider pair and has no
defaults at all). The looser rule guards the copy that runs the day.

**F-7 · The intent has five default sets and activation reads none of them.** Beyond the schemas' disagreement:
`plannedKnobs` carries its own `?? 4` / `?? 2` (`lib/tournament/bracket.ts:64-71`), the console carries a sixth copy
in `DEFAULT_KNOBS` (`apps/web/src/lib/hooks/useAdminTournament.ts:19-28`), and
`POST /tournament/activate` reads only its request body (`routes-superadmin/tournament.ts:130-145`) — the saved plan
is consulted by `planned()` (`bracket.ts:73-77`) and by `GET /plan`, and by nothing that draws a match. So the plan
row is a *declaration* and the activate body is the *decision*, and ADR-150's own reason for existing — *"it was
local state until now, which meant a reload lost it, two laptops could disagree"* (`:651-655`) — is still true of
the copy in the browser. This matters more, not less, once the desk can steer an advancement: **there has to be exactly
one place the day's shape is stated.**

**F-8 · The stage rows are invisible, and that is why two routes cannot be used.** `GET /api/admin/tournament`
(`routes-superadmin/tournament.ts:61-77`) returns `{ tournament, teamCount, standings, fixtures }`, and
`tournamentView` (`views/tournament.ts:77-88`) carries the seven frozen columns and no stage rows. Nothing but the
seeder writes `tournament_stage`, and `insertStageRow` (`stages.ts:60-85`) is not reachable from any route. So the
two routes that ask a caller for a `stageId` — `POST /tournament/stages/:stageId/fixtures` (`:185`, ADR-247's re-pair
lever) and the award header's `stageId` (`packages/contracts/src/awards.ts:38`) — take an id that exists only in the
database. `manual-day-friction.md` reported the re-pair lever as having no screen; it is worse, and it is F-2's
neighbour: a day that had a stage list on screen would also have needed an advancement record on screen, which is the
one thing it cannot express at all today.

## 3. To be — the DDL

```sql
-- A stage is a scoring policy, a name, and a close stamp. It is NOT the day's state (no pointer: F-1), and it is
-- NOT the day's rule (no promotion number: F-2). What a stage decides is only what a result here is worth and
-- whether it moves the table; how far in it sits is a fact about the day's rows, not about this one.
CREATE TABLE IF NOT EXISTS tournament_stage (
  id                uuid PRIMARY KEY,
  tournament_id     uuid NOT NULL REFERENCES tournament (id) ON DELETE CASCADE,
  -- MatchStage, verbatim, and no new value: a stage is a name for a slice of the day, so "whatever kind
  -- of round the afternoon invented" needs no vocabulary change here. A day that needs a kind none of
  -- these three is asks for a wire change, as :773-775 already says.
  kind              text NOT NULL CHECK (kind IN ('group', 'knockout', 'third_place')),
  round_number      integer CHECK (round_number >= 1),
  label             text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  -- Display order only, exactly as the shipped comment at `:781-783` already says it, and this plan does not
  -- change what the column means: two stages may share a round number across kinds, so the list's order is not
  -- derivable from (kind, round), and nothing in the to-be design compares two ordinals to decide which stage is
  -- deeper. An advancement points at stages by id, which is the only "deeper" the day ever needs.
  ordinal           integer NOT NULL CHECK (ordinal >= 1),
  -- NULL = inherit `point_config` (`:789-791`). Resolved at completion and snapshotted onto the match, so
  -- changing these numbers never re-prices a result already on the board.
  win_points        integer CHECK (win_points IS NULL OR win_points >= 0),
  loss_points       integer CHECK (loss_points IS NULL OR loss_points >= 0),
  draw_points       integer CHECK (draw_points IS NULL OR draw_points >= 0),
  -- What leaving this stage alive is worth. Offered to the desk when the stage closes and paid only on its
  -- "Yes" (D-7), which is what gives the column a payer without giving the database an opinion about round
  -- types. The shipped comment already demands exactly this: "A NULL bonus is the feature OFF … so an organiser
  -- turns it on deliberately rather than finding it in the standings" (`:785-787`).
  promotion_points  integer CHECK (promotion_points IS NULL OR promotion_points >= 0),
  -- ADR-246 — does a result here move the standings table? Default false, seeded true for the pool row.
  -- This is also what makes an advancement *proposable*: rank comes from a table, and a stage that does not
  -- feed one offers the desk no proposal — it takes the desk's list alone.
  pays_standings    boolean NOT NULL DEFAULT false,
  closed_at         timestamptz,
  closed_by_superadmin_id uuid REFERENCES superadmin_account (id),
  close_reason      text CHECK (close_reason IS NULL OR length(close_reason) BETWEEN 1 AND 200),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, ordinal),
  -- Two states, not three: an unstarted stage and a running one are the same row, because the day says
  -- which it means. `closed_at` alone is the contradiction test and the race guard — one UPDATE can find an
  -- unclosed row, and only one can. (`is_current` and `promote_count` are gone; the warning at :809-813
  -- about deriving the flag as `closed_at IS NULL` does not recur, because "waiting OR current" stops
  -- being a question the row answers once the day answers it.)
  CHECK (closed_at IS NULL OR closed_by_superadmin_id IS NOT NULL),
  -- A reason without a close is a sentence about nothing.
  CHECK (close_reason IS NULL OR closed_at IS NOT NULL)
);
-- A kind-wide row and per-round rows of the same kind coexist, because the two indexes are partial over
-- complementary halves of `round_number`: (kind, round) where a round is named, (kind) where it is not. So
-- "Knockout, every round, 10-0-0" and "Knockout round 3, the semi-finals, 3-0-0" are two legal rows, and
-- `resolveStage`'s numbered-first precedence is what makes the second one the price the semis pay. No "one shape
-- per kind" rule is added on top (D-11, withdrawn): it would be an enforcement, and manual mode has none.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_stage_round
  ON tournament_stage (tournament_id, kind, round_number) WHERE round_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_stage_kind_wide
  ON tournament_stage (tournament_id, kind) WHERE round_number IS NULL;
CREATE INDEX IF NOT EXISTS ix_tournament_stage_tournament ON tournament_stage (tournament_id, ordinal);
```

```sql
-- ADR-1xx — who got out. One row per team per boundary, written by the human act that ends a stage and read by
-- everything that decides what happens next.
--
-- This is the whole of the core's tournament rule, and it is deliberately the emptiest thing in the schema: a team
-- left one stage and joined another. No kind is inspected, no format is named, and no number of survivors is
-- configured — the count is the number of rows, and it can be 3 because two won their pools and one was reprieved
-- after the rain, which is a sentence the day has to be able to say.
CREATE TABLE IF NOT EXISTS tournament_stage_advancement (
  id                     uuid PRIMARY KEY,
  tournament_id          uuid NOT NULL REFERENCES tournament (id) ON DELETE CASCADE,
  -- The stage the team left — which is also the act that decided it. `closed_at`,
  -- `closed_by_superadmin_id` and `close_reason` are this row's attribution, so a advancement carries no
  -- author and no reason of its own: a second copy of "who, when, why" is two answers to one question,
  -- and the close already has the better one because the route formats its refusal from it.
  out_stage_id           uuid NOT NULL REFERENCES tournament_stage (id),
  -- The stage it entered. Nullable for one case the day cannot avoid: leaving the final progresses into
  -- nothing, and NOT NULL would make a champion's row invent its own successor. That boundary is also
  -- the one already paid another way (`tournament.champion_points_snapshot`, ADR-136), which is why this
  -- table pays nothing on its own for it.
  into_stage_id          uuid REFERENCES tournament_stage (id),
  team_id                uuid NOT NULL REFERENCES team (id),
  -- The order the next stage was drawn in, so the decision is reproducible from the rows alone:
  -- `knockoutDrafts` consumes an ordered list (`schedule.ts:692`), and "the bracket we actually drew" has
  -- to be re-derivable at 9pm when somebody asks why they play court 2 first.
  sequence               integer NOT NULL CHECK (sequence >= 1),
  -- The rank the table gave them, when a table was the source: `rankQualifiers` walks rank 1..N of each
  -- group (engine.ts:546-558), and this is the rank it advanced on. NULL = the desk decided, with no
  -- rank behind it. Read and shown, because "2nd in Pool C" and "from the desk" are different answers to
  -- a question a hall screen gets asked out loud.
  table_rank             integer CHECK (table_rank IS NULL OR table_rank >= 1),
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- Voidable, not deletable: an advancement seeds fixtures and may pay points, and both have their own undo
  -- (`releaseFixtureOfMatch`, schedule.ts:339; `award_batch`'s reversal), so the row stays and says it was taken
  -- back. Flag and stamp are one fact, as on a void and on a reversal. Deletable is not on the menu for a second
  -- reason: `award_batch.stage_id` and `team_award.stage_id` point at `tournament_stage` rows, and the rows below
  -- point at them, so a deleted row would take a played day's price list with it (D-12).
  is_voided              boolean NOT NULL DEFAULT false,
  voided_at              timestamptz,
  voided_by_superadmin_id uuid REFERENCES superadmin_account (id),
  void_reason            text CHECK (void_reason IS NULL OR length(void_reason) BETWEEN 1 AND 200),
  UNIQUE (out_stage_id, team_id),
  UNIQUE (out_stage_id, sequence),
  CHECK (is_voided = (voided_at IS NOT NULL)),
  CHECK (is_voided = false OR voided_by_superadmin_id IS NOT NULL),
  -- Nobody advances into the stage they left. The CHECK is trivial, and it is the one place this table has a rule
  -- of its own, so it is worth naming what kind of rule it is: it stops a *row* from saying something nothing can
  -- read back, which is not the same thing as refusing a *decision*. Under "no enforcement" the second is gone from
  -- the manual path; the first stays, and the difference is the difference between a table and a rulebook. Note it
  -- does not require `into_stage_id` to be deeper, later, or of any particular kind — a reprieve round, a
  -- consolation pool, and a final that leads nowhere are all one shape here.
  CHECK (into_stage_id IS NULL OR into_stage_id <> out_stage_id)
);
-- A team is live in a given stage once. The partial index is the shape this file already uses for
-- "exactly one, for now" (`ux_tournament_match_live_court`) and it replaces the job
-- `ux_tournament_stage_one_open` was doing for a pointer: the referee is now the advancement, not the clock.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_advancement_live_seat
  ON tournament_stage_advancement (into_stage_id, team_id) WHERE is_voided = false AND into_stage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_tournament_stage_advancement_team
  ON tournament_stage_advancement (team_id);
```

### 3b. Per-round prices: already modelled, and free to take

Asked "can we define promotion bonus points / winning points per round id now?", the answer is yes, and the DDL does
not move. The row is already the right shape and the resolution already prefers it:

* `NewStageRow` (`db/entities/stages.ts:45-58`) already takes `roundNumber`, `winPoints`, `lossPoints`,
  `drawPoints`, `promotionPoints` and `paysStandings` — `insertStageRow` (`:60-85`) writes all of them. Only the
  seeder never passes rates, which is why every row in existence is kind-wide with NULL prices.
* A row may be per round: `round_number` plus the pair of partial unique indexes
  (`ux_tournament_stage_round` `WHERE round_number IS NOT NULL`, `ux_tournament_stage_kind_wide` `WHERE round_number
  IS NULL`, `schema.sql:822-825`) means "one row per (kind, round), or one kind-wide row per kind" is already the
  rule the database enforces.
* The lookup already prefers the specific row: `resolveStage` is *"numbered first, kind-wide as the fallback"*
  (`stages.ts:135-142`), reached per result by `resolvedStageForMatch` (`:292-307`), which finds the row through the
  fixture's own `(stage, round_number)` — so no match has to be told which row prices it.
* The price is snapshotted at completion (`:166-175` → `points_awarded_snapshot`), and **the board reads the
  snapshot, not a rate** (`leaderboard.ts:51-71`): `sum` of `(points_awarded_snapshot->>'winPoints')::int` per team.
  So a round's price can be changed at 4pm without re-pricing a single played result — which is what makes per-round
  config safe to edit on a live day, and is the same property `pays_standings` and `promotion_points` lean on.
* `pays_standings` is already resolved per row (`stages.ts:145-149`), so "the group stage pays the table but the
  consolation rounds don't" is a row-level truth today, not a new one.
* And `promotion_points` now has the right key: `tournament_stage_advancement.out_stage_id` names the exact row a team
  advanced out of, so a per-round bonus is read from the same row that priced that round's results, and it is
  reversible as a unit because `award_batch.stage_id` (`schema.sql:847`) points at the same row.

What is missing is only ever having been a way to write it: no route creates or edits a stage row (F-8), and the
seeder creates three kind-wide ones. Plus two rules to settle, in §8: `ordinal` cannot do two jobs at once (D-11),
and a per-round close is not thereby a status change (D-12 is answered yes, so §4 item 3b's split is required
rather than defensive).

```sql
-- What `tournament` loses and keeps.
--   loses status-as-two-homes  → `is_current` is gone from `tournament_stage` (F-1)
--   loses a decided-by column  → nothing reads `advance_count` to decide anything (F-2)
CREATE TABLE IF NOT EXISTS tournament (
  id                          uuid PRIMARY KEY,
  singleton                   boolean NOT NULL DEFAULT true CHECK (singleton),
  format                      text NOT NULL CHECK (format IN ('round_robin', 'world_cup')),
  -- The day's status, and the only place it is stored: admission (`lib/operations.ts:128`), the corrections
  -- freeze (`routes-superadmin/corrections.ts:284`), the settled picture (`schedule.ts:918`) and the desk
  -- (`views/tournament.ts:77-88`) all ask here, and none of them joins a stage row to do it.
  status                      text NOT NULL CHECK (status IN ('group_stage', 'knockout', 'completed')),
  group_size                  integer NOT NULL CHECK (group_size BETWEEN 2 AND 8),
  -- What the day was *drawn with*: the plan's intent, frozen at activation, kept because the hall screen
  -- prints "top 2 advance" before anybody has decided anything. It is not read to choose survivors —
  -- `tournament_stage_advancement` is — so a desk that takes 3 is not disagreeing with this column.
  advance_count               integer NOT NULL CHECK (advance_count BETWEEN 0 AND 4),
  activated_at                timestamptz NOT NULL DEFAULT now(),
  activated_by_superadmin_id  uuid NOT NULL REFERENCES superadmin_account (id),
  has_third_place             boolean NOT NULL DEFAULT false,
  champion_points_snapshot    integer CHECK (champion_points_snapshot >= 0),
  knockout_pairing            text NOT NULL DEFAULT 'adjacent'
                                CHECK (knockout_pairing IN ('classic', 'adjacent'))
);
```

`tournament_plan` is unchanged — no `stages` jsonb, which the previous draft proposed. It was there to let an operator
*configure a promotion rule per round*, and under the frame there is no such rule to configure: the plan's five knobs
are the whole intent, and the advancement is not an intent, it is a thing that happened.

**The ledgers change nothing in this draft.** The previous cut relaxed `score_adjustment.activity_id` and
`team_award.batch_id` so a day-given prize had somewhere to live; D-2 withdrew the prize, so both relaxations and the
CHECK that would have bound them are gone, and the two columns stay exactly as ADR-117 and ADR-159 left them. What
remains of the harmonisation is the part that was never about prizes: one liveness predicate shared by every reader
of a voided row, so a reversed batch and a voided adjustment are read as the same idea. F-2's fix lands here as a
consumer rather than a change: an advancement the desk paid `promotion_points` for posts a `team_award`, because that is
what the ledger is for, and `award_batch.stage_id` (`:847`) is what makes "reverse the promotion awards for the
quarters" one act.

**The tail that ships with it**, in the file's own idioms:

```sql
-- ADR-1xx — the day records who got out, in one value instead of two, with one bound set.
ALTER TABLE tournament DROP CONSTRAINT IF EXISTS tournament_group_size_check;
ALTER TABLE tournament ADD  CONSTRAINT tournament_group_size_check CHECK (group_size BETWEEN 2 AND 8);
ALTER TABLE tournament DROP CONSTRAINT IF EXISTS tournament_advance_count_check;
ALTER TABLE tournament ADD  CONSTRAINT tournament_advance_count_check CHECK (advance_count BETWEEN 0 AND 4);
ALTER TABLE tournament_stage DROP CONSTRAINT IF EXISTS tournament_stage_close_pair_check;
ALTER TABLE tournament_stage ADD  CONSTRAINT tournament_stage_close_pair_check
  CHECK (close_reason IS NULL OR closed_at IS NOT NULL);
-- An advancement that is taken back is an undo, and every undo in this file is audited by name (ADR-248's
-- widened list is the precedent this pair copies).
ALTER TABLE void_audit_entry DROP CONSTRAINT IF EXISTS void_audit_entry_target_type_check;
ALTER TABLE void_audit_entry ADD  CONSTRAINT void_audit_entry_target_type_check
  CHECK (target_type IN ('fringescan', 'tournamentmatch', 'swagclaim', 'awardbatch', 'stageadvancement'));
-- D-13, if the day is seeded (see §3c): one status value, and the two activation stamps become what they
-- always described — a start, which a day that has not started yet does not have. The CHECK binds the
-- three so a relaxation cannot quietly turn into three clocks (F-1's disease, in a smaller hat).
ALTER TABLE tournament DROP CONSTRAINT IF EXISTS tournament_status_check;
ALTER TABLE tournament ADD  CONSTRAINT tournament_status_check
  CHECK (status IN ('planned', 'group_stage', 'knockout', 'completed'));
ALTER TABLE tournament ALTER COLUMN activated_at DROP NOT NULL;
ALTER TABLE tournament ALTER COLUMN activated_by_superadmin_id DROP NOT NULL;
ALTER TABLE tournament DROP CONSTRAINT IF EXISTS tournament_not_started_check;
ALTER TABLE tournament ADD  CONSTRAINT tournament_not_started_check
  CHECK ((status = 'planned') = (activated_at IS NULL));
-- F-4 and F-5 stay findings; the DDL they implied is withdrawn with the prize (D-2), and the ledgers
-- harmonise in code instead. The retired `is_current` and `promote_count` need no statement at all: they
-- stop existing in the definition above, and old databases keep columns nothing reads.
```

Two things the DDL cannot say, and where they live instead. **Into-a-deeper-stage** is a comparison between two rows
of one table (`ordinal` of `into_stage_id` > `ordinal` of `out_stage_id`) — that is a one-line check in the entity
that writes the row, not a cross-row CHECK. And **"a rank comes from a stage that pays the standings"** is the same
class of sentence. Both are enforced in `db/entities/`, and the reason they can be is that the only writer of these
rows is one function. That is the trade this table makes: fewer constraints in the database, one door in the code,
which is also what makes it safe to leave a stage's shape uninterpreted.

### 3c. The rows are seeded, not defended

Asked: *"for stage rows we also include into the thin initial seed sql file"*. The file is the right one for exactly
the reason it exists: `seed-default.sql` is tier 2, "what EVERY install starts with, and nothing more", it runs on
every boot, and its header states the discipline that makes that safe — *"every statement is guarded, so re-running
on every boot is safe (ADR-049's idempotency rule)"* — with fixed uuids, because tier 3 replays against them. Your
answer therefore replaces the defensive code in M1 with data, which is the stronger of the two: a day cannot be
missing what every install starts with.

One FK is the whole of the small print. `tournament_stage.tournament_id` is `NOT NULL REFERENCES tournament (id)`
(`:772`), and the day is a singleton by index (`ux_tournament_singleton`, `:647`) — so **stage rows cannot be seeded
without the day row being seeded too**, and today the day row is created by `POST /activate`, whose transaction calls
`insertStagesForActivation` (`schedule.ts:147`). Seeding the rows is therefore a decision about what activation *does*,
which is the one question this document now has left (D-13). If the answer is yes, the block is this, in the file's
own idiom:

```sql
-- The day, seeded and not yet started: activation stamps it rather than creating it (D-13).
-- Fixed ids, as the accounts above have them, because tier 3 replays against them.
INSERT INTO tournament (id, singleton, format, status, group_size, advance_count)
SELECT '5ad00000-0000-4000-8000-0000000000d1', true, 'world_cup', 'planned', 4, 2
WHERE NOT EXISTS (SELECT 1 FROM tournament);

INSERT INTO tournament_stage (id, tournament_id, kind, label, ordinal, pays_standings)
SELECT v.id, '5ad00000-0000-4000-8000-0000000000d1', v.kind, v.label, v.ordinal, v.pays
FROM (VALUES
  ('5ad00000-0000-4000-8000-0000000000a1'::uuid, 'group',       'Pool stage',   1, true),
  ('5ad00000-0000-4000-8000-0000000000a2'::uuid, 'knockout',    'Knockout',     2, false),
  ('5ad00000-0000-4000-8000-0000000000a3'::uuid, 'third_place', 'Third place',  3, false)
) AS v(id, kind, label, ordinal, pays)
WHERE NOT EXISTS (SELECT 1 FROM tournament_stage);
```

Three consequences, and note which of them is a question rather than a change:

* **`status` gains one value, `planned`.** A seeded day has to be able to say *not started*, and `'planned'` is
  already the app's word for that state: `FinalStandingsView.tournamentStatus` lists exactly
  `'planned' | 'group_stage' | 'knockout' | 'completed' | null` (`packages/contracts/src/wire.ts:943`). Widening the
  CHECK at `:628` is the drop-then-add the tail already permits itself (ADR-173 at `:924-925`), and it does not make
  a phase machine: nothing branches on `planned` except whether the activation panel is the day's front door.
* **`activated_at` and `activated_by_superadmin_id` become nullable** (`:631-632`; the first also carries
  `DEFAULT now()`, so a seeded row would otherwise claim it started itself at boot). A CHECK keeps the relaxation
  from becoming three clocks: `CHECK ((status = 'planned') = (activated_at IS NULL))`. `TournamentView.activatedAt`
  goes `string | null` (`wire.ts:166`), and the view already has the helper for it (`isoOrNull`, `lib/http.ts:62`).
* **`insertStagesForActivation` is deleted** (`stages.ts:97-124`) — and with it the last copy of a plan number onto a
  row (`promote_count` at `:105`, which F-2 is about) and the `!index.hasRows` fallback at `:147` that stands in for
  "this database predates stage rows". Activation becomes a stamp on the seeded day, and `tournamentAlreadyActive`
  becomes "already started". Nothing is *added* to guard the missing-rows case, which is the point: under manual
  mode the app does not refuse the operator, so the case had to be made impossible instead.

## 4. What the frame obliges

1. **One clock** (F-1 → work orders M2). `is_current`, `findCurrentStage`, `openNextStageRow` go; the close's guard
   becomes `WHERE id = … AND closed_at IS NULL`, which is already one UPDATE (`stages.ts:196-219`), and "which stage
   is the day on" is `ORDER BY ordinal` over unclosed rows. `claimScope` keeps scoping by **kind** — its comment
   (`schedule.ts:323-327`) already explains why exact `(kind, round)` scoping strands a cancelled match once the day
   moves on, and it is the one place the mode boundary in §0 is worth stating in code terms: the assessment's §1 item
   6 records the bug the scope exists to close (a hand-started match silently claiming a *knockout* fixture, a coin
   flip `tests/court-queue.test.ts:191-206` was rewritten around), so scoping by *tournament* is correctness and
   stays in every mode, while scoping by *stage* is a rule about how the day is run — which in manual mode narrows
   the choices offered rather than refusing the one made.
2. **The close becomes the advancement act.** `closeGroupStage` (`schedule.ts:670-697`) is already stage-shaped in its body
   — `refusalForClose` (`:761`), `computeStandings` (`:678`), `rankQualifiers` (`:686`), `drawBracket` (`:708`),
   `closeStageRow` — so the change is one optional field on the request and one parameter on the function:
   `qualifiers?: string[]`. Absent means "take the table's proposal" (today, exactly); present means "the desk
   decided", and the rows are written from the list. One act, one transaction, and `promote_count` and its `??` floor
   are both gone because the number *is* the list.
2b. **The bonus is a question, not a consequence** (D-7, answered). Instead of the close paying `promotion_points` on
   its own, the desk is asked: *"these 4 teams came through — pay the 3 points each the stage offers?"* with Yes and
   No as the two answers. Mechanically that is one more optional field on the same request, `payPromotionBonus?:
   boolean`, defaulted from `promotion_points IS NOT NULL` — which is the shipped comment's own rule that a NULL
   bonus is the feature OFF rather than something a team finds on the standings — and one branch in the one act that
   already runs in the close's transaction: Yes posts the batch through `createAwardBatch`, No posts nothing. No
   refuses nothing, and No leaves no row, because "we paid nobody" is already recorded by the ledger's silence. This
   is also the answer to D-10 in the same breath: the desk is *offered* a sentence and a payment, and neither is a
   condition of advancing anybody.
3. **The overlay stops being the only door.** ADR-247's re-pair body (`schemas.ts:937-947`) goes back to being what
   its name says — a repair of *pairings* — and stops being the only way to put a team into a stage. Nothing about it
   is removed; it stops being load-bearing, which is the harmony win: the core states who advanced, the overlay
   decides who meets whom, and each can be corrected without touching the other.
3b. **A close is a stamp; only some closes move the clock.** M2 makes `markDayStatus` the single writer of
   `tournament.status`, and that stays right — but per-round rows mean `closeStageRow` fires more often than the day
   changes the day's status. The two are already separable in code: `completeWithoutBracket` (`schedule.ts:795`) calls
   `closeStageRow` on its own today. So the rule is: a close always stamps its row and writes its advancements; the
   status moves only at the boundaries that change what the day *means* — admission
   (`lib/operations.ts:128`), the corrections freeze (`routes-superadmin/corrections.ts:284`), the settled picture
   (`schedule.ts:918`). Closing the quarter-finals into the semis moves none of those, so `status` stays
   `'knockout'`, and a `CHECK` on the enum needs no new values.
3c. **Rows are sparse overrides, which is what keeps a day readable.** NULL means inherit (`schema.sql:789-791`),
   the day default comes from `point_config`, and a day that prices every round alike has no numbered rows at all.
   The desk's list shows a kind-wide row per stage and a numbered one only where it differs — no "copy the defaults
   into every row" seeding, which is the mistake `promote_count` was making when it was copied out of
   `advance_count` (`stages.ts:105`).

4. **One shape, one validator, two writers** (F-7, F-6; D-9 answered "both sides stay"). `POST /preview`, `PUT
   /plan` and `POST /activate` share one `tournamentShapeSchema`, and each keeps its own body: the plan stays a
   declaration the desk saves, activation stays an act that carries what it starts with, and neither reads the
   other's copy of the truth. What does go is the *duplication of defaults* — `plannedKnobs`'s five `??`
   (`lib/tournament/bracket.ts:63-72`) and the console's sixth copy (`apps/web/src/lib/hooks/useAdminTournament.ts:19-28`)
   are deleted, because with §3c the defaults they were standing in for live in one place the operator can read: the
   seeded row. F-7 is then closed by construction rather than by a rule: two writers, one shape, zero fallbacks.
5. **`promotion_points` gets a payer** (F-3): the desk, at the close, through the ledger, on an explicit Yes (item
   2b). The alternative I had offered — delete the column and let a day pay survivors with an award the desk posts
   itself — is now the *fallback*, not the recommendation, because a dialogue costs no column and no new surface.
   What must not survive either way is the current state: a promised column with no reader.
6. **Bounds and defaults, once** (F-6, F-7): table bounds = request-schema bounds = the plan's, with no sixth copy in
   a browser. `MAX_REPAIR_PAIRS = 64` (`schemas.ts:929`) and day-wide `UNIQUE (tournament_id, sequence)` on
   `tournament_fixture` (`:691`) stay as they are; the first is justified as "one stage fits in one request" and
   still is, and the second is what lets a deeper stage's fixtures be appended without a new key — the same property
   late entries already rely on (`insertGroupFixtures(…, startSequence: await nextSequence(…))`,
   `schedule.ts:1056-1061`).

## 5. What deliberately does *not* change

* **No promotion configuration comes back.** No `promote_count` on a stage, no `stages[]` list of rules on the plan,
  no CHECK that ties a stage's shape to how many leave it. If a future day wants "top 2 of each pool, seeded by
  table", that is `table_rank` on the advancement rows — data the desk already has — not a rule the schema executes.
* **`kind` gains no value, and `ordinal` gains no meaning.** A new kind is a wire change, which the shipped comment
  at `:773-775` already decided ("asks for a wire change, not a wider CHECK here"), and this frame removes the only
  reason to want one — a day that improvises invents a *round* of a kind it has, which is a row. `ordinal` stays
  display order only, as its own comment at `:781-783` says; the plan deliberately invents no deeper meaning for it,
  because the comparator it would have supplied ("advance into a *deeper* stage") is now expressed by ids instead.
  `tournament.status` gains at most one value, and only as a consequence of D-13, not of the per-round design.
* **`tournament_fixture.stage` stays a text enum, not a `stage_id` uuid.** A row is a decision *about* a kind, not a
  parent of a fixture: `stageOwnsFixture`/`stageFixturePredicate` (`stages.ts:265-285`) map a fixture's
  `(stage, round_number)` onto a row whose `round_number` may be NULL — one row covering every round — and that
  indirection is what keeps a re-pair cheap and an unconfigured day readable. With advancements recorded, a FK would
  add nothing: the *membership* question the id was wanted for is now answered by `tournament_stage_advancement`.
* **`tournament_plan` is not merged into `tournament`** (`:651-660`): a mutable intent and a frozen act are
  different facts, and D-9 keeps them that way — activation keeps its own body rather than consuming the plan, so
  the plan stays the hall screen's forecast and nothing else. The merge would have bought one writer at the price of
  a mutable activated row, which is the fact ADR-150 exists to protect.
* **`is_voided` gets no `undone_at`**; `points_awarded_snapshot` stays jsonb; `champion_points_snapshot` stays on
  `tournament` — one row per day, one final, a freeze of a mutable `point_config` value. If a future day wants a
  bonus at every boundary, that is `promotion_points`, which is why the freeze does not move.
* **`point_config` keeps every rate.** The stage columns inherit from it (`:789-791`), and under this frame
  `promotion_points` is simply the fifth member of that family rather than a special case bolted to a number.

## 6. The code that falls into place

| reader | today | to be |
|---|---|---|
| `claimScope` (`schedule.ts:332`) | `findCurrentStage` → kind set, plus a "no rows means the whole day" fallback | tournament scoping always (correctness); stage scoping as a *narrowing of the offer* in scheduled mode, and as nothing in manual mode; no fallback row |
| `closingGroupStage` (`:630-640`) | read the current row, check its kind is `group`, else null | `tournament.status !== 'group_stage' → null` |
| `closeGroupStage` (`:685-686`) | `stage?.promoteCount ?? tournament.advanceCount`, then `rankQualifiers(standings, promoteCount)` | `qualifiers = input.qualifiers ?? rankQualifiers(standings, tournament.advanceCount)` — then write the rows, and read the rows |
| the next stage's draw (`:692`) | consumes the computed list | consumes the `sequence` order of the rows just written |
| `advanceWinner` (`:385-393`) | fills downstream seats from a result | unchanged for a bracket, and no longer the only way a seat is filled |
| `promotion_points` | read nowhere | asked of the desk at the close (`payPromotionBonus`), paid once per advancement on a Yes through `createAwardBatch` (`db/entities/awards.ts:100-145`), and posting nothing on a No |
| `closeStageRow` (`stages.ts:196-219`) | `.set({ isCurrent: false, closedAt, … })` where `… isCurrent AND closedAt IS NULL` | same UPDATE, minus one SET field and one conjunct |
| `openNextStageRow` (`:226-246`) | SELECT next row, UPDATE its flag | deleted, with the `'no bracket to draw'` default at `:798` only it could need |
| `feedsStandings` (`stages.ts:145-149`) | `if (!index.hasRows) return key.stage === 'group'` | `resolveStage(index, key)?.paysStandings === true`, and the `hasRows` half dies with the seeded rows rather than with a new refusal (`:42`, `:132`, and the test helper at `tests/tournament-stages.test.ts:69`) |
| `insertStagesForActivation` (`:97-124`) | three rows, two gates, one seeded copy of `advance_count` | deleted if D-13 is yes — the three rows and their labels become seed data (§3c), and the copy of the promotion number goes with them |
| `tournamentView` (`views/tournament.ts:77-88`) | `advanceCount: row.advanceCount` | unchanged in meaning, commented: "as drawn", never "as decided" |
| `repairStagePairs` (`stagePairing.ts:203`) | the only lever that can seat an unranked team | a pairing repair again, which is all its name claims |
| `refusalForClose` (`schedule.ts:761`) and the close body's `force`/`reason` (`schemas.ts:965-977`) | a forced close requires a sentence | manual mode: the sentence is *offered*, and a gate that would refuse the desk is not run; the scheduled modes keep ADR-247 as written (D-14) |
| `plannedKnobs` + `DEFAULT_KNOBS` | two more default sets | deleted; the defaults move to the seeded row, which is the one a desk can read off the database (`bracket.ts:63-72`, `useAdminTournament.ts:19-28`) |
| `PUT /plan`, `POST /preview`, `POST /activate` | two schemas, four bound sets, plan unread | one `tournamentShapeSchema` validating all three bodies, each still its own act with its own body (D-9: both sides stay) |

## 7. Done when

* `grep -rn "is_current\|isCurrent" apps/api/src/db` — empty, and `ux_tournament_stage_one_open` appears nowhere.
* `grep -rn "promoteCount\|promote_count" apps/api/src packages/contracts` — empty in both, mirror included.
* `grep -rn "advanceCount" apps/api/src/db/entities` — the activation insert that seeds it and the proposal handed to
  `rankQualifiers`. Nothing else, which is the whole of F-2 in one grep.
* `grep -rn "promotionPoints" apps/api/src/db/entities` — non-empty on the write side: the column has a payer, or the
  column is gone. Either is a finished state; "present and unread" is the only unacceptable one.
* Exactly one writer of `tournament_stage_advancement`, and a test for each of its two doors: a table-proposed close that
  reproduces `knockoutDrafts`' input from the rows' `sequence`, and a desk-chosen close that advances a team ranked
  third and pays it the stage's `promotion_points` once.
* A void that puts the seat back: void the row, expect the downstream fixture released
  (`releaseFixtureOfMatch`) and the promotion award reversed as a batch, with a `void_audit_entry` naming
  `'stageadvancement'`.
* `grep -rn "crossing\|markPhase\|tournament_progression" docs/design apps packages` — empty. The rename is itself a
  deliverable: a plan that changes the day's vocabulary has to be able to prove the old words are gone, and three
  greps is the whole of that proof. `phase` survives exactly one time, inside the path
  `docs/design/tournament-phases-assessment.md`, where it is a title and not a name for anything.
* `grep -rn "hasRows" apps/api/src/db` — empty, and no error message about missing stage rows was ever written: the
  case is prevented by the seeded rows (§3c), which is the difference between this plan and a defensive one.
* `./verify.sh` green with the coverage floors moved — a branch and an index died and a table was born, so the floors
  are re-measured rather than preserved.

## 8. What you answered, and the two questions left

The twelve questions from the first cut are answered. Recorded here as rulings rather than as recommendations, because
the table below is now the thing the work orders implement:

| # | the ruling, in your words | what it changes here and in the work orders |
|---|---|---|
| **D-1** | *"for stage rows we also include into the thin initial seed sql file"* | §3c: `seed-default.sql` gains the day's three rows, guarded and fixed-uuid, so M1 is a data change plus two deletions and no new error path. It pulls in D-13 (below), because a stage row cannot exist without a day row. |
| **D-2 / D-3** | *"out of scope … we don't track prizes"* | Withdrawn: the award→column question, the `score_adjustment.activity_id` relaxation, and every prize surface. The two ledgers stay, as the points mechanism they already are. |
| **D-4** | *"a mixture of references to `stage` and `phase`, perhaps we harmonise on one?"* | §0's four words. `phase` retired, `markPhase` → `markDayStatus`, and no DDL: the shipped schema already uses `stage` for rows and `status` for the day, and the assessment's `tournament_phase` was never built. |
| **D-5** | *"explain what this value is for?"* | Answered in §4 item 1 and in the work orders' §9: `claimScope` is the predicate that stops a hand-started match claiming a fixture out of the wrong slice of the day (assessment §1 item 6, `tests/court-queue.test.ts:191-206`). My question was badly posed — it assumed the flag survived M2, and it does not. |
| **D-6** | rules in `check-standards.mjs`, proven by sabotage | Unchanged: the two conventions and the one-writer rule for `tournament.status` and for advancement rows. |
| **D-7** | *"instead of automatically we can present this as a dialogue `Yes / No`"* | §4 item 2b: `payPromotionBonus` on the close request, defaulted from `promotion_points IS NOT NULL`, Yes posting through `createAwardBatch` and No posting nothing. This is the column's own shipped intent, not a new idea. |
| **D-8** | asked what an opposite row is | Explained in the work orders §9.8: `score_adjustment` is append-only, and its entity says so in one sentence — *"an adjustment entered in error is answered with an equal and opposite one"* (`db/entities/adjustments.ts:12-14`) — so a correction is a second row, never a deletion, which is possible because `points` is signed (`schema.sql:373-375`). An advancement cannot use that shape, because it un-runs a seat and an award rather than only cancelling a number — so the void triple stands, and your no-enforcement ruling makes it the safer of the two anyway. |
| **D-9** | *"both sides stay"* | §4 item 4 rewritten: activation keeps its body, the plan stays a declaration, and the *defaults* are what collapse — into the seeded row (§3c), not into a shared fallback object. `plannedKnobs` and `DEFAULT_KNOBS` still die. |
| **D-10** | *"Yes"* | The desk may advance anyone it likes with no sentence at all. `reason` becomes optional on both the close and the advancement (D-14), `table_rank` NULL means "the desk decided", and no test asserts that a bare list is refused. |
| **D-11** | *"give me an example"* | Withdrawn, and the example is why: a kind-wide `('knockout', NULL, 'Knockout')` row and a `('knockout', 3, 'Quarter-finals', win_points 3)` override are already both legal (`:822-825`), `resolveStage` already prefers the numbered one (`stages.ts:135-142`), and the only reason to forbid the mix was to keep `ordinal` usable as a "deeper" comparator — which §5 now refuses to do. Forbidding it would also be an enforcement. |
| **D-12** | *"Yes, will it cause issues?"* | Yes, and none of them are structural — listed in the work orders' M7 as four small jobs: translate two uniqueness violations into a readable 409 instead of a 500, pick `ordinal` as `max+1` rather than assume the next one is free, never delete a row (the ledgers point at them), and remember that inventing a *kind* is a wire change (`:773-775`) even though inventing a *round* is not. |

So there are two decisions left, and one of them is the consequence of an answer rather than a new direction:

| # | question | my recommendation | if you say otherwise |
|---|---|---|---|
| **D-13** | Does the thin seed file gain the **day row** as well as its three stage rows — making `POST /activate` the act that *starts* a day rather than the one that creates it? | Yes, in the shape §3c draws: `'planned'` added to the status CHECK, `activated_at`/`activated_by_superadmin_id` relaxed to nullable with a CHECK binding them to `status`, `insertStagesForActivation` deleted. It is the only reading of your answer that makes "a day with no stage rows" impossible rather than illegal. | Then the rows keep coming from code at activation — which already guarantees them for every day the app itself starts — and the seed file stays accounts-only. M1 then shrinks to deleting the `hasRows` fallback and its test helper, and a hand-made database has no rows until the day is activated. Coherent, and it leaves the question your answer was aimed at technically open. |
| **D-14** | In manual mode, is a close's `reason` still required when the desk forces it (ADR-247)? | Offered, not required. The gate was written for a scheduled day; under "manual changes reign supreme" the sentence should be in the dialogue the desk sees, pre-filled when the list differs from the table's proposal, and never the thing that stops the act. `close_reason` already allows NULL (`:805`), and `schemas.ts:969` is one field. | Keep ADR-247's rule in every mode. It is the one gate this plan is not asked to remove, and its cost is a `close_reason` column that is only ever read by the audit trail rather than by the day. |

---

**The one line worth keeping in mind while reading §3.** Every part of this that is *new* is a row the day had no
place to write; every part that is *deleted* is a number the day was told to obey. That asymmetry is the whole of the
harmonisation, and it is why the two remaining questions are both about who writes a value down rather than about
which value is right.
