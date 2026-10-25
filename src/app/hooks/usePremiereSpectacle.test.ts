// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePremiereSpectacle } from './usePremiereSpectacle';

const mocks = vi.hoisted(() => ({
  preview: { open: false, setOpen: vi.fn() },
  play: vi.fn(),
}));

vi.mock('@/features/spectacle-preview', () => ({ useSpectaclePreview: () => mocks.preview }));
vi.mock('@/features/spectacle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/spectacle')>()),
  useSpectacle: () => ({ play: mocks.play }),
}));

beforeEach(() => {
  mocks.preview.open = false;
  vi.clearAllMocks();
  mocks.preview.setOpen.mockImplementation((open: boolean) => { mocks.preview.open = open; });
});

describe('usePremiereSpectacle', () => {
  it('celebrates landed winners with and without subtitles', () => {
    const { result } = renderHook(() => usePremiereSpectacle());
    act(() => result.current.handleLanded({ id: '1', name: 'Daisy', subtitle: 'East Egg' }));
    act(() => result.current.handleLanded({ id: '2', name: 'Nick' }));
    expect(mocks.play).toHaveBeenCalledWith('confetti', {
      mode: 'burst', origin: { x: 0.5, y: 0.4 }, seed: 1925,
    });
    expect(mocks.play).toHaveBeenCalledWith('name-reveal', { name: 'Daisy', subtitle: 'East Egg' });
    expect(mocks.play).toHaveBeenLastCalledWith('name-reveal', {
      name: 'Nick', subtitle: 'Lucky draw winner',
    });
  });
});
