// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';

vi.mock('./GildedPortraitModal', () => ({
  GildedPortraitModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <button type="button" data-testid="modal-open" onClick={onClose}>
        close
      </button>
    ) : null,
}));

import { GildedPortraitLauncher } from './GildedPortraitLauncher';

setupDomTests();

describe('GildedPortraitLauncher', () => {
  it('advertises the dialog it opens', () => {
    render(<GildedPortraitLauncher />);
    const button = screen.getByTestId('gilded-portrait__launch');

    expect(button.getAttribute('aria-label')).toBe('Open Gilded Portrait studio');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('title')).toBe('Turn a photograph into gold');
    expect(screen.queryByTestId('modal-open')).toBeNull();
  });

  it('opens the studio on click and closes it again', () => {
    render(<GildedPortraitLauncher />);

    fireEvent.click(screen.getByTestId('gilded-portrait__launch'));
    expect(screen.getByTestId('modal-open')).toBeTruthy();

    fireEvent.click(screen.getByTestId('modal-open'));
    expect(screen.queryByTestId('modal-open')).toBeNull();
  });

  it('passes a host class through to the button', () => {
    render(<GildedPortraitLauncher className="host-button" />);

    expect(screen.getByTestId('gilded-portrait__launch').className).toContain('host-button');
  });
});
