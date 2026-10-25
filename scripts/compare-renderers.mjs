/**
 * Measures how close the React Three Fiber port is to the imperative manager
 * (ADDENDUM-030). Both are frozen at the same instant with `?freezeAt=` (the manager
 * honours it since T3.0), screenshotted in the same browser, and compared pixel by pixel
 * in Node. The comparison and PNG decoding are unit-tested in `src/test/frameCompare.ts`;
 * this file is only the browser driving.
 *
 *   npm run parity -- [baseUrl] [outDir]
 *
 * Needs Node 22.6+ (it imports the TypeScript helper directly) and a Vite dev or preview
 * server, default http://localhost:4173. Captures and report.json go to `outDir`
 * (default `$TMPDIR/renderer-parity`). Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a
 * specific browser.
 *
 * Each frame is also captured twice on the manager and compared with itself. That second
 * number is the noise floor (software-GL timing, dust phase), so a manager-versus-port
 * figure is only meaningful next to it. The script exits non-zero when a pair cannot be
 * compared fairly (a renderer never reported frame-ready, or the canvases differ in size);
 * it does not judge the numbers, the addendum records them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { compareFrames, decodePng } from '../src/test/frameCompare.ts';

/** Frames spread across all five acts: opening, mid-hold, a fly-through, a hold, the finale. */
const FRAMES = [1.0, 4.32, 11.28, 18.5, 24.82, 33.8];
const VIEWPORT = { width: 960, height: 600 };
const READY = '[data-testid="cinematic-stage__canvas"]';
const READY_TIMEOUT_MS = 180_000;
const SETTLE_MS = 800;

const baseUrl = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
const outDir = process.argv[3] ?? join(process.env.TMPDIR ?? tmpdir(), 'renderer-parity');

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  headless: true,
});

/** One frozen capture. Throws, rather than comparing garbage, if the renderer never became ready. */
async function capture(renderer, freezeAt) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    await page.goto(`${baseUrl}/?renderer=${renderer}&freezeAt=${freezeAt}`);
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.dataset.frameReady === 'true',
      READY,
      { timeout: READY_TIMEOUT_MS },
    );
    await page.keyboard.press('h'); // hide the HUD so only the scene is compared
    await page.waitForTimeout(SETTLE_MS);
    return await page.screenshot();
  } catch (error) {
    throw new Error(`${renderer} @ ${freezeAt}s never became ready: ${error.message}`);
  } finally {
    await page.close();
  }
}

mkdirSync(outDir, { recursive: true });
const rows = [];
try {
  for (const freezeAt of FRAMES) {
    const manager = await capture('manager', freezeAt);
    const port = await capture('r3f', freezeAt);
    const managerAgain = await capture('manager', freezeAt);
    writeFileSync(join(outDir, `manager-${freezeAt}.png`), manager);
    writeFileSync(join(outDir, `r3f-${freezeAt}.png`), port);
    writeFileSync(join(outDir, `manager-again-${freezeAt}.png`), managerAgain);
    const crossed = compareFrames(decodePng(manager), decodePng(port));
    const noise = compareFrames(decodePng(manager), decodePng(managerAgain));
    rows.push({ freezeAt, port: crossed, noise });
    console.log(
      `${String(freezeAt).padEnd(5)}s  manager vs port: mean ${crossed.meanAbsDiff}/255, outliers ${crossed.outlierRatio}` +
        `   |   manager vs itself: mean ${noise.meanAbsDiff}, outliers ${noise.outlierRatio}`,
    );
  }
} finally {
  await browser.close();
}

writeFileSync(join(outDir, 'report.json'), JSON.stringify(rows, null, 2));
console.log(`\ncaptures and report.json in ${outDir}`);
