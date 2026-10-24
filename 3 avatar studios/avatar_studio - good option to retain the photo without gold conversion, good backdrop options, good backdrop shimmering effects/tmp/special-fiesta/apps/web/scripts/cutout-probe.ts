import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import type { CutoutHookResult } from '../tools/cutoutHook.js';

/**
 * Runs ONE image through `window.__PSD_CUTOUT_RUN__` in a real Chromium, once with WebGPU hidden
 * (so `segmentPhoto` takes the WebAssembly path) and once with the browser left as it is, and
 * prints where face cells disappear in the mask pipeline. Writes a small HTML page of the stages.
 *
 *     npm run dev:web
 *     npx tsx apps/web/scripts/cutout-probe.ts --file ~/Downloads/captured-frame.png
 *
 * The image is served to the page by Playwright request interception, so nothing is copied into
 * `images/`. Needs the same hosts as `cutout-full-report.ts` (jsdelivr, googleapis, huggingface).
 */

const BASE = 'http://127.0.0.1:5173';

function argument(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}

async function runOnce(file: Buffer, label: string, hideWebGpu: boolean): Promise<CutoutHookResult> {
  const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
  const page = await browser.newPage();
  if (hideWebGpu) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
    });
  }
  await page.route('**/corpus/probe-image.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: file }),
  );
  await page.goto(`${BASE}/cutout-hook.html`);
  await page.waitForFunction(() => typeof window.__PSD_CUTOUT_RUN__ === 'function');
  const result = (await page.evaluate(() => window.__PSD_CUTOUT_RUN__?.('probe-image.png'))) as
    | CutoutHookResult
    | undefined;
  await browser.close();
  if (result === undefined) throw new Error(`${label}: the hook returned nothing`);
  return result;
}

function describe(label: string, row: CutoutHookResult): void {
  console.log(`\n${label}`);
  if (row.noMatte) {
    console.log('  no matte');
    return;
  }
  console.log(`  navigator.gpu present: ${row.webgpu}`);
  console.log(`  crop box: ${JSON.stringify(row.box)}  face found by BlazeFace: ${row.foundFace}`);
  console.log(`  mean raw alpha over the face rectangle: ${row.faceAlphaMean?.toFixed(1)} / 255`);
  for (const stage of row.stages ?? []) {
    console.log(`  ${stage.name.padEnd(26)} face-rectangle background cells: ${stage.faceBackgroundCells}`);
  }
}

function pageHtml(rows: [string, CutoutHookResult][]): string {
  const cards = rows
    .map(([label, row]) => {
      const strip = [{ name: 'original', image: row.original, faceBackgroundCells: 0 }, ...(row.stages ?? [])]
        .map(
          (stage) =>
            `<figure><img src="${stage.image}" width="384" height="384"><figcaption>${stage.name}${
              stage.name === 'original' ? '' : ` — ${stage.faceBackgroundCells} face-rect bg cells`
            }</figcaption></figure>`,
        )
        .join('');
      return `<section><h2>${label} — mean face alpha ${row.faceAlphaMean?.toFixed(1)}</h2><div class="strip">${strip}</div></section>`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>cutout probe</title>
<style>body{font-family:system-ui;background:#0e1925;color:#e7edf3;padding:24px}.strip{display:flex;gap:12px}
figure{margin:0}figcaption{font-size:12px;color:#9fb3c4;text-align:center}img{background:#fff;image-rendering:pixelated}</style>
${cards}`;
}

async function main(): Promise<void> {
  const path = argument('--file');
  if (path === undefined) {
    console.error('usage: cutout-probe.ts --file <image.png> [--out report.html]');
    process.exit(2);
  }
  const file = readFileSync(path);
  const out = argument('--out') ?? join(tmpdir(), `cutout-probe-${basename(path)}.html`);
  const wasm = await runOnce(file, 'wasm', true);
  describe('WebGPU hidden (WebAssembly path)', wasm);
  const native = await runOnce(file, 'browser default', false);
  describe('Browser default (WebGPU if it offers an adapter)', native);
  writeFileSync(out, pageHtml([['WebGPU hidden', wasm], ['browser default', native]]));
  console.log(`\nwrote ${out}`);
}

void main().catch((error: unknown) => {
  console.error(String(error));
  process.exit(2);
});
