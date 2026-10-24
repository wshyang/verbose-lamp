# Addendum 0009 — Layered backdrops (sky + scene) and sky-corruption cleanup

- **Date:** 2026-10-17 · **Relates to:** spec §2/§5, CLAUDE §12.1–12.2
- **Provenance:** `main` commit `357c3fb` ("Added more base images") added
  scene plates for dawn/day/dusk and five sky gradients. All eight are
  2752×1536, SHA-256-distinct from the original 11 sources; inducted into
  `src/images/backdrops/` as `kallang-scene-{dawn,day,dusk}.jpeg` and
  `sky-{early-morning,late-morning,afternoon,late-afternoon,dusk}.jpeg`
  (provenance in docs/asset-manifest.json, now 19 images).
- **Corruption (measured):** the user flagged `backdrop dawn (sky
  corruption).jpeg`; induction inspection found the dusk plate has the
  same defect. Connected-component analysis over the magenta key: the
  real scene is exactly one component touching the bottom edge with
  bbox (0,385,2752,1151) on **all three** plates (identical geometry —
  every measured placement/water map stays valid across themes), while
  dawn carries a disconnected mirrored skyline strip at rows 3–355
  (477k px) and dusk at rows 29–354 (581k px), each separated from the
  scene by a pure-magenta band (rows ~350–387). Day is a single clean
  component.
- **Cleanup** (`tools/prepare_backdrops.py`, also run from
  `extract_sprites.py` publish step): keep only the bottom-touching
  component, reset the rest to pure magenta; then force everything above
  the kept scene's per-column skyline (from dilated grouped labels, so
  real edges are never shaved) to magenta — the dawn ghost is
  translucent, so 71k of its faintest pixels key to partial alpha and
  escape the component mask. Clean plates are unchanged (day: ghost 0,
  residue 0). Plates then go through the standard `key_magenta` pipeline
  and are published as transparent PNGs
  (`public/backdrops/kallang-scene-{dawn,day,dusk}.png`, ~4 MB each);
  skies publish verbatim.
- **Renderer:** `renderScene` now takes `BackdropLayers {sky, scene}`
  and draws sky → scene plate → entities. `BACKDROP_THEMES` composes the
  3 plates × 5 skies into dawn/morning/day/evening/dusk; `?theme=` URL
  param + a `controls__theme` select switch live (stale-load guarded).
  QA stills support `--theme=`. The default stage is the day theme; the
  original `kallang-day-clean.jpeg` remains published.
- **Validation:** Vitest 30 (theme registry, draw order), pytest
  (synthetic ghost removal, clean-plate no-op, published-layer alpha
  checks), QA stills for dawn/day/evening/dusk inspected: no ghost
  skyline, no magenta fringe, all placements register on every plate.
