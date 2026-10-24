import {
  GALLERY_PHOTOS_PER_UPLOADER,
  GALLERY_RAW_MAX_BYTES,
  GALLERY_RENDITION_MAX_BYTES,
  messages,
} from '@psd/contracts';
import type { AlertsView, GalleryPageView, GalleryPhotoView } from '@psd/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { skipsCompression } from '../app.js';
import { totalBlobBytes } from '../db/entities/index.js';
import { cachedBlobBytes, forgetCachedBlobs } from '../lib/blobCache.js';
import { sniffImage } from '../lib/galleryStore.js';
import { GALLERY_TAG, invalidateTag } from '../lib/cache.js';
import { createTestContext, jsonRequest, type TestContext } from './harness.js';

/** Reads frames until one contains `needle`, then cancels. Mirrors the status-stream suite's. */
async function framesUntil(response: Response, needle: string, maxFrames = 50): Promise<string> {
  const body = response.body;
  if (!body) throw new Error('The stream had no body');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const seen: string[] = [];
  let buffered = '';
  try {
    while (seen.length < maxFrames) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      const parts = buffered.split('\n\n');
      buffered = parts.pop() ?? '';
      seen.push(...parts.filter((part) => part.trim() !== ''));
      if (seen.some((frame) => frame.includes(needle))) break;
    }
  } finally {
    await reader.cancel();
  }
  return seen.join('\n');
}


/**
 * The photo gallery (ADR-047, bytes in Postgres per ADR-048), against the real app and a real
 * database. Nothing here is mocked: the upload really parses multipart, the bytes really become
 * `bytea` rows, and the serving route really reads them back.
 */

let ctx: TestContext;

/** The smallest byte sequences that are genuinely each format, for the sniffer to recognise. */
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const NOT_AN_IMAGE = new TextEncoder().encode('<?php echo "not a photo"; ?>');

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(() => {
  // The blob cache is process-wide, so a cached entry must not leak from one test into the
  // next — several tests below turn on whether a read reached the database at all.
  forgetCachedBlobs();
});

/**
 * Every upload carries a unique `raw` by default: the SHA-1 duplicate guard (ADR-050) is global, so
 * two tests sharing raw bytes would collide with each other rather than test anything.
 */
let rawCounter = 0;
function uniqueRaw(): Uint8Array {
  rawCounter += 1;
  const bytes = new Uint8Array(64);
  bytes.set(WEBP);
  bytes[60] = rawCounter & 0xff;
  bytes[61] = (rawCounter >> 8) & 0xff;
  return bytes;
}

function upload(
  headers: Record<string, string>,
  options: {
    full?: Uint8Array;
    thumb?: Uint8Array;
    caption?: string;
    raw?: Uint8Array;
    filename?: string;
  } = {},
): RequestInit {
  const form = new FormData();
  form.set('full', new Blob([options.full ?? WEBP], { type: 'image/webp' }), 'full.webp');
  form.set('thumb', new Blob([options.thumb ?? WEBP], { type: 'image/webp' }), 'thumb.webp');
  form.set('raw', new Blob([options.raw ?? uniqueRaw()]), options.filename ?? 'IMG_0001.HEIC');
  form.set('filename', options.filename ?? 'IMG_0001.HEIC');
  form.set('caption', options.caption ?? 'On the beach');
  form.set('width', '1280');
  form.set('height', '960');
  return { method: 'POST', headers, body: form };
}

async function share(headers: Record<string, string>, caption = 'On the beach') {
  const response = await ctx.app.request('/api/gallery/photos', upload(headers, { caption }));
  expect(response.status).toBe(201);
  const body = await ctx.json<{ photo: GalleryPhotoView }>(response);
  return body.photo;
}

describe('the byte sniffer', () => {
  it('recognises the formats a phone can produce, and nothing else', () => {
    expect(sniffImage(WEBP)?.mime).toBe('image/webp');
    expect(sniffImage(PNG)?.mime).toBe('image/png');
    // A declared content type is a claim; this is the check that does not take the claim.
    expect(sniffImage(NOT_AN_IMAGE)).toBeNull();
  });
});

describe('sharing a photo', () => {
  it('stores it under the uploader with their cluster, and reports it back', async () => {
    const participant = await ctx.signUpParticipant();

    const photo = await share(participant.headers, 'Sandcastle done');

    expect(photo.caption).toBe('Sandcastle done');
    expect(photo.uploaderType).toBe('participant');
    expect(photo.uploaderLabel).toBe(participant.nickname);
    expect(photo.clusterCode).toBe(participant.clusterCode);
    expect(photo.voteCount).toBe(0);
  });

  it('serves the bytes back byte-for-byte, with an immutable cache header', async () => {
    const participant = await ctx.signUpParticipant();
    const photo = await share(participant.headers);

    const response = await ctx.app.request(`/api/gallery/photos/${photo.id}/thumb`, {
      headers: participant.headers,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    // A photo never changes and its id is in the URL, so this header is what makes the
    // hundred-phones-at-once burst survivable.
    expect(response.headers.get('cache-control')).toContain('immutable');
    // Byte-for-byte is the assertion that matters for ADR-048: `bytea` goes through a custom
    // Drizzle type, and a hex/binary encoding slip there is the classic way to corrupt every
    // photo in the event while every other test still passes.
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(WEBP);
  });

  it('round-trips bytes that would break a naive text encoding', async () => {
    const participant = await ctx.signUpParticipant();
    // A JPEG header followed by NUL, high bytes, backslash and quote — the sequences that a
    // string-based `bytea` path mangles rather than rejects.
    const nasty = new Uint8Array([
      0xff, 0xd8, 0xff, 0x00, 0x5c, 0x27, 0x22, 0xff, 0xfe, 0x0a, 0x0d, 0x1a, 0x00, 0x80, 0x7f,
    ]);

    const response = await ctx.app.request(
      '/api/gallery/photos',
      upload(participant.headers, { full: nasty, thumb: nasty }),
    );
    expect(response.status).toBe(201);
    const { photo } = await ctx.json<{ photo: GalleryPhotoView }>(response);

    const served = await ctx.app.request(`/api/gallery/photos/${photo.id}/full`, {
      headers: participant.headers,
    });
    expect(served.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(nasty);
  });

  it('lets a facilitator contribute as an official photographer', async () => {
    const facilitator = await ctx.createFacilitator();

    const photo = await share(facilitator.headers, 'Prize table');

    expect(photo.uploaderType).toBe('facilitator');
    expect(photo.uploaderLabel).toBe(facilitator.username);
    expect(photo.clusterCode).toBeNull();
  });

  it('refuses a superadmin, who moderates rather than contributes', async () => {
    const superadmin = await ctx.signInSuperadmin();

    const response = await ctx.app.request('/api/gallery/photos', upload(superadmin.headers));

    expect(response.status).toBe(403);
  });

  it('refuses a file that is not a photo, whatever it claims to be', async () => {
    const participant = await ctx.signUpParticipant();

    const response = await ctx.app.request(
      '/api/gallery/photos',
      upload(participant.headers, { full: NOT_AN_IMAGE }),
    );

    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.galleryPhotoNotAnImage);
  });

  it('refuses a rendition over the cap, because the client shrink is not a guarantee', async () => {
    const participant = await ctx.signUpParticipant();
    const tooBig = new Uint8Array(GALLERY_RENDITION_MAX_BYTES + 1);
    tooBig.set(WEBP);

    const response = await ctx.app.request(
      '/api/gallery/photos',
      upload(participant.headers, { full: tooBig }),
    );

    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.galleryPhotoTooLarge);
  });

  it('refuses a body past the upload limit with 413 and owned copy, not a 500', async () => {
    const participant = await ctx.signUpParticipant();
    // Past the whole-request ceiling, which archival raised to the raw cap plus the renditions
    // (ADR-050). This is the path a phone hits when a huge file slips past the client checks.
    const huge = new Uint8Array(GALLERY_RAW_MAX_BYTES + 1_000_000);
    huge.set(WEBP);

    const response = await ctx.app.request(
      '/api/gallery/photos',
      upload(participant.headers, { raw: huge }),
    );

    // This was a 500 saying "something went wrong on our side" until ADR-048: Hono's own
    // `HTTPException` was not handled in `app.onError`, so every framework refusal looked like a
    // server fault. Blaming the server for a caller's mistake is a bug, and so is telling a
    // participant nothing they can act on.
    expect(response.status).toBe(413);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.galleryPhotoTooLarge);
  });

  it('refuses a caption past the cap', async () => {
    const participant = await ctx.signUpParticipant();

    const response = await ctx.app.request(
      '/api/gallery/photos',
      upload(participant.headers, { caption: 'x'.repeat(200) }),
    );

    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.galleryCaptionTooLong);
  });

  it('stops a participant at their quota, which is what bounds the volume', async () => {
    const participant = await ctx.signUpParticipant();
    for (let index = 0; index < GALLERY_PHOTOS_PER_UPLOADER; index += 1) {
      await share(participant.headers, `photo ${index}`);
    }

    const response = await ctx.app.request('/api/gallery/photos', upload(participant.headers));

    expect(response.status).toBe(409);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.galleryQuotaReached);
  });

  it('refuses a signed-out uploader', async () => {
    const response = await ctx.app.request('/api/gallery/photos', upload({}));

    expect(response.status).toBe(401);
  });
});

describe('the archival original (ADR-050)', () => {
  it('keeps the original untouched, under its own filename, for a superadmin', async () => {
    const participant = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    // A HEIC-ish original: bytes this server cannot decode, which is precisely the point — the
    // archive keeps whatever the camera produced.
    const original = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 9, 9, 9]);

    const { photo } = await ctx.json<{ photo: GalleryPhotoView }>(
      await ctx.app.request(
        '/api/gallery/photos',
        upload(participant.headers, { raw: original, filename: 'IMG_4242.HEIC' }),
      ),
    );

    const archive = await ctx.app.request(`/api/gallery/photos/${photo.id}/archive`, {
      headers: superadmin.headers,
    });

    expect(archive.status).toBe(200);
    expect(archive.headers.get('content-type')).toBe('image/heic');
    expect(archive.headers.get('content-disposition')).toContain('IMG_4242.HEIC');
    // Byte-for-byte: "unaltered" is the entire promise of an archive.
    expect(new Uint8Array(await archive.arrayBuffer())).toEqual(original);
  });

  it('never serves the original through the gallery, only the compressed renditions', async () => {
    const participant = await ctx.signUpParticipant();
    const photo = await share(participant.headers, 'raw is not public');

    const response = await ctx.app.request(`/api/gallery/photos/${photo.id}/raw`, {
      headers: participant.headers,
    });

    // The public route validates against an enum that does not contain `raw`, so this cannot
    // resolve — the separation is structural, not a rule someone has to remember.
    expect(response.status).toBe(404);
  });

  it('does not let a participant or a facilitator reach the archive', async () => {
    const participant = await ctx.signUpParticipant();
    const facilitator = await ctx.createFacilitator();
    const photo = await share(participant.headers, 'corporate only');

    const asParticipant = await ctx.app.request(`/api/gallery/photos/${photo.id}/archive`, {
      headers: participant.headers,
    });
    const asFacilitator = await ctx.app.request(`/api/gallery/photos/${photo.id}/archive`, {
      headers: facilitator.headers,
    });

    expect(asParticipant.status).toBe(403);
    expect(asFacilitator.status).toBe(403);
  });

  it('still archives a photo that has been hidden from the event', async () => {
    const participant = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const photo = await share(participant.headers, 'hidden but archived');
    await ctx.app.request(
      `/api/gallery/photos/${photo.id}/hide`,
      jsonRequest({}, superadmin.headers),
    );

    const archive = await ctx.app.request(`/api/gallery/photos/${photo.id}/archive`, {
      headers: superadmin.headers,
    });

    // Hidden means hidden from the event, not deleted. An archive that silently dropped moderated
    // photos would be the wrong archive.
    expect(archive.status).toBe(200);
  });

  it('strips a filename that would break out of the content-disposition header', async () => {
    const participant = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const nasty = 'ok".txt\r\nX-Injected: yes';

    const { photo } = await ctx.json<{ photo: GalleryPhotoView }>(
      await ctx.app.request('/api/gallery/photos', upload(participant.headers, { filename: nasty })),
    );
    const archive = await ctx.app.request(`/api/gallery/photos/${photo.id}/archive`, {
      headers: superadmin.headers,
    });

    expect(archive.status).toBe(200);
    // The property that matters is that no SECOND header was created and the quoted parameter was
    // not closed early. The stray text surviving inside the filename is harmless; a CRLF or a
    // quote getting through would not be.
    expect(archive.headers.get('x-injected')).toBeNull();
    const disposition = archive.headers.get('content-disposition') ?? '';
    expect(disposition).not.toContain('\r');
    expect(disposition).not.toContain('\n');
    expect(disposition.match(/"/g) ?? []).toHaveLength(2);
    expect(disposition).toContain('ok.txt');
  });
});

describe('duplicate detection (ADR-050)', () => {
  it('refuses the same file twice, so 12 MB is not stored again', async () => {
    const participant = await ctx.signUpParticipant();
    const same = uniqueRaw();
    const first = await ctx.app.request(
      '/api/gallery/photos',
      upload(participant.headers, { raw: same }),
    );
    expect(first.status).toBe(201);

    const second = await ctx.app.request(
      '/api/gallery/photos',
      upload(participant.headers, { raw: same, caption: 'again by accident' }),
    );

    expect(second.status).toBe(409);
    const body = await ctx.json<{ error: { message: string } }>(second);
    expect(body.error.message).toBe(messages.galleryDuplicate);
  });

  it('is keyed on the RAW bytes, so a different original is never a duplicate', async () => {
    const participant = await ctx.signUpParticipant();
    // Identical served renditions, different originals: the check must follow the archive, since
    // that is what occupies the space it protects.
    const first = await ctx.app.request(
      '/api/gallery/photos',
      upload(participant.headers, { raw: uniqueRaw() }),
    );
    const second = await ctx.app.request(
      '/api/gallery/photos',
      upload(participant.headers, { raw: uniqueRaw() }),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it('catches a duplicate across uploaders, because space is shared', async () => {
    const one = await ctx.signUpParticipant();
    const two = await ctx.signUpParticipant();
    const same = uniqueRaw();
    await ctx.app.request('/api/gallery/photos', upload(one.headers, { raw: same }));

    const response = await ctx.app.request('/api/gallery/photos', upload(two.headers, { raw: same }));

    // The message deliberately does not say who shared it first.
    expect(response.status).toBe(409);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.galleryDuplicate);
    expect(body.error.message).not.toContain(one.nickname);
  });

  it('refuses an original past the archive cap with its own message', async () => {
    const participant = await ctx.signUpParticipant();
    const tooBig = new Uint8Array(GALLERY_RAW_MAX_BYTES + 1);
    tooBig.set(WEBP);

    const response = await ctx.app.request(
      '/api/gallery/photos',
      upload(participant.headers, { raw: tooBig }),
    );

    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.galleryRawTooLarge);
  });
});

describe('voting', () => {
  it('counts a like once however many times it is tapped', async () => {
    const owner = await ctx.signUpParticipant();
    const voter = await ctx.signUpParticipant();
    const photo = await share(owner.headers, 'vote on me');

    const first = await ctx.app.request(
      `/api/gallery/photos/${photo.id}/vote`,
      jsonRequest({}, voter.headers),
    );
    const second = await ctx.app.request(
      `/api/gallery/photos/${photo.id}/vote`,
      jsonRequest({}, voter.headers),
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const page = await ctx.json<GalleryPageView>(
      await ctx.app.request('/api/gallery/photos', { headers: voter.headers }),
    );
    const mine = page.photos.find((entry) => entry.id === photo.id);
    expect(mine?.voteCount).toBe(1);
    // ADR-134 — the count is on the shared photo; who liked it is on the viewer's overlay.
    expect(page.myVoteIds).toContain(photo.id);
  });

  it('takes a like back without deleting the row', async () => {
    const owner = await ctx.signUpParticipant();
    const voter = await ctx.signUpParticipant();
    const photo = await share(owner.headers, 'unvote me');
    await ctx.app.request(`/api/gallery/photos/${photo.id}/vote`, jsonRequest({}, voter.headers));

    const removed = await ctx.app.request(`/api/gallery/photos/${photo.id}/vote`, {
      method: 'DELETE',
      headers: voter.headers,
    });
    expect(removed.status).toBe(200);

    const page = await ctx.json<GalleryPageView>(
      await ctx.app.request('/api/gallery/photos', { headers: voter.headers }),
    );
    const mine = page.photos.find((entry) => entry.id === photo.id);
    expect(mine?.voteCount).toBe(0);
    expect(page.myVoteIds).not.toContain(photo.id);
  });

  /**
   * ADR-134, and the reason the change exists. It counts queries rather than comparing
   * responses, because the responses are identical either way — that is what makes this an
   * optimisation and what made the obvious version of this test worthless (ADR-131).
   *
   * Two participants, one photo wall. The first viewer builds the page; the second must be
   * served the same cached list and pay for nothing but their own vote ids.
   */
  it('builds the shared page once however many people are looking at it', async () => {
    const owner = await ctx.signUpParticipant();
    const second = await ctx.signUpParticipant();
    const photo = await share(owner.headers, 'one wall, many eyes');
    // The upload voided the tag; warm the entry so the counts below are about viewers.
    await ctx.app.request('/api/gallery/photos', { headers: owner.headers });

    const selects = vi.spyOn(ctx.handle.db, 'select');
    const countFor = async (headers: Record<string, string>): Promise<number> => {
      selects.mockClear();
      const page = await ctx.json<GalleryPageView>(
        await ctx.app.request('/api/gallery/photos', { headers }),
      );
      expect(page.photos.map((entry) => entry.id)).toContain(photo.id);
      return selects.mock.calls.length;
    };

    try {
      const onTheSharedEntry = await countFor(second.headers);
      // Voided, so the very next read has to rebuild the list and the tally from scratch.
      invalidateTag(GALLERY_TAG);
      const rebuildingIt = await countFor(second.headers);

      /*
       * Two queries fewer — the sixty-row listing and the vote tally — for an identical
       * response. That difference IS the change: before it, the page was keyed by viewer, so
       * every viewer paid those two, every poll. The absolute number is left out of the
       * assertion deliberately; it also counts the session lookup and the uploader's quota,
       * which this change does not touch and which should be free to move.
       */
      expect(rebuildingIt - onTheSharedEntry).toBe(2);
    } finally {
      selects.mockRestore();
    }
  });

  /* A like anywhere voids the shared page, or the counts on the wall would be stale for all. */
  it('rebuilds the shared page after a like, because the counts on it changed', async () => {
    const owner = await ctx.signUpParticipant();
    const voter = await ctx.signUpParticipant();
    const photo = await share(owner.headers, 'count me');
    await ctx.app.request('/api/gallery/photos', { headers: owner.headers });
    await ctx.app.request(`/api/gallery/photos/${photo.id}/vote`, jsonRequest({}, voter.headers));

    const page = await ctx.json<GalleryPageView>(
      await ctx.app.request('/api/gallery/photos', { headers: owner.headers }),
    );

    expect(page.photos.find((entry) => entry.id === photo.id)?.voteCount).toBe(1);
    // The owner did not like it; the shared count moving must not move their overlay.
    expect(page.myVoteIds).not.toContain(photo.id);
  });

  /* Staff browse the wall and cannot vote on it, so their overlay is empty by construction. */
  it('gives a facilitator an empty overlay rather than somebody else’s', async () => {
    const owner = await ctx.signUpParticipant();
    const facilitator = await ctx.createFacilitator();
    const photo = await share(owner.headers, 'staff view');
    await ctx.app.request(`/api/gallery/photos/${photo.id}/vote`, jsonRequest({}, owner.headers));

    const page = await ctx.json<GalleryPageView>(
      await ctx.app.request('/api/gallery/photos', { headers: facilitator.headers }),
    );

    expect(page.photos.find((entry) => entry.id === photo.id)?.voteCount).toBe(1);
    expect(page.myVoteIds).toEqual([]);
  });

  it('does not let staff vote — wrong party, valid session', async () => {
    const owner = await ctx.signUpParticipant();
    const facilitator = await ctx.createFacilitator();
    const photo = await share(owner.headers, 'staff cannot vote');

    const response = await ctx.app.request(
      `/api/gallery/photos/${photo.id}/vote`,
      jsonRequest({}, facilitator.headers),
    );

    expect(response.status).toBe(403);
  });
});

describe('reporting and moderation', () => {
  it('accepts one report per person and refuses the second', async () => {
    const owner = await ctx.signUpParticipant();
    const reporter = await ctx.signUpParticipant();
    const photo = await share(owner.headers, 'report me');

    const first = await ctx.app.request(
      `/api/gallery/photos/${photo.id}/report`,
      jsonRequest({}, reporter.headers),
    );
    const second = await ctx.app.request(
      `/api/gallery/photos/${photo.id}/report`,
      jsonRequest({}, reporter.headers),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it('stops serving the bytes the moment a superadmin hides it', async () => {
    const owner = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const photo = await share(owner.headers, 'hide me');

    const hidden = await ctx.app.request(
      `/api/gallery/photos/${photo.id}/hide`,
      jsonRequest({}, superadmin.headers),
    );
    expect(hidden.status).toBe(200);

    // Moderation that only removed it from a listing would not be moderation at all.
    const bytes = await ctx.app.request(`/api/gallery/photos/${photo.id}/thumb`, {
      headers: owner.headers,
    });
    expect(bytes.status).toBe(404);

    const page = await ctx.json<{ photos: GalleryPhotoView[] }>(
      await ctx.app.request('/api/gallery/photos', { headers: owner.headers }),
    );
    expect(page.photos.map((entry) => entry.id)).not.toContain(photo.id);
  });

  it('shows the moderator hidden photos and report counts, worst first', async () => {
    const owner = await ctx.signUpParticipant();
    const reporter = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const quiet = await share(owner.headers, 'nobody minds this one');
    const flagged = await share(owner.headers, 'several people mind this');
    await ctx.app.request(
      `/api/gallery/photos/${flagged.id}/report`,
      jsonRequest({}, reporter.headers),
    );

    const page = await ctx.json<{ photos: { id: string; reportCount: number }[] }>(
      await ctx.app.request('/api/gallery/moderation', { headers: superadmin.headers }),
    );

    // Reported first, because the console should open on what needs a decision.
    expect(page.photos[0]?.id).toBe(flagged.id);
    expect(page.photos[0]?.reportCount).toBe(1);
    expect(page.photos.map((entry) => entry.id)).toContain(quiet.id);
  });

  it('can put a hidden photo back, because a hide must be reversible', async () => {
    const owner = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const photo = await share(owner.headers, 'hidden then restored');
    await ctx.app.request(
      `/api/gallery/photos/${photo.id}/hide`,
      jsonRequest({}, superadmin.headers),
    );

    const restored = await ctx.app.request(
      `/api/gallery/photos/${photo.id}/unhide`,
      jsonRequest({}, superadmin.headers),
    );
    expect(restored.status).toBe(200);

    // Visible again to everyone, and its bytes are served again.
    const bytes = await ctx.app.request(`/api/gallery/photos/${photo.id}/thumb`, {
      headers: owner.headers,
    });
    expect(bytes.status).toBe(200);
  });

  /**
   * ADR-125 — the gallery's LED watermark, and the one case it would get wrong if it were taken
   * over `created_at`.
   *
   * A restored photo has a creation time in the past, so a watermark keyed on creation would let
   * it reappear in the grid without lighting anything; `visible_since` is what makes the restore
   * count. Sabotaged by setting only `hiddenAt: null` on restore — the watermark then stays at
   * the newer photo's time and the final assertion fails.
   */
  it('moves the gallery watermark when a hidden photo is restored, not just when one is shared', async () => {
    const owner = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const reader = await ctx.signUpParticipant();
    const older = await share(owner.headers, 'first in');
    const newer = await share(owner.headers, 'second in');

    const watermark = async (): Promise<string | null> => {
      const response = await ctx.app.request('/api/me/alerts', { headers: reader.headers });
      expect(response.status).toBe(200);
      return (await ctx.json<AlertsView>(response)).feeds.gallery;
    };
    expect(await watermark()).toBe(newer.createdAt);

    // Hiding the newest photo takes the watermark DOWN: a dot must not burn for something
    // nobody can open the gallery and see.
    await ctx.app.request(`/api/gallery/photos/${newer.id}/hide`, jsonRequest({}, superadmin.headers));
    expect(await watermark()).toBe(older.createdAt);

    const restored = await ctx.app.request(
      `/api/gallery/photos/${newer.id}/unhide`,
      jsonRequest({}, superadmin.headers),
    );
    expect(restored.status).toBe(200);

    // And back up past BOTH creation times, because the photo became visible just now.
    const after = await watermark();
    expect(String(after) > String(newer.createdAt)).toBe(true);
  });

  /*
   * ADR-153 — the snapshot above has always been right; the PUSH was the hole. `unhide`
   * published its activity frame and `hide` published nothing, so a phone already connected
   * kept a lit gallery dot for a photo that had been taken down, until it next reconnected.
   * Exactly the chat defect ADR-131 recorded, one wall over, and found by auditing for it.
   */
  it('pushes the lowered watermark when a photo is hidden, not only on the next snapshot', async () => {
    const owner = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const older = await share(owner.headers, 'stays up');
    const newer = await share(owner.headers, 'comes down');

    // Through the socket rather than off the bus: the frame is only worth anything if the
    // stream knows how to write it, and an unhandled kind would fall through to the default
    // arm and be delivered under the wrong event name.
    const reader = await ctx.signUpParticipant();
    const stream = await ctx.app.request('/api/status/stream', { headers: reader.headers });
    const framesPromise = framesUntil(stream, 'event: gallery.retracted');
    await ctx.app.request(
      `/api/gallery/photos/${newer.id}/hide`,
      jsonRequest({}, superadmin.headers),
    );

    /*
     * Read the retraction's OWN data line. The opening snapshot on the same socket still
     * carries the pre-hide watermark, so asserting against the whole transcript would pass
     * on the wrong frame — and would keep passing if the retraction never arrived.
     */
    const lines = (await framesPromise).split('\n');
    const at = lines.indexOf('event: gallery.retracted');
    expect(at).toBeGreaterThanOrEqual(0);
    // The surviving photo's own time — not the hidden one's, and not a fresh clock reading.
    expect(lines[at + 1]).toBe(`data: ${JSON.stringify({ at: older.createdAt })}`);
  });

  it('does not let a facilitator read the moderation console', async () => {
    const facilitator = await ctx.createFacilitator();

    const response = await ctx.app.request('/api/gallery/moderation', {
      headers: facilitator.headers,
    });

    expect(response.status).toBe(403);
  });

  it('does not let a participant hide another participant’s photo', async () => {
    const owner = await ctx.signUpParticipant();
    const bystander = await ctx.signUpParticipant();
    const photo = await share(owner.headers, 'not yours to hide');

    const response = await ctx.app.request(
      `/api/gallery/photos/${photo.id}/hide`,
      jsonRequest({}, bystander.headers),
    );

    expect(response.status).toBe(403);
  });
});

describe('the serving route', () => {
  it('refuses to climb out of the gallery directory', async () => {
    const participant = await ctx.signUpParticipant();

    // Encoded traversal in the id position: the store resolves and prefix-checks, so this can
    // only ever be a miss — never a file from somewhere else on the disk.
    const response = await ctx.app.request('/api/gallery/photos/..%2F..%2Fsnapshot/full', {
      headers: participant.headers,
    });

    expect([400, 404]).toContain(response.status);
  });

  it('404s an unknown rendition rather than guessing', async () => {
    const participant = await ctx.signUpParticipant();
    const photo = await share(participant.headers);

    const response = await ctx.app.request(`/api/gallery/photos/${photo.id}/original`, {
      headers: participant.headers,
    });

    expect(response.status).toBe(404);
  });

  it('answers a conditional request with 304 and no body', async () => {
    const participant = await ctx.signUpParticipant();
    const photo = await share(participant.headers);
    const first = await ctx.app.request(`/api/gallery/photos/${photo.id}/thumb`, {
      headers: participant.headers,
    });
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    const second = await ctx.app.request(`/api/gallery/photos/${photo.id}/thumb`, {
      headers: { ...participant.headers, 'if-none-match': etag ?? '' },
    });

    // Tier one (M3): no body, and the handler returned before touching cache or database.
    expect(second.status).toBe(304);
    expect((await second.arrayBuffer()).byteLength).toBe(0);
  });

  it('keeps the blob cache budgeted in bytes, not entries', async () => {
    const participant = await ctx.signUpParticipant();
    const photo = await share(participant.headers);
    expect(cachedBlobBytes()).toBe(0);

    await ctx.app.request(`/api/gallery/photos/${photo.id}/thumb`, {
      headers: participant.headers,
    });

    // Mitigation M4: the budget counts bytes, so 5,000 entries of 300 kB cannot quietly become
    // 1.5 GB the way an entry-counted cache would (the assessment's R4).
    expect(cachedBlobBytes()).toBe(WEBP.byteLength);
  });

  it('stops serving a hidden photo even when its bytes are already cached', async () => {
    const owner = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const photo = await share(owner.headers, 'cached then hidden');
    // Warm the cache first, so this proves visibility is checked before the cache is consulted.
    const warmed = await ctx.app.request(`/api/gallery/photos/${photo.id}/full`, {
      headers: owner.headers,
    });
    expect(warmed.status).toBe(200);

    await ctx.app.request(
      `/api/gallery/photos/${photo.id}/hide`,
      jsonRequest({}, superadmin.headers),
    );

    const afterHide = await ctx.app.request(`/api/gallery/photos/${photo.id}/full`, {
      headers: owner.headers,
    });
    expect(afterHide.status).toBe(404);
  });

  it('totals the corpus from stored sizes without reading a payload', async () => {
    const participant = await ctx.signUpParticipant();
    const before = await totalBlobBytes(ctx.handle.db);

    await share(participant.headers, 'counts toward the corpus');

    // Both served renditions plus the archival original. The point of the column is that
    // accounting never has to load a byte to answer this (M6).
    expect(await totalBlobBytes(ctx.handle.db)).toBe(before + WEBP.byteLength * 2 + 64);
  });

  it('skips gzip for the bytes but not for the listing', () => {
    // Compressing a WebP spends CPU for nothing; the JSON listing genuinely benefits.
    expect(skipsCompression('/api/gallery/photos/abc/thumb')).toBe(true);
    expect(skipsCompression('/api/gallery/photos')).toBe(false);
  });
});
