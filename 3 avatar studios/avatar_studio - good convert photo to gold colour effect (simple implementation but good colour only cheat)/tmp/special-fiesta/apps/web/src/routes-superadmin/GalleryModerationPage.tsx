import { AdminShell } from './AdminShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatDateTime } from '../lib/format.js';
import { galleryImageUrl } from '../lib/photo/galleryUrls.js';
import { useGalleryModeration } from '../lib/hooks/useGalleryModeration.js';

/**
 * ADR-047 — the moderation console. Reported photos sort to the top, so this page opens on what
 * needs a decision rather than on whatever was uploaded last.
 *
 * Hidden photos are listed too, because an unhide is impossible if they cannot be seen. A hide is
 * reversible on purpose: moderation nobody can undo is a decision nobody wants to make.
 *
 * Thumbnails are shown because moderating a photo you cannot see is not moderation — but this is
 * a console surface, so there are no avatars and no participant styling here (enforced by
 * `npm run standards`).
 */
export function GalleryModerationPage() {
  const moderation = useGalleryModeration();

  return (
    <AdminShell title="Photo moderation">
      <section className="console-panel">
        <StateMessage
          isLoading={moderation.isLoading}
          error={moderation.error}
          isEmpty={moderation.photos.length === 0}
          emptyText="No photos shared yet."
          testId="gallery-moderation"
        />
        <table className="console-table">
          <thead>
            <tr>
              <th>Photo</th>
              <th>Caption</th>
              <th>By</th>
              <th>Reports</th>
              <th>Likes</th>
              <th>Archive</th>
              <th>Shared</th>
              <th>State</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {moderation.photos.map((photo) => (
              <tr key={photo.id} data-testid="gallery-moderation__row">
                <td>
                  <img
                    src={galleryImageUrl(photo.id, 'thumb')}
                    alt={`Shared by ${photo.uploaderLabel}`}
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                  />
                </td>
                <td>{photo.caption}</td>
                <td>
                  {photo.uploaderLabel}
                  <span className="console-muted"> ({photo.uploaderType})</span>
                </td>
                <td data-testid="gallery-moderation__reports">{photo.reportCount}</td>
                <td>{photo.voteCount}</td>
                {/* ADR-052 — Corporate needs to know which originals are untouched. */}
                <td data-testid="gallery-moderation__archive">
                  {photo.rawIsOriginal ? 'original' : 'resized'}
                </td>
                <td className="console-muted">{formatDateTime(photo.createdAt)}</td>
                <td data-testid="gallery-moderation__state">
                  {photo.hiddenAt === null ? 'visible' : 'hidden'}
                </td>
                <td>
                  {photo.hiddenAt === null ? (
                    <button
                      type="button"
                      className="console-button console-button--danger"
                      disabled={moderation.isBusy}
                      onClick={() => moderation.hide(photo.id)}
                      data-testid="gallery-moderation__hide"
                    >
                      Hide
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="console-button"
                      disabled={moderation.isBusy}
                      onClick={() => moderation.unhide(photo.id)}
                      data-testid="gallery-moderation__unhide"
                    >
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
