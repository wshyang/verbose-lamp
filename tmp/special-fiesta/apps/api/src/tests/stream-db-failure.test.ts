import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { forgetMemberships } from '../db/entities/index.js';
import { publishTeamChatMessage, resetChatBusForTests } from '../lib/chatBus.js';
import { publishTeamChatActivity, resetStatusBusForTests } from '../lib/statusBus.js';
import { uuidv7 } from 'uuidv7';
import { createTeam, createTestContext, type TestContext } from './harness.js';

/**
 * ADR-324 — a database error inside a frame fanned out to one phone's stream.
 *
 * Both streams re-read membership before writing a team frame, from a bus listener that cannot
 * await. That read used to be `void`ed, so when it rejected the rejection belonged to nobody and
 * Node 22 ended the process — taking every other phone's stream with it. The pass condition is
 * the absence of an `unhandledRejection`; the assertions on the socket say what the one phone
 * that met the failure is left with.
 */
describe('ADR-324 — a failed membership read costs one socket, not the process', () => {
  let ctx: TestContext;
  const unhandled = vi.fn();

  beforeAll(async () => {
    ctx = await createTestContext();
    process.on('unhandledRejection', unhandled);
  });
  afterAll(async () => {
    process.off('unhandledRejection', unhandled);
    await ctx.close();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetStatusBusForTests();
    resetChatBusForTests();
    unhandled.mockClear();
  });

  async function teamStream(path: string) {
    const captain = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Fail${captain.nickname.slice(-20)}`);
    const response = await ctx.app.request(path, { headers: captain.headers });
    expect(response.status).toBe(200);
    const body = response.body;
    if (!body) throw new Error('The stream had no body');
    return { teamId, reader: body.getReader() };
  }

  /**
   * Reads the opening frame, then waits for the backlog read to finish. A frame published before
   * that is buffered and flushed inside the handler's own try/catch, which is the safe path; the
   * unsafe one is a frame that arrives once the stream is live, so the stream must be live.
   */
  async function readOpening(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    await reader.read();
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  function breakTheDatabase(): void {
    vi.spyOn(ctx.handle.db, 'select').mockImplementation(() => {
      throw new Error('terminating connection due to administrator command');
    });
    forgetMemberships();
  }

  it('does not reject unhandled when a team status frame meets a dead database', async () => {
    const { teamId, reader } = await teamStream('/api/status/stream');
    await readOpening(reader);
    breakTheDatabase();

    publishTeamChatActivity(teamId, new Date());
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(unhandled).not.toHaveBeenCalled();
    await reader.cancel();
  });

  it('does not reject unhandled when a team chat message meets a dead database', async () => {
    const { teamId, reader } = await teamStream('/api/team-chat/stream');
    await readOpening(reader);
    breakTheDatabase();

    publishTeamChatMessage(teamId, {
      // A fresh UUIDv7 sorts after everything already sent, so `send` goes on to the membership read.
      id: uuidv7(),
      teamId,
      body: 'hello',
    } as never);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(unhandled).not.toHaveBeenCalled();
    await reader.cancel();
  });
});
