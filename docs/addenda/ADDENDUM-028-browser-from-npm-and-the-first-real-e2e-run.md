# ADDENDUM-028 — Getting a browser from npm, running the gate, and the bug the browser found

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-022 §0.5 (the likeness gate), ADDENDUM-026 (Phase 0), ADDENDUM-027 §7 (the gate that could not run), CLAUDE.md §2, §3.
**Status:** The gate runs in this sandbox. Flows are green on desktop; the likeness suite is compared pre-port against port (§5). It found one real application bug (§4.1) and five defects in the e2e specs themselves (§4.2).

## 1. The gap this closes

ADDENDUM-027 recorded, in the same breath as shipping the port, that the twelve likeness screenshots had never been taken: `npx playwright install` cannot reach `cdn.playwright.dev` from here, Debian's Chromium packages cannot be installed either, and no system browser exists. The port was therefore accepted unverified. The user's instruction for this phase was to obtain a browser through npm if possible and finish the outstanding work. It was possible.

## 2. Where the browser came from

The Playwright CDN is not the only source of a Chromium binary; npm is a source of several. What worked, and what did not:

| Route | Result |
|---|---|
| `npx playwright install chromium` (CDN, `playwright.download.prss.microsoft.com`) | Fails: `SSL_ERROR_SYSCALL` — only `github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org` and PyPI are reachable here. |
| `@sparticuz/chromium@153.0.0` (67 MB unpacked on npm) | **Works.** A Lambda-targeted Chromium: `executablePath()` inflates the packed binary to `/tmp/chromium`, `args` carries the serverless flags — including `--use-angle=swiftshader --enable-unsafe-swiftshader`, the exact GPU path the gate is configured for. |
| `chrome-headless-shell` npm wrappers | Not needed once the above ran; they download from the same blocked CDN. |
| `apt-get install chromium` / `libnspr4` | No route to Debian mirrors. |

Version reported: **Chrome 153.0.8010.0**. WebGL2 probe from inside a page:

```
webgl2 true
renderer "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)"
MAX_TEXTURE_SIZE 8192
```

### 2.1 The missing system libraries

`ldd /tmp/chromium` wanted three objects Debian bookworm does not ship here and `apt` cannot fetch: `libnspr4.so`, `libnss3.so`, `libnssutil3.so`. Both are buildable from source with the toolchain that *is* present (gcc 12, make, python3), so they were:

```bash
git clone --depth 1 https://github.com/mozilla/nss   # and mozilla/nspr alongside it
pip install --break-system-packages --user gyp-next   # NSS's build needs gyp
cd nss && make nss_build_all BUILD_OPT=1 USE_64=1 NSS_ENABLE_WERROR=0 NSS_DISABLE_GTESTS=1
# → dist/Linux6.1_x86_64_cc_glibc_PTH_64_OPT.OBJ/lib/{libnspr4,libnss3,libnssutil3,...}.so
LD_LIBRARY_PATH=<that>/lib node …
```

Two notes for the next person: `make -j` breaks NSS's `coreconf/rules.mk` ("multiple target patterns") — build serially; and `nss_build_all` stops late, on the zlib-dependent test utility `selfserv`, *after* the libraries have been installed, so the non-zero exit is expected and harmless. With `LD_LIBRARY_PATH` set, `ldd /tmp/chromium` reports zero unresolved objects.

## 3. Config so any binary can be pointed at

`playwright.config.ts` now reads two optional variables and behaves exactly as before when they are unset:

```ts
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const externalArgs = (process.env.PLAYWRIGHT_CHROMIUM_ARGS ?? '').split(/\s+/).filter(Boolean);
```

It also raises two timeouts, which the run measured rather than guessed: **`timeout: 120_000`** and **`expect.timeout: 20_000`**. SwiftShader at 1440×900 renders at roughly 6.5 fps (13 rAF callbacks in 2 s), so a cold page load takes 13 s, a full-page screenshot 40–70 s, and the previous 30 s test ceiling failed tests that were working correctly. The old default was never exercised before this run, so "it was always 30 s" is not an argument for keeping it.

## 4. What running the browser actually found

### 4.1 A real bug: the premiere loaded paused

`storeSceneApi(store).dispose()` calls `setPlaying(false)` — correct, leaving the scene should stop the clock. But React StrictMode mounts, disposes and remounts every effect in development, and the dispose ran after the store was created, so the first load of the app sat at `00:00` with the transport reading "Play sequence" and never advanced. The unit suite could not see it: it renders hooks without StrictMode and it asserts the store API, not the effect lifecycle. It also cannot occur in a production build, which is precisely why only a browser run exposes it.

Fix: `armScene(store)` in `scene3d/premiereStore.ts` — one line, `isPlaying: freezeAt === null` — called at the end of the runtime effect. Mounting the scene starts the performance; the only thing that overrides that is a frozen URL. Two tests in `usePremiereRuntime.test.tsx` drive the dispose → re-run round trip (playing again; still paused and still at the frozen time when `?freezeAt=` is present).

Note for the record: the old manager set `isPlaying = false` when frozen in its *constructor*, so the port matched it; the bug is the interaction between that and `dispose()`.

### 4.2 The flow spec had never executed, and was wrong in five places

It type-checks, so `tsc` was happy. Running it was not.

| Symptom | Cause | Fix |
|---|---|---|
| `clockReadout is not exported` | `flows.spec.ts` imported a helper that `e2e/support/stage.ts` never defined | helper added |
| act assertions checked the wrong acts | `ACTS` used 0 / 11 / 18 / 24 / 33 s; the sequence starts acts at 0 / 7.2 / 14 / 20.8 / 27.5 s | table corrected, readout polled past the 48 ms telemetry throttle |
| `getByTestId('frame-studio__reveal')` never appears | the studio is **docked open** on first visit; the reveal chip only exists after a dismiss | test dismisses the panel first; `openFrameStudio` / `dismissFrameStudio` helpers added |
| Act V chapter button unclickable | the open studio panel covers it — Playwright reports "subtree intercepts pointer events" | same dismiss-first fix |
| `Escape` did not close the title customiser | the `Dialog` moves focus on the next frame and listens for `Escape` on itself; the keypress landed on `body` | assert `title-customizer__close` is focused, then press |
| `toHaveScreenshot` timed out | full-page screenshot of a SwiftShader canvas against a 30 s budget | timeout raised (§3) |

After these, `npx playwright test e2e/flows.spec.ts --project=desktop-chromium --workers=1`: **8/8 green**, in 4.4 min. The two flows that passed before any of this — the research dialog and the HUD toggle — were the only two that touched neither the dock, the act table nor the customiser. The other six were red, and had been since they were written.

### 4.3 A second real bug, found only on the mobile project

The same flow suite on `mobile-chromium` (390×844) failed on "applying a custom title jumps to the finale": Playwright reported that `<button data-testid="frame-studio__detail-preset">` from the *frame studio* subtree intercepted the click on `title-customizer__apply`. The dock is a full-width panel at `z-[70]`; the title customiser and the research dialog used `z-50`. On a desktop viewport the dock sits to the right of the centred dialog and the button is clear, so nothing showed; on a phone the dock covers the dialog's primary action and the title customiser cannot be applied at all.

`AvatarStudioModal`, `GildedPortraitModal` and `QrGeneratorModal` already use `z-[80]`, which is above the dock — the two older dialogs were simply never raised. Both now match at `z-[80]`. A modal that a dock can cover is not a modal.

## 5. The likeness gate, run for real

There are no committed baselines — ADDENDUM-026 could not record them and ADDENDUM-027 refused to invent them. But the code the port replaced still exists in git, so the honest reference is the **pre-port build itself**: `git archive 08fb2a7` served on `:5174`, the port served on `:5173`, one Chromium, one SwiftShader, one 1440×900 viewport, the same twelve moments, a fresh page per shot, both waited on `data-frame-ready` plus two rAFs. Each pair is compared with the config's own comparator settings (`threshold: 0.2`, i.e. Playwright's default `pixelmatch` semantics).

| Shot | Frozen at | Differing pixels | Verdict |
|---|---|---|---|
| act1-nitrate-opening | 1.0 s | 0 | identical |
| act1-monogram-hold | 4.32 s | 0 | identical |
| act1-fly-through | 6.7 s | 0 | identical |
| act2-hold | 11.28 s | 0 | identical |
| act3-hold | 18.08 s | 0 | identical |
| act4-hold | 24.82 s | 0 | identical |
| act5-hero-hold | 33.8 s | 0 | identical |
| act5-finale-bookend | 37.0 s | 0 | identical |
| act5-nitrate-forced | 33.8 s | 0 | identical |
| act5-orbit | 33.8 s | 0 | identical |
| act5-screen-border | 33.8 s | 0 | identical |
| hud-overlay | 11.28 s | 0 | identical |

### 5.1 The residual, stated precisely

Zero pixels over the gate's threshold is not "no difference". A stricter metric across the same twelve pairs says: mean absolute channel delta **2.0–3.2 / 255**, maximum **16–31**, with **11–20%** of channel values off by more than 6. The worst pair is `act1-fly-through` (3.25 mean, 30 max); the closest is `act5-nitrate-forced` (2.01 mean, 16 max), where the silver-nitrate desaturation hides it. The delta is **mid-tone weighted** — pure background cells differ by 0.0–0.4, clipped highlights by ~0.0, and the recessed wallpaper / beam mid-tones by 2–7 — so it is a ~1% luminance difference in lit surfaces, not a geometry, camera or colour-management difference (any of which would show as edges or as a global shift). Running the port against itself reproduces **0**, so it is not SwiftShader noise in the capture.

Origin: unidentified, and deliberately not guessed at. What was ruled out by reading both trees: the renderer settings (ACES 1.18, `#050407`, `FogExp2 0.022`, camera at `(0, 0, 10.5)`), the four lights (colour, intensity, distance, decay), the wall material (metalness 0.72, roughness 0.55, `envMapIntensity` 0.85, normal scale 1.6, z −14.5 behind the group), the beam texture and material, the green-light and dust shaders, the composer chain and its five numbers, and every shader uniform including `uTime` and `uNitrate` at the frozen second. Neither build contains `Math.random` or any other non-deterministic input, and the port against itself reproduces exactly zero, so the capture path is stable.

What remains is a roughly 1% luminance difference in lit surfaces, an order of magnitude below the gate's threshold (0.2 ≈ 51 levels), invisible side by side, and irrelevant to every assertion in the suite. It is recorded here so that a future reader knows the port was *measured* rather than assumed, knows where to look if a later change makes it large, and knows this was not hidden by a baseline.

### 5.2 Also fixed while here

`spectacle/effects/defaults.test.ts › fireworks shows the emerald pistil over a long seeded show` simulates 200 steps of a full-intensity show and was sitting a few hundred milliseconds under Vitest's 5 s default. It timed out twice while the comparison above was saturating both cores and passed immediately after; the assertions were never wrong. It now carries an explicit 30 s budget, because a test whose margin is CPU speed is a test that reports load as failure.

### 5.3 Frame throughput, measured and inconclusive

The gate only compares pixels, so one more number was taken while the browser was here: sustained `requestAnimationFrame` rate at a frozen 11.28 s, 1440×900, on the software rasteriser. Run twice in opposite orders to cancel warm-up:

| Order | Pre-port | Port |
|---|---|---|
| old, then new | 0.57 fps | 0.44 fps |
| new, then old | 0.95 fps | 1.16 fps |

The port is consistently ~15–20% slower, and the absolute numbers move by 2× between runs. This box has two cores and a load average of ~2, so the measurement cannot separate React Three Fiber's per-frame JavaScript from scheduling noise, and one frame here is dominated by SwiftShader rasterising four full-screen passes. Events still dispatch promptly when the main thread is idle (`setTimeout(0)` round trip: **1 ms** in both builds); the 25 s stalls seen when driving clicks against a 1 fps page are the software renderer's, not the port's.

What the port is *not* doing was checked directly: patching `WebGL2RenderingContext.prototype.drawElements/drawArrays` before load and counting over three frames gives **95 draws and 16 clears per frame in both builds, identically**. So React Three Fiber is not rendering the scene a second time behind the composer — its `useFrame(…, 1)` priority is doing exactly what ADDENDUM-022 §6.3 said it would — and the frame cost between the two builds is the same GPU work. The delta that remains is the per-frame JavaScript of thirteen `useFrame` subscribers plus the store reads, which on a GPU is microseconds against a 16 ms budget and on this box is inside the noise floor.

Recorded rather than chased: if a future change makes the premiere feel heavy, this table and the 95/16 draw profile are the baseline to improve on, not a regression to explain.

### 5.4 Phase 4: `@react-three/postprocessing` A/B — fails, decisively

ADDENDUM-022 §8 allowed this only if it produced zero screenshot failures. It was built and measured rather than argued about: `@react-three/postprocessing@3.0.5` + `postprocessing@6.39.5` in a copy of the tree, with the app's own nitrate GLSL re-expressed as an `Effect` (same maths, `mainImage` entry point, `inputBuffer` sampler), the bloom tuned to the same three numbers, and a half-float buffer.

Result at `act2-hold`, against the shipped build on the same browser:

| Chain | Mean abs delta | Pixels over the gate's threshold | Verdict |
|---|---|---|---|
| three `EffectComposer` (shipped) | — | — | reference |
| `postprocessing` + `EffectComposer` | **15.78 / 255** | **9.63%** (124,847 px of 1.3 M) | fail, by a factor of ten against `maxDiffPixelRatio: 0.01` |

The bloom is visibly different — `postprocessing`'s mipmap blur is a different algorithm from `UnrealBloomPass`'s five-level down/up sample, exactly as ADDENDUM-022 §2 predicted — so the glow around the gate bars and the type is wider and flatter. The dependencies were removed again and `package.json` / `package-lock.json` are byte-identical to before the experiment. The A/B is closed with a number; it does not need re-litigating.

## 6. What is still not verified

- **Committed baselines.** The suite does record and replay: `--update-snapshots` wrote all twelve PNGs in 18.8 min and a replay against them passed (§6.2). They are not committed, for the reason below. The gate compares per OS, browser build and GPU path. These shots come from Chrome 153 on Debian 12 with a locally built NSS; the user's managed browser is Chromium 156. Committing these PNGs would make the user's first `npm run e2e` fail for reasons unrelated to the scene, and ADDENDUM-022 forbids re-baselining to silence that. So: run `npx playwright install chromium` and `npm run e2e:update` **once** on the target machine — a legitimate initial recording, not a re-baseline, because there is nothing to overwrite — then treat it as the gate.
- **Mobile likeness.** The flows run on both projects (§6.1), but the twelve likeness shots were recorded and replayed on `desktop-chromium` only. The mobile project has baselines of its own to record; nothing about the port is specific to either viewport, and `gotoFrozen` is shared.
- **Phase 4** is now measured, not deferred in the dark — see §5.4, and ADDENDUM-029 for the rejection record. The drei half of Phase 4 stays closed: drei was dropped entirely in ADDENDUM-027 §5.
- The residual of §5.1.

## 6.1 Validation for this addendum

- `npx tsc --noEmit` → clean.
- `npm test` → **1,200 tests in 157 files**, all green; statements 6127/6127, branches 2175/2175, functions 1426/1426, lines 5426/5426 — **100% on all four**.
- `npm run build` → clean, 1,734.46 kB / 566.41 kB gzip (the port's bundle, unchanged by this addendum).
- `npx playwright test e2e/flows.spec.ts --project=desktop-chromium --workers=1` → **8/8**, 4.4 min.
- `… --project=mobile-chromium --workers=1` → **8/8**, 4.3 min, after §4.3.
- Twelve old-vs-new likeness comparisons → **0 differing pixels** at the gate's comparator settings, **0 page errors** in either build (§5).
- Twelve-shot likeness recorded (§6.2) and replayed → **12/12**.
- Draw-call parity between the two builds: **95 draws / 16 clears per frame**, identical (§5.3).
- A twelve-surface sweep in the browser — premiere (desktop and 390×844), the studio's border and proportions surfaces, research, title customiser, QR generator, spectacle console, avatar studio, Event Night (desktop and mobile) — screenshotted and inspected with no page errors. The only console noise in every run is a single `net::ERR_CONNECTION_CLOSED` from the sandboxed font/asset request that the proxy drops; it predates this work.

### 6.2 The suite itself, both directions

- `npx playwright test e2e/likeness.spec.ts --project=desktop-chromium --workers=1 --update-snapshots` → **12/12 passed**, 18.8 min, writing `e2e/likeness.spec.ts-snapshots/*-desktop-chromium-linux.png`.
- The same suite replayed against those twelve PNGs (no `--update-snapshots`) → **12/12 passed**, 11.9 min. So the gate is self-consistent: the capture path is deterministic across two full runs of every shot, which is the property a screenshot gate is worthless without.

One defect surfaced while recording: `expect.timeout: 20_000` is what `toHaveScreenshot` uses when no per-call timeout is given, and a full-page capture here takes 40–70 s, so every shot failed with a screenshot timeout rather than a diff. Playwright does not accept `timeout` inside the config's `toHaveScreenshot` block, so the spec now calls a three-line `shot(page, name)` helper that passes `{ fullPage: true, timeout: 120_000 }` per call. The config keeps the tight assertion budget for everything else.

## 7. Reproducing this sandbox's run

```bash
# once
mkdir -p /tmp/bp && cd /tmp/bp && npm i @sparticuz/chromium@153.0.0 pngjs pixelmatch
node -e "require('@sparticuz/chromium').default.executablePath()"   # → /tmp/chromium
git clone --depth 1 https://github.com/mozilla/nss /tmp/src/nss
# (nspr alongside, gyp-next from pip) then, serially:
cd /tmp/src/nss && make nss_build_all BUILD_OPT=1 USE_64=1 NSS_ENABLE_WERROR=0 NSS_DISABLE_GTESTS=1

# every run
export LD_LIBRARY_PATH=/tmp/src/dist/Linux6.1_x86_64_cc_glibc_PTH_64_OPT.OBJ/lib
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium
export PLAYWRIGHT_CHROMIUM_ARGS="--no-sandbox --disable-dev-shm-usage"
npx playwright test --project=desktop-chromium --workers=1
```

`--workers=1` is a sandbox concession, not a recommendation: two cores, and each SwiftShader page holds a core. The config's default parallelism is unchanged.
