// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getFocusableElements, useDialogFocus } from './useDialogFocus';

/**
 * Focus moves into a dialog one frame after it opens, and back to the trigger when
 * it closes (ADDENDUM-033). That one frame is why `useEscapeKey` exists as a second
 * path, so both halves need to be pinned.
 */
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

type Variant = 'autofocus' | 'plain' | 'empty';

function Panel({ open, variant, detached = false }: { open: boolean; variant: Variant; detached?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useDialogFocus(open, ref);
  // `detached` models a ref that points at nothing when the frame lands — the panel
  // unmounted between the effect and the callback.
  const attach = (element: HTMLDivElement | null) => {
    if (!detached) ref.current = element;
  };
  return (
    <div ref={attach} tabIndex={-1} data-testid="focus-test__panel">
      {variant === 'autofocus' ? <input data-testid="focus-test__autofocus" data-autofocus="true" /> : null}
      {variant === 'plain' ? <button type="button" data-testid="focus-test__first">first</button> : null}
    </div>
  );
}

/** A body that reports itself as a non-element active target. */
const withBodyActive = (run: () => void) => {
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement');
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => null });
  try {
    run();
  } finally {
    if (descriptor) Object.defineProperty(Document.prototype, 'activeElement', descriptor);
  }
};

function Harness({ variant }: { variant: Variant }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="focus-test__trigger" onClick={() => setOpen(true)}>
        open
      </button>
      <button type="button" data-testid="focus-test__closer" onClick={() => setOpen(false)}>
        close
      </button>
      <Panel open={open} variant={variant} />
    </>
  );
}

describe('getFocusableElements', () => {
  it('skips hidden and aria-hidden controls, and keeps the rest in DOM order', () => {
    render(
      <div data-testid="focus-test__container">
        <button type="button" data-testid="a">
          a
        </button>
        <button type="button" hidden data-testid="b">
          b
        </button>
        <button type="button" aria-hidden="true" data-testid="c">
          c
        </button>
        <input data-testid="d" />
        <button type="button" disabled data-testid="e">
          e
        </button>
      </div>
    );
    const container = screen.getByTestId('focus-test__container');
    expect(getFocusableElements(container).map((element) => element.dataset.testid)).toEqual(['a', 'd']);
  });
});

describe('useDialogFocus', () => {
  it('focuses the marked element once the frame lands, and restores the trigger on close', async () => {
    render(<Harness variant="autofocus" />);
    const trigger = screen.getByTestId('focus-test__trigger');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    await nextFrame();
    expect(document.activeElement).toBe(screen.getByTestId('focus-test__autofocus'));

    fireEvent.click(screen.getByTestId('focus-test__closer'));
    expect(document.activeElement).toBe(trigger);
  });

  it('falls back to the first focusable control', async () => {
    render(<Harness variant="plain" />);
    fireEvent.click(screen.getByTestId('focus-test__trigger'));
    await nextFrame();
    expect(document.activeElement).toBe(screen.getByTestId('focus-test__first'));
  });

  it('falls back to the panel itself when it holds no control', async () => {
    render(<Harness variant="empty" />);
    fireEvent.click(screen.getByTestId('focus-test__trigger'));
    await nextFrame();
    expect(document.activeElement).toBe(screen.getByTestId('focus-test__panel'));
  });

  it('never steals focus while closed', async () => {
    render(<Harness variant="autofocus" />);
    const trigger = screen.getByTestId('focus-test__trigger');
    trigger.focus();
    await nextFrame();
    expect(document.activeElement).toBe(trigger);
  });

  it('does nothing when the panel is not attached yet, and ignores a dead restore target', async () => {
    withBodyActive(() => render(<>{/* active target is null until the frame lands */}</>));
    render(
      <>
        <Panel open variant="autofocus" detached />
      </>
    );
    await nextFrame();
    expect(document.activeElement).not.toBe(screen.getByTestId('focus-test__autofocus'));
  });

  it('survives a trigger that has left the document by the time the dialog closes', () => {
    // The cleanup must check `isConnected`: focusing a detached element throws.
    const Trigger = ({ present }: { present: boolean }) =>
      present ? (
        <button type="button" data-testid="focus-test__gone">
          gone
        </button>
      ) : null;
    const { rerender } = render(
      <>
        <Trigger present />
        <Panel open variant="plain" />
      </>
    );
    screen.getByTestId('focus-test__gone').focus();
    rerender(
      <>
        <Trigger present={false} />
        <Panel open={false} variant="plain" />
      </>
    );
    expect(screen.queryByTestId('focus-test__gone')).toBeNull();
    // jsdom reports `null` once the focused element is detached; either is fine.
    expect([null, document.body]).toContain(document.activeElement);
  });
});

// If a dialog opens and closes inside one frame, its pending focus move must be cancelled, or the
// frame lands later and pulls focus into a panel that is no longer there.
describe('useDialogFocus frame cancellation', () => {
  it('cancels the pending focus frame when the dialog closes before it lands', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const frame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const { rerender } = render(<Panel open variant="autofocus" />);

    rerender(<Panel open={false} variant="autofocus" />);

    expect(cancel).toHaveBeenCalledWith(42);
    frame.mockRestore();
    cancel.mockRestore();
  });

  it('never moves focus into the panel when the frame was cancelled', async () => {
    const { rerender } = render(<Panel open variant="autofocus" />);
    const target = screen.getByTestId('focus-test__autofocus');
    rerender(<Panel open={false} variant="autofocus" />);

    await nextFrame();

    expect(document.activeElement).not.toBe(target);
  });
});

