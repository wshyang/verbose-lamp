# Harmonising the tournament backend: the core, and what is allowed to sit on it

The frame this document is written under, in the user's words: **the manual functionality is the core of the
tournament system**, and the pairing layers — pools, the world-cup draw, rounds, courts, the bracket — are
**enhancements built on that core**. The goal is a harmonised back end. The plan in §3 is therefore built out
of deletions, and §4 lists what this document recommends *against*, because the fastest way to lose harmony is
to unify something that is deliberately asymmetric.

---

## 1. The frame, checked against the schema

The core, as built: a human starts a match, a scoreboard adds up, the day prices it, a desk corrects it, and
every reader recomputes. Four tables, and none of them mentions a schedule:

```
  CORE (manual)                                    OVERLAY (the plan)
  ─────────────────────────────────                ─────────────────────────────────────
  tournament_match                                 tournament_plan      (editable before activation)
    court_id, team_a/b, score_a/b, status,             │ PUT /api/admin/tournament/plan
    winner_team_id, started_by/at,                     ▼
    completed_at, is_voided,          tournament       (format, status, group_size, advance_count,
    edit_reason + 3 jsonb snapshots                    has_third_place, knockout_pairing, activated_*)
        ▲                                                 │ activate()  ── seeds ──►  tournament_stage
        │  match_id (UNIQUE)  ◄──── tournament_fixture ──┘                           (kind, round_number, label,
        │  the ONLY edge between them     (stage, round_number, group_code,             ordinal, promote_count,
        │                                 sequence, team_a/b, source_*_id,               win/loss/draw_points,
  fringe_scan   score_adjustment            status, match_id, walkover_winner)           pays_standings, is_current,
  team_award    award_batch            tournament_entry (team, group_code, seed)          closed_* triple)
```

**Test of the frame: is the core complete without the overlay?** Yes, and provably so — a day can be run end to
end with zero fixtures: `POST /api/tournament/matches` takes a court and two teams, `pointsForCompletion`
prices through `stageRates` "with `point_config` underneath it", the board and the export read the same rows,
`assertCorrectionAllowed` passes friendlies straight through, and `claimFixtureForMatch` returning `null` is
documented as *"a friendly, not an error"*. The behaviour already honours the frame.

What the code does **not** honour is the naming. The core row carries a receipt (`points_awarded_snapshot`)
and no pointer; the overlay keys the core by a text triple; and almost every question in the overlay has two
answers depending on whether a set of rows exists. That is the disharmony, and it is worth being exact about it,
because it is not a bug list — it is one decision not yet taken.

## 2. Seven disharmonies, cited

**D1 · Two clocks, two files, no stated relationship.** `tournament.status`
(`CHECK (status IN ('group_stage','knockout','completed'))`) is written at `db/entities/schedule.ts:133`
(activate), `:747` (close → knockout), `:402`/`:792` (→ completed, and the same statement freezes
`championPointsSnapshot`). `tournament_stage.is_current` is written in `db/entities/stages.ts:203` and `:244`
by `closeStageRow`/`openNextStageRow`. The invariant between them — *the pool stage is current while and only
while `status = 'group_stage'`* — is enforced by nobody and read by both sides: `claimScope` asks the stage
rows (`stages.ts:185`), `assertCorrectionAllowed` asks `tournament.status` (`corrections.ts:284`), admissions
ask it again (`tournament.ts:258`), and `closingGroupStage` has to reconcile them explicitly, its comment
naming the failure it is avoiding: *"a tournament activated before ADR-245, **or one whose open stage is no
longer the pool**"* (`schedule.ts:630-633`).

**D2 · The stage is addressed, not referenced — on purpose.** `tournament_fixture` has `stage text` and **no
`stage_id`**; `tournament_stage` keys on `(tournament_id, kind, round_number)`. `stages.ts:10-15` states the
reason, and it is a good one:

> A stage row keys on the pair a fixture already carries (`stage`, `round_number`) instead of owning a pointer
> of its own, and that choice is the whole design: `stage` stays the behaviour switch that decides draw legality
> (ADR-152) and the champion bonus (ADR-136/137), so nothing here can disagree with it, while the row carries
> what a three-value enum cannot say.

So `stage` (the text) is authority for **behaviour** and the row is authority for **value**, joined by a lookup
with its own precedence rules (`resolveStage`, :136-143: numbered row first, kind-wide row as fallback, `null`
for a legacy day). Two mechanisms, one relationship, resolved in one file. That is as harmonised as this can
get *without* an FK — and §4 argues for keeping it that way.

**D3 · The two-mode branch, made permanent by a test.** Every overlay question is asked twice:

| Question | With stage rows | Without |
|---|---|---|
| Does this result move a table? | `row.paysStandings` | `key.stage === 'group'` (`stages.ts:147`) |
| What is a result worth? | `stageRates(row)` | `point_config` |
| How many go through? | `stage.promoteCount` | `tournament.advanceCount` (`schedule.ts:685`) |
| Which fixtures block the close? | `stageFixturePredicate(stage)` | the whole day (`schedule.ts:309`) |
| Which kind is the day playing? | `is_current` | `tournament.status` (D1) |

`stages.ts:26-28` calls this *"the old behaviour is a case of the new rule rather than a branch sitting beside
it"* — but the code **is** a branch, and `tournament-phases-assessment.md` §14 records the day's
"legacy day whose rows are deleted still behaving" as a *test that passes*. So the mode is load-bearing until
someone retires it. This is the hinge of the whole plan: one decision here deletes the other four rows.

**D4 · Three layers hold the same knobs.** `PUT /api/admin/tournament/plan` (editable, pre-activation),
`tournament.*` (frozen at activation, read at `schedule.ts:685/692/855`), `tournament_stage.*` (editable per
stage). Each has a defensible reason — the plan is a draft, `knockoutPairing` is *"the pairing frozen at
activation, not whatever the plan says now"* (`:691`), the stage row is the lever ADR-245 exists to give the
desk — The layering itself is disciplined: the plan row is a **preview-only** read (`plannedKnobs`,
`lib/tournament/bracket.ts:64-70`, behind `status: 'planned'`), and activation freezes into `tournament` on
purpose — *"the pairing frozen at activation, not whatever the plan says now"* (`schedule.ts:691`). What the
`??` costs is narrower and still real: `promote_count` is `NOT NULL DEFAULT 0`, so the fallback fires exactly
when the rows are absent — and a stage row created without it means **promote nobody** while the tournament
says two. The fallback hides the default; M1 removes the fallback.

**D5 · Two award ledgers, shaped by different constraints.** Participants live in `score_adjustment`:
`activity_id NOT NULL REFERENCES fringe_activity`, `reason NOT NULL 1–200`, `batch_id` nullable where
NULL *means* "posted at the desk". Teams live in `team_award`: `batch_id NOT NULL`, no activity, a
`roster_snapshot jsonb NOT NULL`, and **no desk route at all** (`grep -rn team_score_adjustment apps packages`
→ nothing; the only way to hand a team points is to post a batch, even a batch of one). Two consequences, both
concrete:

- To award a *person* a tournament prize, the request must name a **fringe activity id** — the ledger's NOT NULL
  FK has leaked into the tournament's API contract. The code even records the reason it could not be fixed in
  place: *"`score_adjustment.reason` is NOT NULL and the additive section may not relax a column"*
  (`db/entities/awards.ts:171-175`).
- The board must express "is this award live" **twice**, differently: `WHERE NOT ab.is_reversed` for the team
  arm (`leaderboard.ts:149`) and `WHERE a.batch_id IS NULL OR NOT ab.is_reversed` for the participant arm
  (`:178`), with an in-line comment arguing that the two spellings of nothing "read differently here even
  though they agree everywhere". They agree. They should be one thing.

Note what is *right* here: `roster_snapshot` is not an optimisation, it is evidence — membership drifts during
a day, so "who shared this team's +30" must be frozen (the same rule ADR-005 applies to match rosters). Keep it.

**D6 · Four ways to freeze a fact.** `fringe_scan`'s five scalar `*_snapshot` columns;
`tournament_match.points_awarded_snapshot jsonb` (plus two roster jsonbs); `team_award.roster_snapshot jsonb`;
`tournament.champion_points_snapshot integer`. All legitimate, none sharing a convention beyond the suffix — and
`jsonb` in particular means the *shape* of what was frozen is a property of no schema at all.

**D7 · Five shapes of "a human decided".** `is_voided` **plus** `undone_at` (scan — `undoScanAtStation` sets both in
one statement, `scans.ts:242`, and that is the good case: one state, one annotation for who shaped it); `is_voided` +
`last_edited_at/by` + `edit_reason` (match); `is_reversed` + `reversed_at/by`
+ `reversed_reason` (batch); `closed_at/by` + `close_reason` (stage); `void_audit_entry` with
`target_type IN ('fringescan','tournamentmatch','swagclaim','awardbatch')`, `action IN ('void','unvoid')`, and
its own reason. The *state* is on the row (correct — readers filter on it); the *sentence* is on the row **and**
in the audit, in four different column namings, with three different length rules.

## 3. The plan: five moves, in order, each one a deletion

> Harmony here is not uniformity. It is **one authority per question, one direction per edge, one shape per
> kind of fact** — and the overlay keeps the right to be absent.

**M1 · Retire the no-rows mode.** Additive tail: for every `tournament` with no stage rows, insert the rows
`insertStagesForActivation`/`createStagesForTournament` would have seeded (the function already exists; a
backfill is that call, run once, per legacy tournament, inside a transaction with the tournament's own numbers).
Then delete, in the same stage: `StageIndex.hasRows`, `if (!index.hasRows) …`,
`stage?.promoteCount ?? tournament.advanceCount`, `resolveStage`'s null-for-a-legacy-day meaning (a null after the backfill can then only mean *"a
kind this day does not play"* — `insertStagesForActivation` skips the knockout row when
`advance_count < 2` and the third-place row when it is not armed, which is a legitimate answer rather than
a compatibility mode), the "null is the legacy shape of every question" comment, and and the legacy-day test — replaced by **one migration test** asserting
that after boot, no tournament exists with zero stage rows, and that every seeded day's totals are unchanged.
*Adds ~15 lines of migration; deletes the top row of D3's table and three of its four others.* Risk: a day
whose rows are deliberately absent (none is — the mode is a compatibility artifact, not a feature). This is the
move to do first: everything else in this plan is easier afterwards, and nothing else needs it.

**M2 · One writer for the clock.** Keep both `tournament.status` and `is_current` (the contract and the views
need the former; the desk's levers need the latter). Remove the *duplication of writers*: one function,
`markPhase(tx, { tournament, stage, status, actorId, reason })`, that flips both in the same statement, called
from activate, close, and complete. Then `closingGroupStage`'s reconciliation is unnecessary and goes, which is
worth the move on its own: it is the code that exists only because the clocks can disagree.
*Deletes: the four `.set({ status:` sites in `schedule.ts` (:133, :402, :747, :792), `closingGroupStage`, and
D1's whole hazard.*

**M3 · Name the edge that already exists.** No schema change: `fixture.match_id UNIQUE` is already the single
direction, and the overlay pointing at the core is the correct direction for this frame. Give the core the one
field it is missing to answer its own most-asked question — expose it:
`matchView.isScheduled = (SELECT 1 FROM tournament_fixture WHERE match_id = match.id)`, or better, put
`fixture_id` on `MatchRecord`'s select and let `stage`/`group_code`/`round_number` follow *through the edge*
for the views that want them. That closes the frontend's F10 for one field, and it makes "was this match on the
schedule" a fact rather than a recomputation — which is what the *adjudication* pages (`drawAfterAdjudication`)
also keep needing.
*Adds: one column on a view and one join. Deletes: `isPairScheduled` on the client, D2's temptation to add a
second edge.*

**M4 · Make the two ledgers one shape.** Four sub-steps, all subtractive:
1. `ALTER TABLE score_adjustment ALTER COLUMN activity_id DROP NULL` — the tail already relaxes DDL (this
   stage's own precedent is the `DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT` pair for the forward FK), so
   "the additive section may not relax a column" is a convention, not a law. `activity_id IS NULL` then means
   *a day award rather than a station award*, exactly parallel to `batch_id IS NULL` meaning *posted at the
   desk*. Delete `activityId`/`activityNameSnapshot` from the award-batch participant rows.
2. One predicate for liveness, defined once: `awardIsLive(batchId)` as a shared `SQL` fragment (or a
   `v_live_award` view over both tables) used by the team arm and the participant arm. Deletes the two
   spellings and the comment arguing about them.
3. `reason` — keep it NOT NULL on both ledgers (it is the point of both), and *drop* `award_batch.reason`'s
   copy into each row: with the batch joined for `is_reversed` anyway, the header's reason is one join away.
   That deletes 64 duplicate sentences per batch and the code comment excusing them.
4. Give `team_award` the desk path by *widening nothing*: document `POST /award-batches` with one row as the
   team ledger's single-person route, and have the (future) dialog mint the key. If teams must support a
   batch-less row, add `batch_id uuid NULL` to `team_award` — which is what makes the two tables symmetric;
   decide in the ADR, and prefer the widened batch (no new NULL).
*Deletes: an API field, a duplicated reason, one divergent predicate.*

**M5 · Two conventions, written down, then enforced.** Not a refactor — a rule and a checker:
- **Freeze:** a `*_snapshot` column exists only where the referenced value can drift, it is named
  `<fact>_snapshot`, and a jsonb is allowed **only** for a set (`points_awarded_snapshot`, `roster_snapshot`) —
  never for a scalar. `champion_points_snapshot` is the one oddity: it is a *scalar* frozen in a column on the
tournament, whose real purpose is "the bonus as it stood when the day ended" — it stays, and it earns the treatment
`agenda_item.starts_at`
  got: a rationale comment at the column, so the next reader does not "tidy" it away.
- **Decide:** the row keeps the **flag**; the audit keeps the **sentence**. `void_audit_entry` becomes the single
  home of reasons for void/unvoid/force-close/reversal; `edit_reason` stays (it is a *receipt for the export*,
  not a decision), and `reversed_reason`/`close_reason` become reads from the ledger rather than columns. This
  is the move most likely to end as "documented, not built" — say so in the ADR rather than doing it halfway.

**Keep as is, deliberately:** `roster_snapshot` (evidence), `fixture.stage` as the behaviour switch (D2),
`fringe_scan`'s scalars (the station must be readable with the activity deleted), `tournament_entry` (one table
for "who is in the draw", and `team` carries no `tournament_id` at all — this part of the schema is already
harmonised, which is worth saying out loud).

## 4. What this document recommends against

1. **`tournament_fixture.stage_id` FK, or a `match.stage_id`.** It would create a second authority for a fact
   the text column is *already* the switch for, and it would have to be back-filled, guarded and kept in step —
   precisely the class of thing D1 is. The key `(tournament_id, kind, round_number)` is a design decision with a
   written reason; leave it.
2. **Schedule columns on `tournament_match`** (`round_number`, `group_code`, `court_slot_id`, and a
   `court_slot` table). `grep court_slot` over the schema → nothing, and that absence is the best architectural
   fact in this document: the built design put the plan on the fixture and left the match alone. Any surviving
   prose proposing the columns should be corrected — harmonising *toward a stale doc* is the one way to make
   this worse.
3. **A polymorphic `award(subject_kind, subject_id)`.** The house has already decided this once, twice:
   `swag_claim`'s "polymorphic `participant_id`/`team_id` nullable columns would let a row point at two things"
   is rejected for *facts*, and polymorphism is accepted for *decisions* (`void_audit_entry.target_type`). A
   ledger is a fact. Keep two tables with one shape (M4) rather than one table with a kind column.
4. **Unifying `undo` with `void`.** They already share the `is_voided` flag, and should: what differs is the
   actor and the window — the station within 10 s, the desk at any time, which is the distinction `undone_at`
   records. Collapsing the two routes would need the audit to carry the actor's role, a bigger idea than this plan.
5. **A generic `decision`/`stamp` table** replacing the per-row flags. Readers filter on those flags in the
   board's hot CTEs; a join to a polymorphic ledger for `is_voided` would trade a naming inconsistency for a
   query that has to reach across four tables to say "not this one". The flags stay (the flags are the *state*).

## 5. Order, cost, and how we know

| Move | Ships as | Adds | Deletes | Touches | Risk |
|---|---|---|---|---|---|
| M1 rows-total | 1 stage | migration + 1 test | 4 branches, 2 comments, 1 test | `stages.ts`, `schedule.ts`, `schema.sql` tail | low — behaviour-preserving by construction |
| M2 one clock writer | 1 stage | `markPhase` | 3 writer sites, `closingGroupStage` | `schedule.ts`, `stages.ts` | low |
| M3 the edge as a field | 1 stage | 1 view field | client-side `isPairScheduled` | `views/`, one CTE, `CourtPage` | trivial |
| M4 ledgers one shape | 1–2 stages | `DROP NOT NULL`, one fragment | 2 API fields, 1 duplicated reason, 1 divergent predicate | `awards.ts`, `adjustments.ts`, `leaderboard.ts`, contracts | medium — it edits a request contract |
| M5 conventions | docs + 1 rule | 2 ADR paragraphs, 1 checker rule | 2 reason columns (maybe) | `scripts/check-standards.mjs` | low, and it is the only thing that *keeps* the gains |

Progress is measurable without a opinion: count the things that should go to a small number. Today: **5**
two-mode branches (D3), **5** writers of the day's phase across **2** files, **2** spellings of "this award is
live", **2** homes for a decision sentence, **4** freeze mechanisms, **1** edge between the core and the
overlay (already right). After M1–M4: **0, 1, 1, 1, 1 (+2 named and justified), 1.** That is the whole
definition of "harmonised" this document offers, and each count is checkable by grep in a minute — which is
also why M5 belongs in the standards checker rather than in a review comment: this repo already proves a rule
that cannot see a case reads as green, not as absent.

One last simplicity note, aimed at the order of work rather than the schema: M1 makes D3's table empty, M2 makes
D1 a non-question, and M4 makes D5's asymmetry into one shape. **D2 and D4 do not need code at all** — they need
one sentence in `AGENTS-database.md` saying which layer answers which question, and a drift check that a
`PUT /tournament/plan` after activation is refused by name. Writing the sentence is cheaper than the migration,
and it is the part a future enhancement stage will actually read.
