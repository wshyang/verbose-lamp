# ADR-212 handoff: run the cut-out chooser checks where the model hosts are reachable

**For:** whoever runs the ADR-212 step-2 measurement on a machine that can reach the model hosts.
**Branch:** `arena/1952d326-special-fiesta`. It holds the chooser (scorer, gate, report, screen). PR #5 is the review vehicle.
**Written:** 2026-10-08, in a sandbox that cannot reach those hosts. Nothing in this document has been measured against a model. Record your commit in §10.

---

## 0. Read this first

- **What ADR-212 is.** A proposal that the studio choose its own background-removal setting for each photograph, instead of always using the shipped default. Step 1 is the scorer: built and unit-tested, wired to nothing. Step 2 is a measurement on real photographs: built, never run. Step 3 is wiring the chooser into the studio: not started. The decision is open. §1 has the detail.
- **What you will run.** The gate, `npm run test:e2e:cutout`: six criteria, checked against the real MODNET model in Chromium. Expect 10–20 minutes on a cold cache. Optionally, the headless screen (§6) and the eyeball page (§7).
- **What the result decides.** Whether the chooser may go further. Runbook §7 is the decision rule and is quoted in §8.4. A green gate is evidence about 26 generated photographs, not about phone photographs (§11).
- **Expected failures are not results.** Four tests record known defects (`it.fails`). They pass while the defects exist. If one turns red, a defect has been fixed (§9).
- **There is nothing to compare against yet.** No gate or screen result has been recorded anywhere in the repository. Yours is the first.

---

## 1. Status, as of 2026-10-08

| ADR-212 step (`docs/design/cutout-auto-tuning-assessment.md` §6) | State | Where |
| --- | --- | --- |
| 1. Scorer `chooseTuning`: sweep, plateau, snap | Built. 30 unit tests in its file, 3 of them expected failures. Wired to nothing. | `apps/web/src/lib/avatar/cutOutScore.ts`, `cutOutScore.test.ts` |
| 2. Measure it on the corpus | Built. Never run against a model. | gate `e2e/participant/cutout-chooser.spec.ts`; page `apps/web/cutout-report.html`; screen `apps/web/scripts/cutout-corpus-report.ts` |
| 3. Wire it into the studio | Not started. Nothing in the studio calls `chooseTuning`. | — |
| Decision | Open. | ADR-212 and ADR-215 in `docs/addenda/ADDENDA.md`. ADR-215 fixes the gate's six criteria. |

The studio still opens every photograph on `DEFAULT_TUNING` (threshold 128, minimum island 512, edge 0). The scorer has three known defects, all recorded in §9.

---

## 2. Prerequisites

**Machine.** Node.js 20.11 or later (`engines` in `package.json`). The sandbox used Node 22.22.3 and npm 10.9.8. You also need git and enough disk for `node_modules` and a Chromium build. You do not need a desktop browser: Playwright drives its own Chromium.

**Network.** The machine must reach these hosts over HTTPS. The list comes from the code (`segmentPhoto.ts`, `locateFace.ts`, the gate's header). It has not been checked from the machine you will use.

| Host | What needs it | When |
| --- | --- | --- |
| `github.com` | `git clone` | once |
| `registry.npmjs.org` | `npm ci`; `npm install --no-save` for the screen | once |
| `cdn.playwright.dev`, or `playwright.download.prss.microsoft.com` | Chromium, via `npx playwright install chromium` | once |
| `cdn.jsdelivr.net` | Transformers.js 4.3.0 (`segmentPhoto.ts:20`) and MediaPipe `tasks-vision` 1.0.1 (`locateFace.ts:22`), both loaded by the page | every cold browser cache |
| `huggingface.co` | MODNET weights, `Xenova/modnet` (`segmentPhoto.ts:22`), about 25 MB | first run; the browser caches them after that |
| `storage.googleapis.com` | BlazeFace face-detector weights (`locateFace.ts:34`) | first run; cached after that |

A TLS-inspecting proxy breaks the model downloads. If the preflight below fails with a certificate error, that is the likely cause. Do not get around it by turning certificate checks off.

**Preflight.** About a minute. Run it before anything long:

```bash
for u in \
  https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/package.json \
  https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/package.json \
  https://huggingface.co/api/models/Xenova/modnet \
  https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite \
  https://cdn.playwright.dev/ ; do
  printf '%s  %s\n' "$(curl -sSL -o /dev/null -w '%{http_code}' --max-time 15 "$u")" "$u"
done
```

The first four should print `200`. `000` means no connection at all. `403` or `451` means something is blocking the host. The last line is only a reachability check, so any HTTP status means it answered. These commands have not been run from the sandbox, because those hosts are outside its allowlist. If one prints something unexpected, trust the printed result and note it in §10.

**Browser.** Playwright 1.63.0 installs its own Chromium (`npx playwright install chromium`). The gate runs only the `desktop-chrome` project, so it does not need WebKit. To use a different Chromium binary, set `PSD_E2E_CHROMIUM=/path/to/chromium`, and record its version in §10.

**OS notes.**
- Linux: Chromium may need system libraries. `npx playwright install-deps chromium` installs them and needs sudo.
- Windows: the npm script sets `PSD_E2E_REAL_MODEL=1` inline, which PowerShell and cmd do not accept. Use Git Bash or WSL. Or, in PowerShell: `$env:PSD_E2E_REAL_MODEL='1'; npx playwright test e2e/participant/cutout-chooser.spec.ts --project=desktop-chrome`.

---

## 3. Setup (once)

```bash
git clone https://github.com/wshyang/special-fiesta.git
cd special-fiesta
git checkout arena/1952d326-special-fiesta
git log -1 --format='%H %s'      # record this hash in §10
npm ci                           # the lockfile's versions; AGENTS-workflow §1b says npm install, which also works
cp .env.example .env             # then set SUPERADMIN_INITIAL_PASSCODE to 4 digits
npx playwright install chromium  # Chromium only; the gate does not use WebKit
```

- The database is embedded (PGlite, under `.data/dev`). There is nothing to install. The dev stack falls back to `.env.example` if `.env` is missing, but copy it anyway, as AGENTS-workflow §1b asks.
- `.env` is never committed (`.gitignore` enforces it).

---

## 4. Offline checks (run these first; they need no model)

These show that the repository is in the state the gate expects. They measure nothing.

```bash
npm run verify                                                              # typecheck, lint, standards, unit suites, build
cd apps/web && npx vitest run src/lib/avatar/cutOutScore.test.ts src/lib/avatar/cutoutCorpus.test.ts; cd ../..
npx tsx apps/web/scripts/probe-cutout-scoring.ts                            # exit 0; prints MOVES lines from synthetic mattes
npx playwright test e2e/participant/cutout-chooser.spec.ts --list --project=desktop-chrome   # ends with "Total: 6 tests in 1 file"
```

**Expected**, as measured in the sandbox at the commit that added this file:

- `npm run verify`: exit 0. Typecheck, lint and the web build are clean. Standards: 556 files, 17 rules, 0 violations. API: 800 passed, 3 skipped. Web: 137 files, 1461 passed. About nine minutes.
- vitest: `Tests 34 passed (34)`. That is 30 in `cutOutScore.test.ts` and 4 in `cutoutCorpus.test.ts`. Four of them are expected failures, which count as passes (§9).
- probe: exit 0, three `MOVES` lines, all to threshold 80. They come from synthetic torso patches at alpha 105, 150 and 60.
- list: `Total: 6 tests in 1 file`.

`npm run verify` runs no Playwright test and touches no model. Green here shows only that the code is consistent. It says nothing about whether the chooser is any good.

---

## 5. The gate (ADR-215)

```bash
npm run test:e2e:cutout
```

That runs `PSD_E2E_REAL_MODEL=1 playwright test e2e/participant/cutout-chooser.spec.ts --project=desktop-chrome`.

What happens, in order:

1. Playwright's `webServer` runs `npm run dev` (API and web) and waits up to 120 seconds for `http://127.0.0.1:5173/api/health`. A healthy server already on that port is reused. `PSD_E2E_NO_SERVER=1` skips starting one. `PSD_E2E_BASE_URL` changes the URL.
2. The spec opens `/cutout-report.html`. The page walks the 26 photographs (§11), runs the shipped pipeline in the browser (`photoFileToSprite`, then `refineWithModel`, then `chooseTuning`), and sets `data-state="done"` when it finishes. The spec waits up to 30 minutes for that.
3. Six tests check the rows. Each one re-derives its verdict from the raw rows rather than trusting the page's own `gate` field.
4. The report is attached to test 1 as `report.json`.

The six criteria (runbook §6). ADR-215 fixes them. Changing one needs a new ADR.

| # | Test (abbreviated) | Passes when |
| --- | --- | --- |
| 1 | the model answered for the whole corpus | MODNET returned a matte for every photograph (`noMatte` is empty) and the corpus is not empty |
| 2 | **THE GATE:** it does not move a photograph the default already handles cleanly | every move is onto a photograph where the default had holes or bite |
| 3 | it never chooses a threshold tighter than the shipped default | no chosen threshold is above 128. A higher threshold cuts more, so it is the tighter one. |
| 4 | it never makes a photograph worse by its own metrics | per photograph, chosen bite ≤ default bite and chosen holes ≤ default holes |
| 5 | where it moves, the move is an improvement rather than a tie | at least one move is strictly better |
| 6 | the page's own verdict agrees with this suite's | the page's `gate` field matches the suite's |

**Expected output:** the list reporter prints one line per test, then a summary such as `N passed` or `N failed`. **Timing:** 10–20 minutes on a cold cache (the spec's own estimate). It is faster once the browser has cached the weights.

**Where the output goes.** `test-results/` (gitignored) holds the `report.json` attachment, and a video per test unless you set `PSD_E2E_VIDEO=off`. Find the report with `find test-results -name report.json`. If that finds nothing, run the gate once more with `npm run test:e2e:cutout -- --reporter=list,html` and open the result with `npx playwright show-report`. Do not set `CI=1` to get an HTML report: it also turns on a retry, which doubles the time a red run takes.

---

## 6. The headless screen (optional; it is not the gate)

```bash
npm install --no-save @huggingface/transformers@4.3.0 sharp
npx tsx apps/web/scripts/cutout-corpus-report.ts --json out.json
```

- **Exit 0:** no photograph moved that the default handles cleanly. Criterion 2 holds on the screen.
- **Exit 1:** it moved on at least one such photograph. The names are printed.
- **Exit 2:** the run could not complete, for example because the weights were unreachable. The message says why.
- It uses `faceBox`, a skin-colour estimate, where the browser uses BlazeFace. Its crops therefore differ, and a disagreement with the gate is expected. The gate wins. The script's header says so.
- It checks criterion 2 only. It is not the six-criteria gate.
- `--json out.json` writes its rows and `noMatte` list. That file has a different shape from the gate's `report.json` (§8.3).
- It needs `huggingface.co` for the weights (about 25 MB, cached under `node_modules/.cache`). Expect a couple of minutes once warm, per the script's own comment.
- `--no-save` is deliberate (ADR-033). Do not add these packages to `package.json`.

---

## 7. The eyeball page (runbook §5.2)

With `npm run dev` running (the gate stops its server when it ends), open `http://127.0.0.1:5173/cutout-report.html`. Wait until the status line says it is done. Look at every card marked `MOVES`: the crop, the mask the default produces, and the mask the chooser picks. No criterion looks at the pictures. You are the only check on a face that has been cut off. Write down what you saw for each moved card.

---

## 8. Reading the result

### 8.1 Environment failures, which are not verdicts

- **Criterion 1 fails, or `noMatte` is not empty.** The model did not answer. Check §2 (hosts and proxy) and run again. Nothing else in the run is informative until this passes.
- **The status line reads `stopped: …`** (`data-state="failed"`). The page's run threw an error. **The gate does not notice.** It keeps waiting for `done` for up to 30 minutes. Read the status text on the page, then stop the run with Ctrl-C. AGENTS-workflow §4b says to kill a run you know is bad.
- **The run hits the 30-minute budget.** Check the network first, then the page.

### 8.2 Real verdicts

Criteria 2, 3, 4 and 5 are verdicts on the photographs. A failure is a result. Record it. Do not adjust constants until it passes. Runbook §7 says so, and gives the reasoning.

Criterion 6 failing means the tooling disagrees with itself. Read both sides before anything else.

### 8.3 Telling D1 and D2 apart from a new finding

Both known defects can show up on real photographs. After the gate run, check for them with this snippet. It reads the gate's `report.json`, which has `corpus`, `scored`, `noMatte`, `gate`, `verdict` and `rows`. It does not read the screen's `--json` output, which has only `rows` and `noMatte`. It needs only Node:

```bash
node -e '
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log(`corpus ${report.corpus}, scored ${report.scored}, noMatte ${report.noMatte.length}, gate ${report.gate}`);
console.log(report.verdict);
for (const row of report.rows) {
  const d = row.atDefault;
  const c = row.atChosen;
  const damaged = Boolean(d) && (d.holes > 0 || d.bite > 0);
  const flags = [];
  if (!row.agrees && !damaged) flags.push("D1 moved-undamaged");
  if (c && c.refused) flags.push("D2 chosen-refused:" + c.refused);
  if (!row.agrees || flags.length > 0) {
    console.log(row.name.padEnd(28), "moved:" + !row.agrees, "threshold:" + row.chosen.threshold, flags.join("  "));
  }
}' "$(find test-results -name report.json | head -1)"
```

On Windows, run it in Git Bash or WSL. The snippet has been tested against a small synthetic `report.json` containing one row of each kind. It has not been run against a real result.

What it prints:

- **`D1 moved-undamaged`.** The chooser moved a photograph that the default did not damage. That is defect D1 showing up on a real photograph. It is a real finding about the chooser, and its mechanism is known. Record it as "D1 on N photographs" with the names. It does not mean the gate is broken. Fixing D1 is a decision (§9).
- **`D2 chosen-refused:<face|holes>`.** The chosen setting is one the scorer refuses. No criterion reads `refused`, so **the gate can be green while D2 happens**. Record every D2 row.
- **A moved row with no flag.** The default did show damage, so the move is what the chooser is for. Look at it on the eyeball page (§7).

### 8.4 Outcomes (runbook §7, condensed; §7 itself is the rule)

| Result | What runbook §7 says | What this handoff adds |
| --- | --- | --- |
| All six pass | Cleared for step 3, as the *initial* tuning only. It must never override a knob the participant has touched. `tuning` is not in `@psd/contracts`, so the choice does not survive a save. | If there are D2 rows, do not treat this as cleared. The chooser is returning refused settings. |
| Criterion 2 fails | Do not ship it as a default. Demote it to a detector. Record which photographs and why. | The failing rows are exactly the `D1 moved-undamaged` rows the snippet in §8.3 flags. Count and name them. |
| Criterion 3 or 4 fails | The objective is wrong. Do not tune constants until it goes green. Read assessment §3. | — |
| Criterion 5 fails, 2–4 pass | Harmless and pointless. Write it down and close the question. | — |
| Criterion 1 fails | An environment problem, not a verdict. | — |

Runbook §7 also says the constants (`HOLE_TOLERANCE`, the confidence bands, the plateau width) are provisional, and that you may change them **once**, from this corpus. Setting them repeatedly until criterion 2 passes is fitting to the test.

---

## 9. Known defects, recorded as expected failures

| ID | Test (file) | The claim the test makes | Why it fails today (synthetic fixture) |
| --- | --- | --- | --- |
| D1 | "D1 — does not move a setting that does no measurable damage" (`cutOutScore.test.ts`) | The chooser keeps the default when the default does no damage. | Torso alpha 150. The default has 0 holes and 0 bite. The plateau centre is 96, which snaps to threshold 80, so the chooser moves. |
| D2 | "D2 — never returns a setting the scorer refuses" (`cutOutScore.test.ts`) | The returned setting is not refused. | Torso alpha 60. Only threshold 48 survives the sweep. The snap returns 80, which is refused as `face` with 154 holes. |
| D3 | "D3 — the reason line describes the setting it returns" (`cutOutScore.test.ts`) | `why` reports the holes of the setting that is returned. | Same fixture. `why` is built from the unsnapped candidate, so it reads `0 holes` (threshold 48) while the returned setting (80) has 154. |
| C1 | "C1 — walks every photograph the demo crowd was recorded from" (`cutoutCorpus.test.ts`) | The walk covers all 80 photographs the demo crowd was recorded from. | The walk lists only the top level of `images/ingest/` (26 files). The 60 in `images/ingest/social/` are missing. |

**How `it.fails` works.** The test body runs. If it throws, the test passes. If it does not throw, the test fails. So each one passes while its defect exists and goes red once the defect is fixed. Red means: change `it.fails` to `it` on that test, and it then stands as the regression test.

**The trade-off, stated plainly.**

- The branch's suite stays green, so unrelated work is not blocked. The cost is that nothing reminds anyone.
- To make the defects block `npm run verify` now, change `it.fails(` to `it(` on the four lines. A flip check run on this branch showed that each one then fails for the reason in the table, and that nothing else fails.
- Each defect also has ordinary tests in front of it that check the fixture is what the test says it is. If a fixture drifts, those go red on their own.

**The fixes are not made.** D1 to D3 change what the scorer returns. Closing C1 changes the protocol: the gate would walk every photograph the demo crowd is recorded from, which is 120 once the personas in `scripts/demo-personas.json` are recorded (80 when this was written). That is a different experiment from the one ADR-215 describes, so its numbers would not be comparable with a 26-photograph run. Each of these is a decision, and would be recorded as a new ADR (the next free number when it lands).

---

## 10. Recording and returning results

Copy this template into a text file and keep it outside git. Do not commit `report.json` or the videos. They are generated, they live under the gitignored `test-results/`, and if you want them kept, attach them to the review thread.

```text
ADR-212 step-2 run
Date:            YYYY-MM-DD
Commit:          <git log -1 --format=%H>
Branch:          arena/1952d326-special-fiesta
Machine:         <OS, CPU, RAM>
Node / npm:      <node -v> / <npm -v>
Playwright:      <npx playwright --version>
Chromium:        <version>   (or the PSD_E2E_CHROMIUM path)
Preflight:       cdn.jsdelivr.net <code>  huggingface.co <code>  storage.googleapis.com <code>  cdn.playwright.dev <code>
Cache:           cold | warm        Wall clock: <mm:ss>
Env changes:     <none, or list them>

Offline checks (§4):  verify exit <n>; vitest <pass/fail counts>; probe exit <n>; list <n> tests
Gate (§5):            <n> passed / <n> failed
  1 model answered:   pass|fail   corpus=<n> scored=<n> noMatte=<n>
  2 THE GATE:         pass|fail   moved=<n> unjustified=<names, or none>
  3 no tighter:       pass|fail
  4 bite and holes:   pass|fail
  5 strictly better:  pass|fail   better=<n>
  6 page agrees:      pass|fail
  verdict text:       "<paste report.json .verdict>"
Known-defect rows (§8.3):   D1 <n> <names>    D2 <n> <names and refusal>
Eyeball (§7):               moved cards viewed <n>; notes, one line each
Screen (§6):                not run | exit <n>, output <paste>
Not run, and why:           <list>
```

Then:

1. Record the outcome as a **new ADR**, not an edit to ADR-212 or ADR-215. The register is append-only (AGENTS-decisions). The next free number, in land order, is the one after the last entry in `docs/addenda/ADDENDA.md` when the outcome is recorded. Add it to `docs/addenda/ADDENDA.md`.
2. Write the numbers into `docs/design/cutout-auto-tuning-assessment.md` §7, as the runbook asks.
3. The commit message must say which layers ran and which did not (AGENTS-workflow §4). For example: `Validated: gate run on <machine>, six criteria <result>; headless screen not run; offline verify, unit suites and probe ran in the sandbox.`

---

## 11. What this does not establish

- Whether participants prefer the chooser's pick to the default. Nothing here measures that.
- Anything about the 60 photographs in `images/ingest/social/` (defect C1). Nothing walks them.
- Phone photographs, real backgrounds, cafés, crowds (runbook §4). The 26 photographs are generated images.
- Anything in the studio. Nothing calls `chooseTuning`.
- Mobile or WebKit. The gate runs `desktop-chrome`, and the spec skips the mobile projects.
- Speed, memory or battery life on phones.
- ADR-212 step 1's demo-crowd check. The assessment records it as not done.
- Whether the six criteria are the right ones. ADR-215 fixes them, and a change needs a new ADR.
- That a green gate rules out D2 (§8.3).

---

## 12. What changed on this branch, and known drift

Files changed by the commit that adds this handoff:

- `docs/design/adr-212-handoff.md`: this file.
- `apps/web/tools/cutoutCorpus.ts`: new. The one definition of the walk, `listCutoutCorpus`.
- `apps/web/vite.config.ts`: the dev `/corpus` routes now use that helper. Comment corrected.
- `apps/web/scripts/cutout-corpus-report.ts`: the headless screen uses the same helper. Behaviour unchanged.
- `apps/web/src/lib/avatar/cutOutScore.test.ts`: fixture-sanity tests, and expected-failure tests D1 to D3.
- `apps/web/src/lib/avatar/cutoutCorpus.test.ts`: new. Fixture-sanity tests, a pin of the 26-photograph walk, and expected-failure test C1.
- `e2e/participant/cutout-chooser.spec.ts`: comment only. The corpus paragraph is corrected, and the header now points at §10 of this file.
- `docs/design/cutout-chooser-validation.md`: corrected the corpus claim (26 versus 80), the test count, the typecheck scope, the preamble quote, and the attributions to `seedIslands.test.ts` and ADR-072.
- `docs/design/cutout-auto-tuning-assessment.md`: corrected the crowd attribution and the test count.

Known drift, not fixed here:

- The gate waits for `data-state="done"` only. A `failed` state is not noticed for up to 30 minutes (§8.1). Changing that is a gate change, so it needs its own review and a real browser run.
- The gate spec is outside `npm run typecheck`. Under the web tsconfig's strictness it reports TS4111 at line 173 (`process.env.PSD_E2E_REAL_MODEL`). Playwright does not typecheck, so the gate still runs.
- AGENTS-testing §10 names `e2e/photo-stubs.ts`. The file is at `e2e/support/photo-stubs.ts`.
