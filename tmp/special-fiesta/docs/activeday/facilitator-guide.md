# Facilitator guide

For: **facilitators** (the app calls them facilitators) — marshals and desk staff who run fringe stations, courts, and the swag counter.

## Contents

1. [Quick start](#1-quick-start)
2. [Open and manage a fringe station round](#2-open-and-manage-a-fringe-station-round)
3. [Award points with the camera](#3-award-points-with-the-camera)
4. [Upgrade a downgraded award](#4-upgrade-a-downgraded-award)
5. [Work offline, then sync](#5-work-offline-then-sync)
6. [Reopen a closed-round station](#6-reopen-a-closed-round-station)
7. [The Stations page](#7-the-stations-page)
8. [End a court match](#8-end-a-court-match)
9. [Cancel or draw the hard way](#9-cancel-or-draw-the-hard-way)
10. [Ad-hoc friendly matches](#10-ad-hoc-friendly-matches)
11. [Upgrade an award after the timer](#11-upgrade-an-award-after-the-timer)
12. [Dispense swag](#12-dispense-swag)
13. [Reset a PIN](#13-reset-a-pin)
14. [If something goes wrong](#14-if-something-goes-wrong)

## 1. Quick start

### Sign in

1. From the landing screen, choose **Facilitator**.
2. Enter your username and 4-digit passcode.
3. Choose **Sign in**. The **Stations** page opens; your default station is marked with a star (★).

### The console shell

- The header shows your username, browser state (**Online** / **Offline**), and sync state (**All synced** / **N queued**).
- Tabs at the top drive the three working pages: **Stations**, **Sync queue**, **PIN reset**.
- Fields carry an **(i)** beside their label (ADR-322) — tap it for one sentence on what the field does.

### Rotate between stations

1. Go to **Stations**.
2. Tap any card — you are not tied to your default station.
3. Cards show what each station is (court, fringe activity, swag) and whether it is live or **Disabled**.

### Sign out

Use **Sign out** at the right of the header bar at the end of your shift. If sign-out fails, stay on the page and retry — you're still signed in.

### Device tips

- Grant camera permission when the browser asks — it is per-tab, and you may be prompted again if you open a second scanning tab.
- If the camera stalls or the station device panics, fall back to entry by 4-digit number (works online only — see §5 for how offline is handled).

## 2. Open and manage a fringe station round

You work one **activity** at a time.

### Pick your station

1. On **Stations**, tap your fringe activity card.
2. The page opens with the station name, tier prices, and live scan count at the top.

### Open a round before you scan anyone

Scans only happen while a round is open.

1. If the page says **No round open**, open **Round controls**.
2. Choose **Open round 1** (first round of the day) or **Open round N+1** (the next round).
3. Wait for the header to change to **Round N · open** before letting the participant go.

### Work the open round

- The header shows the round number and today's scan count so far.
- It also lists that round's scans as a running log. New entries are highlighted briefly.

### Close, reopen, or advance the round

- **Next round** closes the current round and opens the next one in a single tap. The dialog says that existing scans keep their points; confirm with **Next round**.
- **End round** stops the station accepting scans for the moment (the day-end option). The dialog reminds you that you can reopen it. Confirm with **End the round**.
- **Reopen round N** is only visible while a round is ended. You get one working reopen per closed round; confirm **Reopen it**. Scans from before the re-open are retained.

> **Important:** at most one round can be *open* or *ended* per activity at a time. If yours reads **Disabled** everywhere, you are not signed into the right station — go back to **Stations**.

## 3. Award points with the camera

### Pick the tier first (one tap is sticky)

1. At the top of the scanning panel, tap the **tier button** for the result the participant achieved (default is the first tier).
2. The line underneath states **Next scan: {tier} +{points} pts**. This is the price every subsequent scan will pay until you change it.
3. For participants who took part without placing, choose **Took part** to award participation points.

### Start the camera

1. Tap **Start camera**.
2. Tap **Stop camera** when you pause — releasing the camera closes the feed.
3. Use the switch icon to flip between cameras when the feed shows the wrong one.

### Scan and award

1. Let the participant present their **QR badge** (they open **QR** on their phone).
2. When their code decodes, the app posts the award straight away — no extra confirmation. The outcome appears at the top of the panel:
   - **Awarded** — points are in.
   - **Duplicate** — that participant already scored in this round; nothing changes.
   - **Held** — their slot in this round is already taken by a different award. If the new result is genuinely better, use **Replace award for {name}** (§4).
   - **Queued** — no signal right now; the scan waits in the sync queue.
   - **Rejected** — the server refused the scan (shown in words), e.g. wrong station or a closed round.

### Undo the last award (10-second window)

1. In the heartbeat after a *successful* scan, the **Undo ({n}s)** button is live.
2. Tap it before the counter runs out to take the scan back. The participant's name is removed from the round log, and the outcome updates.
3. Once the timer ends, only a superadmin can void a scan (see the superuser guide).

### Award by 4-digit number (no camera / camera blocked)

1. Find the participant's **4-digit scan number** (shown as **Scan number** on their **Me** screen and under their QR badge — never their PIN).
2. Type it into **Or type their 4-digit number**.
3. The fourth digit triggers the lookup automatically, or press **Look up**.
4. Confirm you are looking at the right person — the dialog reads **Award {tier} +{points} to {nickname}?** with their number, cluster and round.
5. Choose **Award points**.

> Manual entry is **online-only**. When offline, typing shows a notice and **Look up** is disabled — the app will not let you award to an unnamed participant.

## 4. Upgrade a downgraded award

When a participant has already been scanned in a round but should score higher (for example they were mistaken for somebody else, or the wrong tier was armed):

1. Let the panel run their re-scan; the outcome shows **Held**.
2. Tap **Replace award for {name}**.
3. The award is overwritten on the server. Their points and stamp now reflect the higher result.

## 5. Work offline, then sync

### Offline capture

- Camera scans keep working with no signal. Each lands in the local queue with the tier you had armed, and the outcome says **Queued**.
- The header badge reads **N queued** so the count is never a surprise.
- The server applies queued scans in the order they arrived. Their round reference is trusted even if the round has closed by the time they land.
- Manual entry by number *cannot* run offline (see §3).

### Check the queue

Go to the **Sync queue** tab:

- The status banner reads **Online**/**Offline** and the count waiting.
- **Waiting scans** shows each unsent award: participant, activity, points, device time, and any error from the last attempt.
- A row marked **held for manual retry** was refused by the server after several automatic attempts.

### Sync now

1. Return the device to Wi-Fi/data.
2. Either wait — the queue drains on its own roughly every 15 seconds — or tap **Sync now**.
3. Watch the counter fall. The newest error text explains what the server said last.

### Discard

Use **Discard** only when a queued award is definitely wrong (wrong person, station moved on). It drops the row with no further write and is not reversible.

## 6. Reopen a closed-round station

If a superadmin deactivates an activity, its open round closes with it (the activity becomes **Disabled**, and any open round ends). To resume:

1. Ask the superadmin to **Activate** the activity again.
2. Return to your station page.
3. Open **Round controls** and choose **Reopen round N** to continue that round, or open the next one.

## 7. The Stations page

### Station cards

- Your default station wears a star (★).
- **Disabled** cards show their state and open without letting you take actions: an inactive activity cannot open rounds, a court that is off cannot start matches, and a swag station that is off has no **Open round** action.

### Court console vs Line-ups

A court also has a **Line-ups** view (the court's address with `/lineups` on the end) listing this court's planned matches, next first, with estimated start times. Use it to call the next two teams to the side of the court before the current match ends. The **Line-ups** view carries **Console** / **Line-ups** tabs at the top; **Console** takes you back to the scoring view (§8–§10).

## 8. End a court match

### Choose your court

1. On **Stations**, tap your court card.
2. The **Console** tab is the default view (`Court {n}` is the title).

### Start a match

Two ways in — quick start wins when the right pairing is standing in front of you.

**Quick start (preferred when the next fixture is present)**

1. Under **Start a match**, read the **Up next here** line — it names the planned fixture for this court.
2. The quick-start list offers up to four pairings that can take the court now; the first is this court's planned next fixture.
3. Tap the pairing and the match begins immediately.

**Manual pick (any two teams)**

1. Under **Or pick any two teams**, choose Team A and Team B.
2. Read the note underneath before you start:
   - **On the schedule — this match settles a fixture.**
   - **Friendly — not on the schedule, cluster points only.**
3. Tap **Start match**.

### Track the score

1. The scoreboard shows Team A and Team B on their sides of the court, as you're standing.
2. Under each team, tap the next number up or down to register points. Only one step either side of the current score is enabled; the app stops you jumping by tap-mistake.
3. The leading team's score stands out.
4. Status banner names the teams and the start time. If the match is a **Knockout** or **Third-place play-off**, a red banner says **this one cannot be drawn**.

### End the match

The footer button says what the current state allows:

- **End match · {Team} wins** — tap if someone is ahead; confirm with **Yes, end the match**. The dialog spells out that only a superadmin can undo a finished match.
- **End match · Draw** — only in non-knockout matches tied at full time; confirm with **Yes, it was a draw**.
- **Overtime. Level at X - Y** — knockout matches cannot be drawn. There is deliberately no button: the next point wins. Tap that point on the strip to settle it.

## 9. Cancel or draw the hard way

### Cancel (no points awarded)

1. If the pairing was wrong from the start, hit **Cancel match (no points)**.
2. The dialog explains the court is freed and nobody scores.
3. Confirm with **Cancel the match**.

Only cancels and direct awards (see §10) can be done without tracking a score.

### Hard-case winners at 0–0

If no score was tracked and somebody clearly won anyway (fouls, forfeit, referee call):

1. Both teams get a **{Team} won** button under **No score yet. Tap a point above, or award the win directly.**
2. Confirm **Yes, {Team} won**. The loss goes to the other team and points are paid immediately.

## 10. Ad-hoc friendly matches

If two teams are standing on court and neither is the next fixture:

1. On **Console**, pick them under **Or pick any two teams**.
2. The note reads **Friendly — not on the schedule, cluster points only**.
3. **Start match** and run it like any other.
4. Points land on the cluster board immediately; the tournament table is untouched.

## 11. Upgrade an award after the timer

If you scan someone and they tell you their result was actually higher, or you realise you armed the wrong tier:

- Inside the undo countdown (§3), tap **Undo**, re-arm the right tier, and scan again.
- After it expires, do not re-scan and hope — the old scan holds the slot (that's what **Replace award** is for, §4). If the round has moved on, ask a superadmin to void or adjust.

## 12. Dispense swag

The swag counter works like a fringe station, but the award is a physical item with a per-person limit per round.

### Arm the item

1. On **Stations**, tap your **swag** station card.
2. The **Round** panel says whether a round is open and how many have been handed out.
3. In **Hand out**, if there is more than one item, tap the item the participant is claiming — the next claim line reads **Next claim: {item} (limit {N}/person)**.
4. The header shows the round number and the handover count.

### Open the counter

1. With no round open, tap **Open round**.
2. The counter is only available while a round is open. A new round resets the per-person limit.

### Hand over an item · camera

1. Tap **Start camera** (or **Stop camera** to close the feed when you pause).
2. Let the participant show their badge. The app posts the claim straight away.

### Hand over an item · manual number

1. Type their 4-digit scan number into **Or type their 4-digit number**.
2. The fourth digit looks them up. The dialog asks **Give {item} to {nickname}?** and states the per-person limit.
3. Confirm with **Hand it over**.

### Read the outcome

- **Claimed** — stock is out the door, the count ticks up, and the participant's name lands in **This round**.
- **Already claimed / over limit** — the limit has been reached for that item this round; no second item.
- **Undo ({n}s)** — for the first 10 seconds, tap to take the handout back. Taken-back claims stay visible with a strike-through and "&#183; taken back" appended, so a reversal never looks like it never happened.

### Close the counter

- **Next round** resets the limit for a new allocation of stock.
- **End for the day** closes the counter. The counter cannot hand anything out until a fresh round is opened.

## 13. Reset a PIN

Use this when a participant has forgotten their 4-digit PIN. (PIN reset works for verified participants — verify their nickname/cluster first.)

1. Go to the **PIN reset** tab. The first panel is **Find the participant**.
2. Type the nickname. Suggestions appear as you type, showing cluster and #number.
3. Tap the right person. (Or enter the full nickname and press **Look up**.)
4. In the **New 4-digit PIN** box, type the new PIN.
5. Select **Set new PIN**.
6. Confirm: **Set a new PIN for {nickname}?** spells out that the old PIN stops working immediately.
7. Tap **Set the new PIN**.

Tell the participant the PIN out loud and ask them to sign in before they walk away.

## 14. If something goes wrong

| Symptom | Action |
|---|---|
| Camera stuck or frozen | **Stop camera** then **Start camera** again. If the browser blocks camera, use 4-digit number manual entry online. |
| Manual number won't submit | You are offline. Wait for the header to read **Online**, or camera-scan. |
| Wrong person scanned | If the undo timer still shows, tap **Undo**. If it has passed, use **Replace award** (§4) where applicable, otherwise tell a superadmin. |
| Wrong team match | **Cancel match (no points)** before it ends, or ask a superadmin to correct it after. |
| Match ended wrongly | A superadmin can correct the score or void the match. Don't restart another match over it. |
| Station not in the list | The station may be disabled or unconfigured — page the superadmin; don't improvise. |
| Activity disappeared / disabled mid-round | The superadmin deactivated it; the open round closed. Ask before trying to reopen (§6). |
| Sync stuck offline | Check the device is actually attached to Wi-Fi, then **Sync now** on the Sync queue tab. |
| Queue row keeps failing | Read its error text. A **held** row retried manually by pressing **Sync now** again; a truly wrong entry can be discarded (it's gone for good). |
| Multiple devices at once | Round state and the one-award-per-round rule are server-side — it's safe to have two marshals on sign-in at one station; the server resolves duplicates. |
