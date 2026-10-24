import { expect, test, type Page } from '@playwright/test';

/**
 * ADR-212/215 — does `chooseTuning` earn the right to pick the cut-out default?
 *
 * ## What this is for, in one paragraph
 *
 * A participant uploads a photograph. The app auto-crops it, runs MODNET over it to remove the
 * background, and paints a 64×64 sprite. The background removal is controlled by `CutOutTuning`
 * (`apps/web/src/lib/avatar/cutOut.ts`), and every participant gets the same fixed
 * `DEFAULT_TUNING`. On some photographs that default takes a chunk out of the subject — an arm
 * against a wall the same colour as their shirt. `cutOutScore.ts` sweeps the settings, scores
 * them with no ground truth available, and proposes a better opening position. **This suite is
 * the decision procedure for whether that proposal ships.** It is not a regression test for code
 * that is already trusted; it is the experiment that decides what the code is allowed to do.
 *
 * ## Why it is gated, and why it cannot run everywhere
 *
 * Scoring a photograph needs its matte. The matte comes from MODNET through Transformers.js,
 * fetched from a CDN at run time (ADR-033), and the crop comes from BlazeFace through MediaPipe,
 * also fetched at run time (ADR-054). **Both need the internet and a real browser engine.** The
 * environment this suite was written in had neither, which is exactly why it is written down
 * this carefully instead of being run and forgotten. It follows the repository's existing
 * convention for tests that need the genuine models: `PSD_E2E_REAL_MODEL=1`, the same switch
 * `model-available.spec.ts` uses for the one test in that file that is not stubbed.
 *
 * ## How to run it
 *
 *     npm run dev                                  # in one terminal: API + web on :5173
 *     PSD_E2E_REAL_MODEL=1 npx playwright test e2e/participant/cutout-chooser.spec.ts
 *
 * Or let Playwright start the stack itself by omitting the first step — `playwright.config.ts`
 * has a `webServer` block that runs `npm run dev` and waits for `/api/health`.
 *
 * It needs: outbound HTTPS to `cdn.jsdelivr.net` (the library) and `huggingface.co` (the ~25 MB
 * of MODNET weights) and `storage.googleapis.com` (the BlazeFace weights); one Chromium;
 * and roughly ten to twenty minutes on a cold cache for 26 photographs. There is no database
 * involvement, nothing is written, and nothing is uploaded — the models come to the pictures.
 *
 * ## What it actually drives
 *
 * `/cutout-report.html`, a dev-server-only page (`apps/web/tools/cutoutReport.ts`). That page
 * walks every photograph in `images/ingest/` through `photoFileToSprite` → `refineWithModel` →
 * `chooseTuning` — **the code path that ships**, not a re-implementation of it. That distinction
 * is load-bearing: two scoring designs in this feature have already turned out to optimise in the
 * wrong direction, and a measurement taken through a parallel implementation would not have
 * caught either. The page publishes `window.__CUTOUT_REPORT__` when it finishes.
 *
 * ## The corpus, and its limits
 *
 * 26 photographs in `images/ingest/`: twenty `social-*`, four `booth-*`, two `passport-*`. The
 * twenty `social-*` are among the demo crowd's sources; the booth and passport ones are not, and
 * the crowd's other sixty sit in `images/ingest/social/`, which this walk does not reach (defect
 * C1 in `cutoutCorpus.test.ts`). They are themselves generated images, not phone snaps from a
 * beach. The case the whole feature exists for, a café selfie with a crowd behind it, is **not in
 * here**. A pass is therefore necessary and not sufficient; see §Outcomes.
 *
 * ## The acceptance criteria, and why each one is the one it is
 *
 * The suite re-derives its verdict from the raw rows rather than reading the page's own `gate`
 * field. A tool that grades its own homework is not a gate. If the two disagree, that is itself
 * a failure, and the last test asserts they do not.
 *
 *  1. **The run completed and the model answered.** Measured, not assumed: `noMatte` lists any
 *     photograph MODNET declined. A suite that silently scores three photographs and passes is
 *     worse than a red one.
 *  2. **THE GATE — it must not move a photograph the default already handles cleanly.** This is
 *     the whole decision. A chooser that improves bad photographs and fidgets with good ones is
 *     a net loss, because the good ones are the majority and the fidget is invisible until
 *     somebody's face comes out shaved. Formally: for every row, `moved ⇒ the default had
 *     measurable damage` (enclosed holes > 0, or bite > 0).
 *  3. **It never moves tighter than the default.** Tightening the threshold is what causes the
 *     complaint this feature exists to answer. A tighter pick is not a tuning preference, it is
 *     evidence the objective is inverted — which has happened twice already in this feature.
 *  4. **It never makes a photograph worse by its own metrics.** Chosen bite ≤ default bite and
 *     chosen holes ≤ default holes, per row. This cannot fail while the scorer is correct; it
 *     exists because the scorer has been wrong before in ways that still produced a tidy report.
 *  5. **Where it does move, it has to be worth it.** At least one moved photograph must show a
 *     strictly better score. A chooser that only ever ties is a chooser that should not ship.
 *
 * ## Outcomes — what to DO with the result
 *
 * The criterion is written here, before the numbers exist, because a criterion written afterwards
 * is a rationalisation.
 *
 *  - **All pass** → `chooseTuning` is cleared for step 3: wire it in `AvatarStudio` as the
 *    *initial* tuning only. It must never override a knob the participant has already touched,
 *    and note that `tuning` is absent from `@psd/contracts`, so the choice sets the opening
 *    position but does not survive the save.
 *  - **Criterion 2 fails** → do **not** ship it as a default. Keep the module and use it as a
 *    *detector*: leave `DEFAULT_TUNING` alone and surface a hint on the photographs it flags.
 *    This is a real and acceptable outcome, not a defeat.
 *  - **Criterion 3 or 4 fails** → the objective function is wrong again. Do not tune constants to
 *    get green. Read §3 of `docs/design/cutout-auto-tuning-assessment.md`, find which term is
 *    pointing backwards, and fix the term.
 *  - **Criterion 5 fails but 2–4 pass** → harmless and pointless. Record the numbers and close
 *    the question; do not wire it in.
 *  - **Criterion 1 fails** → an environment problem, not a verdict. Nothing above is informative
 *    until the models actually answered.
 *
 * Record whatever happens with the results template in `docs/design/adr-212-handoff.md` §10,
 * and in `docs/design/cutout-auto-tuning-assessment.md` §6.1.
 */

/** Mirrors `CutOutReport` in `apps/web/tools/cutoutReport.ts`; duplicated so e2e imports no app code. */
interface Candidate {
  tuning: { removeBackground: boolean; threshold: number; minIsland: number; edge: number };
  main: number;
  pieces: number;
  holes: number;
  bite: number;
  leak: number;
  faceIntact: boolean;
  refused: 'face' | 'holes' | null;
}

interface Row {
  name: string;
  chosen: { removeBackground: boolean; threshold: number; minIsland: number; edge: number };
  why: string;
  ambiguity: number;
  agrees: boolean;
  atDefault?: Candidate;
  atChosen?: Candidate;
}

interface CutOutReport {
  corpus: number;
  scored: number;
  noMatte: string[];
  rows: Row[];
  verdict: string;
  gate: 'pass' | 'fail';
}

declare global {
  interface Window {
    __CUTOUT_REPORT__?: CutOutReport;
  }
}

/** ADR-072's shipped default, restated so a change to it makes this suite fail loudly. */
const DEFAULT_THRESHOLD = 128;

/**
 * Twenty-odd photographs, a ~25 MB model download, and MODNET on CPU for each one. Generous on
 * purpose: a timeout here produces a false red that costs another twenty minutes to disprove.
 */
const RUN_BUDGET_MS = 1_800_000;

// Top level, not inside the describe: `test.use` in a group forces a new worker and Playwright
// refuses to load the file at all. Caught by `playwright test --list`, which needs no browser.
test.use({ video: 'off' });

const damaged = (row: Row): boolean => (row.atDefault?.holes ?? 0) > 0 || (row.atDefault?.bite ?? 0) > 0;

const describeRow = (row: Row): string =>
  `${row.name}: default(holes ${row.atDefault?.holes ?? '?'}, bite ${((row.atDefault?.bite ?? 0) * 100).toFixed(1)}%)` +
  ` → chosen threshold ${row.chosen.threshold}, edge ${row.chosen.edge}` +
  ` (holes ${row.atChosen?.holes ?? '?'}, bite ${((row.atChosen?.bite ?? 0) * 100).toFixed(1)}%)`;

async function runReport(page: Page): Promise<CutOutReport> {
  await page.goto('/cutout-report.html');
  const status = page.getByTestId('cutout-report__status');
  await expect(status).toHaveAttribute('data-state', 'done', { timeout: RUN_BUDGET_MS });
  const report = await page.evaluate(() => window.__CUTOUT_REPORT__);
  expect(report, 'the page reported done but published no report').toBeDefined();
  return report as CutOutReport;
}

test.describe('the cut-out chooser, against real mattes (ADR-215)', () => {
  test.skip(
    process.env['PSD_E2E_REAL_MODEL'] !== '1',
    'needs the internet and the genuine MODNET + BlazeFace weights: set PSD_E2E_REAL_MODEL=1',
  );
  test.skip(({ isMobile }) => isMobile === true, 'one browser is enough; this downloads 25 MB');

  let report: CutOutReport;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(RUN_BUDGET_MS + 60_000);
    const page = await browser.newPage();
    report = await runReport(page);
    await page.close();
  });

  test('1 — the model answered for the whole corpus', async () => {
    test.info().attach('report.json', {
      body: JSON.stringify(report, null, 1),
      contentType: 'application/json',
    });
    expect(report.corpus, 'the corpus middleware served nothing — is this the dev server?').toBeGreaterThan(0);
    expect(
      report.noMatte,
      `MODNET declined on ${report.noMatte.length} of ${report.corpus} photographs; nothing below is informative until that is fixed`,
    ).toEqual([]);
    expect(report.scored).toBe(report.corpus);
  });

  test('2 — THE GATE: it does not move a photograph the default already handles cleanly', () => {
    const unjustified = report.rows.filter((row) => !row.agrees && !damaged(row));
    expect(
      unjustified.map(describeRow),
      'the chooser fidgets with good photographs. Do NOT ship it as a default — keep it as a detector ' +
        '(see this file\'s §Outcomes).',
    ).toEqual([]);
  });

  test('3 — it never chooses a tighter threshold than the shipped default', () => {
    const tighter = report.rows.filter(
      (row) => row.chosen.removeBackground && row.chosen.threshold > DEFAULT_THRESHOLD,
    );
    expect(
      tighter.map(describeRow),
      'a tighter pick is the failure this feature exists to prevent; the objective is inverted somewhere',
    ).toEqual([]);
  });

  test('4 — it never makes a photograph worse by its own metrics', () => {
    const worse = report.rows.filter(
      (row) =>
        (row.atChosen?.bite ?? 0) > (row.atDefault?.bite ?? 0) ||
        (row.atChosen?.holes ?? 0) > (row.atDefault?.holes ?? 0),
    );
    expect(worse.map(describeRow), 'the chooser picked a candidate its own score rates lower').toEqual([]);
  });

  test('5 — where it moves, the move is an improvement rather than a tie', () => {
    const moved = report.rows.filter((row) => !row.agrees);
    test.skip(moved.length === 0, 'it agreed with the default everywhere — criterion 5 does not apply');
    const improved = moved.filter(
      (row) =>
        (row.atChosen?.bite ?? 0) < (row.atDefault?.bite ?? 0) ||
        (row.atChosen?.holes ?? 0) < (row.atDefault?.holes ?? 0),
    );
    expect(
      improved.length,
      `${moved.length} photographs moved and none measurably improved; the chooser is churn`,
    ).toBeGreaterThan(0);
  });

  test('6 — the page\'s own verdict agrees with this suite\'s', () => {
    const unjustified = report.rows.filter((row) => !row.agrees && !damaged(row));
    expect(
      report.gate,
      `the page says ${report.gate} and the suite derives ${unjustified.length === 0 ? 'pass' : 'fail'};` +
        ' one of the two definitions of "damage" has drifted',
    ).toBe(unjustified.length === 0 ? 'pass' : 'fail');
  });
});
