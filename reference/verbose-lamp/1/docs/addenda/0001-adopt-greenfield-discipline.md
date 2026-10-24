# 0001 — Adopt Greenfield as repository coding discipline

- Date: 2026-10-23
- Status: Accepted
- Related spec: all; `docs/GATSBY_TITLE_SEQUENCE_FDS.md`
- Upstream: `wshyang/greenfield@8ba74027be5fad41e48cadde82cc0120d628b109`, vendored at `vendor/greenfield` with `PROVENANCE.md`

## Decision

Adopt the Greenfield template as this repository's standing engineering discipline, contextualised in `/CLAUDE.md`, and maintain a sequentially numbered addenda register in `docs/addenda/` indexed by `docs/ADDENDA.md`.

## Why

The project had a product contract (`FDS`) and no recorded rules for test discipline, function/module limits, validation honesty or addendum workflow. Greenfield exists to prevent exactly that drift. The user explicitly requested adoption.

## Contextualisation (upstream section → local decision)

| Upstream | Local decision | Reason |
|---|---|---|
| §1 addenda | Adopted; base spec is the FDS; addenda are `NNNN-*.md` | Required by user |
| §2 tests first, no mocks | Adopted for pure logic with Vitest (Node); real invariant tests, no mocks needed | Geometry is deterministic and DOM-free |
| §3 test layout/determinism | Adopted; co-located tests, committed fixtures, no randomness | Small frontend-only repo |
| §4 DB/ORM/soft-delete | **Not applicable** | No database, server or persistence |
| §5 migrations/schema | **Not applicable** | No schema |
| §6 conventions/test ids | Adopted: `data-testid` contract, no internals in UI copy | Applies to client UI |
| §7 function/module design | Adopted; 800-LOC limit enforced on touched files | Existing debt recorded |
| §8 validation honesty | Adopted; commits carry validation trailers | WebGL cannot be unit-tested here |
| §9 local env | Adapted: npm scripts only; no env/secrets | No backend/config |
| §10 deployment/SHIP-HATS | **Not applicable**: static single-file artefact, host serves `dist/index.html` | No container/server/port/secrets |
| §11 checklist | Adopted as `/CLAUDE.md` §12 | — |

## Impact and notes for future readers

- `CLAUDE.md` is authoritative for how changes are made here. `vendor/greenfield` is reference only and must not be edited.
- The FDS remains the product contract; addenda record decisions that fill gaps or deviate.
- Existing technical debt acknowledged at adoption: no unit tests; `decoFrames.ts` (978 LOC) and `decoTypography.ts` (835 LOC) exceed the 800-LOC hard limit. Both are scheduled for mechanical split when next touched.
- Test runner additions must not breach the single-file runtime constraint; Vitest is a dev dependency only.

## Verification

- Repository initialised with git; baseline committed before adoption (`8884bf7`) as required by the user's commit protocol.
- No runtime behaviour changed by this addendum.

## Rollback

Revert the addendum commit and remove `CLAUDE.md`; the baseline app is unaffected.
