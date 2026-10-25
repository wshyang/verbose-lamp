import { emptyStates } from '@psd/contracts';
import { StateMessage } from '../components/shared/StateMessage.js';
import { galleryImageUrl } from '../lib/photo/galleryUrls.js';
import { usePhotoWall } from '../lib/hooks/useGalleryModeration.js';

/**
 * ADR-047 — the big-screen photo wall, which is the feature that makes people upload: being
 * liked is how a photo gets onto it.
 *
 * This is the one surface with no shell, no navigation and no chrome, because it is pointed at a
 * projector rather than used. One photo at a time, advancing on a timer — a thumbnail grid on a
 * projector is a grid nobody at the back can see.
 *
 * It promotes fds.md §9.5's "Broadcast/display mode for leaderboard TVs" from deferred scope, and
 * carries no avatars or participant styling because it is a console surface (enforced by
 * `npm run standards`).
 */

/** Long enough to look at, short enough that a queue of photos still moves. */
const ADVANCE_MS = 8_000;

export function PhotoWallPage() {
  const wall = usePhotoWall(ADVANCE_MS);

  return (
    <main className="theme-console console-wall" data-testid="photo-wall">
      <StateMessage
        isLoading={wall.isLoading}
        error={wall.error}
        isEmpty={wall.total === 0}
        emptyText={emptyStates.photoWall}
        testId="photo-wall"
      />
      {wall.photo === null ? null : (
        <figure className="console-wall-frame">
          {/* The full rendition, not the thumb: this is the one place the big file belongs. */}
          <img
            className="console-wall-image"
            src={galleryImageUrl(wall.photo.id, 'full')}
            alt={
              wall.photo.caption === ''
                ? `Shared by ${wall.photo.uploaderLabel}`
                : wall.photo.caption
            }
            decoding="async"
          />
          <figcaption className="console-wall-caption">
            <strong>{wall.photo.uploaderLabel}</strong>
            {wall.photo.caption === '' ? null : <span> — {wall.photo.caption}</span>}
            <span className="console-muted">
              {' '}
              · {wall.photo.voteCount} {wall.photo.voteCount === 1 ? 'like' : 'likes'}
            </span>
          </figcaption>
        </figure>
      )}
    </main>
  );
}
