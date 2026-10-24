import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { installFetchStub, type FetchStub } from '../test-utils/fetchStub.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { GalleryModerationPage } from './GalleryModerationPage.js';

/**
 * ADR-047 — the moderation console.
 *
 * Rendered through the real providers with only `fetch` stubbed. Two decisions the page makes are easy
 * to reverse by accident, so both are pinned: hidden photos stay **listed**, because an unhide is
 * unreachable if they cannot be seen, and the action offered flips with the row's state rather than
 * both buttons existing with one disabled.
 *
 * ADR-052's archive column is asserted on both of its values. "original" versus "resized" is the only
 * way Corporate can tell which files are pristine, and a column stuck on one of them would look
 * perfectly healthy.
 */

const QUEUE = 'GET /api/gallery/moderation';
const PHOTOS = '/api/gallery/photos';
const HIDDEN_AT = '2026-09-30T03:00:00.000Z';
let stub: FetchStub;

function photo(over?: {
  hiddenAt?: string | null;
  reportCount?: number;
  rawIsOriginal?: boolean;
  uploaderType?: string;
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
    hasMyVote: false,
    createdAt: '2026-09-30T02:15:00.000Z',
    hiddenAt: null,
    reportCount: 3,
    rawIsOriginal: true,
    ...over,
  };
}

function openConsole(photos: unknown[]) {
  stub = installFetchStub({
    'GET /api/auth/session': { status: 200, body: { session: null } },
    [QUEUE]: { status: 200, body: { photos } },
    [`POST ${PHOTOS}/:id/hide`]: { status: 200, body: { photo: photo({ hiddenAt: HIDDEN_AT }) } },
    [`POST ${PHOTOS}/:id/unhide`]: { status: 200, body: { photo: photo() } },
  });
  return { user: userEvent.setup(), ...renderWithProviders(<GalleryModerationPage />) };
}

afterEach(() => stub.restore());

describe('GalleryModerationPage', () => {
  it('lists what was shared, with the thumbnail a moderator needs to judge it', async () => {
    openConsole([photo()]);

    const rows = await screen.findAllByTestId('gallery-moderation__row');
    expect(rows).toHaveLength(1);
    const image = screen.getByRole('img', { name: 'Shared by Wei_Ling' });
    // A thumb — moderating a photo you cannot see is not moderation.
    expect(image.getAttribute('src')).toContain('thumb');
    expect(screen.getByTestId('gallery-moderation__reports')).toHaveTextContent('3');
  });

  it('offers Hide for a visible photo and reports its state as visible', async () => {
    openConsole([photo()]);
    await screen.findAllByTestId('gallery-moderation__row');

    expect(screen.getByTestId('gallery-moderation__state')).toHaveTextContent('visible');
    expect(screen.getByTestId('gallery-moderation__hide')).toBeVisible();
    // Not both buttons with one disabled: the offered action *is* the state.
    expect(screen.queryByTestId('gallery-moderation__unhide')).toBeNull();
  });

  /*
   * A hidden photo must stay on the page. If it vanished, the unhide would be unreachable, which is the
   * whole reason the ADR calls the hide reversible.
   */
  it('keeps a hidden photo listed, and offers Restore instead', async () => {
    openConsole([photo({ hiddenAt: HIDDEN_AT })]);
    await screen.findAllByTestId('gallery-moderation__row');

    expect(screen.getByTestId('gallery-moderation__state')).toHaveTextContent('hidden');
    expect(screen.getByTestId('gallery-moderation__unhide')).toBeVisible();
    expect(screen.queryByTestId('gallery-moderation__hide')).toBeNull();
  });

  it('hides a photo through the server, then re-reads the queue', async () => {
    const { user } = openConsole([photo()]);
    await screen.findAllByTestId('gallery-moderation__row');
    stub.routes[QUEUE] = { status: 200, body: { photos: [photo({ hiddenAt: HIDDEN_AT })] } };

    await user.click(screen.getByTestId('gallery-moderation__hide'));

    await waitFor(() => expect(stub.callsTo(`POST ${PHOTOS}/p1/hide`)).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('gallery-moderation__unhide')).toBeVisible());
  });

  it('restores a hidden photo', async () => {
    const { user } = openConsole([photo({ hiddenAt: HIDDEN_AT })]);
    await screen.findAllByTestId('gallery-moderation__row');

    await user.click(screen.getByTestId('gallery-moderation__unhide'));

    await waitFor(() => expect(stub.callsTo(`POST ${PHOTOS}/p1/unhide`)).toHaveLength(1));
  });

  it('marks an untouched original as original', async () => {
    openConsole([photo({ rawIsOriginal: true })]);

    await waitFor(() =>
      expect(screen.getByTestId('gallery-moderation__archive')).toHaveTextContent('original'),
    );
  });

  it('marks a re-encoded original as resized', async () => {
    openConsole([photo({ rawIsOriginal: false })]);

    await waitFor(() =>
      expect(screen.getByTestId('gallery-moderation__archive')).toHaveTextContent('resized'),
    );
  });

  it('says who shared it and in what capacity', async () => {
    openConsole([photo({ uploaderType: 'facilitator' })]);
    await screen.findAllByTestId('gallery-moderation__row');

    expect(screen.getByTestId('gallery-moderation__row')).toHaveTextContent('Wei_Ling');
    expect(screen.getByTestId('gallery-moderation__row')).toHaveTextContent('facilitator');
  });

  it('says so when there is nothing to moderate', async () => {
    openConsole([]);

    expect(await screen.findByText('No photos shared yet.')).toBeVisible();
    expect(screen.queryAllByTestId('gallery-moderation__row')).toHaveLength(0);
  });

  it('reports a queue it could not read', async () => {
    stub = installFetchStub({
      'GET /api/auth/session': { status: 200, body: { session: null } },
      [QUEUE]: { status: 500, body: { error: { message: 'Moderation is unavailable.' } } },
    });
    renderWithProviders(<GalleryModerationPage />);

    expect(await screen.findByText('Moderation is unavailable.')).toBeVisible();
  });
});
