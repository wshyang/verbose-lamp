import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import type { CutoutHookResult } from '../tools/cutoutHook.js';

/**
 * Drives `cutout-hook.html`'s `window.__PSD_CUTOUT_RUN__` in a real Chromium over every
 * photograph in `images/ingest/` AND `images/ingest/social/` — 86 in total — and writes a
 * self-contained before/after HTML report.
 *
 * This is the real pipeline, not a re-implementation of it: `locateFace.ts`'s BlazeFace and
 * `segmentPhoto.ts`'s MODNET both run, for real, over the real network, because the hook calls
 * the exact production functions (`photoFileToSprite` → `refineWithModel` → `chooseTuning`)
 * that an actual photo upload calls. `cutout-preview-report.ts` (the headless Node sibling of
 * this script) cannot do that — there is no BlazeFace outside a browser — which is the gap this
 * script closes.
 *
 * ## Running it
 *
 *     npm run dev:web                                           # terminal 1: Vite on :5173
 *     npx tsx apps/web/scripts/cutout-full-report.ts
 *     npx tsx apps/web/scripts/cutout-full-report.ts --out /path/to/report.html
 *     npx tsx apps/web/scripts/cutout-full-report.ts --base-url http://127.0.0.1:5173
 *
 * Needs outbound HTTPS to `cdn.jsdelivr.net` (MediaPipe), `storage.googleapis.com` (BlazeFace
 * weights) and `huggingface.co` (MODNET weights) — all fetched by the page itself, inside the
 * browser, the same CDN guests the shipped app depends on (ADR-033/054). No API, no database:
 * `cutout-hook.html` never calls `/api/*`.
 *
 * Writes one self-contained HTML file (every image inlined as a data URL — open it directly, no
 * server needed) to `$TMPDIR` by default. It is a scratch artefact: regenerate it, do not commit
 * it.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:5173';

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(2);
}

async function corpusNames(baseURL: string): Promise<{ path: string; label: string }[]> {
  const top = (await (await fetch(`${baseURL}/corpus/index.json`)).json()) as string[];
  const social = (await (await fetch(`${baseURL}/corpus/social/index.json`)).json()) as string[];
  return [
    ...top.map((name) => ({ path: name, label: name })),
    ...social.map((name) => ({ path: `social/${name}`, label: `social/${name}` })),
  ];
}

function cardHtml(row: CutoutHookResult): string {
  if (row.noMatte) {
    return `<section class="card card--error"><h2>${row.name}</h2><p>the model declined — no matte${row.foundFace ? '' : ' (and no face was found either)'}</p></section>`;
  }
  const flagged = row.holesDefault > 0 || row.biteDefault > 0;
  const nameOf = (): string =>
    row.chosen.removeBackground
      ? `threshold ${row.chosen.threshold}, island ${row.chosen.minIsland}, edge ${row.chosen.edge}`
      : 'cut-out OFF';
  return `
    <section class="card${flagged ? ' card--flagged' : ''}">
      <h2>${row.name}${row.foundFace ? '' : ' <span class="warn">(no face found — faceBox fallback crop)</span>'}</h2>
      <p class="meta">DEFAULT_TUNING: holes ${row.holesDefault} &middot; bite ${(100 * row.biteDefault).toFixed(1)}%
        &nbsp;|&nbsp; chosen (${nameOf()}): holes ${row.holesChosen} &middot; bite ${(100 * row.biteChosen).toFixed(1)}%
        &nbsp;|&nbsp; chooser ${row.agreesWithChooser ? 'agrees with the default' : 'would move'} &middot; ${row.why}</p>
      <div class="strip">
        <figure><img src="${row.original}" width="384" height="384"><figcaption>original</figcaption></figure>
        <figure><img src="${row.defaultCutOut}" width="384" height="384"><figcaption>existing algorithm — DEFAULT_TUNING</figcaption></figure>
        <figure><img src="${row.chosenCutOut}" width="384" height="384"><figcaption>new chooser — ${nameOf()}</figcaption></figure>
      </div>
    </section>`;
}

function pageHtml(rows: CutoutHookResult[]): string {
  const noMatteCount = rows.filter((row) => row.noMatte).length;
  const flaggedCount = rows.filter((row) => !row.noMatte && (row.holesDefault > 0 || row.biteDefault > 0)).length;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Cut-out before/after — real BlazeFace + MODNET, ${rows.length} photographs</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0e1925; color: #e7edf3; margin: 0; padding: 24px; }
  h1 { font-size: 18px; }
  .summary { color: #9fb3c4; margin-bottom: 24px; }
  .card { background: #16263a; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .card--flagged { outline: 2px solid #e0a94a; }
  .card--error { outline: 2px solid #c0392b; }
  .card h2 { margin: 0 0 4px; font-size: 15px; }
  .warn { color: #e0a94a; font-size: 12px; font-weight: normal; }
  .meta { color: #9fb3c4; font-size: 12px; margin: 0 0 12px; }
  .strip { display: flex; gap: 12px; }
  figure { margin: 0; }
  figcaption { color: #9fb3c4; font-size: 12px; text-align: center; margin-top: 4px; }
  img { background: #fff; border-radius: 4px; image-rendering: pixelated; }
</style>
</head>
<body>
  <h1>Cut-out before/after — real BlazeFace + MODNET, in Chromium, over ${rows.length} photographs</h1>
  <p class="summary">${flaggedCount} photograph(s) show measurable damage at DEFAULT_TUNING (holes or bite &gt; 0), outlined in amber. ${noMatteCount} had no matte. Generated ${new Date().toISOString()}.</p>
  ${rows.map(cardHtml).join('\n')}
</body>
</html>`;
}

async function main(): Promise<void> {
  const baseArgument = process.argv.indexOf('--base-url');
  const baseURL = baseArgument === -1 ? DEFAULT_BASE_URL : process.argv[baseArgument + 1] ?? DEFAULT_BASE_URL;
  const outArgument = process.argv.indexOf('--out');
  const outPath = outArgument === -1 ? join(tmpdir(), `cutout-full-report-${Date.now()}.html`) : process.argv[outArgument + 1];
  if (outPath === undefined) return fail('--out needs a path.');

  const reachable = await fetch(`${baseURL}/corpus/index.json`).catch(() => null);
  if (reachable === null || !reachable.ok) {
    return fail(`${baseURL} is not answering /corpus/index.json — start the dev server first: npm run dev:web`);
  }

  const photos = await corpusNames(baseURL);
  console.log(`\n${photos.length} photographs; launching Chromium…\n`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/cutout-hook.html`);
  await page.waitForFunction(() => typeof window.__PSD_CUTOUT_RUN__ === 'function');

  const rows: CutoutHookResult[] = [];
  for (const { path, label } of photos) {
    try {
      const row = (await page.evaluate((name) => window.__PSD_CUTOUT_RUN__?.(name), path)) as
        | CutoutHookResult
        | undefined;
      if (row === undefined) throw new Error('hook returned nothing');
      rows.push(row);
      console.log(
        `  ${label.padEnd(32)} ${row.noMatte ? 'no matte' : `holes ${row.holesDefault}  bite ${(100 * row.biteDefault).toFixed(1)}%`}`,
      );
    } catch (error) {
      rows.push({
        name: label,
        noMatte: true,
        foundFace: false,
        holesDefault: 0,
        biteDefault: 0,
        holesChosen: 0,
        biteChosen: 0,
        agreesWithChooser: true,
        chosen: { removeBackground: true, threshold: 128, minIsland: 512, edge: 0 },
        why: '',
        original: '',
        defaultCutOut: '',
        chosenCutOut: '',
      });
      console.log(`  ${label.padEnd(32)} ERROR ${String(error)}`);
    }
  }

  await browser.close();

  writeFileSync(outPath, pageHtml(rows));
  console.log(`\nwrote ${outPath}\nopen it directly in a browser — every image is inlined, no server needed.\n`);
}

void main().catch((error: unknown) => {
  fail(`the run did not complete: ${String(error)}`);
});
