// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEscapeKey } from './useEscapeKey';

/**
 * The window-level Escape contract (ADDENDUM-043). `Dialog` depends on this hook,
 * and the reason it exists — a keypress that never reaches the dialog — is exactly
 * what a test that fires inside the dialog cannot see.
 */
function Probe({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  useEscapeKey(active, onEscape);
  return <p>probe</p>;
}

describe('useEscapeKey', () => {
  it('calls the handler for an Escape pressed anywhere in the document', () => {
    const onEscape = vi.fn();
    render(<Probe active onEscape={onEscape} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('ignores every other key', () => {
    const onEscape = vi.fn();
    render(<Probe active onEscape={onEscape} />);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    fireEvent.keyDown(document.body, { key: 'h' });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('listens only while active, and stops when deactivated', () => {
    const onEscape = vi.fn();
    const { rerender } = render(<Probe active={false} onEscape={onEscape} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();

    rerender(<Probe active onEscape={onEscape} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledOnce();

    rerender(<Probe active={false} onEscape={onEscape} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('always calls the newest handler without re-subscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe active onEscape={first} />);
    rerender(<Probe active onEscape={second} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});

// The listener list is shared by every dialog on the page, so its bookkeeping is part of the
// contract: one document listener however many dialogs, none left behind, and Escape claimed.
describe('useEscapeKey listener bookkeeping', () => {
  it('fires once per press with several dialogs open, not once per dialog', () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <>
        <Probe active onEscape={first} />
        <Probe active onEscape={second} />
      </>,
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(first.mock.calls.length + second.mock.calls.length).toBe(1);
  });

  it('adds one window listener for any number of dialogs and removes it with the last', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const keydown = (spy: typeof add) => spy.mock.calls.filter(([type]) => type === 'keydown').length;
    const { unmount: unmountFirst } = render(<Probe active onEscape={vi.fn()} />);
    const { unmount: unmountSecond } = render(<Probe active onEscape={vi.fn()} />);

    expect(keydown(add)).toBe(1);
    unmountFirst();
    expect(keydown(remove)).toBe(0);
    unmountSecond();
    expect(keydown(remove)).toBe(1);
    add.mockRestore();
    remove.mockRestore();
  });

  it('leaves no handler behind after the last dialog closes', () => {
    const onEscape = vi.fn();
    const { unmount } = render(<Probe active onEscape={onEscape} />);
    unmount();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(onEscape).not.toHaveBeenCalled();
  });

  it('claims the Escape it handles, so nothing underneath also acts on it', () => {
    render(<Probe active onEscape={vi.fn()} />);

    const notPrevented = fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(notPrevented).toBe(false);
  });

  it('leaves Escape alone when no dialog is open', () => {
    render(<Probe active={false} onEscape={vi.fn()} />);

    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true);
  });
});

