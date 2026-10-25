// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import { describe, expect, it, vi } from 'vitest';

import { GildedPortraitLauncher } from './GildedPortraitLauncher';

vi.mock('./GildedPortraitModal', () => ({
  GildedPortraitModal: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    open ? <button type="button" onClick={onClose}>Portrait mock</button> : null
  ),
}));
describe('GildedPortraitLauncher', () => {
  it('owns modal state with and without class', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GildedPortraitLauncher />);
    await user.click(screen.getByTestId('gilded-portrait__launch'));
    await user.click(screen.getByText('Portrait mock'));
    expect(screen.queryByText('Portrait mock')).toBeNull();
    rerender(<GildedPortraitLauncher className="custom" />);
    expect(screen.getByTestId('gilded-portrait__launch').className).toContain('custom');
  });
});
