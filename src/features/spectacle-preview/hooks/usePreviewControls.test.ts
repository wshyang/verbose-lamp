// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';
import type { EffectRunner } from './useEffectRunner';
import { useTransitionActions } from './useTransitionActions';

setupDomTests();



function runner(): EffectRunner {
  return { playing: new Set<string>(), run: vi.fn(), toggle: vi.fn(), stopKey: vi.fn(), stopAll: vi.fn() };
}

describe('useTransitionActions', () => {
  it('plays an orb transition and swaps the demo screen when covered', () => {
    const r = runner();
    const origin = { x: 0.5, y: 0.42 };
    const { result } = renderHook(() => useTransitionActions({ runner: r, origin }));

    act(() => result.current.playOrb('orb-1', 'corners', 'inward'));

    expect(r.run).toHaveBeenCalledWith('orb-1', 'orb-transition', {
      origin,
      pattern: 'corners',
      direction: 'inward',
      onCovered: expect.any(Function),
    });
    const calls = (r.run as unknown as {
      mock: { calls: Array<[string, string, { onCovered: () => void }]> };
    }).mock.calls;
    const params = calls[0][2];
    expect(result.current.demoScreen).toBe('A');
    act(() => params.onCovered());
    expect(result.current.demoScreen).toBe('B');
    act(() => params.onCovered());
    expect(result.current.demoScreen).toBe('A');
  });

  it('anchors a fan sunburst at the bottom of the screen', () => {
    const r = runner();
    const { result } = renderHook(() => useTransitionActions({ runner: r, origin: { x: 0.5, y: 0.4 } }));

    act(() => result.current.playSunburst('fan', 'fan'));

    expect(r.run).toHaveBeenCalledWith('fan', 'sunburst-wipe', {
      origin: { x: 0.5, y: 1 },
      variant: 'fan',
      onCovered: expect.any(Function),
    });
  });

  it('keeps the picked origin for the iris wipe', () => {
    const r = runner();
    const origin = { x: 0.2, y: 0.3 };
    const { result } = renderHook(() => useTransitionActions({ runner: r, origin }));

    act(() => result.current.playSunburst('iris', 'iris'));

    expect(r.run).toHaveBeenCalledWith('iris', 'sunburst-wipe', {
      origin,
      variant: 'iris',
      onCovered: expect.any(Function),
    });
  });
});
