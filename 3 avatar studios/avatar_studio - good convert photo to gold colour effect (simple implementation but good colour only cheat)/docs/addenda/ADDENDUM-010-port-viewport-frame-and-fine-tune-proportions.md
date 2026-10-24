# ADDENDUM-010 — Porting the viewport frame, dismissible overlay, and fine-tune proportions

**Date:** 2026-10-23
**Relates to:** ADDENDUM-008/009 (surfaces, Frame Studio); BUILD_PROMPT §3, §4, §6, §7
**Decision Context:** DC-007
**Status:** Implemented — see ADDENDUM-011 for the record.
**Donor:** `wshyang/verbose-lamp@4ae6291`, implementation `1/` (genome architecture).
**Receiver:** this repo, byte-identical to implementation `2/` (verified on all frame files).

## 1. What each implementation contributes

| Concern | `1/` (donor) | `2/` (ours) | Decision |
|---|---|---|---|
| Viewport-edge frame | `edgeBorder.ts` + `EdgeBorderRig`: unit viewport space (`y ∈ [−1,1]`, `x ∈ [−aspect,aspect]`), scaled by `distance·tan(fov/2)`; nested stepped rules, 4 corner fans, reeding, inner hairline; all genome-responsive | `posterBorder.ts` + `PosterBorderRig`: frustum-derived half-extents, fixed motif set | **Port `1/`'s generator.** It is aspect-driven in unit space and reshapes from the same genome as the title frame. Replace ours. |
| Studio chrome | Large centred **modal** with backdrop, readout stats, reset/Done | **Small overlay panel** with buttons + level/detail sliders | **Keep ours** (small overlay), per instruction. Adopt `1/`'s stats readout and reset. |
| Dismiss / restore | Modal has Close + Done | None — only the global HUD eye, which hides the timeline too | **Add** a dedicated dismiss on the panel and a dedicated reopen button. |
| Fine-tune proportions | 10-gene `BaseGenome`, hidden behind a "Fine-tune proportions" toggle; `GeneSlider` with a signature tick on the track | None | **Port**, including the hidden-by-default behaviour. |
| Design selection | ‹ label › arrow stepper over a 12-entry gallery | Pattern button grid | **Reject the arrows**, per instruction. Render the gallery as visible buttons. |
| Patterns | 2 families (Sunburst / Fluted) + 6 genome presets + 6 Kronos variations | 4 patterns (Authored/Fractal/Rosette/Arcade) × level 1–4 | **Consolidate** (see §3). |

## 2. Genome (ported from `1/`)

Ten genes, each with a signature value that reproduces the delivered frame exactly:
`cornerScale κ`, `cornerProfile p`, `zigguratSteps n`, `rayDensity ρ`, `raySpread σ`,
`rayReach λ`, `wingDelta Δw`, `wingSweep ω`, `fractalDepth d`, `fractalRatio r`.

Signature = `{1, 0, 2, 1, 1, 1, 0, 1, 0, 0.45}` — matching the current literals
(two-stair ziggurat corners, 11/13/15-ray fans, four chevron wings, no recursion).
Grouped for the UI as Corners / Sunbursts / Wings / Recursion.

## 3. Consolidated pattern model

**Title cards** — one pattern list, all visible as buttons:

| Pattern | Source | Notes |
|---|---|---|
| Sunburst (Authored) | ours | The delivered frame; genome-responsive; golden-snapshot protected |
| Fractal | ours | Cantor-cut rails on φ-inset rings |
| Rosette | ours | Superellipse × harmonic rose |
| Arcade | ours | Recursive stepped bays |

Over the Sunburst pattern, the ported **Design** gallery applies as genome settings —
Original, Skyscraper, Moderne, Jazz Fan, Cathedral, Filigree, plus 6 deterministic
Kronecker-sequence variations. These are settings of one parameter set, not new engines,
so they are shown as a second button row rather than a stepper.

**Screen border** — `1/`'s viewport frame with a `Show border` toggle and a single
`Border weight` slider (0–1) that adds nested rules and reeding.

## 4. Genome is real, not cosmetic

Genes thread into `buildCoreFrameSpecs` and the primitives:

- `addCutOctagon`: `cut × κ`; `p = +1` rounds the corner, `p = −1` notches it inward, `0` is today's chamfer.
- `addZigguratFrame`: total setback preserved; `s = (2·stepSize)/n` so `n = 2` reproduces today's points exactly.
- `addSunburstFan`: ray count stays odd under `ρ`; spread `× σ`; reach `× λ`.
- `addChevronWings`: count `base + Δw`; depth `× ω`.
- Rules: at `d > 0` the split rules become Cantor-dashed segments scaled by `r` per level (reusing our existing `cantorSegments`).

Because every default equals today's literal, the authored golden snapshot must still
pass unchanged. That test is the preservation contract.

## 5. Studio interaction contract

- Panel is a small overlay, `frame-studio__panel`, dismissible via an `X` button.
- When dismissed, a compact `Frame Studio` reopen button appears in the header cluster.
  Dismissing the studio no longer hides the timeline, and the HUD eye keeps working independently.
- `Fine-tune proportions` is collapsed on load; opening it reveals the gene sliders grouped
  Corners / Sunbursts / Wings / Recursion. Moving any gene slider marks the design `Custom`.
- `Reset to original` restores pattern, design, level, detail, and border state.
- Defaults are unchanged from ADDENDUM-009: Sunburst/Authored, level 2, detail 0.5, border hidden.
- State stays client-memory only; nothing persists.

## 6. Validation plan

`npx tsc --noEmit`, `npm test` (golden + new genome/edge-border tests), `npm run build`.
No browser in this sandbox, so shader compilation and on-screen framing remain unverified.
