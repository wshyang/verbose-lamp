import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';
import {
  fetchGalleryPage,
  fetchModerationQueue,
  hidePhoto,
  likePhoto,
  reportGalleryPhoto,
  unhidePhoto,
  unlikePhoto,
} from './gallery.js';

/**
 * ADR-047 — the gallery's request shapes.
 *
 * Small and deliberately literal: this module's entire job is to put the right method on the right
 * path, and that is the one thing a mocked-module test of a caller can never catch. A `like` that
 * posted to `/report` would satisfy every hook test in the tree.
 */

const PHOTOS = '/api/gallery/photos';
let stub: FetchStub;

beforeEach(() => {
  stub = installFetchStub({
    [`GET ${PHOTOS}`]: { status: 200, body: { photos: [], remainingUploads: 3 } },
    'GET /api/gallery/moderation': { status: 200, body: { photos: [] } },
    [`POST ${PHOTOS}/:id/vote`]: { status: 200, body: { ok: true } },
    [`DELETE ${PHOTOS}/:id/vote`]: { status: 200, body: { ok: true } },
    [`POST ${PHOTOS}/:id/report`]: { status: 200, body: { ok: true } },
    [`POST ${PHOTOS}/:id/hide`]: { status: 200, body: { photo: { id: 'p1' } } },
    [`POST ${PHOTOS}/:id/unhide`]: { status: 200, body: { photo: { id: 'p1' } } },
  });
});

afterEach(() => stub.restore());

describe('the gallery wire', () => {
  it('asks for a page by sort order, in the query rather than the path', async () => {
    await fetchGalleryPage('top');

    const [call] = stub.calls;
    expect(call?.method).toBe('GET');
    expect(call?.path).toBe(`${PHOTOS}?sort=top`);
  });

  it('passes the other sort through unchanged', async () => {
    await fetchGalleryPage('newest');

    expect(stub.calls[0]?.path).toBe(`${PHOTOS}?sort=newest`);
  });

  it('reads the moderation queue from its own path', async () => {
    await fetchModerationQueue();

    expect(stub.calls[0]?.path).toBe('/api/gallery/moderation');
  });

  it('likes by posting a vote', async () => {
    await likePhoto('p1');

    expect(stub.calls[0]?.method).toBe('POST');
    expect(stub.calls[0]?.path).toBe(`${PHOTOS}/p1/vote`);
  });

  /* A like and an unlike are the same resource: the method is the whole difference. */
  it('unlikes by removing the same vote', async () => {
    await unlikePhoto('p1');

    expect(stub.calls[0]?.method).toBe('DELETE');
    expect(stub.calls[0]?.path).toBe(`${PHOTOS}/p1/vote`);
  });

  it('reports a photo without touching its votes', async () => {
    await reportGalleryPhoto('p1');

    expect(stub.calls[0]?.path).toBe(`${PHOTOS}/p1/report`);
  });

  it('hides and unhides through separate paths', async () => {
    await hidePhoto('p1');
    await unhidePhoto('p1');

    expect(stub.calls.map((call) => call.path)).toEqual([
      `${PHOTOS}/p1/hide`,
      `${PHOTOS}/p1/unhide`,
    ]);
  });

  it('surfaces the server message rather than a generic failure', async () => {
    stub.restore();
    stub = installFetchStub({
      [`POST ${PHOTOS}/:id/vote`]: {
        status: 409,
        body: { error: { message: 'You have already liked that photo.' } },
      },
    });

    await expect(likePhoto('p1')).rejects.toThrow('You have already liked that photo.');
  });
});
