# Frontend friction, walked from the ten stories

The hunt that `manual-day-flow-stories.md` was set up for. Method: each story was re-walked at the component
level — the hook, the element, the CSS, the test that pins it — and a finding is written only where the code
shows the gap. Thirteen findings follow, ranked, each with the file and line that produced it, what it costs a
person on the day, which layer owns it, and the smallest change that closes it.

**Read §1 first.** This front end is not naive, and several obvious suspects are already fixed — some of them
by code that is *better* than the fix a hunt would propose. §1 is the do-not-rebuild list, and it also corrects
three claims the stories themselves got wrong. A friction report that skips this section spends the next stage
re-inventing what already exists.

---

## 1. Already handled (do not propose these again)

| Suspect | What the code actually does |
|---|---|
| Double-tapping a submit | `useAction` owns one in-flight slot and every call site disables on `isPending` — a sweep of `.run(` across `routes-facilitator`, `routes-superadmin`, `routes-participant` finds **no** file that omits the guard. |
| Wrong score tap | `MatchScoreboard.tsx` is not a `+1`: `scoreWindow()` renders five numbers centred on the current score and `disabled={Math.abs(value - score) !== 1}` leaves only the two neighbours pressable, so undoing the last point is on the board — "there is no gesture here that can invent a score nobody played" (its own words). My P2 note about a mis-tap needing the desk was wrong. |
| Score tap freezing the console | `useCourtConsole.ts:106` — "A score tap must not freeze the rest of the console, so it is deliberately not in `isBusy`", with `useLiveScore`'s optimistic value reconciled against the server read (:115-154). |
| Losing the last point's context | The confirm *title* quotes the score: `won 3 - 2?` / `Draw at 3 - 3?` (`CourtPage.tsx:269`, `:288`), and a level knockout gets a live "Overtime." line (`:307`). |
| Mis-scanning at speed | The scan box is *deliberately* outside the confirm system, and the reason is in the hook's comment: "a queue of twenty people cannot afford a modal per person" (`useConfirm.ts:12-13`). |
| Missing the undo deadline | `UndoRow` counts it down on the button ("Undo (7s)", 500 ms tick) rather than hiding it. |
| Offline surprise | `StaffShell.tsx:8-27` carries `Online · All synced` / `Offline · 3 queued` in the header of **every** station screen (fds.md DC-004), with the sync page one tab away. |
| Camera refused / glare | `useQrScanner.ts:70` — "Camera permission denied — type their 4-digit number instead.", and `isSupported: false` is documented as "a normal state, not an error" (:9-10). |
| Forgetting which tier is armed | `TierArmingRow` is one tap to arm every following scan, `aria-pressed` on the choice, and an echo line that says what the next scan pays, because "a forgotten re-arm is this design's one real hazard" (ADR-092). |
| No feedback that a scan worked | `useAwardCelebration.ts` flashes a green border and plays a ding — **only** on `awarded`: "a queued scan is a promise, a duplicate is a refusal, and neither should sound like a success", with iOS audio unlocked on the first pointerdown. |
| Tapping a field before every scan | `useTypeAnywhere` (ADR-105) sends any printable key to the page's primary box, keeps modifiers/IME/Enter/Space out of it, and suspends capture while a confirm is up; the fourth digit of the scan number is itself the submit (`FringeStationPage.tsx:220-226`). |
| Stale numbers on the phone | `points-freshness.test.tsx` pins `/api/me` and `/api/me/scans` as warm-start-*and*-always-revalidate: "a TTL that is right for the first half silently freezes the second" — the app's one product freshness rule, with its cost recorded in ADR-112/113 rather than counted as a win. |
| Poll-storm from a crowd | `POLL_MIN_MS = 45_000` / `POLL_MAX_MS = 75_000` with per-client jitter: "a fixed interval turns the crowd into a metronome pointed at the one laptop running the event" (`useAsyncData.ts:53-60`). |
| A list with nothing in it | `StateMessage` gives loading / error (`role="alert"`) / empty in one component, and 37 files use it; `StaffHomePage` even tells you why a picker is empty ("ask a superadmin to add courts or activities"). |
| Retyping a result you agree with | `useCorrectionDialog.openCorrection` clears the reason and prefills both scores with what was recorded (ADR-157, `useAdminCorrections.ts:72-79`), and Enter confirms with `isBusy` holding the second press (`ReasonDialog.tsx:26-31`). |

The three stories claims §1 disproves are patched in `manual-day-flow-stories.md` itself (P2's mis-tap note,
P4's filter list, N5's "filter by participant or round"). Precision matters more than a neat story.

---

## 2. Findings

Ranked by (how often the day hits it × how badly it lands) ÷ how small the fix is. **S** = screen only,
**S+A** = screen with a small API addition, **A** = API.

| # | Finding | Who | Cost on the day | Size | Layer |
|---|---|---|---|---|---|
| F1 | Neither dialog can be dismissed by keyboard, and nothing keeps focus inside it | everyone | every mis-opened confirm costs a walk to the screen | small | S |
| F2 | Offline kills the spoken-number fallback that the badge promises will work | station, queue | twelve people unscorable until wifi returns, six of them with dead batteries | small | S |
| F3 | The reason field's rules are invented locally and reported with the wrong sentence | desk | an audit line that reads as a shrug, or a refusal that says nothing is missing | small | S+A |
| F4 | The API names the bad field; only the sign-in forms listen | everyone | the fix for any validation error is guessing | small | S |
| F5 | The two correction dialogs use two different overlay systems, and the update banner sits between them | desk, station | a dialog that can be painted over, and two behaviours where one is wanted | small | S |
| F6 | One confirm slot, silently overwritten | station | an award decision made against the wrong row | small | S |
| F7 | You cannot find a scan or a match by person, team or court | desk | the undo-window handoff costs minutes of scrolling instead of seconds | medium | S |
| F8 | No admin table has a scroll container | desk on a tablet, anyone on a phone | the correction you came for is off the right edge | medium | S |
| F9 | `firstError` + one `StateMessage` line: partial failure reads as total failure | station, desk | wrong diagnosis, then a needless call to the desk | medium | S |
| F10 | The scheduled/friendly promise is cached and never corrected after the whistle | marshal, team | a won match that advanced nothing, explained on the spot by gesture | small | S+A |
| F11 | The ★ is configured, never remembered — and cannot be a swag counter at all | swag marshal | every morning, every station, re-picking from forty tiles | small | S+A |
| F12 | The one error string outside the message catalogue is "Something went wrong." | everyone | the sentence after anything unexpected | trivial | S |
| F13 | The stale-build banner has one button, no defer, and no room made for it | station | "Reload" pressed at the worst moment, or a bar over the primary action | small | S |

### F1 · Two dialogs, neither dismissable, neither containing focus

`ConfirmDialog.tsx` and `ReasonDialog.tsx` both render a full-viewport overlay (`base.css:69-78` `inset: 0`,
`z-index: 60`; `console.css:273-282` `inset: 0`, `z-index: 30`) with `role="dialog" aria-modal="true"` — and
then implement no dialog behaviour: no `Escape` handler, no backdrop click, no focus trap, no `inert` or
`aria-hidden` on the page behind, no focus return. `grep -rn "Escape|keydown|trapFocus|inert"` over the two
files, `useConfirm.ts` and the stylesheets returns **nothing**.

The consequence is asymmetric and both halves hurt. Mouse users cannot click out — fine, that is the deliberate
ADR-027 choice, *"Cancel holds the focus, because the dangerous answer should never be the one a stray tap or a
pressed Enter key chooses"*. But keyboard and screen-reader users can Tab straight out of the modal into the
row list behind it, which is still live: a `Tab` and a `Space` activates a button nobody can see because the
backdrop is dark. And with `autoFocus` only on `ConfirmDialog`'s Cancel and on `ReasonDialog`'s input, there is
no return of focus to the button that opened either dialog, so a marshal who cancels is looking at a screen
whose focus ring is somewhere else.

**Cheapest fix.** One hook — `useDialog({onClose})` — returning `{ref, onKeyDown}` that traps Tab, closes on
Escape (only when the action is not in flight), and restores focus on unmount; both dialogs adopt it. Roughly
25 lines plus one test each. **Test:** render a page with a confirm open, press Escape, assert the underlying
button has focus again and that the action did not run; press Tab five times, assert focus never leaves the
dialog.

### F2 · The number fallback dies exactly when the fallback is needed

The participant's badge promises it out loud: *"Can't scan? Give the facilitator your number:"*
(`QrHomePage.tsx:48-50`, ADR-088). On the station, that path is a `#fringe-number` input with
`disabled={!station.isOnline}` and a `Look up` button with the same condition
(`FringeStationPage.tsx:215-227`), plus its own sentence when offline — `messages.manualEntryOffline`, justified
in the comment above it: "manual entry is online-only: a number cannot name a person without the server".

So the two promises are inconsistent across the one state that matters. The camera keeps working offline (a QR
carries the nickname in the payload, and `lib/offline/scanQueue.ts` queues it); the *spoken number* does not,
because resolving four digits to a person is a server read. The person most likely to be at a station when the
network is unhappy is precisely the person with no working screen to hold up — and `StaffShell`'s header is
telling the marshal `Offline · 2 queued`, which reads as "you can keep going", because you can, for the people
whose phones work.

**Cheapest fix.** Not a new offline index: check first what the identity caching on the device already holds
(`lib/hooks/identity-cache.test.tsx` exists, and `lib/storage/cacheNames.ts` is ADR-239's warm-start store). If
a number→nickname map is already reachable, the fix is to let `#fringe-number` accept input while offline,
resolve locally, and queue exactly like the camera path — with the existing `manualEntryOffline` sentence kept
for the case the device genuinely cannot resolve. If it is not reachable, the honest fix is copy: the badge
should say *"Can't scan? You'll need a staff member with a connection."* — because a promise that fails at 13:10
in a marquee is worse than no promise.

**Test:** station page, `navigator.onLine = false`, assert the number field is enabled and a resolved scan
lands in the queue; assert an unresolvable number still shows the refusal sentence.

### F3 · "Reason is required" is the message for a reason that is too *long*

`reasonSchema` (`packages/contracts/src/schemas.ts:667-671`) is
`.trim().min(1, messages.voidReasonRequired).max(200, messages.voidReasonRequired)` — one sentence,
*"Reason is required for void/unvoid actions."*, for both bounds. On top of that the client adds its own rule,
`MIN_REASON_LENGTH = 3` (`useAdminCorrections.ts:24`, applied at :114), and reports it with **the same borrowed
message**. Net effect on the day:

- two characters ("ok", "fine", "js" for "judge's call") → "Reason is required…", when a reason was supplied;
- a real explanation of 240 characters, typed because the audit log asks for detail → travels to the server,
  comes back with "Reason is required…", and the operator re-reads the field, sees text, and reasonably taps
  Confirm again;
- and `ReasonDialog`'s `<input>` has **no `maxLength`**, so nothing stops the 240-character case locally, while
  the one dialog that got it right (`ParticipantDetailPage.tsx:200`, `maxLength={200}`) caps it. Same app, two
  standards, one sentence for three different problems.

**Cheapest fix.** Three keys in the catalogue (`voidReasonMissing`, `voidReasonTooShort`, `voidReasonTooLong`),
`MIN_REASON_LENGTH`/200 moved into `contracts` next to `reasonSchema` so client and server cannot drift,
`maxLength={200}` plus a live count on the dialog's input, and the Confirm button disabled while
`reason.trim() === ''` (the label already says required; the button currently says otherwise — it disables only
on `isBusy`).

**Test:** existing dialog tests assert the message; add the 201-character case and the "ok" case and expect two
*different* sentences, neither of which is "required".

### F4 · The API says which field, and every form except two throws it away

`ApiError` carries `field` (`lib/api/client.ts:16-25`) because the API deliberately sends it
(`{error: {message, field}}`); `useAction` returns `errorField` (`useAction.ts:38-58`) with the comment
"one error slot" and nothing more. A whole-app grep for `errorField` finds **two** consumers:
`useAction.ts` itself and `useAuthForms.ts`. So on `ReasonDialog`, on the award-adjustment panel, on the
point-config and agenda forms, a field-scoped refusal is rendered as a sentence *below the whole form* and the
operator re-reads every box to work out which one it meant. `ReasonDialog` even shows
`props.error` in a bare `<p className="console-danger">` (:39) with no `aria-live`, so a screen reader is not
told at all.

**Cheapest fix.** One helper the dialogs already reach: on a field-carrying error, focus and mark that control
(`document.getElementById(field)`, `aria-invalid="true"`, scroll into view), and give the error `<p>`
`role="alert"` + `aria-describedby` wiring. This is 15 lines in `ReasonDialog` and a `data-field` convention
every other form can adopt later, one page at a time.

**Test:** drive `#reason-dialog__reason` with a server that answers `{message, field: 'reason'}` and assert the
input regains focus and `aria-invalid` is set.

### F5 · Two overlay systems, and a third layer between them

`ConfirmDialog` (station and hall surfaces) uses `psd-modal`, `z-index: 60`, with a `--danger` variant and a
`isBusy` prop. `ReasonDialog` (desk surfaces) uses `console-modal`, `z-index: 30`, no danger variant, its own
`isBusy` prop, its own layout. They share no code, no CSS, and no behaviour — which is why F1's fix has to be
made twice. And `.gb-update`, the ADR-182 stale-build banner, is `position: fixed` at `z-index: 40`
(`gameboy.css:2027-2032`): **above `console-modal`, below `psd-modal`**. On a staff station that is harmless
today (the reason dialog is a desk surface); the moment one appears on a stale station page, the banner paints
over its buttons — a latent bug kept alive only by which page renders which dialog.

**Cheapest fix.** Fold `ReasonDialog` into the `psd-modal` family (or extract a `<Modal>` both use) and put one
z-index scale in `tokens.css` with the banner explicitly below both. Small, and it deletes a class of bug.

### F6 · One confirm slot, and the newer request wins silently

`useConfirm` holds `request: ConfirmRequest | null` and `ask` is `setRequest(next)` — no queue, no guard on an
existing request (`useConfirm.ts:36-48`). Two `ask()` calls before either is answered and the first action's
title, body and `run` are gone: the operator answers the *second* question, and the first button press simply
vanishes. On a station with two people tapping (one on the round panel, one on the tier row), or a desk
clicking Void on row 4 and row 5 in the same second, this is reachable; the failure is invisible, which is what
makes it worth the fix.

**Cheapest fix.** Refuse the second `ask` while one is open (a no-op plus `console.warn`, or a small "one at a
time" shake), or queue with a visible count. Five lines. **Test:** `ask(a); ask(b); accept();` assert `a.run`
never fired.

### F7 · Finding the row is the job, and there is no search for it

N5's handoff — *"Too late to undo that one — a superadmin can still void it"* — sends the desk to `ScansPage`,
whose only filter is **activity** (`scans__activity-filter`, `ScansPage.tsx:23-37`): no participant, no round, no
time range, nothing in the URL. `MatchesPage` is the same shape with **status** alone
(`matches__status-filter`, `MatchesPage.tsx:30-42`). Both pages render every row of the day, so "find Priya's
tug-of-war scan at 13:10" is a scroll through the day, in a modal-capable browser tab, while someone waits.
Compare `ParticipantsPage`, which does have a search form (`participants__search-form`, :23-37) — so the house
pattern exists; it just did not reach the two pages where corrections actually happen.

Two smaller cuts from the same place: no filter is restorable or shareable (no query params anywhere on these
pages), so a reload during a live match resets the desk to "all matches"; and `useLocationMemory` proves the
app knows how to keep position.

**Cheapest fix.** A text box per list, filtering rows already loaded client-side (no API change), plus
`?status=&activity=&q=` on read and write. **Test:** type a nickname in ScansPage, assert the row is reachable
by `Enter` and that a reload keeps the filter.

### F8 · No table on this app can be scrolled sideways

`grep -rn "overflow-x|table-wrap"` across `apps/web/src` → **nothing**. `.console-table` is a plain table
(`console.css:170-191`) with `overflow-wrap: anywhere` inside cells (:481, :552) so long text will not blow the
layout out — but a seven-column table on a 360–430 px viewport either squeezes to unreadable or extends past
the viewport with nothing to drag it back. This is the shape of N4 (award from a phone in the marquee) and of
the desk on the one tablet that is free. It is also the kind of thing that stays invisible in a dev server at
1440 px, which is presumably why it survived: the app has a *print* stylesheet with its own test
(`styles/print.css.test.ts`) and a `useFitScale` that shrinks the badge "to one glance" (ADR-098) — the layout
craft is there, just not on the tables.

**Cheapest fix.** A `<Panel>` wrapper with `overflow-x: auto; overscroll-behavior-x: contain;` around
`.console-table`, or a `@media (max-width: 40rem)` card reflow for the two or three tables people actually read
on a phone (scans, matches, participants).

### F9 · A page built from three reads reports one failure, and hides it while loading

`firstError(candidates)` (`useAsyncData.ts:101-108`) is documented as "Hooks that own several requests report
one error to the component" — true, and it loses *which* one. `StateMessage` then renders on a strict priority
`isLoading → error → isEmpty` (`StateMessage.tsx:12-33`), so a page that is still loading its *first* list
cannot show an error from its second. `StaffHomePage` is the live case: three reads (courts, activities, swag —
`useStaffTools.ts:26-31`), one grid, one message line. If `fetchActivities` 500s, the marshal sees a shortened
grid and, at best, a sentence that does not name the activity list; if that read fails *while* courts are still
in flight, they see "Loading…" with no error at all and wait.

**Cheapest fix.** Let each read in a composite hook keep its own message (`firstError` becomes `namedErrors`),
and have `StateMessage` accept `partial: boolean` so a surface with some data shows the failure **beside** the
data rather than above the whole page. Also worth an explicit retry per list — `reload` exists per `useAsyncData`
but composite hooks expose only the page's.

### F10 · The console's schedule promise is made from a cache and never revised

The stories' N3, at front-end range. `court__schedule-note` (`CourtPage.tsx:148-155`) is computed from the
client's cached `pendingPairs` via `isPairScheduled` (`useCourtConsole.ts:87`, with the unordered comparison at
:312), while the claim itself is a DB read under `claimScope` (`schedule.ts:276`/`:329`). Between those two sits
every staleness window the app has (45–75 s poll for the schedule read, 5 s server cache under it). When they
disagree the console says *"On the schedule — this match settles a fixture"*, the POST returns 201 with a match
bound to nothing, and the note disappears — because it lives in the pre-start panel only. After the whistle
nothing on the console, the scoreboard (`MatchScoreboard.tsx` has no fixture notion) or `matchView`
(`views/tournament.ts:32-60`: `stage`, `isVoided`, `editReason`, no `fixtureId`) says which kind the match was.

**Cheapest fix.** `fixtureId` (or a boolean) on `MatchView` — the row already has it — one line in the live
header reusing the existing sentence, and the *stale* case handled honestly: if the POST returns a match whose
`fixtureId` is null when the note said "on the schedule", that is a `console-danger` line for one second, not a
silent downgrade. This is also the only finding here that changes what a **team** is told by a marshal, which is
why it outranks its size.

### F11 · The ★ is assigned, never remembered, and cannot be a swag counter

`StaffHomePage` renders `★` from `session.defaultStation` (`StaffHomePage.tsx:14-38`), fed by
`default_station_type` / `default_station_id` on `facilitator_accounts`, whose CHECK is
`IN ('court','fringe_activity','none')` (`schema.sql:44-46`). Two findings in one column:

1. nothing about the ★ follows use, so a marshal sent to Court 1 who is actually on the tug-of-war line re-picks
   from forty tiles every morning until a superadmin edits their account (`PATCH /api/admin/facilitators/:id`);
2. a swag counter **cannot** be a default station at all, even though the picker treats the three kinds as one
   grid (ADR-110) — so the counter staff, the people with the longest queue and the least training, are the only
   actors the app will not remember.

**Cheapest fix.** Add `swag_station` to the CHECK (the additive-DDL tail already carries similar widenings), and
offer — not force — "make this my station" on pick, a one-line PATCH. Keep it *opt-in*: silent focus-stealing
behaviour that writes to an account is exactly the kind of thing ADR-247's "made to say why" rule warns against.

### F12 · "Something went wrong."

`describeError` (`useAsyncData.ts:20-24`): an `ApiError`/`OfflineError` shows the catalogue's sentence, anything
else shows the literal `'Something went wrong.'`. Every other user-facing string in this app lives in
`packages/contracts/src/messages.ts` — including the deliberate non-sentences like "Invalid status transition."
which the stories already flagged. This is the one string with no key, no translation surface, no test, and no
status code in it: a JSON parse hiccup in a service-worker path and a thrown non-Error look identical and
unhelpful. **Fix:** one message key (`unexpectedError`, with the status appended when known) and a rule the
standards checker could even enforce — a bare string literal in JSX is already a smell this house recognises.

### F13 · The update banner offers one thing: reload

`.gb-update` is a full-width fixed bar at the **bottom** of the viewport (`gameboy.css:2027-2032`) containing
"A new version is ready." and a single Reload button; there is no dismiss, no "after this scan", and nothing in
the stylesheets pads the page when it appears (`grep -rn "gb-update" styles/` finds only its own block). It only
renders where a service worker holds a build back — a facilitator station in offline mode (ADR-182), i.e. the
screen with `Start match` / `Look up` / `Undo (7s)` as the last elements in flow. On a phone-height viewport, a
bar over the bottom strip is over the primary action. ADR-182's own framing is *"a deploy a day can survive"*,
and the copy is honest; the interaction is not.

**Fix.** Three small ones: `position: sticky` (or a bottom padding hook) so it never covers the last action
row; a "Not now" that hides it for the session (`sessionStorage`, the pattern `rememberedSuperadmin` already
uses); and copy that names the cost — reload *after* the current match/scan, not now.

---

## 3. What the hunt did not find, and why that is a result

No finding is recorded for: focus management on the scan box (handled, better than expected); double-submit
protection (uniform); error *presence* (every hook has one, and `role="alert"` is used); empty states (37 files
share `StateMessage`); IME and hardware-scanner interaction (thought through to `keyCode === 229`);
participant-side number formatting (`formatPoints` + the `--leading`/`aria-current` score strip); print output.
The app also has tests *about* interaction quality — `points-freshness.test.tsx`, `identity-cache.test.tsx`,
`useSubmitOnEnter.test.ts`, `useTypeAnywhere.test.tsx`, `UpdateBanner.test.tsx` — which is the reason §1 is
three times longer than a fair share of a friction report would be.

What is left, in one line: **the front end is careful with single taps and careless with the seams** — between
two dialogs and the page behind them, between two overlay systems, between three reads and one message line,
between a promise on one screen and its enforcement on another, and between the copy that exists and the copy
that is shown. Every finding above is a seam, not a missing feature. That is the shape of the next stage's
work, and it is good news: seams are cheap.

## 4. Suggested order of attack

1. **F1 + F5 + F6 together** — one dialog primitive for the whole app: focus trap, Escape, dismiss, focus
   return, one slot with a refusal, one z-index scale. It closes three findings and deletes a class.
2. **F3 + F4 + F12** — the message layer: three reason keys, `errorField` honoured everywhere, the stray
   literal moved into the catalogue. Mostly `contracts` + two components.
3. **F10** — the only finding that changes what a *participant* is told; needs one field on a view.
4. **F2** — decide whether the number fallback is offline-capable or the badge's sentence changes. Pick one.
5. **F7 + F8 + F9** — the desk's list pages: search, scroll, honest partial failure.
6. **F11, F13** — small kindnesses with real daily cost, both one-commit sized.

Deliberately **not** in this list: anything about the award batch (that is the missing *screen* from N4, already
recorded in Appendix A of the stories, and a bigger piece of work than a friction fix), the day's clock
(N5/A.4, an API decision), or `bracketLocked` itself (a rule the hunt agrees with).
