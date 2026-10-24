# Can the tournament mode be edited after the tournament starts?

An assessment, not a build. Asked 2026-10-07, against `fcf4299`.

## Short answer

**Three of the five knobs can be made editable mid-tournament for very little work, and one of
them is arguably the most useful lever the day is missing. The other two cannot be edited at all
without throwing away played matches.**

The split is not a matter of taste. It falls directly out of *when each knob is consumed*, and
the codebase already makes that distinction — it simply never exposed it.

## What "the mode" actually is

Five values, defined identically on `tournament_plan` (the intended shape) and `tournament` (what
was actually activated):

| Knob | Values |
|---|---|
| `format` | `round_robin` \| `world_cup` |
| `groupSize` | 3–6 (plan); 2–8 (activation) |
| `advanceCount` | 1–2 (plan); 0–4 (activation) — **per group** |
| `hasThirdPlace` | boolean |
| `knockoutPairing` | `classic` \| `adjacent` |

ADR-150 already separates the two tables deliberately: the plan is *"the day's intended shape,
editable until it is used"*, and `tournaments` *"records what was actually activated and must not
change afterwards"*. The question on the table is whether that second clause is as absolute as it
reads.

## The finding that decides it: the bracket is built late

Activation (`activateTournament`, `db/entities/schedule.ts:106`) does **not** generate the
tournament. It consumes `format` and `groupSize` to deal groups and write the group fixtures —
and then stops. The knockout does not exist yet.

The knockout is generated later, by an explicit superadmin action — `POST
/tournament/close-group-stage` → `closeGroupStage` — which reads `advanceCount`,
`knockoutPairing` and `hasThirdPlace` **off the `tournament` row at that moment** and only then
writes the bracket fixtures.

So there is a real, operator-controlled window — from activation until somebody presses *close
the group stage* — during which three of the five knobs have been **recorded but not yet
consumed**. Changing them in that window is not a retrofit. It is writing a value before the
single place that reads it reads it.

## Knob by knob

| Knob | Consumed when | Still live during group stage? | Editable after start? |
|---|---|---|---|
| `advanceCount` | `closeGroupStage` → `rankQualifiers` | **Yes** — plus two derived reads | **Yes, cheaply** |
| `hasThirdPlace` | `closeGroupStage` (`schedule.ts:665`) | **Yes** | **Yes, cheaply** |
| `knockoutPairing` | `closeGroupStage` → `knockoutDrafts` | **Yes** | **Yes, cheaply** |
| `groupSize` | **Activation** — `dealGroups` | No; display only afterwards | **No** |
| `format` | **Activation** — `planKnobs` + `dealGroups` | No; shapes the final podium | **No** |

### Why the three are cheap

Nothing persisted depends on them before the group stage closes. The group fixtures were written
from `groupSize` alone and carry no reference to the knockout shape. Their only other readers are
derived on every read:

- `bracket.ts:148` — the `isQualifying` highlight in the standings table;
- `lateEntry.ts:177–180` — the "can this late team still qualify?" warning.

Both would simply recompute. There is no cache to invalidate beyond the existing
`TOURNAMENT_TAG`, no stored projection, no denormalised copy. The entire mechanical change is a
guarded `UPDATE` on three columns of one row.

### Why the two are not

`groupSize` was spent the instant the tournament activated: `dealGroups` shuffled the field into
groups, those groups are persisted in `tournament_entry`, and the round-robin fixtures inside
them are already written and, by now, partly played. Changing the number would not re-deal
anything — group membership does not re-read it — so the only effect would be that
`bracket.ts:42` reports a group size the groups do not have. **It would not reconfigure the
tournament; it would make the screen lie about it.** Genuinely changing it means re-dealing the
field and discarding every played group match.

`format` is the same argument with more force. `round_robin` is implemented as the degenerate
case — one group containing everybody, `advanceCount` 0 — so switching formats mid-flight means
re-dealing from one group to several or vice versa. It also retroactively changes how the day is
won: `finalStandings.ts:102` picks the podium from the table for a round robin and from the
bracket otherwise.

## The reason this is worth doing: it is the missing remedy for the 4.30 deadline

§5.1 of the programme requires the knockout to be **decided by 4.30pm**, with Captain's Ball
running 2.30–4.30. ADR-191 built the forward projection that finally answers *"are we going to
make it?"* — and it was deliberately read-only, because what was missing was sight, not control.

But if the projection says *no*, what does the superadmin actually do about it? Today: mark
fixtures `skipped` by hand, one at a time, which distorts the group table. The natural,
proportionate remedy is to **make the knockout smaller**, and that is exactly the knob that is
frozen.

Measured against the seeded field (12 teams, `groupSize` 4 → 3 groups, 18 group matches), using
the real `knockoutDrafts`:

| `advanceCount` | Qualifiers | Rounds | Knockout matches | +third place |
|---|---|---|---|---|
| **2** (current) | 6 | 3 | **5** | 6 |
| **1** | 3 | 2 | **2** | 3 |

Dropping `advanceCount` from 2 to 1 removes **three knockout matches and one whole round**. With
courts running in parallel the binding constraint is the round count, so that is roughly twelve
minutes off the critical path and a third of the knockout's court load — the difference between
finishing at 4.25 and overrunning the close. Dropping `hasThirdPlace` saves a match but little
clock, since it runs alongside the final.

That is a decision a superadmin would plausibly want to take at 3.45pm, with the projection on
screen telling them they are eight minutes late. It is currently impossible.

## What already exists, and the trap in it

`PUT /api/admin/tournament/plan` has **no guard against a running tournament.** A superadmin can
edit the plan at 3pm, save it successfully, and have it change nothing whatsoever — the running
day reads `tournaments`, not `tournament_plan`. ADR-169 even has a comment pinning this down:
*"the pairing frozen at activation, not whatever the plan says now."*

What saves it today is the UI, not the API: `TournamentPage.tsx:44` switches on
`tournament === null` and the knobs disappear entirely once a tournament is active. So the trap
is unreachable by hand — but it is an open endpoint whose success response means nothing, and if
mid-tournament editing is built, this is the first thing to resolve. Writing to the plan must
either be refused while a tournament is active, or redirected to the tournament row.

## Risks, in order of seriousness

1. **Legitimacy, not code.** This is the real cost. Teams play differently when they know one
   advances rather than two — a side that has qualified under `advanceCount` 2 can be eliminated
   retroactively by an edit made after they stopped trying. Changing the qualifying bar *after*
   results are on the board is a competitive-integrity problem no amount of correct code fixes.
   **Mitigation is procedural**: allow the change only while the group stage is open, show how
   many teams it adds or removes before it is saved, and record who changed it and why — there is
   precedent in the `editReason` column already on the schema.
2. **Validation gaps.** The activation schema admits `advanceCount` up to 4 against a `groupSize`
   as low as 2. Pre-activation that is merely odd; mid-tournament it needs a real check that
   `advanceCount ≤` the smallest group's size, or `rankQualifiers` silently returns fewer
   qualifiers than asked for.
3. **The one-qualifier edge.** `closeGroupStage` already handles `qualifiers.length < 2` by
   completing the tournament with no champion. An edit that drives the field below two must hit
   that path deliberately, not by accident.
4. **Moving ground under the late-entry desk.** `AdmissionPlan.canQualify` is computed from
   `advanceCount`. It is recomputed on every poll and explicitly never cached, so it is correct —
   but a marshal mid-conversation with a late team would see the answer change under them.

## Recommendation

**Build the narrow version.** A single endpoint that updates `advanceCount`, `hasThirdPlace` and
`knockoutPairing`, refused unless `status = 'group_stage'`, validated against the smallest group,
requiring a reason, and surfaced in the control room next to the ADR-191 projection rather than
as a resurrected configurator. Roughly: one route, one entity function, the validation, a panel,
and tests. Comparable in size to ADR-190.

**Do not touch `groupSize` or `format`.** Not "hard" — *incoherent*. The only honest way to
change either is to abandon the tournament and activate a new one, and if that is ever wanted it
should be built as exactly that, under its own name, with the destruction stated plainly.

**Leave `status = 'knockout'` frozen entirely.** Once the bracket is written the three knobs have
been consumed; editing them then would desynchronise the stored fixtures from the row that
describes them, which is the one failure mode with no clean recovery.

The sharpest framing: the question is usually read as *"can we reconfigure a running
tournament?"*, and the answer to that is no. The question worth answering is *"can we still
decide how the day ends, while the day is still being played?"* — and that one is yes, for the
three knobs that nothing has read yet.
