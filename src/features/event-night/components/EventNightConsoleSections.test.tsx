// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseNavLines, validateNavItems } from '@/features/gilded-ui';
import { DEFAULT_NAV_LINES } from '../data/navLines';
import { GoldUiSection, LatticeSection } from './EventNightConsoleSections';

const defaultItems = validateNavItems(parseNavLines(DEFAULT_NAV_LINES));

function gold(overrides: Partial<Parameters<typeof GoldUiSection>[0]['gold']> = {}) {
  return {
    navText: DEFAULT_NAV_LINES,
    setNavText: vi.fn(),
    navValidation: defaultItems,
    navItems: defaultItems.ok ? defaultItems.items : [],
    ...overrides,
  };
}

function lattice(overrides: Partial<Parameters<typeof LatticeSection>[0]['lattice']> = {}) {
  return {
    latticeSeed: 4242,
    latticeDensity: 0.7,
    setLatticeDensity: vi.fn(),
    latticeLevel: 4,
    setLatticeLevel: vi.fn(),
    rerollLattice: vi.fn(),
    ...overrides,
  };
}

describe('GoldUiSection', () => {
  it('edits the nav lines and renders the live bar', () => {
    const setNavText = vi.fn();
    render(<GoldUiSection gold={gold({ setNavText })} />);

    const textarea = screen.getByTestId('event-night__nav-lines') as HTMLTextAreaElement;
    expect(textarea.value).toContain('Lucky Draw');
    expect(screen.getByLabelText('Gold UI sample')).toBeTruthy();
    expect(screen.queryByTestId('event-night__nav-issues')).toBeNull();

    fireEvent.change(textarea, { target: { value: '🥂,Toast' } });
    expect(setNavText).toHaveBeenCalledWith('🥂,Toast');
  });

  it('lists validation issues when the lines are unusable', () => {
    render(
      <GoldUiSection
        gold={gold({ navText: 'nope', navValidation: { ok: false, issues: ['line 1 has no label', 'Too many items'] } })}
      />,
    );

    const issues = screen.getByTestId('event-night__nav-issues');
    expect(issues.textContent).toContain('line 1 has no label');
    expect(issues.textContent).toContain('Too many items');
  });

  it('marks the item you pick in the sample bar', async () => {
    render(<GoldUiSection gold={gold()} />);

    const buttons = screen.getAllByTestId('gilded-nav-bar__item');
    await userEvent.click(buttons[1]);

    expect(screen.getAllByTestId('gilded-nav-bar__item')).toHaveLength(buttons.length);
  });
});

describe('LatticeSection', () => {
  it('drives density, level and the seed reroll', async () => {
    const setLatticeDensity = vi.fn();
    const setLatticeLevel = vi.fn();
    const rerollLattice = vi.fn();
    render(<LatticeSection lattice={lattice({ setLatticeDensity, setLatticeLevel, rerollLattice })} />);

    fireEvent.change(screen.getByTestId('event-night__lattice-density'), { target: { value: '0.25' } });
    expect(setLatticeDensity).toHaveBeenCalledWith(0.25);

    fireEvent.change(screen.getByTestId('event-night__lattice-level'), { target: { value: '2' } });
    expect(setLatticeLevel).toHaveBeenCalledWith(2);

    const reroll = screen.getByTestId('event-night__lattice-reroll');
    expect(reroll.textContent).toContain('seed 4242');
    await userEvent.click(reroll);
    expect(rerollLattice).toHaveBeenCalledTimes(1);
  });

  it('offers layers one to four and shows the current one', () => {
    render(<LatticeSection lattice={lattice({ latticeLevel: 3 })} />);

    const select = screen.getByTestId('event-night__lattice-level') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['1', '2', '3', '4']);
    expect(select.value).toBe('3');
  });
});
