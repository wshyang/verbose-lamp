import { EventEmitter } from 'node:events';
import type { ChatMessageView, TeamChatMessageView, TeamChatTypingView } from '@psd/contracts';

/**
 * The chat room's fan-out (ADR-046).
 *
 * This is a plain Node `EventEmitter`, and that is the correct answer here rather than a
 * shortcut. The app is exactly one process: PGlite runs in-process (ADR-003) and the
 * deployment unit is a single container (ADR-043). A pub/sub broker exists to carry messages
 * BETWEEN processes, so with one process there is nothing for it to carry — Redis would be a
 * network hop, a dependency and a second thing to operate, in exchange for nothing.
 *
 * If this app ever runs more than one process against external Postgres, the replacement is
 * Postgres `LISTEN`/`NOTIFY` — still no Redis, and neither the routes nor the contracts
 * change, because only this module knows how a message reaches the other streams.
 *
 * `setMaxListeners(0)` because one listener is one open stream: three hundred phones is three
 * hundred listeners, which is ordinary for Node but far past the default warning threshold of
 * ten. Without this, a full event would print three hundred spurious leak warnings.
 */

const ROOM_EVENT = 'chat.room';

/**
 * ADR-066 — what happens in the room, not only what is said in it.
 *
 * One topic carries both kinds rather than two topics carrying one each, because the two are only
 * meaningful in order: a message and the hide that retracts it can be published in the same tick,
 * and an `EventEmitter` dispatches one topic synchronously in emit order. Two topics would deliver
 * in that order today and force every subscriber to merge two buffers to keep it — and a retraction
 * that overtakes the thing it retracts leaves the message on screen for good.
 */
export type ChatFrame =
  | { kind: 'message'; message: ChatMessageView }
  | { kind: 'hidden'; messageId: string };

export type ChatListener = (frame: ChatFrame) => void;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function publishChatMessage(message: ChatMessageView): void {
  emitter.emit(ROOM_EVENT, { kind: 'message', message });
}

/**
 * ADR-066 — moderation reaches the phones that are already looking at the message.
 *
 * Only the id, because a stream must not re-send what the message said in order to retract it.
 */
export function publishChatHidden(messageId: string): void {
  emitter.emit(ROOM_EVENT, { kind: 'hidden', messageId });
}

/** Returns the unsubscribe function; a stream MUST call it when the connection closes. */
export function subscribeToChat(listener: ChatListener): () => void {
  emitter.on(ROOM_EVENT, listener);
  return () => {
    emitter.off(ROOM_EVENT, listener);
  };
}

/** Test seam: no listener may survive from one test's streams into the next. */
export function resetChatBusForTests(): void {
  emitter.removeAllListeners(ROOM_EVENT);
}

/**
 * Test seam: how many sockets are listening to the global room.
 *
 * A leaked listener is the one stream bug with no symptom. The socket is gone, so nobody sees a
 * wrong frame; the subscription simply stays on the emitter, and every later publish walks a
 * longer list of dead writers. It accumulates fastest during exactly the incident that causes
 * it — a flapping connection reconnecting all afternoon — and the first evidence is memory.
 *
 * `statusBus` can answer this question from production code (`hasStatusSubscribers`, which
 * gates the leaderboard aggregate). Nothing in the chat room's path needs the count, so rather
 * than invent a use for it this is declared for what it is. The alternative was leaving the
 * unsubscribe untested on this bus, which is how §8's C4 went unnoticed.
 */
export function chatSubscriberCountForTests(): number {
  return emitter.listenerCount(ROOM_EVENT);
}

/**
 * ADR-063 — the team rooms' fan-out, on the same emitter but one topic per team.
 *
 * Per-team topics rather than one channel everybody filters: a team is about five people, so a
 * message wakes five listeners instead of three hundred, and — the part that matters — a stream
 * cannot be handed a message from a room it is not in, because it never subscribed to that topic.
 * Filtering in the client would have been a data leak; filtering in the server's fan-out by
 * re-reading membership on every message would have been a query per listener per message.
 *
 * Membership can still change while a stream is open, so the stream re-checks it before writing
 * (see `routes-team-chat/stream.ts`). The topic narrows that check to one team's worth of
 * listeners, which is what makes it cheap enough to do every time.
 */
function teamTopic(teamId: string): string {
  return `team.chat.${teamId}`;
}

/**
 * ADR-146 — the team topic carries two kinds now, so it carries a tagged frame, exactly as the
 * global room's did from ADR-066 and for the same reason: one topic means one order. A typing
 * signal and the message that ends it are published within a keystroke of each other, and an
 * `EventEmitter` dispatches one topic in emit order, where two topics would merely *tend* to.
 */
export type TeamChatFrame =
  | { kind: 'message'; message: TeamChatMessageView }
  | { kind: 'typing'; typing: TeamChatTypingView }
  | { kind: 'hidden'; messageId: string };

export type TeamChatListener = (frame: TeamChatFrame) => void;

export function publishTeamChatMessage(teamId: string, message: TeamChatMessageView): void {
  emitter.emit(teamTopic(teamId), { kind: 'message', message });
}

/**
 * ADR-146 — the one utterance in this app that is thrown away rather than stored.
 *
 * Nothing is written and nothing is remembered: the server forwards the assertion and forgets
 * it, and the phones that receive it expire it on their own clocks. A server-side "who is
 * typing" map would be a second source of truth with its own timers, in a process that may
 * restart, for a sentence that is wrong three seconds later anyway.
 */
export function publishTeamChatTyping(teamId: string, typing: TeamChatTypingView): void {
  emitter.emit(teamTopic(teamId), { kind: 'typing', typing });
}

/**
 * ADR-155 — the captain's moderation reaches the phones already holding the line.
 *
 * Only the id, for the reason ADR-066 gave about the global room: a stream must not re-send
 * what a message said in order to retract it. On the team topic rather than the global one,
 * so the retraction reaches exactly the people who could have seen the thing retracted.
 */
export function publishTeamChatHidden(teamId: string, messageId: string): void {
  emitter.emit(teamTopic(teamId), { kind: 'hidden', messageId });
}

export function subscribeToTeamChat(teamId: string, listener: TeamChatListener): () => void {
  const topic = teamTopic(teamId);
  emitter.on(topic, listener);
  return () => {
    emitter.off(topic, listener);
  };
}
