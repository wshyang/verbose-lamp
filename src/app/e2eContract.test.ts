import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The e2e contract, checked without a browser (ADDENDUM-030 §3).
 *
 * `e2e/*.spec.ts` cannot run in this sandbox, so nothing here would notice a spec
 * that selects a `data-testid` no component renders — the failure would land on the
 * user's machine, halfway through a screenshot run. This suite reads the specs and
 * asserts every test id they use still exists in `src/`, which turns a whole class
 * of "works on my machine" into a unit test.
 */

const ROOT = process.cwd();
const E2E_DIR = join(ROOT, 'e2e');
const SRC_DIR = join(ROOT, 'src');

/** Every `getByTestId('…')` and `data-testid="…"` literal in the e2e tree. */
function testIdsUsedBySpecs(): Map<string, string> {
  const found = new Map<string, string>();
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        visit(path);
        continue;
      }
      if (!path.endsWith('.ts')) continue;
      const text = readFileSync(path, 'utf8');
      for (const match of text.matchAll(/getByTestId\(['"]([^'"]+)['"]\)/g)) found.set(match[1], path);
      for (const match of text.matchAll(/data-testid="([^"]+)"/g)) found.set(match[1], path);
      // Dialog tables and similar: `{ open: 'a__b', close: 'c__d' }`.
      for (const match of text.matchAll(/^\s*(?:open|close|launch|target):\s*'([a-z0-9-]+__[a-z0-9-]+)'/gm)) {
        found.set(match[1], path);
      }
    }
  };
  visit(E2E_DIR);
  return found;
}

/** Every test id a component renders, as one searchable blob of source text. */
function renderedTestIds(): string {
  const chunks: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        visit(path);
        continue;
      }
      if (!/\.tsx?$/.test(path) || /\.test\.tsx?$/.test(path)) continue;
      chunks.push(readFileSync(path, 'utf8'));
    }
  };
  visit(SRC_DIR);
  return chunks.join('\n');
}

describe('e2e specs against the source', () => {
  it('only select test ids some component renders', () => {
    const used = testIdsUsedBySpecs();
    expect(used.size).toBeGreaterThan(15);
    const source = renderedTestIds();
    const missing = [...used]
      .filter(([testId]) => !source.includes(`"${testId}"`) && !source.includes(`'${testId}'`))
      .map(([testId, path]) => `${testId} (${path.replace(ROOT, '.')})`);
    expect(missing).toEqual([]);
  });

  it('keeps the two renderers reachable from the URL the specs use', () => {
    const stageSupport = readFileSync(join(E2E_DIR, 'support', 'stage.ts'), 'utf8');
    // `gotoFrozen` depends on both affordances; a rename would silently break it.
    expect(stageSupport).toContain('?freezeAt=');
    expect(stageSupport).toContain('data-frame-ready');
  });
});
