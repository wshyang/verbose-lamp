# A single-elimination format — assessment and plan

**Status:** SETTLED and implemented as **ADR-169**, in a much smaller form than this document
assumed. The decision was: *"make the new option a new selectable option for initial pairing, and
everything else we try to retain the same behaviour."* So there is no new tournament format — the
`#1 v #2` scheme is a **pairing choice** on the existing knockout bracket, and §3's collisions
(late entry, withdrawal) never arise because nothing about them changed. §4 is the part that
mattered and is preserved below as the reasoning behind the two options.
**Request:** 16 teams; #1 v #2, #3 v #4, …; the winner of (1,2) plays the winner of (3,4), and so
on until one team is left. Every match is a knockout.

---

## 1. The headline

**Most of this already exists.** The tournament engine was built for `world_cup`, which is a group
stage *followed by* a knockout bracket. The bracket half of it is general-purpose, and a pure
single-elimination tournament is that half with nothing in front of it.

What is already there, and needs no new work:

| Piece | Where | State |
| --- | --- | --- |
| A knockout tree from a ranked list, with feeders | `lib/tournament/engine.ts` `knockoutDrafts()` | Complete |
| Byes for non-power-of-two fields | same, round 1 | Complete |
| `stage = 'knockout'` fixtures, null slots awaiting a feeder | `db/schema.sql` `tournament_fixture` | Complete |
| `source_fixture_a_id` / `source_fixture_b_id` wiring | same | Complete |
| **A knockout match cannot end drawn; golden point** | `lib/matchResult.ts` — `knockoutCannotDraw`, `knockoutPlaysOn` | Complete, and keyed off the fixture's **stage**, so it applies the moment a fixture is a knockout fixture, whatever the tournament format is |
| Knockout matches marked as such on the facilitator / court-marshal screens | existing knockout stage rendering | Complete, same reason |
| Round names (Final, Semi-final, …) | `engine.ts` `knockoutRoundLabel()` | Complete |
| Third-place match as its own stage | `stage = 'third_place'`, `semiFinalRoundIndex()` | Complete |
| Champion bonus = "the knockout fixture nothing feeds from" (ADR-136) | `lib/finalStandings.ts` | Works unchanged — in a pure bracket the final is still the fixture nothing feeds from |

So the two rulings that would have been expensive to retrofit — **golden point** and **knockout
matches must be marked on the court-marshal screen** — cost nothing here, because both were
written against the fixture's stage rather than against `world_cup`.

## 2. What actually has to be built

### 2.1 A third format value (small)

`tournament_plan.format` and `tournament.format` both `CHECK (format IN ('round_robin',
'world_cup'))`. Add `'knockout'`. Two wrinkles:

- `group_size` and `advance_count` are `NOT NULL` with `CHECK` ranges, and a knockout has neither.
  They must be given an honest parked value and ignored, or made nullable for this format. Making
  them nullable is the truthful option and costs a migration the project does not have a mechanism
  for (ADR-165 — `ensureSchema` applies `schema.sql`, it does not alter columns). **Recommendation:
  park them** (`group_size = 2`, `advance_count = 0`) and let the format decide whether they mean
  anything, rather than invent a migration path for a cosmetic gain.
- `routes-superadmin/tournament.ts:132` floors the team count at 4 for `world_cup`, 2 otherwise. A
  knockout wants a floor of 2.

### 2.2 Activation without a group stage (small)

Activation currently deals groups, writes group fixtures, and only drafts the bracket when the
groups finish. For `knockout` it draws the entrant order once and calls `knockoutDrafts()`
immediately — every fixture for the whole tournament exists from the first whistle, which is
actually *simpler* than `world_cup`, where the bracket cannot be drawn until the groups resolve.

### 2.3 The bracket view and the pre-show projection (medium)

`lib/tournament/bracket.ts` builds `groups` and `rounds`. For a knockout, `groups` is empty and
`rounds` is everything. `planned()` projects `groupSizePlan(teamCount, groupSize)` before
activation; for a knockout it projects the bracket shape instead — "16 teams, 4 rounds, final at
about 16:40". The hall screen and the `TournamentBracketView` contract both need to tolerate an
empty `groups` array. Worth checking every consumer rather than assuming.

### 2.4 Final standings (medium — the real design question)

`finalStandings.ts` ranks on group points. A single-elimination tournament **does not produce a
full ranking**: it produces a champion, a runner-up, two losing semi-finalists, and then eight
teams who are all equally "lost in round 1". The standings export covers every team and is always
available, so it has to say something about those eight.

The honest answer is to rank by **round reached**, ties unbroken and shown as ties — a team that
lost in the quarter-final is 5th=, not 5th. Inventing a tiebreak from scores would be a ranking
the format did not earn.

## 3. Where the existing rulings collide with a bracket

These are not oversights in the plan; they are places where a rule written for a group stage has
no obvious meaning in a tree, and they need deciding rather than guessing.

### 3.1 A withdrawn team's unplayed fixtures

The standing ruling: **a withdrawn team's unplayed fixtures become `skipped`, not walkovers.** In a
group that is exactly right — the match simply does not happen and nobody gains.

In a bracket it stalls the tournament. If a team withdraws before its quarter-final and the fixture
is `skipped`, the semi-final slot it fed is never filled and **the bracket cannot continue**. The
opponent must advance, which is precisely what `status = 'walkover'` and `walkover_winner_team_id`
exist for.

So the group rule and the bracket rule have to differ, and the difference is forced by the shape of
the format, not by preference. Flagged as question (D) below.

### 3.2 Late admission (ADR-149)

The standing ruling: **late teams must be admissible into a running tournament, with a cutoff**, and
the UI must make clear the cap on their matches is scheduling, not a penalty.

`lateEntryFixtures()` slots a late team into a group with the fewest teams and generates its
remaining group matches. A bracket has no such slack: once the draw is made, every seat is taken and
every future fixture is spoken for by a feeder. Admitting a 17th team means either rebuilding the
bracket (invalidating fixtures already played) or giving them a round-1 seat that does not exist.

The only coherent answers are: admit late teams **only before the draw**, or draw the bracket large
enough to hold expected latecomers as byes. Flagged as question (C).

## 4. The pairing order — the one place the spec and the code disagree

This is the most consequential item in the document.

The request is **#1 v #2, #3 v #4** — adjacent pairs. `bracketSeedOrder()` does the opposite on
purpose: it is the classic bracket, 1 v 16 / 2 v 15 in halves, and its comment says why — *"so top
qualifiers meet late, not early."*

With a 16-team field the two orders give completely different afternoons:

- **Classic (existing):** #1 plays #16 first and can only meet #2 in the final. Seeding is a reward.
- **Adjacent (as written):** #1 plays #2 in round 1, and one of the two best teams is knocked out
  before the tournament has warmed up. The champion is still a real champion, but seeding means
  nothing — being ranked #1 is actively a disadvantage, because it draws the #2 team immediately.

Both are legitimate; they are different tournaments. Which is right depends entirely on what the
numbers #1…#16 *are*:

- If they are **strength ranks** (from a group stage, or last year's result), adjacent pairing
  throws the ranking away and classic order is almost certainly what is wanted.
- If they are just **labels** — team numbers, enrolment order, a random draw — then "#1 v #2, #3 v
  #4" simply means *pair them up in order*, and it is exactly right, because the numbers carry no
  claim about strength.

This is question (A), and it cannot be guessed.

## 5. The four decisions needed

- **(A) Pairing order** — adjacent (`1v2, 3v4`, as literally specified) or classic bracket
  (`1v16, 2v15`, as `bracketSeedOrder()` already does)? And are the numbers ranks or labels?
- **(B) Non-power-of-two fields** — 16 is clean, but 12 or 20 is not. Give byes to the top seeds
  (what the code does now), or refuse to activate a knockout unless the field is 4/8/16/32?
- **(C) Late teams** — admissible before the draw only, or oversize the bracket with bye seats
  reserved for them?
- **(D) Withdrawal mid-bracket** — the opponent advances by walkover (the only thing that keeps the
  tree moving), or `skipped` as in a group, accepting that the slot above it empties?

## 6. Effort, once decided

| Step | Size |
| --- | --- |
| `format = 'knockout'` through schema, contracts, plan route | S |
| Activation path: draw, then `knockoutDrafts()` immediately | S |
| Bracket view + pre-show projection with no groups | M |
| Final standings by round reached, ties shown as ties | M |
| Withdrawal and late-entry behaviour per (C) and (D) | M |
| Superadmin plan UI: a third format, hiding the group knobs | S |
| Tests across all of it, plus a sabotage sweep | M |

Roughly one focused session. The low cost is entirely because the knockout machinery, the golden
point and the court-marshal marking were all built against the fixture's stage rather than against
the `world_cup` format — the earlier generalisation is what makes this cheap now.
