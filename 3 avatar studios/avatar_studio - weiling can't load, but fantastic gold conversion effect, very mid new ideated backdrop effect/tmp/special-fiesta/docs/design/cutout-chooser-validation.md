# Validating the cut-out chooser — a runbook for an agent in another environment

**Status:** the suites exist and have **never been run**. The environment they were written in has
no outbound network and no browser engine, so none of the three runners below has produced a
number. That is the whole reason this document exists, and it is why the acceptance criteria are
written down *before* any result: a criterion written after the data is a rationalisation.

**If you are the one running them, your job is:** run one of the three, read the verdict against
§5, do what §6 says for that outcome, and record the numbers in §7 of
`cutout-auto-tuning-assessment.md`. If you are doing this on another machine, start with
`adr-212-handoff.md`, which has the prerequisites, the exact commands, the expected outputs, and how
to return the results.

---

## 1. The problem, from the beginning

A participant signs up on a beach and uploads a photograph of themselves. The app:

1. decodes it and scales it to 640 px on the long edge (`readPhoto.ts`);
2. finds the face with **BlazeFace** via MediaPipe, downloaded at run time, and builds a square
   crop from the inter-ocular distance (`locateFace.ts`, ADR-054);
3. removes the background with **MODNET** via Transformers.js, also downloaded at run time,
   producing an alpha matte (`segmentPhoto.ts`, ADR-033);
4. resamples the crop to a 64 × 64 grid, decides per cell whether it is subject or backdrop,
   quantises to a small palette and emits a sprite code (`photoSprite.ts`).

Step 4's decision is controlled by **`CutOutTuning`** (`cutOut.ts`, ADR-072/077):

| field | range | meaning |
| --- | --- | --- |
| `removeBackground` | bool | cut out at all, or keep the photograph whole (ADR-077) |
| `threshold` | 16–240 | how much of the matte behind a cell must read as subject |
| `minIsland` | 0–512 | detached pieces this size or smaller become backdrop |
| `edge` | −2…+2 | shrink or grow the subject by whole cells |

Every participant gets the same `DEFAULT_TUNING = { true, 128, 512, 0 }`. **On some photographs
that fixed default takes a chunk out of the subject** — most often an arm or shoulder against a
background the same tone as their clothing. That is the complaint this work answers.

`cutOutScore.ts` (ADR-212) sweeps the settings, scores each one without any ground truth, and
proposes a better *opening position* for the controls. **Whether it is allowed to do that is what
these suites decide.** Nothing in the app calls it today.

## 2. Why this cannot be a normal unit test

There is no ground truth. Nobody has hand-labelled which cells are the person, and for the cells
that matter nobody *could*: the damage happens in the band where the matte itself is uncertain,
and a human drawing a boundary there would be inventing one.

So the scorer leans on three things instead, and each is a claim that has to survive contact with
real photographs rather than hand-built fixtures:

- **The matte's own confident regions.** Alpha ≥ 224 is subject, ≤ 32 is background; those label
  gross bite and leak for free. The band between is where the knobs fight.
- **A structural prior for that band: enclosed holes.** Background cells with no path to the frame
  border. *People are not perforated.* One flood fill, and on synthetic mattes it reads 0 across
  all eighteen settings when the matte is clean and 108–220 when a region is ambiguous.
- **A plateau rather than an argmax.** With no ground truth, the maximum of a hand-built score is
  a statement about the score. The chooser takes the centre of the widest run of thresholds that
  all behave alike, then snaps back onto the three steps the participant can reach by tapping.

Unit tests already pin all of this on synthetic mattes — `apps/web/src/lib/avatar/cutOutScore.test.ts`
and `cutoutCorpus.test.ts`, which also record the known defects as expected failures (`it.fails`;
see `adr-212-handoff.md` §9). They run anywhere with no network. Coverage of `cutOutScore.ts`,
measured 2026-10-08: 100 % statements, branches, functions and lines. **Those tests prove the metrics
respond to the right things. They are not evidence about photographs.**

## 3. The two bugs that make this worth doing properly

Both were objective functions that optimised in the wrong direction, and the second one was
invisible until the chooser was pointed at a *good* photograph. They are the reason the suites
below check for inversion explicitly rather than just checking for a nice-looking table.

**Bug one — damage measured against the wrong subject.** MODNET is a *portrait* matting model: it
mattes every person in the frame, so the stranger at the next table is confident subject too.
Measuring "confident subject this setting dropped" globally scored bystander pruning as ~4 %
damage on every setting that does it — correct behaviour, scored as harm. A tuner minimising that
learns never to prune bystanders: worse product, better number. Bite is now measured inside the
**face-connected component** only.

**Bug two — the tie-break was the array order.** On a clean matte, bite and leak are both zero at
every setting, so everything tied, and the winner was whichever candidate the generating loops
emitted first. That is `Trim`. **The chooser was shaving a cell off every well-photographed
participant and printing a perfect score while it did it.** Bite is measured on *confident*
subject and a soft edge is by definition not confident, so neither of the first two keys was
defending the subject's outline at all. The fix is a third sort key — distance from
`DEFAULT_TUNING` — so that *a default moves only when it is measurably better*.

The general lesson, worth more than either fix: **when a score ties across the whole search space,
something other than the score is choosing, and it is usually an array order.**

## 4. The corpus, and what it cannot tell you

`images/ingest/` — the gate and the screen walk **26 photographs**: twenty `social-*`, four
`booth-*`, two `passport-*`, at the top level only (`listCutoutCorpus` in `tools/cutoutCorpus.ts`).
The demo persona list (`scripts/demo-personas.json`) names **120** photographs: those twenty
`social-*` and 100 more in `images/ingest/social/` (ADR-223). The recorded crowd is still the **80**
in the dump until `npm run demo:record` runs again. So this walk reaches **20 of the 120**, and the
booth and passport photographs are not in the crowd at all. That gap is defect C1 in
`cutoutCorpus.test.ts`, recorded as an expected failure. Closing it changes the protocol, so it is a
decision (the next free number when it is taken), not a silent fix. ADR-072's statistics (22 of 75 photo avatars carried
detached pieces; the largest stray 80 cells; the smallest main subject 5,788) were measured across
the recorded crowd, not across these 26. `seedIslands.test.ts` regresses the prune against the
crowd's sprites in `scripts/demo-participants.dump.json`.

**Their limit, stated plainly:** they are generated images, not phone snaps. The case the whole
feature exists for — a café selfie with a crowd directly behind the subject — is not in here. A
pass is **necessary and not sufficient**. If you have real photographs, adding them to
`images/ingest/` is the single highest-value thing you could do to this experiment; the runners
pick up anything at the top level that matches `CUTOUT_CORPUS_PATTERN` (`tools/cutoutCorpus.ts`).

Note also that the dump holds *painted sprites*, not alpha mattes. That is why none of this can be
replayed offline: the sweep needs the alpha plane, and only the model can produce it.

## 5. The three runners

All three state the same rule separately, on purpose. **If they disagree, that disagreement is
information** — most likely about the crop, see §5.3.

### 5.1 The gate — Playwright, real browser, real models

```bash
npm run dev                 # terminal 1: API + web on :5173
npm run test:e2e:cutout     # terminal 2
```

`test:e2e:cutout` is `PSD_E2E_REAL_MODEL=1 playwright test e2e/participant/cutout-chooser.spec.ts
--project=desktop-chrome`. Omit the first step to let `playwright.config.ts`'s `webServer` start
the stack itself. One project, because this downloads 25 MB and one browser settles the question.

**Check the spec loads before you spend twenty minutes on it** — this needs no browser, no network
and no dev server, and it is how the `test.use` placement bug in the first draft was found:

```bash
npx playwright test e2e/participant/cutout-chooser.spec.ts --list    # expect 6 tests per project
```

- **This is the authoritative result.** It drives `/cutout-report.html`, which walks the corpus
  through `photoFileToSprite` → `refineWithModel` → `chooseTuning`: *the code path that ships*,
  with the real BlazeFace crop and the real MODNET matte. Given that two scoring designs have
  already pointed the wrong way, measuring through a parallel implementation would not have caught
  either of them.
- **Needs:** outbound HTTPS to `cdn.jsdelivr.net` (library), `huggingface.co` (~25 MB of weights),
  `storage.googleapis.com` (BlazeFace weights); one Chromium; 10–20 minutes cold.
- **Writes nothing, uploads nothing, touches no database.**
- The run attaches `report.json` to the Playwright report.

### 5.2 The same thing with your own eyes

```bash
npm run dev
# open http://127.0.0.1:5173/cutout-report.html
```

Same page, no assertions. Per photograph it shows **the crop, the mask `DEFAULT_TUNING` produces,
and the mask the chooser picks**, side by side; cards where the chooser disagrees are orange.
**Do this at least once even if the suite is green.** The numbers cannot tell you whether the
chosen mask looks like a person, and that is the actual question. What you are looking for on an
orange card is the chooser's mask visibly keeping an arm that the default ate.

The page is dev-server-only by construction, not by a flag: it is not a route, it lives outside
`src/`, and `vite build` takes `index.html` alone.

### 5.3 Screening — headless Node, no browser

```bash
npm install --no-save @huggingface/transformers@4.3.0 sharp
npx tsx apps/web/scripts/cutout-corpus-report.ts
npx tsx apps/web/scripts/cutout-corpus-report.ts --json out.json
```

Exit 0 = criterion met, 1 = not met, 2 = could not run. `--no-save` is deliberate: the app loads
Transformers.js from a CDN at run time so that onnxruntime's WebAssembly never enters the shipped
bundle (ADR-033), and adding it to `package.json` for one script would undo that.

**This is a screening tool, not the gate, and the reason is the crop.** There is no BlazeFace
outside a browser, so it falls back to `faceBox` — the skin-colour estimate the app uses only as a
last resort. A different crop means the sweep sees different cells. Use it to find problems early
and cheaply; do not close the question with it.

## 6. Acceptance criteria

Derived from the raw per-photograph rows, not from the page's own verdict — a tool that grades its
own homework is not a gate. Criterion 6 asserts the two agree.

| # | Criterion | Why this one |
| --- | --- | --- |
| 1 | The run completed and MODNET answered for every photograph (`noMatte` empty) | A suite that silently scores three photographs and passes is worse than a red one |
| 2 | **THE GATE** — it never moves on a photograph the default already handles cleanly | The good photographs are the majority; fidgeting with them is a net loss that stays invisible until somebody's face comes out shaved |
| 3 | It never chooses a threshold *tighter* than `DEFAULT_TUNING` | Tightening causes the exact complaint this feature answers; a tighter pick is evidence of inversion, not a preference |
| 4 | Per photograph, chosen bite ≤ default bite and chosen holes ≤ default holes | Cannot fail while the scorer is correct — it exists because the scorer has been wrong twice in ways that still produced a tidy table |
| 5 | At least one moved photograph is *strictly* better | A chooser that only ever ties should not ship |
| 6 | The page's verdict matches the suite's | Two definitions of "damage" drifting apart is a defect in itself |

"Measurable damage at the default" means **enclosed holes > 0, or bite > 0** — bite being confident
subject dropped from inside the face-connected component.

## 7. What to do with each outcome

- **All pass** → cleared for **step 3**: wire `chooseTuning` into `AvatarStudio` as the *initial*
  tuning only. It must never override a knob the participant has already touched. Note that
  `tuning` is **not** in `@psd/contracts`, so the choice sets the opening position but does not
  survive the save — telling a participant "we picked Loose" needs a contract change first.
- **Criterion 2 fails** → **do not ship it as a default.** Keep the module and demote it to a
  *detector*: leave `DEFAULT_TUNING` alone, and surface a hint on the photographs it flags. This
  is a legitimate outcome that was anticipated, not a defeat. Record which photographs and why.
- **Criterion 3 or 4 fails** → the objective function is wrong again. **Do not tune constants until
  it goes green.** Read §3 of `cutout-auto-tuning-assessment.md`, work out which term points
  backwards, and fix the term. The two bugs in §3 above are what this looks like.
- **Criterion 5 fails, 2–4 pass** → harmless and pointless. Write down the numbers and close the
  question. Do not wire it in.
- **Criterion 1 fails** → an environment problem, not a verdict. Nothing else is informative until
  the models answered. Check the three hosts in §5.1 are reachable.

**The constants are provisional and you are allowed to change them — once.** `HOLE_TOLERANCE`
(16 cells), the confidence bands (224/32) and the plateau width (0.25 % of bite) were all set from
synthetic mattes. Setting them from this corpus is the intended use of a first run. Setting them
*repeatedly* until criterion 2 passes is fitting to the test, and at that point the suite has
stopped measuring anything.

## 8. Where everything is

| Path | What |
| --- | --- |
| `apps/web/src/lib/avatar/cutOutScore.ts` | The scorer and `chooseTuning`. Pure. Wired to nothing. |
| `apps/web/src/lib/avatar/cutOutScore.test.ts` | The unit tests on synthetic mattes, including the expected-failure tests D1–D3 (`it.fails`). Runs anywhere, no network. |
| `apps/web/src/lib/avatar/cutoutCorpus.test.ts` | What the walk covers against the demo crowd, including expected failure C1 (`it.fails`). Reads `scripts/demo-personas.json`. No network. |
| `apps/web/tools/cutoutCorpus.ts` | The one definition of the walk (`listCutoutCorpus`), shared by the dev server, the report and the screen. |
| `docs/design/adr-212-handoff.md` | Start here to run this on another machine: prerequisites, commands, expected outputs, reading a failure, returning results. |
| `apps/web/src/lib/avatar/cutOut.ts` | `CutOutTuning`, `DEFAULT_TUNING`, `CUT_OUT_STEPS`, the mask operations. |
| `apps/web/scripts/probe-cutout-scoring.ts` | Reproduces every number in the assessment from synthetic mattes. No network. |
| `apps/web/scripts/cutout-corpus-report.ts` | §5.3, the headless screening runner. |
| `apps/web/tools/cutoutReport.ts`, `apps/web/cutout-report.html` | §5.2, the dev-server page. |
| `apps/web/vite.config.ts` | `corpusRoutes()` — serves the walk (`listCutoutCorpus`) at `/corpus` in dev only. |
| `e2e/participant/cutout-chooser.spec.ts` | §5.1, the gate. |
| `docs/design/cutout-auto-tuning-assessment.md` | The original assessment: cost, the scoring problem, limits. |
| `docs/addenda/ADDENDA.md` | ADR-072/073/077 (the cut-out), ADR-212 (the scorer), ADR-215 (these suites). |

## 9. Honest list of what is still untested

- **Every runner above.** Written and linted. Typechecked only where a tsconfig includes it: `src/`
  and `tools/` are in `npm run typecheck`; `scripts/` and `e2e/` are not. Under the web tsconfig's
  strictness the gate spec reports TS4111 at line 173 (`process.env.PSD_E2E_REAL_MODEL`); Playwright
  does not typecheck, so the gate still runs. Never executed against a model.
- **The sixty photographs in `images/ingest/social/`** (defect C1). Neither the gate nor the screen
  walks them, so nothing here has measured them.
- **Whether BlazeFace's crop and the skin-estimate crop agree** often enough for §5.3 to be a
  useful screen at all. Unknown.
- **Any photograph that is not in `images/ingest/`** — including every real one.
- **The crop axis.** §2.1 of the assessment prices it (25–41 ms a candidate against 0.62 ms for a
  tuning candidate, with no second inference either way) and argues it does not need searching
  because BlazeFace already supplies a scale estimate. No photograph has been checked for a crop
  the detector got wrong *that the hole or bite metrics would have caught*.
