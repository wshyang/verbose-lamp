# The one-way switch to court awards — revised plan for 5 Nov

**Date:** 2026-10-22 · **Status:** phases 0–2 built (ADR-337, ADR-338, ADR-339); 3–4 to come · **Event:** 5 Nov 2026
**Revisions ADR-332's** phases, return act, pre-armed tiers and global gate. Register entry: **ADR-336**.
**Fixes the scoring premise it rests on:** ADR-337 (phase 0) — a team award is worth its face value to
the cluster board once, and a member's share is the award divided by the roster.
**Assessment:** `dumb-mode-mid-tournament-switch-assessment.md` (ADR-328) · **Original plan:**
`2026-10-22-dumb-mode-switch-plan.md` (ADR-332, still the record of what it replaced).

## 0. The scoring premise — a team award is a team award (ADR-337)

The app decides the winning cluster by summing each cluster's members' points. A tournament award is
made to a **team**, so it must reach the board as the team's points, not as its points multiplied by
how many people were on the team. Today it is multiplied (`db/entities/leaderboard.ts`,
`tournament_award_points` and `team_award_points` pay every roster member in full), which means a
30-point win by a five-person team puts **150** on its cluster and the same win by a team one player
down puts **120**. A team that loses a player is not a weaker team; it must not earn its cluster less
for the rest of the day. ADR-320 and ADR-321 recorded the multiplication as intended ("replicated,
never divided"); ADR-337 reverses it.

**The rule.** A team award is worth its face value, once.

- **The ledger does not change.** One integer `tournament_award` row per award plus the roster frozen
  for it (ADR-276). `awardPoints` keeps its whole-number validation: nobody presses 7.5.
- **A member's slice is derived, never stored:** `award.points ÷ roster size`. A member's own
  tournament total is the sum of their slices; an entrant's team total keeps the face value.
- **A cluster's column is still the sum of its members' slices**, so the SQL shape is unchanged and a
  mixed-cluster team splits **proportionally, automatically**: fielding 3 of a 5-person team earns
  that cluster 3/5 of the award. No share table, no second copy of a number the award already states.
- **Round twice, at two scales, and never a third time.** The ledger stays exact, and nothing adds up
  displayed numbers:
  - **Six decimals before ordering.** `100 ÷ 7` summed seven times returns `99.99999999999999`, so two
    clusters that are level on 100 can differ in the fourteenth decimal. Comparing them exactly ranks
    them by float noise instead of by the `reached_at` tie-break, so the aggregate is collapsed to six
    decimals at the view boundary before it is compared or carried. No scoring decision can turn on
    the sixth decimal. The wire carries that same six-decimal value, so the number a cluster is
    ranked by and the number it is handed are one number — they can never disagree.
  - **Nearest integer at display.** `Math.round`, never truncation: truncation would paint that
    exact 100 as **99**, which is the bug this rule exists to prevent.
  - **`ORDER BY` moves off the `::int`.** Today the cluster query sorts the integer column; once totals
    are fractional, ranking them on the painted value makes two clusters 0.4 apart tie. The rank is
    computed from the collapsed exact value, and `reached_at` still breaks genuine ties (ADR-029).

**Worked example — 100 ÷ 7.** A team of seven is awarded 100. Each member's slice is
`100 ÷ 7 = 14.285714…`:

- **raw arithmetic:** `14.285714… × 7` returns `99.99999999999999`, not 100 — the reason for the
  sixth-decimal collapse before ordering;
- **each member displays:** `Math.round(14.285714…)` = **14**;
- **the cluster displays:** `Math.round(99.99999999999999)` = **100**.

Under truncation the same figures read **14** and **99** — a cluster losing a point it earned, off a
rounding artefact. The same 100 to a team split three and four shows **43** (`42.857…`) and **57**
(`57.142…`), summing to exactly 100 where truncation reads 42 + 57 = 99.

**The visible cost, accepted:** the rounded numbers on the board's row and the rounded numbers on the
people in it do not add up. Seven people on 14 look like 98 against a cluster showing 100. That is
inherent to rounding a display, and it is why the rounding happens in exactly one place.

**The second visible cost, also accepted:** two clusters can print the same integer at different
ranks — `#2 Cluster A 43`, `#3 Cluster B 43` where one is 43.4 and the other 43.1. To the room that
reads as a tie broken by who reached it first, which is exactly what ADR-029 does. Showing one
decimal on the cluster column would fix the appearance and put a second, differently-shaped number on
the projector; that trade was rejected.

**What this means for the tiers in §4.** A tier's number is the **team's** award — press `30` and the
team earned 30, each member shows 30 ÷ roster, and the cluster gains exactly 30 spread across the
clusters it fielded. The press value is never multiplied by the roster, which is what made the old
behaviour look like a different currency.

## 1. What changed and why

ADR-332 planned a reversible switch: pause the bracket, run court awards, resume later. The owner
has since decided the switch is **one-way** — extraordinary circumstances force it, and the day stays
on court awards for the rest of scoring. Four consequences follow, each of which removes work:

- **No return act at all.** No `resumeTournament`, no multi-interval feed, no seeds question. A
  bracket that was paused is never un-paused, and §6 of ADR-332 is moot: a fresh bracket after dumb
  awards was out of scope anyway, and nothing else ever needed seeds.
- **Per-court drain replaces the global gate.** ADR-332 had every court wait for the last live match
  anywhere, then flip together. Courts now flip as they go idle, which is faster and is what the
  room actually does.
- **Tiers are derived, not pre-armed.** ADR-332 assumed the desk types tiers onto the *fixture* draft
  at setup. The owner's model is better: the day's own paid rates already say every award the fixture
  mode could hand out, so the switch derives the buttons from them (§4).
- **Results are sectioned from the confirm instant**, not after the drain and not "follow the mode"
  as an interim. Per-court drain makes awards and a live match coexist for minutes, so the mixed view
  is needed from the first award, not from the last one.

A fifth change is not about the switch at all, but the switch multiplies it: **a team award must be
worth its face value to the cluster board.** Today the board replicates it per member, so a 30-point
win by a five-person team puts 150 on the board and the same win by a team one player short puts 120.
Dumb mode presses that button dozens of times an afternoon, so it ships first, as its own change
(ADR-337, phase 0, §0).

Everything else in ADR-332 stands: the pause in the core, the explicit mode at the edge, the guarded
desk act, the facilitator ask, and the refusal of a dumb Start beside a live bracket.

## 2. Owner decisions that bind this plan

| Question | Answer | § |
|---|---|---|
| Reversible? | **One-way**, locked at desk confirm. No resume command exists in the core, so a return is not merely hidden — it is unbuildable without a new ADR. | §5 |
| Who switches? | A facilitator **asks**, the desk **confirms** and may also initiate. Decline is a superadmin act. | §5 |
| Live matches at confirm? | They keep scoring. **Per-court drain**: a court with no live match awards at once; a busy court flips the moment *its own* match is scored and closed. | §6 |
| Tiers? | **Derived at the switch** from the fixture tournament's paid rates, editable in the confirm dialog, snapshotted onto the mode row. | §4 |
| Results for the mixed day? | **Sectioned**, awards above, a divider, match results below. | §7 |
| The end of the day? | The bracket **closes itself** the moment the drain ends, as the system actor, with the switch's reason. Nothing is left paused and the desk clicks nothing for the fixtures. The award day ends with the close it already has. | §6.4 |
| Naming? | No "dumb" in user-facing copy. Participants see a divider; the desk sees "awarding points". Internal identifiers keep their names. | §8 |
| What is a team award worth to a cluster? | Its **face value once**, not once per member. A mixed-cluster team's award reaches the clusters **proportionally** by member count. | §0 |
| What does a member's own total show? | Their **equal slice**: the award ÷ the frozen roster size. Cluster and individual boards therefore reconcile, and the cluster SQL keeps summing its members. | §0 |
| How are fractions handled? | Aggregated **exactly**; rounded **once, at display, to the nearest integer**. Never truncate, never sum displayed values. | §0 |

## 3. Reused unchanged

`dumb_courts`, `tournament.dumb_tiers`, `activateDumb`, the award and void routes with `client_uuid`
replay, the points bridge (`freezeSlot`), the court award page, `/dumb/status`, `closeTournament`,
the already-empty podium, announcements, the `tournament_event` log.

## 4. The tiers are the day's own rates

**A "point" in this plan is a cluster point** — the unit the leaderboard adds up to decide the winning
cluster, and nothing else. It is not a ranking point.

Two numbers live on a stage and they look alike:

| Number | Where | What it does | In this plan? |
|---|---|---|---|
| `tablePoints` | `Stage.tablePoints`, default `DEFAULT_TABLE_POINTS` = **3 / 1 / 0** (`core/standings.ts:13`) | Ranks teams inside a stage so the tables can pick who advances. **Never paid to anybody** (ADR-320). | **No.** Never read. |
| `rates` | `Stage.rates ?? Tournament.rates` — the setup form defaults to **30 / 20 / 10** | The value a result pays, per person. Written as a `tournament_award` row, summed into `tournament_points`, added to `fringe_points` for `total_points` (`db/entities/leaderboard.ts`) | **Yes.** This is the only source. |

So the day already knows every cluster-point award it could hand out. A tier is `{ label, points }`,
and dumb mode has no matches, stages or wins, so a tier is a **press surface**: the facilitator picks
the number they would have awarded, and that number is a cluster point, verbatim, into the same
ledger a fixture result writes to. No conversion, no second currency, no separate scoring points.

**Derivation** (`deriveAwardTiers`, pure, in `apps/api/src/tournament-mode/`):

1. For every stage in `state.stages`, take its **paid** rates: `stage.rates ?? state.tournament.rates`
   — the same resolution `ratesForMatch` uses (`packages/tournament/src/core/awards.ts:25`).
   **`tablePoints` is never read**, in any branch; the 3/1/0 is a ranking device and pressing it at a
   court would pay 3 cluster points for a win the fixture day paid 30 for.
2. Collect `win`, `draw` and `loss` from each. **Drop the `draw` value on a stage whose
   `allowsDraws` is false** — a bracket cannot produce it, so it is not a possible award there.
3. Drop `0`. A zero-point award is never written by a result (`awards.ts:46`) and can never be
   awarded by hand (`isAwardable`, `awards.ts:77`), so it would be a dead button. (A day at the form's
   30/20/10 keeps all three.)
4. Dedupe by **points value**, not by label: the same number arrives from different stage/result
   pairs (30 from a group win, 30 from a knockout loss).
5. Sort **descending** — the biggest award is the first button under the thumb.
6. Label is the number: `30 pts`. A label cannot name a stage or result, because one value stands for
   several of them, and the room is not reading provenance at 14:20.

*Example.* Tournament rates 30 / 20 / 10; the pool inherits them; a knockout stage overrides to
50 / 20 / 20 but allows no draws. Collected: 30, 20, 10, then 50, 20 (its own 20 already counted —
a knockout loss and a knockout draw would pay the same, and only the non-draw values exist there).
Deduped and sorted: **50 · 30 · 20 · 10**, four buttons.

**The press is the team's number (§0).** A `30` on a five-person team puts **30** on the cluster
board — 30 ÷ 5 = 6 to each member, summed back to 30 — not 150. So the derived value is the team's
award, and nothing at the court needs to know the roster size to know what a cluster will gain.

**No silent truncation.** The tier editor caps at four today (`SetupPanel.tsx:116`) and a nine-team
day with two overrides can derive five or six. Raising the limit to **eight** is cheaper than
dropping a tier the facilitator needs: the court page is a grid and wraps. The desktop editor is the
only place four is load-bearing, and it stops being a limit at all for derived sets.

**The legacy defaults are not the derivation.** The dumb setup form ships `Played 2` and `Gold 10`
(`useTournamentSetup.ts:53`) — a vocabulary from before the switch existed, unrelated to any day's
rates. Those stay where they are, for a dumb-only day built from the setup screen. A switched day
never shows them.

**No silent truncation.** The tier editor caps at four today (`SetupPanel.tsx:116`) and a nine-team
day with two overrides can derive five or six. Raising the limit to **eight** is cheaper than
dropping a tier the facilitator needs: the court page is a grid and wraps. The desktop editor is the
only place four is load-bearing, and it stops being a limit at all for derived sets.

**A restaged day derives from the day as it is.** ADR-334's restage replaces stages in the loaded
state, so the derivation reads the stages that will actually be played, not the stored plan.

**The desk may edit.** Tiers are *chosen at the switch*: the dialog shows the derived rows and the
desk may add, edit or delete before confirming. The committed set is snapshotted onto the mode-change
row, so later edits rewrite no history.

## 5. The switch

`POST /api/admin/tournament/mode/switch { reason, confirmation, tiers, clientUuid, requestId? }`,
superadmin only, one transaction:

1. Refuse unless `confirmation.trim().toLowerCase() === 'switch'`. Case-insensitive and trimmed on
   purpose: the guard against a slip must not become a spelling test for someone under pressure.
   The reason is required, as with every other desk act that ends something.
2. Pause the fixture tournament (core command, §5.1 of ADR-332).
3. Derive the tiers (§4), take the desk's edits, snapshot them.
4. Create and activate the dumb tournament over the fixture tournament's non-withdrawn entrants.
5. Write the mode-change row, resolve `requestId` as `confirmed` if present, announce
   "Courts are now awarding points. See Results."
6. If **no** match is live, close the fixture tournament now, as the system actor, incomplete, with
   the same reason (§6.4). If matches *are* live, leave it paused; the drain finishes it.

`clientUuid` is unique: a double tap replays the first result and switches once. Refusals: no live
fixture tournament; already switched; a tier set that is empty or carries a non-integer point value.

**No resume exists.** `packages/tournament/src/core` gains `pauseTournament` only. There is no
`resumeTournament`, no `tournament_resumed` event, and the Control page never says "Paused" — it says
fixtures have stopped and the day is awarding points. Making a return means writing an ADR, a core
command and a guarded route, which is the point.

## 6. The drain

### 6.1 What each court does

- **No live match:** the court is an award station from the second of confirm. The station picker
  already routes to the award page on `/dumb/status`.
- **Live match:** the court keeps its match page. Scoring, correcting, handing back and completing
  all work as today. The moment that match is closed, the court's next visit lands on the award page.
- `/dumb/status` answers **active for `switching` and `dumb`**, not only `dumb` (ADR-332 §5.1 had it
  mode-exact, which would strand a court that finished early on the match page).
- The station picker therefore needs a **per-court** rule, not a venue-wide one: a court is "Awarding
  points" when the mode is `switching` or `dumb` **and** that court has no match in progress.

### 6.2 The guard

No dumb award to a team that is still live on another court. The award route refuses with copy naming
the court, because paying a team that is mid-match would pay it twice for the same minutes and make
the Results line unreadable. Cheap to check: the entrant is seated in a match with
`status === 'in_progress'`.

### 6.3 The mode

`readOperatingMode` returns `fixtures | switching | dumb`. `switching` is what the room is in while
any match is live after a confirm; a switch confirmed with nothing live goes straight to `dumb`. The
desk console shows the drain by court so the desk can see what it is waiting for.

### 6.4 The bracket ends itself

After a completion (and after a call-off or a hand-back, which also remove a live match), the route
checks: mode is `switching` and no match is `in_progress`. If so, in that same transaction, run
`closeTournament` with `actor.kind = 'system'` — `isSuperadmin` accepts system
(`core/state.ts:73`) — and the switch's reason, then announce that the fixture day has ended
incomplete. The engine's own guards already give the right answers: no live match to refuse over, and
the reason is supplied because matches are unplayed.

So nothing sits paused, and the desk has no fixtures left to close. **The award day ends with the one
close a dumb day already has** (reason required when awards exist, as today). Points are untouched by
any of this: they landed in the ledger when the facilitator pressed the button.

## 7. Results for a mixed day

`GET /matches/feed` gains `mode: 'mixed'` and, alongside `items` and `awards`, the moment of the
switch. The participant render is one list:

```
Team Alpha is awarded 5 points!
Team Bravo is awarded 3 points!
——— Tournament switched to points award mode ———
Group A · Team Alpha 2–1 Team Bravo · final
Group A · Team Charlie 4–4 Team Delta · final
```

The feed is newest-first, so the divider sits where the switch happened and the older match rows fall
below it with no sort. No merged timeline (ADR-332 option C): the divider is the sort.

From the confirm instant, not from the end of the drain — the first award may land while a match is
still live, and the participant who just got paid must be able to see it.

## 8. Language

`dumb` is an internal word. It reaches a screen in exactly three places today — the setup dropdown
(`SetupPanel.tsx:153`, "Dumb courts — courts award points, no fixtures") and the tier field help
(`fieldHelp.ts:153`, `:195`) — while participant copy already avoids it
(`messages.ts:345`: "the courts are awarding points").

- Participant: the divider reads **"Tournament switched to points award mode"**; Results subtitles
  stay "Court awards, as they happen".
- Desk: **"Switch courts to awarding points"**, **"Courts are awarding points"**.
- Setup dropdown: **"Award courts — courts award points, no fixtures"**.
- Internal identifiers (`dumb_courts`, `dumb_tiers`, `tournament_dumb_award`, `DumbCourtPage.tsx`)
  keep their names. Renaming them is schema and API churn with no user-visible gain; the register
  records the internal name as legacy, and a rename is its own ADR if the mode becomes permanent.

## 9. Phases

Each phase is tests first, ships its own behaviour-tracking ADR, and passes `npm run verify`.

0. **Team attribution (ADR-337) — BUILT.** The two team-level arms of `participantPoints` divide by
   the roster length; the `::int` casts above them are numeric; the cluster and individual aggregates
   collapse to six decimals for ordering; one display formatter rounds. No schema change, no core
   change, no wire shape change. Verified in `tournament-team-attribution.test.ts` plus three
   recomputed suites (§10).
1. **Pause and precedence — BUILT (ADR-338).** Core `pauseTournament` + `tournament_paused` refusal
   for `startMatch` / `startPair`; scheduler `reconcile` no-op while paused; `readOperatingMode` in
   `apps/api/src/tournament-mode/`; ADR-332 §5.1's precedence table; a parallel dumb Start refused.
   No switch yet. `POST /api/admin/tournament/pause` lets the desk pause by hand.
2. **The desk switch and the drain — BUILT (ADR-339).** §4, §5, §6: derivation, one transaction,
   typed confirmation, per-court flip, the guard, the auto-close, `/dumb/status` widening, the
   per-court picker, announcements. `tournament_mode_change` is the append-only log, `switching` is
   the mixed window, and the three writers that used to open their own transactions gained
   `runCommandIn` / `createDraftIn` / `activateDumbIn` so the act is one commit. Verified in
   `tournament-tier-derivation.test.ts` (9), `tournament-switch.test.ts` (8), `useTournamentSwitch`
   and three Control-page cases.
3. **The facilitator ask — BUILT (ADR-340), its clock overruled by ADR-342.** ADR-332 §5.4 with one
   owner correction: one pending ask that **never expires** — the ten-minute expiry of ADR-332/336 was
   overruled, and nothing answers an ask but the desk. Confirm or decline at the desk, the Control
   banner (with the ask's age as its warning), the court-page redirect. The ask lives on the court
   page and the station picker, the switch resolves it in its own transaction, a decline reaches the
   asking court with its reason, and an immediate re-ask is allowed. Verified in
   `tournament-mode-ask.test.ts` (9), `useModeAsk` (10) and page cases across the court, picker and
   Control suites.
4. **Mixed-day Results — BUILT (ADR-341), owner chose option B.** §7: the `mixed` mode, the
   divider, the sectioned render. The earlier half is read from the mode-change log, so a separate
   dumb day (or next month's) never inherits a bracket it did not replace. Verified in
   `tournament-switch.test.ts` (10), `tournament-sizes.test.ts` (18) and two Results cases.

Nothing follows phase 4. There is no return phase.

## 10. Verification

- **Cluster attribution** (integration, real database, behind phase 0): a 30-point win by a two-person
  team pays each member 15 and moves the cluster column **30**, not 60; a mixed-cluster team fielding
  3 of 5 against 2 of 5 splits a 100-point award **43 / 57**, displayed as integers and summing to
  100; a 100-point award to seven equal members shows **14** each against a cluster showing **100**;
  ordering uses the exact value (two clusters displaying the same integer are still ordered by who is
  ahead, then `reached_at`); the entrant's `awardedPoints` and the Results line keep the face value.
  **Drift**: a 100-point award to a team of seven sums `99.99999999999999` raw and still displays
  **100**; two clusters mathematically level on 100 are ordered by `reached_at`, not by float noise;
  two clusters 0.4 apart keep distinct ranks even though both display the same integer.
  Bite checks: remove the division (the old 60 and 20 return), use truncation instead of rounding
  (43/57 becomes 42/57 and the seven-member 100 becomes 99), cast to `::int` in the arm (the fraction
  vanishes before it is summed), and order on the painted integer (the 43.4/43.1 pair ties).
- **Derivation** (unit): a pool inheriting 30/20/10 beside a knockout overriding 50/20/20 with no
  draws yields 50·30·20·10; zeros never appear; a value arriving from two stages appears once; a stage
  with `allowsDraws: false` contributes no draw; descending order; **a stage whose `tablePoints` are
  3/1/0 contributes nothing, and a day with no stage overrides derives only the tournament's own
  paid rates**; a restaged day derives from the replaced stages; a set larger than four is not
  truncated.
- **Cluster payment** (integration, real database): one press of a derived `30` on a five-person team
  adds a **6-point share** to each member's individual total and **30** to the cluster's
  `tournament_points` — its face value once, exactly what a fixture win at those rates produces
  (ADR-337 supersedes the replicated 150 this line originally described).
- **Core**: pause refuses start and pair-start, allows score, complete, correct, void, award; only a
  superadmin may pause; **no `resumeTournament` is exported**.
- **Integration** (real database, through `app.request()`): the switch refuses without the typed
  word, switches once on a repeated `clientUuid`, pauses the bracket, and creates the dumb tournament
  over the same entrants; a live match keeps scoring and its court flips on close; an award to a team
  live elsewhere is refused; the last completion closes the bracket incomplete as system with the
  switch's reason; a switch with nothing live closes it inside the switch transaction;
  `/dumb/status`, `/lineups` and `/matches/feed` follow the mode; wrong-party negatives (facilitator
  on switch and decline, participant on the ask, facilitator confirming).
- **Web**: the divider renders with awards above and matches below; the station picker routes a
  court with no live match to the award page during `switching` and leaves a busy court alone.
- **Size loop — BUILT.** A third reading in `tournament-sizes.test.ts` for every size from 7 to 12:
  a hybrid day interrupted mid-group-stage with matches on court — the switch, the guard naming the
  busy court, the drain of every live match, the bracket ending itself with the switch's reason, one
  derived-tier award to every team exactly once (a retried `clientAwardUuid` pays nobody twice), and
  Results keeping both halves (`mixed`, every finished match below the divider). Building it caught
  two facts the suite now records: the room reads "the day it is showing" as the last one *closed* by
  close time, so the rehearsal's third day runs a day later on the match-day clock — a clock run
  backwards between days would hand the drain's reads to the first day's bracket — and with two
  captains_ball days in one database, the retired bracket is found by the switch's own record, not by
  first-of-kind.
- **Bite checks**: remove the typed confirmation, the live-court award guard, the `clientUuid` unique
  index, the start refusal and the auto-close; a test must fail each time.

## 11. Risks

- **Mis-confirm is unrecoverable by design.** The typed word and the reason are the only guards. If
  5 Nov shows that is too thin, the fix is a two-person confirm, not a resume.
- **Derived tiers carry no provenance.** One `30` button can mean a group win, a knockout win or a
  knockout loss elsewhere in the day. That is the owner's model — no stage, no result, just cluster
  points — but the field help at the court must say so, and a facilitator who wants to record *why* a
  team was paid has no place to type it in this flow.
- **The visible sums will not add up (ADR-337).** Seven members shown on 14 sit against a cluster shown
  on 100. It is arithmetic, not a bug, but it will be asked about on the day: the person briefing the
  room should be ready to say "your share rounds; the board does not".
- **Fractional totals across the app.** Phase 0 changes the type of every point total in practice, and
  any screen or export that prints one without the shared formatter will show 14.285714. Grep for
  points before shipping, and treat a raw number on a screen as a defect.
- **The auto-close is a system act on a facilitator's route.** It must not fail the completion: if the
  close refuses for a reason the drain check did not foresee, the completion still stands and the
  bracket stays paused with a desk nudge on Control.
- **Pause is still a core change** — one field, one command, one refusal code, two guards. Review it
  as one.
- **Not in scope:** a per-court switch (the ask is venue-wide), a return of any kind, offline queuing
  of a switch, and any hall-screen treatment.
