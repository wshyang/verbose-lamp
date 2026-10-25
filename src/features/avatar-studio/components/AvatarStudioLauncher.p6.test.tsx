// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen, act, fireEvent } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { AvatarStudioLauncher } from './AvatarStudioLauncher';

import { setupDomTests } from '@/test/dom';

setupDomTests();
/**
 * The launcher owns one piece of state — open or closed — and hands it to the
 * studio. The studio itself is stubbed: its models are the subject of their own
 * suites, and mounting them here would test MediaPipe, not this button.
 */
const modal = vi.hoisted(() => ({ onClose: null as null | (() => void) }));
const opens = vi.hoisted(() => ({ value: [] as boolean[] }));
vi.mock('./AvatarStudioModal', () => ({
  AvatarStudioModal: ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    opens.value.push(open);
    modal.onClose = onClose;
    return <div data-testid="avatar-studio__modal" data-open={String(open)} />;
  },
}));
describe('AvatarStudioLauncher', () => {
  it('starts closed, with the button labelled for a dialog', () => {
    render(<AvatarStudioLauncher />);

    const launch = screen.getByTestId('avatar-studio__launch');
    expect(launch.getAttribute('aria-haspopup')).toBe('dialog');
    expect(launch.getAttribute('title')).toBe('Set your portrait in gold and enamel');
    expect(screen.getByTestId('avatar-studio__modal').getAttribute('data-open')).toBe('false');
  });

  it('opens the studio when pressed and closes it again on request', () => {
    render(<AvatarStudioLauncher className="text-xs" />);

    fireEvent.click(screen.getByTestId('avatar-studio__launch'));
    expect(screen.getByTestId('avatar-studio__modal').getAttribute('data-open')).toBe('true');

    act(() => modal.onClose?.());
    expect(screen.getByTestId('avatar-studio__modal').getAttribute('data-open')).toBe('false');
    expect(opens.value.at(-1)).toBe(false);
  });

  it('shows a short label on phones and the full name from sm up', () => {
    render(<AvatarStudioLauncher />);

    expect(screen.getByText('Avatar Studio')).toBeTruthy();
    expect(screen.getByText('Avatar')).toBeTruthy();
  });
});
