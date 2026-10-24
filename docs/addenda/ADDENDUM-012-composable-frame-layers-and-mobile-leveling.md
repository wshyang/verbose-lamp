# ADDENDUM-012 — Composable frame layers and mobile auto-level framing

**Date:** 2026-10-24 · **Relates to:** ADDENDUM-004/005, ADDENDUM-009/011; BUILD_PROMPT §3, §4, §5, §7, §9
**Status:** Implemented — visual verification pending.

## 1. Decisions

### Frame composition

- `FrameFormula.source` remains the selected foundation pattern. `Authored` is still the fresh-load default and stays selectable alongside Fractal, Rosette, and Arcade.
- The existing Authored design gallery, proportion genes, and Detail control remain available. The fixed Authored foundation keeps its original geometry; its level control is visibly disabled. Proportion genes are shown only while Authored is the foundation because the other generators do not consume those genes.
- Fractal, Rosette, and Arcade can each be enabled as independent decorative layers with their own level (1–4). The foundation and any combination of the other layers render together; Detail remains shared.
- Decorative layers omit their primary perimeter rail and do not add a second monogram. Selecting a pattern as the foundation disables that same pattern as an overlay, and the geometry builder also ignores a duplicate source defensively.
- Reset restores Authored / Original, Film Baseline detail, all layers off, and the hidden screen border. State remains in memory only.

### Mobile framing and panel hierarchy

- A viewport is treated as mobile when a coarse pointer is available and its smaller dimension is at most 1024 CSS pixels. This uses input capability and viewport size rather than user-agent sniffing.
- Mobile card rigs scale uniformly with portrait aspect, down to 30% of their desktop scale, while the existing aspect pullback is preserved. In Cinema mode the camera stays centered and world-up, with pointer drift and roll removed; resize/orientation changes recompute the fit. Orbit mode remains directly user-controlled.
- The app uses dynamic viewport height so mobile browser chrome changes do not leave the scene fitted to a stale 100vh.
- Frame Studio and its wrapper use the highest interface layer (`z-index: 70`), ahead of the bottom timeline. The panel is width- and height-bounded and scrolls internally when its expanded options exceed the viewport.

## 2. Why

The selected foundation preserves a clear, configurable base state while optional accents make patterns composable instead of mutually exclusive. Removing duplicate primary rails keeps the combination readable and avoids a stack of competing frames. Mobile scaling and a level, centered Cinema camera keep the typography and ornaments together in a stable portrait composition. The studio's stacking order ensures its controls remain usable when the timeline occupies the same screen area.

## 3. Practical impact

- The default Authored geometry remains protected by the existing golden snapshots. New tests cover the no-layer baseline, combinations, duplicate prevention, the single authored monogram, and a 5,000-point cap for all three level-4 overlays at Baroque detail.
- Base pattern selection and each overlay level are separate controls. The Authored proportion genes continue to affect the foundation; decorative geometry is composed before the shared intricacy pass.
- Mobile auto-leveling is an automatic Cinema-mode framing rule, not a device-orientation permission or a user setting. The screen border stays camera-attached and viewport-sized.
- Geometry equality now includes the proportion genome and layer list, so those edits trigger frame rebuilds rather than being mistaken for an unchanged style.

## 4. Validation

`npx tsc --noEmit` passed. `npm test` passed (6 files, 111 tests, including the unchanged golden snapshots). `npm run build` passed (`dist/index.html` 915.80 kB / 246.40 kB gzip).

**No browser is available in this sandbox.** Visual verification remains pending for portrait/landscape mobile composition, camera roll/scale in Cinema mode, expanded Frame Studio overlap with the timeline, and shader/rendering behavior with multiple layers.