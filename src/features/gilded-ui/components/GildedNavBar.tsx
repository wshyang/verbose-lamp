import type { NavItem } from '../model/navItems';
import { GildedTile } from './GildedTile';

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
          glyph={{ kind: 'emoji', emoji: item.emoji }}
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