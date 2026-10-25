import { streamSSE } from 'hono/streaming';
import type { SSEStreamingApi } from 'hono/streaming';
import {
  STATUS_ANNOUNCEMENT_EVENT,
  STATUS_ANNOUNCEMENT_RETRACTED_EVENT,
  STATUS_CHAT_ACTIVITY_EVENT,
  STATUS_FEED_MATCH_EVENT,
  STATUS_CHAT_RETRACTED_EVENT,
  STATUS_GALLERY_ACTIVITY_EVENT,
  STATUS_GALLERY_RETRACTED_EVENT,
  STATUS_LEADERBOARD_EVENT,
  STATUS_HEARTBEAT_EVENT,
  STATUS_SNAPSHOT_EVENT,
  STATUS_TEAM_CHAT_ACTIVITY_EVENT,
  STATUS_TEAM_CHAT_RETRACTED_EVENT,
  STATUS_TEAM_UPSOON_EVENT,
} from '@psd/contracts';
import { findActiveMembership } from '../db/entities/index.js';
import { readAlertsFor } from '../lib/alerts.js';
import { runDetached } from '../lib/detached.js';
import { reserveStream } from '../lib/streamLimits.js';
import { describeUnhandledError } from '../lib/errorReport.js';
import { reconnectDelayMs } from '../lib/reconnect.js';
import { subscribeToStatus, subscribeToTeamStatus } from '../lib/statusBus.js';
import type { StatusFrame, TeamStatusFrame } from '../lib/statusBus.js';
import type { AppContext } from '../lib/session.js';
import type { AppDatabase } from '../db/client.js';
import type { ParticipantRow } from '../db/schema/index.js';

/**
 * ADR-121 — one socket per phone for everything that is not a chat room.
 *
 * The heartbeat is the chat rooms' and for the same reasons: behind the Cloudflare tunnel
 * (ADR-043) an idle proxied connection is dropped at around a hundred seconds, and a frame
 * arriving is the only evidence a browser has that a socket is still carrying anything (ADR-119).
 */
const HEARTBEAT_MS = 25_000;

/**
 * There is no `Last-Event-ID` handling here, and that is a decision rather than an omission.
 *
 * The chat room resumes from a cursor because it is a log: every message between then and now
 * still matters. This stream carries *state*, and the only state worth having is the current
 * one. So a reconnect opens with a snapshot and forgets whatever it missed, which is both
 * cheaper (one cached read instead of a replay) and more correct (nobody is told about an
 * announcement that has since been retracted).
 */
interface Pending {
  buffered: (StatusFrame | TeamStatusFrame)[];
  live: boolean;
}

/**
 * ADR-153 — the five feed frames differ in exactly two things: the event name, and which
 * field holds the payload. Written out as `case` arms they were five near-identical blocks,
 * and adding the two retractions pushed `writeFrame` over the line limit — which is the lint
 * rule doing its job, because a switch that grows a new arm per frame is the wrong shape for
 * a mapping. A table cannot drift between arms and cannot be given the wrong event name by
 * a copy-paste.
 */
const FEED_EVENTS = {
  'chat.activity': STATUS_CHAT_ACTIVITY_EVENT,
  'gallery.activity': STATUS_GALLERY_ACTIVITY_EVENT,
  'chat.retracted': STATUS_CHAT_RETRACTED_EVENT,
  'gallery.retracted': STATUS_GALLERY_RETRACTED_EVENT,
  'team.chat.activity': STATUS_TEAM_CHAT_ACTIVITY_EVENT,
  'team.chat.retracted': STATUS_TEAM_CHAT_RETRACTED_EVENT,
} as const;

type FeedFrame = Extract<StatusFrame | TeamStatusFrame, { kind: keyof typeof FEED_EVENTS }>;

function isFeedFrame(frame: StatusFrame | TeamStatusFrame): frame is FeedFrame {
  return frame.kind in FEED_EVENTS;
}

function writeFrame(stream: SSEStreamingApi, frame: StatusFrame | TeamStatusFrame): Promise<void> {
  if (isFeedFrame(frame)) {
    return stream.writeSSE({
      event: FEED_EVENTS[frame.kind],
      data: JSON.stringify('activity' in frame ? frame.activity : frame.retraction),
    });
  }
  switch (frame.kind) {
    case 'announcement':
      return stream.writeSSE({
        event: STATUS_ANNOUNCEMENT_EVENT,
        data: JSON.stringify(frame.announcement),
      });
    case 'announcement.retracted':
      return stream.writeSSE({
        event: STATUS_ANNOUNCEMENT_RETRACTED_EVENT,
        data: JSON.stringify({ announcementId: frame.announcementId }),
      });
    case 'team.upsoon':
      return stream.writeSSE({
        event: STATUS_TEAM_UPSOON_EVENT,
        data: JSON.stringify(frame.upSoon),
      });
    case 'feed.match':
      return stream.writeSSE({ event: STATUS_FEED_MATCH_EVENT, data: JSON.stringify(frame.match) });
    default:
      return stream.writeSSE({
        event: STATUS_LEADERBOARD_EVENT,
        data: JSON.stringify(frame.leaderboard),
      });
  }
}

/**
 * ADR-128 (B5) — the two frame kinds that are addressed to a team rather than to everybody.
 *
 * The distinction is the whole cost control. A global frame is addressed to every connected
 * phone, so guarding it would mean an indexed membership read per phone per announcement —
 * three hundred reads for a frame whose audience is, by definition, unconditional. These two
 * are the only kinds whose authorisation can expire.
 */
function isTeamFrame(frame: StatusFrame | TeamStatusFrame): boolean {
  return (
    frame.kind === 'team.upsoon' ||
    frame.kind === 'team.chat.activity' ||
    // ADR-155 — a retraction is addressed to the room, so it expires with membership exactly
    // as the activity frame does. Leaving it out would send a former member a frame about a
    // room they can no longer read.
    frame.kind === 'team.chat.retracted'
  );
}

/**
 * ADR-123/128 — the team subscription, and the authorisation that can expire under it.
 *
 * Team chat has re-read the membership before every write since ADR-123, for the reason that
 * applies here unchanged: a socket outlives the membership that authorised it. Somebody who
 * leaves a team at two in the afternoon keeps being told when that team is due on court —
 * which is the one frame on this stream that asks a person to physically walk somewhere.
 *
 * Kept as its own object rather than three loose variables in the handler so that "am I still
 * allowed this frame" and "give up the subscription" cannot drift apart: the moment the answer
 * is no, the topic is left, and every later frame costs nothing instead of another read.
 */
interface TeamGate {
  /** Called once the topic is joined, so the gate knows what it is guarding. */
  attach: (teamId: string, leave: () => void) => void;
  /** False only for a team frame whose membership has gone; a global frame is never gated. */
  authorised: (frame: StatusFrame | TeamStatusFrame) => Promise<boolean>;
  leave: () => void;
}

function teamGate(db: AppDatabase, participantId: string): TeamGate {
  let leaveTopic: (() => void) | null = null;
  let teamId: string | null = null;

  const forget = (): void => {
    leaveTopic?.();
    leaveTopic = null;
    teamId = null;
  };

  return {
    attach: (joined, leave) => {
      teamId = joined;
      leaveTopic = leave;
    },
    authorised: async (frame) => {
      if (teamId === null || !isTeamFrame(frame)) return true;
      const current = await findActiveMembership(db, participantId);
      if (current !== null && current.teamId === teamId) return true;
      forget();
      return false;
    },
    leave: forget,
  };
}

/**
 * ADR-140 — `participant` is null for the hall screen, and that single null is the whole of
 * the widening.
 *
 * A screen has no team, so there is no team topic to join, no membership to re-check and no
 * team frame that could ever be addressed to it: the global topic carries the leaderboard and
 * the match feed, which is exactly what a projector is for. The alternative — a second stream
 * endpoint — would have duplicated the buffering, the heartbeat and the reconnect delay, and
 * the copy that drifts is always the one nobody is watching.
 */
export function statusStreamResponse(c: AppContext, participant: ParticipantRow | null): Response {
  const db = c.get('db');
  const release = reserveStream(c);
  return streamSSE(c, async (stream) => {
    const pending: Pending = { buffered: [], live: false };
    let open = true;
    const gate = participant === null ? null : teamGate(db, participant.id);

    /*
     * ADR-128 — a team frame for a team they have left is dropped; the socket stays open.
     *
     * Team chat *closes* its socket in this situation and this one must not, and the
     * difference is what each connection is for. A chat room *is* the authorisation — leave
     * the team and there is nothing left on that socket. This stream also carries
     * announcements and the three social watermarks, which are addressed to every
     * participant. Closing it would take those away as collateral for a team the person is no
     * longer on.
     */
    const deliver = async (frame: StatusFrame | TeamStatusFrame): Promise<void> => {
      if (gate === null || (await gate.authorised(frame))) await writeFrame(stream, frame);
    };

    const receive = (frame: StatusFrame | TeamStatusFrame): void => {
      if (pending.live) {
        // ADR-324 — a failed membership read drops this one frame for this one socket; it must
        // not become an unhandled rejection, which ends the process for every socket.
        runDetached(deliver(frame), (error) => console.error('[api] status frame dropped', describeUnhandledError(error)));
        return;
      }
      /*
       * A frame published while the snapshot read is still in flight must not be lost — the
       * announcement that lands in that window is exactly the one somebody is waiting for. It
       * is buffered and flushed after the snapshot, so it can only ever be told twice, never
       * zero times; and every frame here is idempotent, which is what makes "twice" harmless.
       */
      pending.buffered.push(frame);
    };

    /*
     * Membership is read before subscribing because the team topic's name needs it. A team the
     * participant joins after this point does not reach them until they reconnect, which is the
     * same bargain the team chat room makes, and a join is a deliberate act with a navigation
     * after it.
     */
    const membership = participant === null ? null : await findActiveMembership(db, participant.id);
    const leaveGlobalTopic = subscribeToStatus(receive);
    if (membership !== null && gate !== null) {
      gate.attach(membership.teamId, subscribeToTeamStatus(membership.teamId, receive));
    }
    const unsubscribeAll = () => (leaveGlobalTopic(), gate?.leave());

    stream.onAbort(() => {
      open = false;
      unsubscribeAll();
    });

    try {
      const snapshot = await readAlertsFor(db, membership);
      /*
       * The reconnect delay rides on the snapshot rather than a hello frame of its own: it is
       * the first thing written either way, and a frame that exists only to carry a header is a
       * frame every client has to learn to ignore.
       */
      await stream.writeSSE({
        event: STATUS_SNAPSHOT_EVENT,
        data: JSON.stringify(snapshot),
        retry: reconnectDelayMs(),
      });
      for (const frame of pending.buffered) await deliver(frame);
      pending.live = true;
      pending.buffered = [];

      while (open) {
        await stream.sleep(HEARTBEAT_MS);
        if (!open) break;
        await stream.writeSSE({ event: STATUS_HEARTBEAT_EVENT, data: '' });
      }
    } finally {
      unsubscribeAll();
      release();
    }
  });
}
