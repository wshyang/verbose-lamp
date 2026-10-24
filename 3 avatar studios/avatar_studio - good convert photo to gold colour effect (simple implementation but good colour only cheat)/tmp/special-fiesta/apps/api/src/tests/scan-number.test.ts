import { DEFAULT_AVATAR_LOOK_CODE, messages } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createParticipant, findParticipantByScanNumber } from '../db/entities/index.js';
import type { NewParticipant } from '../db/entities/participants.js';
import { uniqueViolationOf } from '../db/violations.js';
import { createTestContext, jsonRequest, type TestContext } from './harness.js';

/**
 * ADR-088 — the scan number: minted at sign-up, unique, random, a string.
 *
 * The uniqueness proof is the point of this file: assignment must survive concurrent
 * sign-ups with no coordination beyond the unique index, because the insert-and-retry
 * IS the design. The retry seams (`mint`) are exercised at the entity level where a
 * collision can be staged deterministically.
 */

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

function draft(nickname: string): NewParticipant {
  return {
    nickname,
    pin: '1234',
    clusterCode: 'CS',
    gender: 'female',
    avatarVariant: 3,
    avatarLook: DEFAULT_AVATAR_LOOK_CODE,
  };
}

function signUpBody(nickname: string) {
  return {
    nickname,
    pin: '1234',
    clusterCode: 'CS',
    gender: 'female' as const,
    avatarVariant: 3,
    avatarLook: DEFAULT_AVATAR_LOOK_CODE,
  };
}

describe('minting at sign-up', () => {
  it('gives thirty concurrent sign-ups thirty distinct 4-digit strings', async () => {
    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        ctx.app.request('/api/auth/participants/signup', jsonRequest(signUpBody(`Racer_${ctx.runId}_${i}`))),
      ),
    );

    const numbers: string[] = [];
    for (const response of responses) {
      expect(response.status).toBe(201);
      const { participant } = await ctx.json<{ participant: { scanNumber: string } }>(response);
      expect(participant.scanNumber).toMatch(/^[0-9]{4}$/);
      numbers.push(participant.scanNumber);
    }
    expect(new Set(numbers).size).toBe(30);
  });

  it('retries a colliding mint with fresh randomness and keeps the second number', async () => {
    const first = await createParticipant(ctx.handle.db, draft(`Taken_${ctx.runId}`));
    // The staged collision needs TWO numbers: one the database already holds, one it does not.
    // The second is asked of the database rather than computed, because the test above has just
    // minted 30 random numbers into this same database — "adjacent to the taken one" is not the
    // same claim as "unused", and when the neighbour happened to be one of those 30 the retry
    // collided too, asked the stub for a third value it never had, and the failure surfaced as
    // `mint sequence exhausted` rather than as anything about the code under test. The odds are
    // arithmetic rather than measured — 30 draws over 10,000 numbers, so about one run in 330.
    const free = await freeScanNumber(ctx.handle.db, first.scanNumber);
    const second = await createParticipant(
      ctx.handle.db,
      draft(`Retry_${ctx.runId}`),
      // Stage the collision: the first mint hits the existing number, the next one is free.
      mintSequence([first.scanNumber, free]),
    );

    expect(second.scanNumber).not.toBe(first.scanNumber);
    expect(second.scanNumber).toMatch(/^[0-9]{4}$/);
    expect(await findParticipantByScanNumber(ctx.handle.db, second.scanNumber)).toMatchObject({
      id: second.id,
    });
  });

  it('dies loudly after five attempts rather than looping, when every mint "collides"', async () => {
    const stuck = await createParticipant(ctx.handle.db, draft(`Stuck_${ctx.runId}`));

    const error = await createParticipant(ctx.handle.db, draft(`Loser_${ctx.runId}`), () => stuck.scanNumber).then(
      () => null,
      (caught: unknown) => caught,
    );

    // The last violation surfaces as-is — a 500 with a constraint name beats a silent loop.
    expect(uniqueViolationOf(error)).toBe('ux_participant_scan_number');
  });

  it('maps a nickname race to the 409, never to a scan-number retry', async () => {
    const nickname = `Twin_${ctx.runId}`;
    // Both requests pass the friendly pre-check together; the unique index picks the winner.
    const [a, b] = await Promise.all([
      ctx.app.request('/api/auth/participants/signup', jsonRequest(signUpBody(nickname))),
      ctx.app.request('/api/auth/participants/signup', jsonRequest(signUpBody(nickname))),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });
});

describe('the all-digit nickname ban (any length, not just four)', () => {
  it.each(['123', '1234', '12345678901234567890'])('rejects %s', async (nickname) => {
    const response = await ctx.app.request(
      '/api/auth/participants/signup',
      jsonRequest(signUpBody(nickname)),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("numbers only");
  });

  it('accepts digits as long as one letter or underscore keeps the namespaces apart', async () => {
    const response = await ctx.app.request(
      '/api/auth/participants/signup',
      jsonRequest(signUpBody(`b0b${ctx.runId.slice(0, 4)}`)),
    );

    expect(response.status).toBe(201);
  });
});

describe('GET /api/staff/participants/by-number/:number', () => {
  it('resolves a number to the participant for staff — the fact the confirm dialog shows', async () => {
    const created = await createParticipant(ctx.handle.db, draft(`Found_${ctx.runId}`));
    const facilitator = await ctx.createFacilitator();

    const response = await ctx.app.request(
      `/api/staff/participants/by-number/${created.scanNumber}`,
      { headers: facilitator.headers },
    );

    expect(response.status).toBe(200);
    const body = await ctx.json<{ participant: { nickname: string; scanNumber: string } }>(response);
    expect(body.participant.nickname).toBe(created.nickname);
    expect(body.participant.scanNumber).toBe(created.scanNumber);
  });

  it('is staff-only — a participant session gets a 403, not the roster', async () => {
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request('/api/staff/participants/by-number/0001', {
      headers: participant.headers,
    });

    expect(response.status).toBe(403);
  });

  it('rejects a malformed number before touching the database', async () => {
    const facilitator = await ctx.createFacilitator();
    for (const bad of ['12a4', '123', '12345']) {
      const response = await ctx.app.request(`/api/staff/participants/by-number/${bad}`, {
        headers: facilitator.headers,
      });
      expect(response.status).toBe(400);
    }
  });

  it('answers an unknown number with the check-the-digits copy', async () => {
    const facilitator = await ctx.createFacilitator();
    // 30 participants exist at most in this file; some number is certainly free.
    const response = await ctx.app.request('/api/staff/participants/by-number/0000', {
      headers: facilitator.headers,
    });

    if (response.status === 200) return; // astronomically unlikely, but not wrong
    expect(response.status).toBe(404);
    expect(await response.text()).toContain(messages.scanNumberNotFound);
  });
});


/** Yields the staged numbers in order, then fails loudly if asked for more. */
function mintSequence(values: string[]): () => string {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (value === undefined) throw new Error('mint sequence exhausted');
    return value;
  };
}

/**
 * The first number after `taken` that this database has not issued. Needed because the staged
 * collision must collide with something real and then land on something free — and "free" is a
 * fact about the database, not about arithmetic on the taken number.
 */
async function freeScanNumber(db: typeof ctx.handle.db, taken: string): Promise<string> {
  for (let offset = 1; offset <= 100; offset += 1) {
    const candidate = String((Number(taken) + offset) % 10_000).padStart(4, '0');
    if (candidate === taken) continue;
    if ((await findParticipantByScanNumber(db, candidate)) === null) return candidate;
  }
  throw new Error(`no free scan number within 100 of ${taken}`);
}
