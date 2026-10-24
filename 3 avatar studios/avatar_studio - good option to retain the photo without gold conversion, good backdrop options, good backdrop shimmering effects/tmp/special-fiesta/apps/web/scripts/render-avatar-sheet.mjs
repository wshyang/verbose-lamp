#!/usr/bin/env node
/**
 * Contact sheet for the avatar art — `npm run art:review`.
 *
 * There is no headless browser here (ADR-013), so this composes the layers exactly as
 * `src/lib/avatars.ts` does, resolves the same palette, and writes a PNG: every persona on
 * both builds, then the hair styles, then a row of palette variations. It is the only way
 * to see a face before it ships.
 *
 *   node scripts/render-avatar-sheet.mjs                 # docs/screenshot/avatar-sheet.png
 *   node scripts/render-avatar-sheet.mjs --zoom=8 --out=/tmp/faces.png
 *   node scripts/render-avatar-sheet.mjs --only=male:2   # one face, big
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas, encodePng } from './pixel-canvas.mjs';
import {
  ART_SIZE,
  FIXED_COLOURS,
  HAIR_COLOURS,
  LAYERS,
  PROP_COLOURS,
  SKIN_TONES,
  composeLayerNames,
} from './avatar-art-source.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const flags = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const ZOOM = Number(flags.zoom ?? 3);
const OUT = flags.out ?? join(HERE, '..', '..', '..', 'docs', 'screenshot', 'avatar-sheet.png');
const GAP = 4;

function darken(hex, factor) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return `#${channels.map((c) => Math.max(0, Math.round(c * factor)).toString(16).padStart(2, '0')).join('')}`;
}

function lighten(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const lit = channels.map((c) => Math.min(255, Math.round(c + (255 - c) * amount)));
  return `#${lit.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function mix(hex, other, amount) {
  const read = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const a = read(Number.parseInt(hex.slice(1), 16));
  const b = read(Number.parseInt(other.slice(1), 16));
  const out = a.map((channel, index) => Math.round(channel + (b[index] - channel) * amount));
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** The same role-key → colour map the runtime builds (src/lib/avatars.ts). */
export function palette(variant, look) {
  const swatch = (list, index, factor) => {
    const entry = list[index - 1];
    return { base: entry.base, shade: entry.shade ?? darken(entry.base, factor) };
  };
  const skin = swatch(SKIN_TONES, look.skinTone, 0.78);
  const hair = swatch(HAIR_COLOURS, look.hairColour, 0.68);
  // ADR-028 — the shirt and the backdrop are free colours; their shades are derived.
  const outfit = { base: look.outfitColour, shade: darken(look.outfitColour, 0.74) };
  const backdrop = { base: look.backdrop, shade: darken(look.backdrop, 0.62) };
  const prop = PROP_COLOURS[variant - 1];
  return {
    K: FIXED_COLOURS.ink,
    s: skin.base,
    d: skin.shade,
    f: lighten(skin.base, 0.22),
    p: mix(skin.base, '#ff6b81', 0.42),
    h: hair.base,
    g: hair.shade,
    H: lighten(hair.base, 0.3),
    c: prop.base,
    e: prop.shade,
    A: prop.accent,
    W: FIXED_COLOURS.eyeWhite,
    E: prop.accent,
    I: lighten(prop.accent, 0.42),
    m: FIXED_COLOURS.lip,
    t: outfit.base,
    u: outfit.shade,
    B: backdrop.base,
    b: backdrop.shade,
  };
}

export function composeRows(gender, variant, look) {
  const cells = new Array(ART_SIZE * ART_SIZE).fill('.');
  for (const name of composeLayerNames(gender, variant, look)) {
    const layer = LAYERS[name];
    if (!layer) throw new Error(`missing layer ${name}`);
    for (const [y, row] of layer.entries()) {
      for (let x = 0; x < ART_SIZE; x += 1) {
        const key = row.charAt(x);
        if (key !== '.') cells[y * ART_SIZE + x] = key;
      }
    }
  }
  return Array.from({ length: ART_SIZE }, (unused, y) =>
    cells.slice(y * ART_SIZE, (y + 1) * ART_SIZE).join(''),
  );
}

function drawFace(canvas, originX, originY, gender, variant, look) {
  const colours = palette(variant, look);
  const rows = composeRows(gender, variant, look);
  for (const [y, row] of rows.entries()) {
    for (let x = 0; x < ART_SIZE; x += 1) {
      const key = row.charAt(x);
      const fill = colours[key];
      if (!fill) throw new Error(`no colour for key "${key}" at ${x},${y}`);
      canvas.set(originX + x, originY + y, fill);
    }
  }
}

const OUTFITS = ['#1f4e9c', '#3a8fd0', '#0f8f76', '#2f7a3f', '#c0392b', '#7b2d3a', '#e07b2a', '#6b4bb5', '#333b49', '#e6e8ef'];
const BACKDROPS_HEX = ['#1d5b8c', '#93304a', '#33477a', '#b8770a', '#158a5f', '#c2561f', '#6a3f9e', '#12797f', '#46505e', '#b8467a'];
const LOOK = {
  skinTone: 3, hairStyle: 1, hairColour: 2, facialHair: 1, build: 3,
  outfitColour: OUTFITS[0], backdrop: BACKDROPS_HEX[0],
};

/** Rows of the sheet: label, then the looks drawn side by side. */
function sheetPlan() {
  const personas = [1, 2, 3, 4, 5];
  const plan = [];
  for (const gender of ['male', 'female']) {
    plan.push(personas.map((variant) => ({
      gender,
      variant,
      look: {
        ...LOOK,
        outfitColour: OUTFITS[[0, 4, 8, 6, 2][variant - 1]],
        backdrop: BACKDROPS_HEX[variant - 1],
      },
    })));
  }
  for (const gender of ['male', 'female']) {
    plan.push([1, 2, 3, 4, 5].map((hairStyle) => ({
      gender,
      variant: 2,
      look: { ...LOOK, hairStyle, hairColour: [1, 5, 6, 9, 10][hairStyle - 1] },
    })));
  }
  plan.push([1, 2, 3].map((facialHair) => ({ gender: 'male', variant: 1, look: { ...LOOK, facialHair } })));
  plan.push([1, 3, 5, 7, 8].map((skinTone) => ({ gender: 'female', variant: 4, look: { ...LOOK, skinTone } })));
  // ADR-029 — the five builds, on both presentations.
  plan.push([1, 2, 3, 4, 5].map((build) => ({ gender: 'male', variant: 2, look: { ...LOOK, build } })));
  plan.push([1, 2, 3, 4, 5].map((build) => ({ gender: 'female', variant: 1, look: { ...LOOK, build } })));
  // ADR-030 — stubble and a full beard on every jaw.
  plan.push([1, 2, 3, 4, 5].map((build) => ({
    gender: 'male', variant: 3, look: { ...LOOK, build, facialHair: 2, hairStyle: 5 },
  })));
  plan.push([1, 2, 3, 4, 5].map((build) => ({
    gender: 'male', variant: 5, look: { ...LOOK, build, facialHair: 3, hairStyle: 2 },
  })));
  return plan;
}

function main() {
  if (flags.only) {
    const [gender, variant] = flags.only.split(':');
    const canvas = new Canvas(ART_SIZE, ART_SIZE, ZOOM);
    drawFace(canvas, 0, 0, gender, Number(variant), {
      ...LOOK,
      hairStyle: Number(flags.hair ?? 1),
      facialHair: Number(flags.facial ?? 1),
      build: Number(flags.build ?? LOOK.build),
      skinTone: Number(flags.skin ?? LOOK.skinTone),
    });
    writeFileSync(OUT, encodePng(canvas));
    console.log(`avatar: ${OUT} (${canvas.width}×${canvas.height})`);
    return;
  }

  const plan = sheetPlan();
  const columns = Math.max(...plan.map((row) => row.length));
  const width = columns * (ART_SIZE + GAP) + GAP;
  const height = plan.length * (ART_SIZE + GAP) + GAP;
  const canvas = new Canvas(width, height, ZOOM);
  canvas.rect(0, 0, width, height, '#0d1522');
  plan.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      drawFace(
        canvas,
        GAP + columnIndex * (ART_SIZE + GAP),
        GAP + rowIndex * (ART_SIZE + GAP),
        cell.gender,
        cell.variant,
        cell.look,
      );
    });
  });
  writeFileSync(OUT, encodePng(canvas));
  console.log(`avatar sheet: ${OUT} (${canvas.width}×${canvas.height}, ${ART_SIZE}px art at ${ZOOM}×)`);
}

main();
