import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { avatarSpriteId, formatAvatarSprite } from '@psd/contracts';
import { createTestContext, withMethod, type TestContext } from './harness.js';

/**
 * ADR-324 — `GET /api/avatars` answers an id it has not seen by reading EVERY stored avatar photo
 * (up to 50 kB each) and filing them all. An id nothing matches costs that whole read every time it
 * is asked, and the route is open to any signed-in actor, so a loop of made-up ids is a full-table
 * scan per request on a database that, when embedded, does it on the main thread.
 *
 * An id that a full scan could not find is now remembered as missing — until someone saves a
 * photo, which is the only thing that can make it exist.
 */
describe('ADR-324 — avatar lookups for ids nothing matches', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => ctx.close());

  const rows = Array.from({ length: 128 }, () => '0'.repeat(128));
  const spriteWith = (colour: string) => formatAvatarSprite({ size: 128, palette: [colour, '#12243a'], rows });
  const lookup = (ids: string[], headers: Record<string, string>) => ctx.app.request(`/api/avatars?ids=${ids.join(',')}`, { headers });

  it('reads the table once for an unknown id, not once per ask', async () => {
    const viewer = await ctx.signUpParticipant();
    const select = vi.spyOn(ctx.handle.db, 'select');
    const unknown = '0123456789abcdef';
    await lookup([unknown], viewer.headers);
    const first = select.mock.calls.length;
    await lookup([unknown], viewer.headers);
    await lookup([unknown], viewer.headers);
    const later = select.mock.calls.length - first;
    select.mockRestore();
    // Each ask still reads the session; what must be gone is the table scan, which is one more.
    expect(later).toBeLessThan(first * 2);
    const perAskFirst = first;
    expect(later / 2).toBeLessThan(perAskFirst);
  });

  it('finds a face saved AFTER its id was asked about, so remembering "missing" never hides a real one', async () => {
    const viewer = await ctx.signUpParticipant();
    const owner = await ctx.signUpParticipant();
    const sprite = spriteWith('#1d5b8c');
    const id = avatarSpriteId(sprite);
    const before = await ctx.json<{ items: unknown[] }>(await lookup([id], viewer.headers));
    expect(before.items).toEqual([]);
    const saved = await ctx.app.request(
      '/api/me/avatar',
      withMethod('PUT', { avatarVariant: 2, avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c', avatarPhoto: sprite }, owner.headers),
    );
    expect(saved.status).toBe(200);
    const after = await ctx.json<{ items: Array<{ id: string }> }>(await lookup([id], viewer.headers));
    expect(after.items.map((item) => item.id)).toEqual([id]);
  });

  it('finds a face that arrived with a SIGNUP after its id was asked about', async () => {
    const viewer = await ctx.signUpParticipant();
    const sprite = spriteWith('#33aa77');
    const id = avatarSpriteId(sprite);
    expect((await ctx.json<{ items: unknown[] }>(await lookup([id], viewer.headers))).items).toEqual([]);
    await ctx.signUpParticipant({ avatarPhoto: sprite });
    const after = await ctx.json<{ items: Array<{ id: string }> }>(await lookup([id], viewer.headers));
    expect(after.items.map((item) => item.id)).toEqual([id]);
  });

  it('answers a known id from the cache, and a repeat ask costs strictly less than the first', async () => {
    const viewer = await ctx.signUpParticipant();
    const owner = await ctx.signUpParticipant();
    const sprite = spriteWith('#aa5511');
    await ctx.app.request(
      '/api/me/avatar',
      withMethod('PUT', { avatarVariant: 2, avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c', avatarPhoto: sprite }, owner.headers),
    );
    const id = avatarSpriteId(sprite);
    const select = vi.spyOn(ctx.handle.db, 'select');
    const body = await ctx.json<{ items: Array<{ sprite: string }> }>(await lookup([id], viewer.headers));
    const cold = select.mock.calls.length;
    select.mockClear();
    const again = await ctx.json<{ items: Array<{ sprite: string }> }>(await lookup([id], viewer.headers));
    const warm = select.mock.calls.length;
    select.mockRestore();
    expect(body.items[0]?.sprite).toBe(sprite);
    expect(again.items[0]?.sprite).toBe(sprite);
    expect(warm).toBeLessThan(cold);
  });
});
