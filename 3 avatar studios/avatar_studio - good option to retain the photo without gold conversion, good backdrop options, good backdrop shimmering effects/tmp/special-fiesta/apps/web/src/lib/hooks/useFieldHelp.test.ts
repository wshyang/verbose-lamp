import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clampShift, nextHelpState, useFieldHelp, type HelpState } from './useFieldHelp.js';

/**
 * ADR-319 — when a field's help is on screen. Three things open it (the pointer on the icon,
 * focus on the icon, a press on it) and the tooltip goes only when all three have let go.
 */

const CLOSED: HelpState = { isHovered: false, isFocused: false, isPressed: false };

describe('nextHelpState — the open states and what closes them', () => {
  it('opens on hover and closes when the pointer leaves', () => {
    const hovered = nextHelpState(CLOSED, 'pointerenter');
    expect(hovered.isHovered).toBe(true);
    expect(nextHelpState(hovered, 'pointerleave')).toEqual(CLOSED);
  });

  it('opens on focus and closes on blur', () => {
    const focused = nextHelpState(CLOSED, 'focus');
    expect(focused.isFocused).toBe(true);
    expect(nextHelpState(focused, 'blur')).toEqual(CLOSED);
  });

  it('stays open while focused even after the pointer has left', () => {
    const both = nextHelpState(nextHelpState(CLOSED, 'pointerenter'), 'focus');
    const pointerGone = nextHelpState(both, 'pointerleave');
    expect(pointerGone.isFocused).toBe(true);
  });

  it('a press holds it open, and does not toggle on a second press', () => {
    const pressed = nextHelpState(CLOSED, 'press');
    expect(pressed.isPressed).toBe(true);
    expect(nextHelpState(pressed, 'press').isPressed).toBe(true);
  });

  it('losing focus releases a press too — the tooltip goes when focus goes', () => {
    const pressedAndFocused = nextHelpState(nextHelpState(CLOSED, 'focus'), 'press');
    expect(nextHelpState(pressedAndFocused, 'blur')).toEqual(CLOSED);
  });

  it('a press elsewhere, or Escape, closes everything — even an icon that still holds focus', () => {
    const all = { isHovered: true, isFocused: true, isPressed: true };
    expect(nextHelpState(all, 'dismiss')).toEqual(CLOSED);
  });

  it('does not mutate the state it was given', () => {
    const before = Object.freeze({ ...CLOSED });
    expect(() => nextHelpState(before, 'pointerenter')).not.toThrow();
    expect(before).toEqual(CLOSED);
  });
});

describe('clampShift — keep the tooltip inside the screen', () => {
  it('leaves a tooltip that already fits', () => {
    expect(clampShift({ left: 20, right: 300 }, 390)).toBe(0);
  });

  it('pulls one that runs off the right edge back by the overhang plus the margin', () => {
    expect(clampShift({ left: 200, right: 420 }, 390)).toBe(-(420 - 390 + 8));
  });

  it('pushes one that starts off the left edge in by the overhang plus the margin', () => {
    expect(clampShift({ left: -30, right: 190 }, 390)).toBe(30 + 8);
  });
});

describe('useFieldHelp', () => {
  it('is closed to begin with and hands back a stable id', () => {
    const { result, rerender } = renderHook(() => useFieldHelp());
    expect(result.current.isOpen).toBe(false);
    const id = result.current.tooltipId;
    expect(id).not.toBe('');
    rerender();
    expect(result.current.tooltipId).toBe(id);
  });

  it('opens on pointer enter and closes on pointer leave', () => {
    const { result } = renderHook(() => useFieldHelp());
    act(() => result.current.handlers.onPointerEnter());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.handlers.onPointerLeave());
    expect(result.current.isOpen).toBe(false);
  });

  it('opens on focus and closes on blur', () => {
    const { result } = renderHook(() => useFieldHelp());
    act(() => result.current.handlers.onFocus());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.handlers.onBlur());
    expect(result.current.isOpen).toBe(false);
  });

  it('a press stays open after the pointer leaves, until a press outside', () => {
    const { result } = renderHook(() => useFieldHelp());
    act(() => result.current.handlers.onPointerEnter());
    act(() => result.current.handlers.onClick());
    act(() => result.current.handlers.onPointerLeave());
    expect(result.current.isOpen).toBe(true);
    act(() => document.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(result.current.isOpen).toBe(false);
  });

  it('Escape closes it', () => {
    const { result } = renderHook(() => useFieldHelp());
    act(() => result.current.handlers.onClick());
    expect(result.current.isOpen).toBe(true);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(result.current.isOpen).toBe(false);
  });

  it('listens to the document only while it is open', () => {
    const added: string[] = [];
    const original = document.addEventListener.bind(document);
    document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      added.push(type);
      original(type, listener, options);
    }) as typeof document.addEventListener;
    try {
      const { result } = renderHook(() => useFieldHelp());
      expect(added.filter((type) => type === 'keydown')).toHaveLength(0);
      act(() => result.current.handlers.onClick());
      expect(added.filter((type) => type === 'keydown').length).toBeGreaterThan(0);
    } finally {
      document.addEventListener = original;
    }
  });
});
