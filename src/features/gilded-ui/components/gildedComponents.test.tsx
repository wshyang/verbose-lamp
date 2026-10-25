// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GildedGlyph } from './GildedGlyph';
import { GildedGlyphDefs } from './GildedGlyphDefs';
import { GildedNavBar } from './GildedNavBar';
import { GildedPanel } from './GildedPanel';
import { GildedTile } from './GildedTile';

describe('gilded UI components', () => {
  it('renders shared defs and panel with default/custom classes', () => {
    const { container, rerender } = render(
      <><GildedGlyphDefs /><GildedPanel>Panel text</GildedPanel></>
    );
    expect(container.querySelector('#gilded-glyph')).toBeTruthy();
    expect(screen.getByText('Panel text').parentElement?.className).toBe('relative ');
    rerender(<GildedPanel className="custom">Again</GildedPanel>);
    expect(screen.getByText('Again').parentElement?.className).toContain('custom');
  });

  it('renders an SVG-path glyph and a disabled tile', () => {
    const { container } = render(
      <GildedTile
        glyph={{ kind: 'svg', path: 'M2 2L20 20' }} label="Path" state="disabled" testId="path-tile"
      />
    );
    const button = screen.getByTestId('path-tile') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.className).toContain('opacity-40');
    expect(container.querySelector('path[d="M2 2L20 20"]')).toBeTruthy();
    render(<GildedGlyph glyph={{ kind: 'emoji', emoji: '✦' }} size={12} className="glyph" />);
    expect(screen.getByText('✦')).toBeTruthy();
  });

  it('forwards nav selection with the item id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <GildedNavBar
        items={[{ id: 'home', emoji: '⌂', label: 'Home' }, { id: 'draw', emoji: '✦', label: 'Draw' }]}
        activeId="home" onSelect={onSelect}
      />
    );
    await user.click(screen.getAllByTestId('gilded-nav-bar__item')[1]);
    expect(onSelect).toHaveBeenCalledWith('draw');
  });
});
