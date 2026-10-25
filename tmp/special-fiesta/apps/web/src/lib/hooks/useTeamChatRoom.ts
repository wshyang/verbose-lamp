import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { emptyStates } from '@psd/contracts';
import type { TeamChatMessageView, TeamChatTypingView } from '@psd/contracts';
import {
  fetchOlderTeamChatPage,
  fetchTeamChatPage,
  hideTeamChatMessage,
  sendTeamChatMessage,
} from '../api/teamChat.js';
import { openTeamChatStream } from '../api/teamChatStream.js';
import { describeError, usePolling } from './useAsyncData.js';
import { useAction } from './useAction.js';
import { CHAT_BLIP_QUIET_MS, mergeById, useForegroundGeneration, useOlderPages } from './liveRoom.js';
import { readCached, writeCached } from '../storage/cacheStore.js';
import { TEAM_TAIL_CACHE } from '../storage/cacheNames.js';
import { playChatBlip } from '../audio/ding.js';
import { useSessionOrNull } from '../session/context.js';
import { useTypingSignal, useTypingWatchers } from './useTeamChatTyping.js';

function noop(): void {
  // A live stream needs no poll; `usePolling` still wants a stable callback.
}

/**
 * The team room (ADR-063). The panel below renders a list and a box; every decision about what is
 * in the list lives here (AGENTS-frontend.md).
 *
 * Differences from the global room that are deliberate rather than incidental:
 *
 *   - **No read position kept on the device.** The membership row is the shared read marker, so the
 *     dot stays trustworthy on every phone. A remembered tail supplies only a transport cursor, so
 *     reopening reconciles the delta rather than downloading that tail again.
 *   - **Opening the room marks it read**, and clears the nav dot immediately rather than waiting for
 *     a round trip, because the participant is looking at the thing the dot was about.
 *   - **A message arriving while the room is open is already read**, so it never lights the dot.
 */

export interface TeamChatRoom {
  messages: TeamChatMessageView[];
  /** ADR-267 — the entry catch-up has landed; the new-messages line settles on this. */
  entrySettled: boolean;
  /** ADR-087 — is there history behind the oldest message held? */
  hasOlder: boolean;
  isLoadingOlder: boolean;
  loadOlder: () => void;
  isLoading: boolean;
  error: string | null;
  isLive: boolean;
  emptyText: string;
  draft: string;
  setDraft: (value: string) => void;
  submit: () => void;
  isSending: boolean;
  sendError: string | null;
  /** ADR-146 — the team-mates currently writing, excluding the reader. */
  typingLabels: string[];
  /** ADR-155 — the captain's hide. The panel decides whether to offer it. */
  hide: (messageId: string) => void;
  hideError: string | null;
}

/** Compared with `>` to match the server's ordering exactly (ADR-064). */
function newestOf(messages: readonly TeamChatMessageView[]): string | null {
  return messages.reduce<string | null>(
    (best, item) => (best === null || item.id > best ? item.id : best),
    null,
  );
}

/**
 * The live connection, and the one piece of state that says whether there is one.
 *
 * Its own hook for the same reason the global room's is (ADR-066): keeping the transport beside the
 * list's bookkeeping put `useTeamChatMessages` over the 50-line limit that exists to stop exactly
 * that. Its cursor only resumes transport from the remembered tail; the shared read position stays
 * server-side, on the membership row (ADR-063).
 */
function useTeamChatStream(room: {
  cursor: () => string | null;
  catchUp: () => Promise<void>;
  absorb: (arriving: readonly TeamChatMessageView[]) => void;
  forget: (messageId: string) => void;
  typing: { absorb: (typing: TeamChatTypingView) => void; clearFor: (id: string) => void };
}): boolean {
  const [isLive, setIsLive] = useState(false);
  const generation = useForegroundGeneration();
  // ADR-119 — bumped when the watchdog finds the socket dead; re-running the effect is how
  // the app rebuilds a stream from the current cursor. ADR-269 added the global room's
  // polling fallback beneath this, but reconnecting remains the only way back to *live* —
  // the poll catches the list up, it does not restore typing frames or the live hint.
  const [revival, setRevival] = useState(0);
  const { cursor, catchUp, absorb, forget, typing } = room;
  // ADR-103 — a mate's line blips; your own echo (and roster events you caused) do not.
  const session = useSessionOrNull();
  const myLabel = session?.participant?.nickname ?? null;

  useEffect(() => {
    let cancelled = false;
    // ADR-104 — the backlog replayed on connect is reading, not arrival: no blip for it.
    const quietUntil = Date.now() + CHAT_BLIP_QUIET_MS;
    void catchUp();
    const handle = openTeamChatStream(cursor(), {
      onMessage: (message) => {
        if (cancelled) return;
        /*
         * ADR-146 — the proof that somebody stopped typing is the thing they sent, so their
         * name goes at the same instant their line appears rather than hanging under it for
         * the rest of the six-second window.
         */
        typing.clearFor(message.authorParticipantId);
        absorb([message]);
        if (Date.now() >= quietUntil && message.authorLabel !== myLabel) playChatBlip();
      },
      // ADR-155 — the captain hid it, so it leaves this phone now.
      onHidden: (messageId) => {
        if (!cancelled) forget(messageId);
      },
      onError: () => {
        if (!cancelled) setIsLive(false);
      },
      // ADR-064 — a reconnect brings the room back to life, so say so rather than leaving the
      // surface claiming to be offline for the rest of the mount.
      onLive: () => {
        if (!cancelled) setIsLive(true);
      },
      /*
       * No `cancelled` guard, unlike its neighbours: closing the handle stops the watchdog, so
       * a stale callback cannot outlive the stream that armed it. A guard here would be a
       * branch no test could ever reach.
       */
      onTyping: (frame) => {
        if (!cancelled) typing.absorb(frame);
      },
      onStale: () => {
        setIsLive(false);
        setRevival((count) => count + 1);
      },
    });
    setIsLive(handle !== null);
    return () => {
      cancelled = true;
      handle?.close();
    };
    // `generation` and `revival` are reconnect triggers, not unused dependencies.
  }, [absorb, catchUp, cursor, forget, generation, myLabel, revival, typing]);

  return isLive;
}

/** The list, however it arrives: the opening read, live frames, or the sender's own line. */
/**
 * ADR-112 — the team room's remembered tail. The shared read marker lives server-side
 * (ADR-063), while this cached tail paints instantly and supplies the `after` cursor for
 * delta-only reconciliation. Roster moves invalidate it (useTeams).
 */
const TEAM_TAIL_KEEP = 50;
const TEAM_TAIL_HORIZON_MS = 6 * 60 * 60 * 1000;

function teamTailCacheName(teamId: string): string {
  return `${TEAM_TAIL_CACHE}.${teamId}`;
}

function seededTeamTailFor(actorId: string | null, teamId: string): TeamChatMessageView[] {
  if (actorId === null) return [];
  return (
    readCached<TeamChatMessageView[]>(
      teamTailCacheName(teamId),
      actorId,
      TEAM_TAIL_HORIZON_MS,
    )?.data ?? []
  );
}

function usePersistedTeamTail(
  actorId: string | null,
  teamId: string,
  messages: TeamChatMessageView[],
): void {
  useEffect(() => {
    if (actorId === null || messages.length === 0) return;
    writeCached(teamTailCacheName(teamId), actorId, messages.slice(-TEAM_TAIL_KEEP));
  }, [actorId, messages, teamId]);
}

/** Read once per mount, whatever re-renders follow. */
function useSeededTeamTail(actorId: string | null, teamId: string): TeamChatMessageView[] {
  const ref = useRef<TeamChatMessageView[] | null>(null);
  ref.current = ref.current ?? seededTeamTailFor(actorId, teamId);
  return ref.current;
}

function useTeamChatCatchUp(input: {
  cursor: () => string | null;
  absorb: (arriving: readonly TeamChatMessageView[]) => void;
  onRead: () => void;
  setError: (value: string | null) => void;
  finishLoading: () => void;
}) {
  const { cursor, absorb, onRead, setError, finishLoading } = input;
  return useCallback(async () => {
    try {
      const previousNewest = cursor();
      const page = await fetchTeamChatPage(previousNewest);
      absorb(page.messages);
      // A zero-message delta still means the remembered tail is visibly read now.
      if (page.messages.length === 0 && previousNewest !== null) onRead();
      setError(null);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      finishLoading();
    }
  }, [absorb, cursor, finishLoading, onRead, setError]);
}

/**
 * The three ways the list changes, lifted out of `useTeamChatMessages` when the hide made it a
 * fourth concern in one function. They share `remember` and differ in exactly one decision
 * each, which is easier to see side by side than interleaved with the room's other state.
 */
function useListEdits(input: {
  setMessages: Dispatch<SetStateAction<TeamChatMessageView[]>>;
  remember: (merged: TeamChatMessageView[]) => TeamChatMessageView[];
  onRead: () => void;
}) {
  const { setMessages, remember, onRead } = input;

  /**
   * Absorbing is also reading: the room is on screen, so nothing that lands in it is unread.
   *
   * ADR-125 — and that is now the whole of it. The `POST /api/team-chat/read` that used to
   * follow moved a marker in a column; the marker lives on the device now, so `onRead` is a
   * local call that cannot fail on a phone with no signal.
   */
  const absorb = useCallback(
    (arriving: readonly TeamChatMessageView[]) => {
      if (arriving.length === 0) return;
      setMessages((current) => remember(mergeById(current, arriving)));
      onRead();
    },
    [onRead, remember, setMessages],
  );

  /**
   * ADR-087 — a backwards page is absorbed WITHOUT marking anything read, which is the one way this
   * room differs from the global one. The mark only ever moves forward, so a page of old messages
   * could not drag it back — but the reader has read nothing new by scrolling up, and the mark
   * belongs to the newest line seen.
   */
  const absorbOlder = useCallback(
    (arriving: readonly TeamChatMessageView[]) => {
      if (arriving.length === 0) return;
      setMessages((current) => remember(mergeById(current, arriving)));
    },
    [remember, setMessages],
  );

  /**
   * ADR-155 — drop a hidden line, here and from the remembered tail.
   *
   * Dropping it from state is not enough on its own: `usePersistedTeamTail` writes whatever is
   * in state, so removing it from the list is what keeps it out of the cache — and a phone
   * reopening the room paints from that cache before any request is made. A filter that
   * matched nothing returns the SAME array, so a retraction for a message this phone never
   * held costs no re-render.
   */
  const forget = useCallback(
    (messageId: string) => {
      setMessages((current) => {
        const kept = current.filter((message) => message.id !== messageId);
        return kept.length === current.length ? current : remember(kept);
      });
    },
    [remember, setMessages],
  );

  return { absorb, absorbOlder, forget };
}

function useTeamChatMessages(
  onRead: () => void,
  teamId: string,
  typing: { absorb: (frame: TeamChatTypingView) => void; clearFor: (id: string) => void },
) {
  const actorId = useSessionOrNull()?.participant?.id ?? null;
  const seeded = useSeededTeamTail(actorId, teamId);
  const [messages, setMessages] = useState<TeamChatMessageView[]>(seeded);
  const [isLoading, setIsLoading] = useState(seeded.length === 0);
  usePersistedTeamTail(actorId, teamId, messages);
  const [error, setError] = useState<string | null>(null);
  /** ADR-087 — oldest id held, which is where a backwards page starts from. */
  const oldest = useRef<string | null>(seeded[0]?.id ?? null);
  /** The cached tail's newest line is the forward delta cursor, not the read marker. */
  const newest = useRef<string | null>(newestOf(seeded));

  /**
   * Keeps the top of the list in a ref rather than state (ADR-087): nothing renders from it, and a
   * re-render per absorbed frame is what a busy room does not need.
   */
  const remember = useCallback((merged: TeamChatMessageView[]) => {
    oldest.current = merged[0]?.id ?? oldest.current;
    newest.current = newestOf(merged);
    return merged;
  }, []);

  const cursor = useCallback(() => newest.current, []);

  const { absorb, absorbOlder, forget } = useListEdits({ setMessages, remember, onRead });

  const older = useOlderPages({
    oldest,
    fetchOlder: fetchOlderTeamChatPage,
    absorb: absorbOlder,
    onError: setError,
  });

  // ADR-267 — settling is a separate fact from not-loading (a seeded room is the latter
  // before it is the former); the new-messages line pins its horizon on the settle.
  const [entrySettled, setEntrySettled] = useState(false);
  const finishLoading = useCallback(() => {
    setIsLoading(false);
    setEntrySettled(true);
  }, []);
  const catchUp = useTeamChatCatchUp({ cursor, absorb, onRead, setError, finishLoading });

  const isLive = useTeamChatStream({ cursor, catchUp, absorb, forget, typing });

  return { messages, isLoading, entrySettled, error, isLive, catchUp, absorb, forget, ...older };
}

/** The box: a draft, and what happens when it is sent. */
function useTeamChatComposer(onSent: (message: TeamChatMessageView) => void) {
  const [draft, setDraft] = useState('');
  const action = useAction(sendTeamChatMessage, (result) => {
    setDraft('');
    onSent(result.message);
  });

  const submit = useCallback(() => {
    const body = draft.trim();
    if (body === '') return;
    void action.run(body);
  }, [action, draft]);

  return { draft, setDraft, submit, isSending: action.isPending, sendError: action.error };
}

/**
 * ADR-155 — the captain's hide, applied locally the moment the server confirms it.
 *
 * The retraction frame will arrive over the socket too, and `forget` is idempotent, so the two
 * cannot fight. Doing it here as well means the captain is not left looking at the line they
 * just removed while a frame makes its way back to their own phone.
 */
function useHideAction(forget: (messageId: string) => void) {
  const action = useAction(hideTeamChatMessage, (result) => forget(result.messageId));
  return { hide: (messageId: string) => void action.run(messageId), hideError: action.error };
}

/**
 * `onRead` is supplied by the panel rather than read from a context here, because a hook must not
 * import a component (`hook-imports-component`). The panel knows about both, which is its job.
 */
export function useTeamChatRoom(onRead: () => void, teamId: string): TeamChatRoom {
  const myParticipantId = useSessionOrNull()?.participant?.id ?? null;
  const typing = useTypingWatchers({ myParticipantId });
  const room = useTeamChatMessages(onRead, teamId, typing.sink);
  const absorb = room.absorb;
  const onSent = useCallback(
    // The sender sees their own line at once; merging by id means the stream cannot duplicate it.
    (message: TeamChatMessageView) => absorb([message]),
    [absorb],
  );
  const composer = useTeamChatComposer(onSent);
  const moderation = useHideAction(room.forget);
  // ADR-146 — the outbound half reads the draft the composer already owns, so there is no
  // keystroke handler anywhere: the throttle sees state changes, not key events.
  useTypingSignal(composer.draft);
  /*
   * ADR-269 — the global room's fallback, which this room never had (ADR-119 noted it
   * could only reconnect or stay dark). Parity: a browser with no EventSource, or a
   * socket the watchdog has not yet declared stale, now catches up on the same
   * jittered 45–75 s poll instead of showing the mount-time read for ever. Typing
   * frames remain stream-only — the poll carries messages, not keystrokes.
   */
  usePolling(room.isLive ? noop : room.catchUp);

  return {
    ...moderation,
    typingLabels: typing.labels,
    messages: room.messages,
    entrySettled: room.entrySettled,
    hasOlder: room.hasOlder,
    isLoadingOlder: room.isLoadingOlder,
    loadOlder: room.loadOlder,
    isLoading: room.isLoading,
    error: room.error,
    isLive: room.isLive,
    emptyText: emptyStates.teamChat,
    ...composer,
  };
}
