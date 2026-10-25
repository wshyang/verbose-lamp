import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useReducedMotion } from './useReducedMotion';

function Probe() {
  return <span>{String(useReducedMotion())}</span>;
}

describe('useReducedMotion without a browser', () => {
  it('defaults to false during server rendering', () => {
    expect(typeof window).toBe('undefined');
    expect(renderToString(<Probe />)).toBe('<span>false</span>');
  });
});
