import type { GlyphInput } from './GildedGlyph';
import { iconPathFor } from '../model/glyphIcons';
import type { NavItem } from '../model/navItems';
import { GildedTile } from './GildedTile';

/**
 * Built-in icons first: an emoji only renders if the host has a colour-emoji font,
 * and headless Linux usually does not (ADDENDUM-032). Anything we have not drawn
 * falls back to the emoji text, so a user's own line still shows.
 */
const glyphFor = (emoji: string): GlyphInput => {
  const path = iconPathFor(emoji);
  return path === null ? { kind: 'emoji', emoji } : { kind: 'svg', path };
};

interface GildedNavBarProps {
  items: readonly NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
}

/** Bottom navigation in shimmering gold, generated from emoji + label. */
export function GildedNavBar({ items, activeId, onSelect, ariaLabel = 'Event sections' }: GildedNavBarProps) {
  return (
    <nav aria-label={ariaLabel} data-testid="gilded-nav-bar__root" className="flex items-end justify-center gap-2 sm:gap-3">
      {items.map((item) => (
        <GildedTile
          key={item.id}
          glyph={glyphFor(item.emoji)}
          label={item.label}
          state={item.id === activeId ? 'active' : 'idle'}
          current={item.id === activeId}
          onSelect={() => onSelect(item.id)}
          testId="gilded-nav-bar__item"
        />
      ))}
    </nav>
  );
}