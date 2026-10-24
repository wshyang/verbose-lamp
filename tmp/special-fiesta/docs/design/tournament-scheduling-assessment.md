# Tournament scheduling — two formats, chosen on the day

**Status:** assessment only — nothing in this document is implemented.
**Directive:** team count is unknown until the actual day. Superadmin activates one of two
scheduling styles day-of: **few teams → round robin**, **many teams → world cup style**,
confirmed as *group stage (pools, mini round-robins) + single-elimination knockout*. The app
**generates fixtures and prepopulates its suggestion** on the court console; **humans can
override** the prepopulated pairing. Standings and the bracket are **participant-facing**.
**Relates to:** fds.md §2.5/§2.6/§3.2 (courts, matches, transitions), ADR-005 (roster
snapshots), ADR-027 (confirm before points), R-1 in
`facilitator-journey-assessment.md` (the team-picker hunt this largely obsoletes).

---

## 1. The one simplification to make before anything else

**Round robin is world cup with exactly one group and no knockout stage.**

Both formats decompose into the same three objects: a set of *entrants*, a set of
*generated fixtures* (who should play whom, in what order), and *standings* computed from
results. The "two algorithms" are one engine with two configs:

| | Groups | Advance to knockout |
|---|---|---|
| Round robin | 1 group of n | nobody — the table **is** the result |
| World cup | ⌈n/groupSize⌉ groups | top k per group → bracket |

Build it this way and the day-of decision is a config choice, not a code path; the group
table component, the fixture generator, and the standings math are written once and tested
once. This is the single biggest cost reducer in the whole feature.

## 2. What exists today vs. what is missing

**Exists and stays the truth:** `tournament_match` (ad-hoc, facilitator-started, winner →
cluster points via ADR-005 roster snapshots), courts with enable/disable, the corrections
system (void / winner edit with reason), the completed-match feed (S60), `point_config`
win/loss values, polling consoles.

**Missing entirely:** any notion of tournament, format, stage, group, fixture, seeding,
standings, entrant registration, or schedule. Also worth stating: **fds.md §2.6 specifies
matches as "ad-hoc; facilitator-driven"** — this feature amends the FDS and needs an ADR
(and an fds addendum note) saying so.

**Two data-model facts that constrain the design:**

1. **Teams are cross-cluster.** Points land on each member's own cluster. So seeding or
   grouping "by cluster" is meaningless; seeding is random (there is no prior ranking
   either). Group draw = shuffle.
2. **Matches have a winner but no score.** Captain's ball as modelled is strictly
   win/lose (`winner_team_ref` required at completion; cancel = no result). Consequences:
   group standings are W/L only; the classic goal-difference tiebreaker **cannot exist**.
   Available tiebreakers: wins → head-to-head → (if still tied) a playoff fixture or a
   superadmin pick. Adding score entry to matches is possible but is its own scope — flag,
   don't bundle.

## 3. Core model additions

Three tables plus one nullable link column. Names illustrative.

- **`tournament`** — one active row (singleton like `point_config`): `format`
  (`'round_robin' | 'world_cup'` — stored for display even though the engine only sees
  config), `status` (`'draft' | 'group_stage' | 'knockout' | 'completed'`), `config` jsonb
  (groupSize, advanceCount, knockout size), `activatedAt/By`.
- **`tournament_entry`** — the frozen entrant list: `teamId`, `groupCode` (`'A'`…), `seed`
  (shuffle order, kept for auditability), `isWithdrawn`. Created at activation; **the
  entrant set does not grow afterwards** (§5.1).
- **`fixture`** — a *suggested* matchup: `stage` (`'group'` or knockout round number),
  `groupCode`, `sequence` (play order), `teamAId`/`teamBId` (**nullable** in knockout —
  "winner of fixture #12" slots, carried as `sourceFixtureAId/BId`), `suggestedCourtId`,
  `status` (`'pending' | 'claimed' | 'played' | 'walkover' | 'skipped'`), `matchId`
  (nullable FK to `tournament_match`, unique — the claim).
- **`tournament_match.fixture_id`** — nothing else on the match changes. **Fixtures are
  suggestions; matches remain the truth.** A match with no fixture is a friendly — legal
  before, during, and after the tournament, awarding cluster points exactly as today.

## 4. The engine (pure functions, no I/O)

- **Group draw:** shuffle entrants, deal into ⌈n/groupSize⌉ groups, balancing remainders
  (prefer groups of 4, tolerate 3/5 — standard World Cup practice for awkward counts).
- **Round-robin fixtures per group:** the circle method — n−1 rounds (n even; bye row if
  odd), everyone plays everyone exactly once, and no team plays twice in the same round.
  `sequence` interleaves groups so no team plays back-to-back on the sand.
- **Court suggestion:** deal fixtures round-by-round across enabled courts
  (`suggestedCourtId`); purely advisory — any court console can run any pending fixture.
- **Knockout bracket:** from `advanceCount × groups` qualifiers, standard cross-pairing
  (1A–2B, 1B–2A…); byes for non-powers-of-two go to group winners by rank. Winner of each
  fixture flows into the next round's empty slot. Third-place match: config flag, default
  off (open question §8).
- **Standings:** fold completed *fixture-linked* matches into per-group tables (P/W/L,
  then head-to-head). Unlinked (friendly / overridden-to-unscheduled) matches award
  cluster points but never move the table — one rule, no ambiguity.

Every one of these is a deterministic pure function of (entrants, config, seed) or
(fixtures, results) — ideal unit-test material, no DB in sight.

## 5. The hard edges (where the real cost lives)

### 5.1 Activation freezes the field
Day-of flow: superadmin opens the Tournament page → sees the live team count → picks
format + knobs (defaults suggested from n) → **Preview** (dry-run fixture list, no writes)
→ **Activate** (transaction: snapshot entrants, generate group fixtures). Teams formed
after activation are not entrants — they can still play friendlies. Regenerate/abandon is
allowed only while **zero fixtures are claimed**; after first ball, the schedule is
append-only. (Late-entry append schemes — "new team plays everyone remaining" — corrupt
fairness and the bracket shape; recommend rejecting them outright.)

### 5.2 Prepopulate + override on the court console
`GET /api/tournament/schedule?courtId=…` returns the next pending fixture(s) for this
court. The console prepopulates Team A/B from the head of that queue — **the selects
stay**, exactly as R-1's fix left them, so override is just… using the select. Rules:

- Facilitator taps Start on the prepopulated pair → fixture is **claimed** (status-guarded
  `UPDATE … WHERE status='pending'` — PGlite's single serialized connection makes this
  race-safe, same reasoning as ADR-088's unique-index mint) → match carries `fixtureId`.
  Two courts prepopulated with the same fixture cannot both claim it; the loser's console
  re-pulls the next one.
- Facilitator overrides to a different pair → server looks for a *pending fixture matching
  that unordered pair*; if found, claims it (the humans just re-ordered the queue); if
  not, the match starts **unlinked** (a friendly). The console says which, in one line
  ("Fixture 14 of 28" vs "Friendly — not on the schedule"), before the ADR-027 confirm.
- Completion of a linked match flips the fixture to `played`; a knockout completion also
  fills the winner into the downstream slot (same transaction as `completeMatch`'s).
- **Cancel** un-claims the fixture (back to `pending`).

### 5.3 Closing the group stage
The knockout cannot seed from a partially-played group. Explicit superadmin action
**"Close group stage"**: any remaining group fixtures must first be resolved (played,
walkover, or skipped), ties broken (head-to-head, else superadmin pick, recorded with a
reason like the existing corrections), then knockout fixtures generate. Human-triggered,
not automatic — the day runs on sand time, and the person with the whistle decides.

### 5.4 Walkovers, no-shows, dropouts
Staff fixture action **walkover** (names the absent team; counts as a win for standings
but awards **no cluster points** — nobody played) and **skip** (counts for neither). A
withdrawn/disbanded team walks over all its remaining fixtures. These need their own
confirm dialogs and matrix rows.

### 5.5 Corrections vs. the bracket — the nastiest consistency problem
Today a superadmin can void a match or edit its winner freely. Once that match **fed a
knockout slot and the downstream fixture has started**, a winner edit would falsify the
bracket. Recommendation: winner-edit/void on a fixture-linked match is **blocked once any
downstream fixture is claimed** ("resolve on the sand; the bracket is history now"), with
the error naming the blocking fixture. Cascade-reopening downstream matches is
technically possible and operationally insane mid-event. Group-stage edits before the
stage closes are safe (standings recompute). This guard must be tested as hard as the
scan-number race was.

### 5.6 Roster churn
ADR-005 already freezes points attribution per match, and the *team* is the tournament
identity, so mid-tournament membership changes are tolerable. Worth one line in the rules
("the team entity plays, whoever is wearing it"), not machinery. Captains' `isLocked`
stays what it is — a join-control, not a tournament freeze.

## 6. Surface inventory

| Surface | What's new |
|---|---|
| **API — superadmin** | `POST tournament/preview`, `POST tournament/activate`, `POST tournament/close-group-stage`, `POST fixtures/:id/walkover` / `skip`, `DELETE tournament` (draft only); all need matrix rows |
| **API — staff** | `GET tournament/schedule?courtId` (prepopulation feed); `startMatch` gains optional `fixtureId` with pair-matching fallback |
| **API — all actors** | `GET tournament/standings` → `{ tournament, groups: [{code, table}], bracket }` — one endpoint, both formats (RR = one group, no bracket) |
| **Web — superadmin** | New **Tournament page**: live team count, format + knobs, preview table, activate; then fixture management (walkover/skip, close stage) |
| **Web — court console** | Prepopulated pair + "Fixture m of n / Friendly" line + "next up here" list; selects unchanged |
| **Web — participant** | **Standings page** (group tables + bracket tree), polling like the feed; a bracket renders fine as nested flex columns — no drawing library |
| **Contracts** | `TournamentView`, `FixtureView`, `GroupStandingView`, `BracketView` + messages |

## 7. What this does to R-1

When a schedule is active, prepopulation removes the wheel-hunt from every on-schedule
match — the facilitator's common case becomes *read two names, confirm*. R-1's Phase 1
(recents + disambiguated option text) remains worth shipping first: it is hours not days,
it covers the no-tournament mode and every override/friendly, and the scheduling work
composes with it rather than replacing it.

## 8. Open questions (cheap to decide now, expensive later)

1. Group-stage ties beyond head-to-head: playoff fixture or superadmin pick? (No scores
   exist, so goal-difference is off the table — §2.)
2. Third-place match: wanted?
3. Champion bonus points to the winning team's members' clusters, or is the ranking its
   own reward? (Everything today flows through per-match `point_config`.)
4. Should knockout losers' consolation friendlies be *suggested* (keeps eliminated teams
   playing — event-energy question, trivial to add as unlinked suggestions)?
5. Add score entry to matches someday? Affects tiebreakers and the feed; **not** needed
   for v1.

## 9. Testing it like the house tests things

- **Engine (pure):** property-style unit tests — every entrant plays every group-mate
  exactly once; no team twice in a round; bracket shape correct for n = 4…64 including
  byes; determinism given a seed; standings fold including head-to-head.
- **Entities:** fixture claim race (two starts, one fixture → one winner, status-guarded);
  knockout slot fill on completion; walkover standings; close-stage with unresolved
  fixtures rejected; correction-guard (§5.5) blocked/allowed matrix.
- **Routes:** authorization-matrix rows for every new endpoint (suite fails until
  classified, by design); activation idempotence; preview is write-free.
- **Web:** console prepopulation + override-to-friendly line; superadmin
  preview→activate flow; standings/bracket rendering from fixtures at various stages.
- **e2e (optional):** 6-team round robin driven through the demo flow.

## 10. Sizing and sequencing

| Phase | Contents | Rough size |
|---|---|---|
| **P0** | R-1 Phase 1 (recents + option text) — independent, ships now | hours |
| **P1** | Schema + engine (groups, circle method, standings fold) + preview/activate + entrant freeze | ~2–3 days |
| **P2** | Fixture claim + court-console prepopulation/override + schedule endpoint | ~1–2 days |
| **P3** | Knockout: bracket generation, slot flow, close-group-stage, walkover/skip, correction guard | ~2 days |
| **P4** | Participant standings/bracket page + superadmin fixture management UI | ~1–2 days |

Each phase is shippable and testable alone; P1+P2 already deliver a working round-robin
day (which is also the small-team day), so the riskiest format is de-risked first and the
knockout stage rides on proven rails. Total: the largest feature since chat — roughly a
week of focused work including the test surface, which is where at least a third of it
belongs.
