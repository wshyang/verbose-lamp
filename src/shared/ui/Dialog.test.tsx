// @vitest-environment jsdom
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { Dialog } from './Dialog';

function Harness({ closeOnBackdrop }: { closeOnBackdrop?: boolean }) {
  const [open, setOpen] = useState(false);
  const [closes, setCloses] = useState(0);
  return (
    <>
      <Button data-testid="dialog__opener" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <span data-testid="dialog__closes">{closes}</span>
      <Dialog
        open={open}
        onClose={() => {
          setCloses((count) => count + 1);
          setOpen(false);
        }}
        labelledBy="dialog__title"
        testId="dialog__backdrop"
        closeOnBackdrop={closeOnBackdrop}
      >
        <h2 id="dialog__title">Editor</h2>
        <Button data-testid="dialog__first">First</Button>
        <Button data-testid="dialog__last">Last</Button>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} onClose={() => {}} labelledBy="never">
        <p>hidden</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('describes itself with the labelled element and focuses the first control', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId('dialog__opener'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('dialog__title');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('dialog__first')));
  });

  it('prefers a data-autofocus element over the first control', async () => {
    render(
      <Dialog open onClose={() => {}} labelledBy="t" testId="dialog__backdrop">
        <h2 id="t">Title</h2>
        <Button data-testid="dialog__first">First</Button>
        <Button data-autofocus="true" data-testid="dialog__preferred">
          Preferred
        </Button>
      </Dialog>,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('dialog__preferred')));
  });

  it('falls back to the section itself when it holds nothing focusable', async () => {
    render(
      <Dialog open onClose={() => {}} labelledBy="t" testId="dialog__backdrop">
        <p id="t">Read only</p>
      </Dialog>,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog')));
  });

  it('closes on Escape and restores focus to the opener', async () => {
    render(<Harness />);
    const opener = screen.getByTestId('dialog__opener');
    opener.focus();
    await userEvent.click(opener);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('dialog__first')));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('dialog__closes').textContent).toBe('1');
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('wraps Tab and Shift+Tab inside the dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId('dialog__opener'));
    const first = screen.getByTestId('dialog__first');
    const last = screen.getByTestId('dialog__last');
    await waitFor(() => expect(document.activeElement).toBe(first));

    last.focus();
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).toBe(first);

    first.focus();
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(last);
  });

  it('pulls focus back in when Tab starts outside the dialog', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId('dialog__opener'));
    const first = screen.getByTestId('dialog__first');
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(document.activeElement).toBe(first));

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    screen.getByTestId('dialog__opener').focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(screen.getByTestId('dialog__last'));

    screen.getByTestId('dialog__opener').focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);
  });

  it('keeps focus inside when Tab is pressed with no focusable child', async () => {
    render(
      <Dialog open onClose={() => {}} labelledBy="t" testId="dialog__backdrop">
        <p id="t">Read only</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(dialog);
  });

  it('ignores keys other than Escape and Tab', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} labelledBy="t">
        <p id="t">Body</p>
      </Dialog>,
    );
    screen.getByRole('dialog').dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on a backdrop click but not on a click inside the panel', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByTestId('dialog__opener'));
    await userEvent.click(screen.getByText('Editor'));
    expect(screen.getByRole('dialog')).toBeDefined();
    await userEvent.click(screen.getByTestId('dialog__backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays open on a backdrop click when closeOnBackdrop is false', async () => {
    render(<Harness closeOnBackdrop={false} />);
    await userEvent.click(screen.getByTestId('dialog__opener'));
    await userEvent.click(screen.getByTestId('dialog__backdrop'));
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('survives reopening when the previously focused element is gone', async () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} labelledBy="t">
        <button type="button" id="t">Inside</button>
      </Dialog>,
    );
    rerender(
      <Dialog open={false} onClose={() => {}} labelledBy="t">
        <button type="button" id="t">Inside</button>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Dialog focus restoration edge cases', () => {
  it('opens without a focusable element to restore', async () => {
    const activeElement = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null as never);
    const { unmount } = render(
      <Dialog open onClose={() => {}} labelledBy="dialog__bare">
        <h2 id="dialog__bare">Bare</h2>
      </Dialog>,
    );
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    expect(() => unmount()).not.toThrow();
    focus.mockRestore();
    activeElement.mockRestore();
  });

  it('survives a focus frame that lands after the dialog is gone', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { unmount } = render(
      <Dialog open onClose={() => {}} labelledBy="dialog__gone">
        <h2 id="dialog__gone">Gone</h2>
      </Dialog>,
    );
    unmount();
    expect(() => callbacks.forEach((callback) => callback(0))).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('keeps focus inside through Tab and Shift+Tab', async () => {
    const { container } = render(
      <Dialog open onClose={() => {}} labelledBy="dialog__trap">
        <h2 id="dialog__trap">Trap</h2>
        <Button data-testid="dialog__first">First</Button>
        <Button data-testid="dialog__last">Last</Button>
      </Dialog>,
    );
    const dialog = container.ownerDocument.querySelector('[role="dialog"]') as HTMLElement;
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    screen.getByTestId('dialog__last').focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByTestId('dialog__first'));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByTestId('dialog__last'));
  });
});

/**
 * The dialog's Escape contract (ADDENDUM-043).
 *
 * The original test for this lived three levels up, in a modal that types into one
 * of its own fields first — which is exactly why it passed: focus was already
 * inside. In a browser the dialog moves focus on a later animation frame, so an
 * Escape pressed in that gap reached nothing and the modal stayed open. Playwright,
 * run for the first time here, found it. These tests hold the gap shut.
 */

function EscapeHarness({ onClose }: { onClose: () => void }) {
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

describe('Dialog (Escape contract)', () => {
  it('renders nothing while closed (no portal)', () => {
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
    render(<EscapeHarness onClose={onClose} />);
    const outside = screen.getByTestId('dialog-test__outside');
    outside.focus();
    expect(document.activeElement).toBe(outside);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('dialog-test')).toBeNull();
  });

  it('closes on Escape pressed inside the dialog, exactly once', () => {
    const onClose = vi.fn();
    render(<EscapeHarness onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId('dialog-test__inside'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on a backdrop click but not on a click inside the panel', () => {
    const onClose = vi.fn();
    render(<EscapeHarness onClose={onClose} />);
    fireEvent.click(screen.getByTestId('dialog-test__inside'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('dialog-test'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// Nothing stacks dialogs today, but a dialog that opens another (a confirm over an editor) is the
// obvious next use. One Escape should dismiss the one on top, not tear down everything under it.
describe('Dialog stacking', () => {
  function Stack({ onOuter, onInner }: { onOuter: () => void; onInner: () => void }) {
    return (
      <>
        <Dialog open onClose={onOuter} labelledBy="outer__title" testId="stack-outer">
          <h2 id="outer__title">Outer</h2>
          <button type="button">outer control</button>
        </Dialog>
        <Dialog open onClose={onInner} labelledBy="inner__title" testId="stack-inner">
          <h2 id="inner__title">Inner</h2>
          <button type="button" data-testid="stack-inner__control">inner control</button>
        </Dialog>
      </>
    );
  }

  it('closes only the topmost dialog on Escape', () => {
    const onOuter = vi.fn();
    const onInner = vi.fn();
    render(<Stack onOuter={onOuter} onInner={onInner} />);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onInner).toHaveBeenCalledTimes(1);
    expect(onOuter).not.toHaveBeenCalled();
  });

  it('then closes the next one on a second Escape once the top one is gone', () => {
    const onOuter = vi.fn();
    function Closing() {
      const [innerOpen, setInnerOpen] = useState(true);
      return (
        <>
          <Dialog open onClose={onOuter} labelledBy="o" testId="o">
            <h2 id="o">Outer</h2>
          </Dialog>
          <Dialog open={innerOpen} onClose={() => setInnerOpen(false)} labelledBy="i" testId="i">
            <h2 id="i">Inner</h2>
          </Dialog>
        </>
      );
    }
    render(<Closing />);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByTestId('i')).toBeNull();
    expect(onOuter).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onOuter).toHaveBeenCalledTimes(1);
  });
});

