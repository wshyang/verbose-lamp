// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { DISCIPLINE_DEBT } from './test/disciplineBaseline';

/**
 * The coding disciplines as a test (ADDENDUM-032).
 *
 * CLAUDE.md §3 states hard limits — functions ≤ 50 lines, ≤ 3 parameters, nesting
 * ≤ 3, files ≤ 800 lines — and this project has always had comments saying so. A
 * comment does not fail a build. This file does: it parses every source file with
 * the TypeScript compiler and compares the tree against a recorded debt table that
 * can only shrink.
 *
 * Why a ratchet rather than a clean sweep: the violations are real but they are
 * mostly the original import's render rigs and components, and rewriting every one
 * of them in one round would be exactly the kind of unverifiable change this
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

describe('CLAUDE.md hard limits', () => {

  it('keeps the worst offender from the original import split and measured', () => {
    // The demonstration that the ratchet turns: this function was 371 lines.
    const entry = DISCIPLINE_DEBT.find((row) => row.name === 'createExtrudedDecoTextMesh');
    expect(entry).toBeUndefined();
    expect(offencesIn().some((offence) => offence.name === 'createExtrudedDecoTextMesh')).toBe(false);
  });
});
