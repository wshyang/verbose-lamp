# ADDENDUM-023 — Port the kalma spectacle suite and Event Night demo (assessment and plan)

**Date:** 2026-10-25 · **Relates to:** BUILD_PROMPT §3, §7; CLAUDE.md §1, §2, §5, §6, §7. Implements ADDENDUM-020 and ADDENDUM-021 (accepted plans) from the `kalma - …` reference checkout.
**Status:** Accepted (plan). The implementation record is ADDENDUM-024, written in Step 9.
**Numbering note:** ADDENDUM-022 was taken by the R3F testability plan while this plan was being drafted, so this plan is 023 and its implementation record is 024.

## Context

`kalma - good backdrop effects, but sunburst iris doesn't work need debugging/` is a
standalone Vite app that implemented ADDENDUM-020 (spectacle effects, lucky draw,
gilded UI kit) and ADDENDUM-021 (Deco Lattice frames), plus an unrequested "Event
Night" host screen with a gilded bottom nav bar whose `App.tsx` replaces everything.

Goals:
1. Port the effect features into `src/features/*`, modular and reusable, visuals unchanged.
2. Fix the sunburst iris.
3. Port the Event Night screen as its own module, reachable from the premiere by a
   button (and back), without replacing the premiere.
4. Align with CLAUDE.md: §2 tests, §5 testids/typed contracts, §6 limits
   (fn ≤50 lines, ≤3 params, no boolean-flag params, nesting ≤3, no array methods in
   JSX, component renders / hook decides), §7 honest validation, §10 commits, §1 addenda.

No new npm dependencies (`lucide-react`, `vitest`, `react` already present). Kalma's
`src/utils/cn.ts` is unused there and is not ported. `vite.config.ts` is not touched.

## Sunburst iris: root cause (confirmed by simulation)

`effects/sunburst/sunburstEffect.ts:66-67`
```ts
const r = irisRadiusAt(plan, t, frame.w / frame.h); // aspect-corrected units: 1 = viewport HEIGHT
if (r > 1) drawWedges(plan, r * frame.h, t, frame); // guard compares units, intends pixels
```
`r` peaks at the farthest-corner distance in height units: ~1.08 (centred origin, 16:9),
~0.62 (portrait phone). So the iris never draws on portrait, and on desktop draws only
during the hold at full cover; `onCovered` still fires so the screen swaps uncovered.
Simulated over 1800 ms: drawn 720 ms desktop / 0 ms portrait; with a pixel guard
1710 / 1690 ms. Existing `irisPlan.test.ts` tests the math, never the draw guard.
The fan variant (origin y=1) escapes because `r` > 1 there.

I cannot run a browser, so Step 6 adds a behavioural test through a recording canvas
(the iris must emit wedge fills at mid-cover for 390×844 and 1440×900) and Step 10 lists
the manual browser check. If the iris is still blank after the fix, the second hypothesis
to instrument is layer sizing in `createSpectacleStage.sizeLayer` (host `clientHeight` 0).

## Target layout

```
src/shared/lib/random.ts (+test)        mulberry32, hash01, randomIndex
src/shared/hooks/useReducedMotion.ts    shared by spectacle, lucky-draw, shimmer later
src/features/spectacle/                 model/ particles/ engine/ effects/<9>/ hooks/ components/
  testing/recordingCanvas.ts            test-only fake 2D context (NOT exported from barrel)
src/features/lucky-draw/                model/ render/ hooks/ components/ data/
src/features/gilded-ui/                 model/ components/ gildedUi.css (.gilded-sheen)
src/features/deco-lattice/              model/ (lattice symmetry bundle motifs walk composition
                                        presets latticeSvg) hooks/ components/
src/features/spectacle-preview/         hooks/ components/ data/ spectaclePreview.css
src/features/event-night/               NEW: host screen from kalma, as a feature
src/app/DemoHost.tsx                    picks premiere or event-night
src/app/hooks/useDemoScreen.ts          state + History API (browser Back works)
src/app/model/demoScreen.ts (+test)     pure parseDemoScreen(hash)
```
Rules held: cross-feature imports only through barrels; features never import `app/`;
`gilded-ui` keeps its own `GOLD_RAMPS` (different shape/palette from `gilded-portrait`;
merging would change the look — recorded as a decision in ADDENDUM-024).

---

## Step 0 — Branch, plan doc, register row
Actions
1. `git switch -c feat/event-night-spectacle-port` (carries the uncommitted `src/App.tsx`
   edit; Step 8 supersedes it). Leave untracked `README.md`, `dist/`, `node_modules/`,
   `src/features/avatar-studio/assets/`, and the kalma dir unstaged for the whole job.
   The R3F plan (ADDENDUM-022 file + its `docs/ADDENDA.md` row) is another workstream's
   uncommitted work: never stage it.
2. This document lives at `docs/addenda/ADDENDUM-023-spectacle-port-and-event-night-plan.md`.
3. `docs/ADDENDA.md`: add row ADDENDUM-023 (`§3, §7`, "Accepted (plan)") with `git add -p`
   so only our row is staged, not the 022 row.
Verify: file renders; table row link resolves.
Commit: `docs: add ADDENDUM-023 plan for spectacle port and Event Night demo`
(stage only these two paths; also stage nothing else).

## Step 1 — Shared foundations (tests first)
Actions
1. Copy `kalma/src/shared/lib/random.ts` and `random.test.ts` → `src/shared/lib/`.
2. Create `src/shared/hooks/useReducedMotion.ts` from kalma's hook (identical body).
3. `npx vitest run src/shared/lib/random.test.ts` passes.
Exit: random tests green; `npx tsc --noEmit` clean.
(Committed together with Step 2–3 as commit A.)

## Step 2 — Verbatim port: pure layers + their tests
Copy as-is, fixing only import paths. `kalma/src/…` → `src/…`.
| From (kalma) | To |
|---|---|
| `features/spectacle/{model,particles}/*` | `src/features/spectacle/{model,particles}/*` (types, geometry, timeline, quality, motionPolicy, chasePattern, decoGlyphs + ballistics, blackbody, particlePool + all `*.test.ts`) |
| `features/spectacle/effects/*/…Plan.ts, show.ts, shells.ts, confettiPhysics.ts` + tests | same relative path |
| `features/gilded-ui/model/*` (+ tests) | same |
| `features/deco-lattice/{lattice,symmetry,bundle,motifs,walk,composition,presets,latticeSvg}.ts` + 5 tests | `src/features/deco-lattice/model/` (fix intra-folder imports) |
| `features/lucky-draw/{model,data}/*` (+ tests) | same |
Exit: `npx vitest run` green (all kalma suites: ballistics, particlePool, shells, show,
orbPlan, irisPlan, confettiPhysics, countdownPlan, chasePattern, decoGlyphs, motionPolicy,
quality, goldTable, navItems, plaqueGeometry, lattice, symmetry, bundle, motifs,
composition, entries, fitLabel, reel, spin). `tsc` clean for these files.

## Step 3 — Verbatim port: engine, effects, React, CSS, barrels
Actions
1. Copy `spectacle/{engine,effects/*/*Effect.ts,hooks,components}`, `lucky-draw/{render,hooks,components}`,
   `gilded-ui/components`, `deco-lattice/DecoLatticeFrame.tsx` → `components/`,
   `spectacle-preview/*`, all barrels (`index.ts`).
2. Import edits (the only changes allowed in this step):
   - `useReducedMotion` → `@/shared/hooks/useReducedMotion` in `MarqueeBorder`, `SpectacleProvider`,
     `LuckyDrawStage`, `useLuckyDraw`; delete `spectacle/hooks/useReducedMotion.ts`; keep
     re-export from the spectacle barrel for API stability.
   - Deco-lattice barrel/paths follow the new `model/` + `components/` folders.
3. CSS: create `gilded-ui/gildedUi.css` with `.gilded-sheen` + keyframes + reduced-motion rule,
   imported in `GildedTile.tsx`. Create `spectacle-preview/spectaclePreview.css` with the slim
   scrollbar rules scoped to `.spectacle-preview__panel` (add that class to the `<aside>`).
   (`.gilded-title` and selection colour go to event-night in Step 7.) Do **not** copy kalma's
   global `html, body` rules.
4. `SpectacleLayer`/`SpectacleProvider`: add optional `className` (default kalma's
   `relative min-h-screen overflow-hidden`) so the Event Night screen can pass `h-dvh`.
Exit: `npx tsc --noEmit` clean; `npm test` green; `npm run build` ok. Nothing is mounted yet.

## Step 4 — Golden safety net (locks "visuals preserved")
Written against the verbatim port, before any refactor. All tests are `.test.ts`
(vitest `include` is `src/**/*.test.ts`, node env).
1. `src/features/spectacle/testing/recordingCanvas.ts`:
   `createRecordingContext(): { ctx: CanvasRenderingContext2D; log: string[] }`.
   A `Proxy` that records every method call as `name(args)` and every property write as
   `name=value`; numbers rounded to 3 dp; non-primitive args (gradients, canvases) logged as
   `[Gradient]`/`[Canvas]`; `createLinearGradient/createRadialGradient` return a recorder whose
   `addColorStop` is logged; `measureText` returns `{ width: text.length * size * 0.55 }` parsed
   from the last `font=` write. Also `stubBrowserGlobals()` using `vi.stubGlobal` for
   `window` (`innerWidth 1280, innerHeight 720`) and `document.createElement('canvas')`
   (returns an object whose `getContext` returns a recording context).
2. `src/features/spectacle/effects/effects.golden.test.ts`: for each of the 9 effects in
   `effectRegistry` (fixed seed 1925, `qualitySettings('high')`, `reducedMotion` false and true,
   viewport 1280×720, `fade` 1) call `create(ctx, params)` then `update(t, frame)` for
   t = 0, 100, … up to the effect's duration. Snapshot
   `{ calls: log.length, sha1: hash(log.join('\n')), status: lastStatus }` via `toMatchSnapshot`.
   Params per effect: fireworks `{seed:1925,intensity:0.6}`; orbs `{origin:{x:.5,y:.5},pattern:'sides'|'corners',direction:'outward'|'inward'}`;
   sunburst iris + fan; confetti burst + rain; champagne; searchlights; countdown `{from:3}`;
   name-reveal `{name:'Jay Gatsby'}`; flash.
3. `src/features/lucky-draw/render/drumRenderer.golden.test.ts`: `drawDrum` at positions 0, 3.4,
   speed 0 / 9, `landedPlateGlow` both; snapshot call-log hash.
4. Geometry snapshots (`*.test.ts` beside module): `buildDecoLattice` for medallion default and
   frame `{hw:1.6,hh:1,level:3,seed:1925}` (spec count + hash of `specsToLayerPaths`), `planShow`
   seed 1925, `shellSparks` per type, `planOrbTransition` 4 configs, `planSpin` samples at 5 times.
Exit: `npm test` green and snapshots committed. Re-run twice to confirm determinism
(no `Math.random`/`Date.now` inside effects — verified by grep).
**Commit A** (Steps 1–4):
`feat: port spectacle, lucky-draw, gilded-ui, deco-lattice features from kalma (verbatim) with golden tests`
Body names ADDENDUM-023; Validation line per CLAUDE.md §10. ADDENDUM-024 is created in Step 9;
to satisfy "addendum in the same change", commit A appends a short "Progress" section to this file
listing what landed.

## Step 5 — Refactor to CLAUDE.md §6 (behaviour-preserving)
Rule for the whole step: after every sub-step run `npx tsc --noEmit && npm test`. **No golden
snapshot may change.** If one does, revert that sub-step.
Re-run the AST audit (script in Step 5 notes: functions >50 lines, >3 params, boolean params)
and iterate until the list is empty except where noted.

5a. Parameter objects (>3 params → typed object)
| Function | New signature |
|---|---|
| `fitLabel` | `fitLabel({ text, maxWidth, baseSize, minSize, measure })` |
| `platePath` | `platePath(ctx, rect: Rect)` |
| `drawPlate`, `drawPlateWithLabel` | `(ctx, plate: PlateDraw)` where `PlateDraw = { state, index, theta, isFront, viewport: {w,h} }` |
| `drawFireOrb` | `(frame, orb: { x,y,dirX,dirY,t,index })` |
| `explodeShell` | `(s: FwState, burst: { x,y,depth,type,t,minDim })` |
| `drawPiece` | `(ctx, piece, view: { tSec, w, h, fade })` |
| `drawBeam` | `(ctx, beam, view: { tSec, w, h, fade })` |
| `dimKeepClear`, `drawSparks`, `drawSparkRain`, `fitFont`, `updateOrbs`, `addFinale`, `baseSpark`, `circleOverlapsRect`, `quadBezier` | grouped into `{…}` option objects the same way; `quadBezier` and `circleOverlapsRect` have 4 params each → `(points: {p0,p1,p2}, t)` and `({centre,radius,rect,aspect})` |
| `layer3`, `steppedBorder`, `cornerSteps`, `plaquePinstripe` | `{ req, m, heavy, density }` / `{ hw, hh, steps, d }` / `{ w,h,c,inset }` |
| `drawSparkTrail` | `(ctx, cache, spark, opts: TrailDrawOptions & { ageMs })` |
Update all callers and tests in the same sub-step.

5b. Boolean-flag parameters → split or typed field
- `planIris(params, reducedMotion)` → `planIris(params)` + `planIrisCrossfade(params)`; same for
  `planOrbTransition` (`planOrbTransition` / `planOrbCrossfade`). Effect `create` picks by
  `ctx.reducedMotion`.
- `shellSparks(type, rng, scale, greenLight)` and `addPistil(..., greenLight)` → `pistil: 'emerald' | 'gold'`
  field in a `ShellRequest` object; `FireworksParams.greenLight` stays (public API) and is mapped once in `explodeShell`.
- `drawNumeral(..., reduced)` → pass `scale` mode in a `NumeralView` object (`motion: 'full'|'still'`).
- `drawPlate(isFront)` → field of `PlateDraw` (done in 5a).
- `fireCollisionSpray(..., already)` → caller guards; function becomes `fireCollisionSpray(plan, frame, pool)`.
Golden check: reduced-motion variants in Step 4 prove equivalence.

5c. Long functions (>50 lines)
| Unit | Split |
|---|---|
| `createSpectacleStage` (135) | `engine/layers.ts` (`createLayerRegistry(host, settings)` → `ensure/prepare/clearAll/dispose`), `engine/frameLoop.ts` (`createFrameLoop`), thin `createSpectacleStage` composing both |
| `SpectacleProvider` (52) | `hooks/useSpectacleStage.ts` (creates/disposes stage, returns `{ stageRef, qualityTier, isReady }`); provider renders only |
| `useSpectaclePreview` (145) | `useEffectRunner` (run/toggle/handles/playing), `useStageSettings` (origin, intensity, seed, keep-clear, speaker), `useGoldUiLines` (nav text + validation), `useLatticeControls`; `useSpectaclePreview` composes and returns the same shape |
| `SpectaclePreviewPanel` (113) | one component per section: `BackdropSection`, `TransitionsSection`, `CelebrationSection`, `StageSettingsSection`, `LuckyDrawSection` (+ existing `GoldUiSection`, `LatticeSection` moved to own files) |
| `LuckyDrawStage` (113) | `hooks/useDrumCanvas.ts` (canvas loop + bob), `LuckyDrawControls`, `LuckyDrawResult` components |
| `useLuckyDraw` (87) | `hooks/useSpinAnimation.ts` (rAF tick, refs, `onLanded`) + `useLuckyDraw` (pool/phase/exclusions) |
| `DecoLatticeFrame` (66) | `hooks/useDecoLatticePaths.ts` (request defaults, `buildDecoLattice`, `specsToLayerPaths`, **pre-grouped by layer**, brass angles), `BrassDefs` component |
| `drawWedges` (39), `drawPlate` (35) etc. | stay ≤50; keep |

5d. Component hygiene (CLAUDE.md §5/§6)
- Remove `.filter/.some/.find` in JSX: lattice layer grouping (5c), `GoldUiSection` active-id
  resolution → `resolveActiveId(items, activeId)` pure fn in `gilded-ui/model/navItems.ts` (+test).
- Remove every `eslint-disable` and the `void id`, `void sprites` no-op lines
  (`createSpectacleStage.goIdle`, `orbsEffect.updateOrbs`): drop unused params/vars.
- Testids to `{component}__{role}`: `deco-lattice-frame` → `deco-lattice-frame__root`;
  `lucky-draw__*` unchanged; `spectacle-preview__crosshair/speaker` move to event-night (Step 7).
  Add `data-testid` to any interactive element lacking one (`PanelBits` already takes `testId`).
- `GildedTile`: add `focus-visible` outline (already has ring); keep look.
5e. Lucky draw overlay → shared `Dialog`
- `<Dialog open onClose labelledBy="lucky-draw__title" backdropClassName="fixed inset-0 z-[35] flex items-center justify-center bg-black/70 backdrop-blur-[2px]" closeOnBackdrop={false} testId="lucky-draw__stage">`.
  Adds Escape, focus trap, `aria-modal`. Layering check: canvases at z 40/41 stay above the
  z-35 portal because the host has no stacking context; if the manual check shows otherwise,
  revert to the in-tree overlay and record it.
Exit: AST audit empty; tests + goldens unchanged; `npm run build` ok.
**Commit B**: `refactor: align ported spectacle features with function and parameter limits`
(ADDENDUM-023 progress note updated; Validation line).

## Step 6 — Sunburst iris fix (tests first)
1. RED — add to `irisPlan.test.ts`:
   - `irisRadiusPx(plan, t, {w:1440,h:900})` and `{w:390,h:844}` exceed `MIN_VISIBLE_RADIUS_PX`
     (= 1) at every t in (0, `coverEndMs`] stepping 10 ms except the first 10 ms, and at
     `onCoveredMs` ≥ pixel distance to farthest corner.
   - Retracts to 0 at `durationMs`.
   Add to `sunburstEffect.test.ts` (recording canvas): for both viewports, `update(360, frame)`
   emits ≥ `rays` `fill()` calls (fails today for 390×844); `update(0)` emits none.
   Run: tests fail (portrait).
2. GREEN — `irisPlan.ts`: add
   `export const MIN_VISIBLE_RADIUS_PX = 1;` and
   `export function irisRadiusPx(plan, tMs, viewport: { w: number; h: number }): number`
   = `irisRadiusAt(plan, tMs, viewport.w / Math.max(1, viewport.h)) * viewport.h`.
   `sunburstEffect.ts`: `const r = irisRadiusPx(plan, Math.min(t, plan.durationMs), frame); if (r > MIN_VISIBLE_RADIUS_PX) drawWedges(plan, r, t, frame)` and `drawWedges` takes the pixel radius (rename param `radiusPx` stays).
3. Update only the sunburst golden snapshots (`-u` for that test name); confirm via `git diff`
   that no other snapshot changed.
4. Sanity: the `farthestCornerDistance(…)*1.02` cover test already guarantees full coverage.
Exit: new tests green; goldens otherwise identical.
**Commit C**: `fix: draw sunburst iris when pixel radius is visible (guard compared aspect units)`.
Body explains cause, simulated 720 ms / 0 ms → 1710 / 1690 ms.

## Step 7 — `event-night` feature (kalma's EventNight, modularised)
Files (all new, `src/features/event-night/`)
```
index.ts                         exports EventNightScreen
EventNightScreen.tsx             <SpectacleProvider className="relative h-dvh overflow-hidden">
                                   <GildedGlyphDefs/><EventNightStage onExit/></SpectacleProvider>
components/EventNightStage.tsx   composes the pieces below (≤50-line fn)
components/EventNightHeader.tsx  brand + [Back to premiere] [Lucky Draw] [Spectacle launcher]
components/TitleMedallion.tsx    DecoLatticeFrame + MarqueeBorder + title block
components/StageBackdrop.tsx     radial gradient
components/OriginCrosshair.tsx   testid event-night__origin-crosshair
components/KeepClearSpeaker.tsx  testid event-night__speaker; uses useSpeakerDrag
components/PickOriginHint.tsx
hooks/useEventNight.ts           nav select, tagline, drawOpen, landed chain
hooks/useAmbientShow.ts          starts fireworks + searchlights once stage isReady
hooks/useSpeakerDrag.ts          pointer capture drag → preview.moveSpeaker
model/navActions.ts (+test)      pure
data/sectionTaglines.ts          moved from spectacle-preview (+ DEFAULT_TAGLINE)
eventNight.css                   .gilded-title, .event-night-root ::selection
```
Behaviour decisions
- `model/navActions.ts`: `resolveNavAction(label: string): { kind: 'open-draw' } | { kind: 'section'; key: string; rainConfetti: boolean }`
  (`key = label.toLowerCase()`; draw if includes 'draw'; confetti rain if includes 'toast').
  Tests: "Lucky Draw" → open-draw; "Toast" → section+confetti; "Foyer" → section; case/space handling.
- `useEventNight`: uses `useSpectacle().play`, `useSpectaclePreview()` navItems, `navRef`;
  `selectNav(id)` → plays `orb-transition` (sides/outward/1300 ms, origin from `pointFromElement(navRef)` clamped to y ≤ 0.96, `onCovered` sets tagline and optional rain) exactly as kalma; `handleLanded(winner)` plays confetti burst + name-reveal as kalma.
- `useAmbientShow(isReady)`: when `isReady` flips true, `setTimeout(AMBIENT_START_DELAY_MS = 450)` calls `toggleFireworks(); toggleSearchlights()`; **cleared on unmount**; guarded so StrictMode double-run doesn't toggle fireworks off (use a ref set inside the timer callback, not in render).
  Needs `isReady` from `useSpectacle()` (added in Step 5c).
- Screen shell is `h-dvh`; inner column `min-h-0 overflow-y-auto` so short viewports scroll
  instead of clipping (the one layout adaptation vs kalma's `min-h-screen`, because the repo
  sets `overflow:hidden` on html/body/#root). Logged in ADDENDUM-024.
- Back button in header: `Button`-like gold style matching "Lucky Draw", label "Premiere",
  `data-testid="event-night__back"`, `onClick={onExit}`.
- `SECTION_TAGLINES` removed from spectacle-preview barrel (feature must not own host copy).
Tests: `navActions.test.ts` only (rendering/hook code not unit-tested per CLAUDE.md §2).
Exit: `tsc`, `npm test`, `npm run build`.
(Committed with Step 8 as commit D.)

## Step 8 — Wire into the existing demo
1. `src/app/model/demoScreen.ts` + test: `type DemoScreen = 'premiere' | 'event-night'`;
   `parseDemoScreen(hash: string): DemoScreen` (`#event-night` → event-night; anything else →
   premiere). Test table: `''`, `'#'`, `'#event-night'`, `'#EVENT-NIGHT'`, `'#x'`.
2. `src/app/hooks/useDemoScreen.ts`: `{ screen, openEventNight, openPremiere }`; initial state
   from `parseDemoScreen(location.hash)`; `openEventNight` → `history.pushState(null,'','#event-night')` + set state;
   `openPremiere` → `history.pushState(null,'',pathname+search)` + set state; `popstate` listener
   (cleaned up) re-parses the hash so browser Back/Forward work.
3. `src/app/DemoHost.tsx`: `screen === 'event-night' ? <EventNightScreen onExit={openPremiere}/> : <GatsbyPremiere onOpenEventNight={openEventNight}/>`.
   Only one is mounted, so premiere's Three.js scene/audio dispose (existing cleanup in
   `usePremiereRuntime`) and never compete with the 2D canvases; premiere restarts on return.
4. `src/App.tsx`: `import { DemoHost } from './app/DemoHost'; export function App() { return <DemoHost />; }` (keeps `export default`). Replaces the current uncommitted `./app/index` edit. Export `DemoHost` from `src/app/index.ts`.
5. `GatsbyPremiere` prop `onOpenEventNight: () => void` → `PremiereHeader` prop; new `Button`
   (`PartyPopper` icon, text "Dinner & Dance" / "Event" on small, `title="Open the Event Night demo"`,
   `data-testid="premiere-header__event-night"`) placed after Avatar launcher. No other
   premiere behaviour changes.
6. Fonts/CSS: `index.html` Google Fonts link adds `Cinzel+Decorative:wght@400;700;900` and
   `Jost:wght@300;400;500;600`; `src/index.css` adds `@theme { --font-display: "Cinzel Decorative","Cinzel",Georgia,serif; --font-body: "Jost","Segoe UI",sans-serif; }` (new utilities only; existing `.font-deco` untouched).
7. Keyboard: premiere shortcuts unmount with premiere (verified in `usePremiereShortcuts` cleanup).
Exit: `tsc`, `npm test`, `npm run build`. Record bundle size delta from `npm run build` output.
**Commit D** (Steps 7–8): `feat: add Event Night demo screen reachable from the premiere header`.

## Step 9 — Documentation
1. `docs/addenda/ADDENDUM-024-spectacle-port-implementation.md` (five-part addendum per
   CLAUDE.md §1): what landed per feature; deviations with which-won-and-why (Canvas-2D
   compositor vs the GPU plan in ADDENDUM-020 and why it fits beside the premiere's WebGL
   context; sunburst on the solid overlay; drum is a 2D projection; audio deferred; gilded-ui
   ramps not merged with gilded-portrait; `Dialog` for lucky draw; `h-dvh` shell); the iris
   root cause and test; screen-switch trade-off (premiere restarts); known debt (none expected
   over limits — state the AST audit result); validation actually performed + caveat;
   Playwright e2e un-defer trigger now met (second interactive feature) — flag for next round.
2. `docs/ADDENDA.md`: ADDENDUM-020/021 → "Implemented by ADDENDUM-024"; set 023 to
   "Implemented by ADDENDUM-024" and add 024 ("Implemented — visual check pending").
   ADDENDUM-022 (R3F plan, not ours) is left untouched.
3. `docs/ARCHITECTURE.md`: add module-map entries for `spectacle`, `lucky-draw`, `gilded-ui`,
   `deco-lattice`, `spectacle-preview`, `event-night`, `shared/hooks`, and `app/DemoHost`; add a
   short "Switching demos" paragraph; update ownership bullets (event-night composes the other
   four; premiere unaware of them except the header button).
Exit: links resolve; tables aligned.
**Commit E**: `docs: record spectacle port, iris fix and demo switching (ADDENDUM-024)`.

## Step 10 — Final verification and handoff
Run, and paste real output summaries:
- `npx tsc --noEmit`, `npm test` (report counts + that goldens pass), `npm run build`.
- AST audit script: zero functions >50 lines / >3 params / boolean params in new code.
- `git status`: only intended paths; untracked items from Step 0 untouched.
- `grep -rn "eslint-disable\|Math.random()" src/features/{spectacle,lucky-draw,gilded-ui,deco-lattice,event-night}` — only the two seed-reroll `Math.random` calls in the preview hooks remain (intentional UI reroll).
State plainly: "type-checks, tests pass, builds; visual verification pending — no browser in
this sandbox."
Manual browser checklist for the user (also in ADDENDUM-024):
1. `npm run dev` → premiere loads unchanged.
2. Click **Dinner & Dance** → Event Night: fireworks + searchlights ambient, marquee, gilded nav.
3. **Spectacle** → *Sunburst iris*: wedges visibly grow from the origin, SCREEN A/B swaps while
   covered, then iris retracts. Repeat with devtools portrait emulation (390×844) and *Deco fan*.
4. Orbs ×4, confetti burst/rain, countdown → finale, name reveal, keep-clear box, reduced-motion toggle.
5. Gold nav: *Toast* → orb transition + confetti rain; *Lucky Draw* opens the drum (2/30/300), Esc closes.
6. **Premiere** button and browser Back both return; premiere restarts.
Rollback: each commit is independent; reverting D removes the screen, reverting C restores
the original iris behaviour.
