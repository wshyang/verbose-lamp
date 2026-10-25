import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KebabMenu, type KebabOption } from './KebabMenu.js';

/**
 * ADR-258 — the kebab's contract: nothing renders without options, the menu
 * opens from the ⋮ beside the pill, choosing closes it before the action
 * runs (so a confirmation never opens over an open menu), and it dismisses
 * on Escape and on a tap outside.
 */

function options(onSelect = vi.fn()): KebabOption[] {
  return [
    { label: 'Make captain', testId: 'row__promote', onSelect },
    { label: 'Remove', testId: 'row__kick', danger: true, onSelect },
  ];
}

function renderMenu(onSelect: ReturnType<typeof vi.fn>) {
  return render(
    <KebabMenu label="Actions for Alex" testId="row__menu" options={options(onSelect)} />,
  );
}

describe('KebabMenu (ADR-258)', () => {
  it('renders nothing when the row offers no actions', () => {
    render(<KebabMenu label="Actions for Alex" testId="row__menu" options={[]} />);
    expect(screen.queryByTestId('row__menu')).toBeNull();
  });

  it('opens on the toggle and runs the chosen option after closing', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderMenu(onSelect);

    const toggle = screen.getByTestId('row__menu');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await user.click(screen.getByTestId('row__kick'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('row__kick')).toBeNull();
  });

  it('closes on Escape without running anything', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderMenu(onSelect);

    await user.click(screen.getByTestId('row__menu'));
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('row__promote')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on a tap outside the menu', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <span>outside</span>
        <KebabMenu label="Actions for Alex" testId="row__menu" options={options()} />
      </div>,
    );

    await user.click(screen.getByTestId('row__menu'));
    expect(screen.getByTestId('row__promote')).toBeTruthy();
    await user.click(screen.getByText('outside'));
    expect(screen.queryByTestId('row__promote')).toBeNull();
  });
});
