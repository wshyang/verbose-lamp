// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_NAV_LINES } from '../data/previewCatalogue';
import { setupDomTests } from '@/test/dom';
import type { EffectRunner } from './useEffectRunner';
import { useGoldUiLines } from './useGoldUiLines';
import { useLatticeControls } from './useLatticeControls';
import { useTransitionActions } from './useTransitionActions';

setupDomTests();

describe('useLatticeControls', () => {
  it('starts from the documented defaults', () => {
    const { result } = renderHook(() => useLatticeControls());

    expect(result.current.latticeSeed).toBe(1925);
    expect(result.current.latticeDensity).toBe(0.7);
    expect(result.current.latticeLevel).toBe(4);
  });

  it('rerolls the seed into the six-digit range', () => {
    const { result } = renderHook(() => useLatticeControls());

    act(() => result.current.rerollLattice());
    const first = result.current.latticeSeed;
    act(() => result.current.rerollLattice());

    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1_000_000);
    expect(Number.isInteger(first)).toBe(true);
    expect(result.current.latticeSeed).not.toBe(1925);
  });

  it('stores density and level edits', () => {
    const { result } = renderHook(() => useLatticeControls());

    act(() => result.current.setLatticeDensity(0.2));
    act(() => result.current.setLatticeLevel(2));

    expect(result.current.latticeDensity).toBe(0.2);
    expect(result.current.latticeLevel).toBe(2);
  });
});

describe('useGoldUiLines', () => {
  it('parses the default nav lines into a valid bar', () => {
    const { result } = renderHook(() => useGoldUiLines());

    expect(result.current.navText).toBe(DEFAULT_NAV_LINES);
    expect(result.current.navValidation.ok).toBe(true);
    expect(result.current.navItems).toHaveLength(5);
  });

  it('keeps the last valid bar while the editor is invalid', () => {
    const { result } = renderHook(() => useGoldUiLines());

    act(() => result.current.setNavText('no emoji or label separator'));

    expect(result.current.navValidation.ok).toBe(false);
    expect(result.current.navItems).toHaveLength(5);
  });

  it('accepts a rewritten bar', () => {
    const { result } = renderHook(() => useGoldUiLines());

    act(() => result.current.setNavText('🥂,Toast\n🎷,Program'));

    expect(result.current.navItems.map((item) => item.label)).toEqual(['Toast', 'Program']);
  });
});

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
