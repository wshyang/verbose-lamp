# Superuser guide

For: **superadmins** — the event owners and corrections desk. The app calls this account type **Superadmin** in the left nav.

## Contents

1. [Sign in and get set up](#1-sign-in-and-get-set-up)
2. [Configure the event](#2-configure-the-event)
3. [Add facilitators and superadmins](#3-add-facilitators-and-superadmins)
4. [Rehearse the tournament](#4-rehearse-the-tournament)
5. [Create and launch the tournament](#5-create-and-launch-the-tournament)
6. [Monitor a live event](#6-monitor-a-live-event)
7. [Correct individual scans and swag claims](#7-correct-individual-scans-and-swag-claims)
8. [Repair people and teams](#8-repair-people-and-teams)
9. [Make announcements](#9-make-announcements)
10. [Open the hall screen](#10-open-the-hall-screen)
11. [Pull and print final standings](#11-pull-and-print-final-standings)
12. [Operate the system on a bad afternoon](#12-operate-the-system-on-a-bad-afternoon)

## 1. Sign in and get set up

### Sign in

1. From the landing screen, choose **Superadmin**.
2. Enter your username and passcode.
3. Choose **Sign in**.
4. The **Dashboard** opens.

### Dashboard layout

- **Before the event starts** lists any blockers (no active fringe activities, no facilitator accounts).
- **Last 15 minutes** shows the live operations pulses — scan, swag and match counts, station activity, on-court matches and active facilitators.
- **Totals so far** shows the running event totals.
- **Set point values** and **Refresh** are pinned at the bottom of the totals panel.

Every field on every console form carries an **(i)** beside its label (ADR-322) — tap or hover it for one sentence on what the field does before you change it.

### Use the blocker list

If the checklist appears, walk through it top-to-bottom — every item is a tap of its own tab (Activities, Facilitators, etc.). When none remain, the panel disappears and you're ready for invitations.

## 2. Configure the event

The admin nav is the same tabs used below: **Dashboard, Points, Tournament, Activities, Programme, Swag, Clusters, Facilitators, Scans, Swag claims, Participants, Teams, Audit, Standings, Announce, Photos, Superadmins, Operations.**

### Points

1. Click **Points**.
2. Review the current **Participation points (taking part, without placing)**, **Passport bonus** and **Stations needed for the passport**.
3. Edit values and choose **Save point settings**.

> Scans already processed keep the points they were given. New values only affect future scans.

### Clusters

1. Click **Clusters**.
2. To add: enter **Code** and **Display name** (max 30 characters), then **Add cluster**.
3. To rename: choose **Rename**, change the display name (the code stays fixed), then **Save name**.
4. To retire a cluster: choose **Retire**. If it still has members, first **Move** them to another cluster — a target picker appears on that row. Retired clusters stay in history.

> Once scoring starts, you can add and rename but you can **no longer retire a cluster or move participants** — the leaderboard keys off the cluster and moving people mid-day would rewrite it.

### Fringe activities

1. Click **Activities**.
2. Enter **Activity name** (max 50 characters).
3. Add up to four award tiers. Each tier has a **Label** and **Points** (e.g. **Completed (30)**). The first tier is the default armed tier at the station.
4. Choose **Create activity**.
5. Choose **Edit** on a row to rename or adjust tiers, **Deactivate** / **Activate** to flip its state.

> Deactivating an activity closes its open round automatically. Reopen the round after reactivating.

### Swag stations

1. Click **Swag**.
2. Enter a **Station name**.
3. Add up to six items. Each gets an **Item** label and a per-person **Limit** (e.g. Tote bag, 1).
4. Choose **Create station**.
5. **Edit** to change items, **Deactivate** to close the station round, **Activate** to reopen it.

### Programme

1. Click **Programme**.
2. Fill in title, optional start/end, location and notes.
3. Choose the create/save button.
4. The list under **The day** shows the run order. Move items with the up/down arrows as the schedule evolves.
5. Choose **Cancel** on an item to leave it visible-but-cancelled to participants, or **Restore** to bring it back.

## 3. Add facilitators and superadmins

### Facilitators

1. Click **Facilitators**.
2. Enter **Username**, **Display label** and the **4-digit passcode**.
3. Choose a **Default station** type (**None**, **Court**, **Fringe activity**) and pick its station.
4. Choose **Create facilitator**.
5. To change details choose **Edit**. Username is fixed; enter a **New passcode (leave blank to keep)** to rotate it.

> Accounts are never deleted. They sign in, run stations, and retire with the event.

### Superadmins

1. Click **Superadmins**.
2. Enter **Username** and a **4-digit passcode**, then select **Create superadmin**.
3. To rotate a passcode, select **Change passcode**, enter the new 4-digit code, then **Save**.

> Superadmin accounts are not deleted; make sure at least one other superadmin is active before retiring a colleague.

## 4. Rehearse the tournament

Rehearse before creating the fixture: the simulator previews the real planner, on the browser, with the teams and courts on record.

1. Click **Tournament → Simulator**.
2. Read the header: **N teams registered, M courts on**. Adjust **Teams** and **Courts** to test hypotheticals.
3. Choose a build:
   - **One format for the whole tournament** — pick a **Format** (Round robin, Single elimination, Double elimination, Groups then knockout, Consolation bracket, Ironman knockout, Points rush, Flighted quads, Swiss rounds, Open play), plus **Group size** and **Go through** if it's a groups-format, or **Swiss rounds** for Swiss.
   - **Stage by stage — each with its own format and minutes** — add stages in play order; each stage is **Pool (groups)**, **Knockout bracket**, or **Open play**, with its own minutes, order, scoring and entry source.
4. Set the discipline numbers: **Match min**, **Changeover min**, **Rest min**, **First match** time and **Hard stop**.
5. Tick **Third-place match** if the format allows one.
6. Read the headline: **{N matches}, last one ends {HH:MM} — {fits the hard stop}/{overrun} min past the hard stop**, and the table rows for detail.
7. Any row flagged **(back-to-back)** means the plan breaks the rest budget — lengthen the day or trim teams before committing.

## 5. Create and launch the tournament

### Draft the tournament

1. Click **Tournament → Control**.
2. On the **New tournament** panel, enter **Name**, **Win points**, **Draw points** and **Loss points**.
3. Enter teams: tick them in the seeds list, or **Enter every team** to include all signed-up squads.
4. Choose **Create the draft**.

> The draft is saved before you commit to a build. You can return here any time and **Discard the draft** if the shape changes too far.

### Or run dumb courts instead (no fixtures at all)

If the day should have no fixtures — courts behaving like fringe stations, awarding points as
games are played — set **Mode** to **Dumb courts** on the New tournament panel and set the
**Award tiers** (label + points, up to four: say *Played 2*, *Gold 10*). Create the draft as
usual, then choose **Start dumb courts**. Nothing is scheduled: there are no line-ups, and
participants' Results tab shows the awards as they land ("Team XXX is awarded XXX points!").
Court masters get the award screen from their station picker: arm a tier, tap the team,
confirm. Their own awards can be taken back for ten seconds; after that, void the manual
award from the desk with a reason. Tiers are fixed once the draft is created — to change them,
discard and re-draft (awards already given keep the label and points they were given with).

### Choose a build and preview plan

1. On the **Start — {N} teams entered** panel, choose **Build**:
   - **One format for the whole tournament** — pick a **Format**, then set **Group size** and **Go through per group** (groups formats), **Rounds** (Swiss; leave blank to auto-size), and **Third-place match** where offered.
   - **Stage by stage — each with its own format and minutes** — configure each stage as in the simulator (pool / knockout / open, entry source, scoring, match minutes, third-place for brackets).
   - Each stage has two separate sets of points. **Win/Draw/Loss pts** are what a result *pays* onto the cluster board. **Table win/draw/loss pts** are the stage's *internal* scoring — they only rank the stage's table and decide who advances (leave all three blank to rank on the default 3/1/0). Changing one never changes the other.
   - When a knockout takes more teams than the earlier stage's groups qualify (say three group winners but a 4-team semi-final), the extra seats are filled by the best non-qualifiers on that stage's internal table — there is nothing extra to configure; just set **How many go through** to the number the knockout needs. It cannot exceed the teams the earlier stage has, and the builder says so if you ask for more.
2. Set **Match minutes**, **Changeover minutes**, **Rest minutes** and optional **Hard stop**.
3. Read the planner summary and any problem flagged under the builder — **Start the tournament** is blocked until it clears.

### Ready the courts

1. Scroll to the **Courts** panel (still on **Control**).
2. Add a court: enter **Court number (1–20)** and a label (max 30 characters), then **Add court**.
3. **Edit** to renumber or rename.
4. **Switch off** / **Switch on** to disable / enable a court — only while the day isn't live; during live play, use the live controls.

### Start it

1. Choose **Start the tournament**.
2. The scheduler turns live: fixtures seed automatically, courts pick up pairings, and the day begins.

### Check the plan

Click **Tournament → Timetable**. This read-only view lays every scheduled match across the courts and times. If a match has no court/time it sits in **Not yet placed**. Pinned (manually reordered) matches are marked **(pinned)**.

## 6. Monitor a live event

### Operations overview (Dashboard)

Back on **Dashboard**, **Last 15 minutes** rolls up:

- **Scans**, **Swag handed out**, **Matches finished**.
- **Stations** — round number, scans in the window, and last scan. A station that says **Nothing for 15 min** wants a check-in.
- **On court** — score and running time. An overdue match flags red.
- **Marshals** — who signed in and when they were last seen.
- Teams formed but outside the tournament: a red line warns **Admit them, or decide not to** (jumps into Tournament). Once the group stage closes, admission closes with it.

Click **Refresh** for a one-tap refresh; the panel otherwise refreshes automatically every minute or so.

### Run the day from Control

Click **Tournament → Control** to stay on top of live play.

#### Matches

Three tables partition the day:

- **On court** — in-progress matches (follow-up desk actions come at the end).
- **Queued** — scheduled, waiting for a court.
- **Finished** — completed and counted.

Per row: **On court**, **Stage**, **Teams**, **Court**, **Time**, **Score (or 'walkover → A/B')**.

Row actions:

- **Move** — manual pin: put a queued match on a court at a time. In the **PlacementForm** panel, pick **Court**, set **Start**, then **Put it there**. The match counts as pinned. Later, **Release to the planner** lets the queue decide again.
- **Walkover to {Team A}** — no-show/deadline: choose the button and give a reason. Only enabled when the other team is present. (To settle in favour of the other side, leave the facilitator to end it normally, or call it off and start a fresh fixture.)
- **Call off** — cancel a scheduled or live match with a reason. The fixture stays on record but does not award points.
- **Correct** — on a finished match, rescore. A row action on a finished match.
- **Void / Reinstate** — set the match to not count, or bring it back into the books. Both demand a reason.

All of these land behind a **Reason (required)** dialog, so the audit log always says why.

#### Stage tables and completion

Each stage gets a compact table: **Group**, **#**, **Team**, **P (played)**, **W-D-L**, **Diff**, **Pts**, **Why here** (the basis line). Above it, a line reads **Table points W/D/L (ranking only)** and lists who goes through in order — a team marked **(fill)** did not qualify from its group; it took a spare seat as the best non-qualifier on the internal table.

1. When a stage's fixtures are all wrapped, click **Close this stage**.
2. The next stage seeds itself from the stage rules.

Watch the **Scheduler — {format}, {status}** panel for the frontier (`{remaining} matches to place`, `projected finish HH:MM`, hard-stop state).

#### Teams / entrants

Under each tournament team, **Teams** lists entry order, points awarded and any **(withdrawn)** marker.

- **Award points** — +/- from -100 to 100 (not 0), with a reason. Use when a marshal's decision was overridden at the desk.
- **Withdraw** — the team has left. All their unplayed matches are voided; recorded results stay.

#### Courts and timings (in-flight change)

Use this when weather or a burst pipe costs you a court:

1. In **Courts and timings**, toggle the **Courts** available now.
2. Edit **Match minutes** / **Changeover minutes**.
3. Choose **Preview** — the panel spells out every queued match that would move, and the projected finish.
4. Read the fit line: **remaining matches**, **projected finish** and whether you're past the hard stop.
5. If the plan is acceptable, choose **Apply**. Apply is blocked until you've previewed.

#### Stop the day

- **Stop the scheduler for good** — kills automatic placement; everything remaining becomes manual via **Move**. Fixtures are preserved.
- **Close the tournament** — closes the event. End-of-day procedures follow in §11.
- In both cases, give a reason — it appears in the audit trail.

## 7. Correct individual scans and swag claims

### Void / restore a fringe scan

1. Click **Scans**.
2. Filter by activity or open **All activities**, then **Refresh**.
3. Find the row by participant, time, or facilitator.
4. Click **Void** (or **Restore** on a voided row).
5. Read the dialog: **Void scan — {participant} @ {activity}** or **Restore scan — {activity}**.
6. Type a **Reason** (mandatory) and **Confirm**.

> A voided scan stops counting toward points, passport and leaderboards. Restoring returns it. Both actions are recorded in the audit.

### Swag claims (same shape)

1. Click **Swag claims**.
2. Filter by counter or **All counters**.
3. Void or **Restore** the claim, with a reason.
4. Voiding frees up that per-person allowance for that item in that round.

> Voiding gives the participant their allowance back, so they can still be given this item today if that is what should happen.

### Audit log

Click **Audit**. This is the append-only correction log: **When**, **Action (Void, Restore)**, **Target** (scan / swag claim / award batch), **Reason**, **By**. Tournament corrections live in their own match records; fringe and swag corrections live here.

## 8. Repair people and teams

### Find and fix a participant

1. Click **Participants**.
2. Type a nickname or scan number into **Search nickname or number**, or narrow by cluster.
3. Click **Open**.

The detail page shows **cluster**, joined time, points split (fringe/tournament/total), scan count and team.

- **Move a participant between clusters** (before scoring opens): choose a target under **Cluster**, then **Move**. Once scoring starts, the page refuses.
- **Reset a PIN**: enter a **New 4-digit PIN**, choose **Set PIN**. The old PIN stops working immediately, and a confirmation appears.
- **Adjust score**: choose a **Station**, enter **Points (negative to deduct)** and a **Why**, then **Apply adjustment**. Reverse mistakes with an opposite adjustment rather than editing the log.
- **Scan history**: every stamp frozen with the points it was awarded and the facilitator who logged it.

### Fix team rosters

1. Click **Teams**.
2. Find the team row: captain, members, state (locked/open).
3. Roster tools per member:
   - **Move to…** — reassign to another live team (confirmed in a dialog).

   - **Make captain** — hand captaincy to another member.

   - **Remove** — remove from the squad. If they're the captain, the line says who automatically takes over; removing the last member disbands the team.
4. To add: in the **Add a participant…** picker (un-teamed participants only), choose the person and confirm.
5. **Unlock** clears a captain's lock when the roster needs to breathe again.

> Match scores ride on rosters frozen when a match starts. Moving someone who's on court right now loses them that match's tournament points; the dialogs say so before they commit.

### After the day — standings first, then teams

If you are cleaning up after the day ends, the order matters: archives read from the standings snapshot, so generate the standings (§11) before editing rosters for tomorrow.

## 9. Make announcements

1. Click **Announce**.
2. Type the message under **Announcement** (max 500 characters).
3. Select **Announce**.

It pops up as a toast over every participant's screen and stays until they tap it. Choose **Retract** to pull a message back — it vanishes everywhere.

> The button is disabled while offline: a stale announcement is worse than none.

## 10. Open the hall screen

Use the hall screen for shared displays. It reads board, results, photos and the road to the finals, and writes nothing.

### Create a screen link

1. Click **Operations**.
2. Under **Hall screen**, add a **Where is it?** label (for example Main hall).
3. Tick the **What does it show?** checkboxes for the scenes you want on that screen (cluster board, top players, on court now, just finished, up next, the groups, the road to the final, photos latest, crowd favourites).
4. Choose **Create a screen link**.
5. Copy the one-time URL. The link is visible only here, right now — close the panel and it can't be retrieved; create a fresh link instead.

### Open it on the display

1. Plug in / browse from the display machine and open the link.
2. The projector shows without needing a sign-in or shell chrome.

### Change or retire a screen

- Click **Change scenes**, edit the checkboxes, then **Save**.
- Choose **Revoke** to kill a link (screen blanks within a minute). The only way back is a new link.
- The table's **Last seen** uses last-seen, not creation time, so you can tell at a glance which screens are actually plugged in.

### Photo wall (photos-only mode)

Open **`/admin/wall`** on a projector. It advances through shared photos full-screen, one at a time, with uploader, caption and likes — no UI to press.

### Moderate photos

1. Click **Photos**.
2. Reported photos surface first with **Reports** and **Likes** columns.
3. Choose **Hide** to take a photo off the wall (hidden photos leave the participant gallery and the wall but stay listed), **Restore** to re-publish.
4. The **Archive** column marks whether the original is untouched or resized.

## 11. Pull and print final standings

1. Click **Standings**.
2. If the page still shows **PROVISIONAL — the tournament has not finished. These figures will still move.**, hold judgment. It flips final once the tournament closes.
3. The page splits into **Tournament** podium (places with their basis, e.g. winner and runner-up), **Clusters** (fringe + tournament per cluster), **Individuals — all ranked participants**, and **Group tables**.
4. Buttons at the top:
   - **Read again** refreshes the snapshot.
   - **Print** for a paper handout.
   - **Clusters CSV**, **Individuals CSV**, **Teams CSV** download spreadsheets — every CSV is the same snapshot as the printout.

> Treat the standings snapshot as the official record. Read it once, print it, download the CSVs — they all agree.

## 12. Operate the system on a bad afternoon

Click **Operations**. The sections below are ordered by escalation: least disruptive first.

### Chat and photos

- **Pause chat and photos**. Participants see an explanation instead of the room. **Resume chat and photos** re-opens the room.
- Scoring, scanning, teams and the leaderboard are untouched — use this to calm the room, not the event.

### Station offline mode

- **Turn on** makes facilitator phones cache the app shell, so a reload works in a dead spot.
- **Turn off** makes phones load fresh every time, clearing the cached copy within five minutes on phones with signal.
- The section header states the current state and last change time.

> This mode only covers the staff screens. Participants always load fresh; offline *scans* already queue without this mode turned on.

### Restart the app

1. Choose **Restart now**.
2. Confirm **Restart now** in the dialog — it closes without saving half-typed messages, but nothing already saved is lost.
3. The process comes back within a few seconds.

### Reset the system (post-rehearsal wash)

Use this to wipe rehearsal data before the real event.

1. Click **Operations**, scroll to **Reset the system**.
2. The panel warns: **Danger — this permanently deletes the practice day and cannot be undone.**
3. Confirm the scope: participants, teams, all social content, tournament, scans, claims, rounds and sessions are deleted. Facilitator/superadmin accounts, clusters, point settings, agenda, screen keys and switches survive. You stay signed in; everyone else is signed out.
4. Type the **server-minted confirmation string exactly, capitals and all**.
5. Enter your own superadmin passcode.
6. Choose **Reset the system permanently**.

> Because it's destructive, use the moderator-channel call first: confirm with another superadmin before resetting the day, and expect the report to itemise exactly what was deleted when it completes.

### When not in Operations

- If a participant's badge won't scan: read the 4-digit scan number and award by number.
- If a station's scanner is misbehaving: stop and restart the camera, or award by number.
- If a facilitator has locked themselves out: reset their passcode from **Facilitators**.
- If a participant has signed up twice with two nicknames: pick the survivor (usually the one with more scans), tell the other facilitator of the shadow account, void nothing in a hurry — and let the loser account die quietly, since names cannot be merged today.
