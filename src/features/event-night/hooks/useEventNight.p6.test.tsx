// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { parseNavLines } from '@/features/gilded-ui';

import { OPENING_TAGLINE, SECTION_TAGLINES } from '../data/sectionTaglines';

import { useEventNight } from './useEventNight';

import { setupDomTests } from '@/test/dom';

setupDomTests();
const stage = vi.hoisted(() => ({
  play: vi.fn(),
  pointFromElement: vi.fn(() => ({ x: 0.5, y: 0.5 })),
}));
vi.mock('@/features/spectacle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/spectacle')>();
  return {
    ...actual,
    useSpectacle: () => ({ play: stage.play }),
    pointFromElement: stage.pointFromElement,
  };
});
const items_p6 = parseNavLines('🏛️,Foyer\n🥂,Toast\n🎰,Lucky Draw');
const byLabel = (label: string) => items_p6.find((item) => item.label === label)!;
beforeEach(() => {
  vi.clearAllMocks();
  stage.pointFromElement.mockReturnValue({ x: 0.5, y: 0.5 });
});
describe('useEventNight', () => {
  it('ignores a nav id that is not in the bar', () => {
    const { result } = renderHook(() => useEventNight(items_p6));

    act(() => result.current.selectNav('nope'));

    expect(stage.play).not.toHaveBeenCalled();
    expect(result.current.activeId).toBe(items_p6[0].id);
  });

  it('opens the draw dialog from the lucky-draw item without a transition', () => {
    const { result } = renderHook(() => useEventNight(items_p6));

    act(() => result.current.selectNav(byLabel('Lucky Draw').id));

    expect(result.current.isDrawOpen).toBe(true);
    expect(result.current.activeId).toBe(byLabel('Lucky Draw').id);
    expect(stage.play).not.toHaveBeenCalled();
  });

  it('sweeps an orb transition out of the chosen tab', () => {
    stage.pointFromElement.mockReturnValue({ x: 0.24, y: 0.61 });
    const { result } = renderHook(() => useEventNight(items_p6));
    const nav = document.createElement('div');
    Object.defineProperty(nav, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 100, height: 40 }),
    });
    result.current.navRef.current = nav;

    act(() => result.current.selectNav(byLabel('Foyer').id));

    const [id, params] = stage.play.mock.calls[0];
    expect(id).toBe('orb-transition');
    expect(params).toMatchObject({
      origin: { x: 0.24, y: 0.61 },
      pattern: 'sides',
      direction: 'outward',
      durationMs: 1300,
    });
    expect(result.current.activeId).toBe(byLabel('Foyer').id);
    // The tagline only swaps once the cover reaches the middle.
    expect(result.current.tagline).toBe(OPENING_TAGLINE);

    act(() => params.onCovered());

    expect(result.current.tagline).toBe(SECTION_TAGLINES.foyer);
  });

  it('keeps the transition origin above the very bottom edge', () => {
    stage.pointFromElement.mockReturnValue({ x: 0.4, y: 0.99 });
    const { result } = renderHook(() => useEventNight(items_p6));
    result.current.navRef.current = document.createElement('div');

    act(() => result.current.selectNav(byLabel('Foyer').id));

    expect(stage.play.mock.calls[0][1].origin).toEqual({ x: 0.4, y: 0.96 });
  });

  it('falls back to the bottom centre when the bar is not mounted', () => {
    const { result } = renderHook(() => useEventNight(items_p6));

    act(() => result.current.selectNav(byLabel('Foyer').id));

    expect(stage.pointFromElement).not.toHaveBeenCalled();
    expect(stage.play.mock.calls[0][1].origin).toEqual({ x: 0.5, y: 0.95 });
  });

  it('rains confetti for the toast section once covered', () => {
    const { result } = renderHook(() => useEventNight(items_p6));

    act(() => result.current.selectNav(byLabel('Toast').id));
    const [, params] = stage.play.mock.calls[0];
    act(() => params.onCovered());

    const [id, rain] = stage.play.mock.calls[1];
    expect(id).toBe('confetti');
    expect(rain).toEqual({ mode: 'rain', durationMs: 2600 });
    expect(rain).not.toHaveProperty('origin');
  });

  it('celebrates a drawn winner with confetti and a name reveal', () => {
    const { result } = renderHook(() => useEventNight(items_p6));

    act(() =>
      result.current.handleLanded({ id: 'ada', name: 'Ada Lovelace', subtitle: 'Table 4' })
    );

    expect(stage.play).toHaveBeenCalledTimes(2);
    const [confettiId, confetti] = stage.play.mock.calls[0];
    expect(confettiId).toBe('confetti');
    expect(confetti).toMatchObject({
      mode: 'burst',
      origin: { x: 0.5, y: 0.4 },
    });
    expect(confetti.seed).toBeGreaterThanOrEqual(0);
    expect(confetti.seed).toBeLessThan(100_000);

    const [revealId, reveal] = stage.play.mock.calls[1];
    expect(revealId).toBe('name-reveal');
    expect(reveal).toEqual({ name: 'Ada Lovelace', subtitle: 'Table 4' });
  });

  it('gives a winner without a subtitle the house wording', () => {
    const { result } = renderHook(() => useEventNight(items_p6));

    act(() => result.current.handleLanded({ id: 'bo', name: 'Bo' }));

    expect(stage.play.mock.calls[1][1]).toEqual({
      name: 'Bo',
      subtitle: 'Lucky draw winner',
    });
  });
});
