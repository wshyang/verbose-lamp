// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { AvatarStudioModal } from './AvatarStudioModal';

setupDomTests();

/**
 * The studio shell: the dialog chrome, the four corner brackets, and the close
 * button. The panels inside it have their own suites, and the session hook pulls
 * in MediaPipe, so both are stubbed here — this file is about the shell only.
 */
vi.mock('../hooks/useAvatarStudio', () => ({
  useAvatarStudio: () => ({
    look: { finish: 'natural' },
    session: { cutOut: 'ready' },
  }),
}));

vi.mock('./PreviewPane', () => ({ PreviewPane: () => <div data-testid="avatar-studio__preview" /> }));
vi.mock('./SubjectControls', () => ({ SubjectControls: () => <div data-testid="avatar-studio__subject" /> }));
vi.mock('./CutOutControls', () => ({ CutOutControls: () => <div data-testid="avatar-studio__cutout" /> }));
vi.mock('./BackdropControls', () => ({ BackdropControls: () => <div data-testid="avatar-studio__backdrop" /> }));

describe('AvatarStudioModal', () => {
  it('mounts nothing while closed', () => {
    render(<AvatarStudioModal open={false} onClose={vi.fn()} />);

    expect(screen.queryByTestId('avatar-studio__overlay')).toBeNull();
  });

  it('mounts the studio only while open, under a labelled dialog', () => {
    render(<AvatarStudioModal open onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe('avatar-studio-title');
    expect(screen.getByTestId('avatar-studio__overlay')).toBeTruthy();
    expect(screen.getByText('GILDED AVATAR STUDIO')).toBeTruthy();
    expect(screen.getByText('Cloisonné enamel, set in gold')).toBeTruthy();
  });

  it('docks the preview beside the three control panels', () => {
    render(<AvatarStudioModal open onClose={vi.fn()} />);

    for (const testId of [
      'avatar-studio__preview',
      'avatar-studio__subject',
      'avatar-studio__cutout',
      'avatar-studio__backdrop',
    ]) {
      expect(screen.getByTestId(testId)).toBeTruthy();
    }
  });

  it('paints four corner brackets, and hides them from assistive tech', () => {
    render(<AvatarStudioModal open onClose={vi.fn()} />);

    // The dialog renders through a portal, so it lives on document.body, not in the
    // render container.
    const brackets = document.body.querySelectorAll('span[aria-hidden="true"]');
    expect(brackets.length).toBeGreaterThanOrEqual(4);
    for (const bracket of Array.from(brackets)) {
      expect(bracket.className).toContain('pointer-events-none');
      expect(bracket.className).toContain('absolute');
    }
  });

  it('closes from its own button', async () => {
    const onClose = vi.fn();
    render(<AvatarStudioModal open onClose={onClose} />);

    screen.getByTestId('avatar-studio__close').click();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
