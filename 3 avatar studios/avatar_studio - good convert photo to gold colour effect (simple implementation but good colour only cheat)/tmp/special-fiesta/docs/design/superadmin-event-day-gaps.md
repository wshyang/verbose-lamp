# What the superadmin console is missing on the day itself

**Written 2026-10-04** against `arena/01a10097-special-fiesta` @ `1aaa548`, from one
perspective only: a superadmin at a laptop, at the back of the hall, between 08:00 and 16:00,
with three hundred people in front of them.

Everything asserted here was read out of the tree today, and several plausible gaps were
checked and found **not** to exist — those are in §9, because a list of missing things is only
useful if you can trust that the author tried to disprove each one.

The console is seventeen tabs and it is genuinely good at two of the three jobs it has:
**configuring the event** (points, activities, courts, facilitators, swag, tournament format)
and **correcting the record** (void a match, void a scan, adjust a participant's points, hide
a photo, retract an announcement). The third job — **running the day while it is happening** —
is where the gaps are, and they cluster in a way that is easy to state:

> Almost every surface answers *what has happened since the beginning of time*, and almost
> none answers *what is happening now*. And when the answer is "something is wrong", the
> console can correct the **scoreboard** but it cannot correct the **people** — it has no
> power over teams at all.

---

## 1. Roster repair — the superadmin cannot touch a team · **the biggest gap**

**What exists.** `/admin/teams` is a directory: team, captain, member count, locked state,
roster. Its own doc comment states the rule — *"Read-only: superadmins observe rosters,
captains manage them."* The authorization matrix enforces it: `POST|PATCH|DELETE /api/teams`
is `allow: ['participant']`. Every roster action — add a member, remove a member, lock,
transfer captaincy — is a **captain** action and nothing else.

**What that means at 10:40.** The captain is a participant. They are playing in matches, their
phone is at 4 %, they went to the food truck, or they have simply left. And:

- Someone joins the wrong team (two teams with similar names; a six-character join code read
  out across a marquee). **Nobody can move them** — the participant can leave, but only if
  they still have a working phone and can find the button, and rejoining needs the *other*
  captain to be reachable too.
- A team drops to one person after two no-shows. The superadmin can see it on the directory
  page and can do **nothing**: they cannot merge it, cannot move the straggler, cannot
  disband it. (Disbandment exists in the data model — `team.disbanded_at` — and is written in
  exactly one place: the last member leaving.)
- A team locks itself and the captain's phone dies. That team is now frozen for the day.

**What is missing:** a superadmin roster surface, on the existing `/admin/teams` rows — move a
participant between teams, remove a member, force-unlock, transfer captaincy, disband an empty
team — each one audited, because acting on somebody else's team is exactly the kind of power
that should leave a record.

**The counter-argument, fairly stated:** captain-only is a real design decision, not an
oversight, and it keeps the model clean. But the decision was made for a *normal* day. The
superadmin console already contains four other "the record is wrong, fix it" surfaces (void
match, void scan, adjust points, hide photo). Teams are the one object with no such surface,
and they are the object the entire tournament is built out of.

**Cost:** ~1½ days including audit entries and the wrong-party tests.

---

## 2. ~~There is no "right now" anywhere~~ ✅ **BUILT (ADR-151)** · *the gap you felt all day*

**What exists.** `/admin` (Dashboard) shows eight tiles — participants, teams, matches, scans,
courts enabled, activities active, facilitators, point config set — plus a "Before the event
starts" blocker list. It has a manual **Refresh** button.

**What is wrong with that on the day.** Every tile is a **cumulative total since the database
was created**, and the one piece of prose on the page is a *pre-event* checklist. At 11:15 the
dashboard will say `Scans 1,842` and that number will be as true, and as useless, at 11:16.
The questions actually being asked at the back of the hall are:

- *Is anything still happening?* — scans in the last 15 minutes, by station.
- *Has a station gone quiet?* — the fringe activity whose last scan was 40 minutes ago is
  either finished, or its marshal's phone is dead, and nothing distinguishes those.
- *What is on court right now, and what is overdue?* — `/admin/matches` has the data
  (`status`, `courtLabel`, `scoreA/scoreB`, `startedByUsername`) but is a correction tool with
  a status filter, not a board.
- *Which rounds are open?* Fringe and swag both have open/advance/end round lifecycles driven
  entirely from facilitator phones. The superadmin has no list of what is currently open.

**What is missing:** one **Operations overview** — a live panel of the last 15 minutes
(scan rate, per-station last-seen, open rounds, matches in progress, matches overdue) that
refreshes on its own. This is the single surface that would change what the day feels like
from the laptop.

**Cost:** ~2 days, and it needs care — the queries are "recent activity" aggregates and this
app runs one serialized database connection (ADR-003). A 30-second poll of one bounded query,
not six.

---

## 3. ~~No station or staff health~~ ✅ **BUILT (ADR-151)**, folded into §2's panel

`FacilitatorView` carries `lastLoginAt` and nothing else. The presence mechanism (ADR-082,
extended by ADR-145) deliberately tracks three things — participants, sessions and **screen
keys** — and a hall screen now reports "last seen". **A facilitator's station does not.**

So the projector has better observability than the people running the event. A swag station
whose phone has died, a court console signed out by an accidental tap, a marshal who never
signed in at all — all invisible until somebody walks over or complains. Worth noting that the
machinery already exists: `noteScreenKeySeen` + `pendingScreenKeys` + one `UPDATE` per flush
is the exact shape a `noteFacilitatorSeen` would take.

**Cost:** ~½ day for the presence note, and it folds into §2's panel rather than needing a
surface of its own.

---

## 4. You cannot look up the number people say out loud · ✅ **BUILT, ADR-148**

ADR-088 gave every participant a 4-digit `scan_number` *specifically* because it is the
identifier that survives being spoken across a noisy marquee — "I'm four-eight-two-one" —
and banned all-digit nicknames so the two channels cannot be confused.

The superadmin search then filters on `lower(nickname) LIKE '%q%'` and **nothing else**. The
one identifier designed for the spoken channel is not searchable on the console that handles
the escalations. (The facilitator app does better: `GET /api/staff/participants/by-number/:n`
exists. The superadmin's own directory never learned about it.)

**Cost:** about an hour. This is the cheapest item on the list by an order of magnitude.

---

## 5. ~~A swag claim cannot be undone~~ ✅ BUILT (ADR-159) · **the asymmetry that would have bitten**

Every other recorded fact on the day is reversible:

| Record | Undo |
|---|---|
| Fringe scan | `POST /api/fringe/scans/:id/undo` (facilitator, ADR-138) **and** admin void/unvoid |
| Match result | admin void / unvoid / edit winner |
| Points | manual adjustment ledger (ADR-117) |
| Photo | hide |
| Announcement | retract |
| **Swag claim** | **nothing** |

`swag_claim` is immutable by design (ADR-110 — "every reported value is snapshotted"), which
is the right instinct for a ledger and the wrong outcome at a table with a queue. A wrong scan
burns that participant's per-round allowance *and* a unit of stock, and the only remedy is a
points adjustment that does not restore either.

**What is missing:** a void on `/admin/scans`-style lines for swag claims, consistent with how
fringe scans already work. **Cost:** ~1 day.

**✅ BUILT as ADR-159, with one scope change the organiser made.** Shipped as *both* reversals
the fringe row above has, not just the admin one: the counter that made a handout may take it
back for ten seconds (ADR-138's window, reused), and the superadmin void/unvoid outlives it.
The reasoning the organiser gave is that the person who notices a wrong handout is the
facilitator with a queue in front of them, and ten seconds is roughly how long the tote bag is
still within arm's reach. The table above is now symmetric.

The load-bearing part is not the flag — it is that the allowance count stopped counting voided
rows. A void that set `is_voided` and left the limit spent would look entirely correct in both
consoles and leave the participant unable to collect the item they never received.

---

## 6. ~~Teams that arrive after the tournament starts vanish silently~~ ✅ BUILT (ADR-149)

**Corrected 2026-10-04 after reading the activation path properly.** My first pass said the
console never warns about this. It does — once — and the warning turns out to point at a
feature that was never built, which makes the finding sharper rather than softer.

**What activation actually does.** `POST /tournament/activate` reads the field in one go:

```ts
const teams = await listTeams(db);
const tournament = await activateTournament(db, { ...body, teamIds: teams.map((t) => t.id) });
```

and `activateTournament` shuffles that array, deals it into groups, writes one
`tournament_entry` row per team and generates every group fixture from those rows. **The
entry row *is* membership of the tournament.** No entry means no group, no fixture, no row in
any standings table, and no path into the knockout — not as a bug, but because the team was
never in the array the bracket was built from.

**Nothing stops a team forming afterwards.** `POST /api/teams` and `POST /api/teams/join`
check three things: that you are not already in a team, that the name is free, and that the
team is not locked. Neither knows a tournament exists.

**The console does say so, once.** The setup panel reads: *"N teams are formed right now.
Activation freezes the entrant list — teams formed later play friendlies."* That sentence is
correct about the freeze and wrong about the remedy: **consolation friendlies are D4, and D4
has never been built** (`docs/outstanding-tasks.md`: *"KIV, not built: D4 consolation
friendlies"*). The documented escape hatch is vapour. And the sentence lives on the panel
that **disappears at activation** — afterwards the page shows status, standings and fixtures,
and nothing anywhere counts or names the teams that are outside.

**What the late team experiences.** Not a visible error — that is the problem. Their team room
works. They can scan at fringe activities and earn points, because fringe scoring is
per-participant and has nothing to do with the tournament. But `/feed/lineups` shows the
empty state: *"No schedule yet — matches are ad-hoc today. Results still show up next door!"*
— which reads as *yours is coming*, and it never is. Four people wait for a match that does
not exist, and the first person to find out is a marshal who cannot explain it either.

**What is missing, in increasing order of commitment:**

1. **A count, after activation** — the Tournament page saying *"3 teams are not in this
   tournament: Kites, Rays, Terns"*. Half a day, and it converts an invisible failure into a
   decision somebody can make.
2. **An honest empty state** for a team with no entry — distinct from "no schedule yet",
   because those are different facts and only one of them is survivable by waiting.
3. **A decision about what should actually happen**, which is the real question and is a
   product one, not a code one: either *admit them* (a late-entry route that adds a team to
   the active tournament — easy in round robin, awkward mid-group in world-cup), or *build
   D4 friendlies*, or *lock team formation at activation* so the event stops promising
   something it cannot deliver. Doing none of these is the only option that leaves people
   standing around.

**Cost:** ~½ day for (1) and (2), which is most of the value. (3) is a conversation.

## 7. Nothing leaves the building — ✅ CLOSED by ADR-161

There is no export, download or print anywhere in the console — no CSV, no results pack.
At 15:50 the prize-giving needs the final top three individuals and top three teams, and the
organiser afterwards needs a record. Today that is: read it off the projector, or query the
database. The hall screen is a beautiful way to *show* the result and no way at all to *keep*
it.

**Cost:** ~1 day for a final-standings view with a print stylesheet and a CSV.

**Built as estimated**, at `/admin/standings`. Three decisions were put to the organiser and
all three went the generous way: every participant rather than the board's top ten; three
separate CSVs rather than one file with a section column; and always available with a
PROVISIONAL warning rather than refused until the tournament is marked complete — an
unclosed match at 15:50 must not be the reason nothing prints.

---

## 8. Three smaller ones

- ~~**A nickname cannot be changed by anybody.**~~ **NOT A GAP — ruled 2026-10-05: nicknames
  are immutable by design, and the rename route is cancelled rather than deferred.** The
  nickname is the sign-in credential, it is snapshotted into chat messages and roster
  announcements, and it is the identifier a marshal says out loud at a station; a rename
  would be a credential change that silently disagrees with history. See
  `outstanding-tasks.md` §5a.
- **A duplicate sign-up is permanent.** Someone who registers twice leaves a ghost on the
  board with zero points. Nothing merges, hides or removes a participant. **Re-assessed
  2026-10-05 and found to understate it:** identity is nickname + PIN and nothing else, so a
  duplicate is undetectable by construction; and because every per-participant guarantee is
  keyed on `participant_id`, the second row can score the same activity round again, claim
  the same swag item again, and join a second team. **Blocked on a ruling** — only a merge
  recovers the stranded points, and that is a much larger piece of work than a hide. See
  `outstanding-tasks.md` §7.
- **The audit covers voids only.** `GET /api/admin/void-audit` records voids and unvoids;
  adjustments live on the participant's own page. Config changes, announcements, tournament
  activation, screen keys and the new station-offline switch are recorded nowhere. Low
  priority for the day, higher the morning after.

---

## 9. Checked, and **not** missing

Stated so the list above can be trusted:

- **PIN reset works for superadmins.** `/api/staff/*` is `allow: ['facilitator',
  'superadmin']`, and the participant detail page has the form. (This was my first guess at a
  gap; it was wrong.)
- **There is no schedule to fall behind.** Fixtures have no `scheduled_at` — they are
  `pending → claimed` by whichever court frees up next — so "the event is running 20 minutes
  late" needs no console surface at all. This is a genuinely good design decision and it
  removes an entire category of event-day panic.
- **Walkovers and skips exist** for a no-show team, and manual point adjustment exists with a
  reason and a ledger.
- **Pause, restart, hall-screen keys and station offline mode** are all on Operations.
- **The announcement is refused while offline rather than queued**, which is correct: "finals
  in fifteen minutes" arriving an hour later is worse than silence.

---

## 10. What I would build, in order

| # | Surface | Why it is in this position | Cost |
|---|---|---|---|
| 1 | ~~**Scan-number search** (§4)~~ ✅ **ADR-148** | An hour, and it removes a daily friction on the console that handles escalations | ~1 h |
| ~~2~~ ✅ | ~~**Operations overview — the last 15 minutes** (§2) + **facilitator presence** (§3)~~ **BUILT as ADR-151** | Changes what the whole day feels like from the laptop; everything else is a reaction to something you currently cannot see | ~2½ d |
| 3 | **Roster repair** (§1) | The largest *capability* gap, and the one with no workaround when a captain is unreachable | ~1½ d |
| ~~4~~ ✅ | ~~**Teams-outside-the-tournament warning** (§6)~~ **BUILT as ADR-149 — admission, not just a warning** | Cheap, and prevents the worst single participant experience available: four people who play nothing while the app tells them to keep waiting | ~½ d |
| 5 | **Swag claim void** (§5) | Consistency with every other record on the day | ~1 d |
| 6 | **Final standings export** (§7) | Needed once, at 15:50, and badly | ~1 d |
| 7 | ~~Nickname rename~~ (cancelled 2026-10-05), duplicate handling (blocked on a ruling), wider audit (§8) | Each has a human workaround on the day | ~1 d |

**If only one thing is built: #2.** Every other gap on this list is something the superadmin
reacts to. That one is the surface that tells them there is something to react to. *(It was
built: ADR-151. The top remaining item is now #3, roster repair.)*
