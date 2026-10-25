# ADDENDUM-030 — Avatar Studio gets its shots: pixels read back, not just compared

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-029 §4 (the one deliberately deferred item), ADDENDUM-028 (the browser and the gate it unblocked), ADDENDUM-018 and ADDENDUM-019 (what the studio actually produces), CLAUDE.md §2, §3.
**Status:** Implemented. Four assertions on the studio's own canvas pixels and two screenshots; the cut-out screenshot is recorded only where the models are reachable, and skips with a reason where they are not.

## 1. The gap this closes

ADDENDUM-029 §4 named exactly one thing left open on purpose:

> Still open, deliberately: Playwright shots of `features/avatar-studio`'s cut-out and gilding output. That is new test surface rather than a swap, it needs sample photographs as fixtures, and it is not a port question. It belongs in its own addendum.

This is that addendum. The fixture question answers itself: the studio already ships `WEI_LING` as `assets/wei-ling.jpg`, imported rather than fetched, so the sample artwork is part of the bundle and needs no network, no `testInfo.attach`, and no binary committed for the test's sake.

## 2. The decision: read the canvas, don't only photograph it

The premiere's likeness gate has to compare whole-page screenshots because the scene is WebGL and there is nothing else to compare. The studio is different. Its preview is a 512×512 `<canvas>` painted by CPU with `putImageData`, so the test can call `getImageData` and assert on the actual output rather than on a picture of the output. `e2e/avatar.spec.ts` does that: `digest(page)` returns width, height, opaque-pixel count, gold-pixel count, distinct 15-bit colours and an FNV-1a hash over every channel; `settled(page)` polls until two consecutive digests agree.

Two consequences are worth writing down:

- **The assertions hold on any machine.** "Casting the subject in gold makes a larger share of the frame read as gold" is true in Chrome 156 on a developer's laptop as well as in Chrome 153 on SwiftShader here. Only the two screenshots are browser-build-specific.
- **Settling has to be explicit.** Gilding 262,144 pixels in JavaScript takes seconds on this box, and a fixed sleep samples a half-painted canvas. Measured: the first paint after the crop is confirmed settles in **17.5 s**; later edits settle in **0.5–3 s**. `settled` budgets 90 s, because the first one is the slow one.

One trap the first run exposed: a settled digest taken immediately after a click is *still stable* — it is the previous frame, which has not been replaced yet. So the control test uses `redrawn(page, before)`: wait for the hash to leave its previous value, then wait for stability. Without that, "finish has no effect" passes.

## 3. What is covered

`e2e/avatar.spec.ts`, `test.use({ reducedMotion: 'reduce' })` so the preview is pinned to the still frame — the same pixels the PNG writes, never a lottery between sheen frames. Both model hosts (`cdn.jsdelivr.net`, `storage.googleapis.com`) are aborted in the offline block.

| Test | Assertion |
|---|---|
| gilds the bundled sample and says so when the background cannot be lifted | Opens the studio, loads `Wei_Ling`, crops, composes. Canvas is 512×512; more than half the square is opaque; more than 20% of that reads as gold; the state line says the background could not be removed. Then the **whole flow runs again in a second page load and the hash must be identical** — the CPU pipeline is deterministic, and that is now enforced. |
| the finish and frame controls redraw the preview, and switching back restores it | `GILD SUBJECT` changes the hash and raises the gold share from 0.43 to 0.99 of opaque pixels; `NATURAL COLOUR` restores the original hash exactly. `PLAQUE` fills the square (262,144 opaque pixels against 205,076 for the medallion). |
| downloads the gilded still as a named PNG | The download event fires, the file is `wei-ling-gilded-avatar.png`, and it has a path. |
| the gilded still | `toHaveScreenshot('avatar-gilded-still.png')` — the visual record of the medallion over the full photo, with the honest "background could not be removed" line in shot. |
| lifts the background off the bundled sample (online) | Waits for the segmentation model; **skips with a stated reason** if the matte never arrives, otherwise asserts a real matte leaves under 60% of the square opaque and records `avatar-cut-out.png`. |

Numbers from the run, for whoever reads a failure next:

```
natural   { width: 512, opaque: 205076, gold:  87479, distinct: 4096, hash: "ae4ef72"  }
gild subj { width: 512, opaque: 205076, gold: 203800, distinct:  254, hash: "45c7a65"  }
plaque    { width: 512, opaque: 262144, gold: 257796, distinct:  128, hash: "ef0e482a" }
```

`distinct` caps at 4,096 by design — the point is a stable cheap number, not an exact colour count.

## 4. Deviations, and the one thing still unmeasured

- **The cut-out shot has never been taken here.** This sandbox cannot reach the model hosts, so `lifts the background off the bundled sample` reports `1 skipped` every run. The spec is written so that it will record and compare on a machine that can reach them. Until then ADDENDUM-018 §7's cut-out claims rest on the unit tests over `usePhotoSession` and the compositor, not on a picture. This is stated rather than papered over: a skip is not a pass.
- **No `test.step` chatter and no retries.** The suite is serial by construction (`--workers=1`), the studio is one screen, and a retry on a 90-second settle would only hide a real regression.
- **The crop is part of the flow, not a bypass.** With the face model unreachable the studio lands on the cropper holding the whole photo ("We could not find a face. Place the square over it."), and `ADJUST FRAMING` stays disabled until the crop is confirmed. The helper handles both worlds: dismiss the cropper if it appears, otherwise wait for the pipeline message. That is also why the first control assertion is `toBeEnabled()` — it is the studio telling the test that the photo has reached the pipeline.
- **Baselines are still the user's to record**, for the same reason as ADDENDUM-028 §6: `avatar-gilded-still.png` was written on Chrome 153 with a locally built NSS. On a normal machine, `npx playwright install chromium && npm run e2e:update` records both shots in one pass — and the cut-out one only records where the models are reachable.

## 5. Rebuilding `dist/` found a bundle that depended on what was on disk

Addendum and code must land in the same commit (CLAUDE.md §10), so `dist/` was rebuilt before committing. With no source change it came out at **1,744.26 kB**, not the 1,734.47 kB recorded in ADDENDUM-028 §6. Chasing that 10 kB found a build defect rather than a stale artefact.

Tailwind 4's automatic source detection scans the project root for class names, skipping only what `.gitignore` names. Several of this repo's directories are neither source nor ignored, and each one was feeding the stylesheet:

| What is in scanning scope | Bundle | CSS |
|---|---|---|
| everything as it stands (`tmp/special-fiesta`, 32 MB, restored by `f082639`) | 1,744.26 kB | 88,518 chars, 634 class tokens |
| `tmp/` moved aside for the build | 1,734.55 kB | — |
| `tmp/` and `reference/` excluded | 1,731.64 kB | — |
| also `dist/` excluded | 1,707.24 kB | 51,799 chars, 315 tokens |
| also `docs/` and `e2e/` excluded (final) | **1,706.78 kB** | **51,341 chars, 311 tokens** |

The `dist/` row is the interesting one. `dist/index.html` inlines the stylesheet, so the previous bundle's own class names were being harvested into the next bundle: the shipped CSS carried utility classes nothing asks for, and grew a little with every build. Two consecutive builds were not byte-identical (`3b273efb…`, then `fef9dac0…`) precisely because the second read the first. `docs/` did the same thing more quietly — every addendum that quotes a class name, like ADDENDUM-023's `z-35`, nudged the bundle.

Five lines in `src/index.css` end it, with the reason written where the next reader will find it:

```css
@source not "../tmp";
@source not "../reference";
@source not "../dist";
@source not "../docs";
@source not "../e2e";
```

Afterwards the stylesheet depends on `src/` and `index.html` alone, and that is checked rather than asserted: a build with `@import "tailwindcss" source(none)` plus `@source "../src"; @source "../index.html";` produces **a byte-identical 1,706.78 kB bundle** (`9287651b…`), and two consecutive normal builds are byte-identical too.

### 5.1 Nothing the application needs was pruned

319 class tokens left the stylesheet. Two checks say none of them was missed:

- **Set containment.** The src-only build's 311 tokens are a subset of the filtered build's earlier 315, with an empty difference in the direction that matters (`src-only − filtered = ∅`). A class the app uses cannot be missing from the shipped CSS, because a build that reads only the app has no more classes than the shipped one.
- **The pictures.** `avatar-gilded-still.png` was recorded *before* the pruning and still matches *after* it — the run was repeated against the final bundle (`2 passed (1.8m)`, the download test and the shot). Since the studio overlay is the densest stretch of styling in the app, a missing utility would have shown up there.

The corrected growth figure for the R3F port is therefore **+115.7 kB gzip** against the 446.49 kB pre-port bundle, not the +120 kB ADDENDUM-028 §6 reported — that number included reference-tree, documentation and self-referential CSS.

## 6. Validation

Executed in this sandbox, Chrome 153.0.8010.0, WebGL2 via ANGLE/SwiftShader, `--workers=1`:

```
npx playwright test e2e/avatar.spec.ts --project=desktop-chromium --workers=1
  1 skipped
  4 passed (3.8m)
```

The skip is the online cut-out block, as designed. The shot was reviewed by eye: medallion, gold cast, `GILD SUBJECT` shown selected, and the plain-words state line visible — `e2e/avatar.spec.ts-snapshots/avatar-gilded-still-desktop-chromium-linux.png`. `npx playwright test --list` reports **50 tests across 3 files** (flows 8, likeness 12, avatar 5, each on desktop and Pixel 7). Elsewhere: `npx tsc --noEmit` clean, `npm test` **1,200 tests in 157 files, 100% on statements (6,127), branches (2,175), functions (1,426) and lines (5,426)**, `npm run build` clean at 1,706.78 kB / 562.23 kB gzip.

One thing that did *not* happen, and should be said plainly: the twelve likeness shots cannot be replayed in this sandbox, because their baselines are deliberately not committed — they belong to whichever browser build records them (ADDENDUM-028 §6). A plain run therefore fails all twelve with "A snapshot doesn't exist …, writing actual" and writes twelve sandbox PNGs. Those were deleted rather than committed, and the argument that the CSS pruning is visually inert rests on the checks in §5.1 instead. On a machine with the Playwright Chromium, one `npm run e2e:update` records likeness and avatar in the same pass.

With this, ADDENDUM-029 §4's last open item is closed, and the only items in the whole plan that remain open are the ones that need a machine that is not this one: recording the 14 baselines on the Playwright-supplied Chromium, and the cut-out screenshot that depends on the model hosts.
