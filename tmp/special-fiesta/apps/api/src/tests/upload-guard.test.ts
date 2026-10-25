import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GALLERY_PHOTOS_PER_UPLOADER } from '@psd/contracts';
import { sql } from 'drizzle-orm';
import { galleryPhotos } from '../db/schema/index.js';
import { getEnv, overrideEnv } from '../env.js';
import { resetGalleryTotalForTests } from '../routes-gallery/index.js';
import { createUploadGate, resetUploadGateForTests } from '../lib/uploadGate.js';
import { createTestContext, SUPERADMIN_PASSCODE, type TestContext } from './harness.js';

/**
 * ADR-324 — photos live in the database, so three things about an upload are the whole
 * app's business and not just the uploader's: how many are in flight at once (under PGlite a
 * 12 MB original is hex-encoded on the main thread, measured at 1.1 s and 1.1 GB of heap), how
 * much the gallery may hold in total (a full volume or a full database quota fails every write),
 * and whether a participant's quota can be dodged by hiding photos or by uploading in parallel.
 */
describe('createUploadGate', () => {
  it('admits up to its limit and refuses the next, freeing a slot when one finishes', async () => {
    const gate = createUploadGate({ limit: 2 });
    const first = gate.tryEnter();
    const second = gate.tryEnter();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(gate.tryEnter()).toBeNull();
    first?.();
    expect(gate.tryEnter()).not.toBeNull();
  });

  it('releases a slot only once, however many times its release is called', () => {
    const gate = createUploadGate({ limit: 1 });
    const release = gate.tryEnter();
    release?.();
    release?.();
    release?.();
    expect(gate.tryEnter()).not.toBeNull();
    expect(gate.tryEnter()).toBeNull();
  });
});

async function photoCount(ctx: TestContext): Promise<number> {
  const rows = await ctx.handle.db.select({ n: sql<number>`count(*)::int` }).from(galleryPhotos);
  return rows[0]?.n ?? 0;
}

describe('the upload route', () => {
  let ctx: TestContext;
  const defaultCeiling = getEnv().GALLERY_MAX_TOTAL_BYTES;
  beforeEach(async () => {
    overrideEnv({ GALLERY_MAX_TOTAL_BYTES: defaultCeiling });
    resetGalleryTotalForTests();
    resetUploadGateForTests();
    ctx = await createTestContext();
  });
  afterEach(async () => {
    overrideEnv({ GALLERY_MAX_TOTAL_BYTES: defaultCeiling });
    vi.restoreAllMocks();
    resetGalleryTotalForTests();
    resetUploadGateForTests();
    await ctx.close();
  });

  const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, ...new Array(48).fill(1)]);
  let counter = 0;
  function upload(headers: Record<string, string>, rawBytes = 64): RequestInit {
    counter += 1;
    const raw = new Uint8Array(rawBytes);
    raw.set(WEBP.slice(0, 64).slice(0, Math.min(64, rawBytes)));
    raw[rawBytes - 1] = counter & 0xff;
    raw[rawBytes - 2] = (counter >> 8) & 0xff;
    const form = new FormData();
    form.set('full', new Blob([WEBP], { type: 'image/webp' }), 'full.webp');
    form.set('thumb', new Blob([WEBP], { type: 'image/webp' }), 'thumb.webp');
    form.set('raw', new Blob([raw]), 'IMG.HEIC');
    form.set('filename', 'IMG.HEIC');
    form.set('caption', 'x');
    form.set('width', '10');
    form.set('height', '10');
    return { method: 'POST', headers, body: form };
  }

  it('answers 507 once the gallery holds its ceiling, and writes nothing', async () => {
    const participant = await ctx.signUpParticipant();
    overrideEnv({ GALLERY_MAX_TOTAL_BYTES: 100 });
    const first = await ctx.app.request('/api/gallery/photos', upload(participant.headers));
    expect(first.status).toBe(201);
    const second = await ctx.app.request('/api/gallery/photos', upload(participant.headers));
    expect(second.status).toBe(507);
    expect(await photoCount(ctx)).toBe(1);
  });

  it('counts a hidden photo against the uploader, so hiding photos does not buy a fresh quota', async () => {
    const participant = await ctx.signUpParticipant();
    const admin = await ctx.signInSuperadmin();
    for (let photo = 0; photo < GALLERY_PHOTOS_PER_UPLOADER; photo += 1) {
      expect((await ctx.app.request('/api/gallery/photos', upload(participant.headers))).status).toBe(201);
    }
    const list = await ctx.json<{ photos: Array<{ id: string }> }>(
      await ctx.app.request('/api/gallery/photos', { headers: admin.headers }),
    );
    const hide = await ctx.app.request(`/api/gallery/photos/${list.photos[0]?.id}/hide`, {
      method: 'POST',
      headers: admin.headers,
    });
    expect(hide.status).toBeLessThan(300);
    const again = await ctx.app.request('/api/gallery/photos', upload(participant.headers));
    expect(again.status).toBe(409);
  }, 30_000);

  it('takes a per-uploader lock around the count and the insert', async () => {
    // PGlite runs one query at a time, so the parallel test below cannot show a race even without
    // the lock; against Postgres it can. This pins the mechanism where the race cannot be shown:
    // the lock statement is issued inside the same transaction as the insert, keyed on the uploader.
    const participant = await ctx.signUpParticipant();
    const statements: string[] = [];
    const original = ctx.handle.db.transaction.bind(ctx.handle.db);
    vi.spyOn(ctx.handle.db, 'transaction').mockImplementation(((work: (tx: unknown) => Promise<unknown>, config?: unknown) =>
      (original as (w: unknown, c?: unknown) => Promise<unknown>)(async (tx: { execute: (q: unknown) => Promise<unknown> }) => {
        const execute = tx.execute.bind(tx);
        tx.execute = (query: unknown) => {
          statements.push(JSON.stringify(query));
          return execute(query);
        };
        return work(tx);
      }, config)) as never);
    const response = await ctx.app.request('/api/gallery/photos', upload(participant.headers));
    expect(response.status).toBe(201);
    expect(statements.some((text) => text.includes('pg_advisory_xact_lock') && text.includes('gallery-quota:'))).toBe(true);
  });

  it('does not let parallel uploads slip past the per-uploader quota', async () => {
    const participant = await ctx.signUpParticipant();
    const responses = await Promise.all(
      Array.from({ length: GALLERY_PHOTOS_PER_UPLOADER + 4 }, () => ctx.app.request('/api/gallery/photos', upload(participant.headers))),
    );
    const stored = responses.filter((response) => response.status === 201).length;
    expect(stored).toBeLessThanOrEqual(GALLERY_PHOTOS_PER_UPLOADER);
    expect(await photoCount(ctx)).toBeLessThanOrEqual(GALLERY_PHOTOS_PER_UPLOADER);
  }, 30_000);

  it('answers 503 to an upload that arrives while the only slot is taken, without reading its body', async () => {
    const participant = await ctx.signUpParticipant();
    const { uploadGate } = await import('../lib/uploadGate.js');
    const held = uploadGate().tryEnter();
    const taken = [held];
    for (let slot = 0; slot < 8; slot += 1) taken.push(uploadGate().tryEnter());
    try {
      const response = await ctx.app.request('/api/gallery/photos', upload(participant.headers));
      expect(response.status).toBe(503);
    } finally {
      for (const release of taken) release?.();
    }
    void SUPERADMIN_PASSCODE;
  });
});
