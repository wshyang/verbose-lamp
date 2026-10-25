# Can we pick the cut-out settings for the participant? — an assessment

**Question asked, 2026-10-08:** when a photo is uploaded we run auto-cropping and background
removal, and the background removal sometimes takes chunks out of the subject. Could we
algorithmically try a range of settings, score them, and present the best one as the default?

**Short answer: yes, and it is much cheaper than it sounds.** The whole coarse grid of removal
settings costs **11.2 ms** to evaluate and score, against **~95 ms** to paint a single sprite,
because the matting model runs once and every knob works on its output. Searching crops as well
costs more (**~41 ms** a candidate) but still runs no second inference. Cost is not the problem.

The problem is the scoring function, and it is a real problem rather than a formality. My first
attempt at one was actively harmful — it would have scored the product's correct behaviour as a
defect. The measurements below show what works, what does not, and why.

---

## §1 What is already there

This does not need new infrastructure. The pipeline is already parameterised and the parameters
are already a value object.

`CutOutTuning` (ADR-072/077) is four fields:

| field | range | what it does |
| --- | --- | --- |
| `removeBackground` | bool | ADR-077 — cut out at all, or keep the photograph whole |
| `threshold` | 16–240 | how much of the matte behind a cell must read as subject |
| `minIsland` | 0–512 | detached pieces this size or smaller become backdrop |
| `edge` | −2…+2 | shrink or grow the subject by whole cells |

`CUT_OUT_STEPS` already names the coarse choices a participant is offered — threshold
Loose/Normal/Tight, islands Keep/Remove, edge Trim/As-is/Grow. **That is 3 × 2 × 3 = 18
settings**, and it is the natural search space: it is the one the participant can reach by
tapping, so a default chosen from it is a default they can understand and undo.

Two further pieces of luck:

- **ADR-073's seam.** `preparePhotoCells` (resample, enhance, sharpen — 5.8 ms there, 25–41 ms
  under `tsx`; see §2.1) does not depend
  on the tuning; only `paintPrepared` (~95 ms) does. The seam exists so moving a knob does not
  redo the expensive half.
- **`componentSizesOf` is already exported** from `cutOut.ts` with the comment that "is this
  person in one piece?" is the question the module exists to answer. The scorer below is largely
  that function plus one more walk.

---

## §2 Cost — measured, not estimated

`apps/web/scripts/probe-cutout-scoring.ts`, on this machine:

```
=== cost ===
  18 settings, one crop        8.7 ms   (0.48 ms each)
  the same, + hole detector   11.2 ms   (0.62 ms each)
  5 crops, preparePhotoCells  206.5 ms  (41.30 ms each)
  5 x 18 = 90 joint grid      283.8 ms
  one paintPrepared (ADR-073)  ~95 ms
```

Each figure is the best of 20–30 runs; a single timed loop measures the JIT as much as the work,
and the first version of this probe reported the hole detector as *cheaper* than not running it
for exactly that reason.

Against ADR-073's measured `paintPrepared` of ~95 ms, **the entire scored sweep of the removal
settings costs about a ninth of painting one sprite.**

The reason is the thing worth internalising: **the expensive step is the matting model, and it
runs once.** MODNET produces an alpha plane; every knob operates on that plane afterwards, on a
64 × 64 grid of 4,096 cells. Thresholding is a downsample; island pruning is a flood fill; edge
trimming is two dilation passes. None of it is image work.

So the sweep does not need to paint candidates at all. **Score on masks, paint once, at the
winner.** A design that painted all 18 would cost 1.7 s and be the only version of this feature
anyone would call infeasible.

### 2.1 The crop axis is a different price, and the question asked about both

The question names *auto-cropping* alongside background removal, so both were measured. They are
not comparable:

| axis | what one candidate costs | why |
| --- | --- | --- |
| tuning (18 settings) | **0.62 ms** | flood fills over 4,096 cells |
| crop | **25–41 ms** | a `preparePhotoCells` — resample, enhance, sharpen |

The one piece of good news carries over: **changing the crop does not re-run the model either.**
ADR-056 keeps the matte for the whole photograph precisely so that re-cropping does not throw
the background removal away, and `maskFromModel` takes the crop box as an argument. So a joint
crop × tuning search is still inference-free — the 90-candidate grid above costs 284 ms, about
three sprite-paints, which is affordable but is no longer the rounding error the tuning sweep is.

A measurement that disagrees with the record, stated rather than smoothed over: ADR-073 puts
resampling at **5.8 ms** and this probe measures `preparePhotoCells` at **25–41 ms**. ADR-073
measured in a browser and this runs under `tsx` in Node, and the cost barely moves with crop size
(25.1 ms at a 128 px box, 34.5 ms at 478 px), so the bulk of it is per-output-cell work over the
4,096 cells rather than per-source-pixel sampling. The ordering is what the design rests on and
the ordering is not in doubt: **tuning is nearly free, crop is tens of milliseconds, painting is
~95 ms, inference happens once.**

The practical consequence is a shape for the search rather than a veto: **sweep tuning densely
and crop sparsely.** The crop already comes from a face detector with a real scale estimate
(ADR-054, inter-ocular distance), so it does not need searching — at most a few candidates
around what BlazeFace found, and only when something downstream complains. Which it now can:
the hole detector in §3.3 and the bite metric in §3.2 are *also* a signal that the crop is
wrong, because a crop that cuts the subject at the frame edge changes what counts as enclosed.

---

## §3 The hard part: what does "good" mean with no ground truth?

Nobody has told us where the person is. That is the whole difficulty, and it has to be faced
directly rather than hidden inside a weighted sum.

### 3.1 Labels we do have, free

The matte is not a binary mask — it is an alpha plane, and **its confident regions can act as
labels for its own ambiguous ones.** Thresholding the same plane at 224 and at 32 gives:

- **confident subject** — alpha ≥ 224, the model is sure;
- **confident background** — alpha ≤ 32, the model is sure;
- **the ambiguous band** — everything between, which is exactly the territory the knobs fight
  over.

A candidate setting can then be scored on the two things labels can see: how much confident
background it *keeps* (leak), and how much confident subject it *drops* (bite).

### 3.2 The trap: the obvious bite metric is backwards

Measured across the coarse grid on a photo with a bystander in it:

```
setting                 main  pieces  holes   bite   leak
Loose/Keep/As-is        1861      2      0    0.0%    0.0%
Loose/Remove/As-is      1861      1      0    6.6%    0.0%
Normal/Remove/As-is     1704      1      0    6.6%    0.0%
Tight/Remove/As-is      1548      1      0    6.6%    0.0%
```

Every `Remove` setting scores a flat **6.6 % bite**. Nothing is wrong with those settings — that
6.6 % *is the bystander*, and removing them is the entire purpose of `minIsland`. MODNET is a
portrait matting model; it mattes every person-shaped thing in the frame, so a stranger at the
next table is confident subject too.

**A scorer that minimises bite therefore learns to never prune bystanders** — it would make the
product worse while reporting that it had improved it. This is the specific way an auto-tuner
fails: not by picking a slightly worse setting, but by optimising a number that is pointing the
wrong way.

**The fix is to define who "the person" is before measuring damage to them:** flood-fill from the
face seed (`cutOut.ts` already computes it — the crop is centred on the eye midpoint, so the cell
at 52 % down the middle is between the eyes) through the *loosest* mask, and count bite only
inside that component. With that restriction the 6.6 % vanishes and the metric means what its
name says.

### 3.3 The ambiguous band has no labels, by construction — so use structure

Restricting bite to the person makes it honest but also makes it quiet: in the measurements below
it is 0.0 % nearly everywhere. That is not the metric failing. It is telling the truth — the
damage the user is complaining about happens in the band the model was *unsure* about, which is
precisely where no label exists.

What rescues this is a structural prior that needs no labels at all: **people do not have holes
in them.** Count background cells with no path to the border of the frame — background enclosed
by subject is, almost always, a bite taken out of a person.

Simulating the canonical failure (a shirt the same colour as the wall behind it, matte alpha
~105):

```
=== shirt matches wall ===
setting                 main  pieces  holes   bite*   leak
Loose/Remove/As-is      1861      1      0    0.0%    0.0%
Normal/Remove/Trim      1386      1    204    0.0%    0.0%
Normal/Remove/As-is     1550      1    154    0.0%    0.0%
Tight/Remove/Trim       1219      1    220    1.2%    0.0%
Tight/Remove/As-is      1380      1    168    0.0%    0.0%
```

versus the same photo without the ambiguous shirt:

```
=== clean ===
every setting:                     holes 0,  bite* 0.0%
```

**The hole count is zero on the clean photo at all eighteen settings, and 108–220 on the damaged
one, rising as the threshold tightens.** That is a clean, unambiguous detector for the exact
complaint that prompted this question, and it costs one flood fill.

Note also what it recommends: on the damaged photo it points at `Loose`, which is the correct
answer, and on the clean photo it is silent and lets the other terms decide.

### 3.4 The proposed score

In priority order, not as a weighted sum — a sum lets a large gain in a cheap term pay for a
catastrophe in an expensive one:

1. **Reject** any setting where the face region is not intact. A hole in the face is never worth
   any amount of background cleanliness.
2. **Reject** any setting with enclosed holes above a small tolerance.
3. **Minimise** bite within the face-connected person.
4. **Minimise** leak of confident background.
5. **Tie-break on stability, not on the score.** Among settings that survive, prefer the one in
   the middle of the widest run of neighbouring settings that behave the same. With no ground
   truth, the argmax of a hand-built score is fitting to the score; the centre of a plateau is a
   claim about robustness, which is what we actually want. It is also what makes the chosen
   default *insensitive* to the arbitrary constants above.

### 3.5 One more thing the sweep gets for free

If the alpha histogram is strongly bimodal, the matte is confident and the threshold barely
matters. If there is mass in the middle, the model is unsure about a lot of the picture — and
that is a measurable reason to distrust the whole cut-out and default `removeBackground` to
**false**, which ADR-077 already built as the human escape hatch ("some photographs defeat every
setting; the honest answer is to stop cutting"). Today a participant has to notice that and reach
for it themselves. The sweep can notice it for them.

---

## §4 What this cannot do

Worth stating plainly, because the feature invites over-claiming.

- **It cannot beat a bad matte.** Every candidate is a different reading of the same alpha plane.
  If MODNET lost the arm entirely, no threshold recovers it.
- **It cannot know intent.** A person holding a surfboard and a person standing next to a stranger
  are the same picture to a connectivity test. §3.2's rule — keep the piece the face is in — is a
  heuristic that will sometimes discard something wanted.
- **Holes have false positives.** A photo through a railing, a hand on a hip making a triangle of
  real background: both are enclosed background that is genuinely background. The tolerance in
  §3.4 step 2 exists for this, and it should be a *rejection* threshold rather than a cost, so a
  small one costs nothing.
- **It is a default, not a verdict.** The controls stay exactly as they are.

---

## §5 Where it plugs in, and one consequence

The natural home is beside `preparePhotoCells`, after the matte arrives and before the first
paint: `chooseTuning(subject, box, size): CutOutTuning`, pure, no DOM, trivially testable — the
same shape as the rest of `cutOut.ts`.

**One consequence worth knowing now: tuning is not persisted.** It is in `SpriteInput` but not in
`@psd/contracts`; only the painted sprite is stored. So an auto-chosen tuning is a session-time
decision, and a participant who re-opens the studio later starts from the defaults again. That is
true today and this does not make it worse — but if the auto-chosen setting is ever to be shown
as "we picked Loose for you, change it?", the chosen tuning has to survive the save, and that is a
contract change rather than a UI one.

**The UX rule that keeps this safe:** auto-tuning may choose the *initial* value and must never
override a value the participant has touched. The moment they move a knob, the sweep's opinion is
stale and must stop being applied.

---

## §6 Recommendation

**Build it, in three steps, each independently shippable:**

1. **The scorer, pure and tested, wired to nothing.** `holes`, `piecesOf`, `biteWithinPerson`,
   `leak`. Validate on the recorded demo crowd (`scripts/demo-participants.dump.json`), which
   already exists for exactly this kind of regression and already has measured statistics behind
   ADR-072's defaults — the largest detached stray is 80 cells and the smallest main subject is
   5,788.
   **BUILT — `apps/web/src/lib/avatar/cutOutScore.ts` (ADR-212), unit-tested in `cutOutScore.test.ts`, wired to nothing.**
   The demo-crowd half of this step is *not* done and cannot be done here; see §6.1.
2. **`chooseTuning`, still wired to nothing**, plus a report over the demo crowd: for each photo,
   what the current fixed default scores versus what the sweep picks. **This is the step that
   decides whether to ship.** If the sweep agrees with `DEFAULT_TUNING` on most photos and
   disagrees only where the current default visibly damages the subject, it is a win. If it
   wanders on photos that are already fine, it is not, and the honest outcome is to use the scorer
   only as a *detector* — keep the default, and surface a hint when it has probably bitten.
3. **Wire it in** as the initial tuning only, behind the rule in §5.

That middle step is the point of the staging. The feature is cheap enough to build that the only
real risk is shipping it without evidence that it helps, and the corpus to get that evidence is
already in the repository.

### 6.1 Step 2 is blocked here, and it is worth saying exactly how

The corpus is real — `images/ingest/social-*.png`, twenty of the eighty photographs the recorded
demo crowd was generated from (the other sixty are in `images/ingest/social/`; see defect C1 in
`cutoutCorpus.test.ts`). Scoring them needs their mattes, mattes need MODNET, and MODNET needs weights
from `huggingface.co`, which this sandbox cannot reach (nor `cdn.jsdelivr.net`, nor
`storage.googleapis.com`; `@huggingface/transformers` installs, and its first fetch is refused).
The model has always run in the participant's browser, which is the right place for it and the
wrong place for a batch report.

So step 2 needs one of: a machine with network to run the sweep offline, or a throwaway page in
the dev app that loads the twenty photographs, runs the existing in-browser pipeline and dumps the
table. The second is probably less work and uses the code path that actually ships.

**BUILT — `/cutout-report.html` on the dev server.** The agent's sandbox has no network; the
*browser* looking at the dev server does, and that is where MODNET has always run. The page walks
all 26 photographs in `images/ingest/`, runs `photoFileToSprite` → `refineWithModel` →
`chooseTuning` — the shipped path, not a re-implementation — and for each one prints the crop, the
mask the default produces, the mask the chooser picks, and the numbers behind both. It ends with
the verdict stated as a rule rather than left to the reader:

> *moved only where the default does damage* ⇒ the gate is met;
> *moved on photographs the default handles cleanly* ⇒ keep it as a detector.

It is dev-only by construction rather than by a flag: it is not a route, it lives outside `src/`,
and `vite build` takes `index.html` alone, so it cannot reach production. The photographs are
served by a `apply: 'serve'` middleware in `vite.config.ts` rather than copied into `public/`,
because a fixture should not be in the shipped bundle.

**The result of running it is not in this document, because the run needs a browser and a human
to look at the pictures.** That is the remaining gap, and it is now one click wide rather than an
infrastructure problem.

**Handed off rather than waited on (ADR-215).** The gap stayed one click wide for as long as the
click could not be made here, so the experiment is now packaged for someone who can make it: a
Playwright gate (`e2e/participant/cutout-chooser.spec.ts`, `npm run test:e2e:cutout`) that drives
the page and asserts six pre-registered criteria, a headless screening runner
(`apps/web/scripts/cutout-corpus-report.ts`) for a host with network but no browser, and a
self-contained runbook — **[`cutout-chooser-validation.md`](./cutout-chooser-validation.md)** —
written for a reader who has not seen this document. It carries the acceptance criteria, what to
do with each outcome, and the standing rule that the provisional constants may be set from the
first run **once**, because setting them repeatedly until the gate goes green is fitting to the
test. **None of the three has ever been run.** Whoever runs one should write the numbers into §7
below.

**What stood in for it meanwhile:** four named synthetic failure modes in
`probe-cutout-scoring.ts`, asked the same question the demo crowd will be asked. The current
answer is the one the gate is looking for — *agrees with `DEFAULT_TUNING` on a clean matte, moves
to `Loose` only where a region is ambiguous* — but on fixtures built by the same person who wrote
the metric, which is worth exactly as much as that sounds.

### 6.2 What step 1 found, which is the argument for having done it this way

Two scoring designs optimised in the wrong direction, and the second one was invisible.

The first is §3.2's: bite measured globally scores bystander pruning as damage.

The second only appeared once `chooseTuning` existed and was pointed at a *clean* matte. Bite and
leak are both zero everywhere on a good photograph, so every setting tied — and the winner was
whichever candidate the generating loops emitted first, which is `Trim`. The chooser was shaving a
cell off every well-photographed participant and printing a perfect score while it did. Bite is
measured on *confident* subject and a soft edge is not confident, so neither of the first two keys
defends the subject's outline at all.

The fix is a third sort key: distance from `DEFAULT_TUNING`. **A default moves only when it is
measurably better.** The general version is worth keeping: *when a score ties across the whole
search space, something other than the score is choosing, and it is usually an array order.*

---

## §7 What was measured, and what is still a guess

**Measured here:** the sweep cost (8.7 ms for 18 settings, 11.2 ms with the hole detector, 0.62 ms
each), the crop-candidate cost (25–41 ms, which *contradicts* ADR-073's 5.8 ms and is reported as
a disagreement rather than reconciled), and the joint 90-candidate grid at 284 ms; that the global
bite
metric scores bystander removal as 6.6 % damage; that enclosed-hole count is 0 across all 18
settings on a clean matte and 108–220 on one with an ambiguous region; that restricting bite to
the face-connected component removes the false signal.

**Still a guess, and listed so it is not mistaken for a finding:** every number above comes from a
*synthetic* matte built to have the right shape — a soft-edged blob, a detached bystander, an
ambiguous patch. It is enough to prove the metrics respond to the right things and to kill the
scoring design that was wrong. It is **not** evidence about real photographs, and the hole
tolerance, the confidence thresholds (224/32) and the plateau width should all be set from the
demo crowd in step 1 rather than from the constants in this document.

That distinction is the same one ADR-205 learned the expensive way: a number carried forward
through three documents is worth re-measuring before anyone plans around it — which is exactly
what happened to ADR-073's 5.8 ms the moment this probe timed it directly.

**Measured since, by building it (ADR-212):** that a chooser with only bite and leak moves a
clean photograph, because the two metrics tie and the array order decides; and that a third key
pinned to `DEFAULT_TUNING` fixes it, after which the chooser agrees with the shipped default on a
clean matte and moves only where a region is ambiguous.

**Also still a guess:** whether the crop needs searching at all. §2.1 prices the axis and argues
it does not, on the grounds that BlazeFace already supplies a scale estimate — but no photograph
in the demo crowd has yet been checked for a crop that the detector got wrong *and* that the hole
or bite metrics would have caught. That check belongs in step 1 alongside the others.
