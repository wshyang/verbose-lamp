import { useEffect } from 'react';
import { GALLERY_CAPTION_MAX_LENGTH } from '@psd/contracts';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { useAlerts } from '../components/participant/AlertsProvider.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { SocialPausedNotice } from '../components/participant/SocialPausedNotice.js';
import { isSocialPausedError } from '../lib/socialPaused.js';
import { SocialTabs } from './SocialTabs.js';
import { galleryImageUrl } from '../lib/photo/galleryUrls.js';
import { useGallery } from '../lib/hooks/useGallery.js';
import { useLiveList } from '../lib/hooks/useLiveList.js';
import { useUploadPhoto } from '../lib/hooks/useUploadPhoto.js';

/**
 * The shared gallery (ADR-047). Thumbs first, full size only on demand.
 *
 * `loading="lazy"` is doing real work rather than ticking a box: the spike this surface has to
 * survive is a hundred people opening it within a minute of a good match, and a grid that
 * fetched every thumb eagerly would ask one laptop's Wi-Fi for all of them at once. Combined
 * with the server's `immutable` headers, a photo is fetched about once per phone per day.
 */
export function PhotosPanel() {
  const gallery = useGallery();
  /*
   * ADR-125 — looking at the wall is reading it. Keyed on the loaded state rather than on mount,
   * so a grid that has not arrived yet does not mark a watermark the participant has not seen;
   * and the store's mark only moves forward, so re-running this is free.
   */
  const { markFeedRead } = useAlerts();
  useEffect(() => {
    if (!gallery.isLoading) markFeedRead('gallery');
  }, [gallery.isLoading, markFeedRead]);
  // ADR-095 — on the "Most liked" sort every like reorders the grid, and on "Newest" an
  // upload shoves everything down a cell; FLIP makes both legible instead of a snap.
  const photoGrid = useLiveList<HTMLUListElement>();
  const upload = useUploadPhoto(gallery.reload);
  const isEmpty = gallery.photos.length === 0;
  const canShare = upload.hasPhoto && !upload.isSharing && gallery.remainingUploads > 0;

  /*
   * ADR-118 — same shape as the chat room: the tab stays, the grid does not. The uploader goes
   * with it, which matters more here than in chat — a photo accepted into a paused gallery would
   * either fail after the slow part or queue bytes nobody asked for.
   */
  if (isSocialPausedError(gallery.error)) {
    return (
      <GameboyShell title="PHOTOS" subtitle="What the day looked like">
        <SocialTabs />
        <SocialPausedNotice />
      </GameboyShell>
    );
  }

  return (
    <GameboyShell title="PHOTOS" subtitle="What the day looked like">
      <SocialTabs />

      <section className="gb-panel gb-photo-share">
        <label className="gb-button gb-button--small">
          {upload.hasPhoto ? 'Photo ready' : 'Choose a photo'}
          <input
            type="file"
            accept="image/*"
            className="gb-file"
            data-testid="photos-panel__pick"
            onChange={(event) => upload.pick(event.target.files?.[0])}
          />
        </label>
        {/*
          ADR-085 — Enter on the caption shares it. `canShare` already requires a chosen photo, so
          a stray Enter with nothing picked does nothing rather than erroring.
        */}
        <form
          data-testid="photos-panel__share-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (canShare) upload.share();
          }}
        >
          <input
            type="text"
            className="gb-input"
            placeholder="Say something about it"
            maxLength={GALLERY_CAPTION_MAX_LENGTH}
            value={upload.caption}
            onChange={(event) => upload.setCaption(event.target.value)}
            enterKeyHint="send"
            data-testid="photos-panel__caption"
          />
          {upload.error ? (
            <span className="gb-inline-error" role="alert" data-testid="photos-panel__share-error">
              {upload.error}
            </span>
          ) : null}
          <button
            type="submit"
            className="gb-button"
            disabled={!canShare}
            data-testid="photos-panel__share"
          >
            {upload.isSharing ? 'Sharing…' : 'Share it'}
          </button>
        </form>
        {/* ADR-099 — "0 left to share" is a server-counted fact; say nothing until it arrives. */}
        {gallery.isLoading ? null : (
          <span className="gb-hint" data-testid="photos-panel__remaining">
            {gallery.remainingUploads} left to share
          </span>
        )}
      </section>

      <section className="gb-panel">
        <nav className="gb-segments" aria-label="Sort photos">
          <button
            type="button"
            className={gallery.sort === 'newest' ? 'gb-chip gb-chip--on' : 'gb-chip'}
            onClick={() => gallery.setSort('newest')}
            data-testid="photos-panel__sort-newest"
          >
            Newest
          </button>
          <button
            type="button"
            className={gallery.sort === 'top' ? 'gb-chip gb-chip--on' : 'gb-chip'}
            onClick={() => gallery.setSort('top')}
            data-testid="photos-panel__sort-top"
          >
            Most liked
          </button>
        </nav>

        <StateMessage
          isLoading={gallery.isLoading}
          error={gallery.error}
          isEmpty={isEmpty}
          emptyText={gallery.emptyText}
          testId="photos-panel"
        />

        <ul className="gb-photo-grid" ref={photoGrid}>
          {gallery.photos.map((photo) => (
            <li
              key={photo.id}
              data-testid="photos-panel__photo"
              data-live-key={photo.id}
              data-live-signature={photo.voteCount}
            >
              <img
                className="gb-photo-thumb"
                src={galleryImageUrl(photo.id, 'thumb')}
                alt={photo.caption === '' ? `Photo by ${photo.uploaderLabel}` : photo.caption}
                loading="lazy"
                decoding="async"
              />
              <div className="gb-row gb-row--between">
                <strong>{photo.uploaderLabel}</strong>
                <button
                  type="button"
                  className={photo.hasMyVote ? 'gb-chip gb-chip--on' : 'gb-chip'}
                  disabled={gallery.isBusy}
                  onClick={() => gallery.toggleLike(photo)}
                  data-testid="photos-panel__like"
                >
                  {photo.hasMyVote ? '♥' : '♡'} {photo.voteCount}
                </button>
              </div>
              {photo.caption === '' ? null : <p className="gb-photo-caption">{photo.caption}</p>}
              <button
                type="button"
                className="gb-link-button"
                disabled={gallery.reportedIds.includes(photo.id)}
                onClick={() => gallery.report(photo)}
                data-testid="photos-panel__report"
              >
                {gallery.reportedIds.includes(photo.id) ? 'Reported' : 'Report'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </GameboyShell>
  );
}
