# Addenda register (GREENFIELD §1 — sequential, append-only)

Each entry: what was decided, why, which spec section it relates to, impact.
Written in the same change as the decision.

## A-001 — GREENFIELD adopted with a TypeScript/PGlite stack
- **What:** `CLAUDE.md` resolves GREENFIELD's placeholders to: TypeScript,
  Node `node:http`, Drizzle ORM, PGlite, React+Vite, Vitest, npm.
- **Why:** PGlite is a user requirement; Drizzle is the ORM that speaks to it,
  giving the one-casing/no-hand-mapper rule (§4) a real enforcement point;
  a bare HTTP handler keeps the app testable without a socket (§2).
- **Relates to:** GREENFIELD §§0–11 (all checklist items answered in CLAUDE.md).
- **Impact:** All future stack suggestions must argue against this entry.

## A-002 — Placeholder slots, never predicted winners
- **What:** Match slots are symbolic SlotSources (`winnerOf`, `loserOf`,
  `rankOf`, `recordPool`, `bye`, concrete `team`). Simulators use seed/team
  placeholder refs; no RNG or predicted winner exists anywhere in the codebase.
- **Why:** User requirement; also FDS P-11 (nobody advances on a forecast).
- **Relates to:** SPEC `#obj-match`; problem spec P-11.
- **Impact:** Resolution of a slot to a real team is a *display/desk* concern
  after finalisation, never a generator concern.

## A-003 — Generalised wire shape, frontend specialisation
- **What:** The backend stores/serves one generic graph for every mode
  (`mode` is data, not schema). All mode-specific naming, colouring, grouping
  and bracket layout lives in `frontend/src/lib/formatUi.ts`.
- **Why:** User requirement; keeps the core engine mode-agnostic (the FDS
  finding that the plain day must not carry the structured day's burdens).
- **Relates to:** SPEC Relationships; problem spec §1 finding 1.
- **Impact:** Adding a format = one generator + one UI metadata entry; zero
  backend changes.

## A-004 — No auth in v1; negative tests are scoping/state negatives
- **What:** No users/sessions (FDS assumption H1: trusted desk, in the room).
  GREENFIELD §2's "wrong-party session" negative becomes: wrong-tournament
  resource ids, unknown ids, and forbidden lifecycle transitions (all 4xx-tested).
- **Why:** Inventing accounts would solve a problem the FDS explicitly scopes out.
- **Relates to:** GREENFIELD §2; SPEC Tournament.
- **Impact:** If auth lands, actors must be real rows and every route gains a
  true wrong-party test in the same change.

## A-005 — Playwright e2e deferred; unit/integration carry the gate
- **What:** No browser e2e suite in v1. The 100% Vitest gate (backend integration
  on real PGlite + frontend unit with only the API boundary mocked) is the gate.
- **Why:** Scope/time; GREENFIELD §3's video-on default is recorded here so it
  is applied the day Playwright lands, not rediscovered.
- **Relates to:** GREENFIELD §§2–3.
- **Impact:** A live-server smoke check (build + boot + curl + preview) is run
  per change until e2e exists.

## A-006 — Formats beyond the source simulators
- **What:** Added `double-elimination` (4/8 teams); `ironman` kept as
  SE-topology + enforced zero rest with zero-rest flags (its source file is a
  scheduling diagnostic, not a topology); generators generalised where the
  originals hardcoded field sizes, with loud validation otherwise (P-12).
- **Why:** User asked to identify more match types; honesty about ironman.
- **Relates to:** `docs/ASSESSMENT.md` §1/§3.
- **Impact:** Format registry is the single list; UI switcher derives from it.

## A-007 — Points are an append-and-void ledger
- **What:** Points exist only as PointsEntry rows. Finalise writes them;
  mistakes are voided with a reason; direct desk awards are entries with
  `matchId = null`. Nothing edits or deletes points.
- **Why:** User requirement ("points mistakenly awarded can be voided") + P-09
  (correction without fiction).
- **Relates to:** SPEC `#obj-points-entry`.
- **Impact:** Standings are a pure function of matches + active entries and
  can be recomputed identically on backend and frontend.
