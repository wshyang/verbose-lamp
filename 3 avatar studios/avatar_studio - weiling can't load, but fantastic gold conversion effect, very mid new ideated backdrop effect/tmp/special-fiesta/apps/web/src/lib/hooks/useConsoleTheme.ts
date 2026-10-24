import { useState } from 'react';
import { readItem, writeItem } from '../storage/localStore.js';

/**
 * ADR-257 — the staff console's theme: light and high-contrast by default,
 * dark by choice, remembered on the device.
 *
 * This module owns `psd.console-theme.v1` (ADR-019): no one else reads or
 * writes the key. Anything unrecognised in the store — an older build's
 * value, a hand-edited phone — means the default, because a sign-in screen
 * that comes up in a theme nobody can read has failed before the passcode.
 * The participant theme has no say here and this has none there.
 */

export const CONSOLE_THEME_KEY = 'psd.console-theme.v1';

export type ConsoleTheme = 'light' | 'dark';

function storedTheme(): ConsoleTheme {
  return readItem(CONSOLE_THEME_KEY) === 'dark' ? 'dark' : 'light';
}

export function useConsoleTheme(): { theme: ConsoleTheme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<ConsoleTheme>(storedTheme);

  const toggleTheme = () => {
    const next: ConsoleTheme = theme === 'light' ? 'dark' : 'light';
    writeItem(CONSOLE_THEME_KEY, next);
    setTheme(next);
  };

  return { theme, toggleTheme };
}
