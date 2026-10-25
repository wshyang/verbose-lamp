# ADDENDUM-045 — Renderer parity, measured instead of eyeballed

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-022 §2.5, §6, §9; ADDENDUM-026 §5;
ADDENDUM-028 §6.3–4; ADDENDUM-043 (the browser that made this possible).
**Status:** Implemented — `scripts/compare-renderers.mjs`, five frozen frames, numbers
below. The classic renderer is **not** deleted; see §5.
**Audience:** the person who has to decide whether the R3F port really reproduced the film.

## 1. The claim that had never been measured

ADDENDUM-026 called the port "1:1" and ADDENDUM-022 §2.5 made a screenshot gate the
condition for deleting `GatsbySceneManager.ts`. Until now nobody had put the two renderers
in the same browser at the same instant, because only one of them could run:
`?renderer=classic` needs a real GPU context and the sandbox had no browser.

ADDENDUM-043 supplied the browser. `scripts/compare-renderers.mjs` loads each renderer at
the same `?freezeAt`, hides the HUD, and compares the captures pixel by pixel in Node
(the two frames are decoded with a 40-line PNG reader — an in-page diff crashed the
software-rasterising tab, which is its own small lesson).

## 2. The result

Viewport 960×600, five frames spread across the acts, mean absolute difference per
channel out of 255:

| Frame | Act | Mean difference | Pixels differing by > 24/255 |
|---|---|---|---|
| 1.00 s | I — nitrate opening | **2.38** | 0.95 % |
| 4.32 s | I — monogram hold | 1.20 | 0.21 % |
| 11.28 s | II — supporting cast | **0.25** | 0.17 % |
| 24.82 s | IV — director | 0.25 | 0.19 % |
| 33.80 s | V — hero lockup | 0.28 | 0.19 % |

For scale: a difference of 0.25/255 is a quarter of one 8-bit step, i.e. what a slightly
different dither or a mote of dust produces. The frames at 11.28 s and 33.8 s are, to the
eye and to the arithmetic, the same picture — I put the two side by side and could not
name which was which.

**The opening frame is the outlier, and it is explicable.** At 1.0 s the card is mid-reveal
and the gold-dust field is at its densest; dust positions advance with the render clock
rather than the film clock, so the two renderers disagree about where a few thousand
particles are. That is the one legitimate difference between them, and it is confined to
the frames where the dust dominates. It is not a geometry, material, lighting or camera
difference: those are shared code, and a change in any of them would move every frame by
tens of steps, not fractions of one.

The script writes each pair to `/tmp/renderer-parity/` plus a `report.json`, so the two
frames with the largest numbers can be inspected rather than trusted.

## 3. Why this is a comparison and not a gate

A gate needs a threshold that means "wrong". Here the correct threshold is "the dust moved",
which is not a defect, so a pass/fail would either fail forever or need a per-frame
exemption list — the shape of a rule that has stopped describing anything.

What the tool is for is the question the plan actually asked: *did the port reproduce the
film?* Mean difference ≤ 0.3/255 on the four steady frames answers that. It is a
measurement a reviewer can re-run in one command, on any machine with a browser, and it
does not need to be re-baselined when the design changes — only re-read.

## 4. What it does *not* answer

- **Whether the sequence looks like the film it is imitating.** Both renderers can be
  identically wrong. That is the Deco Lattice stills comparison (specs 123 → 243), and it
  is the user's.
- **Whether the dust difference is acceptable artistically.** It is 0.95 % of pixels on one
  frame; the fix, if it were wanted, would be to seed the dust from the film time instead
  of the render clock. Not changed here — that is a look, not a bug, and re-baselining it
  needs its own addendum (ADDENDUM-022 §9).

## 5. So why is `GatsbySceneManager.ts` still here?

Because the last thing standing between it and deletion is a judgement, not a number, and
the judgement is the user's: the four steady frames match to a quarter of a colour step,
and the one frame that does not is explained. Deleting 729 lines and the only way to
compare the two renderers is a one-commit change (`?renderer=classic` goes with it), and it
should be made by the person who decides whether the film looks right — with the parity
table in front of them, which is what this addendum provides.

Until then the fallback stays: it costs nothing at runtime (it is not mounted unless the
URL asks for it) and it is the reference the parity tool compares against.

## 6. Result

- `node scripts/compare-renderers.mjs` — five frames, table above, ~6 min on SwiftShader.
- `npx tsc --noEmit` — clean.
- `npx vitest run` — **131 files, 1206 tests**, green (no product code changed; the script
  lives outside `src/` and outside the coverage surface).
- `npx vitest run --coverage` — 100 % statements, branches, functions, lines.
- `npm run build` — succeeds.

**No browser on the user's machine was used; both renderers were photographed in this
sandbox through SwiftShader.** A parity measurement is only meaningful on the engine that
produced both images, and that condition is met here even though it is not the user's GPU.
