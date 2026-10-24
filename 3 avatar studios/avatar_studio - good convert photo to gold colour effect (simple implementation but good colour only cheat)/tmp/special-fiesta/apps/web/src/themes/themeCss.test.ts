import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOTIF_ROLE_TOKENS, VENUE_TOKENS } from './cssContract.js';

/**
 * ADR-296 — the three guarantees that make the participant stylesheet themable:
 *
 *   1. every `var(--x)` the participant, hall-screen and base stylesheets read is DEFINED
 *      (by `tokens.css`, by a stylesheet itself, or by EVERY venue's theme.css) — the check
 *      gameboy.css never had, which is how `--gb-warn`, `--gb-ink` and `--sand-dark` shipped as
 *      names nothing defined, so their fallbacks always won;
 *   2. every venue's theme.css defines the whole contract (colours, derived tokens, motif roles);
 *   3. the colour pairs the stylesheet really paints keep their contrast in EVERY venue.
 *
 * Themes are discovered from the directory, not listed, so a second venue is held to all three
 * the moment its folder exists.
 */

function webSrc(): string {
  let dir = resolve(process.cwd());
  while (!existsSync(join(dir, 'src', 'themes'))) {
    const next = existsSync(join(dir, 'apps', 'web', 'src', 'themes')) ? join(dir, 'apps', 'web') : dirname(dir);
    if (next === dir) throw new Error(`cannot locate apps/web from ${process.cwd()}`);
    dir = next;
  }
  return join(dir, 'src');
}

const SRC = webSrc();
const read = (relative: string): string => readFileSync(join(SRC, relative), 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

const themeIds = readdirSync(join(SRC, 'themes'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(SRC, 'themes', entry.name, 'theme.css')))
  .map((entry) => entry.name)
  .sort();

/** `--name` of every declaration (`--name:`) in a stylesheet, comments stripped. */
function declared(css: string): Set<string> {
  return new Set([...stripComments(css).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((hit) => hit[1] ?? ''));
}

/** `--name` of every `var(--name…)`. */
function used(css: string): Set<string> {
  return new Set([...stripComments(css).matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((hit) => hit[1] ?? ''));
}

/**
 * The declarations in a theme's `:root, :root[data-venue='<id>'] { … }` block, as name -> value.
 * Parsed rather than regexed over the whole file so a token mentioned in a comment or only used
 * (not defined) cannot satisfy the contract.
 */
function venueBlock(id: string): Map<string, string> {
  const css = stripComments(read(`themes/${id}/theme.css`));
  const open = css.indexOf(`:root[data-venue='${id}'] {`);
  if (open === -1) throw new Error(`${id}/theme.css has no :root[data-venue='${id}'] block`);
  const body = css.slice(css.indexOf('{', open) + 1, css.indexOf('}', open));
  return new Map(
    [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((hit) => [hit[1] ?? '', (hit[2] ?? '').trim()] as const),
  );
}

describe('venue themes are discovered from the directory', () => {
  it('finds at least Sentosa', () => {
    expect(themeIds).toContain('sentosa');
  });
});

describe('every custom property the participant stylesheets read is defined (ADR-296)', () => {
  const sheets = ['styles/gameboy.css', 'styles/screen.css', 'styles/base.css'];
  const structural = declared(read('styles/tokens.css'));

  for (const id of themeIds) {
    it.each(sheets)(`${id}: %s reads nothing undefined`, (sheet) => {
      const css = read(sheet);
      const defined = new Set([...structural, ...declared(css), ...venueBlock(id).keys()]);
      // Set per element at render time by the scene components, not by a stylesheet.
      const setInline = new Set(['--gb-period', '--gb-cable-dx', '--gb-cable-dy']);

      const undefinedHere = [...used(css)].filter((name) => !defined.has(name) && !setInline.has(name));

      expect(undefinedHere).toEqual([]);
    });
  }
});

describe('every venue defines the whole theme contract (ADR-296, ADR-297)', () => {
  for (const id of themeIds) {
    it(`${id}: defines every venue token`, () => {
      const defined = new Set(venueBlock(id).keys());

      expect(VENUE_TOKENS.filter((name) => !defined.has(name))).toEqual([]);
    });

    it(`${id}: points every motif role into its own motifs directory`, () => {
      const block = venueBlock(id);

      for (const role of MOTIF_ROLE_TOKENS) {
        expect(block.get(role), `${id} ${role}`).toMatch(
          new RegExp(`^url\\('/themes/${id}/motifs/[a-z0-9-]+\\.svg\\?v=[0-9a-f]{8}'\\)$`),
        );
      }
    });

    it(`${id}: does not borrow a structural token's name`, () => {
      const structural = declared(read('styles/tokens.css'));

      expect([...venueBlock(id).keys()].filter((name) => structural.has(name))).toEqual([]);
    });
  }
});

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/**
 * The text-on-fill pairs gameboy.css actually paints, measured on 2026-10-16 for Sentosa.
 * `floor` is AA (4.5) where the pair passes; where it does not, the floor is the measured ratio
 * rounded down, so a venue — or an edit — can only make it better. Failing AA is recorded, not
 * hidden: ADR-296 lists each below-AA pair and why it is left alone.
 */
const PAIRS: ReadonlyArray<{ text: string; fill: string; floor: number; note?: string }> = [
  { text: '--ink', fill: '--accent', floor: 4.5 },
  { text: '--ink', fill: '--surface', floor: 4.5 },
  { text: '--ink', fill: '--primary-light', floor: 4.5 },
  { text: '--paper', fill: '--primary-deep', floor: 4.5 },
  { text: '--hot-deep', fill: '--hot-pale', floor: 4.5 },
  { text: '--hot-deep', fill: '--surface', floor: 4.5 },
  { text: '--warn-ink', fill: '--warn', floor: 3.3, note: 'banner is large type; measured 3.33' },
  { text: '#ffffff', fill: '--hot', floor: 3.8, note: 'danger button; measured 3.87, below AA' },
  { text: '#ffffff', fill: '--secondary', floor: 3.5, note: 'ended chip; measured 3.51, below AA' },
];

/**
 * A token's final `#rrggbb`, following `var(--other)` aliases through the venue's own block and
 * then the structural tokens. The banner tokens are aliases (`--banner-bg: var(--primary)`), so a
 * test that only read plain hex would have to repeat the value and could drift from it.
 */
function resolveColour(id: string, token: string, structural: Map<string, string>): string {
  const MAX_ALIAS_DEPTH = 6;
  let current = token;
  for (let depth = 0; depth <= MAX_ALIAS_DEPTH; depth += 1) {
    if (current.startsWith('#')) return current;
    const value = venueBlock(id).get(current) ?? structural.get(current);
    if (value === undefined) throw new Error(`${id}: ${current} is not defined`);
    const alias = /^var\((--[a-z0-9-]+)\)$/.exec(value);
    if (alias?.[1] === undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`${id}: ${current} is not a plain #rrggbb (${value})`);
      return value;
    }
    current = alias[1];
  }
  throw new Error(`${id}: ${token} aliases too deeply`);
}

describe('the banner title is legible in every venue (ADR-299)', () => {
  const structural = new Map<string, string>(
    [...stripComments(read('styles/tokens.css')).matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map(
      (hit) => [hit[1] ?? '', hit[2] ?? ''] as const,
    ),
  );
  const at = (id: string, token: string) => resolveColour(id, token, structural);
  const AA = 4.5;

  for (const id of themeIds) {
    it(`${id}: the title reads on the bar, directly or through its outline`, () => {
      const [title, outline] = [at(id, '--banner-ink'), at(id, '--banner-outline')];
      const bar = [at(id, '--banner-bg'), at(id, '--banner-bg-deep')];

      // The bar is a gradient, so the title has to survive its worse end.
      const direct = Math.min(...bar.map((end) => contrast(title, end)));
      // A title that does not stand off the bar by itself (Sentosa's red on sand) stands off it by
      // its outline: the outline has to separate from the bar, and the title has to separate from
      // the outline.
      const outlined = Math.min(...bar.map((end) => contrast(outline, end)), contrast(title, outline));

      expect(Math.max(direct, outlined), `${id}: direct ${direct.toFixed(2)}, outlined ${outlined.toFixed(2)}`).toBeGreaterThanOrEqual(
        outlined >= AA || direct >= AA ? AA : 3,
      );
    });

    it(`${id}: the banner frame separates from the page behind it`, () => {
      // The frame is what draws the bar's edge against the sky or the plate.
      expect(contrast(at(id, '--banner-border'), at(id, '--banner-bg'))).toBeGreaterThanOrEqual(2);
    });
  }
});

describe('the colour pairs the stylesheet paints keep their contrast in every venue (ADR-296)', () => {
  const structural = new Map<string, string>(
    [...stripComments(read('styles/tokens.css')).matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map(
      (hit) => [hit[1] ?? '', hit[2] ?? ''] as const,
    ),
  );

  function colour(id: string, token: string): string {
    return resolveColour(id, token, structural);
  }

  for (const id of themeIds) {
    it.each(PAIRS)(`${id}: $text on $fill holds $floor:1`, ({ text, fill, floor }) => {
      expect(contrast(colour(id, text), colour(id, fill))).toBeGreaterThanOrEqual(floor);
    });
  }
});

describe('the accent belongs to the venue (ADR-300)', () => {
  const structural = new Map<string, string>(
    [...stripComments(read('styles/tokens.css')).matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map(
      (hit) => [hit[1] ?? '', hit[2] ?? ''] as const,
    ),
  );
  const colour = (id: string, token: string) => resolveColour(id, token, structural);

  it('tessensohn: the accent is its own blue family, not the gold Sentosa lent it', () => {
    // ADR-299 copied Sentosa's #ffc72c / #e0a800 verbatim; ADR-300 replaces them with the
    // venue's institutional blues. Pinning the pair stops a future copy-paste quietly
    // re-gilding the venue — every accent surface (buttons, badges, outlines, the current
    // tab) follows these two tokens.
    expect(colour('tessensohn', '--accent')).toBe('#6fa8d6');
    expect(colour('tessensohn', '--accent-deep')).toBe('#2372bc');
    expect(colour('tessensohn', '--accent')).not.toBe(colour('sentosa', '--accent'));
  });

  it('tessensohn: the current tab is the deep blue, read with paper (ADR-300)', () => {
    // The venue-scoped rule in themes/tessensohn/theme.css paints the lit tab
    // --primary-deep under --paper; keep the pair AA here so the override cannot rot.
    expect(contrast(colour('tessensohn', '--paper'), colour('tessensohn', '--primary-deep'))).toBeGreaterThanOrEqual(4.5);
  });
});
