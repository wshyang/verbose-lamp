# ADDENDUM-035 — The browser gates: interaction flows, likeness shots, avatar spec (Phase 8)

**Date:** 2026-10-26 · **Relates to:** BUILD_PROMPT §3, §7; CLAUDE.md §2, §3, §7; supersedes the Playwright deferral in ADDENDUM-001 §3 (the trigger, a browser being available, is met).
**Status:** Implemented and run. **Software rasteriser only (SwiftShader), macOS only, no real GPU.** The gate proves repeatability on this machine; it does not prove how the scene looks on real hardware, and a human has looked at none of the 32 images and I have looked at only five.

## 1. What was decided

| Item | Choice | Base |
|---|---|---|
| Runner | `@playwright/test`, `playwright.config.ts`: desktop (1440x900) and phone-width (390x844, touch) Chromium projects, one worker, in order, `--use-angle=swiftshader` | PR #3's config; one worker from PR #5 (CPU-bound rendering makes parallel workers skew each other) |
| Dev server | Own port (4373, `E2E_PORT` overrides) and **never reused** | New. A dev server left running from earlier work served an older module graph and hid the spectacle launcher; a gate that tests yesterday's code is worse than none |
| Video | Not taken; traces kept on failure | CLAUDE.md had asked for video-on; the deferral trigger is met but video adds weight for little diagnostic value over a trace |
| Flows | `e2e/flows.spec.ts`, 16 flows | Union of the five PRs; every selector checked against this tree, not copied |
| Likeness | `e2e/likeness.spec.ts`: 13 frozen moments x 2 projects | Union of PRs #3, #4, #5, #6, plus lattice-brass |
| Avatar | `e2e/avatar.spec.ts`: CPU-pixel digests (PR #3) plus stubbed CDN modules (PR #5) | The digests need no recorded image; the stubs make the cut-out reproducible offline |
| Contract | `src/test/e2eContract.test.ts` | PR #4's idea, extended: every test id a spec uses must be rendered somewhere, and the avatar stub routes must equal the URLs the app imports |
| Baselines | 32 images, `darwin`-suffixed, committed (about 44 MB): 26 premiere shots (13 moments x 2 projects) and 6 avatar shots (3 x 2) | Recorded once, then a second run without `--update-snapshots` compared against them |

## 2. Defects the browser run found

Both were invisible to the unit suite and fixed test-first.

1. **"Pick origin" showed nothing in the premiere.** The crosshair, pick hint and keep-clear box were mounted only in Event Night. They are now part of the premiere spectacle overlay.
2. **A click inside the portalled console ended origin picking.** The console renders into `<body>`, but React events bubble through the React tree, so a click on the panel reached the stage handler and set the origin to a point on the panel. `forwardStageClick` forwards only clicks whose target is under the stage.

Findings that changed the specs, not the app: a second live WebGL scene on a CPU rasteriser starves the first (the "matte changes the picture" test reuses one page); on a phone the console spans the screen, so the stage click has to follow closing it; and my first bound on the cut-out (under 60 % opaque) was a guess that the real run (78 %) contradicted.

## 3. Practical impact / what a future reader must know

- Run `npm run e2e` (about 7 minutes for the shots, 3 for the flows). Chromium launches only outside a restrictive sandbox.
- Baselines are comparable only on the same OS, browser build and rasteriser. On Linux or a GPU, `npm run e2e:update` records your own; **re-baselining is a reviewed act**, never a reflex after a red run.
- `?freezeAt=` pins the clock and the pointer aim, which is what makes a frame repeatable; `data-frame-ready` is the flag the specs wait on. Both are covered by the contract test.
- The phone project uses the desktop engine with touch, on purpose: a coarse pointer takes the app's mobile framing path, and a device preset's scale factor would only slow software rendering.
- The 32 baselines are the only pixel assertions in the repo (CLAUDE.md §2 otherwise keeps pixels out of tests). They gate regressions on this rasteriser; they are not a design review.

## 4. Changes to CLAUDE.md and README

CLAUDE.md §2 and §3 and the README testing paragraph now say that Playwright e2e exists, how to run it, and the baseline policy above, replacing "deferred".

## 5. Validation actually performed

- Flows: 16 of 16 on desktop and 16 of 16 at phone width, real Chromium on SwiftShader.
- Avatar: the four digest tests pass on both projects (deterministic across independent loads; finish and frame redraw and restore exact pixels; PNG downloads under its name; the matte changes the picture).
- Likeness and avatar specs (38 tests, 32 of which compare an image): recorded, then re-run against the recorded images: **38 of 38 passed**. Stability across machines, OSes and GPUs is untested.
- Contract test mutated three ways (a misspelled test id, a changed freeze parameter, a changed model URL); each was caught.
- Not performed: any real-GPU run, any Linux run, a human review of the 32 images. Viewed by me: lattice-brass (desktop), act 2 (desktop), the stubbed cut-out, its gilded variant and the gilded studio.
