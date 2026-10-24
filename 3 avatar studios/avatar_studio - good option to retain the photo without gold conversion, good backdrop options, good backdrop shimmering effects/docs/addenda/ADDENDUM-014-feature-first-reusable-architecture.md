# ADDENDUM-014 — Feature-first reusable architecture

**Date:** 2026-10-24 · **Relates to:** BUILD_PROMPT §2, §7, §9; CLAUDE.md §5, §6
**Status:** Implemented — visual check pending.

## 1. Decisions

- Organize product behavior under `src/features/<name>/`, shared controls under
  `src/shared/`, and host composition under `src/app/`. Keep `src/App.tsx` as the
  Vite entry wrapper.
- Expose feature APIs through each feature's `index.ts`; features do not import
  from `src/app/`, and cross-feature imports use the public barrel.
- Keep `GatsbyPremiere` as the host composition. Move premiere state, sequence,
  frame grammar/rendering, frame studio, QR generator, research, and title editing
  into their owning feature modules.
- Add reusable `Button`, `Dialog`, `IconButton`, and `RangeInput` primitives in
  `src/shared/ui/`; these own interaction semantics, not page layout.

## 2. Why

The Gatsby premiere is one host for the codebase, not the boundary of reusable
product behavior. Feature ownership lets a separate surface compose the frame
studio, QR generator, research dialog, or title customizer without depending on
the cinema timeline or Three.js scene.

## 3. Practical impact

- `src/App.tsx` delegates to the app barrel; feature modules own their public
  exports and shared interaction controls.
- File ownership is described in `docs/ARCHITECTURE.md`. The gilded-portrait
  feature follows this structure and remains opt-in rather than being mounted by
  the Gatsby host.
- No new runtime dependency or persisted state is introduced by this boundary.

## 4. Validation

The checkout registered this architecture as ADDENDUM-014 but omitted its target
file. This record restores that target. At restoration, the complete checkout passed
`npx tsc --noEmit`, `npm test` (18 files, 159 tests), and `npm run build`; see
ADDENDUM-016 for gilded-portrait details. No browser verification was performed.