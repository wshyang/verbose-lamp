# Friction audit — a nitpicking walkthrough

**Date:** 2026-09-29 · **Status:** the P2 "few seconds every time" findings and the
missing confirmations are **fixed** (ADR-027); each one is marked below. · **Method:** the real pages driven through jsdom against the running
API (`npm run dev` + `npm run seed:demo`), plus direct API probes. Every finding below was
observed, not inferred; where I could not observe something I say so.

Severity: **P1** breaks or misleads during the event · **P2** costs time or trust every
time it happens · **P3** polish.

---

## Cross-cutting

### P1 — Empty-state copy is shown before the data arrives

Two staff surfaces tell the marshal something untrue for the first second:

| Surface | First paint | Reality |
| --- | --- | --- |
| Court console | "Start a match — **At least 2 teams must exist before a match can start.**", both team pickers empty | 5 teams exist; a match was already **in progress** on that court |
| Fringe station | a single **disabled** "Open round 1" button | round 1 was already open with 14 scans |

Both settle about a second later — the court console redraws into "Merlion Squad won /
Sunset Smashers won / Cancel match", the station into the full scan panel. A marshal
glancing at a tablet in sunlight reads the wrong thing and walks to the ops desk.

*Cause:* these panels compute their empty state from data that defaults to `[]`
(`hasEnoughTeams = teams.length >= 2`) instead of waiting for the load, the way
`StateMessage` does. *Fix:* gate hand-rolled warnings behind `isLoading`, and render a
skeleton of the same height.

### P2 — Every page changes shape once on arrival

Same root cause, different symptom: the Teams page paints Create / Join / Browse and then
replaces all of it with "You're on a team. Leave it first if you want to join another."
The court console swaps its whole panel. Nothing is wrong afterwards; it just jumps under
your thumb, which on a phone means mis-taps.

### ✅ FIXED (ADR-027) — P2 — PIN fields were `autocomplete="off"`, so nothing could remember them

Participant sign-up, participant sign-in and staff sign-in all set `autocomplete="off"` on
the PIN/passcode. No browser or password manager will offer to save or fill the pair. This
is the app whose recovery path is *"Forgot your PIN? Ask any facilitator to reset it."* —
we are actively preventing the one mechanism that would avoid that queue.
*Fix:* `name` + `autocomplete="current-password"` (sign-in) / `"new-password"` (sign-up).

### ✅ FIXED (ADR-027) — P2 — Focus was never moved to what went wrong

Submitting the empty sign-up form leaves focus on the submit button
(`document.activeElement` = `signup-form__submit`) and the error text renders above a
form that is two screens tall. On a phone you are told "something is wrong" and then have
to hunt for it. *Fix:* focus the first invalid field and wire `aria-describedby` to the
message.

---

## Sign-up (S1)

### ✅ FIXED (ADR-027) — P1 — One message for three different problems

Typing `Jo` and typing an already-taken `Amira` produce **the identical** sentence:

> Nickname must be 3–20 characters, letters/numbers/underscore only, and not already taken.

As a user I cannot tell whether to make it longer or to pick a different name. The string
is normative (fds.md §2), so keep it — but the 409 "taken" case should add *"`Amira` is
taken — try `Amira_2`"*, and the length case should be caught inline as I type.

### ✅ FIXED (ADR-027) — P2 — The empty form complained about the third field

Submit with nothing filled in and the app says **"Please select your cluster."** — not
"enter a nickname". Validation runs in schema order, not in reading order, so you fix
fields in an order the form chose.

### ✅ FIXED (ADR-027) — P2 — 51 controls stood between a new participant and joining

Between the four required fields and the "Sign up & join!" button sit 5 personas, 5 hair
styles, 3 beards, 8 skin tones, 10 hair colours, 10 shirts and 10 backdrops — 51 buttons,
all optional, all above the submit. First-run on a beach, on a phone, in a queue.
*Fix:* collapse the studio behind "Customise my look (optional)" — the persona row alone
already gives a good default — and keep the full studio on the profile, where it already
lives.

### P2 — The PIN is typed blind, once

`type="password"`, four digits, no reveal toggle and no confirmation field. A typo is only
discovered at the next sign-in, and the remedy is to find a facilitator.

### P3 — Gender is a required binary that also silently drives the hairstyle list

Two buttons, no third option, and picking one swaps which five hairstyles exist. Nothing
explains the link.

---

## Sign-in (S2)

| Severity | Finding |
| --- | --- |
| ✅ FIXED | A wrong PIN was **left in the field**. It now clears itself and takes the caret back, so the retry is four taps. Same on both staff sign-ins. |
| P3 | The submit button is disabled until both fields are valid, with nothing saying why. |
| P3 | "Ask any facilitator to reset it" is honest but a dead end — no "where", no self-service. |

---

## Badge / home (S3)

- **✅ FIXED (ADR-027) — no fallback if the QR will not scan.** The badge now says
  *"Can't scan? Ask the facilitator to type **Amira**."* under the code — the station has
  had a nickname field all along; nothing on the participant's screen said so.
- **P3 —** the nav reads QR / Teams / Board / Feed / **Me**, where "QR" is the home screen
  and "Me" is the trainer card. "Badge" and "Card" would be plainer.
- *Not checked:* the QR image itself never renders in jsdom ("Drawing your code…"), so
  brightness and scan reliability need a real device.

---

## Cluster board (S5)

### P1 — Tied clusters are given different ranks

Live data, right now:

```
#1 BP      83      #7  ITC       38
#2 CHROO   83      #8  LDS       38
#3 CS      80      #9  PSC Sect  38
#4 Comms   80      #10 WD        38
```

BP and CHROO have **the same score** and are shown as first and second; four clusters tie
on 38 and are ranked 7th to 10th. Ranks come from `rank: index + 1`
(`apps/api/src/views/admin.ts`) — array position, not score. This is the screen that goes
on the projector at the closing ceremony, and the FDS does not specify tie handling, so
nobody has decided it. Standard competition ranking (1, 1, 3) is a three-line change.

### P2 — Your own cluster is not pinned

Sixteen rows; the "you" pill only helps once you have found yourself. A pinned "your
cluster" row at the top (or a jump link) removes the scroll-and-scan on the surface people
open most.

### P3 — Six clusters with no points fill the bottom third

`Fringe 0 · Tournament 0 · 0 players`, six times. Group them under "Not started yet".

---

## Teams (S7/S9)

- **P3 —** nothing on the page states the rules: how many per team, whether teams lock,
  when the tournament starts. A captain has to ask someone.
- **Good:** the join code uppercases as you type, "Team not found." appears inline, and
  the Join button stays disabled below six characters.

---

## Fringe station (S25) — the surface with a queue in front of it

### ✅ FIXED (ADR-027) — P1 — Focus did not return to the nickname field after an award

After a successful scan the field clears (good) but focus lands on the **Award points**
button. Every person in the queue therefore costs an extra tap-to-focus. Twenty people at
a station, five stations, all day.

### P2 — No undo on a mis-scan  *(still open, deliberately)*

Award the wrong person and the only remedy is a superadmin void: a radio call, a walk, or
a wait. A ten-second "Undo" on the outcome line would keep it at the station. Note that
the scan button is deliberately **not** behind a confirmation (ADR-027): a queue of twenty
cannot afford a modal per person, and a wrong scan is a 15-point correction, not a match
result. Undo is the right remedy here, not a prompt.

### ✅ FIXED (ADR-027) — P2 — The nickname input invited autocorrect

No `autocapitalize`, `autocorrect` or `spellcheck` attributes. iPadOS will capitalise and
"correct" names. The API is case-insensitive and trims (verified: `amira` and `"Amira "`
both resolve), so capitalisation is safe — autocorrect rewriting a name is not.

### Good, and worth keeping

- Duplicate scan → **"Already scanned this round — Amira"**; unknown name → **"Nickname
  not found — is this participant signed up?"** Both say what to do next.
- The round's scan count and full log sit on the same screen as the input.
- Replaying the same `client_scan_uuid` returns the original scan (verified by hand), so
  the offline queue cannot double-award.

---

## Court console (S21)

| Severity | Finding |
| --- | --- |
| ✅ FIXED | **Declaring a winner had no confirmation.** One tap on "Merlion Squad won" awarded tournament points; undoing it needed a superadmin void. Every action that moves points, ends a phase or removes somebody now asks first (ADR-027). |
| P2 | The team pickers are two plain `<select>`s listing every team in the event (50 in the load-test data), ordered by creation time, with no search and no captain shown. |
| P3 | The live-match panel does not show how long the match has been running. |

---

## Superadmin console

| Severity | Finding |
| --- | --- |
| P2 | The scans page filters by activity only — there is no search by nickname, so finding one mis-scan among hundreds means scrolling an eight-column table. The same is true of matches. |
| P3 | Eleven nav links with no grouping: set-up-once (Points, Activities, Courts, Facilitators, Superadmins) reads the same as during-the-event (Matches, Scans, Participants, Teams, Audit). |

---

## What I could not assess here

No headless browser in this environment (ADR-139), so: the QR code image, real touch
target sizes, colour contrast in sunlight, iOS/Android keyboard behaviour, the camera
scanner, and how the backdrop animations feel on a low-end phone. Those need a device.

---

## What was fixed in this pass

Everything marked ✅ above, plus confirmations on every action that changes data in a way
a marshal cannot walk back:

| Surface | Now asks before |
| --- | --- |
| Court console | declaring a winner, cancelling a match |
| Fringe station | ending a round, moving to the next round, reopening an ended round |
| My team | leaving, removing a member, handing over the captaincy, locking/unlocking |
| Superadmin | disabling/enabling a court, activating/deactivating an activity |
| PIN reset | setting a participant's new PIN |

Void and unvoid already required a typed reason, which is a stronger guard than a
confirmation, so they are unchanged. The scan button is exempt on purpose — see above.

Measured after the change, against the running app: the sign-up form shows **13 controls
before the studio is opened** (it was 56); an empty submit says *"Nickname must be 3–20
characters…"* with the hint *"Three characters or more, please."* and puts the caret in
the nickname field; a taken nickname adds *"Amira" is taken. Try Amira_2.*; a wrong PIN
leaves an empty, focused PIN box; and after a scan the caret is back in the nickname
field with `autocapitalize`, `autocorrect` and `spellcheck` all off.
