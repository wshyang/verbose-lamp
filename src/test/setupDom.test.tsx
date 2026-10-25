// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('setupDom shims (jsdom suites)', () => {
  it('provides a canvas 2D context', () => {
    const context = document.createElement('canvas').getContext('2d');

    expect(context).not.toBeNull();
    expect(typeof context?.fillRect).toBe('function');
  });

  it('provides the observers jsdom lacks', () => {
    const observer = new ResizeObserver(() => {});

    expect(() => {
      observer.observe(document.body);
      observer.disconnect();
    }).not.toThrow();
    expect(new IntersectionObserver(() => {}).takeRecords()).toEqual([]);
  });

  it('provides pointer capture and matchMedia with a "no match" default', () => {
    const element = document.createElement('div');

    expect(() => element.setPointerCapture(1)).not.toThrow();
    expect(element.hasPointerCapture(1)).toBe(false);
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
  });

  it('renders into a fresh document after the previous test (cleanup ran)', () => {
    render(<p data-testid="probe">one</p>);

    expect(screen.getAllByTestId('probe')).toHaveLength(1);
  });

  it('starts every test with an empty container', () => {
    render(<p data-testid="probe">two</p>);

    expect(screen.getAllByTestId('probe')).toHaveLength(1);
  });
});
