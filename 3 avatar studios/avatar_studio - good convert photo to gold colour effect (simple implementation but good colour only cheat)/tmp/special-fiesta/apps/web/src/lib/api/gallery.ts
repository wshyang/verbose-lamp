import type {
  GalleryModerationView,
  GalleryPageView,
  GalleryPhotoView,
  GallerySort,
} from '@psd/contracts';
import { apiGet, apiPost, apiRemove, apiUpload } from './client.js';
import type { ShrunkPhoto } from '../photo/shrinkPhoto.js';

/**
 * Gallery requests (ADR-047). Bytes never come through here — the browser fetches them as image
 * URLs, built by `lib/photo/galleryUrls.ts` so a component can use them without importing the
 * wire boundary.
 */

export function fetchGalleryPage(sort: GallerySort): Promise<GalleryPageView> {
  return apiGet(`/api/gallery/photos?sort=${sort}`);
}

export function uploadGalleryPhoto(input: {
  photo: ShrunkPhoto;
  caption: string;
}): Promise<{ photo: GalleryPhotoView }> {
  const form = new FormData();
  form.set('full', input.photo.full, 'full');
  form.set('thumb', input.photo.thumb, 'thumb');
  /**
   * ADR-050 — the untouched original, for Corporate's archive. Sent exactly as the camera produced
   * it, HEIC and all: the phone converts a copy for display but never alters what it archives.
   * The filename rides along so the archive is recognisable to a human.
   */
  form.set('raw', input.photo.raw, input.photo.filename);
  form.set('filename', input.photo.filename);
  // ADR-052 — whether `raw` is the camera's own bytes or a copy fitted to the cap.
  form.set('rawIsOriginal', String(input.photo.rawIsOriginal));
  form.set('caption', input.caption);
  form.set('width', String(input.photo.width));
  form.set('height', String(input.photo.height));
  return apiUpload('/api/gallery/photos', form);
}

export function likePhoto(photoId: string): Promise<{ ok: boolean }> {
  return apiPost(`/api/gallery/photos/${photoId}/vote`);
}

export function unlikePhoto(photoId: string): Promise<{ ok: boolean }> {
  return apiRemove(`/api/gallery/photos/${photoId}/vote`);
}

export function reportGalleryPhoto(photoId: string): Promise<{ ok: boolean }> {
  return apiPost(`/api/gallery/photos/${photoId}/report`);
}

/** Superadmin only: includes hidden photos, since an unhide is impossible without seeing them. */
export function fetchModerationQueue(): Promise<{ photos: GalleryModerationView[] }> {
  return apiGet('/api/gallery/moderation');
}

export function hidePhoto(photoId: string): Promise<{ photo: GalleryPhotoView }> {
  return apiPost(`/api/gallery/photos/${photoId}/hide`);
}

export function unhidePhoto(photoId: string): Promise<{ photo: GalleryPhotoView }> {
  return apiPost(`/api/gallery/photos/${photoId}/unhide`);
}
