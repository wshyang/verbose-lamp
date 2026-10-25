import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every feature barrel is loaded once. A barrel is the only door between features (CLAUDE.md §6), so a
 * broken or circular one should fail here rather than in the browser, and loading them keeps the
 * barrels themselves in the coverage contract instead of leaving them as untested re-export lists.
 *
 * The list is read from `src/features/`, not written out: a hand-kept list names a feature that is
 * gone (PR #4's still named `party-sparklers`) and silently misses one that was added.
 */
const FEATURES_DIR = join(process.cwd(), 'src', 'features');

// Dot-directories are tool state, not features.
const features = readdirSync(FEATURES_DIR)
  .filter((name) => !name.startsWith('.') && statSync(join(FEATURES_DIR, name)).isDirectory())
  .sort();

const SHARED = ['@/shared/ui', '@/app'] as const;

describe('feature barrels', () => {
  it('finds the features', () => {
    expect(features.length).toBeGreaterThanOrEqual(15);
  });

  it.each(features)('%s has a barrel', (name) => {
    expect(existsSync(join(FEATURES_DIR, name, 'index.ts'))).toBe(true);
  });

  it.each(features)('@/features/%s exports something', async (name) => {
    const barrel = await import(/* @vite-ignore */ `@/features/${name}`);

    expect(Object.keys(barrel).length).toBeGreaterThan(0);
  });

  it.each(SHARED)('%s exports something', async (path) => {
    const barrel = await import(/* @vite-ignore */ path);

    expect(Object.keys(barrel).length).toBeGreaterThan(0);
  });
});
