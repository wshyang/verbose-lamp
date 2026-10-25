# Games facilitator — user journeys & touchpoint walkthrough

**Status:** current-state assessment, revised with a friction deep-dive (Part 2, §16–§18)
· **Assessed at:** commit `75a0ae3` (post ADR-083)
· **Role:** facilitator (`/staff/*`, the text-only console theme — fds.md §5.5)
· **Method:** every step below is read off the shipped components and hooks
(`apps/web/src/routes-facilitator/*`, `useCourtConsole`, `useFringeStation`,
`useSyncQueue`, `useStaffTools`, `useQrScanner`, `ConfirmDialog`), so labels, keystroke
filters and system responses are exact. `data-testid`s are given so each table doubles as
an e2e script.

**Demo login for rehearsal:** username `court1`, passcode `1111` (`npm run seed:demo`).

---

## 1. The facilitator's world in one page

A facilitator is one of 10–20 staff running **courts** (team matches) and **fringe
activities** (individual QR-scan stations) on beach Wi-Fi. Their account is created by a
superadmin (there is no self-service signup), optionally with a **default station** that
shows a ★ in their station list. Everything they do happens inside one chrome:

| Chrome element | Where | Behaviour |
|---|---|---|
| Title bar | top | current surface name (station label on station pages) |
| Connection badge | top right | `Online · All synced`, `Online · N queued`, or red `Offline · N queued` — updated by browser online/offline events, visible on **every** staff screen (fds.md DC-004) |
| Username | top right | e.g. `court1` |
| **Sign out** button | top right, `console-shell__signout` | one tap, no confirmation → participant landing page `/` |
| Tabs | under the bar, `console-shell__tab` | **Stations** (`/staff`) · **Sync queue** (`/staff/sync`) · **PIN reset** (`/staff/pin-reset`) |

Two standing safety rails apply everywhere:

- **The confirm dialog (ADR-027).** Destructive or points-affecting actions open a modal
  with a title naming the thing, one sentence of consequence, and two buttons: **Not yet**
  (`confirm-dialog__cancel`, focused by default so a stray Enter key is safe) and a
  specific verb (`confirm-dialog__confirm`, e.g. "Yes, Red Herons won").
- **The offline queue (ADR-009).** A fringe scan that cannot reach the server is queued
  locally with a client-minted idempotency key and confirmed on the spot; replays can
  never double-award. Only scans queue — round/match controls need the network.

The journeys:

| # | Journey | Frequency on the day |
|---|---|---|
| J1 | Sign in and land on the station list | once, plus after any session loss |
| J2 | Pick (or switch) a station | a few times — facilitators rotate |
| J3 | Court: start a match | per match, ~dozens |
| J4 | Court: declare the winner | per match |
| J5 | Court: cancel a match | rare |
| J6 | Fringe: open the day's first round | once per station |
| J7 | Fringe: award points by camera scan | hundreds |
| J8 | Fringe: award points by typed nickname | fallback, frequent in glare |
| J9 | Fringe: round lifecycle (next / end / reopen) | a few times |
| J10 | Work through an offline patch; drain the sync queue | whenever Wi-Fi dips |
| J11 | Reset a participant's PIN | occasional |
| J12 | Sign out at end of day | once |

---

## 2. J1 — Sign in

**Entry points:** the participant landing page `/` → panel "Running the event?" →
**Facilitator** button (`landing__staff`), or the direct URL `/staff/signin`. Any guarded
`/staff/*` URL visited without a session redirects here too.

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | Browser address bar | open the app URL | participant landing page renders |
| 2 | **Facilitator** button (`landing__staff`) | tap | route `/staff/signin`, plain console form: "Facilitator sign-in" |
| 3 | **Username** field (`staff-signin__username`) | tap, then type e.g. `c`·`o`·`u`·`r`·`t`·`1` (6 keystrokes) | free text; auto-capitalise off; every keystroke accepted as typed |
| 4 | **4-digit passcode** field (`staff-signin__passcode`) | tap, then type `1`·`1`·`1`·`1` (4 keystrokes) | masked (`type=password`), numeric keypad on phones; **each keystroke is filtered** — non-digits are dropped, a 5th digit is ignored (`maxLength` + `replace(/\D/g,'').slice(0,4)`) |
| 5 | **Sign in** button (`staff-signin__submit`) | tap (or press Enter in either field — the form submits) | button is disabled until username is non-empty **and** passcode is exactly 4 digits; on tap it shows a pending state |
| 6a | — | (success) | session cookie set, session refreshed, redirect to `/staff` (Stations). Always `/staff` — not the default station |
| 6b | Error line (`staff-signin__error`, red, `role=alert`) | (wrong credentials) | "Username not found or passcode incorrect."; **the passcode field is cleared and refocused** — retype 4 digits, username stays |
| 7 | **Back to participant app** link (`staff-signin__back`) | tap (optional) | returns to `/` |

Keystroke total for the demo account: 6 (username) + 4 (passcode) + 2 taps.

**Session loss mid-shift:** any tap on a staff surface with a dead session bounces to
`/staff/signin`; after re-signing in the facilitator lands on `/staff` and re-picks their
station (2 extra taps — see finding F4).

---

## 3. J2 — Pick or switch a station

**Surface:** `/staff` ("Stations" tab), heading **Pick your station**.

The grid lists **every** court and fringe activity, not just the facilitator's own,
because crews rotate (F31/F32). Each entry (`staff-home__station`) is one full-width
button showing:

- label — e.g. `Court 1` or `Sandcastle Relay`, with **★** appended if it is this
  account's default station;
- a status line — courts: `Match in progress` / `Idle`; activities:
  `Round 2 · open` / `Round 1 · ended` / `No round open`; disabled stations show
  `Disabled`.

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | Tabs → **Stations** | tap (if not already there) | station grid, polled on the jittered 45–75 s cadence so statuses drift in without a refresh |
| 2 | A station button (`staff-home__station`) | tap | courts → `/staff/court/{id}` (J3–J5); activities → `/staff/activity/{id}` (J6–J9) |

Empty state (nothing configured yet): "No stations configured yet — ask a superadmin to
add courts or activities." (`staff-home__empty`). A **Disabled** station is still
tappable — the console inside will refuse actions with the server's reason
("Court is currently disabled." / "This activity is not currently accepting scans.").

Switching stations at any time = tap **Stations**, tap the other station. 2 taps.

---

## 4. J3 — Court: start a match

**Surface:** `/staff/court/{courtId}`, title = the court's label. With no match running
the panel is **Start a match**; with one running it is **Match in progress** (J4/J5) —
one primary action at a time by design (S21–S24).

Precondition: at least two teams exist, else a warning shows above the form
("At least 2 teams must exist before a match can start." — `court__needs-teams`) and Start stays disabled.

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | **Team A** dropdown (`court__team-a`) | tap, pick a team from the native select (2 interactions on a phone: open + choose) | placeholder is "— select —"; list shows every team by name |
| 2 | **Team B** dropdown (`court__team-b`) | tap, pick a different team | same list; choosing the **same** team in both leaves Start disabled — the rule `teamAId !== teamBId` is enforced silently, no error text |
| 3 | **Start match** button (`court__start`) | tap | enabled only when two distinct teams are chosen and nothing is pending. **No confirmation dialog** — the match starts immediately |
| 4 | — | — | panel flips to **Match in progress**: "`Red Herons` vs `Blue Otters` · started 14:05" (`court__match-status`), hint "Tap the team that won. This awards points immediately." |
| 4b | Error line (`court__error`, red) | (conflict) | server refusals surface here, e.g. "This court already has a match in progress." (two facilitators racing the same court) or "Court is currently disabled." |

Taps per match start: 2 dropdown picks + 1 tap. Offline: starting fails with a network
error — match controls are **not** queued (only fringe scans are; see F7).

---

## 5. J4 — Court: declare the winner

Same surface, **Match in progress** state. Both winner buttons are full-width and huge —
the comment in the source says why: they are pressed one-handed.

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | **`Red Herons` won** button (`court__winner`) | tap | confirm dialog opens: title "Red Herons won?", body "This awards the win to Red Herons and the loss to Blue Otters, straight onto the cluster board. Only a superadmin can undo it." |
| 2a | **Not yet** (`confirm-dialog__cancel`) | tap (or press Enter — it holds focus) | dialog closes, nothing recorded |
| 2b | **Yes, Red Herons won** (`confirm-dialog__confirm`) | tap | points post immediately to the cluster board; the court returns to **Start a match**; the result appears in the participant Feed |

2 taps to record a result. Mistakes after confirmation are a superadmin correction
(`/admin/matches`) — the dialog says so before the tap.

---

## 6. J5 — Court: cancel a match

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | **Cancel match (no points)** button (`court__cancel`, red, below the winner buttons) | tap | danger dialog: "Cancel this match?" — "Red Herons vs Blue Otters ends with no points for either team, and the court is free again." |
| 2 | **Cancel the match** (`confirm-dialog__confirm`, danger style) | tap | match voided, no points move, panel returns to **Start a match** |

---

## 7. J6 — Fringe: open the day's first round

**Surface:** `/staff/activity/{activityId}`, title = activity name. The header panel
always shows the round state ("No round open" / "Round 2 · open"), a scan counter badge
(`fringe__scan-count`), and the points value ("5 points per scan"; "· activity inactive"
appended when a superadmin has switched it off).

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | **Open round 1** button (`fringe__open-round`) | tap | **no confirmation** (opening is not destructive); round 1 opens, the panel is replaced by the scan panel (J7/J8) plus live round controls (J9) |
| — | — | (activity inactive) | the button is disabled; ask a superadmin |

After round 1 the same button reads **Open round `N+1`** whenever the previous round has
ended.

---

## 8. J7 — Fringe: award points by camera scan

**Surface:** the **Scan a participant** panel, visible only while a round is open.
The participant shows their QR badge (their `/home` screen); the QR encodes their
**nickname**. Decoding is jsQR on a hidden canvas — works on iOS Safari, no
BarcodeDetector needed.

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | **Start camera** button (`fringe__camera-start`) | tap (once per session) | browser permission prompt on first use → **Allow**; rear camera preview appears in the panel. Denied/unsupported → grey hint "Camera permission denied — type the nickname instead." and J8 remains fully usable |
| 2 | Camera viewfinder | hold the badge in frame — **zero taps** | a frame is sampled every 220 ms; on decode the scan submits itself |
| 3 | Outcome line (`fringe__outcome`, `role=status`) | read it aloud | one of four (identical for camera and typed entry): |
| | | | ✅ **awarded** — "✓ Wei_Ling +5 pts" (green); log list and scan counter update |
| | | | ⚠️ **duplicate** — "Already scanned this round — Wei_Ling" (amber); no points move (same answer whether caught locally or by the server's idempotency key) |
| | | | ⚠️ **queued** — "✓ Wei_Ling +5 pts (queued)" (amber); offline — see J10; header badge ticks up |
| | | | ❌ **rejected** — the server's reason (red), e.g. "Participant not found." or "No open round — open Round 1 before scanning." |
| 4 | — | next participant steps up | the same badge is ignored for 1.5 s (repeat block), then the loop continues; **after every outcome focus returns to the nickname field automatically** so the queue never stalls |
| 5 | **Stop camera** button (`fringe__camera-stop`) | tap when the rush ends | preview stops, camera light goes off |

Steady-state cost per participant: **0 taps, 0 keystrokes.**

---

## 9. J8 — Fringe: award points by typed nickname

Same panel, below the camera — "Or type the nickname". This is the glare/denied-camera
path (F28) and shares the exact submit path and outcomes with J7. The participant's QR
screen itself tells them the fallback: "Can't scan? Ask the facilitator to type
**Wei_Ling**."

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | Nickname field (`fringe-nickname`, `fringe__nickname`) | type the nickname, e.g. `W`·`e`·`i`·`_`·`L`·`i`·`n`·`g` (8 keystrokes) | free text; autocapitalise/autocorrect/spellcheck off so phones don't "fix" nicknames; whitespace trimmed on submit; keystrokes are otherwise unfiltered |
| 2 | **Award points** button (`fringe__scan-submit`) | tap — or just press **Enter**, the field is a form | disabled only while a scan is in flight; empty nickname → local reject "Nickname not found — is this participant signed up?" without a network call |
| 3 | Outcome line | same four outcomes as J7 | the field **clears itself and refocuses** — the next nickname can be typed immediately with no extra tap |

Steady-state cost per participant: nickname keystrokes + Enter. The tap on **Award
points** is never required if a keyboard is in play.

---

## 10. J9 — Fringe: round lifecycle

While a round is open, the **Round controls** panel shows two buttons; when it has ended,
the open-round panel returns with an extra reopen option.

**Next round** (close N, open N+1 in one action):

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | **Next round** (`fringe__advance`) | tap | dialog: "Close round 2 and open 3?" — "Round 2 stops accepting scans. Its 47 scans keep their points." |
| 2 | **Next round** (`confirm-dialog__confirm`) | tap | round 3 is open; scan counter resets; log panel starts fresh |

**End round** (station done for the day):

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | **End round** (`fringe__end`, red) | tap | danger dialog: "End round 3?" — "This station stops accepting scans. Its 12 scans keep their points, and you can reopen the round if you end it by mistake." |
| 2 | **End the round** | tap | scan panel disappears; header shows "Round 3 · ended" |

**Reopen** (undo an accidental end — the dialog above promised it):

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | **Reopen round 3** (`fringe__reactivate`) | tap | dialog: "Reopen round 3?" — "The round accepts scans again and the station goes back on the board." |
| 2 | **Reopen it** | tap | scanning resumes in the same round |

The **This round** log panel (`fringe__log-row`) lists the open round's scans —
"14:22 — Wei_Ling (CS) +5" — newest state on every poll; voided (superadmin-corrected)
scans drop out.

---

## 11. J10 — Offline patch and the sync queue

Nothing is required of the facilitator when Wi-Fi dips — that is the design. What they
*see*:

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | Header badge | (goes offline) | turns red: `Offline · 0 queued` — driven by browser events, on every staff screen |
| 2 | Scan panel | keep scanning exactly as in J7/J8 | every scan answers instantly with the amber "✓ … +5 pts (queued)"; badge count climbs |
| 3 | Header badge | (Wi-Fi returns) | the drainer wakes on the browser's `online` event — and belt-and-braces every 15 s — and replays the queue oldest-first with the original idempotency keys. Badge counts down to `All synced`. A queued entry the server had already seen returns "duplicate" and is silently dropped: **no double points, ever** |

Manual intervention, when wanted — **Sync queue** tab (`/staff/sync`):

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | Tabs → **Sync queue** | tap | status line (`sync__status`): "Online · 3 waiting" / "Offline · 3 waiting"; last blocking error if any (`sync__error`) |
| 2 | **Sync now** (`sync__retry`) | tap | disabled when already syncing or the queue is empty; drains immediately |
| 3 | **Waiting scans** table (`sync__row`) | read | per scan: nickname · activity · `+5` · time · status (`queued` or `2× <server reason>`). A *rejected* entry (server said no — e.g. nickname typo made offline) stays here with its reason rather than vanishing |
| 4 | **Discard** (`sync__discard`, per row) | tap | the entry is removed **immediately — there is no confirmation dialog** (see finding F1) |

---

## 12. J11 — Reset a participant's PIN

**Surface:** **PIN reset** tab (`/staff/pin-reset`). Two panels: find, then set.

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | Tabs → **PIN reset** | tap | "Find the participant" form |
| 2 | **Nickname** field (`pin-reset__nickname`) | type the exact nickname (autocapitalise off; trimmed on submit) | free text — this is an exact lookup, not a search (finding F5) |
| 3 | **Look up** (`pin-reset__lookup`) | tap or press Enter | found → a panel titled with the nickname plus "Cluster CS"; not found → red "Participant not found." (`pin-reset__error`) |
| 4 | **New 4-digit PIN** field (`pin-reset__new-pin`) | type 4 digits — same per-keystroke filter as the sign-in passcode: non-digits dropped, capped at 4 | numeric keypad; **not masked** (deliberate — the facilitator must read it back to the participant) |
| 5 | **Set new PIN** (`pin-reset__submit`) | tap or press Enter | fewer than 4 digits → inline "PIN must be exactly 4 digits.", no dialog. With 4 digits → dialog: "Set a new PIN for Wei_Ling?" — "Their old PIN stops working straight away. Read the new one out to them before they walk off." |
| 6 | **Set the new PIN** (`confirm-dialog__confirm`) | tap | green confirmation "PIN reset for Wei_Ling." (`pin-reset__confirmation`); the PIN field clears; the participant's old PIN is dead on the spot |

---

## 13. J12 — Sign out

| Step | Touchpoint | Action | System response |
|---|---|---|---|
| 1 | **Sign out** (`console-shell__signout`, in the header of every staff screen) | tap | session ends server-side, redirect to `/`. **No confirmation** — signing back in is J1's 12 interactions. Note: queued scans live in `localStorage` and survive sign-out on the same device/browser; they drain after the next sign-in |

---

## 14. Findings

Ordered by how much they could hurt on the day. None block the event.

| # | Severity | Finding | Detail & suggestion |
|---|---|---|---|
| **F1** | **High** | **Sync-queue Discard has no confirmation.** | Every other destructive act in the console goes through the ADR-027 dialog; this one tap silently deletes a participant's earned points from a queue that exists precisely because the network was unreliable. A mis-tap during a stressful offline patch is invisible afterwards (no audit trail of discards). Suggest: `confirm.ask({ title: 'Discard this scan?', body: '<nickname> loses +<points> that never reached the server.' , isDanger: true })`. |
| **F2** | Medium | **Announcements never reach facilitators.** | ADR-074 broadcasts render only in the participant shell, and `/api/me/alerts` is participant-only. A superadmin announcing "lightning — clear the beach" reaches 300 phones but not the 20 people running stations, who are heads-down in the console. Suggest: surface live announcements in `ConsoleShell` (the read is already cached and shared). |
| **F3** | Medium | **Facilitators may post to global chat by API but have no chat UI.** | The authorization matrix allows `GET/POST /api/chat/messages` for facilitators (ADR-046: "every signed-in actor"), yet no staff surface renders the room. Either intent drifted or the console is deliberately spartan (fds.md §5.5) — worth an explicit ADR line either way; a read-only room view in the console would also plug F2 partially. |
| **F4** | Low | **Sign-in always lands on `/staff`, ignoring the default station.** | The account carries `defaultStation` and the picker stars it, but after every sign-in (including mid-day session loss) the facilitator re-taps their own station. One `navigate` when `defaultStation` is set would save the most-repeated tap of the day. The ★ makes it findable, so this is polish. |
| **F5** | Low | **PIN reset lookup is exact-match typing, no scanner.** | The station page has a working QR scanner; the PIN-reset page — used precisely when someone is stuck — asks for an error-prone typed nickname instead of offering "scan their badge". (Their badge is on their phone's `/home`… which they may not reach if signed out on that phone; still useful when the participant is signed in on a friend's device or the badge is printed.) At minimum, the "not found" message already nudges toward the signup question. |
| **F6** | Low | **Same-team selection fails silently on the court console.** | Picking the same team for A and B just leaves **Start match** disabled with no message. The rule is right; a one-line hint ("pick two different teams") would stop a facilitator hunting for why the button is grey. |
| **F7** | Info | **Only scans work offline — match results and round controls do not queue.** | Correct by design (a match result is a shared, contested fact; a fringe scan is an append-only award with an idempotency key), but crews should be briefed: on a dead network a court can still *play*, and the winner is declared when the badge turns green again. The red badge in the header is the tell. |
| **F8** | Info | **Two facilitators can race the same court/station.** | Any facilitator may operate any station (deliberate — rotation). The server arbitrates (second match start gets "This court already has a match in progress."), and round controls confirm before acting, so the damage is a surprised error message, not corrupt data. |

**What is notably good** (worth keeping exactly as is): the zero-tap steady-state scan
loop with auto-refocus and self-clearing input; per-keystroke digit filtering on every
PIN/passcode field; the failed-sign-in passcode clear-and-refocus; "Not yet" holding
focus in every dialog so Enter never destroys anything; dialogs that state consequences
in points ("Its 47 scans keep their points"); the connection badge being visible on every
screen rather than only on the sync page; and duplicate-safety being structural
(idempotency keys) rather than procedural (asking facilitators to be careful).

---

## 15. Coverage note

Existing automated coverage already walks most of these journeys:
`staff-pages.test.tsx` (J1, J2, J11, J12), `station-pages.test.tsx` (J3–J9),
`acceptance/scan.test.tsx` + `scanQueue.test.ts` + `useSyncQueue` tests (J7/J8/J10),
`acceptance/declare-winner.test.tsx` (J4), `acceptance/session-handoff.test.tsx` (J1
session-loss path). The step tables above use the same `data-testid`s, so any journey can
be promoted to an e2e spec without new hooks.

---

# Part 2 — friction re-assessment

A second pass over Part 1 with two specific lenses: **repetition** (steps a facilitator
repeats enough times that seconds compound into minutes) and **differentiation under
stress** (moments where the only thing between a right and a wrong outcome is telling two
similar UI elements apart, in sun glare, one-handed, with a queue watching). Interaction
counts come from the Part 1 step tables; code facts were re-verified against the hooks.

## 16. Repetition hot-spots, ranked by daily cost

### R-1 · The court team pickers are the most repeated expensive interaction in the app

Every match begins with two native `<select>`s over **the entire event's team list** —
`fetchTeams()` returns every team, sorted alphabetically (`lower(team_name)`), with no
cluster grouping and no filtering. At 150–300 participants self-forming teams, that is
plausibly **40–70 entries in an iOS picker wheel, hunted through twice per match**. A
court running 20–40 matches performs 40–80 of those hunts: at a realistic 5–10 seconds
per hunt that is **5–13 minutes per court per day of pure wheel-scrolling**, spent
exactly when the next two teams are standing on the sand waiting.

Aggravators found in the code:

- Team names are participant-invented, so alphabetical order correlates with nothing
  operationally useful (not cluster, not bracket, not "who is queued next").
- The `<option>` text is the bare team name — no cluster code — so two similarly named
  teams ("Beach Bums", "Beach Boys") are distinguishable only by exact reading.
- There is no concept of "recently played here" or "up next"; the wheel starts from the
  top every time.

### R-2 · The typed-nickname fallback punishes typos with a full retype

> **Superseded by ADR-088** — the manual path is now a 4-digit scan number on a numeric
> keypad, resolved to a nickname and confirmed in a dialog; the typed-nickname field this
> finding describes no longer exists, and a rejected lookup keeps the digits on screen.

The manual path costs ~8 keystrokes + Enter per participant — fine as a fallback. But
`useScanSubmission` **unconditionally clears the nickname field after every attempted
send, including a `rejected` outcome** (`setNickname('')` runs on all four outcomes;
only the local empty-nickname block keeps the text). So the most common failure —
one wrong character in `Wei_Ling` — cannot be corrected: the whole name is retyped
blind, while the red message that names the problem sits above a now-empty field. At a
station where the camera is denied all day (a real iOS permission outcome), a
300-participant round is ~2,400 keystrokes *plus* full retypes for every typo.

### R-3 · The camera does not survive leaving the page

`useCameraSession` stops the stream on unmount (correct hygiene), but the practical
loop is: glance at the Sync queue tab mid-rush → come back → viewfinder is dark → re-tap
**Start camera** → (sometimes) re-answer the permission prompt. Every detour off the
station page silently converts the zero-tap scan loop back into a tapped one until the
facilitator notices the dark panel. Nothing on the scan panel says "camera stopped
because you left"; it just looks like J7 before step 1.

### R-4 · Session loss restarts a 14-interaction chain under queue pressure

Part 1 J1 + J2: any mid-day session loss costs 10 keystrokes + 2 taps to sign back in,
then 2 more taps to re-find the station — because sign-in always lands on `/staff`
(finding F4) and ignores the account's `defaultStation`. Each occurrence is small; the
friction is that it recurs at unpredictable moments and always in front of a queue.

### R-5 · Rescuing a stuck queued scan is a 8–12-interaction round trip

A nickname typo'd while offline is only discovered at drain time, as a rejected row on
the Sync queue. There is no "edit and retry": the rescue is read the reason → **Discard**
(no confirmation — F1) → tab back to **Stations** → re-enter the station → retype the
corrected nickname → **Award points**. Multiply by however many typos an offline patch
accumulated, at end of day, when everyone wants to go home.

## 17. Differentiation under stress, ranked by stakes

### D-1 · The two winner buttons are twins, and the stakes are the highest in the app

`court__winner` × 2: identical class, identical size, full width, stacked 12 px apart,
distinguished **only by the team name in the label**. They are pressed one-handed
(the source comment says so), in glare, with both teams shouting. The confirm dialog is
the designed safety net — but see D-3: its mechanics train the facilitator to defeat it.
A wrong tap that survives the dialog awards points publicly to the wrong cluster and is
superadmin-only to undo.

### D-2 · After every match, the start form reappears pre-loaded with the *last* match

`useCourtConsole` never resets `teamAId`/`teamBId` — the state outlives the match because
the page stays mounted. When the winner is declared and the panel flips back to **Start a
match**, both selects still hold the finished match's teams and **Start match is already
enabled** (and start has no confirm dialog, deliberately). A facilitator who glances down
at what looks like a ready form is one tap from starting a phantom rematch. The same
persistence is also the fastest possible legitimate rematch — the fix has to keep that.

### D-3 · One identical dialog for everything breeds confirmation fatigue

Every confirmation in the console is the same shape: cancel bottom-left (focused),
confirm bottom-right. By match ten, "tap the bottom-right button" is motor memory, and
the dialog stops being read — precisely the decay that makes D-1 dangerous. The only
visual escalation that exists is the red danger style on cancel-match/end-round. The
pattern's consistency is a virtue everywhere *except* on the one dialog whose whole job
is to force a read.

### D-4 · Amber means two opposite things on the scan outcome line

`OUTCOME_CLASS` maps both `duplicate` and `queued` to `console-status--warn`. So the same
amber line means "**no** points moved" (duplicate) and "points **will** move, all is
well" (queued). The differentiators are a ✓ glyph and wording, read at arm's length in
sunlight. Meanwhile red (`rejected`) and amber (`duplicate`) both mean "no points" but
demand different responses (fix something vs. wave through). Colour — the fastest channel
under stress — is actively miscueing here.

### D-5 · Every outcome is visual-only, on a screen nobody should be looking at

The scan loop is deliberately zero-tap, which means nothing forces eye contact with the
phone — the facilitator is watching badges and the queue. But the *only* feedback channel
for all four outcomes is one line of coloured text. On a loud beach, a `rejected` scan
(typo, closed round) can scroll past unseen and a participant walks off unawarded,
discovering it on the leaderboard later. There is no `navigator.vibrate`, no audio ping
anywhere in the facilitator code.

### D-6 · The header badge cannot tell "will heal itself" from "needs a human"

`pendingCount` is `items.length` — permanently rejected scans (server said no; they will
**never** drain) count identically to genuinely queued ones. `Online · 3 queued` at
16:00 reads as "it'll sort itself out", when all three may be dead typos whose evidence
lives only in the muted per-row text on S32 — and only on **this device's**
localStorage. The one state that genuinely requires end-of-day human triage is the one
state the always-visible indicator cannot express.

### D-7 · Dense sync-queue rows with per-row destructive ghost buttons

Six columns and an unconfirmed **Discard** per row (F1): under end-of-day triage the
differentiation task is "which row am I discarding", performed on small muted text, with
adjacent rows' buttons ~40 px apart. A mis-row discard deletes a *different*
participant's points, silently.

### D-8 · Courts and activities are visually interchangeable on the station grid

Identical buttons; the kind is inferable only from the label and the small meta line
(`Idle` vs `No round open`). Disabled stations remain tappable and only refuse inside.
Lowest stakes of this list — a wrong tap costs two taps back — but it is the day's first
differentiation task, performed while walking.

## 18. Prioritised fixes

Ordered by (stakes × frequency) ÷ effort. All are small; none touch the wire contract
except P4's second half.

| # | Targets | Fix |
|---|---|---|
| **P1** | D-1, D-3 | Make the winner dialog structurally unlike every other dialog, so fatigue can't defeat it: put **both team names** in it as the only actionable buttons (re-tap the winner; no generic bottom-right confirm), or impose a ~600 ms disabled delay on the confirm button. Either forces one read exactly where it matters. |
| **P2** | R-1 | ~~Group the team selects with `<optgroup>` by cluster and pin this court's last ~3 played teams at the top.~~ **Shipped as ADR-097, amended by ADR-100**: recents pinned via `GET /courts/:courtId/recent-teams`; the rest is ONE alphabetical list — cluster grouping was dropped because teams are cross-cluster and no cluster owns one. Native selects stayed (they are the right control for glare + one hand). |
| **P3** | D-4, D-5 | Split the amber: `queued` gets its own info style ("SAVED — will sync ✓"), amber stays for `duplicate` only. Add a per-outcome audio/vibration cue (rising chirp = awarded/queued, flat buzz = duplicate, double buzz = rejected) — `navigator.vibrate` where present, a primed `AudioContext` on iOS. The loop becomes genuinely heads-up. |
| **P4** | D-6, F1 | Badge shows two truths: `2 syncing · 1 stuck` (red whenever stuck > 0), where *stuck* = attempted with a non-offline error. Confirm dialog on Discard, naming the participant and points (the Part 1 F1 fix). |
| **P5** | D-2 | On match completion, clear both selects and offer one explicit **Rematch: A vs B** button — keeps the legitimate speed, removes the loaded-gun form. |
| **P6** | R-2 | ~~Stop clearing the nickname field on `rejected`~~ **Superseded by ADR-088**: the manual path is a 4-digit scan-number lookup now, and a failed lookup keeps the digits next to the message explaining them — the behaviour this fix asked for, on the field that replaced it. |
| **P7** | R-4, F4 | After sign-in, `navigate` to `defaultStation` when the account has one. |
| **P8** | R-3 | When a round is open and the camera was active before unmount, show "Camera stopped — tap to resume" in the dark viewfinder instead of a panel identical to never-started. |

The through-line of Part 2: the console's *happy paths* are excellent (zero-tap scanning,
keystroke-filtered inputs, consequence-stating dialogs), but its **repair paths** — typo,
stale queue entry, session loss, wrong-button recovery — are where repetition piles up
and differentiation gets hardest, and they all land at the worst times: mid-rush or end
of day.

---

# Part 3 — the round loop and the points model, re-examined

· **Assessed at:** commit `eae23f4` (post ADR-088 scan numbers, ADR-089 scheduling,
ADR-091 up-soon alerts)
· **Scope:** two loops only, at depth — **advancing rounds** and **scanning to award
points** — with special attention to a question Parts 1–2 never asked: *what happens
when a station needs to award different participants different points?*
· Code re-verified against `useFringeStation.ts`, `FringeStationPage.tsx`,
`routes-fringe/index.ts`, `db/entities/rounds.ts`, `db/entities/activities.ts`,
`routes-superadmin/config.ts` and fds.md §2.7–§2.9, §3.3.

## 19. What a round actually is (and what the UI pretends it is)

The console presents a round as a *time label* — "Round 3 · open". The data model says
a round is three different things at once:

1. **The de-duplication boundary.** `(participant_ref, round_ref)` is unique (fds.md
   §2.9). A participant can be awarded **once per round**, so *advancing the round is
   the only instrument that re-admits repeat visitors*. This is the real reason a
   facilitator advances — not timekeeping — and nothing in the UI says so.
2. **A batch label** snapshotted onto every scan (`round_number_snapshot`), visible in
   audit and scan history.
3. **The points multiplier of last resort.** Because each round re-admits everyone at
   the same flat value, scanning the same person across N rounds is the only
   facilitator-reachable way to award N× points — see V-1c below.

The state machine (fds.md §3.3, `rounds.ts`):

```
            advance (atomic close+open next)
  open ────────────────────────────────────▶ closed   ◀— unreachable forever
    │                                           ▲
    │ end (F29)              deactivate (F36) ──┘ (auto-close, remote)
    ▼
  ended ──── reactivate (F30) ────▶ open     (same round number)
```

Two facts drive most of the friction below:

- `findCurrentRound` only looks for `open` or `ended` rows (`rounds.ts:45–52`). A
  **closed round ceases to exist** as far as the console is concerned.
- `reactivateRound` flips `ended → open` only (`rounds.ts:125–131`). **There is no path
  back from `closed`. Advance is the console's only irreversible round action — and the
  only one whose dialog does not say so.**

## 20. Round-advancement findings

### A-1 · The one thing advance is *for* is the one thing nobody tells the facilitator

The duplicate outcome says "Already scanned this round — Wei_Ling" (amber, F27) and
stops there. The remedy — **Next round** re-admits everyone — is never stated: not in
the duplicate line, not in the advance dialog, not on the button. A facilitator who has
not internalised rounds-as-dedup-boundary either turns repeat players away ("system says
no") or discovers advancing by experiment. The knowledge lives in fds.md §2.9's
composite-uniqueness row, which is exactly where a marshal on a beach is not.

### A-2 · The danger signalling on the two round buttons is inverted

`LiveRoundControls` renders **Next round** (plain) beside **End round** (red,
`console-button--danger`, `isDanger` dialog). But:

- **End** is *reversible* — its own dialog says "you can reopen the round if you end it
  by mistake", and F30 exists precisely for that.
- **Advance** is *irreversible* — round N becomes `closed`, which no console path can
  reach again — and its dialog ("Round N stops accepting scans. Its 12 scans keep their
  points.") reads as the gentler of the two.

The red button is the safe one; the plain button is the one-way door. Under D-3
confirmation fatigue (Part 2), the facilitator's motor memory is calibrated backwards.
A mis-advance mid-rush cannot be walked back: the old round's number is retired, and the
only "fix" is to carry on in round N+1 — harmless to points, but it permanently
desynchronises the station's round count from the game's actual heats, which matters to
anyone using `round_number_snapshot` downstream (audit S47, scan history S6).

### A-3 · After *ended*, the biggest button on screen quietly inflates the round count

`OpenRoundPanel` over an ended round stacks, in order: a **huge primary** "Open round
N+1" (no confirmation — opening is classed non-destructive) above a **plain secondary**
"Reopen round N" (confirmed). The end-of-day repair scenario — "we ended, but one kid
never got scanned" — wants the *second* button, but the eye and thumb land on the first.
One mis-tap opens round N+1; there is no un-open (ending it just parks an empty round at
`ended`, and the real round N is now two states away and `closed` if you advance again).
The repair for a mis-tap *during* a repair does not exist.

### A-4 · The console has no ambient answer to "should I advance?"

A round carries `opened_at`, and the server never surfaces it; the header shows
`Round 3 · open` and a **per-round** scan count only. There is no elapsed-time hint, no
"N scans today" across rounds, no nudge when a round has been open for an hour at a
station that runs 10-minute heats. Advancing is driven entirely by the facilitator's
memory, and the cost of forgetting lands on participants as amber duplicates (A-1).
For comparison: the court console got exactly this class of ambient aid in ADR-089
(prepopulated pickers, "up next here").

### A-5 · Round controls are online-only, and that freezes the dedup boundary offline

Scanning survives the network dying (ADR-009: queue, instant ✓). The round lifecycle
does not — `openRound/advanceRound/endRound/reactivateRound` go through plain
`useAction` with no queue, and fail with an error line when offline. Net effect during
an offline patch: you can keep awarding *new* visitors indefinitely, but you cannot
re-admit *repeat* visitors, because the boundary that blocks them can only move via the
server. The failure is also mispriced in the UI: the error line under the header is the
same shape as any other error, with no "you're offline — rounds need the network" copy
(the manual-entry path got exactly that treatment in ADR-088).

### A-6 · Remote deactivation yanks the round out from under a live queue

F36: a superadmin toggling the activity inactive auto-closes the open round. At the
station this manifests as: scan panel vanishes on the next poll (≤75 s), replaced by
"Open a round before scanning" with the open button disabled, and the only explanation
is ` · activity inactive` appended in muted text to the points line. No actor, no
reason, no "see the superadmin". A facilitator mid-queue experiences it as the app
breaking. (Part 2 F2 — announcements don't reach facilitators — compounds this: the
natural channel for "we're closing sandcastle early" doesn't reach the one person
running it.)

## 21. The varying-points findings

### V-1 · Points are a property of the *place*, not the *performance* — and the UI inherits the model's flatness

`point_value` lives on the activity (fds.md §2.7, `integer ≥ 1`), is set by the
superadmin at creation/edit, and every scan snapshots it (`routes-fringe/index.ts:143`).
The facilitator has **zero instruments** for awarding anything other than the flat
value: no tier choice, no bonus, no multiplier. Any station whose game produces
*placings* — which is most games ("first three sandcastles win big") — cannot express
its outcome. Three workarounds exist in the current system, all bad:

- **(a) Radio the superadmin to edit `point_value` live.** `PUT /activities/:id` has no
  guard against open rounds; scans snapshot whatever value is current at insert. So the
  sequence "scan the 1st-place kid → radio → wait → scan the 2nd-place kid" races the
  admin's thumb against the station queue, serialises every multi-tier award through one
  human for the whole event (10+ stations), and silently mis-prices any *other* station's
  concurrent... no — any *this* station's concurrent scans between edits. The station
  header updates only on the next poll, so the facilitator cannot even see when it is
  safe to resume (V-5).
- **(b) One activity per tier** ("Sandcastle Gold / Silver / Bronze"). Works within the
  model, and: triples the S20 station grid (Part 2 D-8), triples the round lifecycles to
  shepherd, and forces a *page navigation per adjacent finisher* — which kills the
  camera every time (Part 2 R-3) and re-renders the whole console between two kids
  standing side by side.
- **(c) Advance-and-rescan to stack N× the base value.** Because each round re-admits
  everyone, scanning the winner in rounds 7, 8 and 9 awards 3× base. This abuses the
  dedup boundary (closing the round for *everyone else* to multi-award one person),
  costs 2 taps + a confirm + a rescan per increment, and writes an audit trail that
  actively lies — three scans in three rounds, when the truth was one performance worth
  3× points.

The quiet irony: **the data model already supports per-scan values.**
`points_awarded_snapshot` is a per-row integer; the leaderboard, scan history, audit and
void paths all read the snapshot, never the activity. Varying points is not a migration
— it is a write-path and admin-schema change (see §22 P9).

### V-2 · The number the facilitator promises is not always the number that lands

Three different reads of `point_value` can disagree within one award:

1. The ADR-088 confirm dialog title (`Award +5 to Wei_Ling?`) uses the page-load
   activity, refreshed only by the 45–75 s poll.
2. A **queued** confirmation line prints the same client-side value
   (`sendScan` → `activity.pointValue`).
3. The server snapshots the value current **at insert** — the only truth, shown only
   for *online* awards (the response's `pointsAwardedSnapshot`).

Any live edit (workaround V-1a makes them routine!) opens a window where the facilitator
says "+5", the participant hears "+5", and the board shows "+10" — or the reverse. Each
instance is small; the cost is trust in the one ritual (ADR-088) built specifically to
make the award verifiable.

### V-3 · The manual path discovers "already scanned" three interactions too late

The by-number lookup (`GET /staff/participants/by-number/:n`) returns the participant
only — it does not say whether they were already awarded this round. So the repeat-visitor
flow on the manual path is: type 4 digits → read dialog → **Award points** → amber
"Already scanned this round". Three deliberate acts and a public yes-ritual, concluded
by a public no. The camera path fails fast (instant amber); the typed path — used
precisely when conditions are worst (ADR-088's glare-and-wind rationale) — fails slow.
The server has both facts (participant, open round) at lookup time.

### V-4 · There is no small-correction instrument at all

Beyond flat-value awards, the facilitator's toolbox is empty: no +N bonus, no partial
award, and no way to fix a magnitude error. The only correction instrument in the whole
fringe system is the superadmin void (F44-style, reversible) — which can *remove* a scan
but never *resize* it; a resize is void + radio + V-1a + rescan, i.e. every workaround
in this section chained together.

### V-5 · The live value is invisible at the moments it changes

The header line ("5 points per scan") refreshes on the poll; the scan log shows per-row
snapshots. After a live edit, the log can show `+5` and `+10` rows interleaved with no
on-screen explanation, and the header may contradict both for up to 75 s. Nothing marks
"value changed at 14:03" — the facilitator reconstructs it from row deltas, or more
likely never notices.

## 22. What to change — and what to keep

Continuing Part 2's numbering. Ordered by (stakes × frequency) ÷ effort.

| # | Targets | Fix |
|---|---|---|
| **P9** | V-1, V-4 | **Tiered awards, superadmin-defined, facilitator-chosen.** Give the activity an optional tier list (e.g. `[1, 3, 5]`, capped few entries, each ≥ 1) alongside the default `point_value`. The scan panel renders the tiers as segmented buttons above the scanner — tap once to arm ("next scan awards +5"), sticky until changed, default tier pre-armed. The POST carries the chosen value; the server validates it against the activity's tier list (never freeform — the tier list is the integrity boundary, like ADR-027's "the server re-checks what the dialog promised"). Snapshot columns need **zero** changes. Kills workarounds (a)(b)(c) outright; the ADR-088 dialog and the ✓ line already print the per-scan number. |
| **P10** | A-1, V-3 | **Teach the remedy where the block appears.** Duplicate line gains the next step: "Already scanned this round — Next round re-admits everyone." And the by-number lookup response gains `alreadyScannedThisRound: boolean`, so the dialog can say so *before* the yes-ritual (confirm button becomes "Already awarded — close"). Two copy changes and one response field. |
| **P11** | A-2 | **Say the one-way thing in the one-way dialog.** Advance copy: "Round N closes **for good** — reopening is only for *ended* rounds — and round N+1 opens." Cheap and honest. The structural fix (danger-style Advance, or make the latest `closed` round reopenable while round N+1 has zero scans — a 5-line entity change mirroring `reactivateRound`) is worth an ADR if mis-advances are observed on the day. |
| **P12** | A-4 | **One telemetry line under the header:** "Open 42 min · 18 scans this round · 57 today." `opened_at` is already in the row; the day total is one count query that can ride the existing activity read. Turns "should I advance?" from memory into glance. |
| **P13** | A-6 | **Name the remote hand.** When deactivation closes the round, the station shows a plain-language banner ("The superadmin closed this station at 14:02") instead of a vanished panel and three muted words. The audit trail already records actor and time; surface it. Pairs with Part 2 F2 (announcements for staff). |
| **P14** | V-2, V-5 | **Pin the promise to the award.** The confirm dialog and queued line should state the value *the server will use* — cheapest honest version: re-read the activity in the by-number lookup response (it is already a round-trip) and print that; plus a log divider row ("point value changed 5 → 10, 14:03") whenever adjacent snapshots differ. Mostly obsoleted by P9, which makes the chosen tier explicit at scan time. |
| **P15** | A-5 | **Offline copy for round controls**, mirroring ADR-088's manual-entry treatment: disable the three round buttons offline with one line ("Rounds need the network — scans still queue."). Do *not* queue round mutations; an offline-advanced boundary would let duplicates through on two devices at once, which is the one guarantee (§2.9) worth protecting. |

**Deliberately kept, with reasons:**

- **Once-per-round uniqueness** — it is the anti-double-award guarantee and the
  idempotency backstop for the offline queue (first-write-wins, §2.9). P9 varies the
  *value*, never the *count*.
- **The confirm on Advance/End** (ADR-027) — these end a phase; the dialogs are correct.
  The fix for fatigue is P11's honesty, not removal.
- **Flat default value per activity** — most stations *are* flat-rate, and the zero-tap
  camera loop must stay zero-tap. P9's armed tier is sticky precisely so the default
  case never costs a tap.
- **Scans draining into closed rounds** (`recordScan`: "the client's round is
  authoritative at sync time") — looks like a loophole, is actually the offline queue's
  correctness: a scan earned in round N must land in round N even if the round closed
  while the phone was dark.

The through-line of Part 3: Parts 1–2 found that the *repair* paths lag the happy paths.
The deeper version visible from these two loops: **wherever the UI's vocabulary is
thinner than the model's, facilitators pay in workarounds** — a round is secretly the
dedup boundary (A-1, A-2), a point value is secretly a per-scan snapshot (V-1), and in
both cases the system already knows the richer truth and the console just never says it.
