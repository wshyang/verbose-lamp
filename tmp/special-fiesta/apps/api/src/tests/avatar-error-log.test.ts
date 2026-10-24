import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import type * as ParticipantsModule from '../db/entities/participants.js';
import { AVATAR_SPRITE_SIZE, formatAvatarSprite } from '@psd/contracts';
import { createTestContext, withMethod, type TestContext } from './harness.js';
import { describeUnhandledError, scrubPhotos } from '../lib/errorReport.js';

/*
 * ADR-228 — a failed save that carries a photo must not write the photo to the log (N2).
 *
 * The failure is injected rather than provoked, so the test does not depend on which look the database
 * happens to refuse. It is shaped like the real one: drizzle's error carries the bound values as its params,
 * and its message quotes them. The look-check failure that found N2 came from the same path.
 */

vi.mock('../db/entities/participants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ParticipantsModule>();
  return {
    ...actual,
    updateParticipantAvatar: vi.fn(async (_db: unknown, input: { avatarPhoto?: string | null }) => {
      throw new DrizzleQueryError(
        'update "participant" set "avatar_variant" = $1, "avatar_look" = $2, "avatar_photo" = $3 where "participant"."id" = $4 returning *',
        [2, '3-1-2-1-3-1f4e9c-1d5b8c', input.avatarPhoto ?? null, 'participant-id'],
        new Error(
          'new row for relation "participant" violates check constraint "participant_avatar_look_check"',
        ),
      );
    }),
  };
});

const LOOK = '3-1-2-1-3-1f4e9c-1d5b8c';

function sprite(): string {
  const rows = Array.from({ length: AVATAR_SPRITE_SIZE }, (_row, y) =>
    (y < AVATAR_SPRITE_SIZE / 2 ? '0' : '1').repeat(AVATAR_SPRITE_SIZE),
  );
  return formatAvatarSprite({ size: AVATAR_SPRITE_SIZE, palette: ['#1d5b8c', '#12243a'], rows });
}

describe('ADR-228 — a failed save does not log the photo (N2)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('logs one report that names the constraint and does not contain the photo', async () => {
    const participant = await ctx.signUpParticipant();
    const photo = sprite();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await ctx.app.request(
        '/api/me/avatar',
        withMethod('PUT', { avatarVariant: 2, avatarLook: LOOK, avatarPhoto: photo }, participant.headers),
      );
      expect(response.status).toBe(500);

      const reports = spy.mock.calls.filter((call) => call[0] === '[api] unhandled error');
      expect(reports).toHaveLength(1);
      const logged = JSON.stringify(spy.mock.calls);
      expect(logged).not.toContain(photo);
      expect(logged).toContain('participant_avatar_look_check');
      expect(logged).toContain('Failed query: update \\"participant\\"');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('describeUnhandledError (ADR-228)', () => {
  const photo = sprite();

  it('reports the statement with its placeholders, and not the values it was run with', () => {
    const cause = Object.assign(new Error('value too long for type character varying'), {
      code: '22001',
      table: 'participant',
      column: 'avatar_photo',
      detail: `Failing row contains (1, ${photo})`,
    });
    const error = new DrizzleQueryError('update "participant" set "avatar_photo" = $1', [photo], cause);

    const report = describeUnhandledError(error);
    const text = JSON.stringify(report);

    expect(text).not.toContain(photo);
    expect(text).not.toContain('Failing row contains');
    expect(report).toMatchObject({
      query: 'update "participant" set "avatar_photo" = $1',
      message: 'Failed query: update "participant" set "avatar_photo" = $1',
      cause: { message: 'value too long for type character varying', code: '22001', column: 'avatar_photo' },
    });
  });

  it('keeps the stack frames and drops the message lines from them', () => {
    const report = describeUnhandledError(new Error(`boom with ${photo}`));
    expect(report).toMatchObject({ name: 'Error', message: 'boom with [photo]' });
    const frames = report.frames as string[];
    expect(frames.every((line) => line.startsWith('    at '))).toBe(true);
  });

  it('takes a photo out of any text that is logged, wherever it appears', () => {
    expect(scrubPhotos(`before ${photo} after`)).toBe('before [photo] after');
    expect(scrubPhotos('nothing to see')).toBe('nothing to see');
  });

  it('describes a value that is not an error without repeating it when it is text', () => {
    expect(describeUnhandledError(`thrown ${photo}`)).toEqual({ value: 'thrown [photo]' });
    expect(describeUnhandledError(42)).toEqual({ value: 'number' });
  });
});
