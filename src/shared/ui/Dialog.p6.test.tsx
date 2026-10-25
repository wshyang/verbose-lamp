// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';
import { setupDomTests } from '@/test/dom';

setupDomTests();
function Harness_p6({ closeOnBackdrop = true, onClose = vi.fn() }: { closeOnBackdrop?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
        open
      </button>
      <Dialog
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        labelledBy="dialog-title"
        testId="dialog__backdrop"
        closeOnBackdrop={closeOnBackdrop}
      >
        <h2 id="dialog-title">Draw</h2>
        <button type="button" data-testid="dialog__first">
          one
        </button>
        <button type="button" data-testid="dialog__last">
          two
        </button>
      </Dialog>
    </div>
  );
}
describe('Dialog', () => {
  it('portals a labelled modal dialog into the body', () => {
    render(<Dialog open onClose={() => {}} labelledBy="dialog-title" testId="dialog__backdrop"><h2 id="dialog-title">Draw</h2></Dialog>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('dialog-title');
    expect(dialog.closest('[data-testid="dialog__backdrop"]')).toBeTruthy();
    expect(dialog.parentElement?.parentElement).toBe(document.body);
  });

  it('moves focus to the first control and restores it on close', async () => {
    render(<Harness_p6 />);
    const opener = screen.getByTestId('opener');
    opener.focus();
    await userEvent.click(opener);

    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-testid')).toBe('dialog__first'));
    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('honours an explicit autofocus target', async () => {
    render(
      <Dialog open onClose={() => {}} labelledBy="t">
        <h2 id="t">Draw</h2>
        <button type="button" data-testid="plain">plain</button>
        <button type="button" data-autofocus="true" data-testid="chosen">chosen</button>
      </Dialog>,
    );
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-testid')).toBe('chosen'));
  });

  it('falls back to the dialog itself when nothing is focusable', async () => {
    render(
      <Dialog open onClose={() => {}} labelledBy="t" testId="dialog__backdrop">
        <h2 id="t">Nothing to focus</h2>
      </Dialog>,
    );
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('dialog'));
  });

  it('closes on Escape without letting a host handler see it', async () => {
    const onClose = vi.fn();
    const hostKey = vi.fn();
    render(
      <div onKeyDown={hostKey}>
        <Dialog open onClose={onClose} labelledBy="t">
          <h2 id="t">Draw</h2>
          <button type="button" data-testid="dialog__ok">ok</button>
        </Dialog>
      </div>,
    );

    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-testid')).toBe('dialog__ok'));
    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hostKey).not.toHaveBeenCalled();
  });

  it('wraps Tab from the last control to the first', async () => {
    render(
      <Dialog open onClose={() => {}} labelledBy="t">
        <h2 id="t">Draw</h2>
        <button type="button" data-testid="a">a</button>
        <button type="button" data-testid="b">b</button>
      </Dialog>,
    );
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-testid')).toBe('a'));
    await userEvent.tab();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('b');
    await userEvent.tab();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('a');
  });

  it('pulls focus back in when Tab is pressed on the dialog itself', async () => {
    render(
      <Dialog open onClose={() => {}} labelledBy="t">
        <h2 id="t">Draw</h2>
        <button type="button" data-testid="a">a</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    dialog.focus();
    expect(document.activeElement).toBe(dialog);

    await userEvent.tab();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('a');
  });

  it('skips hidden controls when trapping focus', async () => {
    render(
      <Dialog open onClose={() => {}} labelledBy="t">
        <h2 id="t">Draw</h2>
        <button type="button" data-testid="ghost" hidden>
          ghost
        </button>
        <button type="button" data-testid="real">real</button>
        <button type="button" data-testid="aria-ghost" aria-hidden="true">gone</button>
      </Dialog>,
    );
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-testid')).toBe('real'));
  });
});
