import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act, useRef } from 'react';
import { useTypeAnywhere } from './useTypeAnywhere.js';

/**
 * ADR-105 — the capture contract: a printable key pressed anywhere lands focus on the
 * primary box; everything with an existing job (editable targets, modifier chords, Enter
 * and Space, disabled inputs, open dialogs) keeps that job.
 */

function Host(props: { disabled?: boolean; inputDisabled?: boolean }) {
  const ref = useRef<HTMLInputElement | null>(null);
  useTypeAnywhere(ref, { disabled: props.disabled });
  return (
    <div>
      <button type="button" data-testid="host__button">
        a button
      </button>
      <input data-testid="host__other" />
      <div contentEditable data-testid="host__editable" />
      <input data-testid="host__primary" ref={ref} disabled={props.inputDisabled} />
    </div>
  );
}

function press(target: Element | Window, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });
}

describe('useTypeAnywhere (ADR-105)', () => {
  it('moves focus to the primary box when a printable key lands anywhere', () => {
    render(<Host />);
    press(document.body, '7');
    expect(screen.getByTestId('host__primary')).toHaveFocus();
  });

  it('leaves a key alone when some other editable element already has it', () => {
    render(<Host />);
    const other = screen.getByTestId('host__other');
    other.focus();
    press(other, '7');
    expect(other).toHaveFocus();
  });

  it('never steals Enter, Space, or modifier chords', () => {
    render(<Host />);
    const button = screen.getByTestId('host__button');
    button.focus();
    press(button, 'Enter');
    expect(button).toHaveFocus();
    press(button, ' ');
    expect(button).toHaveFocus();
    press(button, 'r', { ctrlKey: true });
    expect(button).toHaveFocus();
    press(button, 'c', { metaKey: true });
    expect(button).toHaveFocus();
    press(button, 'x', { altKey: true });
    expect(button).toHaveFocus();
  });

  it('captures nothing while suspended — the confirm dialog owns the keys', () => {
    render(<Host disabled />);
    press(document.body, '7');
    expect(screen.getByTestId('host__primary')).not.toHaveFocus();
  });

  it('ignores composition keystrokes and non-element targets', () => {
    render(<Host />);
    // IME composition in flight: the key belongs to the composer.
    press(document.body, 'a', { isComposing: true });
    expect(screen.getByTestId('host__primary')).not.toHaveFocus();
    // A keydown whose target is the window itself (no element) is not a typing gesture.
    press(window, '7');
    expect(screen.getByTestId('host__primary')).toHaveFocus();
  });

  it('captures nothing into a disabled input', () => {
    render(<Host inputDisabled />);
    press(document.body, '7');
    expect(screen.getByTestId('host__primary')).not.toHaveFocus();
  });
});
