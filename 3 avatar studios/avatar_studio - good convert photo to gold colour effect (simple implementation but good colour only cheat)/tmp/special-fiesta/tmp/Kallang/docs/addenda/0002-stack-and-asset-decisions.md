# Addendum 0002 — Stack, dedup result, and primary-backdrop choice

- **Date:** 2026-10-17 · **Relates to:** spec §2–§6
- **Dedup (deliverable 1):** 13 files → 11 unique by SHA-256. Exact-duplicate
  pairs `…1t2nkv… (1).jpeg` and `…n64hnk… (1).jpeg` deleted by
  `tools/organise_sources.py`. Two *near*-duplicate families verified by
  pixel-diff and kept as variants: (a) frontal backdrop — sunset sky vs
  magenta key sky (100% of sky pixels differ, ~12% elsewhere: relighting);
  (b) daylight backdrop — clean vs populated (9.8% of pixels differ:
  baked-in people/boats). Evidence: hashes in `docs/asset-manifest.json`.
- **Primary stage:** `kallang-day-clean.jpeg`; placement/scale guided by
  `kallang-day-populated-reference.jpeg`. The frontal-viewpoint backdrops are
  filed but not staged in v1 (different geometry would double placement work).
- **Stack:** Vite + TypeScript, framework-free Canvas 2D renderer. A scene
  graph of small object modules beats DOM sprites for ~100 animated elements,
  screenshot QA, and deterministic frames; no UI framework is needed for one
  page, which keeps the bundle and test surface small (YAGNI, CLAUDE §7).
  Python (Pillow/NumPy/OpenCV) for the offline asset pipeline only.
- **Single-source contracts:** `src/generated/sprite-manifest.json` (sprites)
  and `src/generated/anchors.json` (composite stitch points) are read by both
  the TS app and the Python QA previewer, so a tuned anchor renders
  identically in QA stills and in the browser.
- **Assumptions needing no user input (delegated in the brief):** animation
  loop selection, scene population density, and lab-vs-scene presentation are
  agent decisions per the brief's deliverables 4–5. Tagged decisions remain
  revisable via addenda.
