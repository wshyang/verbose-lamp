// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

/**
 * The dialog's Escape contract (ADDENDUM-043).
 *
 * The original test for this lived three levels up, in a modal that types into one
 * of its own fields first — which is exactly why it passed: focus was already
 * inside. In a browser the dialog moves focus on a later animation frame, so an
 * Escape pressed in that gap reached nothing and the modal stayed open. Playwright,
 * run for the first time here, found it. These tests hold the gap shut.
 */

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const close = () => {
    onClose();
    setOpen(false);
  };
  return (
    <>
      <button type="button" data-testid="dialog-test__outside">
        outside
      </button>
      <Dialog open={open} onClose={close} labelledBy="dialog-test__title" testId="dialog-test">
        <h2 id="dialog-test__title">Title</h2>
        <button type="button" data-testid="dialog-test__inside">
          inside
        </button>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    const { container } = render(
      <Dialog open={false} onClose={() => undefined} labelledBy="x">
        <p>hidden</p>
      </Dialog>
    );
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape even when focus never made it inside the dialog', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const outside = screen.getByTestId('dialog-test__outside');
    outside.focus();
    expect(document.activeElement).toBe(outside);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('dialog-test')).toBeNull();
  });

  it('closes on Escape pressed inside the dialog, exactly once', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId('dialog-test__inside'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on a backdrop click but not on a click inside the panel', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByTestId('dialog-test__inside'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('dialog-test'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
