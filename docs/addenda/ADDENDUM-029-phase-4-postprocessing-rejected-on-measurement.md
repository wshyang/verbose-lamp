# ADDENDUM-029 — Phase 4 closed: `@react-three/postprocessing` is rejected on measurement, not on taste

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-022 §2 and §8 (the optional Phase 4 A/B and its zero-failure gate), ADDENDUM-027 §5 (the port's deviating choices), ADDENDUM-028 §5.4 (where the measurement was taken), CLAUDE.md §2.
**Status:** A/B run, rejected, dependencies removed. No production code changed.

## 1. The decision

ADDENDUM-022 §8 listed one optional item: replace the composer chain with `@react-three/postprocessing`'s `<EffectComposer>`/`<Bloom>`, adopt it **only with zero screenshot failures**. ADDENDUM-027 shipped the port on three's own `EffectComposer` because that was the only way to honour "reuse the passes, don't rewrite them", and left the A/B open because there was no browser to run it in.

ADDENDUM-028 got a browser. So the A/B was actually built:

- `@react-three/postprocessing@3.0.5` + `postprocessing@6.39.5` (both peer-compatible: react ^19, three ≥0.156, fiber ^9).
- The nitrate pass re-expressed as a `postprocessing` `Effect` — the app's GLSL, unchanged, with `mainImage` as the entry point and `inputBuffer` as the sampler.
- `<Bloom mipmapBlur intensity={0.56} radius={0.64} luminanceThreshold={0.78} luminanceSmoothing={0.1} />` — the same three numbers the premiere has always used.
- A half-float composer buffer, so the two chains at least started from the same precision.

## 2. What it measured

Same browser, same build of everything else, `?freezeAt=11.28`, hidden HUD, 1440×900, full page:

| Metric (vs the shipped chain) | Value |
|---|---|
| Mean absolute channel delta | **15.78 / 255** |
| Channel values off by more than 6 | 59.5% |
| Channel values off by more than 12 | 36.8% |
| Pixels differing by more than the gate's 51-level threshold | **9.63%** (124,847 of 1.3 M) |
| Maximum channel delta | 255 |

`maxDiffPixelRatio` is `0.01`. The variant is **ten times over it**, and the cause is visible rather than statistical: `postprocessing`'s bloom is a mipmap blur, `UnrealBloomPass` is a five-level down/up sample with a different falloff, so the halo around the gate bars, the chevrons and the beveled type is wider and flatter. ADDENDUM-022 §2 predicted exactly this ("its bloom is a different algorithm … would visibly change the glow") and it was right.

Tuning was not attempted. Even if a parameter set could be found that matched one frozen frame, it would be a different algorithm approximating the shipped look, and the gate exists to keep the look; a parameter search until the screenshots agree is re-baselining by another name.

## 3. What was done with the result

Nothing was merged. The two dependencies were removed, `package.json` and `package-lock.json` are byte-identical to the commit before the experiment, and the throwaway tree lived in `/tmp/variant` on its own port. The insight worth keeping is written down here and in ADDENDUM-028 §5.4.

## 4. What this closes, and what it does not

- **Closed:** the `postprocessing` half of Phase 4. Re-open only if the visual contract itself changes (its own addendum) — not to revisit a measured 10× miss.
- **Closed by ADDENDUM-027 §5:** the drei half. drei was installed per the plan, then dropped for three's own `OrbitControls`; nothing in Phase 4 needs it back.
- **Closed by ADDENDUM-030** (was: still open, deliberately): Playwright shots of `features/avatar-studio`'s cut-out and gilding output. That is new test surface rather than a swap, it needs sample photographs as fixtures, and it is not a port question. It belongs in its own addendum.
- The numbers from the shipped chain — 95 draws and 16 clears per frame, identical to the pre-port build — are in ADDENDUM-028 §5.3, and they are the reason this rejection is a rejection of the *chain*, not of the port: the port costs no extra GPU work.

## 5. Validation

No source change to validate. The tree after this addendum is the tree ADDENDUM-028 validated: `tsc` clean, `npm test` 1,200 green at 100% on all four measures, `npm run build` clean, e2e flows 8/8 on desktop and mobile, likeness 12/12 recorded and 12/12 replayed.
