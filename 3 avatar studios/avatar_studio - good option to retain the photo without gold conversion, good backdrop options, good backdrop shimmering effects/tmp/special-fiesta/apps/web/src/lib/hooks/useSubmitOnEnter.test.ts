import { renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSubmitOnEnter } from './useSubmitOnEnter.js';

/**
 * ADR-085 — Enter sends, Shift+Enter starts a new line.
 *
 * The guards are the whole substance of this hook, and each one is here because leaving it out
 * breaks a real case rather than a tidy one: a composing IME, a send already in flight, a
 * deliberate line break.
 */

interface KeyOverrides {
  key?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

/** The parts of a React keyboard event this hook actually reads, and nothing else. */
function keyEvent(over: KeyOverrides = {}) {
  const preventDefault = vi.fn();
  const event = {
    key: over.key ?? 'Enter',
    shiftKey: over.shiftKey ?? false,
    ctrlKey: over.ctrlKey ?? false,
    altKey: over.altKey ?? false,
    metaKey: over.metaKey ?? false,
    preventDefault,
    nativeEvent: { isComposing: over.isComposing ?? false, keyCode: over.keyCode ?? 13 },
  };
  return { event: event as unknown as KeyboardEvent<HTMLTextAreaElement>, preventDefault };
}

function handlerFor(canSend: boolean) {
  const send = vi.fn();
  const { result } = renderHook(() => useSubmitOnEnter({ canSend, send }));
  return { onKeyDown: result.current, send };
}

describe('what counts as a send', () => {
  it('sends on a bare Enter, and does not leave a newline behind', () => {
    const { onKeyDown, send } = handlerFor(true);
    const { event, preventDefault } = keyEvent();

    onKeyDown(event);

    expect(send).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('leaves every other key alone', () => {
    const { onKeyDown, send } = handlerFor(true);
    const { event, preventDefault } = keyEvent({ key: 'a' });

    onKeyDown(event);

    expect(send).not.toHaveBeenCalled();
    // Untouched, or typing a letter into the box would stop working.
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe('what must not be a send', () => {
  it('breaks the line on Shift+Enter instead of sending', () => {
    const { onKeyDown, send } = handlerFor(true);
    const { event, preventDefault } = keyEvent({ shiftKey: true });

    onKeyDown(event);

    expect(send).not.toHaveBeenCalled();
    // Not prevented: the newline is the point of this combination.
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['alt', { altKey: true }],
    ['meta', { metaKey: true }],
  ])('ignores Enter held with %s', (_label, over) => {
    const { onKeyDown, send } = handlerFor(true);

    onKeyDown(keyEvent(over).event);

    expect(send).not.toHaveBeenCalled();
  });

  /**
   * An IME uses Enter to accept the candidate it is offering. Sending there would post a
   * half-finished word AND eat the keystroke that was choosing it — and this app runs in Singapore,
   * so Chinese, Japanese and Korean input are ordinary rather than edge cases.
   */
  it('does not send while an IME is composing', () => {
    const { onKeyDown, send } = handlerFor(true);
    const { event, preventDefault } = keyEvent({ isComposing: true });

    onKeyDown(event);

    expect(send).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  /** Older WebKit reports composition as keyCode 229 rather than `isComposing` (ADR-041). */
  it('treats keyCode 229 as composing too', () => {
    const { onKeyDown, send } = handlerFor(true);

    onKeyDown(keyEvent({ keyCode: 229 }).event);

    expect(send).not.toHaveBeenCalled();
  });

  it('refuses when the surface says it cannot send, and still eats the newline', () => {
    const { onKeyDown, send } = handlerFor(false);
    const { event, preventDefault } = keyEvent();

    onKeyDown(event);

    expect(send).not.toHaveBeenCalled();
    // Prevented anyway: a refused send must not silently leave a blank line in the box, or the
    // next attempt sends whitespace the sender never meant to type.
    expect(preventDefault).toHaveBeenCalled();
  });
});
