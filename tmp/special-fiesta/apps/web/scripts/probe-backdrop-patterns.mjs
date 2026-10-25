#!/usr/bin/env node
/**
 * Step 1 of `docs/design/backdrop-pattern-assessment.md` — the 32px contact-sheet probe.
 *
 * An avatar is drawn at 64x64 and a photo sprite at 128x128, but the surface that decides
 * whether a pattern works is a chat avatar at roughly 32 CSS pixels. Every parameter range in
 * the assessment is read off the sheets this emits rather than guessed, because ADR-203 is a
 * standing reminder of what an unverified claim about a visual property costs: a doc comment
 * asserted a bye distribution the code had never produced, and it survived for exactly as long
 * as nobody printed the output.
 *
 * This is a tool, not a build input. Nothing in the app imports it and nothing it writes is
 * committed. It is kept so the next person to disagree with a range can re-derive it in one
 * command instead of re-arguing it.
 *
 *   node apps/web/scripts/probe-backdrop-patterns.mjs [outDir]
 *
 * Needs ImageMagick (`montage`, `convert`). Tiles are rendered at 64 and downsampled to 32 by
 * `montage`, so what the sheet shows IS the 32px image; the final 400% point-resize only makes
 * those same pixels big enough to look at.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SIZE = 64;
const TAU = Math.PI * 2;
const OUT = process.argv[2] ?? '/tmp/backdrop-probe';

/* ── colour ─────────────────────────────────────────────────────────────── */

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * The decided colour model: two endpoints, the intermediate bands interpolated.
 * Interpolating in LINEAR light rather than in sRGB is the difference between a midpoint that
 * looks like the average of the two colours and one that looks muddy.
 */
function ramp(hexA, hexB, bands) {
  const channels = (hex) => [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const from = channels(hexA);
  const to = channels(hexB);
  return Array.from({ length: bands }, (_unused, index) => {
    const t = bands === 1 ? 0 : index / (bands - 1);
    return from.map((channel, k) => Math.round(255 * toSrgb(channel + (to[k] - channel) * t)));
  });
}

/* ── geometry ───────────────────────────────────────────────────────────── */

/** Centred unit space. The half cell is what keeps a pattern symmetric about the middle. */
const unitSpace = (x, y) => [(x + 0.5) / SIZE - 0.5, (y + 0.5) / SIZE - 0.5];
const pNorm = (u, v, p) =>
  p === Infinity ? Math.max(Math.abs(u), Math.abs(v)) : (Math.abs(u) ** p + Math.abs(v) ** p) ** (1 / p);
/** Canonical closed form, no branches: en.wikipedia.org/wiki/Triangle_wave */
const triangle = (t) => 4 * Math.abs(t - Math.floor(t + 0.75) + 0.25) - 1;
const mod = (n, m) => ((n % m) + m) % m;

const PATTERNS = {
  concentric: (u, v, o) => {
    const theta = Math.atan2(v, u);
    const radius = pNorm(u, v, o.p) * (1 + o.lobeDepth * Math.cos(o.lobes * theta));
    const sectors = o.sectors ? (theta / TAU) * o.sectors : 0;
    return mod(Math.floor((radius * SIZE) / o.ringWidth + sectors), o.bands);
  },
  chevron: (u, v, o) => {
    const [c, s] = [Math.cos(o.angle), Math.sin(o.angle)];
    const [uu, vv] = [u * c - v * s, u * s + v * c];
    const wave = o.wave === 'tri' ? triangle : (t) => Math.sin(TAU * t);
    const offset = (o.amp / SIZE) * wave((uu * SIZE) / o.period);
    return mod(Math.floor(((vv - offset) * SIZE) / o.bandHeight), o.bands);
  },
  psychedelic: (u, v, o) => {
    const uu = u + o.warp * Math.sin(TAU * o.freq * v);
    const vv = v + o.warp * Math.sin(TAU * o.freq * u);
    const theta = Math.atan2(vv, uu) + Math.hypot(uu, vv) * SIZE * (o.twist ?? 0);
    const base = o.field === 'radial' ? (theta / TAU) * o.rays : (vv * SIZE) / o.bandHeight;
    return mod(Math.floor(base), o.bands);
  },
};

function renderPpm(kind, options) {
  const colours = ramp(options.a ?? '#1d5b8c', options.b ?? '#f7d154', options.bands);
  const pixels = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const [u, v] = unitSpace(x, y);
      pixels.set(colours[PATTERNS[kind](u, v, options)], (y * SIZE + x) * 3);
    }
  }
  return Buffer.concat([Buffer.from(`P6\n${SIZE} ${SIZE}\n255\n`), pixels]);
}

/* ── sheets ─────────────────────────────────────────────────────────────── */

mkdirSync(join(OUT, 'tiles'), { recursive: true });

function sheet(name, rows, cols, make) {
  const files = [];
  rows.forEach((row, ri) =>
    cols.forEach((col, ci) => {
      const file = join(OUT, 'tiles', `${name}-${ri}-${ci}.ppm`);
      writeFileSync(file, renderPpm(...make(row, col)));
      files.push(file);
    }),
  );
  const small = join(OUT, `${name}-32.png`);
  execFileSync('montage', [
    ...files, '-tile', `${cols.length}x`, '-geometry', '32x32+5+5', '-background', '#202020', small,
  ]);
  execFileSync('convert', [small, '-filter', 'point', '-resize', '400%', join(OUT, `${name}.png`)]);
  console.log(`${name}.png — rows ${rows.join(',')} | cols ${cols.join(',')}`);
}

// 1. Concentric: ring width in cells (rows) x shape exponent p (cols).
sheet('01-rings', [3, 4, 6, 8, 12, 16], [1, 2, 4, Infinity], (ringWidth, p) =>
  ['concentric', { p, ringWidth, lobes: 0, lobeDepth: 0, bands: 3 }]);

// 2. Concentric: lobe count (rows) x lobe depth (cols).
sheet('02-lobes', [0, 3, 5, 6, 8, 12], [0.1, 0.2, 0.35, 0.5], (lobes, lobeDepth) =>
  ['concentric', { p: 2, ringWidth: 8, lobes, lobeDepth, bands: 3 }]);

// 3. Chevron: period (rows) x amplitude (cols) — the coupled pair.
sheet('03-chevron', [6, 8, 12, 16, 24, 48], [0, 4, 8, 16, 24], (period, amp) =>
  ['chevron', { wave: 'tri', period, amp, bandHeight: 8, bands: 3, angle: 0 }]);

// 4. Bargello: band height (rows) x band count (cols) — does interpolation buy legibility?
sheet('04-bargello', [3, 4, 6, 8, 12, 16], [2, 3, 4, 5, 6], (bandHeight, bands) =>
  ['chevron', { wave: 'sin', period: 24, amp: 10, bandHeight, bands, angle: 0 }]);

// 5. Psychedelic on a linear field: warp strength (rows) x ripple frequency (cols).
sheet('05-warp', [0, 0.02, 0.04, 0.08, 0.12, 0.2], [1, 2, 3, 5], (warp, freq) =>
  ['psychedelic', { warp, freq, field: 'linear', bandHeight: 8, bands: 3 }]);

// 6. Psychedelic on a radial field: warp strength (rows) x vortex twist (cols).
sheet('06-swirl', [0, 0.02, 0.04, 0.08, 0.12, 0.2], [0, 0.004, 0.008, 0.014], (warp, twist) =>
  ['psychedelic', { warp, freq: 2, field: 'radial', rays: 6, twist, bands: 3 }]);

console.log(`\nwrote ${OUT}`);
