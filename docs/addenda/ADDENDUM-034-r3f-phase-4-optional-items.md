# ADDENDUM-034 — R3F Phase 4: Optional Items, Evaluated Behind the Gate

**Status:** Completed. The Avatar Studio browser shots shipped; the pmndrs
Bloom replacement and drei helper substitutions were evaluated and not
adopted. This closes ADDENDUM-022 §8.

## 1. Avatar Studio Playwright shots — implemented

`e2e/avatar-studio.spec.ts` opens the real Gilded Avatar Studio, loads the
bundled Wei_Ling sample, waits for the ready state, and baselines two output
canvases in each Playwright project:

- `wei-ling-cut-out.png` — natural colour, cut out over the default enamel
  panel with the gold outline and medallion frame.
- `wei-ling-gilded.png` — the same fixed composition after choosing
  **Gild subject**.

The two third-party inference modules are intercepted at the browser network
boundary with small deterministic modules. They return a fixed face
detection and a scanline-profile matte traced to Wei_Ling’s hair, shoulders
and torso in the bundled 478×640 portrait. That is deliberately the only
fake: the JPEG decode, face-crop mathematics, matte cleanup, square resample,
enamel backdrop, gold outline, frame, preview canvas and full gilding pipeline
are the production code. It makes the shots reproducible offline and immune
to CDN or model-version drift, while the existing unit suites continue to
test the real loader adapters against injected fake pipelines. The test must
not be read as evidence about MODNet or BlazeFace inference quality.

Reduced-motion emulation freezes the shimmer preview on its still frame (the
same pixels the PNG export uses), so the screenshots are stable rather than
sampling the 110 ms glint loop.

## 2. `@react-three/postprocessing` Bloom — A/B rejected

The current three.js chain remains:

`RenderPass → UnrealBloomPass (0.56, 0.64, 0.78) → cinema nitrate → OutputPass`

For the A/B, `CinemaComposer` was temporarily rebuilt with
`@react-three/postprocessing@3.2.2`: mipmap `Bloom` at intensity 0.56,
radius 0.64, luminance threshold 0.78 and smoothing 0.01; the nitrate shader
ported to a pmndrs `Effect` in an unmerged pass; then ACES tone mapping. The
experiment built at 2,502.05 kB (production after revert: 2,430.79 kB).

A first attempt using a raw `ShaderPass` rendered black and was discarded as
an invalid comparison. With the idiomatic `Effect` port rendering correctly,
four bloom-sensitive desktop shots failed against the unchanged baselines:

| Shot | Different pixels |
|---|---:|
| `act1-nitrate-opening` | 0.05 |
| `act1-monogram-hold` | 0.24 |
| `act5-hero-hold` | 0.08 |
| `act5-finale-bookend` | 0.21 |

The likeness tolerance is 0.01 and ADDENDUM-022 permits adoption only with
zero screenshot failures. The dependency and composer experiment were fully
reverted; no baseline was changed to accommodate it.

## 3. drei helpers — audit, no qualifying substitution

No helper was adopted:

- `GoldDust` still needs a hand-built `BufferGeometry` for its seeded
  positions plus `aScale`/`aPhase`, and the same custom shader and material-ref
  uniform writes. drei `Points` would only wrap the host element without
  removing the output-defining code.
- `BallroomEnvironment` is a bespoke PMREM scene; drei `Environment` files or
  presets would change reflections.
- Searchlights are fake volumetric planes and canvas gradients, not drei
  spotlights; the deco typography is a custom raster/extrusion pipeline, not
  drei text geometry.
- OrbitControls was already the one appropriate drei helper and remains in use.

## 4. Browser provisioning through npm — researched and pinned

Three npm-adjacent routes were compared for a sandbox that can reach the npm
registry but not browser CDNs:

- Playwright’s supported installer downloads version-matched browsers from
  Microsoft’s CDN; `@playwright/test` itself does not bundle the binary in
  its npm tarball. The `@playwright/browser-chromium` helper still performs
  a browser download during installation.
- Puppeteer’s `@puppeteer/browsers` also downloads Chrome for Testing into a
  cache rather than carrying it in the npm package.
- `@sparticuz/chromium` is the exception: its npm tarball carries a
  Brotli-compressed Linux Chromium and `executablePath()` extracts it. That
  is why the existing sandbox extractor works under an npm-only allowlist.

The extractor now pins `@sparticuz/chromium@153.0.0`, matching the committed
baselines’ Chromium 153.0.8010.0. It remains a `--no-save` sandbox tool, not
an application dependency. This is still an `executablePath` substitution,
not Playwright’s bundled-browser guarantee; on a normal machine the supported
setup remains `npx playwright install chromium`, and the baselines remain
Linux/SwiftShader evidence rather than a real-GPU aesthetic judgement.

References:

- Playwright browser management: https://github.com/microsoft/playwright/blob/main/docs/src/browsers.md
- Playwright library/browser packages: https://playwright.dev/docs/library
- Puppeteer Browsers API: https://pptr.dev/browsers-api
- `@sparticuz/chromium`: https://github.com/Sparticuz/chromium

## 5. Final browser-suite repair found by the gate

The complete e2e run initially produced 39 passes and one mobile flow
failure. The test expected the timeline scrubber to remain exactly `0` after
Replay, but Replay correctly resumes playback; by the time the slow software
renderer was polled, the clock had advanced. The assertion now proves the
clock restarted near zero instead of trying to observe one frame. The flow
suite then passed 12/12.

## 6. Evidence

- `npx tsc --noEmit` ✓
- `npm test` — 102 files / 697 tests ✓
- `npm run test:coverage` — 100% on the enforced pure-layer scope ✓
- `npm run build` — 2,430.79 kB single-file bundle (gzip 1,077.40 kB) ✓
- Complete browser run (`npx playwright test --workers=2`) — 40/40: 12 flows,
  26 likeness shots against the committed baselines (24 originals plus the
  two brass shots from ADDENDUM-032), and the two Avatar Studio tests ✓

## 7. Remaining deliberate non-items

No required ADDENDUM-022 work remains. Historical explicit deferrals whose
triggers still have not fired—deployment packaging in ADDENDUM-001 and the
optional spectacle audio in ADDENDA-020/024—were not silently converted into
scope. Human visual acceptance on a real GPU remains desirable, as recorded
in ADDENDA-030–032.
