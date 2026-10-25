import { CHAT_HIDDEN_EVENT } from '@psd/contracts';
import type { ChatMessageView, SessionView } from '@psd/contracts';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installEventSourceStub, type EventSourceStub } from '../../test-utils/eventSourceStub.js';
import { required } from '../required.js';
import { STREAM_STALE_MS } from '../api/streamWatchdog.js';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';
import { resetAudioForTests } from '../audio/ding.js';
import { SessionContext } from '../session/context.js';
import type { SessionState } from '../session/context.js';
import { facilitatorSession, participantSession } from '../../test-utils/fixtures.js';
import { writeSessionToken } from '../session/tokenStore.js';
import { readCached, writeCached } from '../storage/cacheStore.js';
import { useChatRoom } from './useChatRoom.js';

/**
 * The chat room hook (ADR-046). The API boundary and the `EventSource` boundary are stubbed;
 * the hook, the api modules and the merge logic under test are all the real ones.
 */

function messageAt(id: string, body: string): ChatMessageView {
  return {
    id,
    authorType: 'participant',
    authorLabel: 'BeachBoss',
    authorParticipantId: 'p1',
    clusterCode: 'CS',
    body,
    createdAt: '2026-09-30T02:00:00.000Z',
  };
}

/** ADR-083 — every room mount reports how far it has read; the tests own the endpoint's answer. */
/** Most tests are not about the dot; they pass a listener with nobody behind it. */
const noop = () => undefined;

// Ids are UUIDv7 in production; what the hook relies on is only that they sort chronologically.
const FIRST = '01a0f000-0000-7000-8000-000000000001';
const SECOND = '01a0f000-0000-7000-8000-000000000002';
const THIRD = '01a0f000-0000-7000-8000-000000000003';

let fetchStub: FetchStub | undefined;
let sourceStub: EventSourceStub | undefined;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  fetchStub?.restore();
  sourceStub?.restore();
  fetchStub = undefined;
  sourceStub = undefined;
  window.localStorage.clear();
});

/**
 * ADR-064 — the room must not open empty for somebody who has used it before.
 *
 * Reproduces the reported defect: the delta cursor was persisted but the message list was not, so a
 * fresh mount asked `?after=<the newest id it had already seen>`, the server correctly answered with
 * nothing, and the room rendered its empty state — including the message the participant had just
 * sent. Leaving /social/chat unmounts `ChatPanel`, so this happened on every tab switch.
 *
 * Note what made it invisible: the suite's `beforeEach` clears storage, so no test had ever mounted
 * the hook with a cursor already in it. This one seeds one deliberately.
 */
function chatEndpoint(tail: ChatMessageView[]) {
  return ({ url }: { url: string }) => {
    // The real contract (db/entities/chat.ts): a cursor returns strictly newer rows, and no cursor
    // returns the room's tail. A stale cursor therefore legitimately returns nothing.
    const after = new URL(url, 'http://localhost').searchParams.get('after');
    const messages = after === null ? tail : tail.filter((message) => message.id > after);
    return { body: { messages, cursor: messages.at(-1)?.id ?? after } };
  };
}

describe('coming back to the room', () => {
  it('opens on the tail even when this phone has seen messages before', async () => {
    const tail = [messageAt(FIRST, 'someone else'), messageAt(SECOND, 'mine')];
    // What the previous visit left behind: the newest id the participant had already seen.
    window.localStorage.setItem('psd.chat.cursor.v1', SECOND);
    fetchStub = installFetchStub({ 'GET /api/chat/messages': chatEndpoint(tail) });
    sourceStub = installEventSourceStub();

    const { result } = renderHook(() => useChatRoom(noop));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages.map((message) => message.body)).toEqual([
      'someone else',
      'mine',
    ]);
  });

  it('asks for the tail rather than a delta on a fresh mount', async () => {
    window.localStorage.setItem('psd.chat.cursor.v1', SECOND);
    fetchStub = installFetchStub({ 'GET /api/chat/messages': chatEndpoint([]) });
    sourceStub = installEventSourceStub();

    renderHook(() => useChatRoom(noop));

    /*
     * Also a cost fix, not only a correctness one: `readVisibleMessages` keys its cache by
     * `cursor ?? 'tail'` (ADR-038), so three hundred phones reconnecting with three hundred distinct
     * cursors was three hundred queries. Opening on the tail collapses them to one.
     */
    await waitFor(() => expect(fetchStub?.callsTo('GET /api/chat/messages').length).toBe(1));
    expect(fetchStub?.callsTo('GET /api/chat/messages')[0]?.path).not.toContain('after=');
    expect(sourceStub?.urls[0]).not.toContain('after=');
  });
});

describe('opening the room', () => {
  it('shows the replayed backlog', async () => {
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [messageAt(FIRST, 'hello')], cursor: FIRST } },
    });
    sourceStub = installEventSourceStub();

    const { result } = renderHook(() => useChatRoom(noop));

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0]?.body).toBe('hello');
    expect(result.current.isLive).toBe(true);
  });

  it('carries the token in the query string, because EventSource cannot set headers', async () => {
    writeSessionToken('tok-123');
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [], cursor: null } },
    });
    sourceStub = installEventSourceStub();

    renderHook(() => useChatRoom(noop));

    await waitFor(() => expect(sourceStub?.urls.length).toBeGreaterThan(0));
    expect(sourceStub?.urls[0]).toContain('session_token=tok-123');
  });

  it('adds a message that arrives on the stream', async () => {
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [messageAt(FIRST, 'first')], cursor: FIRST } },
    });
    sourceStub = installEventSourceStub();
    const { result } = renderHook(() => useChatRoom(noop));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => sourceStub?.emit(messageAt(SECOND, 'pushed')));

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[1]?.body).toBe('pushed');
  });

  /**
   * ADR-119 — a half-open socket raises no `error`, so the room would otherwise sit there
   * claiming to be live while suppressing its own polling fallback: no stream and no poll.
   * The stub never fails here, which is the point.
   */
  it('rebuilds a socket that stopped carrying frames, and goes on receiving', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fetchStub = installFetchStub({
        'GET /api/chat/messages': { body: { messages: [messageAt(FIRST, 'first')], cursor: FIRST } },
      });
      sourceStub = installEventSourceStub();
      const { result } = renderHook(() => useChatRoom(noop));
      await waitFor(() => expect(result.current.messages).toHaveLength(1));
      act(() => sourceStub?.connect());
      const openedBefore = required(sourceStub, 'event source stub').urls.length;

      await act(async () => {
        vi.advanceTimersByTime(STREAM_STALE_MS);
      });
      await waitFor(() => expect(required(sourceStub, 'event source stub').urls.length).toBe(openedBefore + 1));

      // The dead socket must not linger; a revival every stale window would leak one each time.
      expect(required(sourceStub, 'event source stub').openCount()).toBe(1);

      act(() => sourceStub?.emit(messageAt(SECOND, 'through the replacement')));
      await waitFor(() => expect(result.current.messages).toHaveLength(2));
    } finally {
      vi.useRealTimers();
    }
  });

  it('never shows the same message twice, however it arrived', async () => {
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [messageAt(FIRST, 'once')], cursor: FIRST } },
    });
    sourceStub = installEventSourceStub();
    const { result } = renderHook(() => useChatRoom(noop));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    // The same id the backlog carried: the stream re-delivering it is normal on resume.
    act(() => sourceStub?.emit(messageAt(FIRST, 'once')));

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
  });

  it('keeps the room in time order even when frames arrive out of order', async () => {
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [], cursor: null } },
    });
    sourceStub = installEventSourceStub();
    const { result } = renderHook(() => useChatRoom(noop));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => sourceStub?.emit(messageAt(THIRD, 'third')));
    act(() => sourceStub?.emit(messageAt(SECOND, 'second')));

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages.map((message) => message.body)).toEqual(['second', 'third']);
  });
});

/**
 * ADR-066 — a moderated message has to leave a room that is already showing it.
 *
 * Nothing a later read returns can retract it: the catch-up delta only ever answers with ids NEWER
 * than the cursor, so without the stream's own frame a hidden message stays on screen for as long
 * as the panel stays mounted.
 */
describe('when a message is moderated', () => {
  const roomOfTwo = {
    'GET /api/chat/messages': {
      body: {
        messages: [messageAt(FIRST, 'keep'), messageAt(SECOND, 'regrettable')],
        cursor: SECOND,
      },
    },
  };

  it('removes the message the room says was hidden, and leaves the rest', async () => {
    fetchStub = installFetchStub(roomOfTwo);
    sourceStub = installEventSourceStub();
    const { result } = renderHook(() => useChatRoom(noop));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    act(() => sourceStub?.hide(SECOND));

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0]?.body).toBe('keep');
  });

  it('does not wind the forward cursor back to the message before it', async () => {
    fetchStub = installFetchStub(roomOfTwo);
    sourceStub = installEventSourceStub();
    const { result } = renderHook(() => useChatRoom(noop));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    act(() => sourceStub?.hide(SECOND));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    // Returning to the foreground reconnects from the newest id SEEN, which is still the hidden
    // one. Resuming from `FIRST` instead would re-deliver everything said since it.
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(sourceStub?.urls.length).toBeGreaterThan(1));
    expect(sourceStub?.urls.at(-1)).toContain(`after=${SECOND}`);
  });

  it('treats a frame it cannot read as the transport failing, not as a room to empty', async () => {
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [messageAt(FIRST, 'keep')], cursor: FIRST } },
    });
    sourceStub = installEventSourceStub();
    const { result } = renderHook(() => useChatRoom(noop));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => sourceStub?.emitRaw(CHAT_HIDDEN_EVENT, 'not json'));

    await waitFor(() => expect(result.current.isLive).toBe(false));
    // The list survives: a frame nobody could parse is not an instruction to empty the room.
    expect(result.current.messages).toHaveLength(1);
  });
});

describe('when the stream cannot be had', () => {
  it('falls back to catching up instead of showing an error', async () => {
    // jsdom has no EventSource, so installing no stub IS the no-EventSource browser.
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [messageAt(FIRST, 'polled')], cursor: FIRST } },
    });

    const { result } = renderHook(() => useChatRoom(noop));

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.isLive).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('stops claiming to be live once the transport errors', async () => {
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [], cursor: null } },
    });
    sourceStub = installEventSourceStub();
    const { result } = renderHook(() => useChatRoom(noop));
    await waitFor(() => expect(result.current.isLive).toBe(true));

    act(() => sourceStub?.fail());

    await waitFor(() => expect(result.current.isLive).toBe(false));
  });

  it('surfaces a dead network as an error', async () => {
    fetchStub = installFetchStub({ 'GET /api/chat/messages': { offline: true } });
    sourceStub = installEventSourceStub();

    const { result } = renderHook(() => useChatRoom(noop));

    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});

describe('sending', () => {
  it('shows the sender their own line and clears the box', async () => {
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [], cursor: null } },
      'POST /api/chat/messages': { status: 201, body: { message: messageAt(FIRST, 'mine') } },
    });
    sourceStub = installEventSourceStub();
    const { result } = renderHook(() => useChatRoom(noop));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setDraft('mine'));
    await waitFor(() => expect(result.current.draft).toBe('mine'));
    await act(async () => {
      result.current.submit();
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.draft).toBe('');
  });

  it('does not send whitespace', async () => {
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [], cursor: null } },
      'POST /api/chat/messages': { status: 201, body: { message: messageAt(FIRST, ' ') } },
    });
    sourceStub = installEventSourceStub();
    const { result } = renderHook(() => useChatRoom(noop));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setDraft('   '));
    await act(async () => {
      result.current.submit();
    });

    expect(fetchStub.callsTo('POST /api/chat/messages')).toHaveLength(0);
  });

  it('shows the server refusal — a rate limit is a thing the sender must see', async () => {
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [], cursor: null } },
      'POST /api/chat/messages': {
        status: 429,
        body: { error: { message: 'Slow down a moment, then send again.' } },
      },
    });
    sourceStub = installEventSourceStub();
    const { result } = renderHook(() => useChatRoom(noop));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setDraft('spam'));
    await act(async () => {
      result.current.submit();
    });

    await waitFor(() => expect(result.current.sendError).toContain('Slow down'));
    // The draft survives a refusal, so a throttled sender does not lose what they typed.
    expect(result.current.draft).toBe('spam');
  });
});

/**
 * ADR-083 — absorbing is also reading. The hook both clears the local dot (`onRead`) and names,
 * to the server, the newest id it actually rendered — the marker the alerts poll then agrees with.
 */
describe('the read marker (ADR-083)', () => {
  it('tells the store the room was read when it opens on messages', async () => {
    const tail = [messageAt(FIRST, 'earlier'), messageAt(SECOND, 'latest')];
    fetchStub = installFetchStub({ 'GET /api/chat/messages': chatEndpoint(tail) });
    sourceStub = installEventSourceStub();
    const onRead = vi.fn();

    const { result } = renderHook(() => useChatRoom(onRead));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(onRead).toHaveBeenCalled();
    /*
     * ADR-125 — and it is the WHOLE of what the room does about reading. The marker moved to a
     * column before this, which cost a request per visit and could fail on a phone with no
     * signal; it is now a local mark the alerts store owns, so the room's only job is to say
     * that it absorbed something.
     */
    expect(fetchStub?.callsTo('POST /api/chat/read')).toHaveLength(0);
  });

  it('reports nothing when the room opens empty — there is nothing to have read', async () => {
    fetchStub = installFetchStub({ 'GET /api/chat/messages': chatEndpoint([]) });
    sourceStub = installEventSourceStub();
    const onRead = vi.fn();

    const { result } = renderHook(() => useChatRoom(onRead));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(onRead).not.toHaveBeenCalled();
    expect(fetchStub?.callsTo('POST /api/chat/read')).toHaveLength(0);
  });

  it('marks a line that arrives on the live stream, because it is on screen', async () => {
    fetchStub = installFetchStub({ 'GET /api/chat/messages': chatEndpoint([]) });
    sourceStub = installEventSourceStub();
    const onRead = vi.fn();

    const { result } = renderHook(() => useChatRoom(onRead));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => sourceStub?.emit(messageAt(THIRD, 'live line')));

    await waitFor(() => expect(onRead).toHaveBeenCalled());
    expect(fetchStub?.callsTo('POST /api/chat/read')).toHaveLength(0);
  });
});

/**
 * ADR-103 — the blip contract: somebody ELSE's line sounds, your own echo coming back
 * through the bus does not, and a staff voice is matched by username the same way.
 */
describe('the chat blip (ADR-103)', () => {
  function fakeAudio() {
    const oscillators: unknown[] = [];
    class FakeContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = vi.fn(() => Promise.resolve());
      createOscillator = vi.fn(() => {
        const oscillator = {
          type: '',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        oscillators.push(oscillator);
        return oscillator;
      });
      createGain = vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      }));
    }
    return { FakeContext, oscillators };
  }

  function wrapperFor(session: SessionView) {
    const state: SessionState = {
      session,
      isLoading: false,
      refresh: () => Promise.resolve(session),
      endSession: () => Promise.resolve(true),
    };
    return ({ children }: { children: ReactNode }) =>
      createElement(SessionContext.Provider, { value: state }, children);
  }

  afterEach(() => {
    resetAudioForTests();
    vi.restoreAllMocks();
  });

  /** Jump past the connect quiet window (ADR-104): backlog replay must not sound. */
  function settleRoom() {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2030-01-01T00:00:00Z').getTime());
  }

  it('blips for somebody else and stays silent for your own echo', async () => {
    const { FakeContext, oscillators } = fakeAudio();
    vi.stubGlobal('AudioContext', FakeContext);
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [], cursor: null } },
    });
    sourceStub = installEventSourceStub();
    const { result } = renderHook(() => useChatRoom(noop), {
      wrapper: wrapperFor(participantSession),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Inside the connect window: a replayed line is READING, not arrival — silent (ADR-104).
    act(() => sourceStub?.emit({ ...messageAt(THIRD, 'replayed backlog'), authorLabel: 'SandSprinter' }));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(oscillators).toHaveLength(0);

    settleRoom();
    const someoneElse = { ...messageAt(FIRST, 'from someone else'), authorLabel: 'SandSprinter' };
    act(() => sourceStub?.emit(someoneElse));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(oscillators).toHaveLength(1);

    // The fixture viewer IS 'BeachBoss' — their own echo must not sound.
    act(() => sourceStub?.emit(messageAt(SECOND, 'my own echo')));
    await waitFor(() => expect(result.current.messages).toHaveLength(3));
    expect(oscillators).toHaveLength(1);
  });

  it('a frame arriving after unmount neither blips nor lands', async () => {
    const { FakeContext, oscillators } = fakeAudio();
    vi.stubGlobal('AudioContext', FakeContext);
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [], cursor: null } },
    });
    sourceStub = installEventSourceStub();
    const { result, unmount } = renderHook(() => useChatRoom(noop), {
      wrapper: wrapperFor(participantSession),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    unmount();
    act(() => sourceStub?.emit({ ...messageAt(FIRST, 'too late'), authorLabel: 'SandSprinter' }));

    expect(oscillators).toHaveLength(0);
  });

  it('matches a staff viewer by username the same way', async () => {
    const { FakeContext, oscillators } = fakeAudio();
    vi.stubGlobal('AudioContext', FakeContext);
    fetchStub = installFetchStub({
      'GET /api/chat/messages': { body: { messages: [], cursor: null } },
    });
    sourceStub = installEventSourceStub();
    const { result } = renderHook(() => useChatRoom(noop), {
      wrapper: wrapperFor(facilitatorSession),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    settleRoom();
    const own = {
      ...messageAt(FIRST, 'marshal announcement'),
      authorType: 'facilitator' as const,
      authorLabel: facilitatorSession.staff?.username ?? '',
    };
    act(() => sourceStub?.emit(own));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(oscillators).toHaveLength(0);
  });
});


/**
 * ADR-112 — the remembered tail: a mount paints from the device and asks the server for
 * a DELTA, never a refetch of fifty rows it already holds.
 */
describe('the remembered tail (ADR-112)', () => {
  const ACTOR = participantSession.participant?.id as string;

  function cachedWrapper() {
    const state: SessionState = {
      session: participantSession,
      isLoading: false,
      refresh: () => Promise.resolve(participantSession),
      endSession: () => Promise.resolve(true),
    };
    return ({ children }: { children: ReactNode }) =>
      createElement(SessionContext.Provider, { value: state }, children);
  }

  it('opens on the cached tail instantly and fetches only the delta', async () => {
    writeCached('chat.tail', ACTOR, [messageAt(FIRST, 'remembered line')]);
    fetchStub = installFetchStub({
      'GET /api/chat/messages': chatEndpoint([
        messageAt(FIRST, 'remembered line'),
        messageAt(SECOND, 'said while away'),
      ]),
    });
    sourceStub = installEventSourceStub();

    const { result } = renderHook(() => useChatRoom(noop), { wrapper: cachedWrapper() });

    // Painted from the device before any response: not a loading screen in sight.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.messages.map((m) => m.body)).toEqual(['remembered line']);

    // The catch-up asked for a DELTA after the cached newest — not the whole tail.
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    const asked = fetchStub.calls.find((call) => call.path.startsWith('/api/chat/messages'));
    expect(asked?.path).toContain(`after=${FIRST}`);

    // And what arrived is what the NEXT mount will open on.
    await waitFor(() =>
      expect(
        (readCached<{ length: number }[]>('chat.tail', ACTOR, 60_000)?.data ?? []).length,
      ).toBe(2),
    );
  });

  /*
   * ADR-268 — the empty delta still has to clear the dot. This is the ordinary outcome
   * the cache exists to produce: nothing has been said since this phone last looked.
   * Before the catch-up said so, `absorb`'s silence on an empty batch left the read
   * mark behind the watermark permanently — every later visit was the same empty
   * delta, so the dot survived any number of readings. (The team room's catch-up has
   * carried the equivalent line since ADR-125; this room never got it.)
   */
  it('marks the room read on an empty delta, because the remembered tail is what was read', async () => {
    writeCached('chat.tail', ACTOR, [messageAt(FIRST, 'remembered line')]);
    fetchStub = installFetchStub({ 'GET /api/chat/messages': chatEndpoint([]) });
    sourceStub = installEventSourceStub();
    const onRead = vi.fn();

    renderHook(() => useChatRoom(onRead), { wrapper: cachedWrapper() });

    await waitFor(() => expect(onRead).toHaveBeenCalled());
  });

  it('ignores a tail cached for somebody else on the same phone', () => {
    writeCached('chat.tail', 'someone-else', [messageAt(FIRST, 'not yours')]);
    fetchStub = installFetchStub({
      'GET /api/chat/messages': chatEndpoint([]),
    });
    sourceStub = installEventSourceStub();

    const { result } = renderHook(() => useChatRoom(noop), { wrapper: cachedWrapper() });
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isLoading).toBe(true);
  });
});
