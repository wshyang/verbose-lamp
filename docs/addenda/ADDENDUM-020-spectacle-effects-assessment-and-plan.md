# ADDENDUM-020 — Spectacle effects: fireworks, orb transitions, lucky draw, celebration extras, gilded UI kit (assessment and plan)

**Date:** 2026-10-24 · **Relates to:** BUILD_PROMPT §3 (visual system, palette), §7 (interface surfaces); CLAUDE.md §1, §2, §5, §6, §7. Reuses ADDENDUM-002/005 (frame grammar), ADDENDUM-013 (gold SVG vocabulary), ADDENDUM-016/019 (gold ramps, metal-aware glint).
**Status:** Accepted (plan). Not implemented yet. Implementation records start at ADDENDUM-021, one per phase.
**Audience:** the agent doing the implementation. Read this whole file before writing code.

---

## 0. First step for the implementer

This plan is already saved here and listed in `docs/ADDENDA.md`. Before any code:
1. Read §2 and open the files it cites; confirm line references still hold.
2. Start phase 1 (§5) on a fresh branch. Once all phases land, change this addendum's register status to `Implemented by ADDENDUM-0xx`.

## 1. Context

This repo is the foundation of a UI library for a Great Gatsby–themed dinner and dance. It already has a WebGL title sequence, an Art Deco frame engine, a gold QR generator and a gilded avatar studio. The user wants a set of **reusable, callable animation effects** for the event night, plus a **small preview overlay** in the demo app:

1. **Photoreal fireworks** in the background. They must never hide foreground subjects.
2. **Orb transitions.** (a) A golden flash whites out the screen, then two fiery gold balls fly from a given point to the two sides. (b) The reverse: two balls fly in from the sides, collide at a given point, and make a blinding flash. (c, d) The same with four balls and the four corners, both directions.
3. **Lucky draw.** A Gatsby frame floats in mid-air. Inside it a giant drum of names spins fast, slows down and stops on a given name.
4. **Extras the user chose in this round:** Deco sunburst iris wipe; gold confetti and champagne bubbles; searchlights and a marquee-bulb border; Deco countdown plus a gilded name reveal.
5. **Gilded UI kit (user's addition, inspired by the themed icons in `tmp/special-fiesta`):** generate UI elements in our shimmering gold from an emoji and a label, for example bottom-navigation panels.

Decisions confirmed with the user: the lucky draw uses a **drum reel** (it scales to 300+ guests and every name stays readable). This round produces **the plan only**. The work is handed to another agent.

## 2. Assessment — what exists and what we reuse

| Need | Existing asset | Use |
|---|---|---|
| Bloom / HDR | `GatsbySceneManager.ts:225–242` wires `EffectComposer` + `UnrealBloomPass` + `OutputPass`, ACES tone mapping | Same pass chain in the new stage. `AfterimagePass` (also in `three/examples`) gives photographic trail persistence. No new npm deps. |
| Additive point sprites | Dust shader `GatsbySceneManager.ts:374–419` (diamond + bokeh sparkle, gold mix) | Pattern for the spark sprite fragment shader. |
| Deco frame mid-air | `@/features/art-deco-frame`: `buildFrame`, `createChamferedFrameGeometry`, `createGoldFrameMaterial`/`createGoldFrameUniforms` | Lucky-draw frame. |
| Deco numerals with reveal + glint | `createExtrudedDecoTextMesh` + `setReveal(reveal, shimmerPhase)` (`decoTypography.ts`); alphabet covers `A–Z 0–9 & . · -` | Countdown numerals; name reveal when the name fits the alphabet. |
| Reflections | `createBallroomEnvironment(renderer)` (`premiere/scene/environment.ts`) — **not exported from the premiere barrel** | Export it through `@/features/premiere`, or move it to `art-deco-frame/render/`. Prefer the move: environments are not premiere-specific. Record the choice in the phase addendum. |
| Gold ramps | `GOLD_RAMPS`, `buildGoldRampLut` (`@/features/gilded-portrait`) | Gilded UI SVG filter tables; flame/blackbody tints. |
| Gold SVG vocabulary | `GoldenQrDefs.tsx` (plaque gradient, 8 s sheen, brush, glow) | Gilded UI tiles and nav bar. |
| Glint math | `glintProfile` (`avatar-studio/shimmer.ts`) | Only if the raster icon path is built (§3.8). Otherwise not needed. |
| Seeded hash | `hashLattice` in `enamel-backdrop/goldLeaf.ts` (private) | Do not import a private file. Add `shared/lib/random.ts` (mulberry32 + hash) and use it everywhere new. |
| Launcher pattern | `QrGeneratorLauncher.tsx` (button + self-owned open state, `data-testid`) | Preview launcher. |
| Reduced motion | `ShimmerCanvas.tsx:30` uses `matchMedia` | Same check, in one shared hook. |

Constraints that shape the design:
- `GatsbySceneManager.ts` is 767 LOC, close to the 800 limit (ADDENDUM-001 debt). **Do not add effects to it.** The effects get their own renderer, so they work in any host, including ones without the premiere.
- Fireworks are pure light, while the lucky-draw drum is solid gold. That needs **two compositing modes** (§3.1).
- There is no browser in the sandbox, so every effect's correctness must sit in pure, tested modules (CLAUDE.md §2, §7).

## 3. Design

### 3.1 Runtime: `src/features/spectacle/`

A framework-neutral engine with a thin React layer.

**Two layers, mounted once by the host:**
- **`light` layer:** an opaque black WebGL canvas with CSS `mix-blend-mode: screen`. Black disappears and light adds over whatever is underneath. Bloom and afterimage work normally, with no alpha hacks. (`UnrealBloomPass` loses alpha on transparent targets; screen blending avoids that.) Used by fireworks, flash, orbs, sparks, searchlights, sunburst rays, champagne.
- **`solid` layer:** a transparent-alpha canvas, normal blending, PMREM environment, no full-screen bloom. Used by the lucky draw, confetti (tumbling foil has dark faces), and countdown numerals.
- Each layer has two z-placements. **`backdrop`** sits under the host content: fireworks, searchlights, champagne. **`overlay`** sits above it: transitions, confetti, lucky draw, countdown. `SpectacleLayer` renders up to four absolutely positioned canvases. Each is created lazily the first time an effect needs it and disposed after 10 s idle.
- The render loop runs only while an effect is live (`renderer.setAnimationLoop`, cleared when idle). Idle cost is zero.

**Typed API (React never touches Three.js):**
```ts
interface EffectParamsMap {
  fireworks: FireworksParams;
  'orb-transition': OrbTransitionParams;
  'sunburst-wipe': SunburstWipeParams;
  confetti: ConfettiParams;
  champagne: ChampagneParams;
  searchlights: SearchlightParams;
  countdown: CountdownParams;
  'name-reveal': NameRevealParams;
}
interface SpectacleStage {
  play<K extends keyof EffectParamsMap>(id: K, params: EffectParamsMap[K]): EffectHandle;
  stopAll(): void;
  dispose(): void;
}
interface EffectHandle {
  readonly finished: Promise<void>;   // resolves on natural end or stop()
  stop(): void;                        // graceful fade, not a cut
}
```
- `createSpectacleStage({ host, quality })` is the engine entry point. `SpectacleProvider` + `useSpectacle()` expose `play` to any component. `SpectacleLayer` mounts the canvases.
- Each effect is an `EffectDefinition<P> = { id, layer, zPlacement, create(ctx, params): EffectInstance }` with `EffectInstance = { update(elapsedMs): 'running' | 'done'; dispose(): void }`. Registry in `engine/effectRegistry.ts`. A new effect is one new folder plus one registry line.
- **Coordinates:** normalized viewport space, `{ x: 0..1, y: 0..1 }`, origin top-left, matching the DOM. `pointFromElement(el)` and `rectFromElement(el)` convert host elements, so "a specified point" can be "the centre of this button".
- **Transitions are callable choreography.** `OrbTransitionParams` and `SunburstWipeParams` take `onCovered?: () => void`. It fires at the frame where the screen is fully hidden, which is when the host swaps its screen. `finished` resolves after the reveal.
- **Quality tiers** (pure `resolveQuality(env)`, tested): `high` (bloom, afterimage, 40k sparks, 8 trail samples, DPR ≤ 2) and `low` (no afterimage, half-res bloom, 12k sparks, 3 trail samples, DPR ≤ 1.25). `auto` picks `low` on coarse pointer or when `hardwareConcurrency ≤ 4`. The event will likely run from a laptop iGPU to a projector, so `auto` must be honest. The preview overlay shows the chosen tier.
- **Accessibility, in one `model/motionPolicy.ts`:**
  - `prefers-reduced-motion`: fireworks become a slow, sparse glitter fade. Transitions become a 400 ms gold crossfade (`onCovered` still fires). The lucky draw does a 1.5 s spin or a direct reveal.
  - **Photosensitivity guard (WCAG 2.3.1):** the flash planner never produces more than 3 large luminance flashes in any 1 s window, and every flash attack is ≥ 80 ms. This is a pure check with tests. The planner clamps, and never throws.
  - Canvas content is invisible to assistive tech. Results (winner name, countdown end) are announced through a visually hidden `aria-live="polite"` region in `SpectacleLayer`.

### 3.2 Shared particle core: `spectacle/particles/`

All sparks (fireworks, orb trails, collision spray, confetti) use **closed-form motion evaluated on the GPU**. The CPU writes spawn attributes once per burst and never updates particles per frame.

- With linear drag `k` and gravity `g`, position is
  `p(t) = p0 + (v0 − g/k)·(1 − e^(−k t))/k + (g/k)·t`.
  The same formula exists as TS (`ballistics.ts`, tested) and as a GLSL chunk (`ballistics.glsl.ts`). A test asserts that the TS form matches a fine Euler integration within 1e-3. The GLSL string is generated from one template, so the two do not drift.
- **Trails:** each spark is drawn at `t, t−Δ, t−2Δ…` (N samples, from the tier). Intensity and size fall along the trail. This gives a real motion streak, like a long-exposure photo.
- **Colour over life:** a **blackbody cooling ramp** (white-hot → champagne → gold → amber → ember red), driven by normalized age, with per-spark jitter. HDR intensities > 1 so bloom catches the heads.
- **Glitter/strobe:** a hash-gated on/off flicker per spark (`hash(id, floor(t·rate))`).
- **Pool:** `particlePool.ts` is a pure ring allocator over fixed GPU attribute slots (tested: never over-allocates; reuses the oldest expired slot first; reports drops). Each layer has one `THREE.Points` draw call.

### 3.3 Fireworks: `spectacle/effects/fireworks/`

**Photoreal comes from five things together.** Particle count alone does not do it.
1. **Real shell types**, pure recipes in `shells.ts`, each a seeded spawn-velocity generator: *peony* (sphere), *chrysanthemum* (sphere with long trails), *willow* and *kamuro* (heavy gold, long-lived, drooping; the signature Gatsby gold), *palm* (few thick comets), *ring* (tilted torus), *crossette* (stars split mid-flight), *strobe/glitter* (crackle), and *double-break* (a pistil core in a second colour). Default palette is gold, champagne and ivory, with an optional **emerald "green light"** pistil as a Gatsby nod.
2. **3D bursts under a fixed perspective camera.** Spheres and rings read as 3D, and distance varies size, brightness and atmospheric haze.
3. **Light interacting with air:** a brief full-frame warm **sky glow** per burst, scaled by distance and size; faint **lit smoke** sprites drifting with wind that the next bursts light up.
4. **Launch comets:** a rising trail with slight wobble. The burst happens at the apex, where the closed-form `v = 0` time is solved analytically.
5. **Photographic response:** bloom, an `AfterimagePass` (persistence ≈ 0.85 high, off low), ACES tone mapping.

**Show programming:** `show.ts` is a pure, seeded scheduler. `planShow({ durationMs, intensity 0..1, palette, seed, finale, keepClear, wind }) → readonly ShellEvent[]`. Each event holds launch time, screen target, depth and shell type. A `finale` ends with a dense 3–4 s salvo plus a crackle curtain. `continuous: true` loops for ambient background use.

**Never obscure the foreground:**
- `keepClear: readonly NormRect[]` (for example the stage speaker, the title block or the avatar) is respected two ways. (1) The scheduler rejects burst centres whose projected radius would overlap a keep-clear rect, using pure geometry, tested as a property over many seeds. (2) The spark shader fades sparks inside up to 4 keep-clear ellipses (uniform array) to `keepClearOpacity` (default 0.2), so a stray willow tail never crosses a face at full strength.
- Default burst band is the upper 65% of the screen. Fireworks always use the **backdrop** placement, under the host content.
- Optional audio (`audio.ts`, off by default): a WebAudio thump synthesized from filtered noise, plus crackle, delayed by `distance / 343 m·s⁻¹`. It sits beside the existing `CinemaAudioEngine` and does not change it.

### 3.4 Orb transitions: `spectacle/effects/orbs/`

One effect, four configurations:
```ts
interface OrbTransitionParams {
  origin: NormPoint;                         // the "specified point"
  pattern: 'sides' | 'corners' | readonly NormPoint[];
  direction: 'outward' | 'inward';
  durationMs?: number;                       // default 1600
  onCovered?: () => void;
}
```
- `orbPlan.ts` (pure, tested) turns params into a timeline. **Outward:** flash attack 0–120 ms, white-out hold to 380 ms (`onCovered` fires at the hold start), then orbs emerge at the origin and accelerate away (ease-in) along a slight arc (quadratic Bézier, arc ∝ distance) to off-screen targets. Sides: `x = −0.15 / 1.15` at origin `y`. Corners: `(−0.1, −0.1)…(1.1, 1.1)`. The flash decays as they leave. **Inward:** the same plan time-reversed: orbs enter from off-screen, decelerate, collide at the origin, flash peaks, `onCovered` fires during the white-out, then the flash decays to reveal the new screen.
- Tests: targets are off-screen for any origin; orbs reach the origin exactly at collision; `onCovered` time sits inside the flash plateau; the plan passes the photosensitivity guard.
- **Flash** (`flash.ts`): a full-screen quad. A radial falloff from the origin expands to full white-gold. It includes an **anamorphic horizontal streak** and faint hexagonal ghosts, the premiere lens-flare look. Peak HDR > 3 so bloom fills the screen.
- **Fiery ball** (`fireOrb.ts`): a billboard shader. A hot core plus domain-warped fbm flame tongues scroll *against* the travel direction, so the flame streams backward. Colour comes from the blackbody ramp and a corona glow. Ember sparks shed along the path through the particle core, with inherited velocity × 0.2, cooling.
- **Inward collision** adds an expanding gold shockwave ring and a radial spark spray.

### 3.5 Sunburst iris wipe: `spectacle/effects/sunburst/`
- A full-screen shader of Deco rays, `rays` count (default 24), alternating gold and deep-bronze wedges, rotating slowly. A radial reveal mask grows from `origin` until it covers the screen (`onCovered`), then retracts or sweeps off to reveal the new screen. A `fan` variant (semicircle from the bottom edge) echoes Deco fan motifs.
- `irisPlan.ts` (pure): the covering radius at time t is ≥ the distance from the origin to the farthest viewport corner at `onCovered` (tested for edge and corner origins).

### 3.6 Celebration extras
- **Confetti** (`effects/confetti/`, solid overlay): instanced gold-foil quads, two-sided. A tumbling normal catches a key light, so the foil *flashes* as it turns. Closed-form fall with terminal velocity plus sinusoidal flutter (`confettiPhysics.ts`, tested: speed converges to terminal). Modes: `burst` from a point, `rain` from the top edge. Variants: foil squares, tinsel strips, Deco diamonds.
- **Champagne bubbles** (backdrop light layer): sparse rising beads with wobble and gentle size growth, plus a faint highlight rim. Ambient, low cost.
- **Searchlights** (backdrop light layer): 2–4 volumetric cones from below the screen edge, additive, with soft edge and haze noise. Sweep angles are sinusoidal with seeded phase (`searchlightPlan.ts`), and the cones cross at the climax. Intensity drops inside keep-clear rects, like the fireworks.
- **Marquee border** (DOM/SVG component, no WebGL): `MarqueeBorder` draws bulbs around a host element with a chase pattern. `chasePattern(bulbIndex, frame, mode)` is pure, with modes `chase | alternate | sparkle | all-on`. Bulbs are warm-gold radial-gradient circles with a CSS glow, so it stays cheap and crisp at any resolution.
- **Deco countdown** (`effects/countdown/`, solid overlay): numerals `from → 0` from `createExtrudedDecoTextMesh`. Each beat runs a reveal plus a glint (`setReveal`) over a sunburst behind it, then a scale-through exit. `countdownPlan.ts` (pure) gives beat timing. `onComplete` lets the host chain `play('fireworks', { finale: true })`.
- **Name reveal** (`nameReveal.ts`): a winner or awardee name with a gilded glint sweep and a short spark rain. When `canRenderInDecoGlyphs(text)` (pure, tested against the alphabet: `A–Z 0–9 & . · -` after upper-casing) holds, it uses extruded Deco lettering. Otherwise it falls back to a Cinzel canvas texture on a gold shader, so names with apostrophes or non-Latin characters still render.

### 3.7 Lucky draw: `src/features/lucky-draw/`

A separate feature with product rules, not just an effect. It owns its own solid-layer renderer and does not use the spectacle stage. It imports confetti and name-reveal through `@/features/spectacle` for the landing.

**Fairness boundary:** the animation **never decides** the winner. The host passes `winnerId`. The module also offers `pickWinner(entries, randomSource = crypto.getRandomValues)` for hosts that want a fair pick. Visual randomness (drum shuffle, wobble) uses a separate seeded RNG and cannot affect the result.

- `model/entries.ts` (pure): normalize and validate `LuckyDrawEntry { id, name, subtitle? }` (trim, collapse whitespace, unique ids, non-empty names, ≥ 2 entries, name ≤ 60 chars). Returns `{ ok, entries } | { ok: false, issues }`, never throws. `withoutWinners(entries, ids)` supports redraws.
- `model/reel.ts` (pure): a **virtual reel**. The drum has `S = 16` physical plates. The logical position `P` (in slot units, unbounded) decides that visible row `r` shows entry `order[(floor(P) + r) mod N]`. Plates get new labels only while they are on the hidden back half. Tests: the visible window shows contiguous entries; wrap-around works; relabels only happen on hidden plates; N from 2 to 2000.
- `model/spin.ts` (pure): `planSpin({ startP, winnerIndex, N, vMax, accelMs, minCruiseMs, decelMs, settle }) → SpinProfile` with `positionAt(ms)` and `velocityAt(ms)`. Phases: a small windup (−0.3 slot), an ease-in up to `vMax`, a cruise, and a cubic ease-out deceleration (distance `vMax·td/3`). The total distance is solved so `P_end ≡ winnerIndex (mod N)`, choosing the smallest whole-turn count that keeps cruise ≥ `minCruiseMs`. An optional dramatic **settle** overshoots by 0.35 slot and springs back with damping. Tests, over 1000 seeds: lands exactly on the winner; velocity is continuous; no reverse motion outside windup and settle; total duration is within ±5% of the target.
- `model/fitLabel.ts` (pure, measure function injected): font shrink-to-fit with a minimum size, then ellipsis. Tested with a fake monospace measurer.
- `render/suspendedFrame.ts`: an Art Deco frame from the `art-deco-frame` barrel (archetype selectable). It bobs gently (±0.04 units, 6 s) with slight yaw, under a key spotlight and rim light, against a dark vignette with dust motes. The frame window masks the drum's back half; fog helps too.
- `render/drumReel.ts`: a 16-plate cylinder on a horizontal axis. Each plate is a chamfered gold plaque with an engraved name (one `CanvasTexture` per plate, 512×96, Cinzel 600; wait for `document.fonts.load` with a fallback). A `uSpeed` uniform smears the name texture along the motion and adds a brushed-metal speed sheen at high velocity. The winner's plate glows on landing.
- `render/luckyDrawScene.ts`: wiring, camera push-in during deceleration, optional tick audio per slot pass (pitch falls with speed).
- `hooks/useLuckyDraw.ts` (decides): validation state, `spin(winnerId)`, phase `idle | spinning | landed`, and announcing the result to the aria-live region. `components/LuckyDrawStage.tsx` (renders) and the overlay controls (`lucky-draw__spin`, `lucky-draw__entries`).
- `data/sampleGuests.ts`: a domain-realistic guest list for demo and tests. Gatsby characters (Jay Gatsby, Daisy Buchanan, Nick Carraway, Jordan Baker, Tom Buchanan, Myrtle Wilson, Meyer Wolfsheim, Owl Eyes, Ewing Klipspringer…) plus around 280 generated event-guest names, deterministic and seeded. `as const`.

### 3.8 Gilded UI kit: `src/features/gilded-ui/`

Generate gold UI from `{ emoji, label }`, like the themed icons in `tmp/special-fiesta` but gold.

**Runtime path: SVG filters (recommended).** They are live, resolution-independent and cheap for many instances, and an active state can animate.
- `GildedGlyphDefs`: one shared `<svg><defs>` per page. The filter chain is: `feColorMatrix` (to luminance) → `feComponentTransfer` with `tableValues` from a gold ramp → `feSpecularLighting` emboss (low) → composite. A sheen `linearGradient` animates on the 8 s period, the same vocabulary as `GoldenQrDefs`.
- `model/goldTable.ts` (pure, tested): `GOLD_RAMPS[id]` → per-channel `tableValues` strings. One ramp source with the portrait pipeline, so icons match gilded photos.
- Collapsing emoji colour to luminance makes platform emoji differences (Apple, Noto, Segoe) mostly harmless. The glyph input also accepts `{ kind: 'svg', path }` (for example a Lucide icon) for pixel-identical cross-device results.
- Components (render only): `GildedGlyph` (the emoji or SVG gilded), `GildedTile` (a chamfered Deco plaque with pinstripe and engraved label; states `idle | active | disabled`), `GildedPanel` (a generic chamfered container), and `GildedNavBar` (`items: readonly NavItem[]`, `activeId`, `onSelect`). The active tab gets the brighter ramp, a running sheen and an engraved underline.
- `model/navItems.ts` (pure): validate items (unique ids, non-empty label ≤ 14 chars, 2–5 items for a bottom bar) and `plaqueGeometry.ts` (pure chamfer path data, snapshot-tested, so no pixel tests are needed).
- A11y: `<nav aria-label>`, `aria-current="page"`, the emoji `aria-hidden`, the label as real text, `data-testid="gilded-nav-bar__item"` shared across rows. Reduced motion stops the sheen.

**Optional raster path (only if PNG icon export is wanted):** draw the emoji to a canvas, then `RgbaImage` → `tintImageGold`/`gildImage` (`@/features/gilded-portrait`) → PNG. Deferred unless asked.

### 3.9 Preview overlay: `src/features/spectacle-preview/`

- `SpectaclePreviewLauncher` (header button, `spectacle-preview__launch`) opens a **small docked, non-modal panel**, so the effect stays visible. It is mounted in `PremiereHeader.tsx` next to the QR and Avatar launchers.
- Panel sections: Backdrop (fireworks, searchlights, champagne), Transitions (orb 2/4 × in/out, sunburst), Celebration (confetti, countdown, name reveal, marquee), Lucky draw, Gold UI (a live `GildedNavBar` sample built from editable `emoji,label` lines).
- Controls per effect: **pick origin** (click the stage to set the point, with a crosshair shown), intensity, seed, quality tier read-out, **keep-clear demo rect** toggle (a draggable dummy "speaker" box that fireworks avoid), simulate reduced motion, Play/Stop.
- Transition demos swap between two dummy "screens" inside `onCovered`, which proves the cover hides the swap.
- `hooks/useSpectaclePreview.ts` decides (catalogue, params state, play wiring). `data/previewCatalogue.ts` holds `as const` entries. Components only render. Testids follow `spectacle-preview__{role}`.
- The host wraps `GatsbyPremiere` in `SpectacleProvider` and mounts `SpectacleLayer` once. This means one host file and one header line change.
- This makes three WebGL contexts at most (premiere + light + solid), which is well within browser limits. The panel offers "pause premiere while previewing" for weak GPUs.

## 4. Module map (new)

```text
src/shared/lib/random.ts                 mulberry32, hash01 (pure, tested)
src/features/spectacle/
  model/      types, geometry (norm↔ndc, off-screen targets, keep-clear), timeline/easing,
              motionPolicy (reduced motion, flash guard), quality
  engine/     createSpectacleStage, layers (light/solid × backdrop/overlay), effectRegistry
  particles/  ballistics(.glsl), particlePool, sparkMaterial, blackbody
  effects/    fireworks/ orbs/ sunburst/ confetti/ champagne/ searchlights/ countdown/
  hooks/      SpectacleProvider, useSpectacle, useReducedMotion
  components/ SpectacleLayer (canvases + aria-live), MarqueeBorder
  index.ts
src/features/lucky-draw/        model/ render/ hooks/ components/ data/ index.ts
src/features/gilded-ui/         model/ components/ index.ts
src/features/spectacle-preview/ hooks/ components/ data/ index.ts
```
Files are ≤ 400 LOC each and functions are ≤ 50 lines; split shaders into `*.glsl.ts` string modules. Keep cross-feature imports to barrels only. Update `docs/ARCHITECTURE.md` (module map and ownership) in phase 1.

## 5. Phases (each phase: tests first → code → `tsc`/`vitest`/`build` → ADDENDUM-02x record → commit with caveat)

1. **Runtime + preview skeleton.** `random.ts`, spectacle `model/*`, stage, layers, registry, provider, `SpectacleLayer`, and a trivial `flash` effect. The preview launcher and panel list it. This proves the pipeline from end to end.
2. **Orb transitions** (four configs) + shockwave + reduced-motion crossfade.
3. **Particle core + fireworks** (shells, show scheduler, keep-clear, sky glow, smoke, afterimage, optional audio).
4. **Lucky draw** (entries, reel, spin, frame, drum, landing chain to confetti + name reveal, aria-live).
5. **Extras:** sunburst, confetti/champagne, searchlights, marquee, countdown, name reveal.
6. **Gilded UI kit** + preview Gold UI section.

Each phase adds its effect to the preview catalogue in the same commit.

## 6. Tests (pure layer; geometry/data snapshots, not pixels)

`random` determinism · `ballistics` vs Euler · apex solve · `particlePool` allocation · each shell recipe snapshot (seed 1925) · `planShow` determinism + keep-clear property over 200 seeds + finale density · `orbPlan` targets/collision/`onCovered` window · flash guard (≤3/s, attack ≥80 ms) · `irisPlan` coverage · `confettiPhysics` terminal velocity · `chasePattern` · `countdownPlan` · `canRenderInDecoGlyphs` · `entries` validation · `reel` mapping · `spin` landing over 1000 seeds + continuity · `fitLabel` · `goldTable` snapshot · `navItems` · `plaqueGeometry` snapshot · `resolveQuality`. Fixtures use the Gatsby guest list, never `item-1`.

## 7. Risks and notes for the implementer

- **Fonts at the venue:** `index.html` loads Cinzel and friends from Google Fonts. If the venue is offline, the drum and name reveal fall back to Georgia. Self-hosting fonts needs its own addendum; flag it before the event.
- `mix-blend-mode: screen` over a WebGL canvas is supported in current Chromium, Safari and Firefox. If a target browser misbehaves, the fallback is a premultiplied-alpha output pass with `alpha = max(r,g,b)`. Record it in an addendum if used.
- Projector output is often washed out. Keep HDR peaks for the flash only, and expose `exposure` in the stage options.
- Playwright e2e stays deferred (ADDENDUM-001). Note in the phase-6 record that this round adds several interactive features, which may meet the un-defer trigger.
- No sandbox browser: every record ends "type-checks, tests pass, builds; visual verification pending".

## 8. Backlog ideas (brainstorm, not in this round)

Gold-dust swirl that condenses into a name or logo (particles morph to points sampled from Deco glyph geometry) · nitrate film-leader countdown (3-2-1 with film burn, reusing the premiere nitrate shader) · Art Deco curtain/gate reveal as a transition (the premiere already parts gates) · champagne-tower pour for the toast · peacock-feather fan reveal · ticker-tape telegram banner for announcements · a three-reel slot machine for prize category × winner · gift-box lid lift prize reveal · pearl-string drop curtain · a "green light" pulse across a bay silhouette as an ambient loop · spotlight follow for a named table · a spinning gramophone record for music segments · gilded photo-booth frame using the avatar studio.

## 9. Verification (per phase and at the end)

- `npx tsc --noEmit`, `npm test`, `npm run build` all green. The bundle-size delta is noted in the record (no new dependencies expected).
- Manual browser check by the user: `npm run dev`, open the **Spectacle** launcher, and run each catalogue entry. Check: fireworks avoid the keep-clear box; `onCovered` swaps hide behind the flash or iris; the lucky draw lands on the chosen name for several entry sizes (2, 30, 300); reduced-motion simulation degrades every effect; the gold nav bar renders from the edited emoji/label lines.
