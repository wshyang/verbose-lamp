import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCENE_VERSION } from './art/sceneVersion.js';
import { KALLANG_SPRITE_IDS } from './spriteManifest.js';

/**
 * ADR-301 — the committed Kallang plate is served immutable (ADR-067), so its URL carries
 * a content stamp. This recomputes it from the bytes on disk: a replaced plate with a
 * stale `sceneVersion.ts` would be served from caches under its old name for a year.
 */

interface Stamper {
  sceneVersion: (dir?: string) => string;
  sceneFiles: (dir?: string) => string[];
}

function webRoot(): string {
  let dir = resolve(process.cwd());
  while (!existsSync(join(dir, 'public', 'themes'))) {
    const next = existsSync(join(dir, 'apps', 'web', 'public', 'themes')) ? join(dir, 'apps', 'web') : dirname(dir);
    if (next === dir) throw new Error(`cannot locate apps/web from ${process.cwd()}`);
    dir = next;
  }
  return dir;
}

const WEB = webRoot();
const SCENE_DIR = join(WEB, 'public', 'themes', 'kallang', 'scene');
const stamper = (await import(
  /* @vite-ignore */ pathToFileURL(join(WEB, 'scripts', 'themes', 'kallang', 'stamp-scene.mjs')).href
)) as Stamper;

describe('the committed Kallang scene files (ADR-301)', () => {
  it('carries the content hash of the files on disk', () => {
    expect(SCENE_VERSION).toBe(stamper.sceneVersion());
  });

  it('changes the stamp when the plate changes', () => {
    const copy = mkdtempSync(join(tmpdir(), 'kallang-scene-'));
    try {
      cpSync(SCENE_DIR, copy, { recursive: true });
      const before = stamper.sceneVersion(copy);

      writeFileSync(join(copy, 'backdrop-day.jpg'), `${readFileSync(join(copy, 'backdrop-day.jpg')).toString('latin1')}\n`, 'latin1');

      expect(before).toMatch(/^[0-9a-f]{8}$/);
      expect(stamper.sceneVersion(copy)).not.toBe(before);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it('ships exactly what the engine draws: the plate and every sprite it can reference (ADR-306)', () => {
    const drawn = new Set(['backdrop-day.jpg', ...KALLANG_SPRITE_IDS.map((id) => `${id}.png`)]);
    expect(new Set(stamper.sceneFiles())).toEqual(drawn);
    for (const file of drawn) expect(existsSync(join(SCENE_DIR, file))).toBe(true);
  });
});
