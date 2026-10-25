import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GalleryModerationView, GalleryPhotoView } from '@psd/contracts';
import { fetchGalleryPage, fetchModerationQueue, hidePhoto, unhidePhoto } from '../api/gallery.js';
import { useAction } from './useAction.js';
import { firstError, useAsyncData, usePolling } from './useAsyncData.js';

/** ADR-047 — the two console surfaces: the moderator's queue, and the projected wall. */

export interface GalleryModeration {
  photos: GalleryModerationView[];
  isLoading: boolean;
  error: string | null;
  hide: (photoId: string) => void;
  unhide: (photoId: string) => void;
  isBusy: boolean;
}

export function useGalleryModeration(): GalleryModeration {
  const loader = useCallback(() => fetchModerationQueue(), []);
  const queue = useAsyncData(loader);
  usePolling(queue.reload);

  const hideAction = useAction(hidePhoto, queue.reload);
  const unhideAction = useAction(unhidePhoto, queue.reload);

  const hide = useCallback(
    (photoId: string) => {
      void hideAction.run(photoId);
    },
    [hideAction],
  );
  const unhide = useCallback(
    (photoId: string) => {
      void unhideAction.run(photoId);
    },
    [unhideAction],
  );

  return useMemo(
    () => ({
      photos: queue.data?.photos ?? [],
      isLoading: queue.isLoading,
      error: firstError([queue.error, hideAction.error, unhideAction.error]),
      hide,
      unhide,
      isBusy: hideAction.isPending || unhideAction.isPending,
    }),
    [queue, hide, unhide, hideAction, unhideAction],
  );
}

export interface PhotoWall {
  photo: GalleryPhotoView | null;
  total: number;
  isLoading: boolean;
  error: string | null;
  next: () => void;
}

/**
 * The projected wall. It shows one photo at a time and advances on a timer, because a wall is
 * watched rather than read — a thumbnail grid on a projector is a grid nobody can see.
 *
 * It asks for `top`, which is what makes the wall a reason to upload: being liked is how a photo
 * gets onto it.
 */
export function usePhotoWall(advanceMs: number): PhotoWall {
  const [index, setIndex] = useState(0);
  const loader = useCallback(() => fetchGalleryPage('top'), []);
  const page = useAsyncData(loader);
  usePolling(page.reload);

  const photos = page.data?.photos ?? [];
  const total = photos.length;

  const next = useCallback(() => {
    setIndex((current) => current + 1);
  }, []);

  useEffect(() => {
    if (total < 2) return undefined;
    const handle = setInterval(next, advanceMs);
    return () => clearInterval(handle);
  }, [advanceMs, next, total]);

  // Modulo rather than resetting the index, so a list that shrinks between polls cannot leave
  // the wall pointing past its own end.
  const photo = total === 0 ? null : (photos[index % total] ?? null);

  return { photo, total, isLoading: page.isLoading, error: page.error, next };
}
