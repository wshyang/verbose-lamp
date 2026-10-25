// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AvatarStudioLauncher } from './AvatarStudioLauncher';

vi.mock('./AvatarStudioModal', () => ({
  AvatarStudioModal: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    open ? <button type="button" onClick={onClose}>Studio mock</button> : null
  ),
}));

describe('AvatarStudioLauncher', () => {
  it('owns open state, with and without a class', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AvatarStudioLauncher />);
    await user.click(screen.getByTestId('avatar-studio__launch'));
    expect(screen.getByText('Studio mock')).toBeTruthy();
    await user.click(screen.getByText('Studio mock'));
    expect(screen.queryByText('Studio mock')).toBeNull();
    rerender(<AvatarStudioLauncher className="custom" />);
    expect(screen.getByTestId('avatar-studio__launch').className).toContain('custom');
  });
});
