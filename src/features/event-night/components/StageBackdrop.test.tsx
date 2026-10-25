// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { StageBackdrop } from './StageBackdrop';

setupDomTests();

describe('StageBackdrop', () => {
  it('paints the warm ballroom gradient behind everything, and takes no pointers', () => {
    const { container } = render(<StageBackdrop />);
    const layer = container.firstElementChild as HTMLElement;

    expect(layer.style.background).toContain('radial-gradient');
    expect(layer.className).toContain('pointer-events-none');
    expect(layer.className).toContain('absolute');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
  });
});
