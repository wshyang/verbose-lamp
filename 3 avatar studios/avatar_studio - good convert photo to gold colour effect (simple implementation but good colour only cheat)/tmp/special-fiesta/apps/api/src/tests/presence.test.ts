import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { participants, sessions } from '../db/schema/index.js';
import { flushPresence, resetPresence } from '../lib/presence.js';
import { createTestContext, type ParticipantSession, type TestContext } from './harness.js';

/**
 * ADR-082 — presence is batched. The request path must not write `last_seen_at`; the flush
 * must stamp exactly the actors that were seen; and a failed flush must lose nothing. These
 * tests read the real rows before and after, because the whole point of the change is what
 * does and does not reach the database.
 */

describe('presence batching', () => {
  let ctx: TestContext;
  let me: ParticipantSession;

  beforeAll(async () => {
    ctx = await createTestContext();
    me = await ctx.signUpParticipant();
  });

  beforeEach(() => {
    resetPresence();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function participantSeenAt(id: string): Promise<Date> {
    const [row] = await ctx.handle.db
      .select({ lastSeenAt: participants.lastSeenAt })
      .from(participants)
      .where(eq(participants.id, id));
    expect(row).toBeDefined();
    return row!.lastSeenAt;
  }

  async function sessionSeenAt(participantId: string): Promise<Date> {
    const [row] = await ctx.handle.db
      .select({ lastSeenAt: sessions.lastSeenAt })
      .from(sessions)
      .where(eq(sessions.participantId, participantId));
    expect(row).toBeDefined();
    return row!.lastSeenAt;
  }

  it('authenticated requests write no last_seen_at; the flush stamps both rows', async () => {
    const participantBefore = await participantSeenAt(me.id);
    const sessionBefore = await sessionSeenAt(me.id);

    for (let call = 0; call < 3; call += 1) {
      const response = await ctx.app.request('/api/me', { headers: me.headers });
      expect(response.status).toBe(200);
    }

    // Three authenticated requests later, neither row has moved.
    expect((await participantSeenAt(me.id)).getTime()).toBe(participantBefore.getTime());
    expect((await sessionSeenAt(me.id)).getTime()).toBe(sessionBefore.getTime());

    await new Promise((resolve) => setTimeout(resolve, 5));
    await flushPresence(ctx.handle.db);

    expect((await participantSeenAt(me.id)).getTime()).toBeGreaterThan(participantBefore.getTime());
    expect((await sessionSeenAt(me.id)).getTime()).toBeGreaterThan(sessionBefore.getTime());
  });

  it('stamps only the actors that were actually seen', async () => {
    const bystander = await ctx.signUpParticipant();
    resetPresence(); // signup itself signs in; this test is about the window after it

    const bystanderBefore = await participantSeenAt(bystander.id);
    const response = await ctx.app.request('/api/me', { headers: me.headers });
    expect(response.status).toBe(200);
    await flushPresence(ctx.handle.db);

    expect((await participantSeenAt(bystander.id)).getTime()).toBe(bystanderBefore.getTime());
  });

  it('an empty interval flushes without touching the database', async () => {
    await expect(flushPresence(ctx.handle.db)).resolves.toBeUndefined();
  });

  it('a failed flush keeps its ids and the next flush delivers them', async () => {
    const before = await participantSeenAt(me.id);
    const response = await ctx.app.request('/api/me', { headers: me.headers });
    expect(response.status).toBe(200);

    const broken = {
      update: () => {
        throw new Error('database is having a moment');
      },
    } as unknown as Executor;
    await flushPresence(broken); // logs and retains; never throws

    expect((await participantSeenAt(me.id)).getTime()).toBe(before.getTime());

    await new Promise((resolve) => setTimeout(resolve, 5));
    await flushPresence(ctx.handle.db);
    expect((await participantSeenAt(me.id)).getTime()).toBeGreaterThan(before.getTime());
  });
});
