# Roster repair — the superadmin touches a team

*Design note, 2026-10-04. Gap #1 of `superadmin-event-day-gaps.md`, now the top remaining
item. Written before the build so the one genuinely contestable decision — what happens to a
withdrawn team's unplayed fixtures — is visible before a thousand lines are written against
it.*

---

## 1. The gap, briefly

`/admin/teams` is a directory and says so in its own doc comment: *"Read-only: superadmins
observe rosters, captains manage them."* The authorization matrix enforces it —
`POST|PATCH|DELETE /api/teams` is `allow: ['participant']`. Every roster action is a captain
action.

That decision was made for a normal day. At 10:40 the captain is playing a match, their phone
is at 4 %, or they have gone to the food truck. Someone joins the wrong team off a
six-character code read out across a marquee and **nobody can move them**. A team locks itself
and the captain disappears; that team is frozen until 16:00.

The console already has four *"the record is wrong, fix it"* surfaces — void match, void scan,
adjust points, hide photo. Teams are the one object the whole tournament is built from, and
the one object with no such surface.

---

## 2. The finding that makes this cheap: history cannot move

The obvious fear is that editing rosters corrupts the leaderboard. It cannot, and the reason
is worth stating precisely because it is what bounds this whole job.

`tournament_match` carries `team_a_roster_snapshot` / `team_b_roster_snapshot` (ADR-005), and
those columns are not an audit decoration — they are the **only** path by which tournament
points reach a person:

```sql
FROM tournament_match m
CROSS JOIN LATERAL jsonb_array_elements(m.team_a_roster_snapshot) AS entry
WHERE m.status = 'completed' AND m.is_voided = false
```

`team_membership` is never consulted for historical points. Written in exactly one place
(`completeMatch`), read in exactly one place (`leaderboard.ts`). Each entry freezes
`{participantId, nickname, clusterCode}`, so the **cluster** standing is immune too.

**Therefore:** moving Priya from Reef Raiders to Dune Dogs at 11:40 cannot disturb one point
she earned at 10:15. Her name is already baked into those rows. A repair tool that touches
only `team_membership` is history-safe by construction — the same property that made ADR-149's
late entry strictly additive.

---

## 3. The hole in ADR-005, found while checking the above

ADR-005 says the roster is *"frozen at completion so later transfers cannot move history."*
That is exactly true and slightly misleading. The snapshot is taken at **completion**;
`startMatch` writes nothing. The window between first and final whistle is **not** frozen:

- Priya walks on court at 11:00 with Reef Raiders. At 11:05 she taps **Leave**. At 11:12 the
  match completes, the snapshot is read *then*, and she earns nothing for a match she played.
- Symmetrically, somebody who joins at 11:05 is paid for a match they watched.

There is no live-match guard on `/teams/:teamId/leave` or on the captain's kick, so this is
reachable today with no superadmin involved. It is rare only because it needs someone to
fiddle mid-match.

**Decision: allow it, and say so at the point of decision.** Closing the hole properly means
snapshotting at start as well, which changes ADR-005's semantics and is a separate piece of
work. What this tool will not do is let a superadmin walk into it unknowingly. When the team
has a live match the confirmation says, in words:

> *Reef Raiders are on Court 2 right now. If you move Priya before that match is completed,
> she will not be credited for it.*

Same principle as ADR-149's capacity sentence: the documentation goes where the decision is
made, not in a file nobody reads. The latent defect is recorded here and in the ADR so the
next person to touch `completeMatch` finds it.

---

## 4. The six actions

| Action | Shape | Notes |
|---|---|---|
| **Move** | expire membership in A, insert in B | One transaction. See §5. |
| **Add** | insert membership | For the straggler who never joined anything. Bypasses `is_locked`, as the captain's own add already does. |
| **Remove** | expire membership | Inherits the captain cascade. See §6. |
| **Force-unlock** | `is_locked = false` | The captain's phone died with the team locked. |
| **Transfer captaincy** | demote, promote | `transferCaptaincy` already exists; this exposes it to staff. |
| ~~**Disband / withdraw**~~ | *Not a separate action.* Emptying the team disbands it (§4.2.4) and that now skips its pending fixtures. | See §7's build note. |

---

## 5. Move is one transaction, not two calls

`ux_team_membership_active_participant` is a partial unique index — one active membership per
participant. Expire-then-insert in the wrong order is a `23505`. So *move* is one route and
one transaction, never a remove followed by an add from the browser. A client that crashed
between the two would leave a participant on no team at all.

---

## 6. Removing a captain cascades, and staff must see it coming

`invalidateMembership` auto-promotes the earliest-joined survivor, and **disbands the team if
there are none**. A superadmin removing a lone captain would therefore silently disband their
team. The cascade is correct — it is §4.2.3/§4.2.4 — but inheriting it silently from a staff
action is not. The confirmation names the outcome before it happens: *"Sam is the only member.
Removing them disbands Dune Dogs."* And if that team has unplayed fixtures, §7 applies and is
stated too.

---

## 7. Withdrawal: the unplayed fixtures are **skipped**, not walked over

This is the one decision with real competing answers, so here is the reasoning.

A team can be emptied — by removal, or by moving its last member elsewhere. If that team has
pending fixtures, something must happen to them. Two candidates:

**(a) Walkover to each opponent.** Everyone ends with the same number of results on paper.
But ADR-149 fixed the ranking rule as **absolute wins**, deliberately, and refused to change
it after the first whistle. Free wins feed straight into the qualification race: a team drawn
against the withdrawn side banks a win that teams in other groups had to earn. It is also
internally inconsistent — anyone who *already played* the withdrawn team and lost keeps the
loss, while anyone who had not yet played them gets a gift.

**(b) Skip them.** `tournament_fixture.status` already has `'skipped'`, `skipFixture` already
exists as a superadmin primitive, and `foldStandings` builds group tables only from *"played
(unvoided) matches and walkovers"* — so a skipped fixture contributes nothing to anybody's
record. No phantom wins. A win on this board stays a win.

**Decision: (b) — confirmed by the organiser 2026-10-04.**

> **Superseded in part during the build (2026-10-04).** The organiser further ruled that
> withdrawal must not silently un-team anybody: the team must be emptied first. That ruling
> removed this action's endpoint. §4.2.4 disbands a team the moment its last member goes, so
> an "empty but still live" team cannot exist, and a `/withdraw` route requiring one would
> have been unreachable in every case — 409 or 404, never 200. The fixture-skipping now hangs
> off the **disband cascade** in `removeMembershipWithin`, and the move/remove responses carry
> the `WithdrawalOutcome` so the console can state what it just did to the schedule. The
> ruling below — skip, never walkover — is unchanged and is what that cascade does.
 Withdrawal is a loop over an existing, tested primitive, which is the same
character as late entry. Played results involving the withdrawn team **stand** — they
happened, the snapshot already paid them, and ADR-149's rule that no resolved fixture is ever
rewritten holds here too.

The cost of (b) is an asymmetry, and the console names it rather than hiding it:

> *Dune Dogs withdrew. 2 of their 3 fixtures had been played; those results stand. The
> remaining 1 has been removed, so Kelp Kings play 2 group matches instead of 3.*

Expunging the played results — the FIFA-style "fewer than half played" rule — was considered
and rejected: it would mean un-paying points that the snapshots were specifically designed to
make permanent, and it changes the record of a match that genuinely took place.

---

## 8. The record: the team's own room, and what that cannot cover

Every repair with a **subject participant** posts a line into that team's chat, through the
existing `announceRosterEvent` path (ADR-063/ADR-130, which already handles the bus, the
watermark and the cache tag in one place). A *move* is naturally two lines, one in each room —
the team losing a player and the team gaining one each see it.

The existing kinds cannot carry this honestly. `team_chat_message.kind` is
`CHECK (kind IN ('said','joined','left'))`, and a room reading *"Priya left"* when a steward
moved her is a worse record than no record. Three new kinds, with their copy in
`messages.ts` where `duplicated-copy` can see it:

- `staff_added` — *"Priya was added by an organiser"*
- `staff_removed` — *"Priya was removed by an organiser"*
- `captain_changed` — *"Sam is now captain"*

**What this deliberately does not cover, recorded so nobody thinks it was missed:**

- **Force-unlock and disband leave no record.** `team_chat_message.participant_id` is
  `NOT NULL` and is the subject of the event; neither action has one. A disbanded team's room
  is also read by nobody.
- **No superadmin can read any of it.** There is no superadmin route for `team_chat_message`
  at all — by design, per the schema comment: the table was separated from the global room so
  that *"no test can be as reliable as a route that cannot reach the rows at all."* So this is
  transparency to the affected team, not an audit trail. "Who moved this person, and why?"
  has no answer at 16:00.

This was decided explicitly, with the gaps understood. A `roster_audit_entry` table remains
the obvious thing to add if the day proves it necessary.

---

## 9. Authorization

Six new superadmin routes under `/api/admin/teams/...`. The catch-all rule in
`authorization-matrix.test.ts` (`^(GET|POST|PUT|PATCH) \/api\/admin\/`, superadmin only)
covers them, but each gets its own wrong-party negative per AGENTS.md §6 — this is precisely
the kind of power where a participant reaching the route matters more than usual.

The participant-facing `/api/teams` routes are untouched. Captains keep every power they had;
this adds a second door, it does not move the first one.

---

## 10. Build order and cost

> **COMPLETE, 2026-10-04.** All five steps are done and pushed: the server half as `08e5890`,
> `6981e44`, `7088fce`, and the console surface as `1feac6b`. Written up as **ADR-154**.
>
> Two things in this document did not survive contact with the build. **Withdrawal is not an
> action** — the ruling that it must refuse while the team still has members leaves it no
> reachable state, because §4.2.4 already disbands a team when its last member goes; the
> fixture-skipping lives in `removeMembershipWithin` and both the move and the remove routes
> return the outcome. And **`GET /api/admin/teams` had to grow a `members[]` array**: the
> directory published nicknames only, and a nickname is not a handle.
>
> The console's remove and move confirmations call `GET /api/admin/teams/:teamId/repair-context`
> **before** they ask, because §3 (on court now) and §6 (last member) are both invisible from
> the directory row.


1. **Entities + transaction primitives** — `moveMember`, `addMemberAsStaff`,
   `removeMemberAsStaff`, `forceUnlock`, `withdrawTeam`. Mostly compositions of existing
   functions. ~½ d
2. **The three chat kinds** — schema `CHECK`, copy, `recordRosterEvent` widening. ~¼ d
3. **Routes + wire types + the consequence sentences.** ~½ d
4. **The console surface** on the existing `/admin/teams` rows, each behind a confirmation
   that states its consequence. ~½ d
5. **Tests** — wrong-party negatives, the move transaction, the captain cascade, withdrawal
   skipping only pending fixtures and leaving played ones alone, and the leaderboard being
   provably unmoved by a mid-tournament move. Plus a sabotage pass. ~½ d

**≈ 2¼ days**, up from the gap doc's 1½ because withdrawal came into scope.

The last test in that list is the important one: a participant whose points are already on the
board, moved to another team, and the board asserted byte-identical afterwards. That is the
claim in §2, and it should be a test rather than a paragraph.
