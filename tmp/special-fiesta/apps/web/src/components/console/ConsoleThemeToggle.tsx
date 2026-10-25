import type { ConsoleTheme } from '../../lib/hooks/useConsoleTheme.js';

/**
 * ADR-257 — the console's theme switch, in the bar of every staff screen.
 *
 * It says where it will take you ("Dark mode" while light is showing), in
 * the console's own plain text: no icon to guess at, and the dark state is
 * `aria-pressed` for screen readers. The host owns the hook instance — one
 * per screen, driving both the themed wrapper and this button — so this
 * only renders the choice and wires the tap.
 */
export function ConsoleThemeToggle(props: {
  theme: ConsoleTheme;
  onToggle: () => void;
}) {
  const isDark = props.theme === 'dark';
  return (
    <button
      type="button"
      className="console-button"
      data-testid="console-theme-toggle__button"
      aria-pressed={isDark}
      onClick={props.onToggle}
    >
      {isDark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
