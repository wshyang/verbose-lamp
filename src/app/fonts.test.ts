import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
function sourcesUnder(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [readFileSync(path, 'utf8')];
  return readdirSync(path).flatMap((entry) => (entry.includes('.test.') ? [] : sourcesUnder(join(path, entry))));
}

const imports = [...readFileSync(join(ROOT, 'src/app/fonts.ts'), 'utf8').matchAll(/import '([^']+)'/g)].map((m) => m[1]);

describe('self-hosted fonts', () => {
  // Derived from the source, so a family added to a stylesheet or component without a matching
  // import fails here instead of silently falling back to Georgia.
  it('imports every family the app styles with', () => {
    const named = new Set<string>();
    for (const file of ['src/index.css', 'src/features/avatar-studio', 'src/features/gilded-ui', 'src/features/lucky-draw']) {
      for (const text of sourcesUnder(join(ROOT, file))) {
        for (const match of text.matchAll(/(?:font-family:|--font-[a-z]+:)\s*"([^"]+)"/g)) named.add(match[1]);
        for (const match of text.matchAll(/\b\d+px "([A-Z][A-Za-z ]+)"/g)) named.add(match[1]);
      }
    }
    const slug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');
    const missing = [...named]
      .filter((name) => !['Segoe UI', 'Georgia'].includes(name))
      .filter((name) => !imports.some((entry) => entry.startsWith(`@fontsource/${slug(name)}/`)));

    expect(named.size).toBeGreaterThanOrEqual(5);
    expect(missing).toEqual([]);
  });

  it('only imports faces that exist in the installed packages', () => {
    const missing = imports.filter((entry) => !existsSync(join(ROOT, 'node_modules', entry)));

    expect(missing).toEqual([]);
  });

  it('imports each face once and only the latin subset', () => {
    expect(new Set(imports).size).toBe(imports.length);
    for (const entry of imports) expect(entry).toMatch(/\/latin-\d+(-italic)?\.css$/);
  });

  // The old page fetched these from Google at runtime, so an offline or blocked visit silently
  // lost its typography and canvas text baked the fallback. Nothing may bring that back.
  it('does not load fonts from a CDN in index.html', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it('runs before the stylesheet in main.tsx so the faces exist when styles resolve', () => {
    const main = readFileSync(join(ROOT, 'src/main.tsx'), 'utf8');

    expect(main.indexOf('./app/fonts')).toBeGreaterThan(-1);
    expect(main.indexOf('./app/fonts')).toBeLessThan(main.indexOf('./index.css'));
  });
});
