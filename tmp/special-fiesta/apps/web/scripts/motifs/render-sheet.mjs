#!/usr/bin/env node
/**
 * ADR-069 — the motif contact sheet: the instrument the art is reviewed with.
 *
 * There is no headless browser in this workspace (ADR-013), so the interesting part — what a
 * sprite looks like at the size it actually ships at — has to be composited here.
 *
 * Two modes, because two different readers need different things:
 *
 *   npm run motifs:review --workspace @psd/web                   overview: every sprite, three
 *                                                                backgrounds, one screen
 *   npm run motifs:review --workspace @psd/web -- --only=crab    one sprite, large, plus a band
 *                                                                at every shipped size
 *
 * The three backgrounds are not decoration: an outline that reads on sand can disappear on sea,
 * and these sprites sit on both.
 *
 * Flags: --zoom=N  --out=path  --only=name
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { colourGrid } from './core.mjs';
import { SHIPPED_SIZES } from './shipped-sizes.mjs';
import { corpusFor } from './theme-corpus.mjs';
import { Canvas, encodePng } from '../pixel-canvas.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const flags = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const OUT = flags.out ?? join(HERE, '..', '..', '..', '..', 'docs', 'screenshot', 'motif-sheet.png');
const THEME = flags.theme && flags.theme !== 'true' ? flags.theme : 'sentosa';
const { MANIFEST } = await import(
  pathToFileURL(join(HERE, '..', 'themes', THEME, 'manifest.mjs')).href
);
const CORPUS = corpusFor(MANIFEST);
const ONLY = flags.only && flags.only !== 'true' ? flags.only : null;

/** Mid-grey, then the two surfaces these sprites are actually laid on. */
const FIELDS = ['#d8dee6', '#f5e2b8', '#2f7dd1'];
const GAP = 4;
const SHEET_BG = '#0d1522';

function draw(canvas, cells, x, y) {
  cells.forEach((row, dy) => {
    row.forEach((colour, dx) => {
      if (colour) canvas.set(x + dx, y + dy, colour);
    });
  });
}

/**
 * Resample a grid to `size` device pixels the way the rasteriser does: each device pixel takes
 * whichever source pixel its own boundary falls in. That is what makes the width modulation at
 * a fractional scale visible — a 16-px grid at 20 px repeats one column in four.
 */
function resample(cells, size) {
  const height = cells.length;
  const width = cells[0].length;
  const tall = Math.round((size * height) / width);
  return Array.from({ length: tall }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const row = cells[Math.min(height - 1, Math.floor((y * height) / tall))];
      return row[Math.min(width - 1, Math.floor((x * width) / size))];
    }),
  );
}

/** One sprite on the three fields, side by side. Returns the width consumed. */
function fieldStrip(canvas, cells, originX, originY, zoomWidth) {
  FIELDS.forEach((field, index) => {
    const x = originX + index * (zoomWidth + GAP);
    canvas.rect(x, originY, zoomWidth, cells.length, field);
    draw(canvas, cells, x, originY);
  });
  return FIELDS.length * (zoomWidth + GAP);
}

/** Overview: every sprite, four to a row. Compact enough to read whole. */
function overview(zoom) {
  const all = Object.keys(CORPUS.grids).sort();
  const perPage = Number(flags.per ?? 24);
  const page = Number(flags.page ?? 1);
  const names = flags.page ? all.slice((page - 1) * perPage, page * perPage) : all;
  if (names.length === 0) throw new Error(`page ${page} is empty; ${all.length} sprites total`);
  const grids = names.map((name) => colourGrid(CORPUS, name));
  const cellWidth = Math.max(...grids.map((cells) => cells[0].length));
  const cellHeight = Math.max(...grids.map((cells) => cells.length));
  const columns = 4;
  const blockWidth = FIELDS.length * (cellWidth + GAP);
  const rows = Math.ceil(names.length / columns);

  const canvas = new Canvas(
    columns * (blockWidth + GAP) + GAP,
    rows * (cellHeight + GAP * 2) + GAP,
    zoom,
  );
  canvas.rect(0, 0, canvas.units, canvas.unitsHigh, SHEET_BG);

  grids.forEach((cells, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    fieldStrip(
      canvas,
      cells,
      GAP + column * (blockWidth + GAP),
      GAP + row * (cellHeight + GAP * 2),
      cellWidth,
    );
  });

  const pages = Math.ceil(all.length / perPage);
  const label = flags.page ? `page ${page}/${pages}` : 'all';
  console.log(`overview (${label}), ${names.length} of ${all.length} sprites, 4 per row:`);
  for (let row = 0; row < rows; row += 1) {
    const inRow = names.slice(row * columns, row * columns + columns);
    console.log(`  row ${row + 1}: ${inRow.join(', ')}`);
  }
  return canvas;
}

/** Detail: one sprite large on the three fields, then a band at each size it ships at. */
function detail(name, zoom) {
  const rows = CORPUS.grids[name];
  if (!rows) throw new Error(`no motif named "${name}"`);
  const cells = colourGrid(CORPUS, name);
  const sizes = SHIPPED_SIZES[name] ?? [];

  // Device renderings: every shipped size at DPR 1 and DPR 2, the range a real phone spans.
  const shots = sizes.flatMap((size) => [resample(cells, size), resample(cells, size * 2)]);
  const bandWidth = shots.reduce((total, shot) => total + shot[0].length + GAP, 0);
  const bandHeight = Math.max(0, ...shots.map((shot) => shot.length));
  const stripWidth = FIELDS.length * (cells[0].length + GAP);

  const canvas = new Canvas(
    Math.max(stripWidth, bandWidth) + GAP,
    cells.length + bandHeight + GAP * 4,
    zoom,
  );
  canvas.rect(0, 0, canvas.units, canvas.unitsHigh, SHEET_BG);
  fieldStrip(canvas, cells, GAP, GAP, cells[0].length);

  let x = GAP;
  const bandTop = cells.length + GAP * 3;
  for (const shot of shots) {
    canvas.rect(x, bandTop, shot[0].length, shot.length, FIELDS[0]);
    draw(canvas, shot, x, bandTop);
    x += shot[0].length + GAP;
  }

  const labels = sizes.flatMap((size) => [`${size}px@1x`, `${size}px@2x`]);
  console.log(`${name}: ${cells[0].length}x${cells.length} grid`);
  console.log(`  top row: grey, sand, sea at ${zoom}x`);
  console.log(`  bottom band, left to right: ${labels.join(', ') || 'no shipped sizes recorded'}`);
  return canvas;
}

async function main() {
  const zoom = Number(flags.zoom ?? (ONLY ? 10 : 4));
  const canvas = ONLY ? detail(ONLY, zoom) : overview(zoom);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, encodePng(canvas));
  console.log(`wrote ${OUT} (${canvas.width}x${canvas.height})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
