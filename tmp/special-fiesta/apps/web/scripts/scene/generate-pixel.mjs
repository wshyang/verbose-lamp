#!/usr/bin/env node
/**
 * ADR-022 / ADR-023 / ADR-298 — builds each venue's animated pixel backdrop for the participant
 * theme. Same rules as the motifs (ADR-014) and the avatar art (ADR-021): hand-drawn pixels,
 * deterministic output, committed to the repo, loaded by URL, never drawn at runtime.
 *
 * For every theme in `scripts/themes/` whose manifest declares a `scene` (or only `--theme <id>`):
 *   apps/web/public/themes/<id>/scene/*.png     classic layers (1 pixel per art unit)
 *   apps/web/public/themes/<id>/scene-2x/*.png  fine layers (2 pixels per art unit)
 *   apps/web/src/themes/<id>/art/pixelArt.ts    version stamp, geometry and both variants' URLs
 *
 * What is drawn and where it sits is the venue's (`scripts/themes/<id>/scene/compose.mjs`); this
 * file only finds venues and writes bytes. `render-review.mjs` imports `buildScene` from
 * `pixel-scene.mjs` for the same reason.
 *
 *   npm run scene --workspace @psd/web
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildAll, serialise } from './pixel-scene.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const THEMES_DIR = join(ROOT, 'scripts', 'themes');

async function loadManifest(id) {
  const { MANIFEST } = await import(pathToFileURL(join(THEMES_DIR, id, 'manifest.mjs')).href);
  if (MANIFEST.id !== id) throw new Error(`${id}/manifest.mjs declares id "${MANIFEST.id}"`);
  return MANIFEST;
}

/** Loads the venue's `SCENE` from the module its manifest names (relative to the theme directory). */
async function loadScene(id, manifest) {
  const url = pathToFileURL(join(THEMES_DIR, id, manifest.scene.compose)).href;
  const { SCENE } = await import(url);
  if (SCENE.id !== id) throw new Error(`${manifest.scene.compose} declares scene id "${SCENE.id}", expected "${id}"`);
  return SCENE;
}

async function generateTheme(id) {
  const manifest = await loadManifest(id);
  if (manifest.scene === undefined) return false;
  const scene = await loadScene(id, manifest);
  const { built, version } = buildAll(scene);

  for (const { dir, scene: variant, name } of built) {
    const out = join(ROOT, 'public', 'themes', id, dir);
    await mkdir(out, { recursive: true });
    for (const [layer, bytes] of variant.encoded) await writeFile(join(out, `${layer}.png`), bytes);
    const total = variant.encoded.reduce((sum, [, bytes]) => sum + bytes.length, 0);
    console.log(`${id} ${name}: ${variant.encoded.length} layers, ${(total / 1024).toFixed(1)} kB → public/themes/${id}/${dir}`);
  }
  const artPath = join(ROOT, 'src', 'themes', id, 'art', 'pixelArt.ts');
  await mkdir(dirname(artPath), { recursive: true });
  await writeFile(artPath, serialise(scene, built[0].scene.geometry, version), 'utf8');
  console.log(`${id}: version ${version}`, built[0].scene.palms ?? '');
  return true;
}

async function themeIds() {
  const flag = process.argv.indexOf('--theme');
  if (flag !== -1) {
    const id = process.argv[flag + 1];
    if (!id) throw new Error('--theme needs an id');
    return [id];
  }
  const entries = await readdir(THEMES_DIR, { withFileTypes: true });
  // A theme is a directory WITH a manifest. A half-made one (an empty folder, a venue whose art is
  // still being drawn) is skipped rather than crashing the whole build.
  return entries
    .filter((entry) => entry.isDirectory() && existsSync(join(THEMES_DIR, entry.name, 'manifest.mjs')))
    .map((entry) => entry.name)
    .sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const id of await themeIds()) {
    const built = await generateTheme(id);
    if (!built) console.log(`${id}: no scene declared, skipped`);
  }
}
