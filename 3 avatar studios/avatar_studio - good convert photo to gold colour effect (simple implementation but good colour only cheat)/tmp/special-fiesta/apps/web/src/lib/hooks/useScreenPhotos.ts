import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GalleryPhotoView, GallerySort } from '@psd/contracts';
import { fetchGalleryPage } from '../api/gallery.js';
import { galleryImageUrl } from '../photo/galleryUrls.js';
import { preloadImage } from '../photo/imagePreload.js';
import { useAsyncData } from './useAsyncData.js';

/**
 * ADR-143 — the photos the hall screen is allowed to put on the wall.
 *
 * Two rules, both of them the result of a decision made elsewhere and both easy to lose:
 *
 * **Decoded before shown.** A scene only joins the strip once every image in it has finished
 * decoding (`imagePreload.ts`). Every frame of the filmstrip is mounted at once, so a
 * half-arrived photo is not hidden off-stage waiting its turn — it is already on the wall,
 * and the slide would scroll the room onto a broken-image glyph. While a newer batch is still
 * decoding the previous, complete batch stays up: a scene never shows a partial set, and
 * never blinks.
 *
 * **Re-read, never cached (D-6).** The listing is fetched fresh for each visit rather than a
 * batch being held across the cycle. Photos are projected live, so the only thing standing
 * between a reported photo and the wall is how quickly a hide takes effect — and a deck
 * holding yesterday's batch would still have it in hand when the scene came round again.
 * `useAsyncData` with no cache, deliberately, where every other read on this page is cached.
 */

/** How many photos a scene shows. Enough to be a wall, few enough to be legible at distance. */
export const SCREEN_PHOTO_COUNT = 3;

export interface ScreenPhotos {
  /** Complete, decoded, safe to paint. Empty means the scene is not on the strip. */
  photos: readonly GalleryPhotoView[];
  /** Pull the listing again — the deck calls this as the scene comes round. */
  refresh: () => void;
}

export function useScreenPhotos(sort: GallerySort): ScreenPhotos {
  const loader = useCallback(() => fetchGalleryPage(sort), [sort]);
  const page = useAsyncData(loader);
  const [shown, setShown] = useState<readonly GalleryPhotoView[]>([]);
  /** Guards against a slow batch landing after a newer one has already been accepted. */
  const generation = useRef(0);

  const candidates = useMemo(
    () => (page.data?.photos ?? []).slice(0, SCREEN_PHOTO_COUNT),
    [page.data],
  );

  const hasFailed = page.error !== null;

  useEffect(() => {
    const mine = generation.current + 1;
    generation.current = mine;
    /*
     * ADR-118's social pause answers 503 to an actorless reader, which a hall screen is —
     * so pausing the event takes both photo scenes off the strip at the next read. That is
     * the fast lever the live-photo decision depends on, and it only works if a failed read
     * CLEARS what is showing: `useAsyncData` keeps the last good data on purpose, which is
     * right for a board and wrong for the one control an operator reaches for in a hurry.
     */
    if (hasFailed || candidates.length === 0) {
      setShown([]);
      return;
    }
    void Promise.all(
      candidates.map(async (photo) => ({
        photo,
        isDecoded: await preloadImage(galleryImageUrl(photo.id, 'thumb')),
      })),
    ).then((results) => {
      if (generation.current !== mine) return;
      /*
       * A photo whose bytes never arrived is dropped rather than rendered as a gap: it is
       * usually one that was hidden between the listing and the fetch, which is exactly the
       * case the live-photo decision (D-6) leans on moderation to handle.
       */
      setShown(results.filter((result) => result.isDecoded).map((result) => result.photo));
    });
  }, [candidates, hasFailed]);

  return { photos: shown, refresh: page.reload };
}
