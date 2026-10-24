import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseAvatarLook } from '@psd/contracts';
import { ensureSchema } from '../db/bootstrap.js';
import { createTestContext, withMethod, type TestContext } from './harness.js';

/*
 * ADR-230 — a pattern look is saved, and a look the database refuses is a 422 that names the look.
 *
 * The check on the look was written before the pattern formats (ADR-173). ADR-205 to ADR-209 then added tagged
 * patterns, and the check was never widened, so every pattern save failed with a server error. The widened check
 * is applied at boot, so an older database is migrated by its next start. The migration test puts the old check
 * back, as it was on that database, and runs the boot again.
 */

const BASE = '3-1-2-1-3-1f4e9c-1d5b8c';
const OLD_CHECK = '^[1-9][0-9]?(-[1-9][0-9]?){4}-[0-9a-f]{6}-[0-9a-f]{6}(-[0-9a-f]{6}-[0-9]{1,2}-[0-9]{1,2})?$';

/** One look per pattern kind, each a code the contracts parser reads (checked below, not assumed). */
const PATTERN_LOOKS: Record<string, string> = {
  spiral: `${BASE}-s-f7d154-12-4`,
  'spiral with bands': `${BASE}-s-f7d154-12-4-3`,
  rings: `${BASE}-c-f7d154-2-8-6-2-3`,
  waves: `${BASE}-w-f7d154-1-16-3-10-3`,
  swirls: `${BASE}-p-f7d154-2-3-4-8-3`,
};

describe('ADR-230 — pattern looks', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it.each(Object.entries(PATTERN_LOOKS))('saves a %s look', async (_name, code) => {
    expect(parseAvatarLook(code)).not.toBeNull();
    const participant = await ctx.signUpParticipant();

    const response = await ctx.app.request(
      '/api/me/avatar',
      withMethod('PUT', { avatarVariant: 2, avatarLook: code, avatarPhoto: null }, participant.headers),
    );

    expect(response.status).toBe(200);
  });

  /*
   * A database as it was before this change has no pattern rows, because the check refused them. This test starts
   * from its own database for that reason: a pattern row written by the tests above would be a row no older
   * database can hold, and the old check cannot be restored over it.
   */
  it('refuses a look the older database does not hold as a 422 that is not logged, and saves it once migrated', async () => {
    const older = await createTestContext();
    try {
      await older.handle.runSql(
        `ALTER TABLE participant DROP CONSTRAINT IF EXISTS participant_avatar_look_check; ` +
          `ALTER TABLE participant ADD CONSTRAINT participant_avatar_look_check CHECK (avatar_look ~ '${OLD_CHECK}');`,
      );
      const participant = await older.signUpParticipant();
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const spiral = PATTERN_LOOKS['spiral'] ?? BASE;
        const refused = await older.app.request(
          '/api/me/avatar',
          withMethod('PUT', { avatarVariant: 2, avatarLook: spiral, avatarPhoto: null }, participant.headers),
        );
        expect(refused.status).toBe(422);
        const body = await older.json<{ error: { field?: string } }>(refused);
        expect(body.error.field).toBe('avatarLook');
        expect(spy).not.toHaveBeenCalled();

        // A look the old check holds still saves.
        const plain = await older.app.request(
          '/api/me/avatar',
          withMethod('PUT', { avatarVariant: 2, avatarLook: BASE, avatarPhoto: null }, participant.headers),
        );
        expect(plain.status).toBe(200);

        // The next boot applies the schema, which widens the check in place.
        await ensureSchema(older.handle);
        const saved = await older.app.request(
          '/api/me/avatar',
          withMethod('PUT', { avatarVariant: 2, avatarLook: spiral, avatarPhoto: null }, participant.headers),
        );
        expect(saved.status).toBe(200);
      } finally {
        spy.mockRestore();
      }
    } finally {
      await older.close();
    }
  });
});
