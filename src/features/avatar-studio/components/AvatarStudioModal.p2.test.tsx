// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen } from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import { describe, expect, it, vi } from 'vitest';

import { AvatarStudioModal } from './AvatarStudioModal';

const studio = vi.hoisted(() => ({
  look: { id: 'look' },
  session: { cutOut: 'available' },
}));
vi.mock('../hooks/useAvatarStudio', () => ({ useAvatarStudio: () => studio }));
vi.mock('./PreviewPane', () => ({ PreviewPane: () => <div>Preview mock</div> }));
vi.mock('./SubjectControls', () => ({ SubjectControls: () => <div>Subject mock</div> }));
vi.mock('./CutOutControls', () => ({ CutOutControls: () => <div>Cut mock</div> }));
vi.mock('./BackdropControls', () => ({ BackdropControls: () => <div>Backdrop mock</div> }));
describe('AvatarStudioModal', () => {
  it('mounts the dialog only while open and closes from the header', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<AvatarStudioModal open={false} onClose={onClose} />);
    expect(screen.queryByTestId('avatar-studio__overlay')).toBeNull();
    rerender(<AvatarStudioModal open onClose={onClose} />);
    expect(screen.getByTestId('avatar-studio__overlay')).toBeTruthy();
    expect(screen.getByText('Preview mock')).toBeTruthy();
    expect(screen.getByText('Subject mock')).toBeTruthy();
    expect(screen.getByText('Cut mock')).toBeTruthy();
    expect(screen.getByText('Backdrop mock')).toBeTruthy();
    await user.click(screen.getByTestId('avatar-studio__close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
