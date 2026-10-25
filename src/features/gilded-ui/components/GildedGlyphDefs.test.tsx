// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { goldTableValues } from '../model/goldTable';
import { GildedGlyphDefs } from './GildedGlyphDefs';

setupDomTests();

/** jsdom has no jest-dom matchers here; read attributes directly. */
const attr = (el: Element | null, name: string) => {
  expect(el).not.toBeNull();
  return el!.getAttribute(name);
};

/**
 * One shared <defs> for the whole page: the emoji-colour → luminance → gold-ramp
 * filter that makes platform emoji agree with each other, plus the three plaque
 * gradients (ADDENDUM-020 §3.8). Rendered once by Event Night, so it needs its own
 * mount to be covered at all.
 */
describe('GildedGlyphDefs', () => {
  it('is an invisible, unfocusable svg so it never affects layout', () => {
    const { container } = render(<GildedGlyphDefs />);
    const svg = container.querySelector('svg')!;

    expect(attr(svg, 'width')).toBe('0');
    expect(attr(svg, 'height')).toBe('0');
    expect(attr(svg, 'aria-hidden')).toBe('true');
    expect(attr(svg, 'focusable')).toBe('false');
  });

  it('collapses colour to luminance before tinting, so emoji look identical everywhere', () => {
    const { container } = render(<GildedGlyphDefs />);

    const matrix = container.querySelector('feColorMatrix')!;
    expect(attr(matrix, 'type')).toBe('matrix');
    // Each colour row is the same luminance triple: the output is grey.
    const rows = matrix.getAttribute('values')!.trim().split(/\s{2,}/);
    expect(rows[0].startsWith('0.2126 0.7152 0.0722')).toBe(true);
    expect(rows[1].startsWith('0.2126 0.7152 0.0722')).toBe(true);
    expect(rows[2].startsWith('0.2126 0.7152 0.0722')).toBe(true);
  });

  it('feeds the classic gold ramp into the transfer table, one function per channel', () => {
    const { container } = render(<GildedGlyphDefs />);
    const classic = goldTableValues('classic');

    const transfer = container.querySelector('feComponentTransfer')!;
    expect(attr(transfer, 'in')).toBe('lum');
    expect(attr(transfer, 'result')).toBe('tinted');

    for (const [tag, table] of [
      ['feFuncR', classic.r],
      ['feFuncG', classic.g],
      ['feFuncB', classic.b],
    ] as const) {
      const func = container.querySelector(tag)!;
      expect(attr(func, 'type')).toBe('table');
      expect(func.getAttribute('tableValues')).toBe(table);
    }
    expect(classic.r.split(' ')).toHaveLength(5);
  });

  it('embosses with a warm point light and clamps the result back to the glyph alpha', () => {
    const { container } = render(<GildedGlyphDefs />);

    // React writes the SVG presentation attribute as `lighting-color`.
    expect(attr(container.querySelector('feSpecularLighting'), 'lighting-color')).toBe('#fff6d8');
    expect(attr(container.querySelector('feSpecularLighting'), 'in')).toBe('lum');
    expect(attr(container.querySelector('fePointLight'), 'z')).toBe('90');

    const composites = container.querySelectorAll('feComposite');
    expect(composites).toHaveLength(2);
    expect(attr(composites[0], 'operator')).toBe('arithmetic');
    expect(attr(composites[0], 'k3')).toBe('0.7');
    expect(attr(composites[1], 'in2')).toBe('SourceAlpha');
    expect(attr(composites[1], 'operator')).toBe('in');
  });

  it('defines the plaque, active-plaque and edge gradients the gilded tiles reference', () => {
    const { container } = render(<GildedGlyphDefs />);

    expect(container.querySelectorAll('linearGradient')).toHaveLength(3);
    for (const id of ['gilded-plaque', 'gilded-plaque-active', 'gilded-edge']) {
      const gradient = container.querySelector(`#${id}`)!;
      expect(gradient.tagName.toLowerCase()).toBe('lineargradient');
      expect(gradient.querySelectorAll('stop').length).toBeGreaterThanOrEqual(3);
    }

    const filter = container.querySelector('#gilded-glyph')!;
    expect(attr(filter, 'x')).toBe('-20%');
    expect(attr(filter, 'width')).toBe('140%');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
