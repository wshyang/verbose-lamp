// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GildedGlyph } from './GildedGlyph';
import { GildedGlyphDefs } from './GildedGlyphDefs';
import { GildedNavBar } from './GildedNavBar';
import { GildedPanel } from './GildedPanel';
import { GildedTile } from './GildedTile';
import type { NavItem } from '../model/navItems';

const items: readonly NavItem[] = [
  { id: 'nav-ballroom', emoji: '🥂', label: 'Ballroom' },
  { id: 'nav-garden', emoji: '🌿', label: 'Garden' },
];

describe('GildedGlyph', () => {
  it('gilds an emoji through a text node', () => {
    const { container } = render(<GildedGlyph glyph={{ kind: 'emoji', emoji: '🥂' }} />);
    const text = container.querySelector('text');
    expect(text?.textContent).toBe('🥂');
    expect(text?.getAttribute('filter')).toBe('url(#gilded-glyph)');
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('40');
  });

  it('draws an SVG path glyph with size and class overrides', () => {
    const { container } = render(
      <GildedGlyph glyph={{ kind: 'svg', path: 'M0 0 L10 10' }} size={24} className="shrink-0" />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('class')).toBe('shrink-0');
    expect(container.querySelector('path')?.getAttribute('d')).toBe('M0 0 L10 10');
  });
});

describe('GildedGlyphDefs', () => {
  it('publishes the shared filter and plaques once per page', () => {
    const { container } = render(<GildedGlyphDefs />);
    expect(container.querySelector('#gilded-glyph')).not.toBeNull();
    expect(container.querySelector('#gilded-plaque')).not.toBeNull();
    expect(container.querySelector('#gilded-plaque-active')).not.toBeNull();
    expect(container.querySelector('#gilded-edge')).not.toBeNull();
    expect(container.querySelectorAll('feFuncR')[0].getAttribute('tableValues')).toBeTruthy();
  });
});

describe('GildedPanel', () => {
  it('frames its children in a chamfered plaque', () => {
    const { container } = render(
      <GildedPanel className="p-4">
        <p>Invitation</p>
      </GildedPanel>,
    );
    expect(screen.getByText('Invitation')).toBeDefined();
    expect(container.firstElementChild?.className).toContain('relative p-4');
    expect(container.querySelector('path')).not.toBeNull();
  });
});

describe('GildedTile', () => {
  it('renders an idle plaque and reports selection', async () => {
    const onSelect = vi.fn();
    render(
      <GildedTile
        glyph={{ kind: 'emoji', emoji: '🥂' }}
        label="Ballroom"
        onSelect={onSelect}
        testId="tile__idle"
      />,
    );
    const tile = screen.getByTestId('tile__idle');
    expect(tile.textContent).toContain('BALLROOM');
    expect(tile.querySelector('.gilded-sheen')).toBeNull();
    await userEvent.click(tile);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('lights the active plaque and marks the current page', () => {
    render(
      <GildedTile
        glyph={{ kind: 'svg', path: 'M0 0 L4 4' }}
        label="Garden"
        state="active"
        current
        testId="tile__active"
      />,
    );
    const tile = screen.getByTestId('tile__active');
    expect(tile.getAttribute('aria-current')).toBe('page');
    expect(tile.querySelector('.gilded-sheen')).not.toBeNull();
    expect(tile.querySelector('.bg-\\[\\#3a2708\\]')).not.toBeNull();
  });

  it('disables a dead section', () => {
    render(
      <GildedTile glyph={{ kind: 'emoji', emoji: '🌿' }} label="Garden" state="disabled" testId="tile__off" />,
    );
    const tile = screen.getByTestId('tile__off') as HTMLButtonElement;
    expect(tile.disabled).toBe(true);
    expect(tile.className).toContain('opacity-40');
  });
});

describe('GildedNavBar', () => {
  it('renders every section and reports the tapped one', async () => {
    const onSelect = vi.fn();
    render(<GildedNavBar items={items} activeId="nav-garden" onSelect={onSelect} />);
    const nav = screen.getByTestId('gilded-nav-bar__root');
    expect(nav.getAttribute('aria-label')).toBe('Event sections');

    const tiles = screen.getAllByTestId('gilded-nav-bar__item');
    expect(tiles).toHaveLength(2);
    expect(tiles[0].getAttribute('aria-current')).toBeNull();
    expect(tiles[1].getAttribute('aria-current')).toBe('page');

    await userEvent.click(tiles[0]);
    expect(onSelect).toHaveBeenCalledWith('nav-ballroom');
  });

  it('takes a custom aria label', () => {
    render(<GildedNavBar items={items} activeId="nav-ballroom" onSelect={vi.fn()} ariaLabel="Menu" />);
    expect(screen.getByTestId('gilded-nav-bar__root').getAttribute('aria-label')).toBe('Menu');
  });
});
