import { messages } from '@psd/contracts';
import { getEnv } from '../env.js';
import { HttpError } from './http.js';
import type { AppContext } from './session.js';

/**
 * ADR-324 — a ceiling on open event streams.
 *
 * A stream costs a socket and a bus listener, so a few hundred is ordinary; what was missing was
 * any ceiling. A client reconnecting in a loop, or a script opening streams, grew the listener
 * lists without limit, and every published frame walks all of them. Two limits: one session may
 * hold a few (chat, status and team chat is three, one more for a reconnect overlapping its own
 * dead predecessor), and the process holds at most `SSE_MAX_STREAMS`. Past either, the stream is
 * refused with a 429 and the client's reconnect backoff (ADR-122) is the retry.
 */

/** Three kinds of stream, plus one so a reconnect can overlap the socket it is replacing. */
export const STREAMS_PER_SESSION = 4;

export interface StreamCounter {
  /** A release function if there was room, `null` if not. The release is idempotent. */
  tryOpen: (sessionKey: string) => (() => void) | null;
  openCount: () => number;
  sessionCount: () => number;
}

export function createStreamCounter(limits: { globalLimit: number; perSessionLimit: number }): StreamCounter {
  const bySession = new Map<string, number>();
  let open = 0;
  return {
    tryOpen: (sessionKey) => {
      const mine = bySession.get(sessionKey) ?? 0;
      if (open >= limits.globalLimit || mine >= limits.perSessionLimit) return null;
      open += 1;
      bySession.set(sessionKey, mine + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        open -= 1;
        const remaining = (bySession.get(sessionKey) ?? 1) - 1;
        if (remaining <= 0) bySession.delete(sessionKey);
        else bySession.set(sessionKey, remaining);
      };
    },
    openCount: () => open,
    sessionCount: () => bySession.size,
  };
}

let shared: StreamCounter | null = null;

function counter(): StreamCounter {
  if (shared === null) {
    shared = createStreamCounter({ globalLimit: getEnv().SSE_MAX_STREAMS, perSessionLimit: STREAMS_PER_SESSION });
  }
  return shared;
}

export function resetStreamLimitsForTests(): void {
  shared = null;
}

/** A stable key for whoever is asking: their session, or the screen's key. */
export function streamKeyOf(c: AppContext): string {
  const actor = c.get('actor');
  if (actor) return `session:${actor.sessionId}`;
  const screen = c.get('screen');
  return screen ? `screen:${screen.screenKeyId}` : 'anonymous';
}

/**
 * Takes a place or throws the 429. The returned function gives it back; the stream calls it from
 * its `finally`, which runs on a client abort and on an error alike.
 */
export function reserveStream(c: AppContext): () => void {
  const release = counter().tryOpen(streamKeyOf(c));
  if (release === null) throw new HttpError(429, messages.streamsBusy);
  return release;
}
