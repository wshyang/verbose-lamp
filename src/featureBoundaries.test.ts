import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * "A feature's barrel is the only door" (CLAUDE.md §6), as a test (modularity review 2026-10-26,
 * Issue 2). `barrels.test.ts` proves each barrel loads; nothing proved anyone used them. This
 * parses every production source file and checks each import against two rules:
 *
 * 1. A feature is reached only through `@/features/<name>` or its pure `@/features/<name>/model`
 *    entry, never through a deeper path.
 * 2. A feature may import only the features the table below declares, so a new dependency is a
 *    decision someone reads in a diff, not an accident.
 *
 * `KNOWN_EXCEPTIONS` is for anything not yet migrated. Each row says why, and it may only shrink.
 */
const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const FEATURES_DIR = join(SRC, 'features');

/** Feature → the features it may import. `app` may import any. Missing means none. */
const ALLOWED_FEATURE_DEPS: Readonly<Record<string, readonly string[]>> = {
  'art-deco-frame': ['deco-lattice'],
  'avatar-studio': ['background-removal', 'enamel-backdrop', 'face-detection', 'gilded-portrait'],
  'event-night': ['deco-lattice', 'gilded-ui', 'lucky-draw', 'spectacle', 'spectacle-preview'],
  'frame-studio': ['art-deco-frame'],
  'lucky-draw': ['deco-lattice'],
  premiere: ['art-deco-frame'],
  'spectacle-preview': ['spectacle'],
  'title-customizer': ['premiere'],
};

/** Imports that bypass the rule today, each with the reason. The target is an empty list. */
const KNOWN_EXCEPTIONS: readonly { readonly file: string; readonly specifier: string; readonly reason: string }[] = [];

interface ImportRef {
  readonly file: string;
  readonly specifier: string;
  readonly isTypeOnly: boolean;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === 'testing' || entry === 'test') continue;
      found.push(...sourceFiles(path));
      continue;
    }
    if (!/\.tsx?$/.test(path) || /\.test\.tsx?$/.test(path) || /\.d\.ts$/.test(path)) continue;
    found.push(path);
  }
  return found;
}

function importsOf(file: string): ImportRef[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const refs: ImportRef[] = [];
  source.forEachChild((node) => {
    const isImport = ts.isImportDeclaration(node);
    const isReExport = ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined;
    if (!isImport && !isReExport) return;
    const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
    const isTypeOnly = isImport
      ? Boolean(node.importClause?.isTypeOnly)
      : Boolean((node as ts.ExportDeclaration).isTypeOnly);
    refs.push({ file: relative(ROOT, file), specifier, isTypeOnly });
  });
  return refs;
}

/** The module a specifier points at, as `@/...`, or null for a package. */
function resolveSpecifier(file: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return specifier;
  if (!specifier.startsWith('.')) return null;
  const target = resolve(join(file, '..'), specifier);
  return `@/${relative(SRC, target).split(sep).join('/')}`;
}

/** `features/premiere/hooks/x.ts` → `premiere`; anything outside a feature → null. */
function featureOf(path: string): string | null {
  const match = /^src\/features\/([^/]+)\//.exec(path.split(sep).join('/'));
  return match ? match[1] : null;
}

function targetFeature(resolved: string): { feature: string; rest: string } | null {
  const match = /^@\/features\/([^/]+)(?:\/(.*))?$/.exec(resolved);
  return match ? { feature: match[1], rest: match[2] ?? '' } : null;
}

const files = sourceFiles(SRC);
const everyImport = files.flatMap((file) => importsOf(file).map((ref) => ({ ...ref, abs: file })));
const isException = (file: string, specifier: string) =>
  KNOWN_EXCEPTIONS.some((row) => row.file === file && row.specifier === specifier);

describe('feature boundaries', () => {
  it('finds the source it is meant to police', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(everyImport.length).toBeGreaterThan(1000);
  });

  it('reaches another feature only through its barrel or its pure model entry', () => {
    const offences = everyImport.flatMap((ref) => {
      const resolved = resolveSpecifier(ref.abs, ref.specifier);
      const target = resolved ? targetFeature(resolved) : null;
      if (!target) return [];
      const isOwnFeature = featureOf(ref.file) === target.feature;
      const isDoor = target.rest === '' || target.rest === 'model';
      if (isOwnFeature || isDoor || isException(ref.file, ref.specifier)) return [];
      return [`${ref.file} imports ${ref.specifier}`];
    });

    expect(offences).toEqual([]);
  });

  it('imports only the features the dependency table declares', () => {
    const offences = everyImport.flatMap((ref) => {
      const own = featureOf(ref.file);
      const resolved = resolveSpecifier(ref.abs, ref.specifier);
      const target = resolved ? targetFeature(resolved) : null;
      if (!own || !target || own === target.feature) return [];
      const allowed = ALLOWED_FEATURE_DEPS[own] ?? [];
      return allowed.includes(target.feature) ? [] : [`${own} -> ${target.feature} (${ref.file})`];
    });

    expect(offences).toEqual([]);
  });

  it('keeps shared code free of features, and features free of the app', () => {
    const offences = everyImport.flatMap((ref) => {
      const resolved = resolveSpecifier(ref.abs, ref.specifier);
      if (!resolved) return [];
      const inShared = ref.file.split(sep).join('/').startsWith('src/shared/');
      const inFeature = featureOf(ref.file) !== null;
      if (inShared && resolved.startsWith('@/features/')) return [`shared imports a feature: ${ref.file} -> ${ref.specifier}`];
      if (inFeature && /^@\/app(\/|$)/.test(resolved)) return [`feature imports the app: ${ref.file} -> ${ref.specifier}`];
      return [];
    });

    expect(offences).toEqual([]);
  });

  it('keeps every pure model entry free of React, Three.js and the DOM', () => {
    const entries = readdirSync(FEATURES_DIR)
      .map((name) => join(FEATURES_DIR, name, 'model', 'index.ts'))
      .filter((path) => {
        try {
          return statSync(path).isFile();
        } catch {
          return false;
        }
      });
    expect(entries.length).toBeGreaterThanOrEqual(2);

    const heavy = /^(react|react-dom|three|@react-three\/.*|zustand.*)$/;
    const offences = entries.flatMap((entry) =>
      importsOf(entry)
        .filter((ref) => !ref.isTypeOnly && heavy.test(ref.specifier))
        .map((ref) => `${ref.file} imports ${ref.specifier}`),
    );

    expect(offences).toEqual([]);
  });

  it('never lets the exception list grow stale or unexplained', () => {
    for (const row of KNOWN_EXCEPTIONS) {
      expect(row.reason.length).toBeGreaterThan(10);
      expect(everyImport.some((ref) => ref.file === row.file && ref.specifier === row.specifier)).toBe(true);
    }
  });
});
