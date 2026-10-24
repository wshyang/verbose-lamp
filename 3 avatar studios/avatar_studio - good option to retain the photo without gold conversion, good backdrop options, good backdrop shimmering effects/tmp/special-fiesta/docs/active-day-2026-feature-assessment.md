# PSD Active Day 2026 — feature assessment

Assessed 6 Oct 2026 against the event write-up (programme, points system, activities, wet-weather
modes). Event: 5 Nov 2026, ~250–315 participants, 16 clusters. The real shape of the day is a staggered
departure from 12.50pm, a 1.45pm muster at Emerald Pavilion, the first activity at 2.30pm and a
5.30pm finish — the full run sheet is in `docs/design/agenda-tab-plan.md` §5. (This line used to
say "1pm–5.30pm", which was a guess made before the programme was to hand.)

**Status: assessment only. No code has been written, by decision.** Two scoring rulings were made
during this review and are recorded in §4.

The short version: the programme is already almost entirely covered by the app. Only one
published rule cannot be computed. But modelling the points arithmetic turned up a structural
issue with the cluster prize that matters considerably more than any feature on the list.

---

## 0. Gap register — every new feature identified

Seven gaps. **G1 is now built** (ADR-176); **G2 was withdrawn by ruling** and replaced by the
per-entity toggles that already exist. **G4 is now half-built from underneath** — the programme it
needed is a real table as of ADR-177, so the remaining work is one hall scene over an existing
query rather than a feature. **G5 is now closed as a deliberate non-build** (2026-10-07) — not
deferred, decided against, including the indicator this document once recommended. G3, G6 and G7
remain candidates, not commitments.

| # | Gap | What's missing | Workaround if not built | Cost | Verdict |
|---|---|---|---|---|---|
| **G1** | **Passport completion bonus** | ~~Nothing counts *distinct* stations per person~~ | — | Moderate | **BUILT** — ADR-176, derived on read, off by default (`fringePassportBonusPoints` 0) |
| **G2** | ~~**Wet-weather preset**~~ | **Withdrawn by ruling.** Switching courts and stations one at a time *is* the intended mechanism; no saved mode, no macro | Enable the indoor court, disable the outdoor ones; same for stations | — | **NOT A GAP** — rehearsed end to end, see §0.1 |
| **G3** | **Finalist bonus** | A champion bonus exists (winner only); "reach the final: 40" pays *both* finalists | Two manual score adjustments, two known teams, once | Low | Optional |
| **G4** | **Run-sheet screen scene** | ~~No programme anywhere~~ — `agenda_item` now exists with server-derived now/next (ADR-177); the 9 hall scenes still do not render it | Emcee announcements, or a participant's phone on the Ball tab's Agenda segment | **Low** — a 10th scene over `GET /api/agenda` | Optional, and cheaper than it was |
| **G5** | ~~**Roster composition rules**~~ | **Closed by ruling, 2026-10-07.** The registration form gates composition weeks earlier; by event day the rosters are fixed, so neither enforcement nor an indicator can change an outcome | The registration form, which already does this | — | **NOT BUILDING** — see §4 |
| **G6** | **Photo scavenger hunt prompts** | Photos, captions and voting work; there is no list of prompts and no scoring for completing them | Publish the prompt list on paper; award via an existing fringe station's tiers | Moderate | Use the workaround |
| **G7** | **Incident / first-aid alert** | No way for a facilitator to raise a safety alert to the superadmin | Shout, or phone | Low | **Flagged, not recommended** — see §5 |

### 0.1 Wet-weather rehearsal — the per-entity toggles, driven over HTTP (2026-10-06)

G2 proposed a saved wet-weather mode. That was withdrawn: courts and fringe stations are each
individually activatable, and the wet-weather response is to enable the indoor court and disable
the outdoor ones, and the same for the stations. No preset, no macro.

Everything that ruling describes already exists. It was not taken on trust — a throwaway stack was
run on a scratch database (three courts, four teams, a six-fixture round robin, one fringe station)
and the scenario was driven over the API. What the rehearsal established:

| Behaviour | Result |
|---|---|
| Disable two of three courts | 200, both flip to `isEnabled: false` |
| Start a match on a disabled court | **400 `Cannot start match on a disabled court.`** |
| Start a match on the enabled court | 201 |
| Court 1's `upNext` after the others go down | Offers a fixture **suggested for Court 2** — suggestions are advisory, not pins |
| Play the whole day on the one indoor court | **All 6 fixtures reached `played`**, no stall, no manual reassignment |
| Disable *every* court | No crash: reads stay 200, starts refuse, suggestion goes null |
| Re-enable a court | Next match starts immediately — recovery is instant |
| Deactivate a station with an open round | 200, `currentRound` closes to `null` (F36) |
| Open a new round on an inactive station | Refused (`activityInactive`) |
| Reactivate, open a fresh round, scan | 201 — clean recovery |

**The one real finding — deactivating a station does not stop scans.** A live scan into the
station's last round, made *after* deactivation and carrying a current `clientTimestamp`, returned
**201 and awarded its full 50 points**. The scan path never consults round status or
`activity.isActive`; the `activityInactive` guard sits only on *opening a round*
(`routes-fringe/index.ts:81`), not on scanning.

This is deliberate, and the comment says so — `recordScan`, line 207:

> `// ADR-009: the client's round is authoritative at sync time, even if it has since closed.`

It has to be, for offline stations: a scan queued at 4.02pm must still land when the phone
reconnects at 4.20pm, long after the round closed. Refusing scans into closed rounds would throw
away legitimate awards, which is the worse failure.

But it means **"deactivate the station" is not the kill switch an operator would assume it is**. In
the rain the superadmin switches the beach stations off and believes they are off; a marshal whose
phone still has the station page open keeps scanning, and the points keep counting. Nothing tells
either of them.

The distinguishing fact is already on the wire: a genuinely-queued offline scan carries a
`clientTimestamp` from *before* the round closed, a live scan after deactivation carries one from
*after*, and the server does not compare them. Three remedies were put up — tell the marshal in the
station page; refuse scans timestamped after the close; or flag rather than refuse.

**RULED 2026-10-06: leave it as is.** ADR-009 behaviour stands and nothing is to be built here.
Deactivating a station closes its round and blocks new ones; it does not stop a station page that
is already open from scanning into the round it holds.

**This is therefore an operational matter, and belongs in the day's briefing:** switching a station
off is not a kill switch for a marshal already holding it. In the rain, tell the beach marshals to
stop scanning as well as switching their stations off. The audit trail is intact either way — every
scan carries its facilitator and timestamp, and the correction desk can void anything taken after
the call.

**The last-court case needs no guard.** Disabling every court degrades cleanly and reverses in one
action, which in a downpour is a reasonable thing to want: it is "stop all play", not a broken
state.

Rejected outright, not counted as gaps: cluster size normalisation (§2, ruled out of scope),
in-app fringe-activity voting (the registration form already does it), and bespoke game types for
Bingo and trivia (they are fringe stations with award tiers, which already works).

---

## 1. What the programme needs, and whether it already exists

| Programme requirement | Status |
|---|---|
| Cluster score = anchor + fringe; prize to top cluster | **Built** — all 16 clusters shown, including zero-point ones |
| Captain's Ball, 8–12 teams, two groups, winners play the final | **Built** — `world_cup` format |
| Round-robin fallback if ≤5 teams register | **Built** — `round_robin`, chosen at activation |
| 3 courts, one inside the pavilion | **Built** — courts have labels and an on/off flag |
| Play a match: 10 · Win a match: 30 | **Built** — loss and win rates |
| Drawn and 0–0 group matches | **Built** — draw rate; value now set, §4 |
| Fringe stamp: 5 | **Built** — participation floor, already defaults to 5 |
| Top sand sculpture / trivia: 50 · Mystery challenge: 30 | **Built** — award tiers, up to 4 per station |
| **Completed passport (4 stamps): 20** | **MISSING** — nothing counts distinct stamps per person |
| Reach the final: 40 | **Partial** — a champion bonus exists; a *finalist* bonus does not |
| Exhibition match vs management | **Built** — play it as a friendly, off-fixture |
| Group photo, sharing, crowd favourites | **Built** — gallery, crowd voting, moderation, photo wall |
| **Photo scavenger hunt** | **Partial** — photos and captions work; there is no list of prompts and no scoring for completing them |
| Hall screen in the pavilion | **Built** — 9 individually switchable scenes |
| Stations losing signal on the beach | **Built** — offline mode with a sync queue |
| Teams arriving late | **Built** — late admission with a cutoff |
| Fixing a wrong score | **Built** — correction desk and adjustments, with reasons |
| Pacing the 2.30–4.30 window | **Built** — match length and changeover gap configurable |
| Team size 7+3 or 8+2; ≥50% female | **MISSING** — no roster cap, no gender ratio check |
| Wet-weather mode | **Pieces only** — courts and stations switch off one at a time |

Everything unmarked is configuration, not development.

---

## 2. Cluster size and the prize — RULED OUT OF SCOPE

For the record, since the arithmetic is surprising and will come up again.

A cluster's score is the sum of its members', and tournament points are paid **to every person on
the roster** — a team of ten winning a match generates 300 cluster points, not 30. So the total
tracks headcount. At ~70 points per participant: a cluster of 8 scores ~560, a cluster of 40
scores ~2,800. The larger cluster wins by 2,240 points without anyone trying harder.

**Decision (6 Oct): cluster headcount is not our problem. No normalisation will be built.** The
options considered and rejected were per-capita scoring and capping each cluster's top *n*
scorers. The published rule — highest total wins — stands as written.

## 2b. The anchor activity is not the biggest earner

| Award | Per person |
|---|---|
| Top sand sculpture / trivia | **50** |
| Mystery challenge | 30 |
| Win a Captain's Ball match | 30 |
| Complete the passport | 20 |
| A drawn match | 20 |
| One stamp | 5 |

A whole afternoon, per person:

| Route | Total |
|---|---|
| Fringe maximiser (5 stamps, passport, top sculpture, top trivia, mystery) | **175** |
| Captain's Ball group winner who also wins the final, 2 stamps | 160 |
| Captain's Ball mid-table (2W 2L), 2 stamps | 90 |
| Fringe only, 5 stamps + passport | 45 |

**The single largest award in the day is the sand sculpture, not winning a match**, and the best
fringe route out-earns reaching and winning the final. That may be exactly right — the stated aim
is a system that rewards teamwork rather than athleticism, and Captain's Ball only has room for
80–120 of the ~250 attendees, so over-rewarding it would punish everyone else. Flagging it only
so the balance is a decision rather than an accident. If the anchor should feel like the anchor,
the lever is the finalist bonus in §3.

---

## 3. Worth building, in priority order

### T1 — Passport completion bonus (4 distinct stamps → 20)

The only published rule the app cannot compute. Every other number is a config field; this one is
a count of *distinct* stations per person, which nothing tracks.

The alternative is ugly: either the bonus is not paid after being printed in the deck, or someone
reconciles stamps for 250 people between the 4.30pm close and the 5.10pm prize presentation —
forty minutes with a closing speech in the middle.

Cost: moderate. One config field, one term in the standings query, and progress on the
participant's own page. That last part is arguably the better half: "1 more stamp for 20 points"
is what moves people to the fifth station at 4pm.

### T2 — Wet-weather mode as a single switch

Every piece exists; the problem is that switching is five or six separate actions by one person,
on a phone, in the rain, while 250 people wait. A saved preset applied with one confirmation —
and reversible, since light rain explicitly expects play to resume.

Cost: low. A macro over existing endpoints, no new scoring logic.

### T3 — Finalist bonus (40 to both finalists)

Today's champion bonus pays only the winner; "reach the final: 40" pays both. Also the cleanest
lever for §2b if the anchor should out-earn the fringe.

Cost: low. But the workaround is genuinely fine — two score adjustments, two known teams, once.

### T4 — A run-sheet scene on the hall screen

The screen shows standings, matches and photos, never the programme. In a shortened wet-weather
run, when every memorised timing has moved, "now: Captain's Ball · 4.30pm return to the pavilion"
helps the room more than another leaderboard refresh.

Cost: **low**, and lower than when this was written. ADR-177 built the agenda for the participant
surface, which means the data this scene needs — the ordered programme plus a server-derived `now`
and `next` — already exists behind `GET /api/agenda`. What is left is a tenth scene and a layout:
no table, no routes, no admin screen. The scene would be individually switchable like the other
nine, and the hall screen is the surface where "4.30pm: return to the pavilion" does the most good,
because it reaches the people who are not looking at their phones.

---

## 4. Decisions

**Settled during this review:**

- **A drawn group match is worth 20** — twice a loss, two-thirds of a win. Note the consequence:
  timed beach Captain's Ball on sand produces a lot of draws, and two draws (40) score exactly the
  same as a win and a loss (40). If most group matches end level, the group table will be tight
  and tie-breaks will decide who reaches the final.
- **The 50-point awards are per person, as the app works today.** A winning sand-sculpture group
  of six therefore contributes 300 points to its cluster — more than that group would earn by
  winning two Captain's Ball matches. Deliberate, per §2b.

**Settled (2026-10-07).** All three of the questions this section used to leave open have been
answered. They are recorded here rather than deleted, because each one is a decision somebody
could reasonably have made the other way, and the reasoning is the part that is worth keeping.

1. **A win pays 30 in total, not 30 on top of the 10 for playing.** This is already how the app
   behaves — a completed match pays exactly one rate to each side, `winPoints` or `lossPoints`,
   never both — so the decision is a confirmation and there is no code change. The practical
   effect is that a win is worth three losses, and the draw at 20 sits between them as intended.
2. **The exhibition match does not score. It is a friendly.** Standings are presented at 5.10pm,
   fifteen minutes after the exhibition ends, and no result from a demonstration game should be
   able to move them. **This needs an action on the day, not a setting**: see the warning below.
3. **The app does nothing about team size (7+3 or 8+2) or the ≥50% female rule** — no
   enforcement, and not even the compliance indicator §5 used to suggest. The registration form
   gates composition weeks before anyone reaches the beach, so by event day the rosters are
   already whatever they are going to be, and a phone restating a rule it cannot enforce only
   invites an argument a marshal then has to settle. Gap **G5 closes as a deliberate non-build.**

> **Operational warning — a friendly scores if you record it.** The leaderboard counts every
> `tournament_match` that is `completed` and not voided. It does **not** check whether a fixture
> ever claimed that match, so an exhibition game started on a court console and scored like any
> other will pay 30 and 10 to its two sides and appear in the standings ten minutes later. The
> decision above is therefore an instruction to the marshals — **do not open the exhibition on a
> court console at all** — and not something the app currently guarantees. If that instruction
> looks too fragile to rely on, the build is a non-scoring flag on a match, excluded from the
> leaderboard's two `completed` filters; it has not been built because it was not asked for.

---

## 5. Not worth building

**Do nothing at all about the roster rule** — decided 2026-10-07, and this is stronger than what
this section originally said. Hard enforcement was never on: the failure mode is a real person on
a beach being told by a phone that they cannot join their colleagues. But the compliance indicator
this paragraph used to recommend instead is also out. An indicator reports on a rule the app has
no power over, at the one moment nothing can be done about it — the registration form closed
weeks earlier — so its only product is a team discovering on the sand that it is non-compliant
and a marshal having to say it does not matter. Cheaper than enforcement is not the same as worth
building.

**Do not build fringe-activity voting.** The registration form already does it, weeks earlier. The
app is an event-day tool; a second surface splits the data.

**Do not model Bingo or trivia as new game types.** They are fringe stations with award tiers.
Cluster Bingo is a station whose tiers are "line" and "full house". That already works.

**An incident / first-aid alert — flagged, not recommended.** No medic and no ambulance are
arranged, and wet pavilion edges are a named hazard. A button raising an alert to the superadmin
screen is cheap. I am not pushing it, because it would be dishonest to imply it mitigates the gap:
**a notification is not a medic.** If it makes anyone feel the first-aid item is handled, it has
done harm. Build it only alongside arranging real first-aid cover, never instead of it.
