# Harmonisation work orders: the six moves, spelled out for review

Companion to `tournament-backend-harmony.md`. That document makes the argument; this one says what I would
actually type, in what order, and what I would delete — so the plan can be reviewed line by line instead of
in principle. Nothing here is built yet. §1 is your answer sheet: twelve rulings, four of which delete more than they
add, and two questions left. §9 is what reading the code has changed about the plan — nine things now, six of which
reverse my own recommendations, three of which reverse a ruling of mine that had already been written down.

Each order has the same shape: **Read** (the code that decides the shape of the work), **Do** (the edits),
**Delete** (the subtraction, which is the point), **Tests**, **Risk and rollback**, **Decide** (if it needs
you), **Done when**.

**Read `tournament-schema-tobe.md` first if the data shape is what you want to argue about.** This document is the
code's side of the same plan; that one is the tables' side, and it settles F-2 with an answer neither draft had: the
promotion number goes, and an advancement record arrives. That turns M1 into a seeding move (D-1), turns M7 from a
configuration screen into the core's missing act, and turns M4 into one step instead of five (D-2). Four of the moves
below touch no DDL at all, which is the point of the frame: prices per round, per round labels and per-round closes
are all already rows.

Conventions: file paths are relative to the repo root; line numbers are `HEAD = a4b…` (the harmony doc's
commit) and will drift as the moves land; every "Delete" claim is a grep the reviewer can run in a minute.

---

## 1. Your twelve answers, and the two rulings this plan still needs

Every question from the first cut is answered, and four of the answers make the plan *smaller* rather than adding to
it. Recorded here in your words, because what each one deletes is the part a reviewer needs to see:

| # | the ruling | what it does to these moves |
|---|---|---|
| **D-1** | *"for stage rows we also include into the thin initial seed sql file"* | M1 is now a seeding move, not a defensive one. `seed-default.sql` gains the day's stage rows in its own guarded idiom; the `hasRows` fallback and its test go; **no advice line, no error path, no backfill**. It drags one consequence with it, which is D-13 below. |
| **D-2 / D-3** | *"out of scope … we don't track prizes"* | M4 loses three of its five steps: the `activity_id` relaxation, the `batch_id` relaxation, and the attributability CHECK. What survives is step 1 (one liveness predicate for both ledgers) and step 5 (the checker's view of them) — the parts that are about *points*. `score_adjustment.activity_id` stays `NOT NULL`, and F-5 is recorded as a finding the owner has closed rather than one the code must fix. |
| **D-4** | *"What is markPhase? we seem to have a mixture of references to `stage` and `phase`"* | Harmonised in §0 of the schema doc: a **stage** is a row, a **kind** is a fixture's slice of the day, the **status** is where the day has got to, and to **advance** is to survive a stage. `markPhase` is now `markDayStatus`, because that is the column it writes. `phase` survives nowhere in either doc except the title of `tournament-phases-assessment.md`, and that document's §1 item 7 is the record of why `stage` won: *"the owner's own word for this was `stage`, not phase"*. Costs no DDL. |
| **D-5** | *"explain what this value is for?"* | Explained in M2's Read and in §9.6. And the honest confession: the question was worth less than it looked, because `claimScope` reads `findCurrentStage`, which M2 deletes anyway — so what M2 has to decide about it is one line, not a policy. |
| **D-6** | *"Rules, and each proven by sabotage"* | Unchanged; M5 grows one rule (below) and M7's writer is covered by the same shape. |
| **D-7** | *"instead of automatically we can present this as a dialogue `Yes / No`"* | M7 step 4 becomes a prompt rather than a consequence: `payPromotionBonus` on the close request, defaulted from `promotion_points IS NOT NULL`, Yes posting through `createAwardBatch` and No posting nothing and leaving no row. The column's own comment (`schema.sql:785-787`) says a NULL bonus is the feature OFF *"so an organiser turns it on deliberately rather than finding it in the standings"* — so your answer is the shipped intent, and my recommendation was the deviation. |
| **D-8** | *"What is an opposite role?"* | The `score_adjustment` idiom: the ledger is append-only, so a wrong +25 is corrected by posting a −25 beside it, each with its own `reason`, and the trail keeps both — the entity states the rule outright: *"Append-only by design. There is no void and no edit: an adjustment entered in error is answered with an equal and opposite one"* (`db/entities/adjustments.ts:12-14`), which is only possible because `points` is signed and never zero (`schema.sql:373-375`). Chosen for adjustments, not for advancements. So the void triple stands, and your no-enforcement ruling makes it the safer choice as well as the clearer one — a row that refuses to be deleted is not a row that refuses a human. |
| **D-9** | *"Both sides stay"* | M6 keeps the plan as a declaration and activation as an act with its own body; what still collapses is the *defaults*, and the seeded row (M1) is what they collapse into. One shared `tournamentShapeSchema` validates all three bodies. `plannedKnobs`'s five `??` and the console's `DEFAULT_KNOBS` are deleted. |
| **D-10** | *"Yes"* | The desk may advance anyone, with no sentence required. M7 step 2 loses its `reason` requirement; `close_reason` becomes optional per D-14; `table_rank` NULL stays the record that a human, not a table, decided. |
| **D-11** | *"Give me an example"* | Given in M7's new §8.1, and the question is **withdrawn** by it: the example works today, and the only reason to forbid it was to keep `ordinal` usable as a "deeper" comparator — a meaning its own comment at `:781-783` disclaims ("Display order only"). Nothing in the plan compares two ordinals any more, so there is no rule to validate, which is just as well under D-6's manual ruling. |
| **D-12** | *"Yes, will it cause issues?"* | Yes, four of them, none structural, all listed as M7's step 5. And the answer to "since manual mode has no rules": none of the four is a rule about the day; they are a 500 that must become a 409, an ordinal that must be chosen rather than assumed, a row that must be stamped rather than deleted, and a wire change that a row cannot make. |

Two rulings left, and the first is a consequence of your own answer rather than a new direction:

| # | question | my recommendation | the alternative |
|---|---|---|---|
| **D-13** | Seeding the stage rows needs a day row to point at (`tournament_stage.tournament_id` is `NOT NULL REFERENCES tournament (id)`, `schema.sql:772`, and the day is a singleton by index, `:647`). So: does the thin seed file gain **the day itself**, making `POST /activate` the act that *starts* a day rather than the act that creates one? | Yes — see M1's step 1 and the schema doc's §3c for the shape: `'planned'` added to the status CHECK (already the word the wire uses for it, `wire.ts:943`), `activated_at`/`activated_by_superadmin_id` relaxed to nullable with a CHECK binding them to `status`, `insertStagesForActivation` deleted, and one view field (`TournamentView.activatedAt`, `wire.ts:166`) widened to `string \| null`. It is the only reading of D-1 that makes "a day with no stage rows" *impossible*, which is what a no-enforcement mode wants. | The seed file stays accounts-only, activation keeps inserting the day and its rows, and M1 shrinks to deleting the `hasRows` fallback plus its test. Every day the *app* starts still has rows, so nothing is broken — but a database can then hold a day with no rows through no fault of the operator, and the plan has no story about it beyond "it does not happen in practice". |
| **D-14** | In manual mode, does a forced close still require `reason` (ADR-247's "never blocked, but say why")? | Offered, not required. The gate was written for a scheduled day, where the close is a step in a plan; under *"the manual changes reign supreme"* the sentence belongs in the dialogue the desk sees — pre-filled when the list differs from the table's proposal — and is never the thing that stops the act. Mechanically: `schemas.ts:969`'s `reason` loses its `.refine`, and the column already permits NULL (`:805`). | ADR-247 stays in every mode. It is the one gate this plan was not asked to remove, and its cost is a `close_reason` that only the audit trail reads, plus a desk that learns to type "as discussed" — which is how the forty-first sentence stops being read. |

---

## 2. M1 · Seed the day's stages, and the no-rows mode has nothing left to be

**Read.** `apps/api/src/db/bootstrap.ts:8-19` states the method, and the file the owner pointed at is the one it
describes as the place for this kind of fact:

> ADR-102 — the data story is THREE tiers, three SQL files, strictly separated: 1. `schema.sql` — DDL only.
> Tables, indexes, constraints. **Never a row.** … 2. `seed-default.sql` — what every install starts with: the
> initial superadmin and the named facilitator accounts …

and `seed-default.sql`'s own header supplies the discipline that makes it safe to put a day in there:

> Account ids are FIXED, on purpose … Every statement is guarded, so re-running on every boot is safe
> (ADR-049's idempotency rule).

So the fix for "a day with no stage rows" is neither a fallback (the current, silent answer) nor a refusal (the
answer D-6's manual ruling forbids) nor an advice line — a previous draft of this document cited one,
`db/provision.ts`'s `missingStageRowsAdvice`, **and that function does not exist**, which §9.7 records as the reason
this move was rewritten. It is a row, in the file whose whole job is what every install starts with.

**Do.**
1. **The seed, if D-13 is yes.** The block is in the schema doc's §3c: the day (`'planned'`, fixed uuid,
   `WHERE NOT EXISTS`) and its three stage rows, in the file's guarded style. Activation then stamps that row
   instead of creating it (`activated_at`, `activated_by_superadmin_id`, `status`), `insertStagesForActivation`
   (`stages.ts:97-124`) is deleted, and `tournamentAlreadyActive` becomes "already started". The tail gains the
   widening the schema doc draws: one status value, two `DROP NOT NULL`s, one binding CHECK.
   If D-13 is no, this step is skipped and step 2 is all of M1.
2. `db/entities/stages.ts:39-43` — `StageIndex` loses `hasRows`; `readStages` (`:126-133`) returns `{ rows }`; the
   test helper at `tests/tournament-stages.test.ts:69` that builds an index by hand goes with it.
3. `stages.ts:145-149` — `feedsStandings` becomes one line, `return resolveStage(index, key)?.paysStandings === true;`
   deleting `if (!index.hasRows) return key.stage === 'group';`. With the rows seeded this branch is not a fallback,
   it is a second opinion about a day that has already told you what it pays.
4. `stages.ts:135-143` — `resolveStage` keeps its `null`, and its meaning is written down once: **a kind this day does
   not play** (`insertStagesForActivation` today creates one, two or three rows: `advanceCount < 2` skips the
   knockout, `!hasThirdPlace` skips third place). `null` is a real answer, not a compatibility hole.
5. `db/entities/schedule.ts:685` — the `stage?.promoteCount ?? tournament.advanceCount` line loses its `??` by way of
   step 6, not by re-homing it. Recording why the fallback was dead: `insertStageRow` (`stages.ts:60-85`) takes a
   `promoteCount` and the seeder sets it on both rows a close can ever reach (`:100-116`), leaving `DEFAULT 0` on
   `third_place`, which no close looks up. So the hazard was latent, and it is deleted rather than defended.
6. **`tournament_stage.promote_count` is deleted outright** (schema doc F-2): the seeder stops copying the day's
   number into the pool row (`:105`), `insertStageRow` loses its `promoteCount` parameter (`:52`, `:75`), and
   `closeGroupStage` reads the list the desk wrote (M7) instead of a count it computes. What survives of step 5 is
   its first half: the close's own guard asks the pool row **by kind**, and `tournament.advance_count`
   (`schema.sql:630`) keeps the one job it can honestly do — the number the day was drawn with, offered to
   `rankQualifiers` as a proposal and printed on the hall screen as an intent. Under manual mode, which is the core,
   "how many survived" is the number of advancement rows, and there is no column to disagree with it.

**Delete.** `hasRows` (1 field, 1 branch), 1 `??` in `closeGroupStage`, `promote_count` (table, mirror
`db/schema/tournament.ts:134`, seeder), 3 comments that describe two-mode behaviour (`stages.ts:22-28`,
`schedule.ts:630-633`, `stages.ts:309` "A null stage is the legacy pool"), and two tests that pin the mode:
`tests/tournament-stages.test.ts:83` (rewritten to assert *no row means no table*) and `:314` (deleted, with its
`if (!row) throw new Error('this day has no stage rows')` helper at `:169`).

**Tests.** Keep `:218` (seeding shape — under D-13 it asserts the *seeded* shape instead of the activated one, which
is the better test because it reads the file a reviewer can read), `:232`, `:245`, `:264`, `:288`. Add one: a boot on
a fresh database leaves the day with exactly three stage rows *before* activation (D-13 yes) or with no day at all
(D-13 no) — one test, written against whichever answer you give, and it is the assertion that makes M1's whole claim
checkable rather than arguable.

**Risk and rollback.** Lower than the version it replaces, and for one reason: there is no runtime branch left to
get wrong. The risk that remains is a managed database (`'verified'`, `bootstrap.ts:44-47`, ADR-178) holding a live
day whose rows predate the seed — and under D-13 the answer to that is not a code path but `./dev-reset.sh`, the
sanctioned remedy for a pre-production repo (ADR-102), or the one-off `INSERT` an operator can copy out of
`seed-default.sql`. Rollback is one commit plus, for D-13, the tail's own re-add (`ADD COLUMN … NOT NULL DEFAULT
false` shape) — the *definition* above loses nothing that the tail cannot re-widen, which is what the tail is for.

**Size:** S. **Ships alone:** yes, first. **Unblocks:** M2, whose premise is that the day's status has no
"no rows" state to reconcile, and M6, which reads the seeded defaults instead of declaring its own.

**Done when:** `grep -rn "hasRows" apps/api/src` is empty; `grep -rn "legacy" apps/api/src/db/entities/stages.ts` is
empty; `grep -c "INSERT INTO tournament_stage" apps/api/src/db/seed-default.sql` is 1 (D-13 yes) or 0 (no), and
`./verify.sh` is green with the API coverage floors moved, because a branch died.

---

## 3. M2 · One clock: the day's status, written by one function

**Read.** The day's status is stored twice — `tournament.status`, and `tournament_stage.is_current`, "which row the
day is on". I recommended keeping both; counting the readers says otherwise, so this section replaces that
recommendation. Here is the whole census.

| value | written | read |
|---|---|---|
| `tournament.status` | 4 sites in `schedule.ts`: `:133` activate, `:402` complete (with the champion freeze), `:747` → `knockout`, `:792` complete-without-bracket | `lib/operations.ts:128` (admissions), `routes-superadmin/corrections.ts:284` (bracket frozen), `schedule.ts:918` (the completed picture), `tournamentView` (`views/tournament.ts:77-88`) → the desk UI |
| `tournament_stage.is_current` | mirror `db/schema/tournament.ts:141`; seed default `stages.ts:80` and the pool row's `isCurrent: true` at `:108`; `closeStageRow:203`, `openNextStageRow:244`; DDL `schema.sql:801`, `CHECK` `:814`, `ux_tournament_stage_one_open` `:827` | **one predicate, two callers.** The predicate is `findCurrentStage`'s WHERE (`stages.ts:177-188`, flag at `:185`). Its callers are `schedule.ts:332` (`claimScope` — which kind is the day playing) and `:638` (`closingGroupStage` — is the pool still the day's stage). No view returns it; `apps/web` never mentions it. |

Both readers ask a question `status` already answers, and the flag is the *coarser* of the two: seeding makes the
pool row current, closing the pool moves the flag to the knockout row, and it never moves again —
`insertStagesForActivation` (`stages.ts:97-124`) makes no current row for `third_place` (the module comment says so
outright: *"no stage row is ever current for it"*), and nothing closes the knockout row when the final finishes. So
the mapping is total:

* `status = 'group_stage'` ⇔ the pool row is current;
* `status = 'knockout'` ⇔ the knockout row is current;
* `status = 'completed'` ⇔ still the knockout row, because nobody moved it.

The stored flag is a projection of `status` with a second writer, in a second file, guarded by its own index. That
is the argument for deleting it — not "two columns is inelegant", but "one of them cannot say anything the other
cannot, and the one that can is the one clients already read". The module knows the division it has set up, and names
it: `findStageById`'s comment (`stages.ts:248-252`) reads *"A route that acts **on a stage** takes the id from the
path …; `findCurrentStage` is for a route that acts **on the day**, which must not be able to reach into a finished
stage by guessing an id. The two differ in what they refuse, not in how."* After the collapse the day-level route
refuses the same thing for a cheaper reason: there is no id to guess, and no pointer to guess past.

**Do.**
1. `claimScope` (`schedule.ts:329-336`) — derive the live kinds from `tournament.status`:
   `group_stage → ['group']`; `knockout | completed → ['knockout','third_place']` (D-5). The `if (!tournament)`
   guard stays; the row fallback goes with M1.
2. `closingGroupStage` (`:630-640`) — the lookup becomes one equality: `tournament.status !== 'group_stage' → null`.
   One question instead of two, and its comment loses the "activated before ADR-245" clause M1 makes unreachable.
3. `closeStageRow` (`stages.ts:196-219`) — drop `isCurrent: false` from the `.set()` (`:203`) and the flag conjunct
   from the guard (`:213`), leaving `WHERE id = ${stageId} AND closed_at IS NULL`. The close is *already* one UPDATE —
   its comment (`:191-194`) is what argues that a guard in the WHERE is the race-safe shape — so this step changes no
   statement count, only which column arbitrates: `closed_at`, alone, the same primitive
   `ux_tournament_match_live_court` (`schema.sql:337`) was argued on.
4. `openNextStageRow` (`stages.ts:226-246`) and `findCurrentStage` (`:177-188`) — deleted, and this is where the
   statements come back: handing the flag on is a SELECT for the next unclosed row (`:230-240`) plus an UPDATE to set
   it (`:242-245`), two statements per close that exist only to maintain a projection.
   `transitionOutOfPoolStage`
   (`schedule.ts:811`) is renamed `markDayStatus` and shrinks to: guard-close the pool row, then `UPDATE tournaments SET
   status`. It is still the single writer M2 was always about, now writing **one** value instead of two, and no
   longer obliged to order its writes around a unique index.
5. `insertStagesForActivation` — stop setting `isCurrent: true` (`:80`, `:108`); the column leaves the Drizzle
   mirror. The DDL stays where it is: fresh databases never get it, existing ones keep a `boolean NOT NULL DEFAULT
   false` nothing reads, its `CHECK (is_current = false OR closed_at IS NULL)` and `ux_tournament_stage_one_open`
   go vacuous, and Postgres drops the index by itself if the column is ever physically removed. Removing it
   physically is `./dev-reset.sh`'s job, not a migration's (ADR-102). One caution, recorded because the schema file
   warns about it in its own voice: that `CHECK`'s comment (`schema.sql:809-813`) documents a *different* collapse
   that failed — deriving the flag as `closed_at IS NULL` — which "the world-cup tests rejected on the first
   activation: an unstarted stage is not a closed one". It does not recur here, because "waiting **or** current"
   stops being a question the row answers once the day answers it. `closed_at`, `closed_by_superadmin_id` and
   `close_reason` stay: a stage's history, not the day's status.
6. `markDayStatus` keeps everything else M2 always said: the single writer, and `status: 'completed'` moving in with
   `championPointsSnapshot` and the ADR-136 invalidation argument attached (`schedule.ts:400-402`). What it drops is
   the sentence requirement — **D-14**, and D-10 before it: in manual mode `reason` is offered at the route and not
   demanded of it, which is one `.refine` on `schemas.ts:969` and no change to the column (`close_reason` already
   allows NULL, `schema.sql:805`). The scheduled modes keep ADR-247 exactly as written, so the rule is a property of
   a mode and not of the close: *offer and record in manual mode; gate where the day is a plan being executed*.
   One more half-sentence this move must not lose: the name is `markDayStatus` because the column it owns is
   `tournament.status`. An earlier draft called it `markPhase`, and D-4 retired the word — the *only* cost of that
   ruling is this rename, since the shipped schema already says `status` in the DDL and `stage` in the row table.

**Delete.** The flag from the mirror; `findCurrentStage`; `openNextStageRow`; 1 of the 2 UPDATEs per close;
`closingGroupStage`; the `?? 'no bracket to draw'` at `:798` (with no next row to search for, the case that invented
it cannot arise); 1 partial unique index and 1 `CHECK` for new databases; `tournament-stages.test.ts:232` (refuses a
second open stage — by index, on a flag that is gone) with `:264` rewritten to assert that the *one* clock moved and
that a second close stamps nothing; and 11 `is_current`/`isCurrent` references across `tournament-stages.test.ts`
and `tournament-stage-pairing.test.ts` where fixtures set the flag to stage a day — those tests set the day's status
instead, which is the better test: it says what the desk *did*.

**Tests.** `:245` (scope narrowing) and `:288` (`pays_standings` without replaying a result) stay green
**unchanged**; they are the proof that deriving behaves like pointing. `:218` (the seeding shape) loses one column.
Add two: a close run twice on the same pool row stamps once and moves the status once — the race test moves from the
flag to `closed_at`, where it always belonged; and a *per-round* close (M7's numbered row) stamps its row and leaves
`status` alone, which is §4 item 3b of the schema doc made into a test.

**Risk and rollback.** Two edges, both small, both named.
* A **numbered** row is the only state where the flag could carry more than `status` — "round 3 is the day's row
  while the knockout is still the day's stage". Nothing can build it: no route creates stage rows, and the seeder
  creates only kind-wide ones (`round_number = NULL`). So the collapse is safe as the tree stands and wrong on a
  future day that adds per-round rows. That belongs as a sentence in `AGENTS-database.md` — *"a stage row does not
  carry the day's status; the close of one row never moves it, and a day that wants a status per round invents a row
  for it"* — not as a guard in code. M7's numbered rows make this live the moment they exist, which is why the
  sentence is written in this move and not in that one.
* A stale database whose `tournaments.status` had drifted from its rows now has no flag to fall back on, so it says
  so where it used to fail quietly. The remedy is M1's seed (or `./dev-reset.sh`), not an advice line: an earlier
  draft of this document sent the reader to `missingStageRowsAdvice`, a function that does not exist in this repo
  and was never going to be the answer — see §9.7.

Rollback is one commit: the mirror line returns with it, and no DDL was ever executed.

**Size:** S, and smaller than the version it replaces. **Ships alone:** yes, after M1.

**Done when:** `grep -rn "is_current\|isCurrent" apps/api/src/db` is empty;
`grep -rn "findCurrentStage\|openNextStageRow" apps/api/src` is empty;
`grep -rn "\.set({ status:" apps/api/src/db/entities/schedule.ts` hits only inside `markDayStatus`; `./verify.sh` green,
with the coverage floors moving because a branch and an index died.

**Decide:** nothing left — D-4 is answered (`tournament.status` owns it, the flag is deleted) and D-5 dissolves with
`claimScope` explained in §9.6. D-14's `reason` change lands in this move because this is where the close's route
validation lives.

## 4. M3 · Say out loud what the core already knows

**Read.** `fixture.match_id uuid UNIQUE REFERENCES tournament_match (id)` (`schema.sql`, in
`tournament_fixture`) is the only edge between the overlay and the core, and it is pointed the right way for
this frame. But nothing can *ask* the core: `matchView` (`views/tournament.ts:32-60`) publishes `stage`,
`isVoided`, `editReason` and three jsonb snapshots, and no fixture binding — which is why the console recomputes
the fact client-side from a cached schedule (`useCourtConsole.ts:87`, `isPairScheduled(schedule.pendingPairs,
teamAId, teamBId)`), and why the frontend hunt's F10 exists.

**Do.**
1. `db/entities/matches.ts` — the select that builds `MatchRecord` left-joins `tournamentFixtures` on
   `matchId`; add `fixtureId: string | null` to the record. `findFixtureOfMatch` keeps existing (corrections
   need the whole row) but stops being the only way anyone learns the answer.
2. `packages/contracts` — `MatchView` gains `fixtureId: string | null` and `isScheduled: boolean` (derived, not
   stored, so no second truth: `isScheduled = fixtureId !== null`).
3. `CourtPage.tsx` — the live panel (`:43-49`, where `court__stage` warns about a level knockout) gains the
   same sentence from the view, not from a cache; the pre-start note (`:148-155`) changes tense. It is a
   *suggestion*, and today it reads like a promise: "On the schedule — this match settles a fixture." becomes
   "Scheduled to be here — this pair has a pending fixture." and the fact arrives after the start.
4. `useCourtConsole.ts:87` — the live branch stops computing `isScheduledPair`; the picker's pre-start use
   stays (a suggestion needs a guess; an adjudication needs a fact).

**Delete** (in the app's behaviour, not its line count): the class of bug where the console says one thing and
`claimFixtureForMatch` quietly did another, because after M3 the console's *post*-start line cannot disagree with
the row.

**Tests.** `apps/api/src/tests/court-queue.test.ts` already owns the claim, including the comment about the
test that used to pick its friendly pair by "searching for a pair that happened to have no pending fixture
anywhere". Extend it: a claimed pair reports `isScheduled: true, fixtureId: <id>`; a friendly reports
`false, null`. One assertion each, through HTTP, in the file that already argues about this exact distinction.

**Risk.** Trivial — a read-only field, added to a view that already travels everywhere. The only judgement call
is copy (§1's D-list does not need it; the wording above is my proposal, edit it freely).

**Size:** S. **Ships alone:** yes, first if you want something live in the world quickly — it is the only move
here that changes what a participant and a marshal can see.

**Done when:** the hall screen's live match panel and the court console show the same scheduled/friendly fact
from the same field, and `grep -rn "isPairScheduled" apps/web/src` has one call site, not two.

---

## 5. M4 · Give the two ledgers the same shape

**Read.** Two tables do one job with different rules:

| | `score_adjustment` (people) | `team_award` (teams) |
|---|---|---|
| written by | the desk's Adjust-score panel **and** a batch | a batch only — `grep -rn team_score_adjustment apps packages` is empty |
| `batch_id` | nullable; NULL means "posted at the desk" | `NOT NULL` |
| attribution | `activity_id NOT NULL REFERENCES fringe_activity` | none (`stage_id` nullable) |
| liveness, in the board | `WHERE a.batch_id IS NULL OR NOT ab.is_reversed` (`leaderboard.ts:178`) | `WHERE NOT ab.is_reversed` (`:149`) |
| who shares it | the row is the person | `roster_snapshot` jsonb, exploded `CROSS JOIN LATERAL jsonb_array_elements` (`:145`) |

The symptom that makes this worth doing is not aesthetic. To award **one person** a tournament prize, the
request must name a fringe activity, and it must name one that exists:
`routes-superadmin/awards.ts:142-144` → `findActivityById`, else `notFound(messages.activityNotFound)`;
`packages/contracts/src/awards.ts:59` carries `activityId: z.string().uuid()`, and :56-58 explains that this is
deliberate:

> The participant ledger keeps its own shape rather than being relaxed for the batch: every row of it names the
> station the award belongs to, which is what makes its activity-name snapshot a snapshot of something.

And `db/entities/awards.ts:149-152` records the other half: the batch copies the header's sentence into all 64
rows because *"`score_adjustment.reason` is NOT NULL and the additive section may not relax a column."* (That
second clause is a claim about convention, and the tail's own `DROP CONSTRAINT` pair contradicts it — see
M4's step 2.)

So M4 **reopens a decision taken last stage** — and note that the code had already argued for itself:
*"Signed, so this subtracts as readily as it adds, and attributed to a station, which is why it lands in the fringe
column rather than a third one"* (`db/entities/leaderboard.ts:163-165`) is the same reasoning D-2 left standing, and
`adjustments.ts:23-24` already records where the liveness filter belongs (*"the readers that COUNT points are where
the filter goes"*), which is step 1 restated by the file it makes true.

I want that said plainly rather than smuggled in as an asymmetry-fix. The reopening argument: ADR-248's own text shows the
constraint was chosen for the ledger's
history, not for the tournament's needs; the consequence is that "Fair play award, +25, Priya" is *unpostable*
on a day whose organisers never configured a tug-of-war. The counter-argument, which is real: the board currently
shows one Fringe column and one Tournament column, and every person-award is attributed to a station, so a NULL
activity row has no home. **D-2 answered that, and the answer is no**: *"we don't track prizes"* — the reopened
decision stays closed, and the asymmetry is left exactly where ADR-248 put it, with a comment saying why.

**Do, in five steps that each ship alone — of which one is what this move now is, one was always independent of
the prize question, and three are withdrawn.** They are kept below in the order they were written and marked rather
than deleted, because the argument in the withdrawn steps is the argument somebody will ask for the next time the
question comes up.
1. **One liveness predicate.** A shared fragment (or `v_live_award` view) in `db/entities/awards.ts`, used by
   both CTE arms. No DDL. Deletes two spellings of the same rule *and* the comment at `leaderboard.ts:175-177`
   which argues about them reading differently "even though they agree everywhere". This step alone is pure
   subtraction and touches no contract; I would do it even if D-2 is refused.
   *Withdrawn by D-2 (steps 2, 3 and 4): with no prize to attribute, there is no unpostable award, and the ledger's
   NOT NULL columns keep the shape their own comments argue for.*

2. **`team_award.batch_id` → nullable**, meaning exactly what its twin means: NULL = a correction posted at the
   desk. Pure DDL relaxation in the additive tail (`ALTER TABLE … ALTER COLUMN … DROP NOT NULL`), and the tail
   already relaxes DDL — this stage's own `DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT` pair for the forward FK
   is the precedent. This is what makes "a one-off team award" a *row* rather than a *ceremony*: the batch route
   still works (`teams: [one row]`), but the ledger no longer requires a header that nobody intends to reverse.
3. **`score_adjustment.activity_id` → nullable**, NULL meaning "the day awarded this", not "a station awarded
   this". Then the board's attribution follows the fact: split `adjustment_points` into the station rows
   (`activity_id IS NOT NULL`, still summed into `fringe_points` at `leaderboard.ts:191-192`) and the day rows
   (`activity_id IS NULL`, summed into `tournament_points` beside `team_award_points`). **This is D-2/D-3.** The
   total for a person does not change; the column it appears under does.
4. **The API stops lying about what it needs.** `activityId` becomes optional in the batch's participant row,
   `activityNameSnapshot` is derived (from the activity when supplied, from `batch.label` when not), and
   `awards.ts:142-144` becomes *look it up if given* instead of *404 if missing*. Delete the sentence at
   `contracts/src/awards.ts:56-58` and replace it with the new rule and its reason.
5. **Stop calling a copy a duplicate.** `insertBatch` writes the header's reason into all 64 rows
   (`entities/awards.ts:171-176`). Keep the column NOT NULL (the ledger stays self-describing for the export) and
   instead have `awardBatchDetailView` show `batch.label` + the header's reason once, with rows marked as
   batch rows. One view change; no migration; the reader of the register gets the truth without the copy being
   *the* source.

**Delete.** one duplicated predicate and one comment arguing about spellings (`leaderboard.ts:175-177`). That is the
whole of it now, and it is still worth a move: two readings of "is this row live" is how a reversal comes to be counted
in one place and not in another.

**Tests.** `apps/api/src/tests/award-batches.test.ts` (17 of them) stays green untouched, which is the claim: the
board's numbers do not move when one predicate is shared. Add one, greppable rather than behavioural: both CTE arms
of `leaderboard.ts` reference the same fragment, so the next person cannot re-widen the difference between `:149` and
`:178` without the test noticing. The person-award-with-no-activity test this move used to promise is withdrawn with
D-2 — and it is worth recording that it *fails today*, because that is the fact that made the prize question worth
asking.

**Risk and rollback.** Low, and one step: it edits no contract, no column, and no meaning a reader can see — a shared
fragment either changes a number or the move is wrong. Rollback is one revert.
is a no-op for existing rows — nothing is destroyed, so `./dev-reset.sh` remains the escape and the columns can
be re-tightened by any later stage that finds a use for the freedom.

**Size:** M. **Ships alone:** steps 1, 2, 5 yes; 3+4 together (they are the same decision), after D-2.

**Done when:** `grep -c "NOT ab.is_reversed" apps/api/src/db/entities/leaderboard.ts` counts the shared
fragment once, and posting a tournament prize for one person works on a day with no fringe activities configured —
which is a sentence I can turn into a test and therefore into a fact.

---

## 6. M5 · Two conventions, then make the checker see them

**Read.** `scripts/check-standards.mjs` runs 18 rules over 601 files, and this stage already learned the hard
way what a rule that cannot see a case does: rule 11 (`checkSchemaSingleSource`) reported 0 violations while a
Drizzle mirror's last mapped column and an `ADD CONSTRAINT … FOREIGN KEY` at the foot of `schema.sql` were both
invisible to its parser. It was fixed by teaching the parser the third FK spelling — and *the fix was only
believed after breaking the tree on purpose and watching it bite.* M5 is the same discipline applied to the two
rules this harmonisation must not lose.

**Do.**
1. `AGENTS-database.md`, two paragraphs —
   * **Freeze:** a `*_snapshot` column exists only where the referenced value can drift. A jsonb is allowed only
     for a *set* (`points_awarded_snapshot`, `roster_snapshot`); scalars get scalar columns
     (`fringe_scan.activity_name_snapshot`, `tournament.champion_points_snapshot`). A snapshot earns a rationale
     comment at the column, the way `agenda_item.starts_at`'s NULL is defended in the file.
   * **Decide:** the row keeps the **flag** (readers filter on it), the audit keeps the **sentence**. Named,
     accepted exceptions: `close_reason` and `reversed_reason` stay on the row because the route formats its own
     refusal from them (`refusalForClose`), and `edit_reason` stays because it is the export's receipt.
2. One rule per convention, in the checker:
   * **R19 `SNAPSHOT_JUSTIFIED`** — every `*_snapshot` column in `schema.sql` must have a comment line between
     it and the nearest preceding blank line. Cheap, parseable, and it *cannot* pass silently on a new column,
     which is the failure mode that matters.
   * **R20 `ONE_PHASE_WRITER`** — two clauses, one per direction the same drift can take:
     `\.set\(\{[^}]*status: '(group_stage|knockout|completed)'` may appear only inside `markDayStatus` in
          `db/entities/schedule.ts`, **and** `is_current` may not appear in `db/entities/**` at all. The second clause is
     what stops the projection coming back a month later because a helper wanted to know which row to close. Two
   more clauses belong to M7: `tournaments.advanceCount` may be read in `db/entities/schedule.ts` only where it
   *seeds* the day and where it *proposes* to `rankQualifiers`, never to decide who advanced; and
   `tournament_stage_advancement` has exactly one writer function, which is what lets the two sentences the DDL cannot say
   across rows — "into a deeper stage", "a rank only from a stage that pays the standings" — live in one place
   instead of in every caller. A string-and-file allowlist rather than a SQL parse,
     deliberately: it must be hard to fool and trivial to read.
3. Prove both by sabotage, in the same session they land: add a snapshot column with no comment (expect R19),
   write a `status` update in `routes-superadmin/tournament.ts` (expect R20's first clause), re-add an
   `is_current` write in `stages.ts` (expect its second clause), revert.
4. Docs, not code — the part of the harmony the checker cannot see: `docs/design/tournament-phases-assessment.md`
   §14 gains "the no-rows mode is retired (D-1), one clock owns the phase, the ledgers are one shape";
   `docs/addenda/ADDENDA.md` + `AGENTS-decisions.md` gain ADR-249 (the M1/M2 decisions) and ADR-250 (M4, which
   supersedes the `contracts/src/awards.ts:56-58` position quoted above); and any prose still proposing
   `court_slot` or schedule columns on `tournament_match` gets a one-line correction citing that they were never
   built **and are now decided against** — the cheapest way to stop the next stage harmonising toward a stale
   document.

**Delete.** Nothing, which is why it is last and why it is not optional: M1–M4 are the harmony, M5 is the
harmony's *immune system*.

**Size:** S. **Ships alone:** yes, and it should land with M1 so that the first move is the one that gets a rule.

**Done when:** both rules fail on a broken tree and pass on the real one, and the sabotage is recorded in the
commit message — because a checker rule nobody broke is a decoration, and this repo has already been taught that
once.

---

## 7. M6 · The read surface the day's stages need, and the ids two routes are missing

**Read.** Checking whether `is_current` could be derived turned up that the rows are not *edited* by anyone
either, which is a bigger fact than the flag. Three greps:

* `GET /api/admin/tournament` (`routes-superadmin/tournament.ts:61-77`) returns `{ tournament, teamCount,
  standings, fixtures }`, and `tournamentView` (`views/tournament.ts:77-88`) carries `format`, `status`,
  `groupSize`, `advanceCount`, `hasThirdPlace`, `knockoutPairing`, `activatedAt` — **no stage rows**.
* The plan body is `tournamentPlanRequestSchema` (`packages/contracts/src/schemas.ts:905-911`): five day-level
  fields, **no `stages[]`**. `PUT /api/admin/tournament/plan` cannot reach a row, and the only writer of
  `tournament_stage` is the seeder, at activation.
* The rate columns exist and are documented — `promotion_points` (`schema.sql:788`), `win_points`, `loss_points`,
  `draw_points` (`:792-794`), with *"NULL = inherit `point_config`"* at `:789-791` — and `stageRates`
  (`stages.ts:166-175`) resolves them per result at completion. But `insertStageRow` (`:60-85`) takes no rate
  parameter and `insertStagesForActivation` sets none, so every row on every day carries `NULL` rates and
  `stageRates` always answers with the day config. **Half a feature: wired for reading, with no writer.**

So `tournament_stage` today is: seeded, read in five internal places (`promote_count` at `schedule.ts:685` and `:691`,
`pays_standings` at `stages.ts:148`, the resolved rates at `routes-tournament/index.ts:374`, and the flag's two
callers until M2), written by nobody but the seeder, invisible to every client — while
two routes ask callers to *supply* a stage id that no read returns:
`POST /api/admin/tournament/stages/:stageId/fixtures` (`routes-superadmin/tournament.ts:185`, ADR-247's re-pair
lever) and the award header's `stageId` (`packages/contracts/src/awards.ts:38`).

**Why this read belongs in a plan that is mostly deletion.** Because three things are unbuildable without it, and
none of them is a feature request. Three reasons, all of them about the deletions:

1. It is what makes M1's hazard **latent rather than live** (M1 step 4): delete the `??` rather than re-home it, and
   do it *before* any per-stage number becomes writable. The order is the whole point.
2. The design's promise — a desk that sets stage-3 and stage-4 numbers — needs **one** thing, and it is not a column.
   The columns are there; the read and the write body are not. So M6's `stages[]` should carry
   `winPoints`/`lossPoints`/`drawPoints`/`promotionPoints` after all, since storage costs nothing and the only
   argument for deferring was "don't add a column no route can fill". The read remains what unblocks the routes that
   already take ids, and what lets a facilitator see `close_reason` at all.
3. `manual-day-friction.md` reported the re-pair lever as having no screen. It is worse than that, and one view
   fixes the lot: no read returns a `tournament_stage.id`, so the lever has no screen *and* no API — and the award
   header that also takes a `stageId` has neither, which is how F-6 was found.

**Do.** `stages: tournamentStagesView[]` on the `GET /api/admin/tournament` response — `[{ id, ordinal, kind, label,
roundNumber, paysStandings, closedAt, closedReason }]`, ordered by `ordinal`, straight from the existing
`readStages`. No `promoteCount` in the shape: M1 deletes the column, and a view that still carried it would be the
plan's one way of re-importing the number the frame threw out. The two fields that matter are `id` and `ordinal`,
because they are what a re-pair body or an award batch has been missing in order to name a stage at all
(`routes-staff/index.ts`, `routes-superadmin/directory.ts` — the two routes that today speak of a stage only by its
kind).

**Write path, and it is not on the plan.** An earlier draft of this move put `stages[]` on `tournamentPlanRequestSchema`
— a list of round *rules* saved before activation and consumed by it. That draft is deleted twice over: the owner's
frame removed the rule (`promote_count` goes, M1 step 6, and a promotion "rule" was all such a list could hold), and
D-1 removed the timing — the rows exist from the seed, so the editor is not a pre-activation step at all. What the day
needs instead is a desk action on the row itself, available whenever the day is being run:

* `POST /tournament/stages` and `PUT /tournament/stages/:stageId`, bodies of the fields `NewStageRow` already takes
  (`db/entities/stages.ts:45-58`): `kind`, `label`, `roundNumber`, the three rates, `promotionPoints`,
  `paysStandings`. No `promoteCount` parameter, because M1 deletes the column.
* One guard, and it is not a rule about the day: a row belongs to the singleton tournament, so `tournament_id` comes
  from `findActiveTournament`, never from the body. Under D-12 the write is allowed after activation, and the fields
  that cannot be changed afterwards are the rates a played result has already been priced by — `win_points`,
  `loss_points`, `draw_points` are *addable* to a row that has none and *rewritable* on a row whose results have not
  been read yet, which needs no check at all because every result carries its own snapshot
  (`db/entities/leaderboard.ts:51-71`). The honest version of "freeze the shape at activation" is "the shape never
  applies backwards", and that is already true.
* `ordinal` on a new row is `max(ordinal) + 1` — chosen, not assumed. That is all of what D-11's alternative called
  "the ordinal rule"; with the deeper/shallower comparator gone from the plan, `UNIQUE (tournament_id, ordinal)`
  (`schema.sql:808`) is a collision to *handle* rather than a semantic to enforce, and `ordinal` means what its own
  comment says: display order (`:781-783`).

What F-7 still requires of M6 is the intent's own half, and D-9 answered how far it goes: one `tournamentShapeSchema`
validating `POST /preview`, `PUT /plan` and `POST /activate` — **three bodies, three acts, no consumption between
them**: the plan stays what the hall screen forecasts, activation stays what the desk presses, and neither reads the
other's copy. `plannedKnobs`'s five `??` (`lib/tournament/bracket.ts:63-72`) and the console's sixth copy
(`apps/web/src/lib/hooks/useAdminTournament.ts:19-28`) are deleted, because with M1's seeded rows the defaults they
stood in for have a home a reviewer can read out of the database. Explicitly out: new columns, `is_current` (M2), any
validation of a row's *shape* against the day's (`resolveStage`'s numbered-first precedence is the whole of the
mechanism, `stages.ts:135-142`), and every refusal in the manual path — the two failure cases this write path can
produce are both a duplicate of one of the three uniqueness rules, and both become a 409 with the row's own name in
the message (M7 step 5 lists them).

**Delete.** `plannedKnobs` and `DEFAULT_KNOBS` (two of the day's six default sets, and the only two a reader would
never find by looking at the day), the `promoteCount` field from any stage-row input, and `closeGroupStage`'s
`?? tournament.advanceCount` (M1 step 6 leaves it with nothing to fall back to).

**Tests.** The read lists the seeded rows before anything is activated (D-13 yes) or lists none and says so plainly
(D-13 no); a numbered row added mid-day prices that round and leaves its siblings on the kind-wide row (the
`resolveStage` precedence, asserted rather than trusted); a second kind-wide row for a kind that has one comes back as
a 409 naming the kind, not a 500; `PUT /tournament/stages/:id` on a row whose kind has fixtures already played leaves
those matches at their snapshots; and `POST /activate` with no body still activates the seeded shape (D-9, in the one
direction that costs nothing). The view and the request types land in `packages/contracts`. No court-desk work: the
plan console is the screen, and the id gap is what makes the re-pair lever and the award form usable from it.

**Risk and rollback:** low; one view and one optional field, both additive, both revertible. **Size:** S.
**Ships:** after M1 + M2, with the no-rates boundary written into the ADR so nobody reads M6 as "stage-aware scoring
is real now".

**Done when:** a `POST /api/admin/tournament/stages/:stageId/fixtures` request can be assembled from a
`GET /api/admin/tournament` response without opening a database prompt — and `stageRates` has a row worth reading,
which today it never has. One test says it outright: set `win_points` on a stage, finish a match in it, expect the
result to price at 4 and not at the day's 10.

---

## 8. M7 · Record who got out — the core's missing act

**Read.** The only stage boundary the code can cross is computed, never chosen. `closeGroupStage`
(`db/entities/schedule.ts:670-697`) runs `computeStandings` (`:678`) → `rankQualifiers(standings, promoteCount)`
(`:686`, `lib/tournament/engine.ts:546-558`, which walks rank 1..N of every pool) → `knockoutDrafts` (`:692`) →
`drawBracket` (`:708`). The desk's half of the act is a body of `{ force, reason }`
(`packages/contracts/src/schemas.ts:965-977`). So a close can be forced, by a named human, with a sentence — and it
cannot be **steered**. The only levers that can seat a team the table did not rank are ADR-247's re-pair body
(`pairs: [{ fixtureId, teamAId, teamBId }]`, `schemas.ts:937-948`, applied by `stagePairing.ts:203`) and a points
adjustment on the board. Both are overlay levers doing the core's job, and both record the wrong noun: "these two
play", "these points moved" — never "these teams survived, on my authority, because". F-3 sits on top of that:
`promotion_points` (`schema.sql:788`) has no reader at all, so even the number the schema does hold pays nobody.

**Do.** Five steps. The first three change no behaviour, which is what makes the fourth safe to review on its own;
the fifth is the small print D-12 asked for.
1. `tournament_stage_advancement` (schema doc §3): one row per team per boundary — `out_stage_id`, `into_stage_id`
   (nullable: leaving the final advances into nothing, and NOT NULL would make a champion's row invent a
   successor), `team_id`, `sequence` (the order the next stage was drawn in, so "the bracket we actually drew" is
   re-derivable at 9pm when somebody asks why they play court 2 first), `table_rank` (NULL = the desk decided), the
   void triple, `UNIQUE (out_stage_id, team_id)`, `UNIQUE (out_stage_id, sequence)`, and a partial unique index
   keeping a team live in a stage once. Mirror entry in `db/schema/tournament.ts`. No tail statement is needed for
   the table itself: `CREATE TABLE IF NOT EXISTS` already runs on every boot, which is the one case where the
   definition's rule and the tail's rule agree.
2. `closeStage(tx, { tournament, stage, qualifiers, superadminId, force, reason })` — the close, renamed and
   widened. `qualifiers: string[] | null`: null means "take the proposal" (exactly today's path, with each team's
   `table_rank` recorded from the rank it advanced on); a list means "the desk decided", requires *nothing* — D-10
   answered yes to advancing anyone with no sentence — and writes `table_rank = NULL` for anyone the proposal did not
   include. `reason` is still on the request and still stored when given, and the difference between the two readings
   of this field is the whole of D-14: in a scheduled mode a forced close keeps ADR-247's requirement, in the manual
   mode the desk is asked and never blocked. The bracket is then drawn from the rows'
   `sequence`, so the auto path and the manual path are the same line of code. That is the point: the desk's choice
   is an input, not a special case.
3. Delete `tournament_stage.promote_count` (M1 step 4) and its `??` floor with it. The count of survivors is the
   number of rows, and a count that is a row set cannot disagree with a column.
4. **Ask** about the going-through, in the close's transaction. The request carries `payPromotionBonus?: boolean`,
   defaulted from `promotion_points IS NOT NULL` — which is the column's own shipped rule that a NULL bonus is the
   feature off, *"so an organiser turns it on deliberately rather than finding it in the standings"*
   (`schema.sql:785-787`) — and the desk's console turns that default into the dialogue D-7 asked for: *"these 4
   teams came through — pay the 3 points each the stage offers?"* On Yes, one `team_award` per live row through
   `createAwardBatch` (`db/entities/awards.ts:100-145`) with `stage_id = out_stage_id` and a label of "Promotion,
   <stage label>", written in the same transaction as the close so the payment and the advancement cannot be
   separated by a crash. On No, nothing: no row, no audit entry, no flag — "we paid nobody" is what the ledger's
   silence already says, and a `promotion_bonus_paid` column would be a second place to answer a question the
   `award_batch` answers better. Not for the final:
   `tournament.champion_points_snapshot` already freezes and pays that boundary (ADR-136) and stays exactly where it
   is, so the last advancement pays what it has always paid and the earlier ones stop paying nothing.
5. **The four small jobs D-12 asked about.** Rows are creatable mid-day, and the issues that follow are mechanical,
   all four of them:
   * `(kind, round_number)` and `(kind)` for a kind that has one already → the two partial indexes at `:822-825`
     raise a unique violation, which `violations.ts` must translate into a 409 that names the stage. Left alone it is
     a 500, and a 500 in a manual day is the app refusing the desk with an accident rather than a rule.
   * `ordinal` → `max + 1` (M6), because `UNIQUE (tournament_id, ordinal)` at `:808` is global per day and an
     override row inserted beside its parent would otherwise collide with the next stage's ordinal for no reason.
   * **Rows are never deleted.** `award_batch.stage_id` (`:847`), `team_award.stage_id` and the advancement rows
     point at them, so the only edit that can undo a stage is the close triple it already has, and the only way back
     from a close is voiding the advancements and closing again (below). A row that is no longer wanted is a row with
     `pays_standings = false` from now on, not a row removed.
   * A row cannot invent a **kind**. `kind` is `MatchStage` verbatim and the shipped comment says a day that needs a
     fourth one is asking for a wire change (`:773-775`), so "invent a round freely" means "invent a round of a kind
     the day has". That is the single boundary your no-rules answer leaves, and it is a boundary the code already had
     before this plan — nothing here needs to enforce it, because the CHECK does and the CHECK is not about the human.

### 8.1 The example that withdrew D-11

D-11 asked whether one kind may have both a kind-wide row and a per-round override, and you asked for an example, so
here it is in the day's own terms. Suppose the desk wants the semi-finals to pay three points for a win and everything
else ten. Today's seeded day has two knockout-shaped rows:

    ('knockout',    round_number NULL, 'Knockout',        ordinal 2, win_points NULL)   -- every knockout round
    ('third_place', round_number NULL, 'Third place',     ordinal 3, win_points NULL)

The override is a third row: `('knockout', 3, 'Quarter-finals'/'Semi-finals', ordinal 4, win_points 3)`. A fixture in
knockout round 3 resolves to it — `stageFixturePredicate` matches `(stage, round_number)` and `resolveStage` prefers a
numbered row over the kind-wide one (`stages.ts:135-142`, `:292-307`), which is exactly the precedence the two partial
indexes were cut to allow. Every other knockout fixture still resolves to the kind-wide row. The board reads the price
off each match's `points_awarded_snapshot`, so nothing already played is re-priced by the new row
(`db/entities/leaderboard.ts:51-71`).

So the mix works, today, with no DDL and no validator — and the only argument *against* it was mine: I wanted "one
shape per kind" so that `ordinal` could stay a clean "which is deeper" comparator for the advancement's CHECK. That
argument is void for two reasons. The comparator is gone (an advancement points at two rows by id and never asks which
is later), and `ordinal`'s own comment already disclaims the meaning: "Display order only" (`:781-783`). Keeping the
rule would have bought a nicer invariant and spent the one thing your no-enforcement ruling protects.

**Void, not delete (D-8).** A voided advancement un-runs its consequences by their own machinery: `releaseFixtureOfMatch`
(`schedule.ts:339`) hands the downstream seat back, and the promotion batch is reversed by its header
(`award_batch.is_reversed` and its stamp, `schema.sql:854-861`) rather than deleted. A `void_audit_entry` gains a
fifth `target_type`, `'stageadvancement'`, on ADR-248's drop-then-add pattern (`:944-945`). **Reopening a stage is not
in this move and should stay out:** `closeStageRow`'s single guarded UPDATE is what makes a close trustworthy, so the
way to take a close back is to void the advancements and close again — which is also the correction flow's own rule
(ADR-157 corrects an input, not an outcome). A second void of the same row is refused the same way a second close is:
in the UPDATE's WHERE, not after a read.

**Delete.** `promote_count` from the table, the mirror (`db/schema/tournament.ts:134`) and the seeder
(`stages.ts:105`); `closingGroupStage`'s return of a row *for its count* (M2 removes the rest of the helper); the
`CloseStageOutcome` member `no_stage_rows` (M1); and the clause in `refusalForClose` (`schedule.ts:761`) that has to
explain why a force is refused on a row-less day — with the list as an input, a day that advances nobody advances
nobody whether or not it has rows. Under D-13's seeded day there is no row-less day to complain about either, so what
is left of `refusalForClose` is the scheduled modes' business and the manual path refuses nothing.

**Tests.** The two doors, then the undo. (a) A close with no list reproduces today's bracket exactly — same fixtures,
same `sequence`, same seats — golden against the world-cup fixture, because that test is the proof that step 2 changed
nothing while it wrote a new table. (b) A close with a list that includes a team ranked third in Pool B: the rows
exist, `table_rank` is NULL for the reprieve and 3 for the ones the table produced, the bracket follows the rows'
order, and the stage's `promotion_points` paid three teams once each under one reversible batch. (c) Void one row:
the seat is free, the batch is reversed, the board still shows the advancement with its void sentence, and a re-void
changes nothing. (d) The DDL says nothing about which stage is "deeper", by design (D-11, withdrawn): an advancement whose
`into_stage_id` has a lower `ordinal` than its `out_stage_id` is **written and paid**, because a reprieve round, a
consolation pool and a re-seed are what a manual day invents at 3pm. (e) A close whose `payPromotionBonus` is false
writes the rows and posts nothing, and a second close attempt on the same row still stamps nothing — the two halves of
D-7, asserted on either side of the dialogue. (f) `POST /tournament/stages` twice for the same `(kind, round)` returns
409 with the kind and round in the message; the test exists because the default is a 500.

**Risk and rollback.** The highest of the seven moves, in one place: the close is the day's only irrevocable act.
The mitigation is the order of the steps — (1) is inert, (2) is behaviour-preserving with every caller passing null,
(3) is a deletion the tests already pin, (4) is the only thing that can move points, and it moves them
only after a human answered a question the day no longer answers by itself. Rollback per step; step 4 alone is a revert of
one function call.

**Size:** M. **Ships:** last, after M1 + M2 + M6. **Depends on:** M6 (an advancement has to be nameable on the desk for
the desk to choose it, and M6 is what makes a stage id reachable) and M2 (one clock, or "which stage is the day on"
has three answers: `status`, the pointer, and the rows).

**Decide:** answered — D-7 became the Yes/No dialogue (step 4), D-8 stays a void (explained, §9.8), D-10 became
"nothing is required of the desk", D-11 was withdrawn by its own example (8.1), D-12 became step 5.

**Done when:** `grep -rn "promote_count\|promoteCount" apps/api/src packages/contracts` is empty; `rankQualifiers`
has exactly one caller and it is inside `closeStage`; test (a) is byte-identical to the bracket the tree draws today;
and the hall screen's "advancing …" line is fed by `tournament_stage_advancement` rather than by a rank recomputed at
read-time — the first moment the desk's authority is visible to the room, which is what makes this a core move
rather than a convenience.

---

## 9. What reading the code changed about the plan

Four corrections, all of them against my own first draft, listed so you can see the plan was written twice:

1. **M1 lost its migration.** The first draft said "additive tail: `INSERT … SELECT`". `bootstrap.ts:8-19` says
   `schema.sql` is "DDL only… Never a row" and that the remedy for a stale local database is `./dev-reset.sh`.
   So M1 is now a pure deletion plus an advice line shaped like the existing `missingDdlAdvice`. Smaller, and it
   no longer invents a migration convention.
2. **M2 is a rename, not a design.** `transitionOutOfPoolStage` already exists and already orders its two
   updates so `ux_tournament_stage_one_open` stays the referee. I had proposed writing `markDayStatus` from
   scratch; it is actually "move the `status` write into the helper that already knows the order" — and give the
   `completeWithoutBracket` path the same discipline, since it currently bypasses that helper and passes an
   invented `?? 'no bracket to draw'` into `closeStageRow`. Two cruft items picked up on the way, one of them a
   real inconsistency rather than a style point.
3. **M4 is a reopening, and must be named as one.** `contracts/src/awards.ts:56-58` is a *decision*, not an
   oversight: the participant ledger was deliberately left unrelaxed. My first draft described the asymmetry as
   disharmony to be smoothed. It is smoother to admit the trade and ask (D-2), because the honest alternative —
   leaving a tournament prize needing a tug-of-war activity to exist — is a rule nobody would defend out loud.

The plan also got one deletion it did not have: the idea of adding `fixture.stage_id`, and the idea of
unifying `undo` with `void`, are both *worse* than the mess they replace, and both are now written down as
recommendations against in §4 of the harmony document.
4. **M2 was not aggressive enough, and that came from asking the question you asked.** My first answer defended two
   clocks with "one value is in the contract, the other is history". Counting readers instead of weighing them
   showed the flag is read twice, never crosses the API, and is the *coarser* of the two values — a projection of
   `status`. So `is_current` goes rather than getting a guard, and the phase collapse stops being a discipline
   (`markDayStatus` writes two values in a fixed order) and becomes a deletion (it writes one). Chasing that answer is
      also what turned up M6: while checking whether a day could be "on a numbered row", I found that no route creates
   or reads stage rows at all.
5. **And the owner's frame superseded both halves of my fork.** Asked which table should own `promote_count` — the
   day (delete the column, minimal) or the stage (keep it, as `schedule.ts:679-685` argues) — the answer was neither:
   *we don't care what each promotion round is; the teams that survive progressed deeper, that is all*. So there is no
   promotion **number** to place, and the fact that was missing is a promotion **record**: M7 adds
   `tournament_stage_advancement`, and both my drafts lose a limb — the first for wanting to relocate a value nobody needs
   to store, the second for wanting to configure a rule the day is explicitly not supposed to have. What survives of
   them is the part the frame made *stronger*: `is_current` goes (a pointer is less tenable still once the day's
   position is a set of recorded advancements), the `??` floor goes (D-1), and `promotion_points` keeps its column
   because an advancement is a natural payer — F-3 and F-7 stopped being trivia in the same move. The lesson worth
   keeping, for the next time I am asked "which of two homes should own this value": check first whether the value is
   a **rule** the day should be storing at all.

6. **`claimScope` — what the value is for (D-5).** The name is the thing's job: it is the predicate that scopes a
   *claim*, i.e. a hand-started match taking a fixture from the pool of suggested matchups. It exists because of a bug
   the earlier assessment recorded (§1 item 6): before it, `claimFixtureForMatch` did not scope by stage or by
   tournament, so a match started by hand could silently consume a **knockout** fixture — a coin flip that
   `apps/api/src/tests/court-queue.test.ts:191-206` had to be rewritten around. Two halves live in it, and only one is
   a rule: scoping by **tournament** is correctness (never consume another day's draw) and stays in every mode;
   scoping by **stage** is a policy about how the day runs, so in manual mode it narrows what is *offered* and must not
   refuse what is chosen. The confession that goes with the answer: I asked what `claimScope` may claim on a completed
   day while its `findCurrentStage` half is deleted by M2 — a question about a value my own plan was throwing away.
   The question is now this document's; the code just loses a lookup.
7. **A function I cited that does not exist.** M1's step 5, two drafts running, told the reader to add
   `missingStageRowsAdvice` as *"a sibling of `missingDdlAdvice`"* in `db/provision.ts`. `provision.ts` is real;
   `missingDdlAdvice` is real; **`missingStageRowsAdvice` is a name I wrote and then quoted from myself**, and no such
   helper was ever in this repo (`grep -rn "missingStageRowsAdvice" apps packages` → nothing, before and after the
   rewrite). The line is deleted, M1 is now the seed, and the rule it teaches is the one this file has been arguing
   with the code about all the way through: a citation in a plan is a claim, and it has to be grepped in the turn it is
   written, not inherited from the last draft of it.
8. **"An opposite row" (D-8), defined.** It is `score_adjustment`'s way of being append-only: there is no UPDATE
   path, so a mistaken +25 is answered by posting a −25 with its own `edit_reason`, and the trail keeps both rows
   forever. The words are the entity's, not mine: *"Append-only by design. There is no void and no edit: an
   adjustment entered in error is answered with an equal and opposite one, so the ledger reads as a history of
   decisions rather than a mutable opinion about the past"* (`db/entities/adjustments.ts:12-14`), and the column that
   permits it is `points … CHECK (points <> 0 …)` — signed, never zero (`schema.sql:373-375`). The alternative
   for a taken-back advancement was to post a second row cancelling the first. It loses for a reason that has nothing
   to do with elegance: an advancement is not only a number, it is a seat in a draw and possibly a paid batch, so an
   opposite row would leave those two effects running while the arithmetic said they were gone. The void triple
   instead says *this row is not live*, which is what the partial unique index and the downstream `releaseFixtureOfMatch`
   both read. Note that your D-12 ruling makes it the safer choice as well as the clearer one: in a mode with no
   refusals, the difference between "you may not" and "this is off" is the whole design.
9. **`ordinal` does not mean depth, and I tried to make it.** D-11 was built to protect a comparator
   ("advance into a *deeper* stage") that would have read `ordinal` as the day's order. Two things killed it: the
   column's shipped comment already says "Display order only" (`:781-783`), and once `into_stage_id` is an
   id rather than a rank there is nothing left to compare. Recorded because the mistake is the general one — reaching
   for an ordering in a column that stores a label, then inventing a rule so the ordering stays clean.
10. **The `phase` vocabulary, and a table that was never built (D-4).** `docs/design/tournament-phases-assessment.md`
    proposed `tournament_phase` and a `phase_id` on `tournament_fixture`; neither exists in this checkout
    (`grep -n "tournament_phase\|phase_id" apps/api/src/db/schema.sql` → empty), and that document's own §1 item 7
    records why: the owner's word was `stage`, and reading `stage` + `round_number` as a stage's identity was the
    cheaper design. So the harmonisation you asked for is prose, not DDL: `stage` for a row, `kind` for a fixture's
    slice, `status` for the day, `advance` for surviving a stage; `markPhase` is `markDayStatus`; and "no enforcement
    in manual mode" is what stops me from proposing a CHECK to hold those words in place.

## 10. Order I would actually run

1. **M3** first, on its own, while the rest is still being argued — it is one field, it closes F10, and it makes the
   day's story more legible for everyone reviewing the rest.
2. **M1 + M5 together** (the seed and the two rules that keep the deletion deleted). Same stage, one commit each. If
   D-13 is yes, M1's tail lines ship with it — one status value, two `DROP NOT NULL`s, one binding CHECK — because a
   seeded day and a widened CHECK are one change, not two.
3. **M2**, one stage: `is_current` out, `status` alone, the writer renamed for what it writes, and D-14's `reason`
   made optional in the manual path. Then **M6**, the read that names a stage and the write path that edits a row.
   Then **M7** in five shippable cuts: the table (inert), the close widened with `qualifiers = null` from every
   caller (no behaviour change, all the record), `promote_count` deleted, the Yes/No dialogue, and step 5's four
   small jobs. **M1 before M7's step 3**, so the floor dies while there is still nothing to fall back to.
4. **M4.1** — one liveness predicate, no behaviour change, no decision attached. It was step 1 of a five-step move
   and is now the whole of it, because D-2 withdrew the rest.

The two rulings that gate the sequence are **D-13** (does the seed gain the day row, so activation becomes a stamp) and
**D-14** (does a manual close still require a sentence). D-13 decides M1's step 1, M6's first test and the only three
tail lines in this plan; D-14 decides M2's step 6, M7's step 2 and whether `refusalForClose` still has a job in the
manual path. Everything else below them is unconditional.

That ordering means every stage is either *pure subtraction* or *needs a decision you already made*, and there is no
point in the sequence where a half-finished move leaves the board ambiguous. If only one of these ever ships, ship M3
and M1: one makes the core honest about the overlay, the other makes the day's stages a fact of provisioning instead of
a hope about activation.
