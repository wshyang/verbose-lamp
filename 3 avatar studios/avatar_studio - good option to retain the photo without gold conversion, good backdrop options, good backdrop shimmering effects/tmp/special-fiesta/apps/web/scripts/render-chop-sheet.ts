#!/usr/bin/env -S npx tsx
/**
 * ADR-242 — the chop sheets: the instrument the die designs are reviewed with.
 *
 * `chopDies.test.ts` can hold a die inside its cell, on its own ink and inside its own ranges. It
 * cannot say whether the thing reads as a stamp, which is a judgement made by eye (ADR-241 says the
 * same of the wear). So this renders the real `PassportChop` component — through
 * `renderToStaticMarkup`, with the app's own stylesheets — two ways:
 *
 *   --mode=dies   one row per die, one column per seed: the catalogue, side by side
 *   --mode=list   the Passport tab at 390 px, with each station's die assigned from its id: the
 *                 size a phone actually draws it at
 *
 *   npx tsx apps/web/scripts/render-chop-sheet.ts --out=docs/design/passport-chop-dies.png
 *   npx tsx apps/web/scripts/render-chop-sheet.ts --mode=list --zoom=3 \
 *     --out=docs/design/passport-chop-list.png
 *
 * Flags:
 *   --mode=dies|list   which sheet                --dies=all|id,id  which dies (dies mode)
 *   --seeds=N          impressions per die        --from=N          the first seed
 *   --out=path.png     the raster to write        --html=path       also keep the markup
 *   --zoom=N           device pixels per CSS pixel
 *   --paper=colour     the page behind the ink
 *
 * The raster comes from whatever browser `PSD_E2E_CHROMIUM` names, or Playwright's own download —
 * the same ladder `playwright.config.ts` uses, because SVG filters are exactly the thing a
 * stand-in renderer would get wrong. Fonts matter for the same reason: the lettering asks for a
 * heavy grotesque, so a Linux box with none draws the sheet in DejaVu Sans Bold, which is wider
 * than the Arial Black a phone has.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyStates } from '@psd/contracts';

import { PassportChop } from '../src/components/participant/PassportChop.js';
import { buildChop } from '../src/lib/passport/chop.js';
import { dieForStation } from '../src/lib/passport/chopAssign.js';
import { CHOP_DIES, type ChopDie, type ChopDieId } from '../src/lib/passport/chopDies.js';

const flags = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key as string, value ?? 'true'];
  }),
);

const HERE = dirname(new URL(import.meta.url).pathname);
const STYLES = resolve(HERE, '..', 'src', 'styles');
const OUT = resolve(HERE, '..', '..', '..', flags.out ?? 'docs/design/passport-chop-dies.png');
const MODE = flags.mode ?? 'dies';
const SEEDS = Number(flags.seeds ?? 6);
const ZOOM = Number(flags.zoom ?? (MODE === 'list' ? 3 : 2));
const PAPER = flags.paper ?? '#fdfaf2';
const FIRST_SEED = Number(flags.from ?? 1000);
/** The stride between seeds: neighbouring seeds would draw near-identical turbulence. */
const STRIDE = 8919;
const VIEWPORT_WIDTH = MODE === 'list' ? 460 : 1320;

/** Names a day might really have, including one long enough to test the small print. */
const NAMES = [
  'Beach Dash',
  'Sandcastle Relay',
  'Tug of Rope',
  'Egg-and-Spoon Race',
  'Water Balloon Toss',
  'Frisbee Ring — Mixed Pairs',
];

const SHEET_CSS = `
  body { margin: 0; padding: 24px; background: #e9e2d1; color: #1c1c1c;
         font: 13px/1.5 system-ui, sans-serif; }
  .sheet { background: ${PAPER}; padding: 20px 24px; border: 1px solid #c9bfa8; }
  .sheet h1 { font-size: 15px; letter-spacing: 2px; margin: 0 0 4px; text-transform: uppercase; }
  .sheet > p.lede { margin: 0 0 18px; color: #6b6151; }
  .row { display: grid; grid-template-columns: 236px 1fr; gap: 16px; align-items: start;
         padding: 14px 0; border-top: 1px dashed #c9bfa8; }
  .row h2 { margin: 0 0 2px; font-size: 14px; }
  .row code { font-size: 11px; color: #6b6151; }
  .row header p { margin: 6px 0 0; font-size: 11.5px; color: #4c4437; }
  .inks { list-style: none; display: flex; gap: 6px; margin: 8px 0 0; padding: 0; }
  .inks li { width: 14px; height: 14px; border-radius: 50%; border: 1px solid rgba(0,0,0,.25);
             text-indent: -999px; overflow: hidden; }
  .cells { display: flex; flex-wrap: wrap; gap: 10px; }
  .cells figure { margin: 0; width: 168px; padding: 8px 4px 4px; text-align: center;
             background: ${PAPER}; border: 1px dashed #ded4bd; }
  .cells figure .gb-chop { width: 152px; }
  .cells figcaption { font-size: 9.5px; color: #8b8271; }
  /* The list is the app at phone width: the panel and the rows are the shipped styles. */
  .device { width: 390px; padding: 12px; background: linear-gradient(180deg, var(--surface) 0%,
            var(--surface-deep) 100%); border: var(--panel-border); border-radius: var(--radius); }
  .device .gb-panel { margin-bottom: 0; }
`;

function chosenDies(): ChopDie[] {
  const asked = flags.dies ?? 'all';
  if (asked === 'all') return [...CHOP_DIES];
  const ids = asked.split(',').map((id) => id.trim()) as ChopDieId[];
  return CHOP_DIES.filter((die) => ids.includes(die.id));
}

function chopCell(die: ChopDie, index: number) {
  const seed = FIRST_SEED + index * STRIDE;
  const name = NAMES[index % NAMES.length] as string;
  return createElement(
    'figure',
    { key: `${die.id}-${seed}` },
    createElement(PassportChop, { chop: buildChop(seed, die.id, name) }),
    createElement('figcaption', null, `${seed} · ${name}`),
  );
}

function dieRow(die: ChopDie) {
  return createElement(
    'section',
    { className: 'row', key: die.id },
    createElement(
      'header',
      null,
      createElement('h2', null, die.label),
      createElement('code', null, die.id),
      createElement('p', null, die.note),
      createElement(
        'ul',
        { className: 'inks' },
        [...die.inks, ...(die.pen ?? [])].map((ink) =>
          createElement('li', { key: ink, style: { background: ink } }, ink),
        ),
      ),
    ),
    createElement(
      'div',
      { className: 'cells' },
      Array.from({ length: SEEDS }, (_unused, index) => chopCell(die, index)),
    ),
  );
}

/**
 * The Passport tab as a phone draws it: every station, the die it was assigned from its id, and an
 * open slot where this participant has not walked up to a counter yet.
 */
function passportList() {
  const stations = NAMES.map((name, index) => ({
    id: `activity-${index}`,
    name,
    isCompleted: index !== 1 && index !== 4,
  }));
  return createElement(
    'div',
    { className: 'device' },
    createElement(
      'div',
      { className: 'gb-panel' },
      createElement('h2', null, 'MY SCANS'),
      createElement(
        'ul',
        { className: 'gb-passport' },
        stations.map((station, index) =>
          createElement(
            'li',
            { key: station.id },
            createElement('span', { className: 'gb-passport__name' }, station.name),
            station.isCompleted
              ? createElement(PassportChop, {
                  chop: buildChop(
                    FIRST_SEED + index * STRIDE,
                    dieForStation(station.id),
                    station.name,
                  ),
                })
              : createElement(
                  'span',
                  { className: 'gb-passport__slot' },
                  emptyStates.passportNotYet,
                ),
          ),
        ),
      ),
    ),
  );
}

function sheetMarkup(dies: ChopDie[]): string {
  const body =
    MODE === 'list'
      ? createElement(
          'div',
          { className: 'sheet' },
          createElement('h1', null, 'Passport tab, 390 px'),
          createElement(
            'p',
            { className: 'lede' },
            'Each station is stamped with the die its id assigns (ADR-242) and the impression this ',
            'device kept for it (ADR-240). Drawn by PassportChop at the width the app gives it.',
          ),
          passportList(),
        )
      : createElement(
          'div',
          { className: 'sheet' },
          createElement('h1', null, 'Passport chop dies'),
          createElement(
            'p',
            { className: 'lede' },
            `Each row is one die — the shape an office holds. Each column is one seed — the ` +
              `impression a device keeps. ${SEEDS} impressions, drawn by PassportChop at 152 px ` +
              `wide on the app's own paper.`,
          ),
          dies.map(dieRow),
        );
  const styles = ['tokens.css', 'gameboy.css']
    .map((name) => `<style>${readFileSync(join(STYLES, name), 'utf8')}</style>`)
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Passport chops</title>
${styles}
<style>${SHEET_CSS}</style>
</head><body>${renderToStaticMarkup(body)}</body></html>`;
}

/** The markup is kept beside the raster, so a reviewer can open it in their own browser. */
const HTML = flags.html === undefined ? `/tmp/${OUT.split('/').pop()}.html` : resolve(flags.html);

async function shoot(markup: string): Promise<void> {
  const { chromium } = await import('@playwright/test');
  const executablePath = process.env['PSD_E2E_CHROMIUM'];
  const browser = await chromium.launch({
    ...(executablePath === undefined ? {} : { executablePath }),
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({
    viewport: { width: VIEWPORT_WIDTH, height: 900 },
    deviceScaleFactor: ZOOM,
  });
  await page.setContent(markup);
  await page.locator('.sheet').screenshot({ path: OUT });
  await browser.close();
}

const dies = chosenDies();
if (MODE !== 'dies' && MODE !== 'list') throw new Error(`--mode must be dies or list, got "${MODE}"`);
if (MODE === 'dies' && dies.length === 0) {
  throw new Error(`--dies named none of: ${CHOP_DIES.map((die) => die.id).join(', ')}`);
}
const markup = sheetMarkup(dies);
mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(dirname(HTML), { recursive: true });
writeFileSync(HTML, markup);
await shoot(markup);
console.log(
  MODE === 'list'
    ? `list mode, ${NAMES.length} stations at 390 px -> ${OUT}`
    : `dies mode, ${dies.length} dies x ${SEEDS} seeds -> ${OUT}`,
);
console.log(`markup -> ${HTML}`);
