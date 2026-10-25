// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { DECO_ICONS } from '../model/glyphIcons';
import { GildedNavBar } from './GildedNavBar';

setupDomTests();

const items = [
  { id: 'foyer', emoji: '🏛️', label: 'Foyer' },
  { id: 'toast', emoji: '🥂', label: 'Toast' },
];

/**
 * The bar draws built-in icons instead of emoji text (ADDENDUM-032), so these
 * assertions pin the path data rather than a `<text>` node that only renders on a
 * host with a colour-emoji font.
 */
describe('GildedNavBar', () => {
  it('draws one tile per item with the active one marked current', () => {
    render(<GildedNavBar items={items} activeId="toast" onSelect={vi.fn()} />);

    const tiles = screen.getAllByTestId('gilded-nav-bar__item');
    expect(tiles).toHaveLength(2);
    expect(tiles.map((tile) => tile.textContent)).toEqual(['FOYER', 'TOAST']);
    expect(tiles[0].getAttribute('aria-current')).toBeNull();
    expect(tiles[1].getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('navigation').getAttribute('aria-label')).toBe('Event sections');
  });

  it('renders the built-in icon paths rather than emoji glyphs', () => {
    const { container } = render(<GildedNavBar items={items} activeId="foyer" onSelect={vi.fn()} />);

    const paths = Array.from(container.querySelectorAll('g#gilded-glyph path, g[filter] path')).map(
      (path) => path.getAttribute('d')
    );
    expect(paths).toContain(DECO_ICONS.portico);
    expect(paths).toContain(DECO_ICONS.coupe);
    expect(container.querySelector('text')).toBeNull();
  });

  it('falls back to the emoji text for a glyph we have not drawn', () => {
    const { container } = render(
      <GildedNavBar items={[{ id: 'party', emoji: '🦄', label: 'Party' }]} activeId="party" onSelect={vi.fn()} />
    );

    const text = container.querySelector('text');
    expect(text?.textContent).toBe('🦄');
  });

  it('reports the selected item id when a tile is clicked', () => {
    const onSelect = vi.fn();
    render(<GildedNavBar items={items} activeId="foyer" onSelect={onSelect} />);

    fireEvent.click(screen.getAllByTestId('gilded-nav-bar__item')[1]);
    expect(onSelect).toHaveBeenCalledWith('toast');
  });

  it('accepts a caller label for the landmark', () => {
    render(<GildedNavBar items={items} activeId="foyer" onSelect={vi.fn()} ariaLabel="Ballroom" />);

    expect(screen.getByRole('navigation').getAttribute('aria-label')).toBe('Ballroom');
  });
});
