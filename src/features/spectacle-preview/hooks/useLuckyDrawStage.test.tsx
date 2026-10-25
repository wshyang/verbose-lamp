// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLuckyDrawStage } from './useLuckyDrawStage';

const spectacle = vi.hoisted(() => ({ play: vi.fn() }));

vi.mock('@/features/spectacle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/spectacle')>();
  return { ...actual, useSpectacle: () => ({ play: spectacle.play }) };
});

beforeEach(() => {
  spectacle.play.mockClear();
});

describe('useLuckyDrawStage', () => {
  it('opens and closes the drum', () => {
    const { result } = renderHook(() => useLuckyDrawStage());
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it('celebrates a winner with confetti and the name reveal', () => {
    const { result } = renderHook(() => useLuckyDrawStage());
    act(() => result.current.handleLanded({ id: 'gatz', name: 'Jay Gatsby', subtitle: 'West Egg' }));

    expect(spectacle.play).toHaveBeenNthCalledWith(1, 'confetti', {
      mode: 'burst',
      origin: { x: 0.5, y: 0.4 },
      seed: expect.any(Number),
    });
    expect(spectacle.play).toHaveBeenNthCalledWith(2, 'name-reveal', {
      name: 'Jay Gatsby',
      subtitle: 'West Egg',
    });
  });

  it('falls back to a generic subtitle', () => {
    const { result } = renderHook(() => useLuckyDrawStage());
    act(() => result.current.handleLanded({ id: 'daisy', name: 'Daisy Buchanan' }));
    expect(spectacle.play).toHaveBeenLastCalledWith('name-reveal', {
      name: 'Daisy Buchanan',
      subtitle: 'Lucky draw winner',
    });
  });
});
