// @vitest-environment jsdom
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('is a submit-safe button with the panel variant and compact size by default', () => {
    render(<Button data-testid="button__default">Research</Button>);
    const button = screen.getByTestId('button__default');
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.textContent).toBe('Research');
    expect(button.className).toContain('bg-[var(--ui-surface)]');
    expect(button.className).toContain('px-3');
  });

  it.each([
    ['selected', 'bg-[var(--ui-selected-bg)]'],
    ['accent', 'ui-button-accent'],
    ['quiet', 'border-transparent'],
  ] as const)('maps the %s variant to its class', (variant, expected) => {
    render(<Button variant={variant} data-testid={`button__${variant}`} />);
    expect(screen.getByTestId(`button__${variant}`).className).toContain(expected);
  });

  it.each([
    ['small', 'px-2.5'],
    ['control', 'px-4'],
    ['icon', 'h-8'],
  ] as const)('maps the %s size to its class', (size, expected) => {
    render(<Button size={size} data-testid={`button__${size}`} />);
    expect(screen.getByTestId(`button__${size}`).className).toContain(expected);
  });

  it('keeps the caller className and forwards the ref and click handler', async () => {
    const ref = createRef<HTMLButtonElement>();
    const clicks: string[] = [];
    render(
      <Button ref={ref} className="custom-class" onClick={() => clicks.push('clicked')}>
        Apply
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Apply' });
    expect(button.className).toContain('custom-class');
    expect(ref.current).toBe(button);
    await userEvent.click(button);
    expect(clicks).toEqual(['clicked']);
  });
});
