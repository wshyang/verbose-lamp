import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PhotoDialog } from './PhotoDialog.js';

/*
 * ADR-229 — the photo's dialog keeps focus inside it, returns focus to what opened it, cancels on Escape, and
 * leaves Tab alone when there is nothing to move between.
 */

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      {open ? (
        <PhotoDialog title="Your photo" onCancel={() => setOpen(false)}>
          <button type="button">inside</button>
        </PhotoDialog>
      ) : null}
    </>
  );
}

describe('PhotoDialog (ADR-229)', () => {
  it('moves focus in when it opens, and back to what opened it when it closes', () => {
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'open' });
    opener.focus();
    fireEvent.click(opener);

    expect(screen.getByRole('button', { name: 'inside' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  /*
   * Every opener in the app is an HTML control, so focus returns to those. An SVG control is not an
   * HTMLElement and is not restored; this pins that it closes cleanly rather than throwing.
   */
  it('closes cleanly when the opener is an SVG control, and leaves focus on the page', () => {
    function SvgHost() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <svg tabIndex={0} data-testid="svg-opener" onClick={() => setOpen(true)} />
          {open ? (
            <PhotoDialog title="Your photo" onCancel={() => setOpen(false)}>
              <button type="button">inside</button>
            </PhotoDialog>
          ) : null}
        </>
      );
    }
    render(<SvgHost />);
    const opener = screen.getByTestId('svg-opener');
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('button', { name: 'inside' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body).toHaveFocus();
  });

  it('keeps Tab inside, wrapping at both ends', () => {
    render(
      <PhotoDialog title="Your photo" onCancel={() => undefined}>
        <button type="button">first</button>
        <button type="button">last</button>
      </PhotoDialog>,
    );
    const dialog = screen.getByRole('dialog');
    const first = screen.getByRole('button', { name: 'first' });
    const last = screen.getByRole('button', { name: 'last' });

    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('leaves focus alone between the ends, in either direction', () => {
    render(
      <PhotoDialog title="Your photo" onCancel={() => undefined}>
        <button type="button">first</button>
        <button type="button">middle</button>
        <button type="button">last</button>
      </PhotoDialog>,
    );
    const dialog = screen.getByRole('dialog');
    const first = screen.getByRole('button', { name: 'first' });
    const middle = screen.getByRole('button', { name: 'middle' });

    middle.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(middle).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(middle).toHaveFocus();

    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(first).toHaveFocus();
  });

  it('cancels on Escape and ignores other keys', () => {
    const onCancel = vi.fn();
    render(
      <PhotoDialog title="Your photo" onCancel={onCancel}>
        <button type="button">inside</button>
      </PhotoDialog>,
    );
    const dialog = screen.getByRole('dialog');

    fireEvent.keyDown(dialog, { key: 'a' });
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('is harmless when there is nothing focusable inside it', () => {
    render(
      <PhotoDialog title="Your photo" onCancel={() => undefined}>
        <span>Working on your photo…</span>
      </PhotoDialog>,
    );
    expect(() => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })).not.toThrow();
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});
