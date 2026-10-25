# ADDENDUM-026 — R3F testability refactor, Phase 0: freeze hook, choreography module, likeness gate

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-022 (the accepted plan this implements), ADDENDUM-025 (DOM harness and 100% coverage gate), ADDENDUM-001 §3 (Playwright un-deferred), CLAUDE.md §2, §3, §5, §6, §7.
**Status:** Phase 0 implemented; §0.6 (baseline capture) and Phases 2–3 pending — see §7.

## 1. What was decided

ADDENDUM-022 is the outstanding plan. Its Phase 0 ("make the premiere measurable without a
refactor") is now landed, in four commits:

| Step | Decision | Where |
|---|---|---|
| §0.1 seeded PRNG | already satisfied before this addendum | `scene/GatsbySceneManager.ts` (`DUST_SEED = 1920`, `mulberry32` from `shared/lib/random.ts`) |
| §0.3 typed port | already satisfied before this addendum | `scene/sceneApi.ts` (`PremiereSceneApi`, `PlaybackTelemetry`, `SceneManagerOptions`) |
| §0.2 freeze at a time | `parseFreezeAt(search)` + `SceneManagerOptions.freezeAt` | `model/freeze.ts`, `scene/GatsbySceneManager.ts`, `hooks/usePremiereRuntime.ts` |
| §0.4 e2e targets | mount div carries the testid *and* `data-frame-ready` | `app/components/CinematicStage.tsx`, `scene/GatsbySceneManager.ts` |
| §0.5 Playwright | likeness + flows suites, two projects, SwiftShader | `playwright.config.ts`, `e2e/` |
| §0.7 pure choreography | timing math moved verbatim out of `animate()` | `scene/choreography.ts` |

Phase 1 (DOM unit tests for the stage chrome) was already satisfied by ADDENDUM-025's jsdom
harness and its `stageChrome`/`GatsbyPremiere`/`testidCoverage` suites, so nothing was added for it
here.

## 2. Why

The premiere is the one screen whose output is a WebGL frame, and jsdom cannot see it: a green
`npm test` says nothing about whether Act III still renders. ADDENDUM-022's argument is that the
cheapest way to make that visible is (a) a deterministic frozen frame, (b) a screenshot gate in a
real browser, and (c) the timing math pulled into a pure module that a unit test can pin. All three
are prerequisites for the R3F port (Phase 2), which otherwise has no way to prove it looks the same.

## 3. Relation to the base spec and earlier addenda

- BUILD_PROMPT §2 (stack): one dev dependency added, `@playwright/test@1.64.1`. No runtime
  dependency changed.
- BUILD_PROMPT §7 / CLAUDE.md §3: `npm run e2e` and `npm run e2e:update` join the validation loop.
  `npm test` stays the pure/DOM gate; the browser gate is separate because it needs a browser.
- CLAUDE.md §2's Playwright sentence is rewritten (un-deferred). ADDENDUM-001 §3's "Playwright e2e
  with video-on" row is marked un-deferred: the gate landed, video-on did not (traces on failure
  instead).
- ADDENDUM-025's 100% coverage gate still holds: the new modules are covered by
  `freeze.test.ts` and `choreography.test.ts`.

## 4. What was built

### 4.1 Freeze at a moment (`?freezeAt=`)

`model/freeze.ts`:

```ts
parseFreezeAt(search: string): number | null
```

Reads `freezeAt` from the query string and accepts only a finite number in
`[0, TOTAL_SEQUENCE_DURATION)` (38 s). Missing, blank, non-numeric, `Infinity`, negative or
out-of-range values return `null`, so an ordinary visit is completely untouched.

`GatsbySceneManager` takes it as `SceneManagerOptions.freezeAt`. When set:

- `currentTime` starts at that value and `isPlaying` starts false;
- each frame advances with `dt = 0`, so the scene renders that instant forever;
- `elapsed` (used by the dust, nitrate time and the moving rigs) is the frozen time too, so the
  shot is stable frame to frame;
- `pointermove` is ignored, so a stray cursor cannot tilt the camera between the load and the shot.

`usePremiereRuntime` forwards `parseFreezeAt(window.location.search)`. Nothing else in the app
knows about the parameter: the HUD, transport and Frame Studio behave exactly as they do paused.

### 4.2 Readiness flag

The mount div (`data-testid="cinematic-stage__canvas"`) receives `data-frame-ready="true"` on the
scene's **third** rendered frame — for every visit, not only frozen ones. Two frames of slack let
the composer's bloom/nitrate passes settle before Playwright screenshots or starts driving the
timeline. One signal serves both suites.

The e2e helper waits for `[data-testid="cinematic-stage__canvas"][data-frame-ready="true"]`, which
means "the WebGL scene has actually drawn", not "the DOM mounted".

### 4.3 `scene/choreography.ts`

A verbatim move of the arithmetic that used to live inline in `animate()`, with **no `three`
import** (local `smoothstep`/`clamp`/`lerp` reproduce `THREE.MathUtils` exactly):

| Export | Replaces |
|---|---|
| `smoothstep`, `clamp`, `lerp` | `THREE.MathUtils.smoothstep/clamp/lerp` |
| `activeChapterIndex(t, chapters)` | `getActiveChapterIndex()` (now a one-line delegate) |
| `cardPhase(localT, isFinale)` → draw/text/parting/opacity | the card loop's 25 lines |
| `cinemaCameraZ({chapters, activeIdx, chapterLocal, pullback})` | hold push-in, fly-through portal, finale crown framing |
| `openingNitrate`, `OPENING_NITRATE_GAIN`, `FORCED_NITRATE`, `nitrateStrength(t, forced)` | the nitrate ternary |
| `greenLight(t, heroZ)` | Act I green + finale bookend + the z hand-over |
| `searchlightSway(elapsed)` | the two counter-phase searchlights |
| `lightRig(elapsed, focusZ)` | the three orbiting point lights |
| `rigAnchors({cameraMode, cameraZ, chapterZ})` | backdrop/light anchoring |

Behaviour is unchanged: every constant, window and clamp is the one that was inline. The manager
now only applies the results to scene objects.

`choreography.test.ts` proves it three ways: `smoothstep` parity with `THREE.MathUtils` at 50
samples across the opening curve and the draw-on curve; each curve's boundaries and hand-overs
(card window, finale fade, `t > 30` green-light z swap, forced vs automatic nitrate, orbit vs
cinema anchors); and a **golden sweep** — one line per 0.25 s of the 38 s sequence with chapter,
camera z, all four card values, green light, searchlight sway and nitrate — committed as a
snapshot. That snapshot is now the reference for the R3F port: a refactor that changes the frame at
any sampled instant fails it.

### 4.4 The browser gate

`playwright.config.ts`:

- `testDir: 'e2e'`; `webServer: npm run dev -- --port 4173 --strictPort` (reused if already up);
- `expect.toHaveScreenshot`: `maxDiffPixelRatio 0.01`, `threshold 0.2`, `animations: 'disabled'`;
- Chromium launched with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`
  so WebGL2 renders on a CPU rasteriser — deterministic, and available on CI;
- projects `desktop-chromium` (1440×900) and `mobile-chromium` (390×844, touch, mobile) — the
  latter exercises the coarse-pointer auto-level path of ADDENDUM-012;
- traces on failure; `test-results/`, `playwright-report/`, `blob-report/` git-ignored; snapshots
  committed.

`e2e/support/stage.ts`: `gotoFrozen(page, seconds, {hud, nitrate, orbit})` loads the frozen frame,
waits for the readiness flag, applies the camera/filter toggles **before** hiding the HUD (the HUD
hides the header buttons), then waits two animation frames. `showScreenBorder(page)` opens Frame
Studio and enables the screen-border surface. `clockReadout(page)` reads the timeline clock.

`e2e/likeness.spec.ts`: the twelve shots from §0.5 of the plan — `act1-nitrate-opening` (1.00 s),
`act1-monogram-hold` (4.32), `act1-fly-through` (6.70), `act2-hold` (11.28), `act3-hold` (18.08),
`act4-hold` (24.82), `act5-hero-hold` (33.80), `act5-finale-bookend` (37.00), plus
`act5-nitrate-forced`, `act5-orbit`, `act5-screen-border` and `hud-overlay`.

`e2e/flows.spec.ts`: transport label toggles with play/pause; each of the five chapter buttons moves
the clock into its act; the scrubber moves the readout; `h` hides and restores the HUD; the research
and customiser dialogs open and close (click and Escape); Frame Studio opens, switches surface and
dismisses; applying a custom title jumps to the finale and relabels act V.

## 5. Deviations from ADDENDUM-022

| Plan | Delivered | Why |
|---|---|---|
| `shared/lib/prng.ts` exporting `createPrng` | `shared/lib/random.ts` exporting `mulberry32` | already existed under that name; §0.1 was done before this addendum |
| `data-frame-ready` only while frozen | set on the third frame of every visit | the flows suite needs the same "scene has drawn" signal; a flag that only exists in frozen mode would fork the waiting logic |
| `gotoFrozen` toggles "nitrate" | via `premiere-header__nitrate` | there is no nitrate keyboard shortcut (`usePremiereShortcuts` binds Space, 1–5, `o`, `h`) |
| Phase 1 lives here | already done in ADDENDUM-025 | dom tests shipped with the coverage work |
| `e2e/support/stage.ts` waits on the canvas alone | also waits two animation frames | WebGL output can lag the DOM paint by a frame under SwiftShader |

## 6. Practical impact / what a future reader must know

- `?freezeAt=<s>` is production-visible. It is a test affordance with no UI; it freezes time,
  motion and pointer aim, and sets `data-frame-ready`. It does not disable audio or the HUD.
- `scene/choreography.ts` has no `three` import on purpose. Keep it that way: it is what makes the
  timing testable in node and portable to the R3F components in Phase 2.
- Changing any timing constant means updating the golden sweep in `choreography.test.ts` **and**
  re-capturing the likeness baselines. Say which frames move, and why, in the addendum that does it.
- Screenshot comparison is only valid on the same OS, browser and version; Playwright suffixes
  baselines (`-darwin`, `-linux`). `npm run e2e:update` is a reviewed act, not a reflex.
- The sandbox has no browser and cannot reach the Playwright CDN
  (`npx playwright install chromium` fails), so `e2e/*-snapshots/` do not exist yet in git.

## 7. Validation performed

- `npx tsc --noEmit` → clean, with `playwright.config.ts` and `e2e/` added to `tsconfig.include`
  (so the specs are type-checked, not just transpiled).
- `npm test` → 137 files, **1134 tests** green; statements/branches/functions/lines 100%
  (`choreography.ts` 53/53 statements, 14/14 branches, 15/15 functions; `freeze.ts` 9/9, 5/5, 1/1).
- `npm run build` → clean (`dist/index.html` 1,328.36 kB, gzip 446.49 kB).
- `npx playwright test --list` → 40 tests in 2 files across the two projects (config and specs
  parse and type-check).
- **Not run:** the screenshots themselves. `npx playwright test` fails with
  "Executable doesn't exist … chrome-headless-shell", and `npx playwright install chromium` fails
  downloading Chrome for Testing — this sandbox has no browser and no CDN access. §0.6 stays the
  user's step: `npx playwright install chromium && npm run e2e:update`, inspect
  `e2e/*-snapshots/`, commit them.
- Phases 2 (R3F port) and 3 (`@react-three/test-renderer` suites) are **not started**: per the
  plan's own gate, they wait for baselines captured on the user's machine, because the port is only
  safe if a red likeness diff is meaningful.
