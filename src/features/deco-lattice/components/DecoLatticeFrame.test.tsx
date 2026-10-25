// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DecoLatticeFrame } from './DecoLatticeFrame';

describe('DecoLatticeFrame', () => {
  it('draws one gradient per layer and a depth filter on the back layer', () => {
    const { container } = render(
      <DecoLatticeFrame request={{ seed: 1925, density: 1, level: 4 }} className="inset-0">
        <span>caption</span>
      </DecoLatticeFrame>,
    );
    const root = screen.getByTestId('deco-lattice-frame__root');
    expect(root.className).toContain('relative');
    expect(root.className).toContain('inset-0');
    expect(screen.getByText('caption')).toBeDefined();

    const gradients = container.querySelectorAll('linearGradient');
    expect(gradients.length).toBe(4);
    for (const gradient of gradients) {
      expect(gradient.getAttribute('gradientTransform')).toMatch(/^rotate\([-\d.]+ 0\.5 0\.5\)$/);
      expect(gradient.querySelectorAll('stop').length).toBe(5);
    }
    expect(container.querySelectorAll('filter feDropShadow').length).toBe(1);

    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.getAttribute('fill')).toBe('none');
      expect(path.getAttribute('stroke')).toMatch(/^url\(#.+-brass-\d\)$/);
    }
  });

  it('filters only the back layer with the drop shadow', () => {
    const { container } = render(<DecoLatticeFrame />);
    const groups = Array.from(container.querySelectorAll('svg > g'));
    expect(groups.length).toBe(4);
    const filtered = groups.filter((group) => group.getAttribute('filter'));
    expect(filtered.length).toBe(1);
    expect(filtered[0].getAttribute('filter')).toMatch(/-depth\)$/);
    expect(filtered[0].getAttribute('opacity')).toBe('1');
  });
});
