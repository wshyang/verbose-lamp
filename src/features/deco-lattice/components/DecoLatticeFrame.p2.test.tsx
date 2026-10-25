// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { BrassDefs } from './BrassDefs';

import { DecoLatticeFrame } from './DecoLatticeFrame';

const hook = vi.hoisted(() => ({ value: undefined as never }));
vi.mock('../hooks/useDecoLatticePaths', () => ({
  useDecoLatticePaths: () => hook.value,
}));
function fixture() {
  return {
    uid: 'u1',
    viewBox: '-1 -1 2 2',
    aspectMode: 'xMidYMid meet',
    groups: [
      { layer: 3, brassAngle: 30, paths: [{ d: 'M0 0H1', width: 0.02, layer: 3 }] },
      { layer: 0, brassAngle: 90, paths: [{ d: 'M0 0V1', width: 0.04, layer: 0 }] },
    ],
  };
}
describe('DecoLatticeFrame and BrassDefs', () => {
  it('renders layers, brass gradients, depth filter, children, and custom class', () => {
    hook.value = fixture() as never;
    const { container } = render(
      <DecoLatticeFrame className="frame"><span>Inside</span></DecoLatticeFrame>
    );
    expect(screen.getByTestId('deco-lattice-frame__root').className).toContain('frame');
    expect(screen.getByText('Inside')).toBeTruthy();
    expect(container.querySelectorAll('linearGradient')).toHaveLength(2);
    expect(container.querySelector('#u1-depth')).toBeTruthy();
    const groups = container.querySelectorAll('svg > g');
    expect(groups[0].hasAttribute('filter')).toBe(false);
    expect(groups[1].getAttribute('filter')).toBe('url(#u1-depth)');
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });

  it('defaults the class and renders BrassDefs directly', () => {
    hook.value = fixture() as never;
    render(<DecoLatticeFrame />);
    expect(screen.getByTestId('deco-lattice-frame__root').className).toBe('relative ');
    const { container } = render(
      <svg><BrassDefs uid="solo" groups={fixture().groups as never} /></svg>
    );
    expect(container.querySelector('#solo-brass-3')).toBeTruthy();
  });
});
