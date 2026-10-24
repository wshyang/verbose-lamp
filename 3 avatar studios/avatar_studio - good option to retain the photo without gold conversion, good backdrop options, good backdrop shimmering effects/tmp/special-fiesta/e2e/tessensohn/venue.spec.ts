import { expect, test } from '@playwright/test';

/**
 * ADR-299 — CSC @ Tessensohn, as the app actually looks and moves in a browser.
 *
 * Runs on its own stack (`playwright.tessensohn.config.ts`, `PSD_VENUE=tessensohn`), because the
 * venue is a property of the API process and every other spec shares a Sentosa one. jsdom resolves
 * no stylesheet, loads no image and runs no animation, so everything here is read from computed
 * style, from the network, and from the running animation itself — not from DOM attributes that
 * merely claim it.
 */

test.describe('CSC @ Tessensohn (ADR-299)', () => {
  test('the server names the venue, and the page wears it from the first paint', async ({ page }) => {
    const answered = page.waitForResponse((response) => response.url().endsWith('/api/venue'));

    await page.goto('/');

    expect((await (await answered).json()) as unknown).toEqual({ venue: 'tessensohn' });
    await expect(page.locator('html')).toHaveAttribute('data-venue', 'tessensohn');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#2372bc');
  });

  test('is a cool palette, not Sentosa recoloured: the tokens and the painted button differ', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-venue', 'tessensohn');

    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string) => style.getPropertyValue(name).trim();
      return { primary: read('--primary'), surface: read('--surface'), hot: read('--hot'), bannerInk: read('--banner-ink') };
    });

    expect(tokens).toEqual({ primary: '#2372bc', surface: '#cddbde', hot: '#c8553d', bannerInk: '#ffffff' });
    // ADR-300 — the accent is the venue's light blue now, not Sentosa's gold; the primary
    // button is still the accent, resolved through the cascade.
    const button = await page.getByTestId('landing__signup').evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(button).toBe('rgb(111, 168, 214)');
  });

  test('the banner is a blue bar with a white title, not a sand plate with a red one', async ({ page }) => {
    await page.goto('/');
    const banner = page.locator('.gb-banner').first();

    const paint = await banner.evaluate((node) => {
      const bar = getComputedStyle(node);
      const title = getComputedStyle(node.querySelector('h1') as Element);
      return { image: bar.backgroundImage, border: bar.borderTopColor, title: title.color };
    });

    expect(paint.title).toBe('rgb(255, 255, 255)');
    expect(paint.border).toBe('rgb(20, 59, 106)');
    expect(paint.image).toContain('rgb(35, 114, 188)');
    expect(paint.image).toContain('rgb(20, 59, 106)');
  });

  test('draws no Sentosa landmark: the banner mark is the shared kueh, and nothing asks for /themes/sentosa/', async ({
    page,
  }) => {
    const sentosa: string[] = [];
    page.on('request', (request) => {
      // Assets only: the dev server also serves the registry's Sentosa SOURCE under /src/themes/.
      if (new URL(request.url()).pathname.startsWith('/themes/sentosa/')) sentosa.push(request.url());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sources = await page.locator('img.gb-motif').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src') ?? ''));
    expect(sources.some((src) => src.includes('/themes/tessensohn/motifs/kueh.svg'))).toBe(true);
    expect(sources.every((src) => src.startsWith('/themes/tessensohn/motifs/'))).toBe(true);
    expect(sentosa).toEqual([]);
  });

  for (const [layout, viewport, minimum] of [
    ['phone', { width: 390, height: 844 }, 55],
    ['wide', { width: 1440, height: 900 }, 100],
  ] as const) {
    test(`every sprite and every ${layout}-scene image it asks for really loads, from this venue only`, async ({ page }) => {
      const failed: string[] = [];
      page.on('response', (response) => {
        if (response.url().includes('/themes/') && response.status() >= 400) failed.push(response.url());
      });

      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.getByTestId('venue-scene')).toHaveAttribute('data-layout', layout);
      await page.waitForLoadState('networkidle');

      const decoded = (selector: string) =>
        page.locator(selector).evaluateAll((nodes) =>
          nodes.map((node) => ({
            src: node.getAttribute('src') ?? '',
            ok: (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0,
          })),
        );
      const sprites = await decoded('img.gb-motif');
      const layers = await decoded('[data-testid="venue-scene"] img');

      expect(sprites.length).toBeGreaterThan(0);
      expect(sprites.filter((sprite) => !sprite.ok)).toEqual([]);
      expect(layers.length).toBeGreaterThan(minimum);
      expect(layers.filter((layer) => !layer.ok)).toEqual([]);
      expect(layers.every((layer) => layer.src.startsWith('/themes/tessensohn/scene/'))).toBe(true);
      expect(failed).toEqual([]);
    });
  }

  test("on a portrait screen the plate keeps the art's own shape, never stretched", async ({ page }) => {
    const aspect = 445 / 671;
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 360, height: 800 },
      { width: 412, height: 915 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.getByTestId('venue-scene')).toHaveAttribute('data-layout', 'phone');
      const box = await page.getByTestId('venue-scene').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
      const label = `${viewport.width}x${viewport.height}`;

      expect(box.width / box.height, `${label} keeps the art's shape`).toBeCloseTo(aspect, 2);
      expect(box.bottom, `${label} is flush with the bottom`).toBeCloseTo(viewport.height, 0);
      expect(box.width, `${label} is no wider than the screen`).toBeLessThanOrEqual(viewport.width + 0.5);
      expect((box.left + box.right) / 2, `${label} is centred`).toBeCloseTo(viewport.width / 2, 0);
    }
  });

  test('on a landscape screen the scene is CSC\'s wide banner across the full width, not a narrow column', async ({
    page,
  }) => {
    const aspect = 3259 / 1204;
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.getByTestId('venue-scene')).toHaveAttribute('data-layout', 'wide');
      const box = await page.getByTestId('venue-scene').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
      const label = `${viewport.width}x${viewport.height}`;

      expect(box.left, `${label} starts at the left edge`).toBeCloseTo(0, 0);
      expect(box.width, `${label} spans the whole width`).toBeCloseTo(viewport.width, 0);
      expect(box.width / box.height, `${label} keeps the art's shape`).toBeCloseTo(aspect, 1);
      expect(box.bottom, `${label} is flush with the bottom`).toBeCloseTo(viewport.height, 0);
    }
  });

  test('the wide scene draws its own court and pool; the phone scene has the court and no pool', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('venue-scene')).toHaveAttribute('data-layout', 'wide');
    expect(await page.locator('.csc-pool').count()).toBe(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('venue-scene')).toHaveAttribute('data-layout', 'phone');
    expect(await page.locator('.csc-pool').count()).toBe(0);
    expect(await page.locator('.csc-swimsuit').count()).toBe(0);
    await expect(page.getByTestId('venue-scene__court')).toBeVisible();
  });

  test('has no portrait sky gradient: the plate draws its own sky', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const sky = await page.locator('.theme-gameboy').first().evaluate((node) => getComputedStyle(node, '::before').content);

    // `content: none` / `normal` means the ::before rule did not apply, which is the point.
    expect(['none', 'normal']).toContain(sky);
  });

  test('the loops run, each on a named CSS animation: dog, barbecue, court players and ball', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('venue-scene')).toBeVisible();

    const running = await page.getByTestId('venue-scene').evaluate((node) => [
      ...new Set(node.getAnimations({ subtree: true }).map((animation) => (animation as CSSAnimation).animationName)),
    ]);

    for (const name of ['csc-wag', 'csc-bark', 'csc-bbqarm', 'csc-tennis2', 'csc-tennisball', 'csc-tennis1racket', 'csc-cloudleft']) {
      expect(running, name).toContain(name);
    }
  });

  test('the court is drawn at the bottom left, inside the plate, with its two players', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('venue-scene__court')).toBeVisible();

    const facts = await page.evaluate(() => {
      const rect = (selector: string): DOMRect => {
        const node = document.querySelector(selector);
        if (node === null) throw new Error(`${selector} is not in the page`);
        return node.getBoundingClientRect();
      };
      const plate = rect('[data-testid="venue-scene"]');
      const court = rect('[data-testid="venue-scene__court"]');
      return {
        courtWidth: court.width,
        insideLeft: court.left >= plate.left,
        insideRight: court.right <= plate.right + 1,
        player1: rect('.csc-tennis1').width,
        player2: rect('.csc-tennis2').width,
      };
    });

    expect(facts.courtWidth).toBeGreaterThan(100);
    expect(facts.insideLeft).toBe(true);
    expect(facts.insideRight).toBe(true);
    expect(facts.player1).toBeGreaterThan(10);
    expect(facts.player2).toBeGreaterThan(10);
  });

  test('the first page of a visit plays the building and the car in; the next page does not replay them', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const names = () =>
      page.getByTestId('venue-scene').evaluate((node) => [
        ...new Set(node.getAnimations({ subtree: true }).map((animation) => (animation as CSSAnimation).animationName)),
      ]);

    await expect(page.getByTestId('venue-scene')).toHaveAttribute('data-intro', 'play');
    expect(await names()).toEqual(expect.arrayContaining(['csc-building', 'csc-carXmobile', 'csc-bike2Xmobile']));

    // A route change inside the app mounts a new scene; it must come up at rest.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/teams');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByTestId('venue-scene')).toHaveAttribute('data-intro', 'rest');
    const rest = await names();
    expect(rest).not.toContain('csc-building');
    expect(rest).not.toContain('csc-carXmobile');
    expect(rest).not.toContain('csc-bike2Xmobile');
    // At rest the car is parked in place and the cyclist has already gone.
    const parked = await page.getByTestId('venue-scene__car').evaluate((node) => getComputedStyle(node).transform);
    expect(parked).toBe('none');
    expect(await page.locator('.csc-bike2').evaluate((node) => getComputedStyle(node).display)).toBe('none');

    // A reload is a new page load and plays them again.
    await page.reload();
    await expect(page.getByTestId('venue-scene')).toHaveAttribute('data-intro', 'play');
  });

  test('the car starts off to the right and ends parked, as CSC draws it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const car = page.getByTestId('venue-scene__car');
    const at = (ms: number) =>
      car.evaluate((node, time) => {
        const animation = node.getAnimations().find((a) => (a as CSSAnimation).animationName === 'csc-carXmobile');
        if (animation === undefined) return null;
        animation.pause();
        animation.currentTime = time;
        return new DOMMatrix(getComputedStyle(node).transform).m41;
      }, ms);

    const start = await at(0);
    const end = await at(8000);

    expect(start, 'a running csc-carXmobile').not.toBeNull();
    expect(start ?? 0).toBeGreaterThan(100);
    expect(end ?? 1).toBeCloseTo(0, 0);
  });

  test('under reduced motion nothing moves, the building stands, the car is parked and the cyclist is gone', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('venue-scene')).toBeAttached();

    const running = await page.getByTestId('venue-scene').evaluate((node) => node.getAnimations({ subtree: true }).length);
    expect(running).toBe(0);
    const display = (selector: string) => page.locator(selector).first().evaluate((node) => getComputedStyle(node).display);
    expect(await display('.csc-building')).not.toBe('none');
    expect(await display('[data-testid="venue-scene__car"]')).not.toBe('none');
    expect(await page.getByTestId('venue-scene__car').evaluate((node) => getComputedStyle(node).transform)).toBe('none');
    for (const hidden of ['.csc-bike2', '.csc-cloud3', '.csc-smoke1', '.csc-tennisball']) {
      expect(await display(hidden), hidden).toBe('none');
    }
    await context.close();
  });

  test('does not honour ?backdrop=real: this venue has no photoreal scene, and no 16 MB is fetched', async ({ page }) => {
    const real: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('scene-real')) real.push(request.url());
    });

    await page.goto('/?backdrop=real');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('venue-scene')).toBeVisible();
    expect(real).toEqual([]);
  });

  test('the wide scene plays its entrances once, then rests; reduced motion stops all of it', async ({ browser, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const names = () =>
      page.getByTestId('venue-scene').evaluate((node) => [
        ...new Set(node.getAnimations({ subtree: true }).map((animation) => (animation as CSSAnimation).animationName)),
      ]);

    await expect(page.getByTestId('venue-scene')).toHaveAttribute('data-intro', 'play');
    expect(await names()).toEqual(expect.arrayContaining(['csc-building', 'csc-carX', 'csc-bike1X', 'csc-bike2X', 'csc-donutX']));

    await page.evaluate(() => {
      window.history.pushState({}, '', '/teams');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByTestId('venue-scene')).toHaveAttribute('data-intro', 'rest');
    const rest = await names();
    for (const entrance of ['csc-building', 'csc-carX', 'csc-bike1X', 'csc-bike2X', 'csc-donutX']) {
      expect(rest, entrance).not.toContain(entrance);
    }
    expect(await page.locator('.csc-bike1').evaluate((node) => getComputedStyle(node).display)).toBe('none');
    expect(await page.locator('.csc-donut').evaluate((node) => getComputedStyle(node).transform)).toBe('none');

    const calm = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const still = await calm.newPage();
    await still.goto('/');
    await expect(still.getByTestId('venue-scene')).toHaveAttribute('data-layout', 'wide');
    expect(await still.getByTestId('venue-scene').evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await still.locator('.csc-donut').evaluate((node) => getComputedStyle(node).transform)).toBe('none');
    expect(await still.locator('.csc-car').evaluate((node) => getComputedStyle(node).display)).not.toBe('none');
    await calm.close();
  });

  test('wears the venue on the landing copy', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText("CSC @ Tessensohn · Captain's Ball + Fringe")).toBeVisible();
    await expect(page.getByText(/at every station on the club\./)).toBeVisible();
  });
});
