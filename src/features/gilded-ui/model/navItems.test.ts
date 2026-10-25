import { describe, expect, it } from 'vitest';
import { parseNavLines, validateNavItems } from './navItems';

describe('navItems', () => {
  it('parses editable emoji,label lines', () => {
    const items = parseNavLines('🥂,Toast\n🎷,Program\n\n🎰,Lucky Draw');
    expect(items.length).toBe(3);
    expect(items[0].emoji).toBe('🥂');
    expect(items[2].label).toBe('Lucky Draw');
  });

  it('validates count, labels and unique ids', () => {
    expect(validateNavItems(parseNavLines('🥂,Toast\n🎷,Program')).ok).toBe(true);
    expect(validateNavItems(parseNavLines('🥂,Toast')).ok).toBe(false);
    expect(validateNavItems(parseNavLines('🥂,An Extremely Long Label\n🎷,Program')).ok).toBe(false);
  });
});