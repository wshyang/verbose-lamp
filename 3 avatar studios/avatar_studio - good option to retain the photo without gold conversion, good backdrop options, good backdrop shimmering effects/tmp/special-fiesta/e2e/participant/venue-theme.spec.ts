import { expect, test } from '@playwright/test';

/**
 * ADR-294 / ADR-295 / ADR-296 / ADR-297 — the venue theme, in a real browser.
 *
 * jsdom resolves no stylesheet and loads no image, so the layers that matter most here — that
 * `<html data-venue>` actually selects the theme's tokens, that the page is painted in them, and
 * that the sprites a page asks for really come back as images — can only be seen in a browser
 * (AGENTS-testing §1.1). Everything is read from computed style and from the network, not from
 * the DOM attributes that merely claim it.
 *
 * Sentosa is the only venue today, so these pin what Sentosa must look like and prove the
 * mechanism by which any venue would: the tokens are read off the element, not assumed.
 */

test.describe('the venue theme (ADR-294)', () => {
  test('asks the server which venue this is, before anyone has signed in', async ({ page }) => {
    const answered = page.waitForResponse((response) => response.url().endsWith('/api/venue'));

    await page.goto('/');
    const response = await answered;

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ venue: 'sentosa' });
    expect(response.headers()['cache-control']).toBe('no-cache');
  });

  test('puts the venue on <html>, so the tokens reach every element', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-venue', 'sentosa');
  });

  test('paints the page in the venue palette, read from computed style', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-venue', 'sentosa');

    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string) => style.getPropertyValue(name).trim();
      return {
        accent: read('--accent'),
        surface: read('--surface'),
        primary: read('--primary'),
        sceneSky: read('--scene-sky'),
        shoreline: read('--motif-shoreline'),
      };
    });

    expect(tokens.accent).toBe('#ffc72c');
    expect(tokens.surface).toBe('#f5e2b8');
    expect(tokens.primary).toBe('#2f7dd1');
    expect(tokens.sceneSky).toBe('#5fb8ec');
    expect(tokens.shoreline).toMatch(/^url\(['"]?\/themes\/sentosa\/motifs\/wave\.svg\?v=[0-9a-f]{8}['"]?\)$/);

    // A real element, resolved through the cascade: the primary button is the accent.
    const button = page.getByTestId('landing__signup');
    const fill = await button.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(fill).toBe('rgb(255, 199, 44)');
  });

  test('follows a different venue token the moment one is set — the mechanism a second venue uses', async ({
    page,
  }) => {
    await page.goto('/');
    const button = page.getByTestId('landing__signup');
    const before = await button.evaluate((node) => getComputedStyle(node).backgroundColor);

    // Not a venue the product ships: a stand-in that proves the page is painted from the token
    // and not from a literal that happens to equal it.
    await page.evaluate(() => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(":root[data-venue='sentosa'] { --accent: #112233; }");
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    });
    const after = await button.evaluate((node) => getComputedStyle(node).backgroundColor);

    expect(before).toBe('rgb(255, 199, 44)');
    expect(after).toBe('rgb(17, 34, 51)');
  });

  test('puts the stored venue on <html> before React has rendered anything (ADR-298)', async ({ page }) => {
    // A phone that was last at some venue arrives with that venue in storage. The attribute must
    // already be on <html> before the app's own bundle renders anything, not after the first
    // frame: otherwise a returning phone paints the default venue's colours and then switches.
    //
    // "Before React renders" is observed, not inferred: a MutationObserver installed before any
    // page script records the attribute the first time #root gains a child. If the attribute is
    // only set by an effect, it is still absent at that moment.
    await page.addInitScript(() => {
      localStorage.setItem('psd.venue.v1', 'sentosa');
      const seen: { venueAtFirstRender: string | null | undefined } = { venueAtFirstRender: undefined };
      (window as unknown as { __seen: typeof seen }).__seen = seen;
      new MutationObserver((_records, observer) => {
        const root = document.getElementById('root');
        if (root !== null && root.childElementCount > 0) {
          seen.venueAtFirstRender = document.documentElement.getAttribute('data-venue');
          observer.disconnect();
        }
      }).observe(document, { childList: true, subtree: true });
    });

    await page.goto('/');
    await expect(page.getByTestId('landing__signup')).toBeVisible();

    const seen = await page.evaluate(
      () => (window as unknown as { __seen: { venueAtFirstRender: string | null | undefined } }).__seen,
    );
    expect(seen.venueAtFirstRender).toBe('sentosa');
  });

  test('keeps Sentosa a 16:9 strip pinned to the bottom, at a phone and at a desktop (ADR-256, ADR-298)', async ({
    page,
  }) => {
    // The geometry moved from fixed CSS to per-venue tokens (ADR-298). This is the invariant that
    // must not have moved with it: full width, the art's 16:9 height, flush with the bottom.
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      const box = await page.getByTestId('beach-scene').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return { left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, position: style.position };
      });
      const label = `${viewport.width}x${viewport.height}`;

      expect(box.position, label).toBe('fixed');
      expect(box.left, label).toBe(0);
      expect(box.width, label).toBeCloseTo(viewport.width, 0);
      expect(box.height, label).toBeCloseTo((viewport.width * 9) / 16, 0);
      expect(box.bottom, label).toBeCloseTo(viewport.height, 0);
    }
  });

  test('draws a plate scene at the art\'s own aspect on every screen shape, never stretched or cropped (ADR-298)', async ({
    page,
  }) => {
    // No shipped venue is a plate yet, so a stand-in `.gb-scene[data-fit=plate]` is attached with
    // the aspect of a 240x426 portrait plate. What is measured is the box the CSS gives it: the
    // art is painted `100% 100%` into this box, so any box whose shape differs from the art's is
    // a stretched picture. Phones are taller than 9:16, which is exactly where the first version
    // of the rule distorted it by about 18%.
    const aspect = 240 / 426;
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 360, height: 800 },
      { width: 412, height: 915 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      // The first render waits for the venue (ADR-299), so the shell is not there at `load`.
      await page.locator('.theme-gameboy').first().waitFor();
      const box = await page.evaluate((artAspect) => {
        const shell = document.querySelector('.theme-gameboy') as HTMLElement;
        const scene = document.createElement('div');
        scene.className = 'gb-scene';
        scene.dataset['fit'] = 'plate';
        scene.style.setProperty('--scene-aspect', String(artAspect));
        shell.append(scene);
        const rect = scene.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      }, aspect);
      const label = `${viewport.width}x${viewport.height}`;

      expect(box.width / box.height, `${label} keeps the art's shape`).toBeCloseTo(aspect, 2);
      expect(box.bottom, `${label} is flush with the bottom`).toBeCloseTo(viewport.height, 0);
      expect(box.width, `${label} never wider than the screen`).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(box.height, `${label} never taller than the screen`).toBeLessThanOrEqual(viewport.height + 0.5);
      expect((box.left + box.right) / 2, `${label} is centred`).toBeCloseTo(viewport.width / 2, 0);
    }
  });

  test('keeps the portrait sky behind Sentosa on a phone (ADR-265, ADR-298)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const sky = await page.locator('.theme-gameboy').first().evaluate((node) => {
      const style = getComputedStyle(node, '::before');
      return { display: style.display, position: style.position, image: style.backgroundImage };
    });

    expect(sky.display).toBe('block');
    expect(sky.position).toBe('fixed');
    expect(sky.image).toContain('linear-gradient');
  });

  test('sets the browser chrome colour from the theme', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#2f7dd1');
  });

  test('loads the venue sprites it asks for, as images that really decode', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/themes/') && response.status() >= 400) failed.push(response.url());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sprites = await page.locator('img.gb-motif').evaluateAll((nodes) =>
      nodes.map((node) => {
        const image = node as HTMLImageElement;
        return { src: image.getAttribute('src') ?? '', loaded: image.complete && image.naturalWidth > 0 };
      }),
    );

    expect(sprites.length).toBeGreaterThan(0);
    expect(sprites.every((sprite) => sprite.src.startsWith('/themes/sentosa/motifs/'))).toBe(true);
    expect(sprites.filter((sprite) => !sprite.loaded)).toEqual([]);
    expect(failed).toEqual([]);
  });

  test('draws the backdrop from the venue directory', async ({ page }) => {
    const scene = new Set<string>();
    page.on('response', (response) => {
      if (/\/themes\/sentosa\/scene(-2x)?\//.test(response.url())) scene.add(response.url());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('beach-scene')).toBeVisible();
    expect([...scene].length).toBeGreaterThan(0);
    // The old, unthemed URLs no longer exist and must not be asked for.
    const stale = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name).pathname)
        .filter((path) => /^\/(motifs|scene|scene-2x|scene-real)\//.test(path)),
    );
    expect(stale).toEqual([]);
  });

  test('wears the venue on the landing copy', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText("Sentosa · Captain's Ball + Fringe")).toBeVisible();
    await expect(page.getByText(/at every station on the beach\./)).toBeVisible();
  });

  test('serves the venue assets, including the real scene that is not cached for a year', async ({
    request,
  }) => {
    const motif = await request.get('/themes/sentosa/motifs/trophy.svg');
    const real = await request.get('/themes/sentosa/scene-real/panorama.jpg');

    // The dev server answers neither with the production cache headers, so only the existence of
    // both files is asserted here; the header rule is pinned by apps/api web-static.test.ts.
    expect(motif.status()).toBe(200);
    expect(real.status()).toBe(200);
  });
});
