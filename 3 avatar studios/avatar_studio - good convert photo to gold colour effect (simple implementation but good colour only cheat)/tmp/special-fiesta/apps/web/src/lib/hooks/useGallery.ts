import { useCallback, useMemo, useState } from 'react';
import { emptyStates } from '@psd/contracts';
import type { GalleryPhotoView, GallerySort } from '@psd/contracts';
import { fetchGalleryPage, likePhoto, reportGalleryPhoto, unlikePhoto } from '../api/gallery.js';
import { useAction } from './useAction.js';
import { firstError, POLL_MIN_MS, usePolling } from './useAsyncData.js';
import { useLocalCachedData } from './useLocalCachedData.js';

/**
 * The photo gallery (ADR-047). The panel renders a grid; every decision about what is in it,
 * what order it is in, and what a tap does lives here.
 *
 * Polling stays on the jittered 45–75 s cadence (ADR-024) rather than anything faster. A gallery
 * is not a conversation — latency is not the product — and every authenticated request already
 * costs two writes before the handler runs, so a faster poll would buy nothing and cost real
 * database time.
 */

/**
 * ADR-134 — the shared photo with this viewer's answer folded back on.
 *
 * The server stopped sending `hasMyVote` per photo so that one cached list can serve the whole
 * room; the overlay arrives as `myVoteIds` on the same response. It is folded in HERE, once,
 * rather than in the grid: `myVoteIds.includes(photo.id)` inside a `map` is a linear scan per
 * tile — sixty tiles against a few hundred likes — re-run on every single render.
 */
export interface GalleryPhoto extends GalleryPhotoView {
  hasMyVote: boolean;
}

export interface PhotoGallery {
  photos: GalleryPhoto[];
  isLoading: boolean;
  error: string | null;
  emptyText: string;
  sort: GallerySort;
  setSort: (sort: GallerySort) => void;
  remainingUploads: number;
  toggleLike: (photo: GalleryPhoto) => void;
  report: (photo: GalleryPhotoView) => void;
  reportedIds: readonly string[];
  isBusy: boolean;
  reload: () => void;
}

export function useGallery(): PhotoGallery {
  const [sort, setSort] = useState<GallerySort>('newest');
  const [reportedIds, setReportedIds] = useState<string[]>([]);

  const loader = useCallback(() => fetchGalleryPage(sort), [sort]);
  const page = useLocalCachedData({
    name: `gallery.${sort}`,
    loader,
    // ADR-113: a poll will revalidate at this floor; reopening does not have to beat it.
    ttlMs: POLL_MIN_MS,
  });
  usePolling(page.reload);

  // A vote/report is an explicit action: its follow-up reload always bypasses the snapshot.
  const like = useAction(likePhoto, page.reload);
  const unlike = useAction(unlikePhoto, page.reload);
  const report = useAction(reportGalleryPhoto, (_result, photoId) => {
    // Remembered locally so the button can say "reported" straight away; the server's own
    // uniqueness rule is what actually prevents a second one.
    setReportedIds((current) => [...current, photoId]);
  });

  const toggleLike = useCallback(
    (photo: GalleryPhoto) => {
      void (photo.hasMyVote ? unlike.run(photo.id) : like.run(photo.id));
    },
    [like, unlike],
  );

  const reportPhoto = useCallback(
    (photo: GalleryPhotoView) => {
      void report.run(photo.id);
    },
    [report],
  );

  /*
   * One `Set` per answer, not one `includes` per tile per render. Memoised on the page so a
   * poll that returns the same object does not rebuild sixty objects and re-render the grid.
   */
  const photos = useMemo(() => {
    const mine = new Set(page.data?.myVoteIds ?? []);
    return (page.data?.photos ?? []).map((photo) => ({ ...photo, hasMyVote: mine.has(photo.id) }));
  }, [page.data]);

  return useMemo(
    () => ({
      photos,
      isLoading: page.isLoading,
      error: firstError([page.error, like.error, unlike.error, report.error]),
      emptyText: emptyStates.photoGallery,
      sort,
      setSort,
      remainingUploads: page.data?.remainingUploads ?? 0,
      toggleLike,
      report: reportPhoto,
      reportedIds,
      isBusy: like.isPending || unlike.isPending || report.isPending,
      reload: page.reload,
    }),
    [page, photos, sort, toggleLike, reportPhoto, reportedIds, like, unlike, report],
  );
}
