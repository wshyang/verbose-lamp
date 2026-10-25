// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { chamferPlaque } from '../model/plaqueGeometry';
import { GildedPanel } from './GildedPanel';

setupDomTests();

/** The shared chamfered container: one plaque behind, live content in front. */
describe('GildedPanel', () => {
  it('draws the chamfered plaque behind its children', () => {
    const { container } = render(<GildedPanel>Dinner &amp; Dance</GildedPanel>);

    expect(screen.getByText('Dinner & Dance')).toBeTruthy();
    const plaque = container.querySelector('path');
    expect(plaque?.getAttribute('d')).toBe(chamferPlaque(100, 100, 6));
    expect(plaque?.getAttribute('fill')).toBe('url(#gilded-plaque)');
    expect(plaque?.getAttribute('stroke')).toBe('url(#gilded-edge)');
    // Decorative only: the plaque must never be read out twice.
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('merges a caller class with the layout it needs', () => {
    const { container } = render(<GildedPanel className="p-4">content</GildedPanel>);

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('relative');
    expect(root.className).toContain('p-4');
  });
});
