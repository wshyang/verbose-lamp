import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The addenda discipline, as a test (ADDENDUM-034).
 *
 * CLAUDE.md §4 says every decision gets an addendum file and a row in
 * `docs/ADDENDA.md`, in the same change. Until now nothing checked it, which is
 * how a file can sit in `docs/addenda/` unregistered — and how two different
 * records can end up claiming the same number, which happened once in this project
 * (the carve-type split was renumbered to 032 when the lattice defect claimed 031).
 *
 * These assertions are cheap and catch exactly that class of drift:
 * register ⟷ files both ways, contiguous numbering, a title that agrees with the
 * filename, a date, and no citation anywhere in the tree that points at a number
 * nobody wrote.
 */

const ROOT = process.cwd();
const ADDENDA_DIR = path.join(ROOT, 'docs', 'addenda');
const REGISTER = path.join(ROOT, 'docs', 'ADDENDA.md');

const NUMBER = /ADDENDUM-(\d{3})/;

/** `ADDENDUM-007-some-slug.md` → 7, or `null` for a stray file. */
function numberOfFile(name: string): number | null {
  const match = /^ADDENDUM-(\d{3})-.*\.md$/.exec(name);
  return match ? Number(match[1]) : null;
}

function addendumFiles(): string[] {
  return readdirSync(ADDENDA_DIR).filter((name) => name.endsWith('.md')).sort();
}

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

/** Numbers registered in the table, in file order. */
function registeredNumbers(): number[] {
  return read(REGISTER)
    .split('\n')
    .map((line) => /^\|\s*\[ADDENDUM-(\d{3})\]\(addenda\/([^)]+)\)/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]));
}

/** Every `.ts`, `.tsx` and `.md` file under `dir`, recursively, minus `node_modules`. */
function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (/\.(ts|tsx|md)$/.test(entry)) found.push(full);
  }
  return found;
}

describe('the addenda register', () => {
  it('registers every addendum file, and only files that exist', () => {
    const files = addendumFiles();
    const numbers = registeredNumbers();
    const fileNumbers = files.map((name) => numberOfFile(name));
    expect(fileNumbers).not.toContain(null);
    expect(numbers).toEqual(fileNumbers as number[]);
  });

  it('numbers addenda 1..N with no gaps and no duplicates', () => {
    const numbers = addendumFiles().map((name) => numberOfFile(name) as number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, index) => index + 1));
  });

  it('opens every addendum with a title that names its own number', () => {
    const wrong = addendumFiles().filter((name) => {
      const number = String(numberOfFile(name)).padStart(3, '0');
      const firstLine = read(path.join(ADDENDA_DIR, name)).split('\n')[0];
      return !firstLine.startsWith(`# ADDENDUM-${number}`);
    });
    expect(wrong).toEqual([]);
  });

  it('dates every addendum and gives each one a body', () => {
    const thin = addendumFiles().filter((name) => {
      const text = read(path.join(ADDENDA_DIR, name));
      return !/\*\*Date:\*\*\s*\d{4}-\d{2}-\d{2}/.test(text) || text.length < 400;
    });
    expect(thin).toEqual([]);
  });

  it('never cites an addendum number that does not exist', () => {
    const known = new Set(addendumFiles().map((name) => numberOfFile(name)));
    const dangling: string[] = [];
    for (const file of [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'docs')), ...walk(path.join(ROOT, 'e2e'))]) {
      const text = read(file);
      for (const match of text.matchAll(new RegExp(NUMBER, 'g'))) {
        if (!known.has(Number(match[1]))) dangling.push(`${path.relative(ROOT, file)} → ${match[0]}`);
      }
    }
    expect(dangling).toEqual([]);
  });
});
