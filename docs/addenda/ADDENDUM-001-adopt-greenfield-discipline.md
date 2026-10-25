# ADDENDUM-001 — Adopt greenfield coding discipline

**Date:** 2026-10-23  
**Relates to:** `CLAUDE.md` (new); BUILD_PROMPT §2 (stack/constraints), §9 (NFR)  
**Decision Context:** DC-002

## 1. What was decided

1. `GREENFIELD.md` from `wshyang/greenfield@8ba7402` is adopted as this repository's
   standing discipline, contextualised in `CLAUDE.md`. Sections that presuppose a
   server or database are marked N/A with the reason rather than silently dropped.
2. `docs/BUILD_PROMPT.md` is the frozen base spec; this register carries every
   subsequent decision.
3. Vitest is the unit-test runner. `vitest.config.ts` is separate from
   `vite.config.ts` because the project rule forbids editing the latter and the
   single-file/Tailwind plugins are irrelevant to node tests.
4. Golden behaviour is protected by **data snapshots of generated frame geometry**,
   not pixel snapshots (no browser in the build sandbox).
5. `reference/` is git-ignored; it holds external checkouts only.

## 2. Why

- The frame-intricacy work (ADDENDUM-002) is a refactor of hand-authored geometry into
  a mathematical generator. Without a frozen golden snapshot taken *before* the
  refactor there is no way to prove the current look survived. The discipline has to
  land first.
- The rest of greenfield's value (addenda, function limits, honest validation) costs
  little now and a lot to retrofit.

## 3. Deferred items (explicit, with un-defer triggers)

| Item | Status | Trigger to un-defer |
|---|---|---|
| Playwright e2e with video-on | Deferred | First time a browser is available in CI or a second interactive feature ships |
| Dockerfile / Dockerfile.dev / cloudflared | Deferred | First deployment target is named |
| SHIP-HATS inert pipeline files | Deferred | Project is slated for a GovTech environment |
| `data-testid` on pre-existing controls | **Verified complete** (ADDENDUM-042) | Backfill finished; `src/app/testidCoverageStatic.test.ts` now fails on any control without an id, so it cannot regress |

## 4. Known debt against the function/file limits

Measured at adoption. Do not grow these; split when touched substantively.

| File | Issue | Plan |
|---|---|---|
| `src/webgl/decoFrames.ts` (~980 LOC) | Over 800-LOC hard limit; `buildFrameSpecs` is one ~330-line function | ADDENDUM-002 extracts the pure grammar into `src/webgl/frameGrammar/` (barrel) and leaves only the Three.js rig in `decoFrames.ts` |
| `src/webgl/GatsbySceneManager.ts` (~600 LOC) | `animate()` is ~150 lines | Split timeline math into a pure `sequenceTiming.ts` on next touch |
| `src/webgl/decoTypography.ts` (~700 LOC) | `createExtrudedDecoTextMesh` ~300 lines | Split rasteriser / normal-synth / mesh on next touch |
| `src/App.tsx` (~430 LOC) | Component owns playback logic | Extract `usePlaybackControls` hook on next touch |

### Update (ADDENDUM-032, 2026-10-25) — where those four rows ended up

| File then | Now | Outcome |
|---|---|---|
| `src/webgl/decoFrames.ts` (~980 LOC) | `src/features/art-deco-frame/` (grammar split into `engine/frameGrammar/`) | **Resolved** — ADDENDUM-002/014; the largest file in the tree is 729 LOC |
| `src/webgl/GatsbySceneManager.ts` (~600 LOC) | `src/features/premiere/scene/GatsbySceneManager.ts` (729 LOC) | **Deferred on purpose** — deleted when the R3F screenshot gate passes (ADDENDUM-026 §5) |
| `src/webgl/decoTypography.ts` (~700 LOC, one ~300-line function) | `src/features/art-deco-frame/render/decoTypography.ts` (381 LOC, six functions) | **Resolved** — split in ADDENDUM-032, guarded by a pre-refactor golden digest |
| `src/App.tsx` (~430 LOC) | `src/App.tsx` (7 LOC) | **Resolved** — ADDENDUM-014's feature composition |

The limits themselves are now enforced by `src/discipline.test.ts` (ADDENDUM-032)
rather than by this paragraph: any new function over 50 lines, 3 parameters or 3 levels
of nesting fails the build unless it is recorded, and the record may only shrink.

## 5. Practical impact

- `npm test` is now a required gate alongside `tsc` and `build`.
- Every PR/commit that changes behaviour needs an addendum row.
- Commits made from this sandbox carry the caveat *browser not available*.

## 6. Validation performed

- Documentation only in this addendum's commit; no source change. `tsc`/`build`
  unaffected.
