# Letting a late team into a running tournament

**Status: BUILT — ADR-149.** The three decisions at the end were answered: admission closes
with the group stage, the ranking rule is unchanged, and partial admission is allowed with the
cap explained in the UI. This document is kept as the reasoning behind the shape; the addendum
is the record of what shipped.
**Context:** §6 of `docs/design/superadmin-event-day-gaps.md` — a team formed after
`POST /tournament/activate` has no `tournament_entry` row, and therefore no group, no fixture,
no standings row and no path to the knockout. The console's only word on the subject promises
consolation friendlies, which are D4 and were never built.

This document answers one question: **if we admit them instead, what does the match-up
algorithm have to do?**

---

## 1. The good news: the schedule is already append-tolerant

This is the finding that makes the feature small, and it was not obvious until I read the
dispatch path again.

Nothing in the running event holds a copy of "the schedule". `planCourtDispatch` is pure and
read-time: it walks whatever `pending` fixtures exist *at that moment*, in `sequence` order,
and hands the first startable ones to free courts. `estimateStartTimes` does the same.
`claimFixtureForMatch` finds a fixture by unordered team pair when a match actually starts.
`computeStandings` folds whatever resolved. No total is precomputed, no round count is stored,
no court console caches a list.

So **a fixture inserted at 11:40 is indistinguishable from one inserted at 09:00.** The
engine does not need a new concept; it needs a few more rows.

Two consequences worth stating plainly, because they remove work people assume is needed:

- **`roundNumber` is presentational.** It orders the queue and labels the fixture. The thing
  that actually stops a team being double-booked is the `taken` set in `planCourtDispatch`
  ("in a live match, or already dealt to an earlier court in this plan"). We therefore do not
  have to solve the circle-method rotation for an enlarged group — we only have to produce
  pairings and a sane order.
- **Existing fixtures are never rewritten.** No pairing already on the board changes, no
  played result is touched, no claimed fixture is disturbed. Admission is strictly additive.

## 2. What admission actually is

One transaction:

1. `INSERT tournament_entry (tournamentId, teamId, groupCode, seed)` — membership *is* this row.
2. `INSERT` *n* new group fixtures, the late team against each chosen opponent.
3. Re-sequence the **pending** fixtures so the new ones interleave rather than pile up at the end.

Then `invalidateTag(TOURNAMENT_TAG)` and an audit row. Everything downstream — line-ups,
court dispatch, standings, the hall screen — picks it up on its next poll with no change.

### 2.1 Which group?

Keep the invariant `dealGroups` establishes: **group sizes differ by at most one.**

```
pick the group with the fewest entries
  tie-break: the group with the most unresolved fixtures   // it is running late, so the
                                                           // newcomer has more wall clock
  tie-break: lowest group code                             // deterministic
```

The second tie-break is the interesting one. Two equally sized groups are not equally good
homes at 11:40: the one that is behind schedule is the one where a newcomer's games can
actually be played.

**Rejected: opening a new group for the late arrivals.** A group of one has nobody to play; a
group of two decides a qualifier on a single match while group A needed five. Late teams
always join an existing group. (If four teams arrive at once this gets ugly, and the answer
there is a second tournament, not a second group.)

Round robin degenerates correctly: `planKnobs` makes it one group, so there is no choice to
make and the same code path works. That is the point of the engine having no format branches.

### 2.2 Which opponents, and how many?

The late team owes one fixture against each existing member of its group — *n* fixtures for a
group of *n*. At 09:30 you create all of them and nothing more is needed.

At 11:40 you cannot. A team owing five matches with twenty-five minutes of play left will not
play five matches, and **creating fixtures that will never be played is worse than creating
fewer**: they clog the dispatch queue, they appear on the team's line-ups page as promises,
and they end the day as `skipped` — a status that means *this failed*, applied to something
that never had a chance.

So admission takes a **count**, defaulting to what fits:

```
fits = floor(remainingPlayMinutes / matchMinutes * courtsAvailableToThisTeam)
```

in practice "how many games can one team get through", which is time-boxed by the team itself
(a team plays one at a time), not by court count:

```
fits = floor(remainingPlayMinutes / (matchMinutes + changeoverMinutes))
```

`matchMinutes` is already configured (`point_config.match_minutes`, default 12). The console
shows the arithmetic rather than hiding it: *"Kites owe 5 matches. At 12 min + changeover,
5 matches is ~70 min. You have ~25 min before you close the group stage. Create 2?"*

**Which 2?** Ordered by **which opponents are most likely to be free** — fewest unresolved
fixtures remaining, then longest since their last match finished, then seed for determinism.
This is the same instinct as `orderByRestFairness` and it optimises for the only thing that
matters at that hour: that the game actually gets played. Picking "the most meaningful
opponent" is a luxury of a schedule with time left in it.

### 2.3 Where do they go in the queue?

Appending at the tail would make the newcomer play *n* games back-to-back at the end, and the
rest-fairness window (3) cannot rescue that.

Instead, after inserting, re-sequence **only the pending fixtures**, starting from
`max(sequence) + 1`, sorted by `(roundNumber, groupCode)` — exactly the order
`groupFixtureDrafts` produces, so the rule stays one rule. Resolved fixtures keep their
numbers and stay below. New fixtures get round numbers spread across the group's remaining
rounds; when there are more fixtures than rounds left, the surplus lands in the trailing
rounds, which is the honest representation of a denser catch-up schedule.

This is a bounded multi-row `UPDATE` inside the admission transaction — safe under the one
serialized connection (ADR-003), and nothing outside the row stores a sequence.

## 3. The part that is not a scheduling problem: fairness

`foldStandings` ranks cohorts by **absolute wins**. A team that plays two matches can win two;
a team that played five can win five. So a late team is ranked low automatically, and a late
team admitted to three games has a mathematical ceiling on where it can finish.

Two ways out, and only one of them is acceptable.

**Rejected — rank by win rate.** It makes 1–0 beat 4–1, it needs a minimum-games gate to not
be absurd, and above all **it changes the ranking rule after the first whistle**, reordering
teams who already played under the old one. A captain who went 4–1 and finished second to a
newcomer's 2–0 has been cheated, and correctly believes it. Whatever we do for the late team
must not cost anything to the teams who were on time.

**Chosen — keep absolute wins, and say the ceiling out loud at admission.** The admission
dialog computes it, because it is one subtraction:

> Kites can play 2 matches, so at most **2 wins**. Group B's leader already has **3**.
> **They cannot qualify for the knockout.** Admit them anyway?

If the answer is yes — and it usually will be, because four people would rather play two real
group matches than nothing — then everybody involved knew. If it is no, you have learned that
in the dialog rather than at 15:30 when a captain asks why they are not in the bracket.

The `seed` tiebreak reinforces this correctly without any special case: a late entry gets
`max(seed) + 1`, so the final arbitrary tiebreak favours the teams that were there on time.

## 4. The knockout needs no changes

Qualification is computed at `closeGroupStage` from whatever the tables say; `knockoutDrafts`
already handles any qualifier count, byes included. A late team with enough wins enters the
bracket like anyone else.

**Admission closes when the group stage closes.** Once `status = 'knockout'`, no. A bracket is
a tree built from a fixed leaf set, and inserting a team into one that has been partly played
is not a scheduling problem but a credibility problem. The console should say *"entry closes
when you close the group stage"* on the admission panel, so the deadline is visible before it
passes rather than discovered after.

## 5. Shape of the work

Two pure functions in `apps/api/src/lib/tournament/engine.ts`, in the style of the file — no
clock, no database, no randomness:

```ts
export function chooseLateEntryGroup(groups: {
  code: string; size: number; unresolvedFixtures: number;
}[]): string;

export function lateEntryFixtures(input: {
  groupCode: string;
  lateTeamId: string;
  opponents: { teamId: string; unresolvedFixtures: number; lastFinishedAtMs: number }[];
  remainingRoundNumbers: number[];
  maxFixtures: number;
}): GroupFixtureDraft[];
```

API:

- `GET /api/admin/tournament/admissions` — the teams with no entry, each with its proposed
  group, the fixtures it would owe, the time that would take and the win ceiling.
  **This alone closes gap §6's "nobody can see them" half**, whether or not anyone is admitted.
- `POST /api/admin/tournament/admissions` `{ teamId, fixtureCount }` → 201.
  Guards: tournament exists and is `group_stage`; team exists; team has no entry (there is no
  unique index on `(tournament_id, team_id)` — the route must check, and the check must be
  inside the transaction).

Console: a panel on the Tournament page, visible only when `status = 'group_stage'` and at
least one team is outside. Audit row per admission.

**Estimate: ~1½ days** including tests, of which the engine functions are a couple of hours
and the arithmetic in the dialog is most of the design value.

### Sibling, deliberately out of scope

**Withdrawal** — a team that goes home at lunch — is the same shape in reverse and is a real
event-day event. It is harder (what happens to their played results?) and should not be
bundled in.

---

## 6. Three decisions needed before building

1. **Admission window:** close at `closeGroupStage`, as above? (The alternative — a hard clock
   cut-off — is more code and less control.)
2. **Ranking rule unchanged** — absolute wins, late teams ranked on what they could earn, with
   the ceiling shown at admission. Confirm we are not switching to win rate mid-event.
3. **Partial admission** — may the superadmin create fewer fixtures than the team owes, leaving
   the group not quite a round robin? The alternative is all-or-nothing: admit only if every
   owed match fits, otherwise refuse. Cleaner tables, many more people sitting out.
