import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsoleThemeToggle } from './ConsoleThemeToggle.js';
import type { ConsoleTheme } from '../../lib/hooks/useConsoleTheme.js';

/**
 * ADR-257 — the toggle names where it will take you, the wrapper carries the
 * theme, and the choice survives to the next staff screen on the device.
 */

function ToggleHost() {
  const [theme, setTheme] = useState<ConsoleTheme>('light');
  return (
    <div data-console-theme={theme} data-testid="theme-host">
      <ConsoleThemeToggle
        theme={theme}
        onToggle={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      />
    </div>
  );
}

describe('ConsoleThemeToggle (ADR-257)', () => {
  it('names the destination and flips the host theme', async () => {
    const user = userEvent.setup();
    render(<ToggleHost />);

    const button = screen.getByTestId('console-theme-toggle__button');
    expect(button).toHaveTextContent('Dark mode');
    await user.click(button);
    expect(screen.getByTestId('theme-host').getAttribute('data-console-theme')).toBe('dark');
    expect(button).toHaveTextContent('Light mode');
  });
});
