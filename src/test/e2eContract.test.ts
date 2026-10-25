import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The e2e contract, checked without a browser (ADDENDUM-035).
 *
 * The browser specs cannot run in a unit-test pass, so nothing here would notice a spec that
 * selects a `data-testid` no component renders: the failure would land halfway through a
 * screenshot run. This reads the specs and asserts every test id and every URL affordance they
 * rely on still exists in `src/`, which turns a whole class of "works on my machine" into a
 * unit test.
 */
const ROOT = process.cwd();
const E2E_DIR = join(ROOT, 'e2e');
const SRC_DIR = join(ROOT, 'src');

function filesUnder(dir: string, accept: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return filesUnder(path, accept);
    return accept(path) ? [path] : [];
  });
}

const specSources = () => filesUnder(E2E_DIR, (path) => path.endsWith('.ts'));

/** Every test id a spec or helper selects by name, with the file that uses it. */
function testIdsUsedBySpecs(): Map<string, string> {
  const found = new Map<string, string>();
  for (const path of specSources()) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(/getByTestId\(['"]([^'"]+)['"]\)/g)) found.set(match[1], path);
    for (const match of text.matchAll(/data-testid="([^"]+)"/g)) found.set(match[1], path);
    for (const match of text.matchAll(/^\s*(?:open|close|launch|target):\s*'([a-z0-9-]+__[a-z0-9-]+)'/gm)) {
      found.set(match[1], path);
    }
  }
  return found;
}

/** Every string literal in the shipped source, as one searchable blob. */
function shippedSource(): string {
  return filesUnder(SRC_DIR, (path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
}

describe('e2e specs against the source', () => {
  it('has specs to check', () => {
    expect(specSources().length).toBeGreaterThan(0);
    expect(testIdsUsedBySpecs().size).toBeGreaterThan(15);
  });

  it('only select test ids some component renders', () => {
    const source = shippedSource();
    const missing = [...testIdsUsedBySpecs()]
      .filter(([testId]) => !source.includes(`"${testId}"`) && !source.includes(`'${testId}'`))
      .map(([testId, path]) => `${testId} (${path.replace(ROOT, '.')})`);
    expect(missing).toEqual([]);
  });

  it('uses the documented {component-kebab}__{element-role} shape', () => {
    const malformed = [...testIdsUsedBySpecs().keys()].filter((testId) => !/^[a-z0-9-]+__[a-z0-9-]+$/.test(testId));
    expect(malformed).toEqual([]);
  });

  it('relies on the freeze URL and ready flag that the app still provides', () => {
    const stage = readFileSync(join(E2E_DIR, 'support', 'stage.ts'), 'utf8');
    const source = shippedSource();

    expect(stage).toContain('?freezeAt=');
    expect(source).toContain("FREEZE_PARAM = 'freezeAt'");
    expect(stage).toContain('data-frame-ready');
    expect(source).toContain('frameReady');
  });
});
