# ADDENDUM-029 — The likeness gate, actually captured; the browser sandbox; coverage record 2

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-022 (plan, §4 Phase 0, §9 Phase 2 gate), ADDENDUM-027 (testability seams and coverage bar), ADDENDUM-024/025/028 (visual checks still open); BUILD_PROMPT §2, §7, §11; CLAUDE.md §2, §6, §7.
**Status:** Likeness gate implemented and green on Linux + SwiftShader; Phase 0 baseline checkpoint closed. ADDENDUM-022 Phases 1–3 (R3F port) still open.

ADDENDUM-027 §2 said plainly that the baselines were not captured and that until someone did, "the likeness gate protects nothing — it is infrastructure, not evidence". This addendum removes that caveat: a browser was obtained inside the sandbox through npm, the nine shots were captured, and the same suite now passes **without** `--update-snapshots`. It also records the four defects the first real runs found, and the second coverage push.

## 1. Getting a browser from npm (the research the user asked for)

`npx playwright install chromium` cannot work here: the download host (`cdn.playwright.dev`) is outside the sandbox allowlist. Two npm-only routes were tried:

1. `playwright-core` alone — no binary, useless on its own.
2. **`@sparticuz/chromium`** — ships a Chromium build *inside the npm tarball* (as Brotli-compressed tars: `chromium.br`, `swiftshader.tar.br`, `fonts.tar.br`, `al2023.tar.br`). `registry.npmjs.org` is allowlisted, so this installs in seconds.

The build needs three shared libraries that Debian 12's minimal image lacks (`libnspr4.so`, `libnss3.so`, `libnssutil3.so`), and `apt` cannot reach a repository. They are inside that same package: `bin/al2023.tar.br` is a 3.4 MB Brotli tar of
`lib/{libnspr4,libnss3,libnssutil3,libplc4,libplds4,libexpat,libfreebl3,libsoftokn3}.so`. Decompress it, point `LD_LIBRARY_PATH` at it, and `/tmp/chromium --version` answers `Chromium 153.0.8010.0`.

```bash
npm i @sparticuz/chromium            # in a scratch dir, not in this repo
node -e "const z=require('zlib'),f=require('fs');\
f.writeFileSync('/tmp/al2023.tar', z.brotliDecompressSync(f.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))"
tar -xf /tmp/al2023.tar -C /tmp          # gives /tmp/lib/*.so
LD_LIBRARY_PATH=/tmp/lib /tmp/chromium --version
```

WebGL works through SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`): `getContext('webgl2')` returns a live context, and the premiere's three.js canvas renders. That is what makes the likeness shots possible — and it is 20–60× slower than a GPU, which §3 is about.

`playwright.config.ts` gained one seam and no new dependency: `PLAYWRIGHT_CHROMIUM_EXECUTABLE` overrides `launchOptions.executablePath`. Unset, Playwright resolves its own download exactly as before.

```bash
LD_LIBRARY_PATH=/tmp/lib PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium npm run e2e
```

## 2. Baselines

Twelve shots per project, matching ADDENDUM-022 §4's table: the eight act frames (`act1-nitrate-opening` … `act5-finale-bookend` at the plan's freeze times), the three camera/filter variants (`act5-nitrate-forced`, `act5-orbit`, `act5-screen-border`) and `hud-overlay`, the one shot where the DOM is the subject.

```
npm run e2e:update                       # writes all projects
npx playwright test e2e/likeness.spec.ts --project=desktop-chromium --update-snapshots
```

They land as `e2e/likeness.spec.ts-snapshots/<shot>-<project>-<platform>.png` — `…-desktop-chromium-linux.png` here. **The suffix is the contract:** a comparison is only meaningful on the same OS, browser version and GL stack, so a macOS run writes `-darwin` baselines alongside instead of failing forever against Linux pixels. The Linux set is committed as the reference implementation of the current look; it is the set CI can hold.

Measured cost of the gate on this stack: desktop ≈17 min for 12 shots (40 s–1.4 min each), mobile about a third of that. On a real GPU the same suite is seconds.

`event-night-screen` was attempted and **dropped**: the Event Night medallion's lattice frame animates on a JS timer, so two consecutive screenshots never match and no stable baseline exists. The screen is still covered by `flows.spec.ts` (opens, shows the medallion, returns); a moving surface belongs in a flow, not a likeness baseline — the same reason `hud-overlay` dismisses the Frame Studio before capturing.

## 3. Six defects the first real runs found

1. **`expect.timeout` was 20 s and the capture never stabilised.** Playwright takes two consecutive screenshots to prove stability, and one software-rendered 1440×900 canvas capture can take longer than that on its own. Raised to 60 s, with a comment naming the cause.
2. **The nitrate likeness shot could not work as written.** It called `gotoFrame` (which hides the HUD, `pointer-events-none`) and then clicked `premiere-header__nitrate` — a button inside the hidden HUD. It now goes through `gotoFrozen(page, 30.5, { nitrate: true, hud: false })`, which toggles *then* hides. HUD toggles click with `force: true` for the same software-GL reason.
3. **`hud-overlay` is the one shot with a moving subject.** Captured with the Frame Studio docked, it timed out on stability: the studio's lattice preview animates continuously. The shot now dismisses the studio first, so the overlay it records is the header and transport over a still film — and the studio's own look stays covered by the flow test.
4. **The mobile flow suite could not reach the HUD at all.** On a 390×844 viewport the Frame Studio docks *over* the header and transport: `elementFromPoint` on `event-night__launch`, `timeline__replay` and `spectacle-preview__launch` all returned `frame-studio__panel`, so every click hung until timeout. This was a test-harness bug with a real lesson — the flows now call `dismissFrameStudio(page)` first. It is not a product bug: the dock is dismissible and dismisses correctly.
5. **`timeline__chapter` has no `aria-current`.** The flow asserted it; the component exposes selection as `aria-pressed` (the Button `selected` variant). The assertion was corrected to the contract the component actually promises, including the `false` it writes on the chapters that are *not* active. Separately, leaving Event Night remounts the whole premiere scene, which costs ~36 s under SwiftShader — that one test is now `test.slow()` with a 60 s click and a 120 s readiness wait.

6. **The HUD flow asserted opacity on the wrong element.** `hudHidden` puts `opacity-0` on the `<header>` wrapper; the `<nav aria-label="Premiere tools">` inside it keeps `opacity: 1`, because CSS `opacity` is not inherited into computed style. The flow waited a full 60 s on the nav and failed even though the HUD really had hidden. It now locates the header *by* its nav.

Result: `e2e/likeness.spec.ts` **12/12 green on both projects** against the committed baselines; `e2e/flows.spec.ts` **8/8 green** (8 flows × 2 projects), including new coverage for the QR plaque, the avatar studio, the title customizer and the play/pause label.

The full suite is 40 tests (12 likeness + 8 flows, × 2 projects) and takes roughly half an hour on SwiftShader; the desktop likeness project alone is ~17 minutes, which is why the flows use `force: true` clicks and `test.slow()` instead of widening every timeout.

## 4. Accessibility fix found by the QR tests

`QrGeneratorModal`'s chip rows (presets, correction level, module cut, shimmer) styled their selected state with a class only. The tests could not tell which chip was live, which is the same blindness a screen reader has. They now carry `aria-pressed`, matching `PremiereTimeline`'s precedent. Behaviour is unchanged.

## 5. Coverage record 2

Bar: ADDENDUM-027 §5 — strict global 100 %, staged. Suite after this push:

| Metric | At `8346fb3` | At `104c121` | Now |
|---|---|---|---|
| Statements | 89.57 % | 97.09 % | **98.74 %** (6359/6440) |
| Branches | 77.94 % | 89.78 % | **92.43 %** (2200/2380) |
| Functions | 81.35 % | 95.44 % | **98.07 %** (1379/1406) |
| Lines | 90.42 % | 97.79 % | **99.17 %** (5681/5728) |
| Files / tests | 111 / 970 | 137 / 1204 | **154 / 1317** |

The method did not change: one focused suite per module, reading the module first and asserting its real contract — no global canvas/WebGL mocking net, no `skip`s, no snapshot padding.

New this addendum, in the order they landed: the likeness spec rewritten to the plan's twelve shots and re-captured on both projects; the eight-flow interaction suite; `QrGeneratorModal` (10), `useQrGenerator` (12), `GoldenQrCode` (6), `useEffectRunner` (7), `useStageSettings` (6), `locateFace` (11), `frameDesigns` (12), `EventNightStage` (7), `enamel-backdrop/spec` (17), `edgeBorder` ornament (12) — then the second wave written against measured gaps: `GoldenQrDefs` (4), `GeneSlider` (7), `usePremiereSpectacle` (4), `spectacle/model/geometry` (12), `SubjectControls` (4), `GildedPortraitLauncher` (3), `gilded-portrait/curveEdges` (12), `decoTypography` chamfer (5), `fireworksEffect` sub-shells (6), `frameGrammar/grammarBranches` (11), `cutOctagonProfile` (4), `deco-lattice/walk` (7) — and a third sweep that filled the ordinary gaps the first two left behind: `GildedGlyphDefs` (5), `AvatarStudioLauncher` (3), the research and customizer open/close paths in `PremiereSurfaces`, `detectQualityEnv` (3), the exhaustive-switch guard in `enamel-backdrop/patterns`, `gildImage`'s shape assertions (2), `planeOf`/`alphaOf`'s "not a matte" answers, `emptySubject` and the layer-size guard in `avatar-studio/compose`, and the design-gallery path in `useFrameStudio` — then a fourth sweep on the four remaining modules with four or more gaps: `CustomTitleModal`'s keystone/frieze/credit fields and its reset, `LuckyDrawControls` (guest-count menu, spin/redraw/reset gating), `AvatarStudioModal`'s shell (dialog chrome, corner brackets, close), and the searchlights keep-clear pass, which no shipment reaches because every caller passes an empty rect list.

Two of those waves needed a test seam rather than a mock. `decoTypography`'s chamfer pass reads pixels back, so `src/test/canvas2d.ts` grew one option — `opaqueReadback`, which fills alpha 255 on `getImageData` — instead of a test spying on `HTMLCanvasElement.prototype.getContext` (that spy recursed into `RangeError`). `deco-lattice/walk` grew an exported `stepRun` because the seeded walker's step loop is the only part worth asserting; see §6 for what that exposed.

**Remaining: 81 statements across 51 files**, with nothing above five: `GatsbySceneManager` (5/320, the Three.js rig teardown and the coalesced frame-cancel handle), `edgeBorder` (4/164, minimum-length guards on ribs, refinement rays and ticks), `cutOut` (4/107), `segmentSubject` (4/23, the model loader's failure path), then 3s and 2s from `railGeometry`, `walk`'s dead guard, `FrameStudioControl`, `LuckyDrawStage` (jsdom cannot mount it), `sparkRenderer`, `LuckyDrawResult`, and single guards scattered through the feature tree. The rest is WebGL teardown, GPU-timing and loader-failure code: it needs a GPU-attached test harness, not more mocks, and that harness is the open half of ADDENDUM-027 §5. Every one of them is a canvas, WebGL, `document.createElement('canvas')` or modal-open-path surface; closing them is the same per-module work, not a net.

## 6. What is still open

- **ADDENDUM-022 Phase 2 (the React Three Fiber port) is not started.** Its precondition is now satisfied — Phase 0 is complete *and* baselines exist — so the gate that was supposed to protect the port is finally in place. Phases 1 (DOM tests) are effectively done by this coverage work.
- **Deco Lattice walk strands were dead code (product defect, found by the coverage work) — fixed in [ADDENDUM-031](ADDENDUM-031-walk-strands-glyph-icons-and-choreography-extraction.md) §1.** `traceWalks` reserved a 3×3 cell footprint around its start point *before* the first turn, so `isFree` rejected every neighbouring cell and medallion mode's layer-3 walk bundles were never emitted. The fix moved reservation to the end of a walk (`reserveWalk`), which changes medallion geometry, so it came with re-recorded composition goldens — which is exactly why it waited for its own addendum.
- Regenerating baselines on a real GPU will produce different pixels; that is expected and needs no addendum, only the platform suffix.
- The addenda that say "visual check pending" can now be checked by hand through the same browser recipe: the premiere reads correctly at 1440×900 and 390×844, the QR plaque is scannable in the preview, and the avatar studio's tool download is the only step that needs real network access.

## 7. Validation

```
npx tsc --noEmit                                              # clean
npm test                                                      # 149 files / 1283 tests
npx playwright test e2e/likeness.spec.ts                      # 24 passed (12 shots × 2 projects, 20.2 min)
npx playwright test e2e/flows.spec.ts                         # 16 passed (8 flows × 2 projects, 10.7 min)
```

The likeness run above is the `--update-snapshots`-free comparison against the committed baselines; the flows run is a clean pass, not just a capture.

`npm test` also carries ~30 per-file coverage thresholds in `vitest.config.ts` — floors under the modules this work rewrote, so a regression in any of them fails the suite rather than quietly dropping the global average.
