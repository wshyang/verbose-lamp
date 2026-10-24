# ADDENDUM-003 — Configurable frame intricacy: implementation record

**Date:** 2026-10-23  
**Relates to:** ADDENDUM-002 (plan); BUILD_PROMPT §3, §4, §6, §7, §11  
**Decision Context:** DC-003 (same transaction as the plan)

## 1. What was built

| Plan step | Outcome |
|---|---|
| 1 Freeze golden | `frameGrammar/golden.test.ts` snapshots geometry-only output of all 5 archetypes (5,420-line snapshot), taken **before** any refactor (commit `8dbfa64`). |
| 2 Extract pure grammar | `src/webgl/frameGrammar/{types,primitives,archetypes,grammar,index}.ts`. Primitive and archetype bodies moved by script (`sed -n`), not rewritten. Golden passed unchanged after the move. `decoFrames.ts` 980 → 462 LOC (800 limit restored). |
| 3 Annotate | Each primitive sets `kind`; `annotateRanks()` derives `rank`. Grammar fields are excluded from the golden comparison by design. |
| 4 Reduce / elaborate | `rankBudget`, `elaborationGenerations`, `reduceByRank`, `offsetPolylineOutward`, six production rules, `applyIntricacy`. |
| 5 Rig API | `GatsbyCardRig.setIntricacy()` swaps **geometry only**; material, shader program, uniforms and all typography are retained. `GatsbySceneManager.setIntricacy()` fans out, coalesced to one rebuild per animation frame. Hero re-render preserves the current intricacy. |
| 6 Surface | `IntricacyControl` (presentation) + `useFrameIntricacy` (decisions). Slider 0–100 step 5, five preset chips, `[` / `]` step ±5, readout shows preset name when on a preset. testids: `intricacy__panel`, `intricacy__slider`, `intricacy__readout`, `intricacy__preset`. Hidden with the HUD. Default 50; no persistence. |

## 2. Deviations from the plan, with reasons

1. **Frame rank counts pairs, not halves.** First implementation gave rank 0 to only
   the first *half* of the primary frame, so Minimal rendered one half-gate. Fixed in
   `annotateRanks` (`floor(halvesSeen / 2)`). Caught by the `Minimal keeps …` test
   once it asserted two frame halves.
2. **Vertex budget is absolute, not a ratio.** "≤ 4× baseline" failed legitimately for
   ziggurats (12-point halves × 4 echo generations). Replaced with ≤ 1,200 polyline
   points (≈ 7.2k vertices, one draw call). Measured at Baroque: hero 938, ziggurat
   488, gateway 480, sunburst 456, monogram < 450.
3. **Act III side spears tagged `rule`, not `diamond`.** Script tagging hit the right
   push but the chosen kind was wrong; corrected on audit before tests ran.
4. **Outward test uses the card origin, not the polyline centroid.** A leftover
   `* 0` in the probe was removed; using (0,0) is correct because every frame is
   centred and it keeps left/right echoes consistent.
5. **`D(k)` count scaling** (fan rays, columns) from ADDENDUM-002 §2.1 is **not yet
   used**; `E(k)`/`R(k)` alone meet the brief while keeping the baseline exact. Reserved
   for a later addendum if visual review wants denser fans.

## 3. Test matrix (all green: 40 tests)

- Golden snapshot ×5 (Film Baseline unchanged).
- `k = 0.5` equals core geometry ×5.
- Spec count monotone non-decreasing over 9 values of `k` ×5.
- Every rail tagged and ranked 0–3 ×5.
- Mirror symmetry of all non-letterform rails at Baroque ×5 (order-insensitive key).
- Absolute vertex budget ×5. Determinism ×5. Minimal composition. Preset ordering.
- `offsetPolylineOutward` seam/outward unit test.

## 4. Impact and what a future reader must know

> **Superseded in part by ADDENDUM-005:** `GatsbyCardRig.setIntricacy` is now
> `setFrameStyle({ intricacy, formula })`, so intricacy and genesis rebuild together.
> `setIntricacy` on the scene manager is unchanged.

- **The delivered look is `k = 0.5` and is test-protected.** Changing anything in
  `archetypes.ts`/`primitives.ts` will fail the golden test; that is intended. Update
  the snapshot only with an addendum explaining the visual change.
- To add a new ornament type: add a `RailKind`, set it in the producing primitive, give
  it a `BASE_RANK`, a `GENERATION_CAP`, and (optionally) a `Production`. Nothing in the
  rendering layer changes.
- Known debt remaining from ADDENDUM-001 §4: `GatsbySceneManager.animate()`,
  `decoTypography.createExtrudedDecoTextMesh`, `App.tsx` size. Not touched here.
- Risk noted in ADDENDUM-002 §4 (self-intersection of offset ziggurat inner corners at
  generation 4) is **unverified visually**; the geometry is mathematically bounded but
  a browser check is still pending.

## 5. Validation performed

`npx tsc --noEmit` ✓ · `npm test` ✓ (2 files, 40 tests) · `npm run build` ✓
(`dist/index.html` 879.6 kB, gzip 236 kB).  
**Browser not available in this sandbox** — visual verification of Minimal/Ornate/
Baroque, slider responsiveness during drag, and HUD layout at 390×844 is pending.
