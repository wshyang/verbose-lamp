# Addendum 0010 — Dawn/dusk sprite recolouring (backend loader)

- **Date:** 2026-10-17 · **Relates to:** addendum 0009 (layered backdrops)
- **Problem:** sprites were painted for noon light; on dawn/evening/dusk
  backdrop themes (clouds especially) they glared against the plates.
- **Measured grades:** the three scene plates share identical geometry,
  so per-channel percentile affines day→dawn and day→dusk over 2.83M
  scene pixels give the relighting the artist applied: dawn = luminance
  ×0.94, saturation ×0.76, warm shift (R median ×1.34, G ×0.89, B ×0.82);
  dusk = luminance ×0.44, gains R .56 / G .50 / B .57, saturation ×1.17.
  Sprite grades soften these slightly (subjects stay readable):
  dawn sat .85, gain (1.05,.95,.84), offset (10,2,0);
  dusk sat 1.05, gain (.64,.58,.72), offset (3,3,8).
- **Backend loader:** `tools/recolour_sprites.py` loads every sprite
  from the day manifest, applies the grade (alpha and dimensions
  untouched), writes `public/sprites-{dawn,dusk}/` (313 sprites each,
  16.9/15.8 MB) and `src/generated/sprite-manifest-{dawn,dusk}.json`.
  Runs at the end of `extract_sprites.py` (after arm repair) and via
  `npm run assets:recolour`. Generation ~70 s; fully deterministic.
- **Runtime:** each `BackdropTheme` carries a `spriteVariant`
  (dawn→dawn, morning→day, day→day, evening→dusk, dusk→dusk). The theme
  switcher loads the matching manifest, rebuilds scene+lab from it with
  the same seed, and swaps atomically (stale-load guarded). QA stills
  load the themed store too (`loadNodeStore(variant)`).
- **Validation:** Vitest 32 (variant mapping; themed manifests mirror
  day ids/dimensions/URLs and files exist), pytest (alpha/dims preserved,
  dusk darkens, dawn warms; published dragon-boat alpha identical),
  `qa/recolour-montage.png` + dawn/evening/dusk scene stills inspected:
  clouds, tents, people and boats now share each plate's light.
