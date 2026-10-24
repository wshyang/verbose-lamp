import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHAT_BODY_MAX_LENGTH, emptyStates } from '@psd/contracts';
import type { ChatMessageView } from '@psd/contracts';
import { fetchChatPage, fetchOlderChatPage, sendChatMessage } from '../api/chat.js';
import { openChatStream } from '../api/chatStream.js';
import { describeError, usePolling } from './useAsyncData.js';
import { useAction } from './useAction.js';
import { isSocialPausedError } from '../socialPaused.js';
// ADR-063/075 — shared with the team room, which needs the same mechanics.
import { CHAT_BLIP_QUIET_MS, mergeById, useForegroundGeneration, useOlderPages } from './liveRoom.js';
import { readCached, writeCached } from '../storage/cacheStore.js';
import { CHAT_TAIL_CACHE } from '../storage/cacheNames.js';
import { playChatBlip } from '../audio/ding.js';
import { useSessionOrNull } from '../session/context.js';

/**
 * The chat room (ADR-046). The component below this renders a list and a box; every decision
 * about what is in the list lives here (AGENTS-frontend.md).
 *
 * Two behaviours are worth knowing before changing anything:
 *
 *   - **iOS Safari closes the stream when the app is backgrounded** (ADR-041 makes that engine
 *     first-class, so this is an ordinary case and not an edge one). `EventSource` retries on
 *     its own, but a suspended page does not get to retry, so returning to the tab bumps a
 *     generation counter and opens a fresh stream from the last id seen.
 *   - **A browser with no `EventSource` is not an error state.** `openChatStream` returns null
 *     and the room falls back to polling the same delta endpoint the stream resumes from.
 *   - **ADR-064 — the cursor lives for the life of the mount, not the life of the device.** It used
 *     to be written to local storage, which made a returning participant open an EMPTY room: the
 *     cursor outlived the message list, so a fresh mount asked for messages newer than the last one
 *     it had already seen and the server correctly answered with none. Leaving `/social/chat`
 *     unmounts the panel, so this happened on every tab switch, and it swallowed the message the
 *     participant had just sent. Opening on the tail also collapses the cached read's keys — it is
 *     keyed by `cursor ?? 'tail'` — so three hundred reconnecting phones are one query, not three
 *     hundred. The cursor is still needed WITHIN a mount, for the foreground reconnect and the poll
 *     delta, which is what the ref serves.
 */

function noop(): void {
  // A live stream needs no poll; `usePolling` still wants a stable callback.
}

export interface ChatRoom {
  messages: ChatMessageView[];
  /**
   * ADR-267 — the entry catch-up has landed (distinct from `isLoading`: ADR-112's seeded
   * room reports not-loading while its cache is already on screen, before the delta that
   * brings the away-messages). The new-messages line settles its horizon on this.
   */
  entrySettled: boolean;
  /** ADR-065 — is there history behind the oldest message held? */
  hasOlder: boolean;
  isLoadingOlder: boolean;
  loadOlder: () => void;
  isLoading: boolean;
  error: string | null;
  isLive: boolean;
  emptyText: string;
  /** ADR-118 — the room is closed; the tab stays and says so. */
  isPaused: boolean;
  draft: string;
  setDraft: (value: string) => void;
  submit: () => void;
  /** ADR-085 — one answer, so the Enter key and the button cannot disagree about it. */
  canSend: boolean;
  isSending: boolean;
  sendError: string | null;
}

/**
 * Both ends of the list, kept in refs: the newest is the forward cursor a reconnect resumes from
 * (ADR-064) and the oldest is where a backwards page starts (ADR-065). Refs rather than state because
 * nothing renders from them, and a re-render per absorbed frame is exactly what a busy room does not
 * need.
 */
function rememberEnds(
  merged: ChatMessageView[],
  ends: { seen: { current: string | null }; oldest: { current: string | null } },
): ChatMessageView[] {
  ends.seen.current = merged.at(-1)?.id ?? ends.seen.current;
  ends.oldest.current = merged[0]?.id ?? ends.oldest.current;
  return merged;
}

/**
 * The live connection, and the one piece of state that says whether there is one.
 *
 * Its own hook because the room's four frame kinds — a replayed backlog, a live message, a
 * moderation retraction (ADR-066) and a transport error — are one concern, and keeping them beside
 * the list's own bookkeeping put `useChatMessages` over the 50-line limit that exists to stop
 * exactly that.
 */
function useChatStream(room: {
  cursor: () => string | null;
  catchUp: () => Promise<void>;
  absorb: (arriving: readonly ChatMessageView[]) => void;
  forget: (messageId: string) => void;
}): boolean {
  const [isLive, setIsLive] = useState(false);
  const generation = useForegroundGeneration();
  // ADR-119 — bumped when the watchdog finds the socket dead; re-runs the effect, which is
  // already the app's proven way to rebuild a stream from the current cursor.
  const [revival, setRevival] = useState(0);
  const { cursor, catchUp, absorb, forget } = room;
  // ADR-103 — somebody ELSE's line gets an audible blip while the room is open; your own
  // echo coming back through the bus does not.
  const session = useSessionOrNull();
  const myLabel = session?.participant?.nickname ?? session?.staff?.username ?? null;

  useEffect(() => {
    let cancelled = false;
    // ADR-104 — the backlog replayed on connect is reading, not arrival: no blip for it.
    const quietUntil = Date.now() + CHAT_BLIP_QUIET_MS;
    void catchUp();
    const handle = openChatStream(cursor(), {
      onMessage: (message) => {
        if (cancelled) return;
        absorb([message]);
        if (Date.now() >= quietUntil && message.authorLabel !== myLabel) playChatBlip();
      },
      onError: () => {
        if (!cancelled) setIsLive(false);
      },
      // ADR-064 — a reconnect brings the room back to life, so say so rather than leaving the
      // surface claiming to be offline for the rest of the mount.
      onLive: () => {
        if (!cancelled) setIsLive(true);
      },
      onHidden: (messageId) => {
        if (!cancelled) forget(messageId);
      },
      /*
       * No `cancelled` guard, unlike its neighbours: closing the handle stops the watchdog, so
       * a stale callback cannot outlive the stream that armed it. A guard here would be a
       * branch no test could ever reach.
       */
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
  }, [absorb, catchUp, cursor, forget, generation, myLabel, revival]);

  return isLive;
}

/** The list, however it arrives: replayed backlog, live frames, or polled deltas. */
/** ADR-112 — the remembered tail: a room open costs a delta, not fifty rows. */
const CHAT_TAIL_KEEP = 50;
/** Hours, not days: old enough to be useful, young enough that moderation cannot haunt. */
const CHAT_TAIL_HORIZON_MS = 6 * 60 * 60 * 1000;

function seededTailFor(actorId: string | null): ChatMessageView[] {
  if (actorId === null) return [];
  return readCached<ChatMessageView[]>(CHAT_TAIL_CACHE, actorId, CHAT_TAIL_HORIZON_MS)?.data ?? [];
}

/** Every change the room renders is also what the next mount will open on. */
function usePersistedTail(actorId: string | null, messages: ChatMessageView[]): void {
  useEffect(() => {
    if (actorId === null || messages.length === 0) return;
    writeCached(CHAT_TAIL_CACHE, actorId, messages.slice(-CHAT_TAIL_KEEP));
  }, [actorId, messages]);
}

function useChatMessages(onRead: () => void) {
  const actorId = useSessionOrNull()?.participant?.id ?? null;
  // Read once per mount: the seeded tail turns catchUp's cursor into a DELTA ask (ADR-112
  // leaning on ADR-064's own mechanics — `seen` starts at the cache's newest id).
  const seededRef = useRef<ChatMessageView[] | null>(null);
  seededRef.current = seededRef.current ?? seededTailFor(actorId);
  const seeded = seededRef.current;
  const [messages, setMessages] = useState<ChatMessageView[]>(seeded);
  const [isLoading, setIsLoading] = useState(seeded.length === 0);
  // ADR-267 — the cache is a head start, not a settled room: this starts false even when
  // a seeded tail is already on screen, and flips when the entry catch-up lands.
  const [entrySettled, setEntrySettled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Newest id seen during THIS mount. Null means "open on the tail" (ADR-064). */
  const seen = useRef<string | null>(seeded.at(-1)?.id ?? null);
  /** Oldest id held, which is where a backwards page starts from. */
  const oldest = useRef<string | null>(seeded[0]?.id ?? null);
  usePersistedTail(actorId, messages);

  /**
   * Absorbing is also reading (ADR-083): the room is on screen, so nothing that lands in it is
   * unread.
   *
   * ADR-125 — this used to make a `POST /api/chat/read` as well, to move a server-side marker.
   * The marker now lives on the device, so `onRead` is the whole of it: one call into the alerts
   * store, no request, and nothing to fail silently on a phone with no signal.
   */
  const absorb = useCallback(
    (arriving: readonly ChatMessageView[]) => {
      if (arriving.length === 0) return;
      setMessages((current) => rememberEnds(mergeById(current, arriving), { seen, oldest }));
      onRead();
    },
    [onRead],
  );

  /**
   * ADR-066 — a moderated message leaves a room that is already showing it.
   *
   * Both ends are left exactly where they are, which is the point. `seen` is a high-water mark for
   * the forward cursor: winding it back to the new last message would re-request, and re-merge,
   * everything said since. `oldest` can keep naming a removed id safely because the server's
   * backwards page compares ids (`id < before`) rather than looking that row up, so the window it
   * returns is the same either way.
   *
   * Only the stream carries this. A browser with no `EventSource` polls the forward delta, which by
   * construction returns nothing older than the cursor — so there it stays on screen until the panel
   * remounts and opens on the tail, which excludes it. Retracting on that path would mean re-reading
   * the whole tail on a cadence, which is the cost ADR-046 exists to avoid.
   */
  const forget = useCallback((messageId: string) => {
    setMessages((current) => current.filter((message) => message.id !== messageId));
  }, []);

  const older = useOlderPages({ oldest, fetchOlder: fetchOlderChatPage, absorb, onError: setError });

  const cursor = useCallback(() => seen.current, []);

  const catchUp = useCallback(async () => {
    try {
      const previousNewest = cursor();
      const page = await fetchChatPage(previousNewest);
      absorb(page.messages);
      /*
       * ADR-268 — the team room's line, which this room never got. A zero-message
       * delta still means the remembered tail is visibly read now, but `absorb`
       * marks only on a non-empty batch, so without this a dot lit while the status
       * stream was down (its watermark moved by the fallback poll) can never be
       * cleared by entering: every later visit is the same empty delta. An empty
       * room still reports nothing — `previousNewest` is null until a tail exists.
       */
      if (page.messages.length === 0 && previousNewest !== null) onRead();
      setError(null);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setIsLoading(false);
      setEntrySettled(true);
    }
  }, [absorb, cursor, onRead]);

  const isLive = useChatStream({ cursor, catchUp, absorb, forget });

  return { messages, isLoading, entrySettled, error, isLive, catchUp, absorb, ...older };
}

/** The box: a draft, and what happens when it is sent. */
function useChatComposer(onSent: (message: ChatMessageView) => void) {
  const [draft, setDraft] = useState('');
  const action = useAction(sendChatMessage, (result) => {
    setDraft('');
    onSent(result.message);
  });

  const submit = useCallback(() => {
    const body = draft.trim();
    if (body === '') return;
    void action.run(body);
  }, [action, draft]);

  const canSend =
    !action.isPending && draft.trim() !== '' && draft.length <= CHAT_BODY_MAX_LENGTH;

  return {
    draft,
    setDraft,
    submit,
    canSend,
    isSending: action.isPending,
    sendError: action.error,
  };
}

/**
 * `onRead` is supplied by the panel rather than read from a context here, because a hook must not
 * import a component (`hook-imports-component`). The panel knows about both, which is its job.
 */
export function useChatRoom(onRead: () => void): ChatRoom {
  const room = useChatMessages(onRead);
  const absorb = room.absorb;
  const onSent = useCallback(
    (message: ChatMessageView) => {
      // Shows the sender their own line immediately; the stream would deliver it a moment
      // later, and merging by id means the two cannot produce a duplicate.
      absorb([message]);
    },
    [absorb],
  );
  const composer = useChatComposer(onSent);

  // Without a stream this IS the transport, so it polls on the jittered 45–75 s cadence
  // (ADR-024) rather than anything faster: two writes ride along with every request.
  usePolling(room.isLive ? noop : room.catchUp);

  return useMemo(
    () => ({
      messages: room.messages,
      entrySettled: room.entrySettled,
      hasOlder: room.hasOlder,
      isLoadingOlder: room.isLoadingOlder,
      loadOlder: room.loadOlder,
      isLoading: room.isLoading,
      error: room.error,
      isLive: room.isLive,
      isPaused: isSocialPausedError(room.error),
      emptyText: emptyStates.chatRoom,
      ...composer,
    }),
    [
      room.messages,
      room.entrySettled,
      room.hasOlder,
      room.isLoadingOlder,
      room.loadOlder,
      room.isLoading,
      room.error,
      room.isLive,
      composer,
    ],
  );
}
