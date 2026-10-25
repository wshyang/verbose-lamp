# ADDENDUM-030 — Self-hosted typefaces, a font-ready gate, and the e2e contract checked without a browser

**Date:** 2026-10-25 · **Relates to:** CLAUDE.md §2, §7; BUILD_PROMPT §3, §7;
ADDENDUM-022 §0.5 (Playwright), §1.1; ADDENDUM-024 §9 (fonts deferred);
ADDENDUM-026 §5–§6; ADDENDUM-028 §6; ADDENDUM-029 §7.
**Status:** Implemented — the Playwright run itself still needs the user's machine.
**Audience:** anyone generating the likeness baselines, and anyone who wonders why
the bundle grew by 280 kB.

## 1. What was outstanding, and what of it could be finished here

After ADDENDUM-029 the register's only open items were the browser-gated ones. Two of
them turn out to have work inside them that does not need a browser:

| Item | Status after this round |
|---|---|
| Playwright `npm run e2e` | Still cannot run: `npx playwright install chromium` is refused (the CDN is not reachable from this sandbox). **But** the config and both specs are now validated statically, and a unit test guards the test ids they select. |
| Self-hosting the fonts (ADDENDUM-024 §9, "offline the drum and name reveal fall back to Georgia") | **Done.** |
| Delete `GatsbySceneManager.ts` | Still gated on the user's screenshot comparison. Untouched, deliberately. |

## 2. Self-hosted typefaces

`index.html` fetched six families from Google Fonts. That is wrong for this app in
three specific ways, not one general way:

1. **The sequence rasterises type on a canvas.** `drumRenderer` sets
   `600 …px Cinzel`, the countdown and the name reveal set `700 …px "Cinzel
   Decorative"`. A canvas draw does not wait for a webfont: paint first and Georgia's
   pixels are baked into the texture for the life of that card.
2. **The likeness baselines must be reproducible.** A screenshot gate that depends on
   a third party being up, fast and unchanged is not a gate.
3. **Offline, the typography vanished.** The drum and the name reveal fell back to
   Georgia — a visible, avoidable difference.

### What landed

- 14 latin-subset `woff2` faces copied into `src/assets/fonts/`, with the OFL text
  for each family beside them (`*-OFL.txt`). Only the weights the app actually sets:
  Cinzel 400/600/700, Cinzel Decorative 400/700, Cormorant Garamond 400 + 400 italic
  + 600, Jost 300/400/500/600, Marcellus 400, Poiret One 400.
- `src/styles/fonts.css` declares them with `font-display: block` and a relative
  `url()`; `src/index.css` imports it directly after Tailwind.
- `index.html` keeps only a comment explaining why there is no remote link.
- The `@fontsource/*` packages are **dev dependencies only**: the runtime reads the
  copied `src/assets/fonts/*.woff2` files, so the app has no runtime dependency on
  them. They stay listed so the next person can refresh a face without guessing where
  it came from (`node_modules/@fontsource/<family>/files/`).
- `vite.config.ts` is **untouched**, per CLAUDE.md §3. No `assetsInlineLimit` tweak was
  needed: `vite-plugin-singlefile` sets it to always inline, so the faces arrive as
  data URLs inside the single file. Measured: **1.77 MB → 2.05 MB** (gzip 578 → 787 kB),
  still exactly one `dist/index.html`, 14 `data:font/woff2` payloads.

### The font-ready gate

Self-hosting removes the network wait but not the race: the first card can still be
drawn before the last face is decoded. `src/shared/lib/fonts.ts` adds
`waitForFonts()`, which resolves on `document.fonts.ready`, resolves immediately where
the Font Loading API is absent, and **swallows a failed load** — a broken font must
never stop the app from starting. `main.tsx` mounts React after it.

Tests: `fonts.test.ts` (4, node — ready, rejected ready, no API, a thenable that is not
a promise) and `fonts.dom.test.ts` (2, jsdom — the `document.fonts` arm, including a
pending set that must not resolve early). The second file exists because the node
suite can never reach the `document.fonts` branch; the new 100 % branch threshold
(ADDENDUM-028 §4) caught exactly that on the first coverage run, which is the check
working as intended.

## 3. The e2e contract, checked without a browser

Two things were possible and both were done:

1. **`npx playwright test --list`** — the config parses, `testDir: 'e2e'` resolves, the
   `webServer` block is well-formed, and both specs enumerate: **42 tests in 2 files**
   (21 per project: `desktop-chromium`, `mobile-chromium`).
2. **`src/app/e2eContract.test.ts`** — reads `e2e/**/*.ts` and extracts every
   `getByTestId('…')`, `data-testid="…"` and dialog-table entry, then asserts that each
   id still appears in `src/`. It also asserts the `{component-kebab}__{element-role}`
   shape, and that `e2e/support/stage.ts` still depends on `?freezeAt=` and
   `data-frame-ready` (the two affordances `gotoFrozen` needs).

Why bother: a spec that selects an id no component renders fails on the user's
machine, midway through a screenshot run, after the dev server has built. Now it fails
in `npm test`, in a second. All 25 ids the specs use resolve today.

## 4. Result

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **119 files, 1123 tests**, green (was 116 / 1114).
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines; thresholds hold.
- `npm run build` — succeeds; 2 051 kB single file, 787 kB gzip.
- `npx playwright test --list` — 42 tests enumerated; running them needs a browser.

**No browser in this sandbox; visual verification pending.** The typography claim here
is that the *characters are the right face*, not that the result looks right — a
rendered comparison is still the user's to make, and the self-hosted faces are exactly
what those baselines will capture.

## 5. What remains, and nothing else

1. The user runs `npm run e2e` on a machine with browsers, on the branch, with
   `--update-snapshots` **not** passed to `likeness.spec.ts`; the first run creates the
   baselines, the second confirms they are stable.
2. With the baselines green, delete `src/features/premiere/scene/GatsbySceneManager.ts`
   (729 LOC) and its `LOGIC_SURFACE_EXCLUDES` entry — ADDENDUM-022 §2.5.
3. Re-run `npx vitest run --coverage` afterwards; `?renderer=classic` then disappears,
   which is a change to `usePremiereRuntime` and its tests, not a rename.
