# 0002 — Configurable, mathematically derived frame intricacy

- Date: 2026-10-23
- Status: Proposed (this document); implementation and outcome land in the same change-set
- Related spec: FDS §4.4 `FrameSpec`, §6.3 frame-width derivation, §8.2 archetypes, §8.7 customiser, §12.1 performance
- Supersedes: nothing. Amends behaviour only, never the signature render.

## Decision

Replace the five hardcoded ornament lists with a **pure, deterministic frame-geometry engine** driven by one user-tunable scalar, `intricacy ∈ [0, 1]`, exposed as a Frame Studio surface. The existing look is the engine's **signature value `I = 0.50`** and must render identically at that value.

- `I < 0.50`: **simplification** of the signature ornament set by deterministic salience gates (outer radius and minimum rail length), never touching essential structure.
- `I = 0.50`: **byte-identical** to the pre-change signature ornament list.
- `I > 0.50`: **additive derivation** — scaled echo layers of the non-monogram ornaments, engraved parallel companion rails on axis-aligned rules, and symmetric corner rosettes.

Presets: Restrained `0.10`, Signature `0.50`, Ornate `0.70`, Extravagant `0.85`, Maximal `1.00`.

## Why

The frame is currently five hand-authored point lists inside `decoFrames.ts`. That is stable but not tunable, not testable headlessly, and each new look requires hand-editing hundreds of coordinates. The user wants to dial richness, and wants the derivation to be mathematical rather than a menu of copied variants. A pure engine also makes the "current effect must not be lost" requirement provable: the signature output can be frozen as a fixture and asserted on every run.

## Assessment of the current implementation

| Observation | Consequence | Retain? |
|---|---|---|
| `buildFrameSpecs` mixes geometry with Three.js/`DecoText` module scope | cannot unit-test geometry in Node | Separate |
| 978 LOC in `decoFrames.ts`; 835 in `decoTypography.ts` | breaches adopted 800-LOC limit | Split mechanically |
| Lists authored as symmetric halves with `partDir` | symmetry and gate-parting already correct | Retain |
| Per-rail `delay` drives choreography | draw-on reads as construction | Retain |
| One merged buffer per card | one draw call; cheap | Retain |
| Miter clamp ≤ 2.3 | no spikes at acute sunburst angles | Retain |
| No tests; fixtures absent | no regression protection | Add |

## Options considered

- **A. Hand-author four extra levels per archetype.** Predictable art direction, but 25 bespoke lists, no continuity, no proof of preservation, high drift cost. Rejected.
- **B. Continuous derivation from a canonical seed (chosen).** One signature list per archetype; monotone gates below, closed-form families above; provable equality at `0.50`; testable invariants. Chosen.
- **C. Add shader-only detail (bump/noise).** Cheap, but adds no silhouette, rails or ornament; fails "more intricate frame". Rejected.

## Mathematical model (normative)

Notation: `S = 0.50`; `I` clamped to `[0,1]`; `t = I / S` for the simplification branch. All functions are pure and RNG-free.

### 1. Essential skeleton (always present, all `I`)

A rail is essential iff its role is `primary` (the inner silhouette pair) or `monogram` (the interlocked letters and their pinstripe). Essential rails cannot be removed by any setting. Rationale: without the plate and letters there is no monogram.

### 2. Simplification branch (`I ≤ S`)

For each non-essential rail `r`, derive `cx(r) = |Σx / n|` and `len(r)` (arc length). Keep `r` iff:

```
cx(r) ≤ R(t)   where R(t) = R0 + (∞ − R0)·t, implemented as: keep-all when t = 1
len(r) ≥ L(t)  where L(t) = L0 · (1 − t),  L0 = 0.90, R0 = 1.15
```

At `t = 1` the predicate is bypassed entirely and the signature list is returned untouched (exactness, not "close enough"). Because mirrored rails share `cx` and `len`, removals are symmetric by construction. This is a *radius + salience* gate, not random pruning.

### 3. Derivation branch (`I > S`)

Let `E = floor((I − S) × 8) ∈ [0,4]` echo layers. With `baseExtent = max|cx|` over ornament rails and `MAX_EXTENT = 7.60`:

```
cap      = MAX_EXTENT / baseExtent
s_j      = 1 + (cap − 1) · (j / E),   j = 1..E
echo_j   = { points scaled by s_j about origin,
             width × 0.55, depth × 0.70, z − 0.16·j,
             delay + 0.03·j, role = "echo" }
```

Source rails for echoes exclude `monogram`, `primary` and text. Scales are capped so no echo leaves the framing envelope; the engine returns `extent` and the camera adds pullback for it (see Impact).

**Engraved bands.** For straight rails that are axis-aligned (`|dy| ≤ 0.25·|dx|` or the transpose) and at least 1.4 units long: at `I > 0.64` add one companion per side, at `I > 0.86` a second; companion offset is ±`2.2 × width` along the rail normal, width `0.45×`, delay `+0.02`, role `band`. Curved rails are excluded to avoid self-intersection.

**Corner rosettes.** At `I > 0.80`, place a 2-ring nested diamond group at the four symmetric points `(±0.82·hw, ±0.50·hh)`; at `I > 0.93`, add an outer third ring. Ring sizes are geometric (`r, 0.62r, 0.38r`), role `rosette`, delay `0.30`.

**Budget clamp (deterministic).** Derived rails are appended in the order echoes (outermost first) → bands → rosettes, then truncated so total rails ≤ 420 and total swept vertices ≤ 150 000. Truncation is symmetric because each transformer emits mirrored specs in the same step.

### 4. Returned value

```
{ specs, stats: { railCount, vertexCount, echoes, bands, rosettes, extent }, }
```

`specs` is the same `FrameSpec` shape as today plus non-rendering metadata (`role`, `orphan` never exists). Rendering fields (`points`, `closed`, `width`, `depth`, `z`, `delay`, `partDir`) remain the complete contract for `decoFrames`.

## Preservation guarantee (the hard requirement)

1. Before refactoring, the current `buildFrameSpecs` is frozen by exporting it temporarily and snapshotting its render fields for all five archetypes at widths 3.2 / 5.4 / 6.8 into `src/webgl/frame/__fixtures__/signature.json`. Provenance is recorded in the test.
2. After refactoring, the engine at `I = 0.50` must deep-equal that fixture. The legacy export is then removed; the fixture remains the contract.
3. Additional invariant: for `I ≥ 0.50`, the signature rails are a subset of the output (additive only), so richer frames never lose the original composition.

## Surfaces

| Surface | Behaviour |
|---|---|
| Header `Frame Studio` button | opens the modal; test id `app-header__frame-studio-button` |
| Modal slider (`0–1`, step `0.05`) | live preview; test id `frame-studio__intricacy-slider` |
| Five preset buttons | set the slider to the preset values; test ids `frame-studio__preset-{name}` |
| Readout | current tier name, rail count, vertex count, extent, and a "Signature · exact original" badge at `0.50` |
| Reset | returns to `0.50`; test id `frame-studio__reset-button` |
| Done | closes the modal; style persists for the session; test id `frame-studio__done-button` |
| Keyboard (new) | `[` / `]` step intricacy by `0.05` when no modal/input is focused |

Out of scope (deferred, require their own addenda): persistence across reloads, per-act styles, URL-hash sharing, video export.

## Impact and notes for future readers

- `decoFrames.ts` shrinks to sweep + shader + rig assembly (under 800 LOC); archetype lists move to `src/webgl/frame/` with a barrel export. `decoTypography.ts` loses its glyph table to `decoGlyphs.ts` to satisfy the same limit.
- Camera pullback grows with `max(0, extent − 7.4) × 1.1` so high-intricacy echoes never clip on narrow aspect ratios.
- Rebuild is synchronous on slider change, throttled to one rebuild per animation frame; playback time, hero text and camera mode are preserved. Old rigs are disposed to avoid GPU leaks.
- Users see counts and a "signature exact" badge so the preservation promise is verifiable in the product, not only in tests.

## Verification plan

| Layer | Check |
|---|---|
| Unit (Vitest, Node) | signature snapshot equality (5 archetypes × 3 widths); signature ⊆ output for `I ≥ S`; rail count monotone in `I`; x-symmetry excluding `role: monogram`; determinism; clamp outside `[0,1]`; extent ≤ 7.6 + epsilon; rail/vertex budgets at `I = 1`; preset mapping |
| Typecheck | `npx tsc --noEmit` |
| Build | `npm run build` single-file artefact |
| Browser | manual WebGL visual check at `I ∈ {0, 0.1, 0.5, 0.7, 0.85, 1.0}`, 16:9 and 4:3, plus orbit inspection — **outstanding in sandbox**, recorded in commit trailer |

Risk register: salience removal might feel arbitrary (mitigated by essential roles, symmetry test, and `0.50` untouched); echo clipping (mitigated by cap + camera pullback); rebuild hitch on slide (mitigated by one-rebuild-per-frame throttle; measure informally and record).

## Rollback

Revert the implementation commit. The geometry engine is consumed through a barrel export and one manager method; the previous hardcoded builder remains in git history at the baseline commit. No persisted user data exists, so rollback is complete.

---

## Outcome (implementation, same change-set)

**Status: Accepted and implemented.** Implemented on 2026-10-23 on top of baseline `8884bf7`; signature contract fixture generated from that baseline **before** the refactor.

### Files and LOC

| File | Change | LOC after |
|---|---|---|
| `src/webgl/frame/types.ts` | New pure contracts (`FrameSpec`, roles, stats, caps) | 62 |
| `src/webgl/frame/primitives.ts` | Ornament primitives moved verbatim, now pure + exported | 244 |
| `src/webgl/frame/signatureArchetypes.ts` | `buildFrameSpecs` moved verbatim; renamed `buildSignatureOrnaments` | 297 |
| `src/webgl/frame/derive.ts` | Intricacy engine (roles, simplification, echoes, bands, rosettes, budgets) | 340 |
| `src/webgl/frame/index.ts` | Barrel boundary used by `decoFrames` and tests | 32 |
| `src/webgl/decoFrames.ts` | Sweep + GLSL + rig only; consumes the engine | 454 (was 978) |
| `src/webgl/decoTypography.ts` | Glyph table extracted to `decoGlyphs.ts` (434) | 404 (was 835) |
| `src/components/FrameStudioModal.tsx` | Frame Studio surface | 223 |
| `src/data/frameIntricacy.ts` | Presets, tier labels, formatting | 80 |
| `src/webgl/GatsbySceneManager.ts` | Style state, coalesced rebuild, aggregate stats, envelope pull-back | 760 (was 692) |

### Preservation proof

- `src/webgl/frame/__fixtures__/signature.json` (96 KB) was generated from the **pre-refactor** `buildFrameSpecs` at baseline `8884bf7` for all five archetypes at width 5.4.
- SHA-256 fingerprints for widths 3.2 and 6.8 are frozen in `signature-baseline.test.ts`.
- The refactored engine at `I = 0.50` deep-equals the fixture and both fingerprints. **The original look is one render of the family, not an approximation.**
- Invariants also assert signature rails are a prefix/subset of every richer render.

### Measured derivation (aggregate across five cards, reference width 5.4)

| Setting | I | Rails | Vertices | Echoes | Bands | Rosettes | Envelope |
|---|---|---|---|---|---|---|---|
| Restrained | 0.10 | 95 | 1 872 | 0 | 0 | 0 | 4.68 |
| Signature | 0.50 | 197 | 5 244 | 0 | 0 | 0 | 6.90 |
| Ornate | 0.70 | 459 | 10 740 | 184 | 78 | 0 | 8.20 |
| Extravagant | 0.85 | 683 | 16 500 | 368 | 78 | 40 | 8.20 |
| Maximal | 1.00 | 1 149 | 27 156 | 736 | 156 | 60 | 8.20 |

Per-card caps (480 rails, 60 000 vertices) hold at `I = 1`; counts scale because five cards are aggregated. Geometry is merged into the existing single buffer per card — no new draw calls or meshes.

### Deviations from the plan, recorded

1. **Roles derived geometrically, not hand-tagged.** Monogram rails are identified by forward-plane depth + tall vertical span + central x-reach; the primary skeleton is the `z = 0` plane. This avoided editing the frozen archetype literals and strengthened the byte-identical guarantee. Classification is covered by a test (3 monogram rails in Act I, 2 primary rails elsewhere).
2. **Symmetry test canonicalises closed paths.** Mirroring a closed diamond reverses/rotates its point list while describing the same shape. The test enumerates cyclic starts and both traversal directions; the engine was not changed.
3. **Live rebuild reconstructs whole rigs** (frame + typography), coalesced to at most one rebuild per animation frame. Frame-only hot-swap was not implemented to keep the change small; slider cost is therefore higher than necessary `[DRAFT — browser measurement outstanding]`.
4. No persistence was added; style lasts for the session, as planned.

### Verification

- `npx tsc --noEmit`: **PASS**.
- `npm test` (Vitest, Node): **PASS — 10 tests** across 2 files (signature contract + 8 invariant groups).
- `npm run build`: **PASS** — single-file `dist/index.html`, 888.03 kB (gzip 237.60 kB).
- **Outstanding:** manual browser/WebGL visual check at `I ∈ {0, 0.1, 0.5, 0.7, 0.85, 1.0}` on 16:9 and 4:3, orbit inspection, and slider hitch measurement. No browser is available in this sandbox; this is not claimed as verified.

### Rollback

Unchanged: revert the implementation commit; the geometry engine is behind one barrel import and one manager method, and the pre-change builder remains in git history at `8884bf7`.
