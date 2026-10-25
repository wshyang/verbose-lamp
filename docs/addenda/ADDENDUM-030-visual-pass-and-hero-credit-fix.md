# ADDENDUM-030 — The visual pass: a browser from npm, seven screens, one defect fixed

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-029 (§2 baselines, §6 open items), ADDENDUM-027 (§3 browser seam), ADDENDUM-022 (§4 gate, §9 Phases 2–3), ADDENDUM-018/019 (avatar studio), ADDENDUM-024/025 (spectacle and Event Night), ADDENDUM-028 (nine-slice proscenium). BUILD_PROMPT §2, §7; CLAUDE.md §2, §7.
**Status:** Visual pass done for the seven surfaces below; one defect fixed and re-baselined. ADDENDUM-022 Phases 2–3 still open.

Twenty-nine addenda carry the phrase "implemented — visual check pending". That phrase was honest: the sandbox had no browser when those features were written, so nobody had *looked* at them. This addendum is that look. It also answers the question that keeps coming up — **where does a browser come from in a sandbox with no package manager and no browser download in the allowlist?** — and it fixes the one defect the look actually found.

## 1. Getting a browser from npm (the research)

Three routes exist, and only one of them works without a network host outside the allowlist:

| Route | What it ships | Works here? |
|---|---|---|
| `npx playwright install chromium` (or `@playwright/browser-chromium`) | nothing in the tarball; downloads from `cdn.playwright.dev` at install time | **no** — CDN not allowlisted |
| `npx @puppeteer/browsers install chromium@latest` | nothing in the tarball; downloads Chrome for Testing from `storage.googleapis.com` | **no** — same reason |
| **`@sparticuz/chromium`** | the Chromium build *inside the npm tarball* as Brotli tars (`chromium.br`, `al2023.tar.br`, `swiftshader.tar.br`) | **yes** — `registry.npmjs.org` is allowlisted |

`@sparticuz/chromium@153.0.0` is current (published three weeks before this addendum, matching upstream Chromium 153). It is a **`headless_shell`** build: no GUI, remote-debugging only, which is exactly what a screenshot harness needs. It still renders WebGL through SwiftShader, so the premiere's three.js canvas works — slowly (20–60× a real GPU), but it works.

The bootstrap is unchanged from ADDENDUM-029 §1 and needs no new dependency in this repo: decompress the binary and the AL2023 libraries into `/tmp`, then point the two seams the config already has at them.

```bash
npm i @sparticuz/chromium                     # scratch dir, not this repo
node -e "const z=require('zlib'),f=require('fs');\
f.writeFileSync('/tmp/al2023.tar', z.brotliDecompressSync(f.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')));\
f.writeFileSync('/tmp/chromium', z.brotliDecompressSync(f.readFileSync('node_modules/@sparticuz/chromium/bin/chromium.br')))"
tar -xf /tmp/al2023.tar -C /tmp                # /tmp/lib/*.so
LD_LIBRARY_PATH=/tmp/lib /tmp/chromium --version   # Chromium 153.0.8010.0
```

What the research adds beyond ADDENDUM-029:

- **The `-min` variant is not a substitute.** `@sparticuz/chromium-min` fetches its pack tar on first run (GitHub releases), which is outside the allowlist; the full package is the only offline-capable one.
- **`@sparticuz/chromium` is `headless_shell`, so it cannot do headed-mode rendering or a real compositor.** Anything that needs a GPU-quality compositor (font hinting at 2×, real subpixel AA) is out of reach here; the likeness baselines are therefore Linux + SwiftShader pixels and stay suffixed as such.
- **SwiftShader needs the GL flags spelled out**: `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Without the first two the canvas gets a null WebGL context and the premiere stays blank.
- **The package also ships an emoji-free font set**, which turns out to matter — see §4.2.

## 2. The pass: seven screens, three viewports

`scripts/capture-visuals.mjs` froze the premiere at act V (`?freezeAt=33.8`) and walked the HUD. It is a harness, not a test — nothing asserts on its pixels; the likeness gate is what fails on drift. Committing it means the next pass is one command:

```bash
LD_LIBRARY_PATH=/tmp/lib PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium \
  node scripts/capture-visuals.mjs --out /tmp/shots            # all surfaces
  node scripts/capture-visuals.mjs --only hero-2560x1080        # just one
```

| Surface | Where it comes from | Verdict |
|---|---|---|
| Hero title, 1440×900 | ADDENDUM-002/005/007 | **Good**, one defect (§3) |
| Hero title, 2560×1080 (21:9) | responsive layout, ADDENDUM-012 | Good — no backdrop banding, frame stays inside the safe area |
| Hero title, 390×844 | mobile auto-level, ADDENDUM-012 | Good, but the card deliberately runs past both side edges (§4.3) |
| Frame Studio, docked | ADDENDUM-009/011/026/028 | Good — panel is fully inside the viewport (§4.1) |
| Spectacle console | ADDENDUM-025 | Good — all five groups reachable, no clipped controls |
| Golden QR plaque | ADDENDUM-013 | Good — plaque geometry, caption, byte/module readout all correct |
| Gilded Avatar Studio | ADDENDUM-018/019 | Good — medallion preview, four control groups, enamel backdrop chips |
| Title customizer | ADDENDUM-005 | Good — presets, four fields, alternation toggle, reset |
| Event Night screen | ADDENDUM-023/024 | Good — medallion, lattice frame, tiles, marquee bulbs (§4.2 on the tile glyphs) |

Evidence is committed as JPEGs under `docs/addenda/assets/ADDENDUM-030/` — before/after crops for the fix, and one screenshot per surface above. They are compressed for the repo; the originals are 1440×900 PNGs and stay out of git.

## 3. The defect, and the fix

**The hero credit was drawn on top of the bottom fan ornament.** `FROM THE NOVEL BY F. SCOTT FITZGERALD` sat at `y = -2.62`, which is the centre of the card's bottom sunburst, so a dozen gold rays crossed the words and the line read as noise. The keystone `THE` had the milder version of the same problem: its rig at `z = 0.16` intersected the keystone plate's crest (front face ≈ `z = 0.14`), so the letters' back halves were inside the plate.

Both are one-line layout facts, and both are now pinned by the geometry rather than by taste:

- the credit moved into the lower pediment's one clear band — **below** the diamond's bottom (`-1.64`) and **above** the inner frame's bottom rail (`-1.90`): `y = -1.77`, height `0.23 → 0.18`, `z = 0.12 → 0.22`;
- the keystone moved in front of the plate's crest: `z = 0.16 → 0.24`.

`decoCards.test.ts` asserts the new numbers, with the reason in the test.

Before and after, same crop, same frame: `credit-before-crop.jpg` and `credit-after-crop.jpg` in the assets folder. The fan is now clear of the words and the line reads at 1440 and at 2560 wide.

## 4. What the pass found and did **not** change

### 4.1 The docked panels do not overflow — a negative result worth recording

At 1440×900 the Frame Studio *looks* like it runs off the right edge in a screenshot. It does not: measured in the page, the panel is `[1100, 112, 1404, 865]` with `clientWidth === scrollWidth === 302`, its widest child ends at `x = 1389`, and `document.documentElement.scrollWidth === 1440`. The illusion comes from the panel's own dark border against a dark film. No change made — and a future reader should not "fix" a bug that is not there.

### 4.2 Emoji glyphs are tofu on a system with no emoji font

The gilded glyph pipeline (ADDENDUM-019) turns an emoji's colour into luminance and re-tints it through the gold ramp. That works — *if the platform has a colour-emoji font*. This Chromium ships none, so every gilded glyph renders as an empty box: the Event Night tiles (FOYER, PROGRAM, LUCKY DRAW, TOAST, GALLERY), the header's LUCKY DRAW and SPECTACLE pills, the avatar studio's SHEEN and FINE TUNE chips, and the QR plaque's SHIMMER chip.

On macOS, Windows and Android the same markup shows emoji and looks correct, so this is not a regression — it is a **portability hazard** for exactly the environments the sandbox represents (Linux CI, minimal containers, kiosks). Two honest fixes exist and both are work: bundle a colour-emoji font with the app, or swap decorative emoji for inline SVG (the codebase already uses `lucide-react` everywhere else). Recorded here, not fixed here: it is a design decision, not a bug in the pipeline.

### 4.3 The mobile hero runs past both side edges

At 390×844 the card is scaled to fill the narrow viewport, so the frame's chamfered sides and wings are off-screen and only the middle of the framing reads. This is what ADDENDUM-012's mobile levelling asks for (fill the screen, keep the type legible), and the type *is* legible, so it stays as-is — but it should be a decision, not an accident, which is why it is written down.

## 5. Re-baselining, and a gate lesson

The credit move changes the hero card, so the likeness gate had to be re-recorded — and that is where this pass learned something about the gate itself.

`npx playwright test e2e/likeness.spec.ts --update-snapshots` reported **24 passed and wrote nothing**: the moved credit changes far fewer than the gate's `maxDiffPixelRatio: 0.01`, so every comparison passed and no file was touched. A tolerance that hides real drift is fine for *not failing* and useless for *recording*: `--update-snapshots` alone cannot refresh a baseline the change does not exceed.

So the act V shots were re-recorded deliberately, with the update mode spelled out:

```
npx playwright test e2e/likeness.spec.ts -g "act5" --update-snapshots=all   # 10 passed, 10 files written
npx playwright test e2e/likeness.spec.ts -g "act5"                          # 10 passed, no flag
npx playwright test e2e/likeness.spec.ts                                    # 24 passed, no flag (17.3 min)
```

The last two are the ones that count: they compare against the *new* files without permission to write. The act I–IV cards are different archetypes with no credit line, so their baselines are untouched — `git status` confirms exactly five shots × two projects changed (`act5-hero-hold`, `act5-finale-bookend`, `act5-nitrate-forced`, `act5-orbit`, `act5-screen-border`).

Whole-suite checks after the change:

```
npx tsc --noEmit   # clean
npm test           # 154 files / 1317 tests
```

The lesson is recorded because it is the kind of thing that silently rots a gate: **a 1 % tolerance means a moved line of 0.18-unit type passes silently.** If a future change is meant to move pixels, re-record with `=all` and verify without it.

## 6. What is still open

- **ADDENDUM-022 Phases 2–3 — the React Three Fiber port — is still not started.** It is the largest outstanding item in the tree and the one the likeness gate exists to protect. Nothing in this pass changes that.
- **Font self-hosting** (§4.2) is now a recorded design gap rather than a suspicion: the app's gilded vocabulary degrades to boxes on any machine without an emoji font.
- The "visual check pending" rows in `docs/ADDENDA.md` are updated to point here where a screenshot exists. That is a *sandbox* check on SwiftShader pixels; sign-off on a real GPU is still the designer's, and §1 explains why that run cannot happen here.
- The remaining coverage residue (81 statements, mostly Three.js teardown and loader-failure paths) is unchanged by this pass — see ADDENDUM-029 §5.
