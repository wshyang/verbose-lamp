import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addTeamMember,
  announceRosterEvent,
  createTeamWithCaptain,
  invalidateMembership,
} from '../db/entities/teams.js';
import { latestTeamChatActivity } from '../db/entities/teamChat.js';
import { newId } from '../db/ids.js';
import { teamChatMessages } from '../db/schema/chat.js';
import { subscribeToTeamChat } from '../lib/chatBus.js';
import { subscribeToTeamStatus, type TeamStatusFrame } from '../lib/statusBus.js';
import { createTestContext, type TestContext } from './harness.js';

/**
 * ADR-130 — a roster line is a message in the room, so it must raise the dot like one.
 *
 * The audit that found this compared two call sites answering the same question.
 * `routes-team-chat` publishes a `team.chat.message` frame AND a `team.chat.activity`
 * watermark; `createTeamWithCaptain`, `addTeamMember` and `invalidateMembership` published only
 * the first. The deciding evidence is in the query rather than in either publisher:
 * `latestTeamChatActivityFromDb` filters on `hiddenAt` and nothing else, so the snapshot a
 * reconnect opens with already counts roster rows. Push and snapshot disagreed about one room.
 *
 * The assertions below are therefore parity assertions, not taste: whatever the live path
 * emits must carry the timestamp the next snapshot would report.
 */

function recordTeamFrames(teamId: string): { frames: TeamStatusFrame[]; stop: () => void } {
  const frames: TeamStatusFrame[] = [];
  const stop = subscribeToTeamStatus(teamId, (frame) => {
    frames.push(frame);
  });
  return { frames, stop };
}

function activityTimes(frames: TeamStatusFrame[]): string[] {
  const out: string[] = [];
  for (const frame of frames) if (frame.kind === 'team.chat.activity') out.push(frame.activity.at);
  return out;
}

describe('ADR-130 — roster events raise the team-chat watermark', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('publishes an activity frame carrying the join line’s own time', async () => {
    const captain = await ctx.signUpParticipant();
    const joiner = await ctx.signUpParticipant();
    const team = await createTeamWithCaptain(ctx.handle.db, {
      teamName: `Joining ${ctx.runId}`,
      captainParticipantId: captain.id,
    });

    const { frames, stop } = recordTeamFrames(team.id);
    await addTeamMember(ctx.handle.db, { teamId: team.id, participantId: joiner.id });
    stop();

    const watermark = await latestTeamChatActivity(ctx.handle.db, team.id);
    expect(activityTimes(frames)).toEqual([watermark?.toISOString()]);
  });

  it('publishes an activity frame when a member leaves', async () => {
    const captain = await ctx.signUpParticipant();
    const joiner = await ctx.signUpParticipant();
    const team = await createTeamWithCaptain(ctx.handle.db, {
      teamName: `Leaving ${ctx.runId}`,
      captainParticipantId: captain.id,
    });
    await addTeamMember(ctx.handle.db, { teamId: team.id, participantId: joiner.id });

    const { frames, stop } = recordTeamFrames(team.id);
    await invalidateMembership(ctx.handle.db, { teamId: team.id, participantId: joiner.id });
    stop();

    const watermark = await latestTeamChatActivity(ctx.handle.db, team.id);
    expect(activityTimes(frames)).toEqual([watermark?.toISOString()]);
  });

  it('pairs every roster message frame with exactly one activity frame', async () => {
    const captain = await ctx.signUpParticipant();
    const joiner = await ctx.signUpParticipant();
    const team = await createTeamWithCaptain(ctx.handle.db, {
      teamName: `Pairing ${ctx.runId}`,
      captainParticipantId: captain.id,
    });

    // The two frames ride different buses — the line itself on the chat bus, the watermark on
    // the status bus — which is precisely how they came to disagree. Count both.
    const { frames, stop } = recordTeamFrames(team.id);
    const lines: string[] = [];
    const stopChat = subscribeToTeamChat(team.id, (frame) => {
      // ADR-146 made this topic carry typing signals too; only the lines count here.
      if (frame.kind === 'message') lines.push(frame.message.id);
    });
    await addTeamMember(ctx.handle.db, { teamId: team.id, participantId: joiner.id });
    await invalidateMembership(ctx.handle.db, { teamId: team.id, participantId: joiner.id });
    stopChat();
    stop();

    expect(lines).toHaveLength(2);
    expect(activityTimes(frames)).toHaveLength(2);
  });

  /**
   * ADR-130 / A-5 — the announcement step owns the invalidation.
   *
   * `createTeamChatMessage` still voids the tag at insert, which is correct and sufficient for
   * callers that write outside a transaction. What it cannot be is late enough: inside
   * `createTeamWithCaptain` and `invalidateMembership` the insert is uncommitted, so a reader
   * arriving between the void and the COMMIT re-populates the memo with pre-commit state, and
   * that entry then lives the full ten-minute TTL with no write left to clear it.
   *
   * Reproducing the collision needs two connections and PGlite has one, so this asserts the
   * property that closes it. The insert below deliberately bypasses `createTeamChatMessage`,
   * which puts the cache in exactly the state the losing reader would leave it in: warm, and
   * wrong. Only an invalidation inside `announceRosterEvent` can clear it.
   */
  it('voids the room’s tag from the announcement step, not only from the insert', async () => {
    const captain = await ctx.signUpParticipant();
    const team = await createTeamWithCaptain(ctx.handle.db, {
      teamName: `Voiding ${ctx.runId}`,
      captainParticipantId: captain.id,
    });

    const stale = await latestTeamChatActivity(ctx.handle.db, team.id);
    expect(stale).not.toBeNull();

    const [row] = await ctx.handle.db
      .insert(teamChatMessages)
      .values({
        id: newId(),
        teamId: team.id,
        participantId: captain.id,
        authorLabelSnapshot: captain.nickname ?? 'captain',
        titleSnapshot: 'Tester',
        kind: 'joined',
      })
      .returning();
    if (row === undefined) throw new Error('insert returned no row');

    // The memo is now warm and wrong — exactly the state the race leaves behind.
    expect((await latestTeamChatActivity(ctx.handle.db, team.id))?.toISOString()).toBe(
      stale?.toISOString(),
    );

    announceRosterEvent(team.id, row);

    expect((await latestTeamChatActivity(ctx.handle.db, team.id))?.toISOString()).toBe(
      row.createdAt.toISOString(),
    );
  });
});
