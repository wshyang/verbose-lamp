import {
  AVATAR_SPRITE_SIZE,
  avatarSpriteId,
  formatAvatarSprite,
  messages,
  PARTICIPANT_TITLES,
} from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, jsonRequest, withMethod, type TestContext } from './harness.js';

describe('F1/F2/F3 — participant signup, sign in and session', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('ADR-061: sign-up assigns an energetic title from the seeded catalogue', async () => {
    /*
     * The title is the word the app calls somebody instead of "Trainer". It is assigned by the
     * server, never sent by the client, and it has to be one of the seeded words — the column is a
     * foreign key to `participant_title`, so anything else is a constraint violation rather than a
     * surprising string on a screen.
     */
    const response = await ctx.app.request(
      '/api/auth/participants/signup',
      jsonRequest({
        nickname: `Titled_${ctx.runId}`,
        pin: '4821',
        clusterCode: 'BP',
        gender: 'male',
        avatarVariant: 2,
        avatarLook: '4-2-3-1-5-2',
        // Deliberately offered and expected to be ignored: the client does not choose this.
        title: 'Supreme Overlord',
      }),
    );

    expect(response.status).toBe(201);
    const body = await ctx.json<{ participant: { title: string } }>(response);
    expect(PARTICIPANT_TITLES).toContain(body.participant.title);
    expect(body.participant.title).not.toBe('Supreme Overlord');
  });

  it('ADR-061: the catalogue is seeded whole, and spreads across sign-ups', async () => {
    // Enough sign-ups that a single hardcoded word would be obvious, without being a stress test:
    // twelve draws from a hundred words should not all land on the same one.
    const titles = new Set<string>();
    for (let at = 0; at < 12; at += 1) {
      const participant = await ctx.signUpParticipant();
      titles.add(participant.title);
    }

    expect(titles.size).toBeGreaterThan(1);
    for (const title of titles) expect(PARTICIPANT_TITLES).toContain(title);
  });

  it('S1 #surf-signup: creates a participant and lands them with a session', async () => {
    const response = await ctx.app.request(
      '/api/auth/participants/signup',
      jsonRequest({
        nickname: `Beachkueh_${ctx.runId}`,
        pin: '4821',
        clusterCode: 'BP',
        gender: 'male',
        avatarVariant: 2,
        avatarLook: '4-2-3-1-5-2',
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('psd_session=');
    const body = await ctx.json<{ participant: { nickname: string; avatarVariant: number } }>(
      response,
    );
    expect(body.participant.nickname).toBe(`Beachkueh_${ctx.runId}`);
    expect(body.participant.avatarVariant).toBe(2);
  });

  it('rejects a duplicate nickname case-insensitively with the spec message (§4.2.9)', async () => {
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/auth/participants/signup',
      jsonRequest({
        nickname: participant.nickname.toUpperCase(),
        pin: '1111',
        clusterCode: 'CS',
        gender: 'female',
        avatarVariant: 1,
        avatarLook: '4-2-3-1-5-2',
      }),
    );
    expect(response.status).toBe(409);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.nicknameInvalid);
  });

  it('rejects a 3-digit PIN with the spec message', async () => {
    const response = await ctx.app.request(
      '/api/auth/participants/signup',
      jsonRequest({
        nickname: `Shortpin_${ctx.runId}`,
        pin: '123',
        clusterCode: 'CS',
        gender: 'female',
        avatarVariant: 1,
        avatarLook: '4-2-3-1-5-2',
      }),
    );
    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.pinInvalid);
  });

  it('F2: resumes with nickname + PIN, and refuses a wrong PIN generically', async () => {
    const participant = await ctx.signUpParticipant({ pin: '9090' });
    const ok = await ctx.app.request(
      '/api/auth/participants/signin',
      jsonRequest({ nickname: participant.nickname, pin: '9090' }),
    );
    expect(ok.status).toBe(200);

    const bad = await ctx.app.request(
      '/api/auth/participants/signin',
      jsonRequest({ nickname: participant.nickname, pin: '0000' }),
    );
    expect(bad.status).toBe(401);
    const body = await ctx.json<{ error: { message: string } }>(bad);
    expect(body.error.message).toBe(messages.signInRejected);
  });

  it('F3: /api/auth/session restores the participant from the cookie alone', async () => {
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request('/api/auth/session', {
      headers: participant.headers,
    });
    expect(response.status).toBe(200);
    const body = await ctx.json<{ actorType: string; participant: { nickname: string } }>(response);
    expect(body.actorType).toBe('participant');
    expect(body.participant.nickname).toBe(participant.nickname);
  });

  it('signs out by invalidating the session row, not deleting it', async () => {
    const participant = await ctx.signUpParticipant();
    await ctx.app.request('/api/auth/signout', {
      method: 'POST',
      headers: participant.headers,
    });
    const after = await ctx.app.request('/api/auth/session', { headers: participant.headers });
    expect(after.status).toBe(401);
  });

  it('B1: seeds all 18 clusters so signup is possible on an empty database', async () => {
    const response = await ctx.app.request('/api/clusters');
    const body = await ctx.json<{ items: unknown[] }>(response);
    expect(body.items).toHaveLength(18);
  });

  it('S4 #surf-my-profile: a participant redraws their own avatar (ADR-021)', async () => {
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/me/avatar',
      withMethod('PUT', { avatarVariant: 4, avatarLook: '8-3-10-2-4-FF00AA-012345' }, participant.headers),
    );
    expect(response.status).toBe(200);
    const body = await ctx.json<{ participant: { avatarVariant: number; avatarLook: string } }>(
      response,
    );
    // ADR-028 — the shirt and the backdrop are any colour, stored one canonical way.
    expect(body.participant).toMatchObject({ avatarVariant: 4, avatarLook: '8-3-10-2-4-ff00aa-012345' });

    const reread = await ctx.app.request('/api/me', { headers: participant.headers });
    const me = await ctx.json<{ participant: { avatarLook: string } }>(reread);
    expect(me.participant.avatarLook).toBe('8-3-10-2-4-ff00aa-012345');
  });

  it('rewrites a look code written before the colour wheel and the build (ADR-028/029)', async () => {
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/me/avatar',
      withMethod('PUT', { avatarVariant: 3, avatarLook: '3-1-2-1-9-3' }, participant.headers),
    );
    expect(response.status).toBe(200);
    const body = await ctx.json<{ participant: { avatarLook: string } }>(response);
    // Index 9 was Charcoal and index 3 was Indigo, and the build defaults to the middle
    // one: the same face, stored the way the column holds it now.
    expect(body.participant.avatarLook).toBe('3-1-2-1-3-333b49-33477a');
  });

  it('ADR-031: a participant may wear a sprite made from their own photo', async () => {
    const participant = await ctx.signUpParticipant();
    // ADR-037 — new sprites arrive at 128×128; the column and the schema must take them.
    const rows = Array.from({ length: AVATAR_SPRITE_SIZE }, () => '0'.repeat(AVATAR_SPRITE_SIZE));
    const sprite = formatAvatarSprite({
      size: AVATAR_SPRITE_SIZE,
      palette: ['#1d5b8c', '#12243a'],
      rows,
    });

    const response = await ctx.app.request(
      '/api/me/avatar',
      withMethod(
        'PUT',
        { avatarVariant: 2, avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c', avatarPhoto: sprite },
        participant.headers,
      ),
    );
    expect(response.status).toBe(200);
    const body = await ctx.json<{ participant: { avatarPhotoId: string | null } }>(response);
    // ADR-035 — the row carries the id; the sprite itself is fetched once and cached.
    expect(body.participant.avatarPhotoId).toBe(avatarSpriteId(sprite));

    const fetched = await ctx.app.request(
      `/api/avatars?ids=${avatarSpriteId(sprite)},0000000000000000`,
      { headers: participant.headers },
    );
    const sprites = await ctx.json<{ items: { id: string; sprite: string }[] }>(fetched);
    expect(sprites.items).toEqual([{ id: avatarSpriteId(sprite), sprite }]);

    // And taking the photo off puts the character back.
    const cleared = await ctx.app.request(
      '/api/me/avatar',
      withMethod(
        'PUT',
        { avatarVariant: 2, avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c', avatarPhoto: null },
        participant.headers,
      ),
    );
    const after = await ctx.json<{ participant: { avatarPhotoId: string | null } }>(cleared);
    expect(after.participant.avatarPhotoId).toBeNull();
  });

  it('ADR-037: a 64×64 sprite stored before the resolution change is still accepted', async () => {
    const participant = await ctx.signUpParticipant();
    const rows = Array.from({ length: 64 }, () => '0'.repeat(64));
    const sprite = formatAvatarSprite({ size: 64, palette: ['#1d5b8c', '#12243a'], rows });

    const response = await ctx.app.request(
      '/api/me/avatar',
      withMethod(
        'PUT',
        { avatarVariant: 2, avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c', avatarPhoto: sprite },
        participant.headers,
      ),
    );
    expect(response.status).toBe(200);
    const body = await ctx.json<{ participant: { avatarPhotoId: string | null } }>(response);
    expect(body.participant.avatarPhotoId).toBe(avatarSpriteId(sprite));
  });

  it('ADR-035: ignores ids that are not ids, and caps the batch', async () => {
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request('/api/avatars?ids=nonsense,,%20,0000000000000000', {
      headers: participant.headers,
    });

    expect(response.status).toBe(200);
    expect((await ctx.json<{ items: unknown[] }>(response)).items).toEqual([]);
  });

  /**
   * ADR-202 — the other half of ADR-046's promise. A chat room has always sent a bare
   * participant id on the stated grounds that the face resolves client-side; this is what
   * it resolves against.
   */
  it('ADR-202: answers with the identities behind a set of participant ids', async () => {
    const participant = await ctx.signUpParticipant();
    const other = await ctx.signUpParticipant();

    const response = await ctx.app.request(
      `/api/participants/identities?ids=${participant.id},${other.id}`,
      { headers: participant.headers },
    );

    expect(response.status).toBe(200);
    const body = await ctx.json<{ items: { participantId: string; nickname: string }[] }>(
      response,
    );
    expect(body.items).toHaveLength(2);
    const found = body.items.find((item) => item.participantId === other.id);
    expect(found?.nickname).toBe(other.nickname);
    // Enough to draw a face and open the peek card (ADR-062), and nothing more: no PIN and
    // no scan number, because this endpoint identifies rather than authenticates.
    expect(found).toMatchObject({
      clusterCode: expect.any(String),
      gender: expect.any(String),
      avatarVariant: expect.any(Number),
      avatarLook: expect.any(String),
      title: expect.any(String),
    });
    expect(found).not.toHaveProperty('pin');
    expect(found).not.toHaveProperty('scanNumber');
  });

  it('ADR-202: ignores ids that are not ids rather than asking the database about them', async () => {
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/participants/identities?ids=nonsense,,%20,00000000-0000-0000-0000-000000000000',
      { headers: participant.headers },
    );

    expect(response.status).toBe(200);
    // The one well-formed id belongs to nobody, so the answer is empty rather than an error:
    // a room holding an id the directory cannot place draws its fallback and carries on.
    expect((await ctx.json<{ items: unknown[] }>(response)).items).toEqual([]);
  });

  it('ADR-031: refuses anything that is not a sprite', async () => {
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/me/avatar',
      withMethod(
        'PUT',
        { avatarVariant: 1, avatarLook: '3-1-2-1-3-1f4e9c-1d5b8c', avatarPhoto: 'data:image/jpeg;base64,AAAA' },
        participant.headers,
      ),
    );
    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.avatarPhotoInvalid);
  });

  it('refuses a look the art cannot draw, at signup and at update', async () => {
    const participant = await ctx.signUpParticipant();
    const update = await ctx.app.request(
      '/api/me/avatar',
      withMethod('PUT', { avatarVariant: 1, avatarLook: '9-1-1-1-1-1' }, participant.headers),
    );
    expect(update.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(update);
    expect(body.error.message).toBe(messages.avatarLookInvalid);

    const signup = await ctx.app.request(
      '/api/auth/participants/signup',
      jsonRequest({
        nickname: `Brokenlook_${ctx.runId}`,
        pin: '1234',
        clusterCode: 'BP',
        gender: 'female',
        avatarVariant: 1,
        avatarLook: 'not-a-look',
      }),
    );
    expect(signup.status).toBe(400);
  });

  it('F18/F32: staff sign-in is generic about which half of the credential failed', async () => {
    const response = await ctx.app.request(
      '/api/auth/superadmins/signin',
      jsonRequest({ username: 'superadmin', passcode: '0001' }),
    );
    expect(response.status).toBe(401);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.credentialsRejected);
  });
});
