import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CONSOLE_THEME_KEY, useConsoleTheme } from './useConsoleTheme.js';
import { readItem, removeItem, writeItem } from '../storage/localStore.js';

/**
 * ADR-257 — light is the default (including over anything unrecognised in
 * the store), dark is a stored choice, and the toggle persists it so the
 * next staff screen on this device opens the same way.
 */
describe('useConsoleTheme (ADR-257)', () => {
  it('defaults to light and honours a stored dark choice', () => {
    removeItem(CONSOLE_THEME_KEY);
    expect(renderHook(() => useConsoleTheme()).result.current.theme).toBe('light');

    writeItem(CONSOLE_THEME_KEY, 'dark');
    expect(renderHook(() => useConsoleTheme()).result.current.theme).toBe('dark');

    writeItem(CONSOLE_THEME_KEY, 'sepia');
    expect(renderHook(() => useConsoleTheme()).result.current.theme).toBe('light');
  });

  it('toggles and persists each way', () => {
    removeItem(CONSOLE_THEME_KEY);
    const view = renderHook(() => useConsoleTheme());

    act(() => view.result.current.toggleTheme());
    expect(view.result.current.theme).toBe('dark');
    expect(readItem(CONSOLE_THEME_KEY)).toBe('dark');

    act(() => view.result.current.toggleTheme());
    expect(view.result.current.theme).toBe('light');
    expect(readItem(CONSOLE_THEME_KEY)).toBe('light');
  });
});
