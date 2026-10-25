#!/usr/bin/env node
/**
 * Visual-check harness (ADDENDUM-030).
 *
 * Captures the surfaces the addenda call "visual check pending" so a human can
 * look at them: the hero title at three viewports, the docked Frame Studio, the
 * spectacle console, the QR plaque, the avatar studio, the title customizer and
 * Event Night. It is *not* a test — nothing asserts on these pixels; the likeness
 * gate (e2e/likeness.spec.ts) is the thing that fails on drift.
 *
 * Needs a browser binary. In a sandbox with no browser download in the
 * allowlist, get one from npm — see docs/addenda/ADDENDUM-030 §1:
 *
 *   npm i @sparticuz/chromium            # scratch dir
 *   # decompress bin/chromium.br -> /tmp/chromium and bin/al2023.tar.br -> /tmp/lib
 *   LD_LIBRARY_PATH=/tmp/lib PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium \
 *     node scripts/capture-visuals.mjs --out /tmp/shots
 *
 * The dev server must already be running (`npm run dev -- --port 4173`).
 *
 * Options:
 *   --out <dir>     where the PNGs land (default /tmp/shots)
 *   --base <url>    dev server (default http://localhost:4173)
 *   --at <seconds>  freeze time (default 33.8, the act V hero hold)
 *   --only <name>   capture one shot by name; repeatable
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : fallback;
};
const only = argv.flatMap((arg, index) => (arg === '--only' ? [argv[index + 1]] : []));

const outDir = option('out', '/tmp/shots');
const baseUrl = option('base', 'http://localhost:4173');
const freezeAt = option('at', '33.8');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/tmp/chromium';

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  // Software GL. The first two flags are what make WebGL2 non-null here.
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const wanted = (name) => only.length === 0 || only.includes(name);

/** Waits for the scene's own readiness flag, then lets the film settle. */
const ready = async (page) => {
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="cinematic-stage__canvas"]')
        ?.getAttribute('data-frame-ready') === 'true',
    undefined,
    { timeout: 120_000 }
  );
  await page.waitForTimeout(1500);
};

const shot = async (page, name) => {
  if (!wanted(name)) return;
  // Software GL needs well over the default 30 s for a 1440×900 canvas capture.
  await page.screenshot({ path: join(outDir, `${name}.png`), timeout: 240_000, animations: 'disabled' });
  console.log('shot', name);
};

const press = async (page, testId) => {
  await page.locator(`[data-testid="${testId}"]`).first().click({ force: true, timeout: 60_000 });
  await page.waitForTimeout(1200);
};

const openPage = async (viewport) => {
  const page = await browser.newPage({ viewport });
  await page.goto(`${baseUrl}/?freezeAt=${freezeAt}`);
  await ready(page);
  return page;
};

// The hero title at the plan's aspect, at 21:9, and on a phone.
for (const [name, viewport] of [
  ['hero-1440x900', { width: 1440, height: 900 }],
  ['hero-2560x1080', { width: 2560, height: 1080 }],
  ['hero-390x844', { width: 390, height: 844 }],
]) {
  if (!wanted(name)) continue;
  const page = await openPage(viewport);
  await page.keyboard.press('h');
  await page.waitForTimeout(900);
  await shot(page, name);
  await page.close();
}

// The panels, with the HUD up so the header's launchers are reachable.
{
  const page = await openPage({ width: 1440, height: 900 });
  await shot(page, 'frame-studio');

  await press(page, 'frame-studio__dismiss');
  await shot(page, 'stage-hud');

  await press(page, 'spectacle-preview__launch');
  await shot(page, 'spectacle-console');

  await press(page, 'spectacle-preview__close');
  await press(page, 'qr-generator__launch');
  await shot(page, 'qr-plaque');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  await press(page, 'avatar-studio__launch');
  await shot(page, 'avatar-studio');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  await press(page, 'premiere-header__customize');
  await shot(page, 'title-customizer');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  await press(page, 'event-night__launch');
  await page.waitForTimeout(2500);
  await shot(page, 'event-night');
  await page.close();
}

await browser.close();
console.log('done →', outDir);
