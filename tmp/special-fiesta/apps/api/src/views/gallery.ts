import type { GalleryModerationView, GalleryPhotoView } from '@psd/contracts';
import type { GalleryModerationRecord, GalleryPhotoRecord } from '../db/entities/gallery.js';
import { iso, isoOrNull } from '../lib/http.js';

/**
 * ADR-047 — a photo as a surface sees it: metadata and two numbers, never bytes.
 *
 * There is no URL in this view on purpose. The client builds
 * `/api/gallery/photos/{id}/{thumb|full}` from the id, so which rendition to fetch stays a
 * rendering decision — a grid asks for thumbs and only a tap asks for the full one, which is
 * the whole bandwidth story.
 */
export function galleryPhotoView(record: GalleryPhotoRecord): GalleryPhotoView {
  return {
    id: record.id,
    caption: record.caption,
    uploaderType: record.uploaderType,
    uploaderLabel: record.uploaderLabelSnapshot,
    uploaderParticipantId: record.participantId,
    clusterCode: record.clusterCodeSnapshot,
    width: record.width,
    height: record.height,
    voteCount: Number(record.voteCount),
    createdAt: iso(record.createdAt),
  };
}

/** The same photo with the two things only a moderator is shown. */
export function galleryModerationView(record: GalleryModerationRecord): GalleryModerationView {
  return {
    ...galleryPhotoView(record),
    hiddenAt: isoOrNull(record.hiddenAt),
    reportCount: record.reportCount,
    rawIsOriginal: record.rawIsOriginal,
  };
}
