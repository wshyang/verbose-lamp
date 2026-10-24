import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TEAM_CHAT_TYPING_PING_MS, TEAM_CHAT_TYPING_TTL_MS } from '@psd/contracts';
import type { TeamChatTypingView } from '@psd/contracts';
import { sendTypingPing } from '../api/teamChat.js';

/**
 * ADR-146 — who is writing in this room, and telling them that you are.
 *
 * Both halves live here because they are one idea seen from each end, and both are built
 * around the same refusal: **there is no "stopped typing" message.** A phone that is locked,
 * backgrounded by iOS (ADR-041) or carried out of Wi-Fi range cannot send one, and any design
 * that waits for it leaves a name on screen until the room is closed. So the sender
 * re-asserts while it has something to say, and the receiver forgets on its own clock.
 */

/** A name currently claiming to be typing, and the moment this phone stops believing it. */
interface Watcher {
  label: string;
  expiresAtMs: number;
}

/**
 * The inbound half: a map of participant to expiry, pruned by one timer.
 *
 * One timer for the room rather than one per typist: five people typing is five entries, and
 * five `setTimeout`s that each have to be found and cleared on every re-assertion is more
 * moving parts than a single sweep that compares numbers.
 */
export function useTypingWatchers(input: { myParticipantId: string | null }) {
  const { myParticipantId } = input;
  const [watchers, setWatchers] = useState<Record<string, Watcher>>({});

  const absorb = useCallback(
    (typing: TeamChatTypingView) => {
      /*
       * Your own echo, discarded here rather than at the server. The fan-out is a team topic
       * with no listener-to-participant map behind it, so the server cannot filter by sender
       * without keeping one — and watching yourself type is the single most pointless frame
       * a room could render.
       */
      if (typing.participantId === myParticipantId) return;
      setWatchers((current) => ({
        ...current,
        [typing.participantId]: {
          label: typing.label,
          expiresAtMs: Date.now() + TEAM_CHAT_TYPING_TTL_MS,
        },
      }));
    },
    [myParticipantId],
  );

  /**
   * A message is the proof that its author stopped: the sentence they were writing is now on
   * screen. Clearing on arrival is what makes the indicator disappear at the same instant the
   * line appears, instead of hanging underneath it for the rest of the TTL.
   */
  const clearFor = useCallback((participantId: string) => {
    setWatchers((current) => {
      if (!(participantId in current)) return current;
      const next = { ...current };
      delete next[participantId];
      return next;
    });
  }, []);

  const hasWatchers = Object.keys(watchers).length > 0;
  useEffect(() => {
    if (!hasWatchers) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setWatchers((current) => {
        const live = Object.entries(current).filter(([, watcher]) => watcher.expiresAtMs > now);
        // Same object when nothing expired: a sweep every second must not re-render a room.
        if (live.length === Object.keys(current).length) return current;
        return Object.fromEntries(live);
      });
    }, 1_000);
    return () => clearInterval(timer);
  }, [hasWatchers]);

  /*
   * The two callbacks are handed over as one object with a STABLE identity. The stream hook
   * lists it as an effect dependency, and an object rebuilt on every render would tear the
   * `EventSource` down and rebuild it on every keystroke in the room — a reconnect loop
   * dressed up as a typing indicator.
   */
  const sink = useMemo(() => ({ absorb, clearFor }), [absorb, clearFor]);

  return {
    labels: Object.values(watchers).map((watcher) => watcher.label),
    sink,
  };
}

/**
 * The outbound half: at most one ping per `TEAM_CHAT_TYPING_PING_MS` while there is something
 * in the box.
 *
 * Nothing is sent for an empty draft — a backspace back to nothing is "never mind", not
 * typing — and nothing is sent on submit either, because the message itself is what tells the
 * room you have finished.
 */
export function useTypingSignal(draft: string): void {
  const lastPingAtMs = useRef(0);

  useEffect(() => {
    if (draft.trim() === '') return;
    const now = Date.now();
    if (now - lastPingAtMs.current < TEAM_CHAT_TYPING_PING_MS) return;
    lastPingAtMs.current = now;
    /*
     * Failures are swallowed on purpose, and this is the one place in the app where that is
     * right: a paused event answers 503 (ADR-118), a dead network answers nothing, and in
     * both cases the correct behaviour for a cosmetic signal is for the room to carry on
     * exactly as it would have without it.
     */
    void sendTypingPing().catch(() => undefined);
  }, [draft]);
}
