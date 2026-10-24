# ADDENDUM-005 — Frame genesis: implementation record

**Date:** 2026-10-23  
**Relates to:** ADDENDUM-004 (plan); BUILD_PROMPT §3, §4, §6, §7, §11  
**Decision Context:** DC-004

## 1. What was built

| Plan step | Outcome |
|---|---|
| Types | `FrameSource`, `FrameFormula {source, level}`, `FRAME_SOURCES`, `DEFAULT_FRAME_FORMULA = {authored, 2}`, `FrameStyle`, `DEFAULT_FRAME_STYLE`, level bounds 1–4. |
| Pure generative layer | `frameGrammar/generative.ts`: `frameBox`, `cantorSegments`, `buildFractal`, `buildRosette`, `buildArcade`, `mirrorHalves`, `buildGenerativeFrameSpecs`. No Three.js imports. |
| Pipeline | `buildFrame({archetype, mainWidth, intricacy?, formula?})` = genesis → annotate → reduce → elaborate. `buildFrameSpecs(archetype, width, intricacy)` retained as a delegating wrapper; the golden snapshot test is unchanged and still passes. |
| Scene API | `GatsbyCardRig.setIntricacy` superseded by `setFrameStyle({intricacy, formula})`; `createGatsbyCardRig(chapter, {heroOverride, style})` (parameter object, CLAUDE.md §6). Manager stores one `frameStyle`, coalesces rebuilds to one per animation frame. |
| UI | `GenesisControl` + `useFrameGenesis`. Source chips (Authored / Fractal / Rosette / Arcade), blurb, level slider 1–4 disabled for Authored, `G` cycles source. testids `genesis__panel`, `genesis__source`, `genesis__level`, `genesis__level-readout`, `genesis__blurb`. Mounted above the intricacy panel. |
| Preservation | Authored default is level-invariant and equals the delivered wrapper; golden snapshot untouched. GG letterforms copied verbatim from the authored core into every generative source. |

## 2. Mathematical definitions as shipped

- **Fractal**: `φ = (1+√5)/2`. Primary half-outline, then `level` φ-inset half-rings
  (`φ^−(i+1)`). Cantor rails at depth `min(3, level−1)`:
  `cantor(a,b,d) = cantor(a, a+⅓) ∪ cantor(b−⅓, b)` → 2ᵈ segments. Width `0.042·0.7ⁱ`,
  Z `−0.1(i+1)`, diamond at each ring's equator.
- **Rosette**: `x = 0.94·hw·sgn(cosθ)|cosθ|^(2/n)·(1+a cos mθ)`,
  `y = hh·sgn(sinθ)|sinθ|^(2/n)·(1+a cos mθ)`, `θ: π/2 → −π/2`,
  `n = 2+1.2L`, `m = 3+L`, `a = 0.045+0.018L`, `samples = 40+6L`,
  inner echoes at 0.80/0.64, radial spokes at harmonic peaks.
- **Arcade**: `bays = L+2`; bay spans `[b/bays, (b+0.82)/bays]·hw`; stepped arch apex
  `0.55–0.61·hh`; recursion insets `0.12r` while the bay is wider than `2.4·inset`;
  pier at each bay boundary, keystone diamond above.
- **Symmetry**: every source builds only `x ≥ 0`, starting at top-centre, then
  `mirrorHalves` reflects it with `partDir = −1`. Symmetry and gate parting are
  structural, not incidental.

## 3. Deviations from the plan, with reasons

1. **Rosette sampling reduced** from `48+8L` (max 80) to `40+6L` (max 64): the first
   test run exceeded the 1,200-point Baroque budget on the monogram card (1,220). Now
   966 points worst case. Shape character is unchanged (exponent/lobes untouched).
2. **Symmetry test exempts `monogram`/`pinstripe`** rails. The two GG letterforms are
   intentionally interlocked/asymmetric; every other rail must mirror. Asserting
   otherwise would force a less faithful signet.
3. **`setIntricacy` on the rig replaced, not supplemented**, by `setFrameStyle`, so a
   simultaneous intricacy+genesis change performs exactly one geometry rebuild.
4. **Authored keeps `level` visible but disabled** rather than hiding it. Hiding would
   make the control jump between sources; disabling states the contract ("fixed shape").

## 4. Measurements (main width 5.4, `k = 1`, level 4)

| archetype | authored | fractal | rosette | arcade |
|---|---|---|---|---|
| ziggurat | 74 specs / 488 pts | 178 / 492 | 42 / 966 | 106 / 492 |
| sunburst | 118 / 456 | 178 / 492 | 42 / 966 | 106 / 492 |
| gateway | 76 / 480 | 178 / 492 | 42 / 966 | 106 / 492 |
| hero | 206 / 938 | 178 / 492 | 42 / 966 | 106 / 492 |

All under the 1,200-point test budget and still one draw call per card. The generative
sources trade spec count for longer polylines (rosette samples). Runtime cost of a
rebuild is bounded and coalesced; no typography re-rasterisation occurs.

## 5. Impact and what a future reader must know

- **Two orthogonal axes now exist**: `formula` (what rule draws the base) and `intricacy`
  (how much derived ornament surrounds it). Adding a source means adding a right-half
  builder + a `FRAME_SOURCES` entry; adding ornament means touching the grammar only.
- `buildFrameSpecs` is now the authored-only compatibility wrapper. New code should call
  `buildFrame(request)`.
- The golden test is the preservation contract for the authored frame. Do not update its
  snapshot unless the *delivered look* intentionally changes, with an addendum.
- Known pending: no visual verification of the four sources in a browser (see §6); the
  panels stack to ~210 px on the right at mobile widths — layout check pending.
- Existing debt from ADDENDUM-001 §4 is unchanged; `decoFrames.ts` remains under 500 LOC.

## 6. Validation performed

`npx tsc --noEmit` ✓ · `npm test` ✓ (3 files, 95 tests) · `npm run build` ✓
(`dist/index.html` 887.2 kB, gzip 238.5 kB).  
**Browser not available in this sandbox.** Visual checks pending: each source at levels
1–4 and Minimal/Restrained/Baroque, monogram legibility under fractal/rosette/arcade,
gate parting of generative rails, mobile HUD stacking.
