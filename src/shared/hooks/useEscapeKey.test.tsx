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
