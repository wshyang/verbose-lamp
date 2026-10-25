# Addendum 0001 — Adopt wshyang/greenfield as this repo's coding discipline

- **Date:** 2026-10-17 · **Relates to:** CLAUDE.md, spec §8
- **What was decided:** `GREENFIELD.md` from `wshyang/greenfield` (cloned
  2026-10-17, HEAD `8ba7402` "Added FDS Builder MD prompt") is adopted as this
  repo's `CLAUDE.md`: template body verbatim, preceded by a project
  contextualisation block filling its placeholders, and followed by a new
  project-specific §12 (asset discipline). `FDS_BUILDER.md` from the same repo
  informed one habit (tagging unconfirmed content `[DRAFT — {source}]`); its
  bot-scope rules (e.g. "no diagrams", FDS-only refusals) are *not* adopted —
  they govern that spec-builder bot, not this codebase.
- **Why:** The user directed adoption ("we adopt greenfield md into our repo
  as our coding discipline"); GREENFIELD §0 prescribes exactly this
  copy-then-contextualise path.
- **Practical impact:** Living spec + addenda (§1), tests-first with no mocks
  of the layer under test (§2), function-design limits (§7), honest
  validation reporting (§8), container contract (§10.1) and inert SHIP-HATS
  files (§10.3) govern all work here. DB/ORM/auth sections are dormant (no
  backend) but their "no hand-written second mapper / one source of truth"
  spirit is applied to manifests and anchors.
