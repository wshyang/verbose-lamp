#!/usr/bin/env node
/**
 * Renders docs/screenshot/sentosa-backdrop.png: the backdrop on its own, then the same
 * frame with the participant chrome blocked in over it. There is no headless browser in
 * this workspace (see docs/addenda/ADDENDA.md, ADR-013), so the scene is reviewed by
 * compositing the shipped layers exactly the way styles/gameboy.css stacks them.
 *
 *   npm run scene:review --workspace @psd/web
 *   node scripts/render-scene-review.mjs --scale=2 --zoom=4 --crop=96,88,190,140 --out=/tmp/x.png
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Canvas, encodePng } from '../pixel-canvas.mjs';
import { buildScene } from './pixel-scene.mjs';
import { SCENE } from '../themes/sentosa/scene/compose.mjs';
import { H, W } from '../themes/sentosa/scene/pixel-art.mjs';
import { PLAYERS } from '../themes/sentosa/scene/pixel-sprites.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const DEFAULT_OUT = join(ROOT, 'docs', 'screenshot', 'sentosa-backdrop.png');
const GUTTER = 10;

const flags = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const SCALE = Number(flags.scale ?? 1);
const ZOOM = Number(flags.zoom ?? 2);
const CROP = flags.crop ? flags.crop.split(',').map(Number) : null;
const OUT = flags.out ?? DEFAULT_OUT;

/** Alpha-composites a sprite (or the first frame of a sheet) at an art-unit offset. */
function blit(target, source, ox, oy, frames = 1) {
  const s = target.scale;
  const width = source.width / frames;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = source.getFine(x, y);
      if (a === 0) continue;
      const [tx, ty] = [ox * s + x, oy * s + y];
      const [dr, dg, db] = target.getFine(tx, ty);
      const t = a / 255;
      target.setFine(tx, ty, [dr + (r - dr) * t, dg + (g - dg) * t, db + (b - db) * t, 255]);
    }
  }
}

/** One frame of the animation: every layer at a plausible point in its cycle. */
function composite(art) {
  const frame = new Canvas(W, H, SCALE);
  blit(frame, art.panorama.canvas, 0, 0);
  blit(frame, art.clouds.canvas, 0, 0);
  blit(frame, art.waves.canvas, 0, 150);
  blit(frame, art.foam.canvas, 0, 186, 2);
  // Three cabins spaced along the run the CSS animates them over.
  for (const t of [0.12, 0.45, 0.78]) {
    blit(frame, art.cablecar.canvas, Math.round(art.cablecar.x + t * 515), Math.round(art.cablecar.y - t * 66.3));
  }
  blit(frame, art.express.canvas, art.express.x + 96, art.express.y);
  blit(frame, art.portal.canvas, art.portal.x, art.portal.y);
  blit(frame, art.birds.canvas, art.birds.x, art.birds.y, 2);
  for (const name of ['palmLeft', 'palmRight']) blit(frame, art[name].canvas, art[name].x, art[name].y, 2);
  PLAYERS.forEach((_, i) => {
    const part = art[`player${i + 1}`];
    blit(frame, part.canvas, part.x, part.y, 2);
  });
  blit(frame, art.ball.canvas, art.ball.x + 58, art.ball.y - 27);
  return frame;
}

function zoomed(source, zoom, crop) {
  const [x0, y0, x1, y1] = crop ?? [0, 0, source.width / source.scale, source.height / source.scale];
  const [fx, fy] = [x0 * source.scale, y0 * source.scale];
  const [fw, fh] = [(x1 - x0) * source.scale, (y1 - y0) * source.scale];
  const out = new Canvas(fw * zoom, fh * zoom, 1);
  for (let y = 0; y < fh; y += 1) {
    for (let x = 0; x < fw; x += 1) {
      const colour = source.getFine(fx + x, fy + y);
      for (let dy = 0; dy < zoom; dy += 1) {
        for (let dx = 0; dx < zoom; dx += 1) out.setFine(x * zoom + dx, y * zoom + dy, colour);
      }
    }
  }
  return out;
}

/** Blocks in the participant chrome: banner, panels and the fixed bottom nav. */
function chrome(target, oy, width, height) {
  const column = 560;
  const left = Math.round((width - column) / 2);
  const panel = (y, h, fill) => {
    target.fineRect(left, oy + y, column, h, '#12243a');
    target.fineRect(left + 4, oy + y + 4, column - 8, h - 8, fill);
  };
  panel(16, 84, '#f5e2b8');
  panel(112, 150, '#fdfaf2');
  panel(274, 190, '#fdfaf2');
  target.fineRect(0, oy + height - 58, width, 4, '#12243a');
  target.fineRect(0, oy + height - 54, width, 54, '#f5e2b8');
}

const { art, version } = buildScene(SCENE, SCALE);
const frame = zoomed(composite(art), ZOOM, CROP);
if (CROP || flags.plain) {
  await writeFile(OUT, encodePng(frame));
  console.log(`scene crop: ${OUT} (${frame.width}×${frame.height})`);
} else {
  const sheet = new Canvas(frame.width, frame.height * 2 + GUTTER, 1);
  sheet.fineRect(0, 0, sheet.width, sheet.height, '#12243a');
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const colour = frame.getFine(x, y);
      sheet.setFine(x, y, colour);
      sheet.setFine(x, y + frame.height + GUTTER, colour);
    }
  }
  chrome(sheet, frame.height + GUTTER, frame.width, frame.height);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, encodePng(sheet));
  console.log(`scene review: ${OUT} (${sheet.width}×${sheet.height}, scale ${SCALE}, version ${version})`);
}
