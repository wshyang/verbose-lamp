# Tournament user flows — every actor, every chair

Date: 2026-10-01 · Grounded in the shipped surfaces (S21–S24, S60, Line-ups, the admin
Tournament console) and the shipped decisions (ADR-089/090/091/097/100/106/107). Flows are
numbered per actor; **⚠ marks a decision point**, **✗ marks an exception path**. Section 7
collects the gaps the walk-through exposed, ranked.

The cast: the **Director** (superadmin), the **Court Marshal** (facilitator), the
**Captain**, the **Player** (team member), the **Spectator** (participant with no team —
a third of the crowd), and the **Engine** (the scheduler — it has no phone, but it acts).

---

## 1. The Director (superadmin)

### D-1 · Morning: from crowd to draw
1. Dashboard bootstrap checklist → point config set, courts created/enabled, facilitators issued.
2. Teams form all morning (participant-controlled; the Director deliberately has no roster override).
3. **⚠ The freeze call.** Tournament page shows `teamCount`. The Director decides the moment the field is final — *everything downstream snapshots here*.
4. Preview draw — groups and fixture count, **no writes**; re-preview reshuffles until the shape looks right (⚠ group size vs court count vs daylight: 8 teams × groups of 4 on 2 courts ≈ 12 group matches ≈ the afternoon).
5. Activate (format, groupSize, advanceCount) → fixtures minted, court suggestions dealt, Line-ups tabs light up on 300 phones, up-soon LEDs arm.
6. Announce it (ADR-074) — the one channel that reaches everyone, now with browser notifications (ADR-103).
- **✗ The late team.** A team formed *after* activation exists for friendlies, chat and fringe — but is invisible to the tournament. There is no append path. → **G-1.**

### D-2 · Midday: steward of the queue
1. Standings per group update as marshals complete matches; the fixture table shows pending/claimed/played.
2. **✗ Team absent** (lunch, sea, mutiny): find their fixture → **walkover** → confirm (ADR-027) → opponent advances in standings, queue shifts, up-soon recalcs for everyone behind (and court toggles now reshape it instantly, ADR-107).
3. **✗ Both teams absent / daylight running out:** **skip** → fixture resolved with no winner.
4. **✗ Daylight collapse — cut the stage short:** today this is walkover/skip **one fixture at a time**, with a confirm each. Ten leftover fixtures = twenty taps under pressure. → **G-2.**

### D-3 · The gate: closing the group stage
1. Close is **refused while any group fixture is unresolved** (`groupStageUnresolved`) — the gate that makes qualifiers honest.
2. On close: cohort-wise tiebreaks rank each group (wins → head-to-head → mini-league → seed, ADR-106 — deterministic even for a three-way circle), qualifiers seed the bracket (winners first, byes to top seeds), knockout fixtures appear with TBD feeders.
3. **⚠ Point of no return:** after close, group results are frozen (`bracketLocked`) — the Director should sight the standings *before* closing. The UI shows them; nothing forces the look. → **G-5** (copy nudge).

### D-4 · Corrections: the radio flow (cross-actor)
1. Marshal declares the wrong winner → radios the Director (marshals cannot edit results — one writer of truth).
2. Stage open: edit winner + mandatory reason → standings recompute → audit row.
3. Knockout: edit allowed only while the downstream seat is untouched; **voids refused** (a bracket seat cannot hold "nobody").
4. **✗ Error discovered after the window:** by design, no edit — the recovery is human (announce, apologise, play on). The guardrail is correct; the *protocol* should be written down for event day. → **G-5.**

### D-5 · Endgame
1. The final's completion **auto-completes the tournament** (no downstream seat to feed).
2. **✗ The quiet ending:** nothing marks the champions anywhere a participant looks — the feed shows one more completed match, the board shows cluster points. The day's climax deserves a surface. → **G-3.**

---

## 2. The Court Marshal (facilitator)

### M-1 · Scheduled-day happy loop (the 20× loop — zero typing)
Console → pair **prepopulated** with "Up next here" (ADR-089) → teams arrive → Start →
confirm → play → winner button → confirm → fixture settles (ADR-090 CAS claim), points
flow, feed updates → next pair prepopulates. Repeat until sunset.

### M-2 · The no-show override
1. Scheduled team missing → marshal overrides one picker — recents pinned, the rest alphabetical (ADR-097/100).
2. **The console answers *before* start:** "On the schedule" vs "**Friendly — cluster points only**" — the marshal knows what the match will count for while the whistle is still in their pocket.
3. The skipped pair stays pending; the Director decides (walkover) over the radio.

### M-3 · Out-of-order rescue
Queue says pair #4 but pair #2 is standing right there → start them. The claim matches
any *pending* fixture with that pair (unordered) — playing early still settles the right
fixture. The schedule serves the marshal, never the reverse.

### M-4 · Mid-match exceptions
- **Cancel** — starter-only (prevents cross-court accidents). **✗ Shift change with a live match:** the *new* marshal can complete it (completion is any-facilitator) but cannot cancel it — ops note: cancel before handing over, or radio the Director. → **G-6** (runbook line).
- **Court disabled mid-match** — match finishes, no new starts.
- **Double-tap/second tab** — state machine + one-live-match-per-court index refuse cleanly.

### M-5 · No-tournament day
Flat pickers (recents still pinned), every match a friendly, cluster points only. The
console never mentions a schedule that does not exist.

---

## 3. The Captain

### C-1 · Enlisting (pre-freeze)
Form team → share join code (confusable-free, ADR-107) or add by nickname → watch the
teams list → **⚠ the captain's only tournament duty: exist before activation** (→ G-1's
other half: nobody tells captains when the freeze is coming → announce it, G-5 copy).

### C-2 · Reading the draw
Line-ups tab: group letter, full queue, **own fixtures highlighted**, suggested court on
each row, pull-to-refresh for NOW (ADR-096). "We're group B, three matches, likely Court 2."

### C-3 · The rally (the flow that wins matches)
Red LED on the Feed tab → up-soon banner "0 games away — head to Court 1" → **browser
notification even with the phone pocketed** (ADR-103) → captain rallies the six in team
chat (mates' lines blip while the room is open, ADR-104) → team at the court before the
marshal looks up.

### C-4 · After the whistle
Result lands in Results feed (own team highlighted) + standings shift + next fixture
visibly closer. **✗ Disputed result:** captain → marshal → Director radio chain (D-4);
the audit trail answers "who changed what, when, why".

### C-5 · The exit
- Group stage: eliminated quietly when the table closes. **✗ Nobody says "you're done —
  but the sandcastle podium pays 25"**. → **G-3** (same surface as the champions banner).
- Knockout: one loss = out; byes mean a top seed may wait a round (visible as a TBD seat).

---

## 4. The Player (team member, not captain)

- Same Line-ups/LED/notification flows as the captain — the rally works even if the
  captain's phone is dead, because *every* member gets the up-soon signal.
- Depends on team chat for "where are we meeting" — roster events + blips carry it.
- **✗ Transferred mid-day** (leave + join elsewhere): tournament entries are team-level;
  scoring snapshots rosters at completion time (ADR-005) — points history stays honest.

## 5. The Spectator (no team)

- Results feed + Line-ups as pure spectation; board for the cluster race — **their cluster
  earns from matches they never play**, which is what keeps a third of the crowd caring.
- Announcements (+ browser notifications) reach them for the finals call. **✗ Nothing
  pulls them to Court 1 for the final** — G-3's banner is also the spectator's invitation.

## 6. The Engine (no phone, strong opinions)

- Deal: shuffle → round-robin across `ceil(n/size)` groups (no one-team groups) → circle-
  method fixtures → court suggestions balanced across enabled courts.
- Lifecycle: claim (CAS, unordered pair, earliest pending) → settle on completion → feed
  knockout seats downstream → final completes the tournament.
- Judgment calls it refuses to make: no auto-start, no auto-walkover, no reseeding after
  close — humans decide, the engine bookkeeps.

---

## 7. Gaps the walk-through exposed

| # | Gap | Actor hurt | Proposal | Size |
|---|---|---|---|---|
| **G-1** | No path for a team formed after activation | Captain / Director | Ops rule now (announce the freeze, lock team creation at activation?); feature later: append-to-smallest-group while that group is unplayed | S (rule) / M (feature) |
| **G-2** | Cutting the group stage short = one walkover/skip per fixture, confirm each | Director | "Resolve remaining as skips" bulk action behind one ADR-027 confirm naming the count | S–M |
| **G-3** | No champions moment; no elimination/consolation message; no finals pull for spectators | Everyone | One completed-tournament banner on Feed/Board (champions + "fringe stations open till 6") — reuses the announcement overlay style | M |
| **G-5** | Freeze timing and the correction window live in heads, not copy | Director / Captain | Two copy nudges: pre-activation "teams formed after this are out", pre-close "group results freeze now"; plus a one-page event-day radio protocol in docs | S |
| **G-6** | Shift change with a live match: new marshal can complete, not cancel | Marshal | Runbook line; no code change (the restriction is the protection) | S |

Recommended order: **G-5 → G-2 → G-3 → G-1(rule) → G-6**, on the usual "copy and ops
first, features second" grounds. None are blockers for a demo day; G-2 and G-3 are the
two that would be felt at a real one.
