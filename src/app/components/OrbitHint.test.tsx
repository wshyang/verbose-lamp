// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { OrbitHint } from './OrbitHint';

setupDomTests();

describe('OrbitHint', () => {
  it('says nothing at all until the stage asks for it', () => {
    const { container } = render(<OrbitHint isVisible={false} />);

    expect(container.firstChild).toBeNull();
  });

  it('lists the three gestures while the premiere has no clock running', () => {
    render(<OrbitHint isVisible />);

    const hint = screen.getByText(/Drag to Orbit/i);
    expect(hint.textContent).toContain('Scroll to Zoom');
    expect(hint.textContent).toContain('Click Any Act');
    // It floats over the canvas, so it must never eat a pointer event.
    expect(hint.className).toContain('pointer-events-none');
  });
});
