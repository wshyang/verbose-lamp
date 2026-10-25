import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyStates } from '@psd/contracts';
import { installFetchStub, type FetchStub } from '../test-utils/fetchStub.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { superadminSession } from '../test-utils/fixtures.js';
import { PhotoWallPage } from './PhotoWallPage.js';

/**
 * ADR-047 — the projected wall.
 *
 * Rendered through the real providers with only `fetch` stubbed, so `usePhotoWall`, the api layer and
 * `galleryImageUrl` are the real ones. The rotation is covered in `useGalleryModeration.test.ts`; what
 * matters here is what ends up on the projector — the *full* rendition rather than the thumb, a
 * caption that still reads correctly when there is no caption, and "1 like" rather than "1 likes".
 */

const PHOTOS = 'GET /api/gallery/photos';
let stub: FetchStub;

function photo(over?: { caption?: string; uploaderLabel?: string; voteCount?: number }) {
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
    createdAt: '2026-09-30T00:00:00.000Z',
    ...over,
  };
}

function wallWith(photos: unknown[]) {
  stub = installFetchStub({
    // ADR-211 — `renderWithProviders` mounts the session provider, which reads who you are
    // before the page under test does anything. Not what this file is about; still a request.
    'GET /api/auth/session': { body: superadminSession },
    [PHOTOS]: { status: 200, body: { photos, remainingUploads: 0 } },
  });
  return renderWithProviders(<PhotoWallPage />);
}

afterEach(() => stub.restore());

describe('PhotoWallPage', () => {
  it('projects the full rendition, not the thumbnail', async () => {
    wallWith([photo()]);

    const image = await screen.findByRole('img');
    // The one place the big file belongs; a thumb on a projector is the bug this guards.
    expect(image.getAttribute('src')).toContain('full');
    expect(image.getAttribute('src')).toContain('p1');
  });

  it('names the photo by its caption, for anyone reading with images off', async () => {
    wallWith([photo({ caption: 'Kite over the bay' })]);

    expect(await screen.findByAltText('Kite over the bay')).toBeVisible();
  });

  it('falls back to who shared it when there is no caption', async () => {
    wallWith([photo({ caption: '', uploaderLabel: 'Marcus_Lim' })]);

    expect(await screen.findByAltText('Shared by Marcus_Lim')).toBeVisible();
    // And the caption line shows the name alone rather than a dangling dash.
    expect(screen.getByTestId('photo-wall')).not.toHaveTextContent('—');
  });

  it('counts one like in the singular', async () => {
    wallWith([photo({ voteCount: 1 })]);

    await waitFor(() => expect(screen.getByTestId('photo-wall')).toHaveTextContent('1 like'));
    expect(screen.getByTestId('photo-wall')).not.toHaveTextContent('1 likes');
  });

  it('counts anything else in the plural', async () => {
    wallWith([photo({ voteCount: 7 })]);

    await waitFor(() => expect(screen.getByTestId('photo-wall')).toHaveTextContent('7 likes'));
  });

  it('says so when nobody has shared anything yet', async () => {
    wallWith([]);

    expect(await screen.findByText(emptyStates.photoWall)).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('reports a wall it could not load', async () => {
    stub = installFetchStub({
      'GET /api/auth/session': { body: superadminSession },
      [PHOTOS]: { status: 500, body: { error: { message: 'The gallery is unavailable.' } } },
    });
    renderWithProviders(<PhotoWallPage />);

    expect(await screen.findByText('The gallery is unavailable.')).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
