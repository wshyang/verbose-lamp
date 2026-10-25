// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { IconButton } from './IconButton';
import { RangeInput } from './RangeInput';

describe('Button', () => {
  it('renders defaults, forwards its ref, and handles clicks', () => {
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(<Button ref={ref} onClick={onClick}>Press</Button>);
    expect(ref.current?.type).toBe('button');
    expect(ref.current?.className).toContain('bg-[var(--ui-surface)]');
    expect(ref.current?.className).toContain('px-3');
    fireEvent.click(ref.current!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it.each([
    ['selected', 'bg-[var(--ui-selected-bg)]'],
    ['accent', 'ui-button-accent'],
    ['quiet', 'border-transparent'],
  ] as Array<[ButtonVariant, string]>)('renders the %s variant', (variant, expected) => {
    render(<Button variant={variant}>{variant}</Button>);
    expect(screen.getByText(variant).className).toContain(expected);
  });

  it.each([
    ['small', 'px-2.5'],
    ['control', 'px-4'],
    ['icon', 'h-8'],
  ] as Array<[ButtonSize, string]>)('renders the %s size and explicit html props', (size, expected) => {
    render(<Button size={size} type="submit" className="extra" disabled>{size}</Button>);
    const button = screen.getByText(size) as HTMLButtonElement;
    expect(button.className).toContain(expected);
    expect(button.className).toContain('extra');
    expect(button.type).toBe('submit');
    expect(button.disabled).toBe(true);
  });
});

describe('IconButton and RangeInput', () => {
  it('uses the label as the default title and allows every override', () => {
    const { rerender } = render(<IconButton label="Close" icon={<span>×</span>} />);
    expect(screen.getByLabelText('Close').getAttribute('title')).toBe('Close');
    rerender(<IconButton label="Open" title="Open title" variant="accent" size="small" icon={<span>+</span>} />);
    expect(screen.getByLabelText('Open').getAttribute('title')).toBe('Open title');
    expect(screen.getByLabelText('Open').className).toContain('ui-button-accent');
  });

  it('forwards range refs, classes, and values', () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    render(<RangeInput ref={ref} value={4} className="custom" onChange={onChange} aria-label="Level" />);
    expect(ref.current?.type).toBe('range');
    expect(ref.current?.className).toContain('custom');
    fireEvent.change(ref.current!, { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledOnce();
  });
});
