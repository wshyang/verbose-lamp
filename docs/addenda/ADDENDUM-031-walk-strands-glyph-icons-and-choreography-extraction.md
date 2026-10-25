# ADDENDUM-031 — Strands that actually draw, glyphs that survive without an emoji font, and 022 Phase 0.7

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-029 (§3 six defects, §5 coverage record 2, §6 open items), ADDENDUM-030 (§4.2 emoji finding), ADDENDUM-022 (§6 step 0.7 choreography extraction), ADDENDUM-021 (§3.4 seeded walks). CLAUDE.md §2, §4, §7; BUILD_PROMPT §2.
**Status:** Four items closed. The likeness gate stays green (4/4 shots re-checked, §5). Coverage 98.81 → **99.22 % statements**, 92.67 → **93.84 % branches**, 98.03 → **98.87 % functions**, 99.25 → **99.53 % lines**; 1420 tests in 171 files.

ADDENDUM-029 §6 left two things a reader could act on: the deco-lattice walk strands were dead code, and the Event Night nav glyphs needed a colour-emoji font that the headless browser does not carry. This addendum fixes both, lands the first step of the React Three Fiber port's groundwork, and then spends a deliberate sweep on the coverage debt those reports were honest about.

## 1. The walk strands draw again (ADDENDUM-029 §6, defect)

`traceWalks` reserved a 3×3 cell halo around its start point *before* the first turn, so `isFree` rejected every neighbouring cell and `advanced === 0` on the very first turn for every seed. The `pts.length >= 2` guard never passed, so medallion mode's layer-3 walk bundles were never emitted — the feature existed on paper only.

The fix is the one the earlier report named: **reservation happens once, when a walk ends.** `stepRun` now only *reads* the occupancy set, and a new `reserveWalk` claims the footprint of a finished walk. A walker can no longer wall itself in, and it still cannot walk through another walk's clearance.

The effect on geometry is large and was expected:

| request | specs before | specs after |
|---|---|---|
| default medallion | 123 | 243 |
| medallion level 3 | 123 | 243 |
| medallion level 4 | 27 | 147 |

`composition.golden.test.ts` re-recorded four snapshots (`--update-snapshots`), and the new geometry is the *intended* one: layer-3 strands exist at all. `walk.test.ts` grew from 7 to 12 cases and now pins the engine's real contract rather than its broken behaviour:

- one whole cell per step, along one of eight octilinear directions;
- `stepRun` leaves `occupied` untouched (the regression this addendum is about);
- a run stops at the wedge edge, at the outer radius, and at another walk's halo;
- waypoints are a whole number of cells apart, and a 45° run has equal cell counts on both axes;
- different walks keep a one-cell halo between them.

The medallion is not on the likeness-critical path (acts I, IV and V are frame and card compositions), which is why the screenshot gate is unaffected — and, as §5 records, it was re-checked anyway.

## 2. Glyphs that do not need a colour-emoji font (ADDENDUM-030 §4.2)

`GildedGlyph` renders `{ kind: 'emoji' }` as an SVG `<text>` node. That reads correctly on macOS, Windows and Android, and as an empty box on any host without a colour-emoji font — the Linux CI image, most minimal containers, and this sandbox's `headless_shell`. The gilded nav bar passed its emoji straight through, so the Event Night bottom bar was boxes here.

Two changes, both small:

1. **`src/features/gilded-ui/model/glyphIcons.ts`** — six hand-built Art Deco paths on a 24 × 24 grid (`portico`, `note`, `dice`, `coupe`, `camera`, `star`) plus `iconNameFor` / `iconPathFor`. Colour-emoji keys are matched with the variation selector stripped, so `'🏛️'` and `'🏛'` agree.
2. **`GildedNavBar`** resolves a built-in icon first and falls back to `{ kind: 'emoji' }` for anything it has not drawn — a user's own edited line keeps working, and the editor never has to explain itself.

The paths are stroke geometry, so they go through the same `#gilded-glyph` luminance → gold-ramp filter the emoji did; the bar keeps one visual language either way. `glyphIcons.test.ts` (11 cases) pins the mapping, the selector handling, the `null` fallback for an unknown glyph *and* for a hand-edited line with no glyph at all (the `undefined` case that a first draft of the guard missed and the Event Night suite caught), the anchor coordinates, and the frozen table.

This is deliberately *not* a font dependency: shipping a colour-emoji font would add megabytes to a single-file build for five icons.

## 3. ADDENDUM-022 Phase 0.7 — choreography extracted

Phase 2 (the React Three Fiber port) needs the premiere's timing and camera maths to exist apart from a `THREE.Scene`. Phase 0.7 does exactly that, without changing a pixel:

- **`src/features/premiere/scene/choreography.ts`** — pure, no `three` import: `smoothstep`, `clamp01`, `lerp`, `activeChapterIndex`, `CARD_PHASE_WINDOW` / `cardPhase`, `cinemaCameraZ`, `greenLight`, `openingNitrate` / `FORCED_NITRATE`, `searchlightSway`, `lightRig`, `rigAnchors`.
- **`GatsbySceneManager`** now calls those instead of holding the formulae privately; the private `getActiveChapterIndex` is gone, and `setCameraMode` uses `activeChapterIndex`.

`choreography.test.ts` is 26 cases: a 50-sample parity check against `THREE.MathUtils.smoothstep`, the deliberate oddities of the manager pinned as invariants (a negative time belongs to the *last* chapter, the hero error holds to local 0.91 then is gone by 0.995, finale Z is the hold distance minus drift), and a whole-sequence golden that samples 0…38 s every 0.25 s. That golden is the safety net the port will be judged against.

## 4. The sandbox lesson this round cost two hours

The first gate run of this round reported **4/4 failed** with `cinematic-stage__canvas` never appearing. It was not a code regression: the canvas was there, WebGL was not. The message was

```
THREE.WebGLRenderer: A WebGL context could not be created … BindToCurrentSequence failed
```

`@sparticuz/chromium` resolves `libvk_swiftshader.so` **relative to the executable's own directory**, not through `LD_LIBRARY_PATH`. The earlier working setup had extracted `swiftshader.tar.br` into `/tmp` — the same directory as the binary — and this round's rebuild had put it in `/tmp/br` instead. Put the binary and the SwiftShader libraries in one directory (or extract the tar beside the binary) and the same flags render again:

```bash
tar -xf /tmp/swiftshader.tar -C /tmp    # /tmp/libEGL.so, /tmp/libGLESv2.so,
                                        # /tmp/libvk_swiftshader.so, /tmp/vk_swiftshader_icd.json
LD_LIBRARY_PATH=/tmp/br/lib PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium npx playwright test …
```

A five-line probe proved it before anything else was blamed: load a page that calls `getContext('webgl2')` and read the title. Screen-shot failures under software GL should always be triaged that way — a blank canvas and a wrong canvas look identical in a diff.

## 5. Validation

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **171 files, 1420 tests, all green** (was 156 / 1355 at ADDENDUM-030).
- Likeness gate, the four shots the choreography extraction could plausibly move: `act1-nitrate-opening`, `act4-hold`, `act5-hero-hold`, `hud-overlay` — **4/4 passed in 6.7 min** against the committed baselines, no re-baseline needed. The extraction is likeliness-neutral, which is the entire claim.
- Coverage (`npx vitest run --coverage`):

| | ADDENDUM-029 | now |
|---|---|---|
| statements | 98.81 % | **99.22 %** (6436/6486) |
| branches | 92.67 % | **93.84 %** (2243/2390) |
| functions | 98.03 % | **98.87 %** |
| lines | 99.25 % | **99.53 %** |

Sixteen modules are now at 100 % on statements, branches and functions, and are held there by named thresholds in `vitest.config.ts`: `choreography.ts`, `glyphIcons.ts`, `deco-lattice/model/walk.ts`, `GildedNavBar`, `GildedPanel`, `LuckyDrawResult`, `LuckyDrawStage`, `TitleMedallion`, `StageBackdrop`, `EventNightScreen`, `QrGeneratorLauncher`, `OrbitHint`, `avatar-studio/stage.ts`, `enamel-backdrop/colour.ts`, `frameGrammar/genome.ts`, `raster/morphology.ts`.

New suites this round, in the order they landed: `walk` (+5), `choreography` (+2), `glyphIcons` (11), `GildedNavBar` (5), `GildedPanel` (2), `LuckyDrawResult` (5), `LuckyDrawStage` (4), `TitleMedallion` (3), `StageBackdrop` (1), `EventNightScreen` (2), `QrGeneratorLauncher` (3), `OrbitHint` (2), `avatar-studio/stage` (4), `enamel-backdrop/colour` (4), `frameGrammar/genome` (4), `frameGrammar/index` (3), `raster/morphology` (4), `spectacle/particles/blackbody` (4) — plus edge cases appended to `mask`, `tone`, `navItems`, `entries`, `spin`, `resample`, `motionPolicy` and `generative`.

## 6. What is still open, stated plainly

- **50 statements and 147 branches remain uncovered**, in files this round did not touch. Most are single-statement defensive guards that no caller in the product can reach — `stepRun`'s `totalLen < 1e-4` early return (each segment is already floored at `1e-4`), `miterAt`'s one-sided normals, `decoTypography`'s `!item.def` skip (the alphabet always falls back to `'O'`), `blackbodyColor`'s post-loop return, `framing`'s non-finite-eyes guard. Covering those would mean either exporting internals for tests or writing a test that asserts dead code; both are worse than the gap. The honest next step is to delete them, which is a separate change with its own review.
- The larger remaining pockets are Three.js and canvas effect modules (`GatsbySceneManager` 4, `edgeBorder` 4, `segmentSubject` 4, `sparkRenderer` 2, the fireworks/champagne/name-reveal effect bodies). They are exactly what the R3F port will restructure, so tests written against them now would be written twice.
- **ADDENDUM-022 Phase 2 (the R3F port) is still not started.** Its precondition — Phase 0 complete, baselines in place, choreography isolated — is now fully satisfied; §3 is the last piece of groundwork.
- `ADDENDUM-029 §6`'s walk bullet is closed by §1 here, and its emoji bullet by §2.
