# Avatar studio: assessment of the two designs and a plan for the findings

Status: **plan and assessment only.** Nothing in the app has changed. No ADR is written (a plan records no decision). Not committed; the user has not asked for it.
Date: 2026-10-09. Branch `arena/1952d326-special-fiesta`, HEAD `04fcd32` (ADR-225, pushed).

Labels used throughout:
- **Observed**: seen in a run. Either this turn's API-level harness (§2) or the Turn 3 browser walkthrough (its logs were lost in a sandbox reset, so it cannot be re-checked here).
- **Code**: read from source, not run.
- **Hypothesis**: not tested.

---

## 0. Session notes

- The local branch had been reset to `4c5a3bd` (the base of `main`). It was restored by fetch and fast-forward to `origin/arena/1952d326-special-fiesta` at `04fcd32`. The remote was never affected.
- The Turn 3 journeys document (`docs/design/avatar-studio-journeys.md`) was untracked and is no longer in the workspace. Its findings survive as the register in §6 (F1–F17). Its journey-by-journey narrative does not survive here.
- Chromium (`/tmp/chromium`) and `node_modules` were missing after the reset. `npm ci` was run. No browser was started this turn.

## 1. Answers in brief

1. **Overlay dialog for take, upload, framing and background removal:** a good fit for the layout findings (F6, F7, F9, F12, F16). It needs three things the app does not have yet: a focus-managed modal, Escape handling, and a new ADR, because it supersedes parts of ADR-056 and ADR-073. It does **not** fix F10 (re-framing a saved photo), because the original image is never kept.
2. **"Remove my photo" without a character gate:** feasible and consistent with ADR-059's purpose ("an avatar is never nothing"), since the next character always exists. It supersedes ADR-059's gate. The requirement that the photo stays available until save needs a pending state. Today the photo is dropped from the draft at once (N4).
3. **"Genuinely removed" is not true today.** Observed at API level: saving the removal clears the database row, but the server still serves the removed picture from its in-process cache (N1), and a save that carries a photo and fails with an unhandled error prints the whole picture into the error log (N2; observed for the pattern-look constraint failure). Code: each phone keeps up to 400 pictures in localStorage (N3), and the server cannot reach copies already on other phones. N1 and N2 are small server-side fixes. N3 is client-side. Other phones are a stated limit.

---

## 2. What was run this turn

| Layer | What | Result |
|---|---|---|
| Code reading | Photo path from schema to UI; ADR-027, 035, 038, 054–060, 073, 173, 202–209 | Sections 3–6 |
| API harness (vitest, in-process app, real schema) | Temporary test `apps/api/src/tests/zz-removal-probe.test.ts`, **deleted after the run**. Report copied to `/tmp/removal-probe-kept.json` (outside the repo) | Table below |
| Browser | Not run (no Chromium in this sandbox after the reset) | Device and dialog behaviour are **not observed** |
| Models | Not exercised. Face and matte models cannot load here (huggingface.co, cdn.jsdelivr.net unreachable) | Cut-out and framing quality **not judged** |

API harness results (**observed**; the probe's step 4 was dropped because the `/api/me` view does not carry the field it looked for):

| Step | Action | Result |
|---|---|---|
| 1 | Save with a 64×64 photo sprite | 200 |
| 2 | `GET /api/avatars?ids=<id>` while worn | 1 picture served |
| 3 | Save with `avatarPhoto: null` (removal) | 200 |
| 5 | Same `GET`, cache still warm | **1 picture still served** |
| 6 | Same `GET`, after clearing the server sprite cache | 0 pictures (the database row is gone) |
| 7 | Re-save the photo | 200 |
| 8 | Save with the photo and a pattern look (the F1 trigger) | 500; `console.error` called once; **the full sprite string appears in the logged arguments** |

Step 6 is what shows the database row was cleared: with the cache cold, nothing is served.

---

## 3. The removal path as built today

| Step | What happens now | Label and source |
|---|---|---|
| Photo worn; character not yet picked | "Remove my photo" disabled; the reason appears only in `WORN_HINT` ("Pick a character below…") | Observed (S-C, S-D, R-8). Code: `disabled={props.canRemove !== true}` (AvatarStudio 433), `canRemove={pickedCharacter}` (621), `WORN_HINT` (551) |
| Press Remove | `onPhoto(null)`: the photo leaves the draft at once; the "My photo" box disappears | Observed (R-8). Code: AvatarStudio 432–437, wiring 624–627 |
| Want the photo back before saving | Only by taking or uploading it again | Code |
| Save (profile) | `PUT /api/me/avatar` with `avatarPhoto: null`; server writes `avatar_photo = NULL` | Observed (step 6). Code: ProfilePage 26–27 (`withWornPhoto`), routes-participants 226, participants.ts 151 |
| After the save | The server's sprite cache still holds the body; phones keep it in localStorage | Observed (step 5, server). Code: cache.ts 200–208; `spriteCache.ts`; ADR-035 (phone) |
| A failed save that carries a photo | Generic 500 to the user; full sprite printed to the server log | Observed (step 8). Code: app.ts 218 (`console.error('[api] unhandled error', error)`) |

Working assumptions from the request, now tested:
- **"Only the sprite is saved."** Confirmed. The schema stores `avatar_photo` as a 64 or 128 px text sprite (schema.sql 89–91). The API's only photo field is `avatarPhoto`. The only upload route my search found is the gallery (`routes-gallery/upload.ts`). The original image lives in component state while the studio is open (`chosen`, AvatarStudio 379) and is never sent.
- **"Next character, wrapping within the gender."** Partly confirmed. There are five characters (`AVATAR_VARIANT_COUNT = 5`, schema.sql 1..5), indexed the same way for both genders. "Next" is `current % 5 + 1`, so 5 wraps to 1, and the gender does not change. `current` is `avatarVariant`, which `setPersona` updates even while a photo is worn (AvatarStudio 602–607).

---

## 4. Assessment A: the overlay dialog

### 4.1 Verdict

Good fit for the studio's layout problems, with three conditions:
1. A focus-managed modal. Nothing in the app traps focus or handles Escape today (Code: no Escape handler and no focus trap anywhere in `apps/web/src`).
2. The commit point stays where it is now: "Use this square" (AvatarStudio 391). Cancel and Escape discard the conversion. A backdrop click must not discard silently.
3. A new ADR that supersedes the parts of ADR-056 (inline confirm of the square) and ADR-073 (controls beneath the square) that the dialog moves.

### 4.2 What it addresses (findings in §6)

- **F7** (six cut-out groups and 36 controls shown together) and **F16** (1,413 px tall on a phone): the framing and cut-out controls move into the dialog, which exists only while the participant is working on the photo.
- **F9** (contradictory hints): one state per screen, one hint per state.
- **F6** ("Keep what you had" leaves the square open): Cancel closes the dialog.
- **F12** (small targets): more room on phones, but the sizes still need fixing.

### 4.3 What it does not address

- **F10** (no re-framing a saved photo): the original is not kept, so no dialog can re-frame a saved sprite. See §5.3 for "Replace my photo".
- **F1, F2, F3** (patterns, sign-up defaults), **F8, F13, F14, F15** (wording), **F11** (focus styling, which is a separate CSS fix).

### 4.4 Risks and what the build needs

1. **Focus and keyboard.** The only dialog precedent, `ConfirmDialog` (`apps/web/src/components/shared/ConfirmDialog.tsx`), is a styled `div` with `aria-modal` and `autoFocus` on Cancel. It has no focus trap and no Escape handling (Code). The `.psd-modal` styles it uses (`base.css` 69) are reusable. A native `<dialog>` with `showModal()` would supply the trap, Escape and the inert background, but it would be a new pattern for this codebase. ADR-041 says Safari is first-class, so the native choice must be checked in Safari (Hypothesis: not yet checked).
2. **Form nesting.** The studio sits inside the sign-up `<form>` (SignUpPage 47). Render the dialog through a portal or at the page root. Every button in the five photo and studio components already has an explicit `type` (Code: scan of AvatarStudio, PhotoCropper, CutOutControls, SelfieCapture, BackdropStyleRow), so a stray submit is not a current risk. Keep it that way.
3. **Return focus.** The file input is visually hidden (`.gb-file`, gameboy.css 1109). Return focus to the visible "Use a photo" or "Take a selfie" trigger.
4. **Camera inside a modal.** The permission prompt will appear over the dialog. Test on a phone (Hypothesis: not tested).
5. **Mobile layout.** Full-screen on phones; the square and the primary button visible without scrolling; targets at least 44 px, which is the repo's own reference (`docs/design/agenda-tab-plan.md` 32, citing WCAG 2.5.5).
6. **Test churn.** Six e2e specs and one helper, plus four unit or acceptance files, reference the photo controls (`e2e/participant/cut-out-tuning.spec.ts`, `photo-backdrop-preview.spec.ts`, `photo-sprites.spec.ts`, `selfie.spec.ts`, `model-available.spec.ts`, `e2e/acceptance/demo-onboarding.spec.ts`, `e2e/support/photo-stubs.ts`; `PhotoCropper.test.tsx`, `useAuthForms.test.ts`, `participant-pages.test.tsx`, `acceptance/signup.test.tsx`).
7. **Frontend rules.** "Is a modal open" is view-only state, and DOM-only effects such as focus belong outside the fetch and state layer. Inline handlers are wiring only (AGENTS-frontend.md 10–12, 37).

### 4.5 Alternatives

- **B. Full-page photo step (a route).** More room on phones and no focus trap to build. But it needs draft persistence across navigation and a way back. More change.
- **C. Keep inline; collapse the cut-out groups behind one "Fine tune" disclosure; fix F6 and F9.** The smallest change. It leaves the studio tall (F16).

**Recommendation:** A, using a native `<dialog>` if the Safari and Chromium checks pass. If they do not, A with a plain `div` and explicit focus handling. Use C's disclosure inside the dialog for the fine controls.

---

## 5. Assessment B: "Remove my photo" without a character gate

### 5.1 The rule, as I read the request

- "Remove my photo" is always enabled while a photo is worn.
- Pressing it moves the selection to the next character: `current % 5 + 1` (five characters, 5 wraps to 1). `current` is the character underneath.
- "My photo" stays on the row until Save, pressed or not. Pressing "My photo" cancels the pending removal.
- Save sends `avatarPhoto: null`. From then on the removal is final.
- **What stays available is the saved picture (the sprite), not the original image.** The original is not kept. Say so in the copy and in the decision.

States:

| State | Row | Preview | Save sends |
|---|---|---|---|
| Worn | "My photo" pressed | the photo | the photo |
| Pending removal | "My photo" not pressed, with "Removed when you save" | the next character | `avatarPhoto: null` |
| Restored | "My photo" pressed again | the photo | the photo |
| Saved as removed | no photo option | a character | nothing (no photo) |

Sign-up: "save" means submit. A pending removal simply means the photo is not sent.

### 5.2 Consistency with accepted decisions

- **ADR-059's gate** exists so that "an avatar is never nothing". The new rule keeps that invariant. What it drops is the gate itself, so the decision must be superseded by a new ADR (accepted ADRs are not edited).
- **ADR-059 also says** choosing a character keeps the photo on. The new rule keeps that: choosing a character never removes the photo, only Remove does.
- **ADR-060** ("mark what is actually worn"): the pending state must show the photo as pending, not as worn. This needs copy.
- **F4** must be fixed first. Otherwise a restored "My photo" can come back in the old backdrop colour (§6, F4).

### 5.3 Irreversibility and re-framing (F10)

- Irreversibility already follows from the architecture: no original is kept. Once the sprite is gone, only a new photo can bring a picture back.
- The same fact means a saved photo cannot be re-framed. The only way to change the framing without keeping the original is "Replace my photo", which opens the dialog with a new capture or upload.
- Keeping the original server-side would make "genuinely removed" false in practice. It is a privacy and retention decision for the owner, and I do not recommend it.

### 5.4 What "genuinely removed" needs

| # | Layer | Today | Fix |
|---|---|---|---|
| a | Database row | Cleared on save. **Observed** (step 6) | None |
| b | Server sprite cache (`spriteBodies`, LRU of 4,000, cache.ts 208) | Serves the removed picture while warm. **Observed** (step 5). `updateParticipantAvatar` purges only the scoreboard tag (participants.ts 137–156) | Purge the old id on save. `/api/avatars` should answer only for ids a row still holds. Purging is enough while the deployment is one container (ADR-043) |
| c | Error log | Full sprite printed for any failed save that carries a photo. **Observed** (step 8) | Redact the photo from logged errors. Return 422 for looks the database rejects (F1a), so the common failure never reaches the log. Audit the other log sinks (not checked) |
| d | Removing phone (`psd.sprites.v1`, up to 400 faces) | Keeps the picture. **Code** (`spriteCache.ts`; ADR-035) | Forget the id on save. Drop cached ids no loaded data refers to |
| e | Other phones | Keep faces they already fetched. **Code**. The server cannot reach them | State as a limit. Pruning on their next load and LRU eviction reduce it |
| f | Original image in memory | Its object URL is never revoked (AvatarStudio 379). **Code** | Revoke on replace, cancel and unmount |
| g | Backups | Not inspected | Owner's retention decision |
| h | Screenshots and copies | Not controllable | State as a limit |

Two more code-level points:
- **The server treats an omitted `avatarPhoto` as removal** (`input.avatarPhoto ?? null`, participants.ts 151). Today the client always sends the field (ProfilePage 26–27), so nothing is lost. The new pending state must send an explicit value and must not rely on omission.
- **Live reads elsewhere.** The leaderboard, teams, admin and identity reads take the column live (Code), so removal reaches them on the next read. Chat and gallery rows hold no avatar column (schema), so they keep no copy.

### 5.5 Data protection

A 64 or 128 px sprite of a face is personal data, and people who know the participant may recognise it (Hypothesis; not tested). Confirm the retention position, including backups, with the data-protection owner. This is not legal advice.

---

## 6. Findings F1–F17 and new findings N1–N6

Each row: label and evidence, proposed fix, phase, provisional ADR, and whether the user must decide. Provisional ADR numbers are described in §7.

| ID | Finding | Label and evidence | Proposed fix | Phase / ADR / decision |
|---|---|---|---|---|
| F1 | Pattern looks (spiral, rings, waves, swirls) cannot be saved; the save returns 500 | **Observed**: spiral sign-up (R-4, R-5, R-10); rings on profile save, desktop and phone (R-2). **Code**: `avatarLookSchema` accepts the tags (schemas.ts ~649). The database check (schema.sql ~788, ADR-173) allows only the untagged look and the sunburst group. The tagged format came with ADR-205, and patterns followed in ADR-207 to ADR-209. I searched the register for `avatar_look_check` and "look check" and found no later change to the check | (a) Return 422 with a message for looks the database rejects. (b) Widen `participant_avatar_look_check` to the tagged format, using the idempotent drop-and-add pattern of ADR-173, and test against an older database | (a) Phase 1. (b) Phase 4, ADR-230. **Decision needed** for (b) |
| F2 | Skipper looks chosen, yet "Please select an avatar." appears | **Observed** (R-6, desktop). **Code**: `avatarVariant: null` (useAuthForms 35); the studio shows `?? 1` (SignUpPage 132) | Either make Skipper the real default, or show no selection until a tap. Pick one | Phase 3, ADR-231. **Decision needed** |
| F3 | Male figure drawn before a gender is chosen | **Observed** (G-1). **Code**: `gender === '' ? 'male'` (SignUpPage 17) | Prompt or neutral placeholder until a gender is chosen | Phase 3, ADR-231 |
| F4 | Choosing a character changes the backdrop row but not the photo | **Observed** (S-D, R-9). **Code**: `setBackdrop` recolours the photo (AvatarStudio 586–593); `setPersona` does not (602–607) | Recolour in `setPersona` when `personaLook` changes the backdrop, in the same single `onChange`. Needed before "My photo" can be restored correctly | Phase 1, ADR-232 |
| F5 | "Remove my photo" disabled with no reason | **Observed** (S-C, S-D, R-8, R-3b). **Code**: 433; reason only in `WORN_HINT` (551) | Resolved by §5 (no gate). If the gate stays, put the reason on the control | Phase 2, ADR-227 |
| F6 | "Keep what you had" leaves the square open | **Observed** (S-C). **Code**: `onCancel` sets `refined` or `plain` (470), and both are in `ADJUSTABLE` | Cancel closes the square and returns to the saved-photo state. In the dialog, Cancel closes it | Phase 1 (small), ADR-232; folded into ADR-229 |
| F7 | Six cut-out groups and 36 controls shown together | **Observed** (S-C). **Code**: controls rendered beneath the square (PhotoRow; ADR-073) | Move into the dialog; "Fine tune" closed by default | Phase 3, ADR-229 |
| F8 | Pattern jargon and raw hex in visible text | **Observed**: "First colour: #1D5B8C — set by the Backdrop palette above" (R-2); Rays, Twist (R-4); Ring width, Petal depth (R-2). **Code**: BackdropStyleRow 168, 233, 242, 282, 300 | Plain labels; show the colour's name, not its hex. Wording needs sign-off | Phase 3, ADR-232. **Decision on wording** |
| F9 | Contradictory hints after "Choose the square myself" | **Observed** (R-8): "We could not find your face…" beside "This is the face we found…". **Code**: the manual button calls `setState('cropping')` (498), which uses the `cropping` hint (PHOTO_HINT 530) | Give manual framing its own state and hint. In the dialog, one state per screen | Phase 1 (small), ADR-232; residual in ADR-229 |
| F10 | A saved photo cannot be re-framed from the profile | **Observed** (R-3b, desktop and phone: no "Choose the square myself", no square). **Code**: the original is not kept (§5.3) | "Replace my photo" opens the dialog with a new capture or upload. Keeping the original is not recommended | Phase 3, ADR-229. **Decision needed** |
| F11 | "Use a photo" has no visible focus | **Observed** (F-1: focused and unfocused captures are byte-identical; X-B). **Code**: the input is visually hidden (`.gb-file`, 1109), and the focus rule (`.gb-button:focus-visible`, 499–503) matches the label, which never takes focus | Style the label when its input has focus (`label:has(input:focus-visible)`), or make the label the focus target | Phase 1, ADR-232 |
| F12 | 13 visible controls 40 px tall on a phone; the corner handle is 24 px | **Observed** (M-1). The repo's own plan cites 44 px (agenda-tab-plan 32) | Minimum 44 px for studio controls; a larger hit area for the corner handle | Phase 1 (CSS) and Phase 3, ADR-232 |
| F13 | Toggle "Customise hair, skin and colours" does not name Build or Beard | **Observed** (Turn 3 copy check) | Rename the toggle to list what is behind it | Phase 1 (copy), ADR-232 |
| F14 | "That photo could not be read. Try another one." | **Observed** (S-G) | Say what went wrong: no face found, too dark or small, unreadable file. **Hypothesis**: the pipeline knows the reason; not checked | Phase 3, ADR-232. **Decision on wording** |
| F15 | "Background removed as best we could…" does not name the failed step; `avatars.md` 168 says it does | **Observed** (S-F). **Code**: doc claim | Name the step, or correct the doc. **Hypothesis**: the pipeline knows which step fell back; not checked | Phase 3, ADR-232 or docs |
| F16 | Expanded studio 1,413 px tall on a phone | **Observed** (M-1) | The dialog takes the framing controls off the page. Re-measure the default state afterwards | Phase 3, ADR-229 |
| F17 | Docs stale: `avatars.md` §7 (210–214); `fds.md` 119–121, 604, 825, 890. `fds.md` 121 says `avatar_variant` is immutable, yet the profile save writes it | **Code** (checked against the code, not the running app) | Correct the docs to match the code (no decision). Decide the spec's position on redraw: ADR-021 lets the participant choose | Phase 1 (docs). **Decision on `avatar_variant`** |
| N1 | Removed picture still served from the server cache | **Observed** (API steps 5–6). **Code**: cache.ts 208; the ADR-038 comment accepts it ("the only cost… a picture the phone was about to ask for anyway") | Purge on save; answer `/api/avatars` only for held ids. Keep a test (promote probe steps 5–6) | Phase 1, ADR-228 |
| N2 | A failed save with a photo prints the whole sprite to the log | **Observed** (API step 8). **Code**: app.ts 218 | Redact the photo from logged errors; 422 for invalid looks (F1a); audit other log sinks | Phase 1, ADR-228 |
| N3 | Phones keep removed faces (localStorage, up to 400) | **Code** (`spriteCache.ts`; ADR-035). Not run in a browser | Forget the id on save; prune ids no loaded data refers to. State the limit for other phones | Phase 2, ADR-228. **Decision on pruning** |
| N4 | Removal is immediate in the draft; no way back before save | **Observed** (R-8). **Code**: AvatarStudio 432–437, wiring 624–627 | Pending-removal state (§5.1) | Phase 2, ADR-227 |
| N5 | An omitted `avatarPhoto` is treated as removal | **Code**: participants.ts 151. Not exploited today (client always sends the field) | Test it; the new flow sends an explicit value; keep the three-valued draft | Phase 2, ADR-228 |
| N6 | The original image's object URL is never revoked | **Code**: AvatarStudio 379; no `revokeObjectURL` for `chosen` | Revoke on replace, cancel and unmount | Phase 1 |

---

## 7. Provisional ADRs (not written)

ADR-226 is reserved for the real-model rebuild, so new decisions start at ADR-227. Numbers are provisional and fixed only when each ADR is written, appended in order. Accepted ADRs are not edited.

| Provisional | Title | Supersedes | Findings |
|---|---|---|---|
| ADR-227 | Removing a photo: no character gate; the removal is pending until save; the next character is selected | ADR-059 (the gate only; the "never nothing" invariant and "choosing keeps the photo" stand) | F5, N4 |
| ADR-228 | A removed photo leaves the server and the phone at save | ADR-035 (keep-on-device, for removed photos); the ADR-038 cache comment (a removed face may still be served) | N1, N2, N3, N5 |
| ADR-229 | Photo capture and framing in an overlay dialog; Done commits, Cancel discards | Parts of ADR-056 (inline confirm) and ADR-073 (controls beneath the square) | F7, F9, F10, F16 |
| ADR-230 | Pattern looks are saved, or refused with 422 | ADR-173's untagged-only check (only if (b) is chosen) | F1 |
| ADR-231 | Sign-up default character, and the figure before a gender is chosen | None | F2, F3 |
| ADR-232 | Studio corrections: backdrop follows the character; focus; targets; labels; cancel and manual framing states | None | F4, F6, F8, F9, F11, F12, F13, F14, F15 |

---

## 8. Sequence

- **Phase 1: no decision needed** (waits for your go-ahead to start): N1 (purge), N2 (redaction), F1a (422), F4, F6, F9, F11, F12 (CSS), F13, N6, F17 (docs).
- **Phase 2: after your decision on §5** (the removal rule): N4, F5, N3, N5.
- **Phase 3: after your decision on the dialog**: F7, F16, F10 (Replace), F14, F15, F8, F2, F3.
- **Phase 4: after your decision on patterns**: F1b (database widening, with a migration test on an older database).

## 9. Verification per phase

- **Unit (vitest, web):** F4 (recolour on `setPersona`), F6 and F9 (state and hint), N4 (pending state), N3 (`forget` and prune in `spriteCache`), N6.
- **API harness (vitest, in-process app, real schema):** N1 (probe steps 5–6 as a permanent test), N2 (the logged error must not contain the sprite), F1a (422 with a message), N5 (explicit contract), F1b (a database created at the old check, migrated).
- **E2e (Playwright; needs a Chromium rebuild, not available now):** the dialog (focus trap, Escape, return focus, phone size), the pending removal, restore and save, F11 focus style, F12 target sizes.
- **Manual, phones:** the dialog and the camera on iOS Safari and Android Chrome. Not available here.
- **Before any push:** `npm run verify`, log to a file and read it.
- **Caveat for any walkthrough result:** the stand-in face finder and ellipse matte make cut-out and framing results non-representative. Say so in every result.

## 10. Not covered and limits

- Cut-out and framing quality: not judged (models unreachable here).
- Browser behaviour of the dialog, localStorage pruning and focus return: not run.
- Other log sinks, backups and other phones: not checked, or out of reach.
- The Turn 3 journeys narrative: lost in the reset (§0). Its findings are in §6.
- The crop overlay's centring: unchanged; the decision is still open.

## 11. Decisions needed

1. **Dialog placement:** sign-up and profile (recommended), or one of them only.
2. **Re-framing a saved photo (F10):** "Replace my photo" only (recommended), keep the original server-side (a privacy and retention decision), or no re-framing.
3. **Wrap-around:** at the last character (5), does Remove go to 1 (recommended), or stay on 5?
4. **Sign-up default (F2):** Skipper is the real default with no error (recommended), or nobody is pre-selected and a tap is required.
5. **Patterns (F1b):** widen the database check to accept the pattern looks (schema change, ADR-230), or refuse them with 422 for now.
6. **Phone pruning (N3)** and the retention position for backups: owner's call.
7. **F17:** the spec's position on `avatar_variant` redraw.

### Recorded answers (2026-10-09)

| Question | Answer | Consequence for the plan |
|---|---|---|
| 1. Dialog placement | Sign-up and profile | ADR-229 applies to both. The sign-up dialog must be portalled out of the `<form>` (§4.4) |
| 2. Re-framing a saved photo (F10) | Replace only | "Replace my photo" opens the dialog with a new capture or upload. No original is kept. Removal stays irreversible |
| 3. Patterns (F1) | Widen the database check | Phase 4 is approved in principle. It needs a migration, an idempotent drop-and-add in `schema.sql` (ADR-173 pattern), a new ADR (ADR-230), and tests against an older database. It is still a go-ahead item |
| 4. Sign-up default (F2) | Skipper is the real default | No validation error for an untouched studio. Pre-selection is made real in state, not only in display (ADR-231) |
| Backdrop picker (asked in Turn 5, `ask_user`) | Studio only (`in_studio`) | The colour and the pattern are picked in the studio while the square is closed. The dialog has no backdrop picker. A new one shows on the worn photo after Use this square (F4). ADR-234 supersedes in part ADR-224 and ADR-225 |

Still open, and not assumed:
- **Wrap-around at character 5** (§5.1): the plan assumes Remove goes to 1. Not confirmed.
- **Pending removal copy and the "My photo" restore label** (§5.1, ADR-227): not confirmed.
- **Retention:** backups, the pruning policy for phones (N3), and the data-protection position: owner's call.
- **Wording:** F8 (pattern labels), F14 and F15 (failure messages).
- **F17:** the spec's position on `avatar_variant` redraw.
- **Go-ahead:** no implementation has started. Phase 1 needs an explicit go-ahead.
