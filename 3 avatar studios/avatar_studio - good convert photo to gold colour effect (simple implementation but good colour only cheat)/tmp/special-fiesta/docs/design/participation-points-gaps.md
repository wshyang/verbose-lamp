# Participation-points gap analysis

**Design goal under test:** *taking part in anything yields you points, even if you lose.*

**Question asked:** where in the system is that currently **not** true — where does a participant
take part and receive nothing?

**Scope correction from the user (this drives the whole ranking below):** *teams are needed only
for the tournament; not everyone wants to play the tournament.* Being teamless is therefore a
legitimate way to attend the day, not a defect to be fixed. That single clarification moves the
centre of gravity of this analysis from the tournament to the fringe.

**Method:** read the authoritative points query, enumerate every surface a participant can act on,
ask whether that action can reach the query. Measured against the demo seed to turn the code
reading into counts.

---

## 1. The one place points come from

`apps/api/src/db/entities/leaderboard.ts` — the `participantPoints` CTE is the single source of
truth for every points number the app displays. It is a union of exactly **two** inputs:

| # | Source | Condition | Fan-out | Available to |
|---|--------|-----------|---------|--------------|
| 1 | `fringe_scan` | `is_voided = false` | `sum(points_awarded_snapshot)` | **everyone** |
| 2 | `tournament_match` | `status='completed' AND is_voided=false`, snapshots non-null | `winPoints`/`lossPoints` to **both** roster snapshots | team players only |

Three facts fall straight out of this and frame everything below:

- **There is no third input.** No participation ledger, no attendance record — a grep for
  `attendance` / `check_in` across the schema and every API route returns **zero hits**.
- **Losing a match is already handled correctly.** Source 2 pays *both* rosters; the demo pays
  `lossPoints = 3` against `winPoints = 10`. The one case the goal names explicitly works.
- **Given the correction, source 1 is the _only_ source for everyone who skips the tournament.**
  For roughly a third of the roll, the fringe path isn't the main path — it's the *sole* path.
  Every weakness in it is therefore a total loss for those people, not a partial one.

---

## 2. Measured on the demo seed

80 participants. 54 on a team, **26 teamless** (32.5%) — i.e. a third of the day opts out of the
tournament, exactly as the design intends.

Polled individually via `GET /api/admin/participants/:id`:

```
ZERO points:   24 / 80   (30%)  — every one of them teamless
fringe only:    2
tournament only:0
both sources:  54
```

Cross-referencing the seed's `team_membership` against its `fringe_scan` rows:

| Cohort | People | Scanned at ≥1 station | Total scans |
|---|---|---|---|
| **Teamless** (tournament opt-out) | 26 | **2 (7%)** | **2** |
| On a team | 54 | **54 (100%)** | 109 (~2 each) |

**The cohort that the fringe path exists for is the cohort not using it.** Every single team
player got scanned; 7% of the opt-out cohort did.

*Honest caveat:* this is fabricated seed data, not field telemetry. It cannot tell you how real
people behave. What it *does* evidence is the mental model baked into the project's canonical
demo — fringe is modelled as a side dish for tournament players, and the opt-out journey is
effectively not exercised at all. The 24 zero-point participants are not a simulation of apathy;
they're a surface the demo forgets to populate. That is itself a finding.

---

## 3. The gaps, worst first

### G1 — Podium-only fringe stations make non-placers *unrecordable* — on the only path a third of attendees have

`fringe_activity.award_tiers` is 1–4 `{label, points}` entries (ADR-092, which replaced the old
flat `point_value`). The server is strict about them —
`apps/api/src/routes-fringe/index.ts`:

```ts
const tier = activity.awardTiers.find((entry) => entry.label === input.body.tierLabel);
if (!tier) throw badRequest(messages.tierNotFound, 'tierLabel');
// ADR-092 — the tier list is the integrity boundary, so a points number
// never travels over the wire.
```

A facilitator can only scan someone **into a tier that exists**. There is no free-form award. So
if a station is configured with placings only, a participant who took part and didn't place
cannot be entered into the system *at all* — the API rejects the scan.

Demo seed proof (`apps/api/src/db/seed-demo.sql` ~line 176):

| Activity | Tiers | Pays a non-placer? |
|---|---|---|
| **Sandcastle Sprint** | First 25 / Second 15 / Third 10 | **No — the scan is rejected** |
| Beach Volleyball Rally | Award 15 | Yes |
| Tug of War | Award 20 | Yes |

Two of three demo stations honour the goal by accident of configuration; the third breaks it.
Nothing in the schema or at the API edge requires a station to carry a participation tier — the
entire design goal rests on whoever types the config remembering to.

This is #1 because of the user's correction: for a team player, a missed Sandcastle scan is one
lost item among many. For someone who skipped the tournament, the fringe path is all they have,
and this punches a hole straight through it.

### G2 — Participants have no self-serve way to earn anything

`fringe_scan.facilitator_id` is `NOT NULL`. Combined with source 2 being staff-operated, **every
point in the system requires a staff member to act on you.** A participant cannot register their
own participation in anything.

For a team player that's fine — fixtures drag staff to them automatically. For the opt-out cohort
there is no such gravity: if no facilitator happens to scan them, they are invisible to the
leaderboard for the entire day, no matter how much they did. This is the mechanism behind the
7%-versus-100% split above.

### G3 — Everything the opt-out cohort *can* do alone pays nothing

The surfaces a participant can drive without staff — `routes-gallery/` (photo upload, voting,
reporting), chat, team chat, avatar studio — award nothing. A grep for `points` across
`apps/api/src/routes-gallery/` returns **zero hits**.

G2 and G3 compound: the only things you can do under your own steam are precisely the things
worth zero, and the only things worth something require someone else to initiate. For a
non-tournament attendee that combination is close to airtight.

### G4 — Walkover: the team that *showed up* earns nothing

`apps/api/src/routes-superadmin/tournament.ts:113`, comment verbatim:
*"A no-show: counts for the table and the bracket, awards no cluster points."*
It sets `tournament_fixture.status='walkover'` + `walkover_winner_team_id` and creates **no
`tournament_match` row**, so source 2 never fires. `TournamentPage.tsx:308` says so in the UI.

Penalising the absent team is reasonable. The team that turned up, waited, and was sent home with
zero is the contradiction — they'd have scored better by playing and losing.

Note how often this can fire: the group stage **cannot close while any fixture is unresolved**
(409, *"Resolve every group fixture"*), so walkover and skip are the pressure valve for a day
running late. `fds.md` never mentions walkovers at all — an ops escape hatch, not a spec'd rule,
so its zero-points behaviour was never actually a design decision.

### G5 — Cancelled match: teams played part of a match, get nothing

`cancelMatch` (`apps/api/src/routes-tournament/matches.ts:271`) sets `status='cancelled'`, which
the `status='completed'` filter excludes. Both teams took the court — possibly played most of the
match, possibly with a score on the board — and both get nothing.

### G6 — Skipped fixture: neither team recorded as having played

`skipFixture`, group stage only. Same shape as G4 with no winner at all.

### G7 — `tournament_loss_points` may legally be set to 0

`point_config.tournament_loss_points integer NOT NULL CHECK (>= 0)`. The demo sets 3, honouring
the goal. Nothing stops a superadmin setting 0 and silently switching off participation points for
the whole tournament. If "even if you lose" is policy rather than preference, the floor belongs in
the `CHECK` (`>= 1`), not in seed data.

### G8 — Swag stations hand out items, not points *(deliberate — flagged for a ruling, not accused)*

`swag_station.items` is `[{label, limit}]` (`schema.sql:193`); `routes-swag/index.ts` mentions
points only in a comment explaining it doesn't award them. Collecting a tote bag probably
*shouldn't* score. But it is a counter where participants queue and are scanned and receive no
points, so it needs an explicit yes/no rather than silence.

### G9 — Roster snapshot is taken at match time *(narrow)*

A substitute who actually plays but isn't in the snapshot gets nothing; someone joining the team
later isn't retroactively paid. Correct as an audit decision; noted as a known edge.

---

## 4. Not gaps (checked and cleared)

- **Voided match / voided scan** — excluded by `is_voided = false`. Punitive, intentional.
- **Losing a completed match** — pays `lossPoints` to the full roster. Works.
- **A draw** — `CASE WHEN winner_team_id = team_a_id THEN win ELSE loss END` pays `lossPoints` to
  both sides when the winner is null. Nobody gets zero.
- **`UNIQUE (participant_id, round_id)` on `fringe_scan`** — I flagged this as "you only get paid
  once per round" and was wrong. A round belongs to one `activity_id`, so the constraint is one
  scan per participant *per round of that activity*. Doing three different activities pays three
  times. It only blocks double-scanning the same round, which is correct.
- **Scanning into a closed round** — allowed on purpose. `recordScan` loads the round by id
  without a status check: *"ADR-009: the client's round is authoritative at sync time, even if it
  has since closed."* The offline queue can't lose a scan to a round closing. Good.

---

## 5. Shape of a fix, if one is wanted

No code written. The gaps now sort cleanly by how much of the goal they recover per unit of work:

1. **Config guard, cheap, no schema change — closes G1.** Require every `fringe_activity` to carry
   at least one non-placing tier, validated at the API edge where `award_tiers` is already
   validated. Optionally raise the `tournament_loss_points` floor to 1 (G7). This is the single
   highest-value change on the list: it repairs the only path a third of attendees have, and it
   costs a validator.
2. **Make the non-paying terminal states pay — G4, G5, G6.** Each needs a decision on *who* is
   paid and *how much*. Note the point config has no "turned up" rate today, so this likely means
   a new field.
3. **Give participants self-serve agency — G2, G3.** This is the structural one and the only item
   that adds a third input to `participantPoints`. It is what the demo's 7%-versus-100% split is
   really pointing at.

Tier 1 is a validator. Tier 3 is a feature.

---

## Open questions for the user

1. **G1 — should a participation tier be mandatory on every fringe station?** Given your
   correction, I think this is the one to fix first and it's nearly free. Say the word and I'll
   implement the validator plus the Sandcastle Sprint seed fix.
2. **G2/G3 — should taking part be self-serve at all,** or is "a facilitator scans you" the
   deliberate integrity boundary you want to keep? ADR-092's comment suggests the latter is a
   considered position, in which case the fix for the opt-out cohort is operational (more
   stations, more facilitators) rather than code.
3. **G4 — what should a walkover pay the team that showed up:** loss points, win points, or a new
   "turned up" rate?
4. **G8 — is swag in scope,** or is collecting an item correctly worth nothing?
