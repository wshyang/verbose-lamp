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

Nine shots per project, written by the first real run:

```
npm run e2e:update                       # writes all projects
npx playwright test e2e/likeness.spec.ts --project=desktop-chromium --update-snapshots
```

They land as `e2e/likeness.spec.ts-snapshots/<shot>-<project>-<platform>.png` — `…-desktop-chromium-linux.png` here. **The suffix is the contract:** a comparison is only meaningful on the same OS, browser version and GL stack, so a macOS run writes `-darwin` baselines alongside instead of failing forever against Linux pixels. The Linux set is committed as the reference implementation of the current look; it is the set CI can hold.

Measured cost of the gate on this stack: desktop 9.4 min for 9 shots (40 s–1.2 min each), mobile about half that. On a real GPU the same suite is seconds.

## 3. Four defects the first real runs found

1. **`expect.timeout` was 20 s and the capture never stabilised.** Playwright takes two consecutive screenshots to prove stability, and one software-rendered 1440×900 canvas capture can take longer than that on its own. Raised to 60 s, with a comment naming the cause.
2. **The nitrate likeness shot could not work as written.** It called `gotoFrame` (which hides the HUD, `pointer-events-none`) and then clicked `premiere-header__nitrate` — a button inside the hidden HUD. It now goes through `gotoFrozen(page, 30.5, { nitrate: true, hud: false })`, which toggles *then* hides. HUD toggles click with `force: true` for the same software-GL reason.
3. **The mobile flow suite could not reach the HUD at all.** On a 390×844 viewport the Frame Studio docks *over* the header and transport: `elementFromPoint` on `event-night__launch`, `timeline__replay` and `spectacle-preview__launch` all returned `frame-studio__panel`, so every click hung until timeout. This was a test-harness bug with a real lesson — the flows now call `dismissFrameStudio(page)` first. It is not a product bug: the dock is dismissible and dismisses correctly.
4. **`timeline__chapter` has no `aria-current`.** The flow asserted it; the component exposes selection as `aria-pressed` (the Button `selected` variant). The assertion was corrected to the contract the component actually promises, including the `false` it writes on the chapters that are *not* active. Separately, leaving Event Night remounts the whole premiere scene, which costs ~36 s under SwiftShader — that one test is now `test.slow()` with a 60 s click and a 120 s readiness wait.

Result: `e2e/likeness.spec.ts` **9/9 green** against the committed baselines; `e2e/flows.spec.ts` **4/4 green on desktop** (and green on mobile once the studio is dismissed).

## 4. Accessibility fix found by the QR tests

`QrGeneratorModal`'s chip rows (presets, correction level, module cut, shimmer) styled their selected state with a class only. The tests could not tell which chip was live, which is the same blindness a screen reader has. They now carry `aria-pressed`, matching `PremiereTimeline`'s precedent. Behaviour is unchanged.

## 5. Coverage record 2

Bar: ADDENDUM-027 §5 — strict global 100 %, staged. Suite after this push:

| Metric | At `8346fb3` | Now |
|---|---|---|
| Statements | 89.57 % | **97.09 %** (6249/6436) |
| Branches | 77.94 % | **89.78 %** (2137/2380) |
| Functions | 81.35 % | **95.44 %** (1341/1405) |
| Lines | 90.42 % | **97.79 %** (5598/5724) |
| Files / tests | 111 / 970 | **137 / 1204** |

New this addendum (all green, no `skip`s): `QrGeneratorModal` (10), `useQrGenerator` (12), `GoldenQrCode` (6), `useEffectRunner` (7), `useStageSettings` (6), `locateFace` (11), `frameDesigns` (12), `EventNightStage` (7), `enamel-backdrop/spec` (17), `edgeBorder` ornament (12), plus the earlier wave in the same branch (lucky-draw hooks and drum, avatar-studio controls, gilded-portrait modal, spectacle stage and marquee).

187 statements remain across 72 files, and only nine files are more than five statements short: `decoTypography` (11/209), `fireworksEffect` (10/86), `frameGrammar/grammar` (6/111), `GeneSlider` (6/7), `gilded-portrait/curve` (6/72), `spectacle/model/geometry` (6/19), `usePremiereSpectacle` (5/15), `frameGrammar/primitives` (5/66), `SubjectControls` (5/7). Everything else is one or two lines in a branch guard. Each of the nine is a canvas, WebGL or arm's-length-border surface; the honest way to close them is one focused suite per module, not a global mocking net.

## 6. What is still open

- **ADDENDUM-022 Phase 2 (the React Three Fiber port) is not started.** Its precondition is now satisfied — Phase 0 is complete *and* baselines exist — so the gate that was supposed to protect the port is finally in place. Phases 1 (DOM tests) are effectively done by this coverage work.
- Regenerating baselines on a real GPU will produce different pixels; that is expected and needs no addendum, only the platform suffix.
- The addenda that say "visual check pending" can now be checked by hand through the same browser recipe: the premiere reads correctly at 1440×900 and 390×844, the QR plaque is scannable in the preview, and the avatar studio's tool download is the only step that needs real network access.

## 7. Validation

```
npx tsc --noEmit                      # clean
npm test                              # 133 files / 1180+ tests
npx playwright test e2e/likeness.spec.ts --project=desktop-chromium   # 9 passed
npx playwright test e2e/flows.spec.ts --project=desktop-chromium      # 4 passed
```
