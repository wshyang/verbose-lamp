# ADDENDUM-030 — The likeness gate runs: sandbox-captured baselines and self-hosted fonts

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-022 §0.5–0.6 (likeness gate, baseline
capture), ADDENDUM-024 §9 (font self-hosting), ADDENDUM-025/026 (pending visual
checks), ADDENDUM-027 §5, ADDENDUM-029 §5 caveat; CLAUDE.md §2, §3, §5.
**Status:** Implemented.

## 1. What was decided

The Playwright likeness gate has **run**, in the sandbox, against a real
Chromium. The 24 baselines (12 shots × desktop/mobile) are committed under
`e2e/likeness.spec.ts-snapshots/`, and a full non-update run passes **36/36**.

Getting a browser at all was the work. The Playwright CDN is unreachable from
the sandbox, but `@sparticuz/chromium` ships Chromium 153 **inside its npm
tarball**, and the npm registry is reachable. Two wrinkles, both handled
without touching `vite.config.ts` or the app:

| Piece | Where |
|---|---|
| Sandbox browser | `npm install --no-save --ignore-scripts @sparticuz/chromium` ( deliberately kept out of `package.json` — sandbox-only tooling) |
| NSS libraries | The package only unpacks them on Amazon Linux; `e2e/support/setupSandboxChromium.mjs` extracts its `al2023.tar.br` anywhere and prints the two exports |
| Config | `playwright.config.ts` honours `PW_CHROMIUM_PATH` / `PW_CHROMIUM_LIB`; defaults are unchanged, so `npx playwright install chromium` remains the normal path |

Two latent config gaps fell out immediately: the config never set `baseURL`,
so every `page.goto('/')` was an invalid URL (the gate had truly never run),
and the default 30 s timeouts are fiction under SwiftShader — shader
compilation plus two stability captures take minutes, so the gate now allows
180 s per test and 120 s per screenshot.

**Fonts are self-hosted.** The six families (Cinzel Decorative, Cinzel,
Cormorant Garamond, Jost, Marcellus, Poiret One — 15 latin-subset files via
`@fontsource/*`, in `src/app/fonts.ts`) replace the Google Fonts links, which
are deleted from `index.html`. `viteSingleFile()` inlines the woff2 into the
single-file build: `dist/index.html` grows 1,350 → 2,026 kB (gzip 452 → 957
kB). This closes ADDENDUM-024 §9, makes offline rendering identical to
online, and unblocked the gate itself — `toHaveScreenshot` was stalling
forever on "waiting for fonts to load" against an unreachable CDN.

## 2. Three defects the real browser found

The gate earned its keep on day one. Each was invisible to jsdom and unit
tests:

1. **HUD hide was opacity-only.** `hudHidden` faded the header, timeline and
   Frame Studio dock to `opacity-0`, which Playwright (correctly) still
   reports as visible — and which leaves the controls focusable and in the
   accessibility tree. The three interactive surfaces now pair `invisible` /
   `visible` with the fade; the decorative, `aria-hidden` stage frame keeps
   opacity-only.
2. **Dialogs ignored Escape unless focus was already inside.** The shared
   `Dialog` handled Escape in the section's `onKeyDown`; its focus-stealing
   rAF can lag arbitrarily behind a busy main thread (SwiftShader made the
   lag seconds), leaving focus on the trigger and Escape dead. A document
   level listener now closes **only the topmost** open dialog (closers on a
   stack); the section handler keeps the Tab trap, and its
   `stopPropagation` prevents double-close when focus *is* inside.
3. **Frame Studio auto-opened on phones and swallowed the transport.**
   `useState(true)` opened the z-70 panel at every width; at 390 px it
   intercepts every tap meant for the timeline (five e2e tests hung the full
   180 s proving it). Below the `sm` breakpoint (640 px) the studio now
   starts tucked behind its `frame-studio__reveal` button, sampled once at
   mount in the hook — desktop behaviour unchanged.

## 3. Relation to the base spec

Discharges ADDENDUM-022 §0.6 with a substitution: baselines were captured
in-sandbox (Linux, Chromium 153, SwiftShader) rather than on user hardware.
Consequences, recorded in the register: the ADDENDUM-022 Phase 2 R3F port is
**unblocked**; the brass WebGL finish deferred by ADDENDUM-026 may proceed
behind the gate (its pixel diffs become a deliberate re-baseline, not a
surprise); and the "visual check pending" statuses on ADDENDUM-024/025/026
are discharged — the sparkler overlay, lattice screen border, nitrate and
orbit frames have been seen rendered and are pinned as baselines.

## 4. Practical impact / future reader

- Baselines are **OS/browser-specific** (`-linux` suffixed). On macOS or
  Windows, run `npm run e2e:update` once to mint that platform's set beside
  these, and **read the diffs** — never re-baseline to make a red gate green.
- Sandbox recipe: install `@sparticuz/chromium` as above, run
  `node e2e/support/setupSandboxChromium.mjs`, export its two lines, then
  `PW_VIDEO=off npm run e2e`. A full two-project run takes ~20 min under
  software rendering; that is the environment, not a regression.
- The commit footer "browser not available in sandbox" is superseded for
  work validated this way; say what actually ran.
- SwiftShader is not a GPU: repeatability is proven, but bloom and
  antialiasing are close cousins of the real thing. The user's eye on real
  hardware remains the aesthetic acceptance test, and a per-OS re-capture on
  a discrete GPU would sharpen the gate further.

## 5. Validation actually performed

- `npm run e2e` (non-update): **desktop 18/18, mobile 18/18** against the
  committed baselines; hero, HUD, nitrate-opening, screen-border and both
  mobile frames also inspected by eye.
- Full gate: `npx tsc --noEmit` ✓, `npm test` ✓ (93 files, 651 tests),
  `npm run test:coverage` ✓ (100 % pure-layer thresholds unchanged),
  `npm run build` ✓ (2,026 kB single file, fonts inlined).
