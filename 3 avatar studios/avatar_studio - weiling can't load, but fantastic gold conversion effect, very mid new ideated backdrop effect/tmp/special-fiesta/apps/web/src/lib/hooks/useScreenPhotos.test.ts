import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';
import { installImageStub, type ImageStub } from '../../test-utils/imageStub.js';
import { resetImagePreload } from '../photo/imagePreload.js';
import { useScreenPhotos } from './useScreenPhotos.js';

/**
 * ADR-143 — the promise the photo scenes make: what is handed back is decoded, complete, and
 * freshly read. Each of these is a way the hall screen could embarrass the event.
 */

let stub: FetchStub;
let images: ImageStub;

function photo(id: string) {
  return {
    id,
    caption: `caption ${id}`,
    uploaderType: 'participant',
    uploaderLabel: 'BeachBoss',
    uploaderParticipantId: 'p1',
    clusterCode: 'CS',
    width: 1200,
    height: 900,
    voteCount: 3,
    createdAt: '2026-10-04T02:00:00.000Z',
  };
}

function open(options?: { photos?: unknown[]; status?: number }) {
  stub = installFetchStub({
    'GET /api/gallery/photos': {
      status: options?.status ?? 200,
      body:
        options?.status === 503
          ? { error: { message: 'Chat and photos are paused.' } }
          : { photos: options?.photos ?? [photo('p1'), photo('p2')], myVoteIds: [], remainingUploads: 0 },
    },
  });
  images = installImageStub();
  return renderHook(() => useScreenPhotos('newest'));
}

afterEach(() => {
  /*
   * Unmount FIRST, then clear the shared caches. Testing Library's automatic cleanup runs
   * after this hook, so clearing `imagePreload`'s module state here used to leave the
   * previous test's hook still mounted and still able to start a preload — which landed in
   * the map AFTER it had been emptied. The next test then awaited a promise belonging to a
   * stub that no longer existed, so its image was never requested and its wait expired on a
   * value that was never going to change. Shared module state has to be reset against a
   * quiet tree, not a live one.
   */
  cleanup();
  images.restore();
  resetImagePreload();
  window.localStorage.clear();
});

describe('the hall screen photo scenes', () => {
  it('hands back nothing until every image has decoded', async () => {
    const { result } = open();

    await waitFor(() => expect(images.requested.length).toBe(2));
    // The listing is in and the requests are out — and the scene still has nothing, which is
    // the whole point: every frame of the strip is mounted, so a photo handed over now is on
    // the wall now, half-arrived, in front of the room.
    expect(result.current.photos).toHaveLength(0);

    await act(async () => {
      images.settleAll();
    });
    await waitFor(() => expect(result.current.photos).toHaveLength(2));
  });

  it('drops a photo whose bytes never arrive rather than leaving a hole in the wall', async () => {
    const { result } = open();
    await waitFor(() => expect(images.requested.length).toBe(2));

    await act(async () => {
      images.failAll();
    });
    // Usually a photo hidden between the listing and the fetch — the live-photo decision
    // (D-6) leans on moderation being fast, and this is what fast looks like downstream.
    await waitFor(() => expect(result.current.photos).toHaveLength(0));
  });

  it('empties a SHOWING scene when the social pause closes the gallery', async () => {
    // The case that matters is not a paused event the screen boots into — it is an operator
    // pausing an event already up on the wall. ADR-118 answers 503 to an actorless reader,
    // and a hall screen is one; `useAsyncData` keeps its last good data on purpose, which is
    // right for a board and would here leave the photos up after the one fast lever was
    // pulled.
    let isPaused = false;
    stub = installFetchStub({
      'GET /api/gallery/photos': () =>
        isPaused
          ? { status: 503, body: { error: { message: 'Chat and photos are paused.' } } }
          : { status: 200, body: { photos: [photo('p1')], myVoteIds: [], remainingUploads: 0 } },
    });
    images = installImageStub();
    const { result } = renderHook(() => useScreenPhotos('newest'));

    await waitFor(() => expect(images.requested.length).toBe(1));
    await act(async () => {
      images.settleAll();
    });
    await waitFor(() => expect(result.current.photos).toHaveLength(1), { timeout: 5_000 });

    isPaused = true;
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.photos).toHaveLength(0));
    // Same trap as the test at the foot of this file: a five-second wait inside a test whose
    // own budget is five seconds can never actually wait five seconds.
  }, 20_000);

  it('re-reads the listing on demand rather than holding a batch (D-6)', async () => {
    const { result } = open();
    await waitFor(() => expect(stub.callsTo('GET /api/gallery/photos')).toHaveLength(1));
    await act(async () => {
      images.settleAll();
    });

    act(() => result.current.refresh());

    // A hidden photo must not still be in the screen's hand when the scene comes round.
    await waitFor(() => expect(stub.callsTo('GET /api/gallery/photos')).toHaveLength(2));
  });

  it('ignores a batch that lands after a newer one has been accepted', async () => {
    let page = [photo('p1')];
    stub = installFetchStub({
      'GET /api/gallery/photos': () => ({
        status: 200,
        body: { photos: page, myVoteIds: [], remainingUploads: 0 },
      }),
    });
    images = installImageStub();
    const { result } = renderHook(() => useScreenPhotos('newest'));

    // A generous window on purpose: this wait is for the listing round trip, not for the
    // behaviour under test, and under a full-suite load the default second is not always
    // enough — a flake here would be noise about the machine, not news about the code.
    await waitFor(() => expect(images.requested).toEqual([expect.stringContaining('p1/thumb')]), {
      timeout: 5_000,
    });

    // The listing moves on before the first batch's bytes have arrived — a photo hidden a
    // second ago, a slow thumbnail. Both batches then resolve together, and the stale one
    // must not overwrite the fresh one: the wall would be showing the hidden photo again.
    page = [photo('p2')];
    act(() => result.current.refresh());
    await waitFor(() => expect(images.requested).toHaveLength(2), { timeout: 5_000 });

    /*
     * Settle on every attempt, not once up front. `settleAll` finishes the images that are
     * open at the instant it runs, and the hook reaches its preloads through an async chain —
     * so a batch whose request is issued a tick later than this line would never have its
     * bytes delivered, and `photos` would sit at zero until the wait expired. That is the
     * shape of the intermittent failure this test used to show under load: not a value
     * arriving slowly, but one that was never coming. Retrying the delivery alongside the
     * assertion removes the assumption without weakening what is being asserted.
     */
    await waitFor(
      () => {
        images.settleAll();
        expect(result.current.photos).toHaveLength(1);
      },
      { timeout: 5_000 },
    );
    expect(result.current.photos[0]?.id).toBe('p2');
    /*
     * The test's OWN budget, and the real reason this test failed intermittently for three
     * rounds of "raise the timeout". Each wait above asks for five seconds; vitest's default
     * budget for the whole test is also five seconds, so not one of those waits could ever be
     * spent — under a loaded machine the test died of the test timeout while a wait was still
     * patiently waiting. Raising the waits again would have changed nothing. This is the
     * number that had to move.
     */
  }, 20_000);
});
