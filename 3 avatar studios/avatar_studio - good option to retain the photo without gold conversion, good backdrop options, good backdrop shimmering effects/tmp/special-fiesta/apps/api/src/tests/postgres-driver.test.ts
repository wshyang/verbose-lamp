import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../db/client.js';
import { ensureSchema } from '../db/bootstrap.js';
import { findGalleryBlob, insertGalleryBlob } from '../db/entities/galleryBlobs.js';
import { getEnv, overrideEnv, resolveDriver, type AppEnv } from '../env.js';

/**
 * The `node-postgres` driver, against a real Postgres server (ADR-051).
 *
 * **Opt-in**, because it needs a server the rest of the suite deliberately does without:
 *
 *   docker compose -f docker-compose.db.yml up -d
 *   PSD_TEST_DATABASE_URL=postgresql://psd:psd@127.0.0.1:5432/psd_active_day npm run test:api
 *
 * It exists because everything else runs on PGlite, which means the driver we would actually
 * *deploy* on had no automated coverage at all — and the two drivers genuinely differ where it
 * matters most. `pg` hands back a Node `Buffer` for `bytea` while PGlite hands back a
 * `Uint8Array`, so a photo that round-trips perfectly in the suite could still come back corrupt
 * in production. That is the case this file is here to catch.
 *
 * It cleans up the rows it writes, so it is safe to point at a development database.
 */

// Read through `env.ts`, which is the one module permitted to touch `process.env`.
const CONNECTION = getEnv().PSD_TEST_DATABASE_URL;

describe.skipIf(!CONNECTION)('the postgres driver', () => {
  let handle: DatabaseHandle;

  beforeAll(async () => {
    overrideEnv({ DATABASE_URL: CONNECTION, SUPERADMIN_INITIAL_PASSCODE: '4242' });
    handle = await openDatabase();
    await ensureSchema(handle);
  });

  afterAll(async () => {
    await handle?.close();
  });

  it('is selected by DATABASE_URL alone, with no DATABASE_DRIVER set', () => {
    // The ergonomic promise of ADR-051: one variable, not two. Forgetting the second one used to
    // mean silently running against an embedded database nobody else could see.
    const env = { DATABASE_URL: CONNECTION, DATABASE_DRIVER: undefined } as unknown as AppEnv;
    expect(resolveDriver(env)).toBe('postgres');
  });

  it('provisions the schema, and says there is nothing to do the second time', async () => {
    expect(await ensureSchema(handle)).toBe(false);
  });

  it('round-trips bytea byte-for-byte through node-postgres', async () => {
    // The bytes that break a naive text path: NUL, backslash, quote, high bytes, CR and LF.
    const payload = new Uint8Array([
      0xff, 0xd8, 0xff, 0x00, 0x5c, 0x27, 0x22, 0xff, 0xfe, 0x0a, 0x0d, 0x1a, 0x00, 0x80, 0x7f,
    ]);

    const participantId = randomUUID();
    const photoId = randomUUID();
    const sha1 = randomUUID().replace(/-/g, '') + '00000000';
    await handle.runSql(`
      insert into participant (id, nickname, pin, cluster_code, gender, avatar_variant)
        values ('${participantId}', 'pgdriver_${participantId.slice(0, 8)}', '1234',
                (select code from cluster limit 1), 'female', 1);
      insert into gallery_photo
        (id, uploader_type, participant_id, uploader_label_snapshot, caption, width, height, bytes,
         original_filename, sha1_raw, raw_byte_size)
        values ('${photoId}', 'participant', '${participantId}', 'pgdriver', '', 10, 10, 15,
                'DRIVER.HEIC', '${sha1.slice(0, 40)}', 15);
    `);

    await insertGalleryBlob(handle.db, {
      photoId,
      rendition: 'raw',
      mime: 'image/heic',
      bytes: payload,
    });
    const stored = await findGalleryBlob(handle.db, photoId, 'raw');

    // `pg` returns a Buffer here and PGlite a Uint8Array; the custom type normalises both, and
    // this is the assertion that proves it rather than assuming it.
    expect(stored).not.toBeNull();
    expect(new Uint8Array(stored?.bytes ?? [])).toEqual(payload);
    expect(stored?.mime).toBe('image/heic');

    await handle.runSql(`
      delete from gallery_blob where photo_id = '${photoId}';
      delete from gallery_photo where id = '${photoId}';
      delete from participant where id = '${participantId}';
    `);
  });
});
