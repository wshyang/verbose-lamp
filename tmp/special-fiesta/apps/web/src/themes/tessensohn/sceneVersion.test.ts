import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCENE_VERSION } from './art/sceneVersion.js';
import {
  COURT_FRAME,
  SCENE_BASE,
  SCENE_NODES,
  WIDE_NODES,
  type SceneGroup,
  type SceneLayer,
  type SceneNode,
} from './sceneLayers.js';

/**
 * ADR-299 — the committed CSC scene files are served immutable (ADR-067), so their URLs carry a
 * content stamp. This recomputes it from the bytes on disk: a replaced file with a stale
 * `sceneVersion.ts` would be served from caches under its old name for a year.
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
const SCENE_DIR = join(WEB, 'public', 'themes', 'tessensohn', 'scene');
const stamper = (await import(
  /* @vite-ignore */ pathToFileURL(join(WEB, 'scripts', 'themes', 'tessensohn', 'stamp-scene.mjs')).href
)) as Stamper;

const isGroup = (part: SceneLayer | SceneGroup): part is SceneGroup => 'kind' in part;

function filesNamed(): string[] {
  const out: string[] = [];
  const take = (layer: SceneLayer): void => void out.push(layer.file);
  const takeNode = (node: SceneNode): void => {
    if (node.kind === 'layer') out.push(node.file);
    if (node.kind === 'group') node.layers.forEach(take);
  };
  SCENE_NODES.forEach(takeNode);
  WIDE_NODES.forEach(takeNode);
  for (const part of COURT_FRAME) {
    if (isGroup(part)) part.layers.forEach(take);
    else take(part);
  }
  return out;
}

describe('the committed Tessensohn scene files (ADR-299)', () => {
  it('carries the content hash of the files on disk', () => {
    expect(SCENE_VERSION).toBe(stamper.sceneVersion());
  });

  it('changes the stamp when a file changes, and when one is added', () => {
    const copy = mkdtempSync(join(tmpdir(), 'csc-scene-'));
    try {
      cpSync(SCENE_DIR, copy, { recursive: true });
      const before = stamper.sceneVersion(copy);

      writeFileSync(join(copy, 'bg.svg'), `${readFileSync(join(copy, 'bg.svg'), 'utf8')}\n`);
      const edited = stamper.sceneVersion(copy);
      writeFileSync(join(copy, 'extra.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');

      expect(before).toMatch(/^[0-9a-f]{8}$/);
      expect(edited).not.toBe(before);
      expect(stamper.sceneVersion(copy)).not.toBe(edited);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it('ignores dot entries, which are tooling and are never served', () => {
    const names = stamper.sceneFiles();

    expect(names.length).toBeGreaterThan(60);
    expect(names.filter((name) => name.startsWith('.'))).toEqual([]);
  });

  it('has a file on disk behind every layer the scene names', () => {
    const missing = filesNamed().filter((file) => !existsSync(join(SCENE_DIR, file)));

    expect(missing).toEqual([]);
  });

  it('names every file it ships, across both layouts, so nothing is copied and never drawn', () => {
    const used = new Set(filesNamed());
    const shipped = stamper.sceneFiles();
    // The placeholder-free list: CSC's phone banner plus the desktop court group. `mobile` extras
    // such as the plain `bg.svg` are layers too, so anything unnamed is dead weight.
    const unused = shipped.filter((file) => !used.has(file));

    expect(unused).toEqual([]);
  });

  it('serves from the directory the files live in', () => {
    expect(SCENE_BASE).toBe('/themes/tessensohn/scene');
    expect(readdirSync(SCENE_DIR).length).toBeGreaterThan(0);
    expect(readFileSync(join(SCENE_DIR, 'bg.svg'), 'utf8')).toContain('<svg');
  });

  it('holds only passive images: no script, handler or external reference', () => {
    const bad: string[] = [];
    for (const file of stamper.sceneFiles().filter((name) => name.endsWith('.svg'))) {
      const text = readFileSync(join(SCENE_DIR, file), 'utf8');
      if (/<script|\son\w+\s*=|javascript:|<foreignObject|<iframe|<!ENTITY|@import|(?:href|src)=["']https?:/i.test(text)) {
        bad.push(file);
      }
    }

    expect(bad).toEqual([]);
  });
});
