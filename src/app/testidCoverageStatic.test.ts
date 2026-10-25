import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Every control carries a test id, checked statically (ADDENDUM-042).
 *
 * The companion `testidCoverage.test.tsx` renders `GatsbyPremiere` in jsdom and checks
 * the controls on *that* screen; this one parses every component file, so it also
 * covers the screens no test mounts (avatar studio, QR console, frame studio panels).
 *
 * CLAUDE.md §5 requires `data-testid` on every control, and ADDENDUM-001 §3 left the
 * backfill of pre-existing controls as "partial — added to every control touched from
 * now on". A promise to keep touching things is not a mechanism: the e2e suite cannot
 * run here, so a control that loses its id would be found by the user mid-screenshot.
 *
 * This suite parses the tree instead of rendering it. ADDENDUM-022 §5 proposed the
 * same rule as a rendered document scan; a static parse sees every component,
 * including the ones no test mounts, and needs no fixture to reach them.
 */

const SRC = join(process.cwd(), 'src');

/**
 * Intrinsic form controls, plus the shared primitives that take the id as a prop.
 * A `<Button>` without an id is the same defect as a `<button>` without one — the
 * call site is what renders a control the user can press.
 */
const CONTROLS = new Set(['button', 'input', 'select', 'textarea', 'Button', 'IconButton', 'RangeInput']);

/**
 * The primitives themselves are exempt, and only they: each spreads the id it is
 * given onto the element it renders, so the attribute cannot appear on its own tag.
 * Keys are `<path>:<tag>`; a key that stops being needed fails (see the third test).
 */
const PASS_THROUGH = new Set([
  'src/shared/ui/Button.tsx:button',
  'src/shared/ui/IconButton.tsx:Button',
  'src/shared/ui/RangeInput.tsx:input',
]);

/** A control found in the tree, with enough identity to be edited without a search. */
type Control = { site: string; line: number; tag: string; hasId: boolean };

/** Every component file under `src/`, tests excluded — they may legitimately use bare tags. */
function componentFiles(dir: string = SRC): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...componentFiles(path));
    } else if (path.endsWith('.tsx') && !path.endsWith('.test.tsx')) {
      found.push(path);
    }
  }
  return found;
}

function hasTestId(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  source: ts.SourceFile
): boolean {
  return node.attributes.properties.some(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'data-testid'
  );
}

function controlsIn(path: string): Control[] {
  const text = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const site = relative(process.cwd(), path);
  const found: Control[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (CONTROLS.has(tag)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        found.push({ site, line: line + 1, tag, hasId: hasTestId(node, source) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The whole tree, in one pass; ~100 files, so this is cheaper than it looks. */
function controls(): Control[] {
  return componentFiles().flatMap(controlsIn);
}

const ALL = controls();
const MISSING = ALL.filter((control) => !control.hasId);
const describeControl = (control: Control): string =>
  `${control.site}:${control.line} <${control.tag}>`;

describe('data-testid coverage', () => {
  it('scans the whole component tree, not an empty list', () => {
    // A walker that silently found nothing would make every assertion below vacuous.
    expect(componentFiles().length).toBeGreaterThanOrEqual(80);
    expect(ALL.length).toBeGreaterThanOrEqual(60);
  });

  it('gives every control a data-testid, apart from the recorded pass-throughs', () => {
    const unrecorded = MISSING.filter((control) => !PASS_THROUGH.has(`${control.site}:${control.tag}`));
    expect(
      unrecorded.map(describeControl),
      'add data-testid="{component-kebab}__{element-role}" (CLAUDE.md §5)'
    ).toEqual([]);
  });

  it('keeps the pass-through exemption exact, so it cannot rot into a blanket', () => {
    const exempt = new Set(MISSING.map((control) => `${control.site}:${control.tag}`));
    const stale = [...PASS_THROUGH].filter((key) => !exempt.has(key));
    expect(stale, 'this file now gives its control an id; drop the exemption').toEqual([]);
  });

  it('never repeats a test id within one file', () => {
    const duplicates = componentFiles().flatMap((path) => {
      const ids = readFileSync(path, 'utf8').matchAll(/data-testid="([^"]+)"/g);
      const seen = new Set<string>();
      const repeated: string[] = [];
      for (const [, id] of ids) {
        if (seen.has(id)) repeated.push(`${relative(process.cwd(), path)}: ${id}`);
        seen.add(id);
      }
      return repeated;
    });
    expect(duplicates).toEqual([]);
  });
});
