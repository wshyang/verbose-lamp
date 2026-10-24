import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ADR-161 — the print stylesheet, checked the only way it can be.
 *
 * jsdom never evaluates `@media print`, and no test in this repo renders a printer, so the
 * sheet that actually comes out of one is unobserved by every other test here. ADR-144 is
 * the precedent and the warning: a stylesheet nothing asserts on shipped a projector that
 * looked switched off for an entire phase, because CSS fails silently by design.
 *
 * So the rules worth stating are stated as text: the ones whose absence produces a sheet
 * that is wrong rather than merely ugly.
 */

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}

describe('the print stylesheet', () => {
  it('reads only custom properties that something actually defines', () => {
    const printCss = read('./print.css');
    const defined = new Set(
      [...read('./tokens.css').matchAll(/(--[a-z0-9-]+)\s*:/g)].map((hit) => hit[1]),
    );
    const used = new Set([...printCss.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((hit) => hit[1]));

    expect([...used].filter((name) => !defined.has(name))).toEqual([]);
  });

  it('turns the console inside out: ink on paper, not pale text on black', () => {
    const printCss = read('./print.css');

    /*
     * The console is near-black with pale text. Printed as-is, a driver either empties a
     * cartridge over the page or drops the background and prints pale grey on white, which
     * is the failure that matters: a record nobody can read.
     */
    expect(printCss).toContain('background: #fff !important');
    expect(printCss).toContain('color: #000 !important');
  });

  it('drops the chrome that means nothing on paper', () => {
    const printCss = read('./print.css');
    const hidden = printCss.slice(printCss.indexOf('.console-tabs'));

    // The tabs you cannot click, and the buttons — including the one that printed the sheet.
    expect(hidden).toContain('.console-tabs');
    expect(hidden).toContain('.final-standings__actions');
    expect(hidden.slice(0, hidden.indexOf('}'))).toContain('display: none !important');
  });

  it('repeats table headings across a page break', () => {
    // Eight groups of four will not fit on one page, and page two of a standings table with
    // no headings is a grid of unlabelled integers.
    expect(read('./print.css')).toContain('display: table-header-group');
  });

  it('carries the provisional warning onto the paper', () => {
    const printCss = read('./print.css');
    const inPrint = printCss.slice(0, printCss.lastIndexOf('@page'));

    /*
     * The one rule here that is about correctness rather than legibility. A provisional
     * sheet read out as the final result is the worst thing this page can cause, and the
     * paper leaves the room without the screen that qualified it.
     */
    expect(inPrint).toContain('.final-standings__warning');
    expect(inPrint).toMatch(/\.final-standings__warning\s*\{[^}]*border: 2pt solid #000/);
  });
});
