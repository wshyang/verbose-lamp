import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@psd/contracts';
import { installFetchStub, type FetchStub } from '../test-utils/fetchStub.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { AlertsProvider } from '../components/participant/AlertsProvider.js';

const shrinkForGallery = vi.fn();
// Canvas, which jsdom does not implement — the one browser boundary this surface needs stubbed.
vi.mock('../lib/photo/shrinkPhoto.js', () => ({
  shrinkForGallery: (...args: unknown[]) => shrinkForGallery(...args),
}));

const { PhotosPanel } = await import('./PhotosPanel.js');

/**
 * ADR-047 — the shared gallery.
 *
 * Only `fetch` and the canvas are stubbed, so `useGallery`, `useUploadPhoto`, the api layer and the
 * shell are real. The assertions favour what a screenshot would not catch: that the grid asks for
 * *thumbs* rather than full renditions, that a photo with no caption still has usable alt text, and
 * that the share button is dead for the two quite different reasons it can be.
 */

const PHOTOS = '/api/gallery/photos';
const SHRUNK = {
  full: new Blob(['full'], { type: 'image/jpeg' }),
  thumb: new Blob(['thumb'], { type: 'image/jpeg' }),
  raw: new Blob(['raw'], { type: 'image/jpeg' }),
  filename: 'beach.jpg',
  rawIsOriginal: true,
  width: 1600,
  height: 1200,
};

let stub: FetchStub;

function photo(over?: {
  id?: string;
  caption?: string;
  uploaderLabel?: string;
  voteCount?: number;
}) {
  return {
    id: 'p1',
    caption: 'Sandcastle at high tide',
    uploaderType: 'participant',
    uploaderLabel: 'Wei_Ling',
    uploaderParticipantId: 'x1',
    clusterCode: 'ITC',
    width: 1600,
    height: 1200,
    voteCount: 4,
    createdAt: '2026-09-30T00:00:00.000Z',
    ...over,
  };
}

const aPhotoFile = () => new File(['jpeg'], 'beach.jpg', { type: 'image/jpeg' });

function gallery(options?: {
  photos?: unknown[];
  /** ADR-134 — the viewer's overlay; the heart is drawn from this, not from the photo. */
  myVoteIds?: string[];
  remainingUploads?: number;
  galleryWatermark?: string;
}) {
  stub = installFetchStub({
    'GET /api/auth/session': { status: 200, body: { session: null } },
    'GET /api/me/alerts': {
      status: 200,
      body: {
        announcements: [],
        teamUpSoon: { upSoon: false, gamesAway: null, fixtureId: null },
        feeds: { chat: null, teamChat: null, gallery: options?.galleryWatermark ?? null },
      },
    },
    [`GET ${PHOTOS}`]: {
      status: 200,
      body: {
        photos: options?.photos ?? [photo()],
        myVoteIds: options?.myVoteIds ?? [],
        remainingUploads: options?.remainingUploads ?? 3,
      },
    },
    [`POST ${PHOTOS}/:id/vote`]: { status: 200, body: { ok: true } },
    [`DELETE ${PHOTOS}/:id/vote`]: { status: 200, body: { ok: true } },
    [`POST ${PHOTOS}/:id/report`]: { status: 200, body: { ok: true } },
    [`POST ${PHOTOS}`]: { status: 201, body: { photo: photo() } },
  });
  /*
   * ADR-125 — wrapped the way `App` wraps it. The panel reads the alerts store, which lives
   * above the shell rather than inside it, so rendering it bare would exercise the quiet
   * fallback instead of the real store.
   */
  return {
    user: userEvent.setup(),
    ...renderWithProviders(
      <AlertsProvider>
        <PhotosPanel />
      </AlertsProvider>,
    ),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  shrinkForGallery.mockResolvedValue(SHRUNK);
});

afterEach(() => {
  stub.restore();
  vi.clearAllMocks();
});

describe('PhotosPanel', () => {
  /*
   * ADR-125 — looking at the wall is reading it, and the mark is written on the device rather
   * than reported to the server. Keyed on the grid having loaded, so a panel still waiting for
   * photos does not claim to have seen them.
   *
   * Sabotaged by dropping the `markFeedRead('gallery')` effect: the stored mark stays at the
   * older time and the Social dot burns for photos the participant is looking at.
   */
  /*
   * ADR-125 — the Social tab's bottom-bar dot is the OR of chat and the gallery, so it cannot
   * say which half to look in. The segmented control is what answers that, and the photo dot
   * has to be on the Photos segment rather than on both.
   */
  it('lights the Photos segment, and not the Chat one, for a new photo', async () => {
    window.localStorage.setItem(
      'psd.feeds.read.v1',
      JSON.stringify({
        chat: '2026-09-30T04:00:00.000Z',
        teamChat: null,
        gallery: '2026-09-30T00:00:00.000Z',
      }),
    );
    stub = installFetchStub({
      'GET /api/auth/session': { status: 200, body: { session: null } },
      'GET /api/me/alerts': {
        status: 200,
        body: {
          announcements: [],
          teamUpSoon: false,
          feeds: {
            chat: '2026-09-30T04:00:00.000Z',
            teamChat: null,
            gallery: '2026-09-30T05:00:00.000Z',
          },
        },
      },
      // Left pending, so the panel never loads the grid and never marks the wall read —
      // which is the only way to watch the dot it is about to clear.
      [`GET ${PHOTOS}`]: { status: 200, body: { photos: [], myVoteIds: [], remainingUploads: 3 }, delayMs: 5_000 },
    });
    renderWithProviders(
      <AlertsProvider>
        <PhotosPanel />
      </AlertsProvider>,
    );

    const led = await screen.findByText('New photos');
    expect(led.closest('a')).toHaveTextContent('Photos');
    expect(screen.queryByText('Unread chat messages')).toBeNull();
  });

  it('marks the gallery read once the grid has arrived', async () => {
    window.localStorage.setItem(
      'psd.feeds.read.v1',
      JSON.stringify({ chat: null, teamChat: null, gallery: '2026-09-30T00:00:00.000Z' }),
    );
    gallery({ galleryWatermark: '2026-09-30T04:00:00.000Z' });

    await screen.findByAltText('Sandcastle at high tide');

    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem('psd.feeds.read.v1') ?? '{}') as {
          gallery: string;
        },
      ).toMatchObject({ gallery: '2026-09-30T04:00:00.000Z' }),
    );
  });

  /*
   * ADR-118 — same closure as the chat room, and the uploader goes with the grid. A photo
   * accepted into a paused gallery would either fail after the slow part — the shrink, the
   * upload, the wait — or queue bytes nobody asked for.
   */
  it('keeps the tabs and explains itself when photos are paused', async () => {
    stub = installFetchStub({
      'GET /api/auth/session': { status: 200, body: { session: null } },
      'GET /api/me/alerts': { status: 200, body: { announcements: [] } },
      [`GET ${PHOTOS}`]: { status: 503, body: { error: { message: messages.socialPaused } } },
    });
    renderWithProviders(<PhotosPanel />);

    expect(await screen.findByTestId('social-paused')).toHaveTextContent(messages.socialPaused);
    expect(screen.getAllByTestId('social-tabs__link').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('photos-panel__pick')).toBeNull();
  });

  it('still shows an ordinary failure as a failure, not as a pause', async () => {
    stub = installFetchStub({
      'GET /api/auth/session': { status: 200, body: { session: null } },
      'GET /api/me/alerts': { status: 200, body: { announcements: [] } },
      [`GET ${PHOTOS}`]: { status: 500, body: { error: { message: 'Boom.' } } },
    });
    renderWithProviders(<PhotosPanel />);

    expect(await screen.findByTestId('photos-panel__error')).toHaveTextContent('Boom.');
    expect(screen.queryByTestId('social-paused')).toBeNull();
  });

  it('shows the grid, asking for thumbs rather than full renditions', async () => {
    gallery();

    const rows = await screen.findAllByTestId('photos-panel__photo');
    expect(rows).toHaveLength(1);
    const image = screen.getByRole('img', { name: 'Sandcastle at high tide' });
    // The spike here is a hundred phones at once — full files in the grid would be the bug.
    expect(image.getAttribute('src')).toContain('thumb');
    expect(image).toHaveAttribute('loading', 'lazy');
  });

  it('gives a captionless photo an alt text somebody can still use', async () => {
    gallery({ photos: [photo({ caption: '', uploaderLabel: 'Marcus_Lim' })] });

    expect(await screen.findByAltText('Photo by Marcus_Lim')).toBeVisible();
  });

  it('likes a photo', async () => {
    const { user } = gallery();
    await screen.findAllByTestId('photos-panel__photo');

    await user.click(screen.getByTestId('photos-panel__like'));

    await waitFor(() => expect(stub.callsTo(`POST ${PHOTOS}/p1/vote`)).toHaveLength(1));
  });

  /* A like and an unlike are the same resource; only the method differs. */
  it('unlikes one it had already liked', async () => {
    const { user } = gallery({ myVoteIds: ['p1'] });
    await screen.findAllByTestId('photos-panel__photo');
    expect(screen.getByTestId('photos-panel__like')).toHaveTextContent('♥');

    await user.click(screen.getByTestId('photos-panel__like'));

    await waitFor(() => expect(stub.callsTo(`DELETE ${PHOTOS}/p1/vote`)).toHaveLength(1));
  });

  it('reports a photo once, then says so instead of offering again', async () => {
    const { user } = gallery();
    await screen.findAllByTestId('photos-panel__photo');

    await user.click(screen.getByTestId('photos-panel__report'));

    await waitFor(() => expect(stub.callsTo(`POST ${PHOTOS}/p1/report`)).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('photos-panel__report')).toBeDisabled());
    expect(screen.getByTestId('photos-panel__report')).toHaveTextContent('Reported');
  });

  it('switches the sort, and asks the server for it rather than re-ordering locally', async () => {
    const { user } = gallery();
    await screen.findAllByTestId('photos-panel__photo');

    await user.click(screen.getByTestId('photos-panel__sort-top'));

    await waitFor(() =>
      expect(stub.calls.some((call) => call.path.includes('sort=top'))).toBe(true),
    );
  });

  it('will not share until a photo has been picked', async () => {
    gallery();

    expect(await screen.findByTestId('photos-panel__share')).toBeDisabled();
    expect(screen.getByTestId('photos-panel__remaining')).toHaveTextContent('3 left to share');
  });

  it('says nothing about uploads left until the server has counted (ADR-099)', async () => {
    stub = installFetchStub({
      'GET /api/auth/session': { status: 200, body: { session: null } },
      'GET /api/me/alerts': { status: 200, body: { announcements: [] } },
      [`GET ${PHOTOS}`]: {
        status: 200,
        body: { photos: [photo()], myVoteIds: [], remainingUploads: 3 },
        delayMs: 20,
      },
    });
    renderWithProviders(<PhotosPanel />);

    // In flight: no flash of "0 left to share" before the server has said a number.
    expect(screen.queryByTestId('photos-panel__remaining')).toBeNull();

    await screen.findAllByTestId('photos-panel__photo');
    expect(screen.getByTestId('photos-panel__remaining')).toHaveTextContent('3 left to share');
  });

  it('enables sharing once a photo is chosen', async () => {
    const { user } = gallery();
    await screen.findAllByTestId('photos-panel__photo');

    await user.upload(screen.getByTestId('photos-panel__pick'), aPhotoFile());

    await waitFor(() => expect(screen.getByTestId('photos-panel__share')).toBeEnabled());
  });

  /*
   * Two different reasons the button is dead, which must not be confused: nothing picked, or the
   * day's allowance spent. The second stays disabled even with a photo ready to go.
   */
  it('stays disabled when the allowance is spent, photo or no photo', async () => {
    const { user } = gallery({ remainingUploads: 0 });
    await screen.findAllByTestId('photos-panel__photo');

    await user.upload(screen.getByTestId('photos-panel__pick'), aPhotoFile());

    expect(screen.getByTestId('photos-panel__share')).toBeDisabled();
    expect(screen.getByTestId('photos-panel__remaining')).toHaveTextContent('0 left to share');
  });

  it('shares the picked photo and re-reads the grid', async () => {
    const { user } = gallery();
    await screen.findAllByTestId('photos-panel__photo');
    await user.upload(screen.getByTestId('photos-panel__pick'), aPhotoFile());
    await waitFor(() => expect(screen.getByTestId('photos-panel__share')).toBeEnabled());

    await user.click(screen.getByTestId('photos-panel__share'));

    await waitFor(() => expect(stub.callsTo(`POST ${PHOTOS}`)).toHaveLength(1));
    // Re-read rather than patched, so the server's view of the gallery is the one shown.
    await waitFor(() =>
      expect(stub.calls.filter((call) => call.path.startsWith(`${PHOTOS}?`)).length).toBeGreaterThan(1),
    );
  });

  it('announces a refused share where a screen reader will hear it', async () => {
    const { user } = gallery();
    await screen.findAllByTestId('photos-panel__photo');
    stub.routes[`POST ${PHOTOS}`] = {
      status: 413,
      body: { error: { message: 'That photo is too large.' } },
    };
    await user.upload(screen.getByTestId('photos-panel__pick'), aPhotoFile());
    await waitFor(() => expect(screen.getByTestId('photos-panel__share')).toBeEnabled());

    await user.click(screen.getByTestId('photos-panel__share'));

    const alert = await screen.findByTestId('photos-panel__share-error');
    expect(alert).toHaveTextContent('That photo is too large.');
    expect(alert).toHaveAttribute('role', 'alert');
  });

  it('shows the share form even when nobody has shared anything', async () => {
    gallery({ photos: [] });

    await waitFor(() => expect(screen.queryAllByTestId('photos-panel__photo')).toHaveLength(0));
    expect(screen.getByTestId('photos-panel__remaining')).toBeVisible();
    expect(screen.getByTestId('photos-panel__pick')).toBeInTheDocument();
  });
});
