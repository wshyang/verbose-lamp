import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { DISCIPLINE_DEBT, REASON_TEXT, type DebtReason } from './test/disciplineBaseline';

/**
 * The coding disciplines as a test (ADDENDUM-031).
 *
 * CLAUDE.md §3 states hard limits — functions ≤ 50 lines, ≤ 3 parameters, nesting
 * ≤ 3, files ≤ 800 lines — and this project has always had comments saying so. A
 * comment does not fail a build. This file does: it parses every source file with
 * the TypeScript compiler and compares the tree against a recorded debt table that
 * can only shrink.
 *
 * Why a ratchet rather than a clean sweep: the violations are real but they are
 * mostly the original import's render rigs and components, and rewriting 51
 * functions in one round would be exactly the kind of unverifiable change this
 * project's addenda exist to prevent. The rule is enforced from now on. One of the
 * entries — `decoTypography.createExtrudedDecoTextMesh`, at 371 lines the worst
 * offender — was split in the same round that added this test, to prove the ratchet
 * turns.
 */

const ROOT = process.cwd();
const SOURCE_DIR = join(ROOT, 'src');

export const LIMITS = {
  fileLines: 800,
  functionLines: 50,
  params: 3,
  nesting: 3,
} as const;

export interface Offence {
  readonly file: string;
  readonly name: string;
  readonly lines: number;
  readonly params: number;
  readonly depth: number;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    // Test files are not production logic; `.d.ts` files are ambient declarations.
    if (!/\.tsx?$/.test(path) || /\.test\.tsx?$/.test(path) || /\.d\.ts$/.test(path)) continue;
    // The recorded debt table describes the limits; it must not be measured by them.
    if (path.endsWith(join('test', 'disciplineBaseline.ts'))) continue;
    found.push(path);
  }
  return found;
}

/** Deepest run of nested control-flow statements inside a function body. */
function nestingDepth(body: ts.Node): number {
  let depth = 0;
  let deepest = 0;
  const visit = (node: ts.Node): void => {
    const structural =
      ts.isIfStatement(node) ||
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isSwitchStatement(node) ||
      ts.isTryStatement(node);
    if (structural) {
      depth += 1;
      deepest = Math.max(deepest, depth);
    }
    ts.forEachChild(node, visit);
    if (structural) depth -= 1;
  };
  visit(body);
  return deepest;
}

function nameOf(node: ts.Node, source: ts.SourceFile): string {
  const named = node as { name?: ts.Node };
  if (named.name) return named.name.getText(source);
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent)) return parent.name.getText(source);
  return '(anonymous)';
}

/** Every function over any limit, measured the same way everywhere. */
export function offencesIn(): Offence[] {
  const found: Offence[] = [];
  for (const file of sourceFiles(SOURCE_DIR)) {
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.ES2020,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const visit = (node: ts.Node): void => {
      const isFunction =
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node);
      if (isFunction) {
        const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
        const end = source.getLineAndCharacterOfPosition(node.getEnd()).line;
        const lines = end - start + 1;
        const params = node.parameters.length;
        const depth = node.body ? nestingDepth(node.body) : 0;
        if (lines > LIMITS.functionLines || params > LIMITS.params || depth > LIMITS.nesting) {
          found.push({ file: relative(ROOT, file), name: nameOf(node, source), lines, params, depth });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

function fileLineCounts(): { file: string; lines: number }[] {
  return sourceFiles(SOURCE_DIR)
    .map((file) => ({ file: relative(ROOT, file), lines: readFileSync(file, 'utf8').split('\n').length }))
    .sort((a, b) => b.lines - a.lines);
}

const key = (entry: { file: string; name: string }) => `${entry.file}::${entry.name}`;

describe('CLAUDE.md hard limits', () => {
  it('keeps every file under 800 lines', () => {
    const oversized = fileLineCounts().filter((entry) => entry.lines > LIMITS.fileLines);
    expect(oversized).toEqual([]);
    // The largest file is still a scene rig the R3F port will retire.
    expect(fileLineCounts()[0].lines).toBeLessThanOrEqual(LIMITS.fileLines);
  });

  it('has no function over the limits that is not on the debt table', () => {
    const recorded = new Map(DISCIPLINE_DEBT.map((entry) => [key(entry), entry]));
    const unrecorded = offencesIn()
      .filter((offence) => !recorded.has(key(offence)))
      .map((offence) => `${offence.file}:${offence.name} (${offence.lines} lines, ${offence.params} params, depth ${offence.depth})`);
    expect(unrecorded).toEqual([]);
  });

  it('never lets a recorded function grow past its ceiling', () => {
    const recorded = new Map(DISCIPLINE_DEBT.map((entry) => [key(entry), entry]));
    const grown = offencesIn()
      .filter((offence) => recorded.has(key(offence)))
      .filter((offence) => {
        const ceiling = recorded.get(key(offence))!;
        return (
          offence.lines > ceiling.maxLines || offence.params > ceiling.maxParams || offence.depth > ceiling.maxDepth
        );
      })
      .map((offence) => `${offence.file}:${offence.name}`);
    expect(grown).toEqual([]);
  });

  it('keeps the debt table honest: every row still names a real function', () => {
    // A renamed or deleted function must lose its row, so the table cannot rot.
    const actual = new Set(offencesIn().map(key));
    const stale = DISCIPLINE_DEBT.filter((entry) => !actual.has(key(entry))).map((entry) => key(entry));
    expect(stale).toEqual([]);
  });

  it('records the debt no faster than it is paid', () => {
    // The ceiling: raise it only with an addendum that says why.
    expect(DISCIPLINE_DEBT.length).toBeLessThanOrEqual(51);
    const byReason = DISCIPLINE_DEBT.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.reason] = (acc[entry.reason] ?? 0) + 1;
      return acc;
    }, {});
    // Every row states a reason, and the reason is one of the documented ones.
    for (const entry of DISCIPLINE_DEBT) expect(REASON_TEXT[entry.reason as DebtReason]).toBeTypeOf('string');
    expect(Object.keys(byReason).sort()).toEqual(
      expect.arrayContaining(['component', 'geometry-primitive', 'render-rig'])
    );
  });

  it('keeps the worst offender from the original import split and measured', () => {
    // The demonstration that the ratchet turns: this function was 371 lines.
    const entry = DISCIPLINE_DEBT.find((row) => row.name === 'createExtrudedDecoTextMesh');
    expect(entry).toBeUndefined();
    expect(offencesIn().some((offence) => offence.name === 'createExtrudedDecoTextMesh')).toBe(false);
  });
});
