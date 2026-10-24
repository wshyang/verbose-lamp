# The draw rate — F-1 ruled on reading (b)

> **Shipped 2026-10-04 as ADR-152.** A **fourth** silent-corruption site turned up during the
> build that this note had missed: `foldStandings`' producer filtered on `if (winner && …)`,
> so a drawn fixture would have been dropped from the group table altogether. See the ADR.

*Design note, 2026-10-04. Supersedes the working assumption that A5's "three rates: win, loss,
draw" was a drafting slip. It was not: draws are to score. This note is written before the
build because the change reverses a shipped ADR and a database constraint, and because three
of the places it touches fail **silently** rather than loudly.*

---

## 1. What was ruled, and what it reverses

`docs/outstanding-tasks.md` described A5 as *"the draw rate to both. Three rates: win, loss,
draw."* A previous turn read that as a slip and corrected the sentence to match the code. That
reading is now overruled: **a level match is a legal result and pays a third rate to both
teams.**

That reverses, in order of seriousness:

1. **`schema.sql:303`** — `CHECK (status <> 'completed' OR winner_team_id IS NOT NULL)`. A
   completed match with no winner is currently not unimplemented; it is *structurally
   impossible*.
2. **`routes-tournament/index.ts:320`** — `if (match.scoreA === match.scoreB) throw
   badRequest(messages.drawCannotEnd)` — *"The score is level, so there is no winner yet. Add
   the deciding point first."*
3. **ADR-114**, whose text states the rule in those same words.

None of that is a bug. It was a coherent decision, built consistently three layers deep. It is
being changed by instruction, and the ADR should say so plainly.

---

## 2. The three places that fail silently

This is the reason for the note. Relaxing the CHECK and deleting the refusal would produce a
system that **runs, returns 200, and is wrong**, with no error anywhere.

### 2.1 The leaderboard pays a draw as a *loss*, to both teams

`leaderboard.ts:47-49`:

```sql
CASE WHEN m.winner_team_id = m.team_a_id
     THEN (m.points_awarded_snapshot->>'winPoints')::int
     ELSE (m.points_awarded_snapshot->>'lossPoints')::int END
```

With `winner_team_id IS NULL`, the comparison is **NULL**, not false. NULL is not true, so SQL
takes the `ELSE`. Both rosters are paid `lossPoints`. Every participant in a drawn match
quietly receives the losing rate, and nothing in the system objects.

This needs a genuine three-way `CASE`, with the NULL case tested *first* and explicitly:

```sql
CASE WHEN m.winner_team_id IS NULL THEN (… ->>'drawPoints')::int
     WHEN m.winner_team_id = m.team_a_id THEN (… ->>'winPoints')::int
     ELSE (… ->>'lossPoints')::int END
```

### 2.2 The group table counts a draw as a *loss*, to both teams

`engine.ts:319`:

```ts
if (teamId === result.winnerTeamId) row.wins += 1;
else row.losses += 1;
```

`wins` and `losses` currently partition every result, and that assumption is baked into the
shape: `FixtureResult.winnerTeamId` is typed `string`, not `string | null`. A draw lands in
the `else` and both teams are recorded as having lost. `StandingRow` needs a `draws` counter,
and the type needs to admit the null so the compiler finds the call sites instead of leaving
them to a reader.

### 2.3 Two tiebreaks assume somebody won

`engine.ts:415` builds the mini-league by `miniWins.set(result.winnerTeamId, …)` — a NULL key
poisons the map. `engine.ts:428` resolves a two-way tie with `return result.winnerTeamId === a
? -1 : 1`, which hands the tie to **b** whenever the head-to-head was drawn, silently and
arbitrarily. A drawn head-to-head must fall through to the next criterion, not be treated as a
win for whichever team the comparator happened to name second.

---

## 3. Knockout matches still cannot draw

A bracket advances exactly one team. A drawn semi-final has no representable outcome: there is
no seat for two teams, and `KnockoutSeat` resolves from a previous round's winner. This is not
a preference, it is forced by the structure.

So the refusal is **narrowed, not deleted**. A level score is legal in a group fixture and
still refused in a knockout one, with its own message — the existing `drawCannotEnd` copy is
wrong for the new world (*"Add the deciding point first"* is exactly right for a semi-final
and exactly wrong for a group match). The group rule becomes "a draw is a result"; the
knockout rule stays "play on".

This also means the database CHECK cannot simply be dropped. It becomes conditional, so that a
completed match without a winner is still impossible **unless the scores are level**:

```sql
CHECK (status <> 'completed' OR winner_team_id IS NOT NULL OR score_a = score_b)
```

That keeps the constraint doing its real job — catching a completed match that lost its
winner through a bug — while admitting the one case that is now legitimate.

### 3.1 The marshal must be told, and the match does not currently know

*Added 2026-10-04 on the organiser's instruction: knockout matches are to be indicated as such
on the court-marshal screen, and a level knockout match plays on into overtime until one team
takes the tiebreaker.*

Two obstacles and one piece of luck.

**The match has no stage.** `tournament_match` carries no `fixture_id`; the link runs the
other way (`tournament_fixture.match_id`, `UNIQUE`). Worse, it is *optional* — `POST /matches`
starts a match from a **team pair**, and `claimFixtureForMatch` then attaches "the fixture this
pair fulfils, **if the schedule suggested one**" (ADR-089). A match played off-schedule has no
fixture and therefore no stage.

So `MatchView` gains `stage: 'group' | 'knockout' | 'third_place' | null`, resolved by a
reverse join, with **null meaning unscheduled** rather than meaning group. Denormalising the
stage onto `tournament_match` at claim time was considered and rejected: it would mutate the
match row after creation and leave the column lying whenever a claim never happens. The join
is cheap — `match_id` is already unique-indexed.

A third-place fixture is its own stage (ADR-137) and, like a knockout, must produce a winner.
So the rule keys on "can this stage draw?", which is true for `group` and `null` and false for
`knockout` and `third_place` — not on a `=== 'knockout'` test, which would quietly let the
third-place play-off end level.

**The luck:** `CourtPage.tsx:76` already renders *"Level at 5 - 5. Play the deciding point."*
and withholds the end button on any level score. Overtime is therefore **already the shipped
behaviour** — it is simply applied to every match indiscriminately. This change does not add a
mechanism; it splits one that exists. Knockout keeps play-on, now badged and named as
overtime; group gains a draw button where the refusal used to be.

### 3.2 The 0 – 0 collision, and what it costs

`assertWinnerMatchesScore` opens with `if (match.scoreA === 0 && match.scoreB === 0) return;`
— an unscored match lets the marshal name the winner by hand, for "a marshal who ran the
court without touching the strip". If a level score now pays a draw rate, 0 – 0 is ambiguous:
untracked, or goalless?

**Ruled 2026-10-04: in a group match, 0 – 0 IS a draw.** Level means drawn, with no exception
for zero.

This **retires the untracked-winner path for group matches**, and that cost should be stated
rather than discovered. A marshal who ran a group match without touching the strip can no
longer close the court by naming the winner; they must record at least one point. The original
comment argued that refusing "would force a marshal to invent a 1 - 0 just to close a court".
That is now the accepted trade — and it is arguably the more honest system, since it stops
accepting a winner for which no evidence was ever entered.

**But the escape hatch must survive where a draw is illegal.** A knockout or third-place match
at 0 – 0 cannot be a draw, and if the marshal also could not name a winner it could never be
closed at all — the bracket would deadlock. So:

```
canDraw = stage !== 'knockout' && stage !== 'third_place'
```

- `canDraw` — any level score, including 0 – 0, may be ended as a draw. No winner may be named
  against a level score.
- `!canDraw` — 0 – 0 keeps today's behaviour (the marshal names the winner); any other level
  score plays on into overtime.

An **unscheduled** match (`stage === null`) counts as `canDraw`. It pays participant points
like any other match but, having no fixture, never reaches `foldStandings`, so a drawn one
touches no group table.

### 3.3 Overtime ends on the next point

**Ruled 2026-10-04: golden point.** The first team to lead wins; there is no win-by-two.

This is the cheapest possible outcome, because it is **exactly the rule the server already
enforces** — `assertWinnerMatchesScore` names the leader and accepts them. No second refusal
case, no new state. The whole change at the knockout end is presentation: badge the match, and
replace *"Level at 5 - 5. Play the deciding point."* with overtime wording that says why this
particular match cannot be drawn.

**Not a new match state.** Overtime is not stored, because nothing in the schema knows where
regulation ended — there is no target score. "Overtime" is a *reading* of the live score: a
knockout match, level, with points on the board. Adding a column for it would mean inventing a
regulation length the tournament does not have.

---

## 4. Two different currencies, and only one of them was ruled on

Worth separating, because they are easy to conflate and they live in different places:

- **Participant points** — `tournament_win_points` / `tournament_loss_points` in
  `app_config`, frozen per match into `points_awarded_snapshot`, paid to each person on the
  roster. This is the thing F-1 ruled on: a third rate, `tournament_draw_points`, paid to
  everybody in a drawn match.
- **Group standings** — ranked by `wins`, an integer counted in the engine. Nothing to do
  with the config rates.

The ruling is about the first. But it forces a decision about the second, because `wins` and
`losses` no longer partition the results and `rankStandings` orders cohorts by `wins` alone.

**Proposed, and what I will build unless told otherwise:** keep **wins** as the primary key
and insert **draws** immediately after it — wins, then draws, then head-to-head, then point
difference, then seed. A draw becomes strictly better than a loss and strictly worse than a
win.

The alternative is a football-style 3–1–0 points ladder, which I am not proposing: it silently
re-ranks the whole table (three draws would overtake one win), and ADR-149 deliberately fixed
the qualification rule as absolute wins and refused to change it after the first whistle.
Adding a new tiebreak *below* the existing primary key leaves every ranking that exists today
unchanged — it only separates teams that are currently tied. That is the smallest honest
change, and it keeps ADR-149's promise intact.

---

## 5. The rest of the blast radius

- **`points_awarded_snapshot`** must carry `drawPoints`. ADR-005's freeze means a match
  completed before the rate changes keeps the rate it was played under. Matches completed
  *before this ships* have no `drawPoints` key — they also have a winner, so they never reach
  the new branch, but the SQL must not assume the key exists.
- **`PointConfigInput`** (`db/entities/pointConfig.ts`), the contracts schema, and the
  superadmin point-config page each gain a third field.
- **`editMatchWinner`** — the correction path must be able to set a match *to* a draw and
  *away from* one, which changes who is owed points. It already pushes the board.
- **Match feed, hall screen, team line-ups** — anywhere that renders "Reef Raiders beat Kelp
  Kings" needs a drawn-match phrasing. The screen is under the no-interaction rule (standards
  rule 14) but its copy still has to be right.
- **`messages.ts`** — `drawCannotEnd` is rewritten for knockout and a new group-draw
  confirmation is added. `duplicated-copy` will see both.
- **The champion bonus (ADR-136)** — worth re-reading its edge cases against a bracket that
  can now be fed by a group stage containing draws.

---

## 6. Build order and cost

1. **Schema + config** — `tournament_draw_points`, the conditional CHECK, `PointConfigInput`,
   contracts, the superadmin field. ~½ d
2. **The engine** — `winnerTeamId: string | null`, a `draws` counter, the two tiebreaks, the
   new sort key. Type-first, so the compiler lists the call sites. ~½ d
3. **The leaderboard CASE** — three-way, NULL tested first. Small, and the highest-risk line
   in the change. ~¼ d
4. **Routes** — narrow the refusal to knockout, allow the group completion, `editMatchWinner`
   both directions. ~½ d
5. **Surfaces and copy.** ~½ d
6. **Tests + a sabotage pass.** ~½ d

**≈ 2¾ days.**

The sabotage pass matters more here than usual, and it should aim at §2 specifically: revert
the leaderboard `CASE` to two branches, revert `else row.losses += 1`, and revert the
head-to-head comparator — each must turn a test red. All three of those are states the system
would otherwise reach without complaining, which is the whole argument for writing this note
before the code.
