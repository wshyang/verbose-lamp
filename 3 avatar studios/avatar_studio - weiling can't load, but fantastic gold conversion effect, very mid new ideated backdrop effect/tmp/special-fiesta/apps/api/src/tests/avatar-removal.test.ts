import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AVATAR_SPRITE_SIZE, avatarSpriteId, formatAvatarSprite } from '@psd/contracts';
import { createTestContext, withMethod, type TestContext } from './harness.js';

/*
 * ADR-228 — a removed photo leaves the server at the save, and a save that does not mention the photo keeps it.
 *
 * These run against the real schema and the real route, with the sprite cache in place. The removal is
 * observed through `GET /api/avatars`, the only route that serves a face body, which is the route the
 * probe that found N1 used.
 */

const LOOK = '3-1-2-1-3-1f4e9c-1d5b8c';

function sprite(fill: string): string {
  const rows = Array.from({ length: AVATAR_SPRITE_SIZE }, () => fill.repeat(AVATAR_SPRITE_SIZE));
  // Five colours, so every fill below is an index the palette really has.
  return formatAvatarSprite({
    size: AVATAR_SPRITE_SIZE,
    palette: ['#1d5b8c', '#12243a', '#778899', '#aabbcc', '#000000'],
    rows,
  });
}

describe('ADR-228 — removing and replacing a photo on the server', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function save(headers: Record<string, string>, body: object): Promise<Response> {
    return ctx.app.request('/api/me/avatar', withMethod('PUT', body, headers));
  }

  async function served(headers: Record<string, string>, photo: string): Promise<string[]> {
    const response = await ctx.app.request(`/api/avatars?ids=${avatarSpriteId(photo)}`, { headers });
    expect(response.status).toBe(200);
    const body = await ctx.json<{ items: { sprite: string }[] }>(response);
    return body.items.map((item) => item.sprite);
  }

  it('serves nothing for a photo once it is taken off, even when the body was already cached (N1)', async () => {
    const participant = await ctx.signUpParticipant();
    const photo = sprite('0');

    expect((await save(participant.headers, { avatarVariant: 2, avatarLook: LOOK, avatarPhoto: photo })).status).toBe(200);
    // A read warms the cache with the body.
    expect(await served(participant.headers, photo)).toEqual([photo]);

    const removed = await save(participant.headers, { avatarVariant: 2, avatarLook: LOOK, avatarPhoto: null });
    expect(removed.status).toBe(200);
    expect(await served(participant.headers, photo)).toEqual([]);
  });

  it('keeps the photo when the save does not mention it, rather than taking it off (N5)', async () => {
    const participant = await ctx.signUpParticipant();
    const photo = sprite('1');
    expect((await save(participant.headers, { avatarVariant: 2, avatarLook: LOOK, avatarPhoto: photo })).status).toBe(200);

    // The key is absent, not null: a request that only changes the character must not remove the photo.
    const kept = await save(participant.headers, { avatarVariant: 3, avatarLook: LOOK });
    expect(kept.status).toBe(200);
    const body = await ctx.json<{ participant: { avatarPhotoId: string | null } }>(kept);
    expect(body.participant.avatarPhotoId).toBe(avatarSpriteId(photo));
    expect(await served(participant.headers, photo)).toEqual([photo]);
  });

  it('forgets the face it replaces, and serves the new one (N1)', async () => {
    const participant = await ctx.signUpParticipant();
    const first = sprite('2');
    const second = sprite('3');
    await save(participant.headers, { avatarVariant: 2, avatarLook: LOOK, avatarPhoto: first });
    expect(await served(participant.headers, first)).toEqual([first]);

    await save(participant.headers, { avatarVariant: 2, avatarLook: LOOK, avatarPhoto: second });

    expect(await served(participant.headers, first)).toEqual([]);
    expect(await served(participant.headers, second)).toEqual([second]);
  });

  it('keeps a face that another participant still wears when one participant takes theirs off', async () => {
    const participant = await ctx.signUpParticipant();
    const other = await ctx.signUpParticipant();
    const shared = sprite('4');
    await save(participant.headers, { avatarVariant: 2, avatarLook: LOOK, avatarPhoto: shared });
    await save(other.headers, { avatarVariant: 2, avatarLook: LOOK, avatarPhoto: shared });
    expect(await served(other.headers, shared)).toEqual([shared]);

    await save(participant.headers, { avatarVariant: 2, avatarLook: LOOK, avatarPhoto: null });

    // The row the other participant holds is still there, so the body is served again from the table.
    expect(await served(other.headers, shared)).toEqual([shared]);
  });
});
