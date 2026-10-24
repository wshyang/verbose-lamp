import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ADR-257 — "high contrast" is a number, not an adjective. The light
 * console's text tokens are parsed out of the stylesheet and their contrast
 * against their grounds is required to clear WCAG AA for normal text
 * (4.5:1). A future palette tweak that quietly drops below it fails here
 * instead of on a beach in glare. The dark defaults are pinned too, so the
 * toggle's other side cannot rot unnoticed.
 */

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}

function tokensIn(block: string): Map<string, string> {
  return new Map(
    [...block.matchAll(/(--console-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map((hit) => [
      hit[1] ?? '',
      hit[2] ?? '',
    ]),
  );
}

function luminance(hex: string): number {
  const channel = (at: number) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(one: string, other: string): number {
  const [hi, lo] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const css = read('./console.css');
const tokens = read('./tokens.css');
const lightBlock = css.slice(css.indexOf("[data-console-theme='light'] {"));
const light = tokensIn(lightBlock.slice(0, lightBlock.indexOf('}')));
const dark = tokensIn(tokens.slice(tokens.indexOf('--console-bg')));

describe('the light console palette (ADR-257)', () => {
  it('defines every themed token for the light scope', () => {
    for (const name of [
      '--console-bg',
      '--console-panel',
      '--console-line',
      '--console-text',
      '--console-muted',
      '--console-accent',
      '--console-danger',
      '--console-ok',
    ]) {
      expect(light.get(name), name).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('keeps every light text token at AA contrast on its ground', () => {
    const panel = light.get('--console-panel') ?? '';
    const bg = light.get('--console-bg') ?? '';
    expect(contrast(light.get('--console-text') ?? '', panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light.get('--console-muted') ?? '', panel)).toBeGreaterThanOrEqual(4.5);
    // The accent is read as text (panel headings, warning borders sit beside text).
    expect(contrast(light.get('--console-accent') ?? '', panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light.get('--console-danger') ?? '', bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light.get('--console-ok') ?? '', bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the dark default tokens at AA contrast too', () => {
    const panel = dark.get('--console-panel') ?? '';
    expect(contrast(dark.get('--console-text') ?? '', panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark.get('--console-muted') ?? '', panel)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the field help placement (ADR-327)', () => {
  const block = (selector: string): string => {
    const start = css.indexOf(`\n${selector} {`);
    return css.slice(start, css.indexOf('}', start));
  };

  it('makes the help trigger a fixed, margin-free slot beside its label', () => {
    const wrap = block('.console-help-wrap');
    expect(wrap).toContain('flex: 0 0 22px;');
    expect(wrap).toContain('width: 22px;');
    expect(wrap).toContain('height: 22px;');
    expect(wrap).toContain('margin: 0;');
    expect(wrap).toContain('vertical-align: middle;');
  });

  it('puts the field spacing on the label row, not on the label and icon separately', () => {
    expect(block('.console-field__head')).toContain('margin: var(--space-3) 0 var(--space-1);');
    expect(block('.console-field__head .console-label')).toContain('margin: 0;');
    expect(block('.console-row > .console-label')).toContain('margin: 0;');
  });

  it('pins controls to the foot of a shared field track so wrapped labels cannot stagger them', () => {
    expect(block('.console-field')).toContain('flex-direction: column;');
    expect(block('.console-field > :not(.console-field__head)')).toContain('margin-top: auto;');
    expect(block('.console-grid--fields .console-field:only-child')).toContain('height: 100%;');
    expect(block('.console-row > .console-field')).toContain('align-self: stretch;');
  });
});

describe('the centred button label', () => {
  it('centres wrapped button text in the gameboy stylesheet', () => {
    const gameboy = read('./gameboy.css');
    const button = gameboy.slice(gameboy.indexOf('\n.gb-button {'));
    expect(button.slice(0, button.indexOf('}'))).toContain('text-align: center;');
  });
});

describe('the kebab stays small beside its pill', () => {
  const gameboy = read('./gameboy.css');
  const block = (selector: string): string => {
    const start = gameboy.indexOf(`\n${selector} {`);
    return gameboy.slice(start, gameboy.indexOf('}', start));
  };

  it('gives the toggle no visible box — three dots, not a button slab', () => {
    const toggle = block('.gb-kebab__toggle');
    expect(toggle).toContain('border: none;');
    expect(toggle).toContain('background: transparent;');
  });

  it('keeps the menu narrow with a hairline border, not the old slab', () => {
    const menu = block('.gb-kebab__menu');
    expect(menu).toContain('min-width: 156px;');
    expect(menu).toContain('border: 2px solid var(--ink);');
  });
});
