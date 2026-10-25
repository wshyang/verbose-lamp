// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { parseNavLines } from '@/features/gilded-ui';
import { DEFAULT_NAV_LINES } from '@/features/spectacle-preview/data/previewCatalogue';
import { OPENING_TAGLINE, SECTION_TAGLINES } from '../data/sectionTaglines';
import { useEventNight } from './useEventNight';

const spectacle = vi.hoisted(() => ({ play: vi.fn(() => ({ finished: Promise.resolve(), stop: vi.fn() })) }));

vi.mock('@/features/spectacle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/spectacle')>();
  return {
    ...actual,
    useSpectacle: () => ({ play: spectacle.play, stopAll: vi.fn() }),
  };
});

afterEach(() => {
  spectacle.play.mockClear();
});

/** The parameters of the most recent `play(id, params)` call. */
function lastPlayParams<T>(): T {
  const calls = spectacle.play.mock.calls as unknown as Array<[string, T]>;
  return calls[calls.length - 1][1];
}

const items = parseNavLines(DEFAULT_NAV_LINES);

describe('useEventNight', () => {
  it('opens on the arrival tagline with nothing selected', () => {
    const { result } = renderHook(() => useEventNight(items));
    expect(result.current.tagline).toBe(OPENING_TAGLINE);
    expect(result.current.activeId).toBe(items[0].id);
    expect(result.current.isDrawOpen).toBe(false);
  });

  it('ignores ids that are not in the bar', () => {
    const { result } = renderHook(() => useEventNight(items));
    act(() => result.current.selectNav('not-a-real-id'));
    expect(result.current.activeId).toBe(items[0].id);
    expect(spectacle.play).not.toHaveBeenCalled();
  });

  it('opens the lucky draw for the draw item', () => {
    const { result } = renderHook(() => useEventNight(items));
    const draw = items.find((item) => item.label.toLowerCase().includes('draw'))!;
    act(() => result.current.selectNav(draw.id));
    expect(result.current.isDrawOpen).toBe(true);
    act(() => result.current.closeDraw());
    expect(result.current.isDrawOpen).toBe(false);
    act(() => result.current.openDraw());
    expect(result.current.isDrawOpen).toBe(true);
  });

  it('transitions to a programme section and rains confetti for the toast', () => {
    const { result } = renderHook(() => useEventNight(items));
    const program = items.find((item) => item.label.toLowerCase().includes('program'))!;
    act(() => result.current.selectNav(program.id));

    const params = lastPlayParams<{ pattern: string; direction: string; onCovered: () => void }>();
    expect(params.pattern).toBe('sides');
    expect(params.direction).toBe('outward');

    act(() => params.onCovered());
    expect(result.current.tagline).toBe(SECTION_TAGLINES.program);

    const toast = items.find((item) => item.label.toLowerCase().includes('toast'))!;
    act(() => result.current.selectNav(toast.id));
    const toastParams = lastPlayParams<{ onCovered: () => void }>();
    act(() => toastParams.onCovered());
    expect(result.current.tagline).toBe(SECTION_TAGLINES.toast);
    expect(spectacle.play).toHaveBeenLastCalledWith('confetti', expect.objectContaining({ mode: 'rain' }));
  });

  it('starts the transition from the nav bar when it is mounted', () => {
    const { result } = renderHook(() => useEventNight(items));
    const nav = document.createElement('div');
    nav.getBoundingClientRect = () => ({
      x: 10, y: 500, width: 300, height: 60, top: 500, left: 10, right: 310, bottom: 560,
      toJSON: () => ({}),
    }) as DOMRect;
    (result.current.navRef as { current: HTMLDivElement | null }).current = nav;

    const gallery = items.find((item) => item.label.toLowerCase().includes('gallery'))!;
    act(() => result.current.selectNav(gallery.id));
    const origin = lastPlayParams<{ origin: { x: number; y: number } }>().origin;
    expect(origin.x).toBeCloseTo(window.innerWidth ? origin.x : 0);
    expect(origin.y).toBeLessThanOrEqual(0.96);
  });

  it('celebrates a winner with confetti and the name reveal', () => {
    const { result } = renderHook(() => useEventNight(items));
    act(() => result.current.handleLanded({ id: 'daisy', name: 'Daisy Buchanan', subtitle: 'Table 7' }));
    expect(spectacle.play).toHaveBeenNthCalledWith(
      1,
      'confetti',
      expect.objectContaining({ mode: 'burst', origin: { x: 0.5, y: 0.4 } }),
    );
    expect(spectacle.play).toHaveBeenNthCalledWith(
      2,
      'name-reveal',
      { name: 'Daisy Buchanan', subtitle: 'Table 7' },
    );

    act(() => result.current.handleLanded({ id: 'nick', name: 'Nick Carraway' }));
    expect(spectacle.play).toHaveBeenLastCalledWith('name-reveal', {
      name: 'Nick Carraway',
      subtitle: 'Lucky draw winner',
    });
  });
});
