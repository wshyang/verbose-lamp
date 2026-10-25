// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './IconButton';
import { RangeInput } from './RangeInput';

describe('IconButton', () => {
  it('exposes the label as accessible name and native title', () => {
    render(<IconButton label="Close editor" icon={<svg data-testid="icon__svg" />} />);
    const button = screen.getByRole('button', { name: 'Close editor' });
    expect(button.getAttribute('aria-label')).toBe('Close editor');
    expect(button.getAttribute('title')).toBe('Close editor');
    expect(screen.getByTestId('icon__svg')).toBeDefined();
    expect(button.className).toContain('h-8');
  });

  it('lets the caller override the title, variant, size and click handler', async () => {
    const clicks: string[] = [];
    render(
      <IconButton
        label="Mute"
        title="Toggle ambience"
        variant="selected"
        size="small"
        icon={null}
        data-testid="icon-button__sound"
        onClick={() => clicks.push('muted')}
      />,
    );
    const button = screen.getByTestId('icon-button__sound');
    expect(button.getAttribute('title')).toBe('Toggle ambience');
    expect(button.className).toContain('bg-[var(--ui-selected-bg)]');
    expect(button.className).toContain('px-2.5');
    await userEvent.click(button);
    expect(clicks).toEqual(['muted']);
  });
});

describe('RangeInput', () => {
  it('renders a range input and forwards its attributes and ref', () => {
    const changes: string[] = [];
    render(
      <RangeInput
        aria-label="Intricacy"
        min={0}
        max={100}
        defaultValue={30}
        data-testid="range-input__value"
        className="custom"
        onChange={(event) => changes.push(event.target.value)}
      />,
    );
    const input = screen.getByTestId('range-input__value') as HTMLInputElement;
    expect(input.type).toBe('range');
    expect(input.min).toBe('0');
    expect(input.max).toBe('100');
    expect(input.value).toBe('30');
    expect(input.className).toContain('ui-range');
    expect(input.className).toContain('custom');
  });
});
