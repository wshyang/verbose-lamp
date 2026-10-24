import { expect, test, type Locator } from '@playwright/test';
import { signInSuperadmin, stamp } from '../support/fixtures.js';

/**
 * ADR-291 — a console button's label is readable on the button it is painted on, in both themes.
 *
 * ADR-257 made the console light by default and gave every `.console-button` a pale fill under
 * `[data-console-theme='light']`. That selector out-ranks `.console-button--primary` and
 * `--danger`, so on the light theme their own fills were dropped while their white labels stayed:
 * white on #dde6ee, about 1.3:1, on every primary and danger button on every staff screen. The
 * palette test (`console.css.test.ts`) checks tokens against grounds and could not see it — the
 * defect is in which rule wins, and only a stylesheet resolved by a browser says that.
 *
 * So this reads the COMPUTED colour and fill of real buttons and requires WCAG AA (4.5:1).
 */

function channel(value: number): number {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: string): number {
  const [r = 0, g = 0, b = 0] = (rgb.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(one: string, other: string): number {
  const [hi = 0, lo = 0] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

async function labelContrast(button: Locator): Promise<number> {
  const paint = await button.evaluate((node) => {
    const style = getComputedStyle(node);
    return { color: style.color, fill: style.backgroundColor };
  });
  return contrast(paint.color, paint.fill);
}

test.describe('ADR-291 — console button labels stay readable', () => {
  test.skip(({ isMobile }) => isMobile === true, 'A stylesheet is the same on both widths; proven once per engine.');

  for (const theme of ['light', 'dark'] as const) {
    test(`primary and danger labels clear AA on the ${theme} console`, async ({ page }) => {
      await page.addInitScript((stored) => window.localStorage.setItem('psd.console-theme.v1', stored), theme);
      await signInSuperadmin(page);
      await page.goto('/admin/tournament');
      await expect(page.locator('.theme-console')).toHaveAttribute('data-console-theme', theme);

      // A primary that is never disabled on this page: the Courts form's submit.
      const primary = page.getByTestId('tournament-courts__submit');
      await expect(primary).toBeEnabled();
      expect(await labelContrast(primary), `${theme} primary`).toBeGreaterThanOrEqual(4.5);

      // The selected subtab shares the primary's rule.
      const current = page.getByTestId('tournament-tabs__tab').filter({ hasText: 'Control' });
      expect(await labelContrast(current), `${theme} current tab`).toBeGreaterThanOrEqual(4.5);

      // A plain button keeps its own pale fill and dark label.
      const plain = page.getByTestId('tournament-setup__pick-all').or(page.getByTestId('tournament-courts__edit').first());
      expect(await labelContrast(plain.first()), `${theme} plain`).toBeGreaterThanOrEqual(4.5);

      /*
       * Danger buttons on this page only exist on a live day, and the shared stack never has one. The
       * claim is about the stylesheet, so a danger button is put into the themed shell and measured —
       * the same rules a real one resolves, with nothing written anywhere.
       */
      await page.locator('.theme-console').evaluate((shell) => {
        const danger = document.createElement('button');
        danger.className = 'console-button console-button--danger';
        danger.dataset['testid'] = 'probe__danger';
        danger.textContent = 'Call off';
        shell.append(danger);
      });
      expect(await labelContrast(page.getByTestId('probe__danger')), `${theme} danger`).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({ path: `screenshots/ft-console-buttons-${theme}-${stamp()}.png` });
    });
  }
});
