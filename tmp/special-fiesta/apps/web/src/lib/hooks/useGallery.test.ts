import type { GalleryPhotoView } from '@psd/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';
import { useGallery } from './useGallery.js';

/** The gallery hook (ADR-047). Only the browser's network boundary is stubbed. */

/** ADR-134 — a page is now a shared list plus this viewer's overlay. */
function page(input: { photos?: GalleryPhotoView[]; myVoteIds?: string[]; remaining?: number }) {
  return {
    body: {
      photos: input.photos ?? [photo()],
      myVoteIds: input.myVoteIds ?? [],
      remainingUploads: input.remaining ?? 9,
    },
  };
}

function photo(overrides: Partial<GalleryPhotoView> = {}): GalleryPhotoView {
  return {
    id: 'p-1',
    caption: 'Sandcastle',
    uploaderType: 'participant',
    uploaderLabel: 'BeachBoss',
    uploaderParticipantId: 'u-1',
    clusterCode: 'CS',
    width: 1280,
    height: 960,
    voteCount: 2,
    createdAt: '2026-09-30T02:00:00.000Z',
    ...overrides,
  };
}

let stub: FetchStub | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

describe('browsing', () => {
  it('shows the photos and how many the viewer may still share', async () => {
    stub = installFetchStub({
      'GET /api/gallery/photos': page({ remaining: 7 }),
    });

    const { result } = renderHook(() => useGallery());

    await waitFor(() => expect(result.current.photos).toHaveLength(1));
    expect(result.current.remainingUploads).toBe(7);
    expect(result.current.error).toBeNull();
  });

  it('asks the server for the chosen order rather than re-sorting locally', async () => {
    stub = installFetchStub({
      'GET /api/gallery/photos': page({ remaining: 10 }),
    });
    const { result } = renderHook(() => useGallery());
    await waitFor(() => expect(result.current.photos).toHaveLength(1));

    act(() => result.current.setSort('top'));

    // The sort is a server concern because the page is bounded: sorting only what was fetched
    // would rank a window, not the gallery.
    await waitFor(() => {
      const paths = stub?.calls.map((call) => call.path) ?? [];
      expect(paths.some((path) => path.includes('sort=top'))).toBe(true);
    });
  });

  it('surfaces a failed load', async () => {
    stub = installFetchStub({ 'GET /api/gallery/photos': { offline: true } });

    const { result } = renderHook(() => useGallery());

    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});

describe('liking', () => {
  /*
   * ADR-134 — the flag the grid draws is folded here from `myVoteIds`, not sent per photo.
   * Worth its own test: the server has stopped answering this question photo by photo, and a
   * fold that silently drops the overlay would leave every heart hollow for everybody.
   */
  it('folds the viewer’s overlay onto the shared list', async () => {
    stub = installFetchStub({
      'GET /api/gallery/photos': page({
        photos: [photo({ id: 'p-1' }), photo({ id: 'p-2' })],
        myVoteIds: ['p-2'],
      }),
    });

    const { result } = renderHook(() => useGallery());

    await waitFor(() => expect(result.current.photos).toHaveLength(2));
    expect(result.current.photos.map((entry) => entry.hasMyVote)).toEqual([false, true]);
  });

  it('likes an unliked photo', async () => {
    stub = installFetchStub({
      'GET /api/gallery/photos': page({ myVoteIds: [] }),
      'POST /api/gallery/photos/p-1/vote': { status: 201, body: { ok: true } },
    });
    const { result } = renderHook(() => useGallery());
    await waitFor(() => expect(result.current.photos).toHaveLength(1));

    await act(async () => {
      const first = result.current.photos[0];
      if (first) result.current.toggleLike(first);
    });

    await waitFor(() => expect(stub?.callsTo('POST /api/gallery/photos/p-1/vote')).toHaveLength(1));
  });

  it('takes the like back when it is already mine', async () => {
    stub = installFetchStub({
      'GET /api/gallery/photos': page({ myVoteIds: ['p-1'] }),
      'DELETE /api/gallery/photos/p-1/vote': { body: { ok: true } },
    });
    const { result } = renderHook(() => useGallery());
    await waitFor(() => expect(result.current.photos).toHaveLength(1));

    await act(async () => {
      const first = result.current.photos[0];
      if (first) result.current.toggleLike(first);
    });

    await waitFor(() =>
      expect(stub?.callsTo('DELETE /api/gallery/photos/p-1/vote')).toHaveLength(1),
    );
  });
});

describe('reporting', () => {
  it('remembers a reported photo so the control can say so', async () => {
    stub = installFetchStub({
      'GET /api/gallery/photos': page({}),
      'POST /api/gallery/photos/p-1/report': { status: 201, body: { ok: true } },
    });
    const { result } = renderHook(() => useGallery());
    await waitFor(() => expect(result.current.photos).toHaveLength(1));

    await act(async () => {
      const first = result.current.photos[0];
      if (first) result.current.report(first);
    });

    await waitFor(() => expect(result.current.reportedIds).toContain('p-1'));
  });

  it('shows the refusal when the same photo is reported twice', async () => {
    stub = installFetchStub({
      'GET /api/gallery/photos': page({}),
      'POST /api/gallery/photos/p-1/report': {
        status: 409,
        body: { error: { message: 'Thanks — you have already reported this photo.' } },
      },
    });
    const { result } = renderHook(() => useGallery());
    await waitFor(() => expect(result.current.photos).toHaveLength(1));

    await act(async () => {
      const first = result.current.photos[0];
      if (first) result.current.report(first);
    });

    await waitFor(() => expect(result.current.error).toContain('already reported'));
  });
});
