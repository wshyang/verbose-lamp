import { expect, test } from '@playwright/test';
import { signInSuperadmin, stamp } from '../support/fixtures.js';

/**
 * ADR-325 — every stage picks where its teams come from, and shows what it takes in and sends on.
 *
 * Driven through the Simulator, as tournament-tabs.spec.ts is: it runs the engine bundled for the
 * browser and writes nothing, so it is parallel-safe on the shared stack. What a real browser proves
 * that the jsdom page tests cannot: the engine's `describePipelineFlow` and `validatePipeline` run in
 * the bundle, the disabled `<option>` really cannot be chosen, and the rehearsal plans a day whose
 * second stage is a pool fed by the first.
 */

const PIPELINE = 'pipeline';

test.describe('the stage builder — where a stage’s teams come from', () => {
  test('a pool in stage 2 can take stage 1’s qualifiers, and every stage describes itself', async ({ page }) => {
    await signInSuperadmin(page);
    await page.goto('/admin/tournament/simulator');
    await expect(page.getByTestId('simulator__room')).toContainText('registered');
    await page.getByTestId('simulator__build').selectOption(PIPELINE);
    // A fixed field, so the answer does not depend on how many teams other files registered.
    await page.getByTestId('simulator__teamCount').fill('9');

    // The template, described: nine teams into three groups of three, the top four on to a knockout.
    await expect(page.getByTestId('simulator__stage-0-ingress')).toHaveText('In: 9 entered teams');
    await expect(page.getByTestId('simulator__stage-0-shape')).toHaveText('3 groups of 3, 9 matches');
    await expect(page.getByTestId('simulator__stage-1-ingress')).toHaveText('In: 4 from GRP');

    // The first stage has no earlier stage to take from: the option exists, and cannot be chosen.
    const firstSource = page.getByTestId('simulator__stage-0-source');
    await expect(firstSource.locator('option[value="advancers"]')).toBeDisabled();
    await expect(firstSource).toHaveValue('initial');

    // Stage 2 becomes a pool. It KEEPS taking GRP's finishers (the control used to vanish and reset).
    await page.getByTestId('simulator__stage-1-format').selectOption('pool');
    await expect(page.getByTestId('simulator__stage-1-source')).toHaveValue('advancers');
    await page.getByTestId('simulator__stage-1-count').fill('6');
    await page.getByTestId('simulator__stage-1-group-count').fill('2');
    await expect(page.getByTestId('simulator__stage-1-ingress')).toHaveText('In: 6 from GRP');
    await expect(page.getByTestId('simulator__stage-1-shape')).toHaveText('2 groups of 3, 6 matches');
    // GRP now sends six on: three winners and the three best runners-up.
    await expect(page.getByTestId('simulator__stage-0-egress')).toContainText('Out: 3 group winners + the best 3 runners-up');

    // The rehearsal plans the whole day, including the pool that has no teams yet: 9 + 6 matches.
    await expect(page.getByTestId('simulator__fit')).toContainText('15 matches');
    await page.screenshot({ path: `screenshots/ft-stage-source-${stamp()}.png`, fullPage: true });
  });

  test('a stage that cannot be built says why, instead of showing numbers that would be wrong', async ({ page }) => {
    await signInSuperadmin(page);
    await page.goto('/admin/tournament/simulator');
    await expect(page.getByTestId('simulator__room')).toContainText('registered');
    await page.getByTestId('simulator__build').selectOption(PIPELINE);
    await page.getByTestId('simulator__teamCount').fill('4');
    await page.getByTestId('simulator__stage-0-group-count').fill('4');
    await expect(page.getByTestId('simulator__stage-0-problem')).toContainText(/at least two teams/i);
    await expect(page.getByTestId('simulator__stage-0-shape')).toHaveCount(0);
  });

  test('open play can be fed too, and says matches are staged by hand', async ({ page }) => {
    await signInSuperadmin(page);
    await page.goto('/admin/tournament/simulator');
    await expect(page.getByTestId('simulator__room')).toContainText('registered');
    await page.getByTestId('simulator__build').selectOption(PIPELINE);
    await page.getByTestId('simulator__teamCount').fill('9');
    await page.getByTestId('simulator__stage-1-format').selectOption('open');
    await expect(page.getByTestId('simulator__stage-1-source')).toHaveValue('advancers');
    await expect(page.getByTestId('simulator__stage-1-shape')).toHaveText('Open play: matches are staged by hand');
    await expect(page.getByTestId('simulator__stage-1-ingress')).toHaveText('In: 4 from GRP');
  });
});
