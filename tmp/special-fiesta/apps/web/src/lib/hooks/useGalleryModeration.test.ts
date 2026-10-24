import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryModerationView } from '@psd/contracts';
import { POLL_MAX_MS } from './useAsyncData.js';

const fetchModerationQueue = vi.fn();
const fetchGalleryPage = vi.fn();
const hidePhoto = vi.fn();
const unhidePhoto = vi.fn();

vi.mock('../api/gallery.js', () => ({
  fetchModerationQueue: (...args: unknown[]) => fetchModerationQueue(...args),
  fetchGalleryPage: (...args: unknown[]) => fetchGalleryPage(...args),
  hidePhoto: (...args: unknown[]) => hidePhoto(...args),
  unhidePhoto: (...args: unknown[]) => unhidePhoto(...args),
}));

const { useGalleryModeration, usePhotoWall } = await import('./useGalleryModeration.js');

/**
 * ADR-047 — the moderator's queue and the projected wall.
 *
 * The API boundary is the only thing mocked (`AGENTS-testing.md` §5); `useAsyncData`, `usePolling`
 * and `useAction` underneath are the real ones, because what is worth pinning here is how this hook
 * composes them — which error wins, what a failed hide leaves on screen, and whether the wall can
 * end up pointing past the end of a list that shrank.
 */

function photo(id: string, over?: Partial<GalleryModerationView>): GalleryModerationView {
  return {
    id,
    caption: `caption ${id}`,
    uploaderType: 'participant',
    uploaderLabel: 'Wei_Ling',
    uploaderParticipantId: 'p1',
    clusterCode: 'ITC',
    width: 800,
    height: 600,
    voteCount: 3,
    createdAt: '2026-09-30T00:00:00.000Z',
    hiddenAt: null,
    reportCount: 2,
    rawIsOriginal: true,
    ...over,
  };
}

beforeEach(() => {
  /*
   * `shouldAdvanceTime` matters: Testing Library's `waitFor` polls on a timer, so plain fake timers
   * deadlock every `await waitFor(...)` in this file. This keeps real time flowing for the library
   * while still letting `advanceTimersByTime` drive the wall's interval on demand.
   */
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchModerationQueue.mockResolvedValue({ photos: [photo('a'), photo('b')] });
  fetchGalleryPage.mockResolvedValue({ photos: [photo('a'), photo('b'), photo('c')] });
  hidePhoto.mockResolvedValue(undefined);
  unhidePhoto.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useGalleryModeration', () => {
  it('starts empty and loading, then hands over the queue', async () => {
    const { result } = renderHook(() => useGalleryModeration());

    expect(result.current.photos).toEqual([]);
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.photos.map((row) => row.id)).toEqual(['a', 'b']);
    expect(result.current.error).toBeNull();
    expect(result.current.isBusy).toBe(false);
  });

  it('hides a photo and re-reads the queue rather than trusting itself', async () => {
    const { result } = renderHook(() => useGalleryModeration());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    fetchModerationQueue.mockResolvedValue({ photos: [photo('a', { hiddenAt: 'now' })] });

    await act(async () => {
      result.current.hide('a');
    });

    expect(hidePhoto).toHaveBeenCalledWith('a');
    await waitFor(() => expect(result.current.photos).toHaveLength(1));
    expect(result.current.photos[0]?.hiddenAt).toBe('now');
  });

  it('unhides a photo the same way', async () => {
    const { result } = renderHook(() => useGalleryModeration());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.unhide('b');
    });

    expect(unhidePhoto).toHaveBeenCalledWith('b');
  });

  it('surfaces a failed hide without emptying the queue', async () => {
    const { result } = renderHook(() => useGalleryModeration());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    hidePhoto.mockRejectedValue(new Error('Could not hide that photo.'));

    await act(async () => {
      result.current.hide('a');
    });

    await waitFor(() => expect(result.current.error).toBe('Could not hide that photo.'));
    // The moderator still has something to act on — a failed action is not an empty console.
    expect(result.current.photos).toHaveLength(2);
  });

  it('reports the load error when the queue itself cannot be fetched', async () => {
    fetchModerationQueue.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useGalleryModeration());

    await waitFor(() => expect(result.current.error).toBe('offline'));
    expect(result.current.photos).toEqual([]);
  });
});

describe('usePhotoWall', () => {
  it('shows the first photo and counts the rest', async () => {
    const { result } = renderHook(() => usePhotoWall(5000));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.photo?.id).toBe('a');
    expect(result.current.total).toBe(3);
    expect(result.current.error).toBeNull();
  });

  it('advances on its own timer, and wraps at the end', async () => {
    const { result } = renderHook(() => usePhotoWall(5000));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.photo?.id).toBe('b');

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    // Three photos, three advances: back to the first.
    expect(result.current.photo?.id).toBe('a');
  });

  it('advances on demand too', async () => {
    const { result } = renderHook(() => usePhotoWall(5000));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.next());

    expect(result.current.photo?.id).toBe('b');
  });

  /*
   * The hook says modulo rather than resetting, "so a list that shrinks between polls cannot leave the
   * wall pointing past its own end". This is that claim, tested: walk past the end of the shorter list
   * first, then shrink it under the hook.
   */
  it('keeps pointing at a real photo when the list shrinks under it', async () => {
    const { result } = renderHook(() => usePhotoWall(5000));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.next());
    act(() => result.current.next());

    fetchGalleryPage.mockResolvedValue({ photos: [photo('a')] });
    // Past POLL_MAX_MS, so one poll is guaranteed however the jitter landed.
    await act(async () => {
      vi.advanceTimersByTime(POLL_MAX_MS + 5_000);
    });

    await waitFor(() => expect(result.current.total).toBe(1));
    expect(result.current.photo?.id).toBe('a');
  });

  it('shows nothing, and starts no timer, for an empty wall', async () => {
    fetchGalleryPage.mockResolvedValue({ photos: [] });
    const { result } = renderHook(() => usePhotoWall(5000));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.photo).toBeNull();
    expect(result.current.total).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.photo).toBeNull();
  });

  it('does not rotate a wall of one', async () => {
    fetchGalleryPage.mockResolvedValue({ photos: [photo('only')] });
    const { result } = renderHook(() => usePhotoWall(5000));
    await waitFor(() => expect(result.current.total).toBe(1));

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.photo?.id).toBe('only');
  });
});
