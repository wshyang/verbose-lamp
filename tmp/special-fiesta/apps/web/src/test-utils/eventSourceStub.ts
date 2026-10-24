import { CHAT_HIDDEN_EVENT } from '@psd/contracts';
import type { ChatHiddenView, ChatMessageView } from '@psd/contracts';

/**
 * A stand-in for `EventSource`, for the same reason `fetchStub` exists and in the same spirit:
 * replace the *browser* boundary, never our own modules.
 *
 * `fetchStub` cannot cover this. It swaps `globalThis.fetch`, and an `EventSource` is a
 * different global speaking a different protocol — so a chat test that only stubbed fetch would
 * silently exercise the polling fallback while believing it tested the live stream.
 *
 * jsdom has no `EventSource` at all, which is itself useful: leaving it absent is exactly the
 * "browser without EventSource" case the room must degrade through, so that path is tested by
 * installing nothing.
 */

type Listener = (event: Event) => void;

/** One live stub stream: its listeners, and the object whose `readyState` the client reads. */
interface OpenStream {
  listeners: Map<string, Listener[]>;
  source: { readyState: number };
}

export interface EventSourceStub {
  /** Every URL a stream was opened with, in order — where the token carrier is asserted. */
  urls: string[];
  /** Delivers a message frame to every open stream. */
  emit: (message: ChatMessageView) => void;
  /**
   * ADR-066 — the moderation frame. It arrives as its own SSE event type rather than as a message,
   * so a listener registered for `message` never sees it; that is exactly what the room has to get
   * right, and a stub that could only deliver messages could not prove it.
   */
  hide: (messageId: string) => void;
  /** A frame whose data is not the JSON the room expects, for either event type. */
  emitRaw: (type: string, data: string) => void;
  /** ADR-064 — `EventSource` fires this on connect and on every successful reconnect. */
  connect: () => void;
  /**
   * A transport error: the connection dropped and the browser will reconnect by itself, so
   * `readyState` stays at CONNECTING. This is the common failure and the one the client must
   * NOT answer by opening a second socket.
   */
  fail: () => void;
  /**
   * A hard close: the reconnect got a response that was not 200 `text/event-stream` — a 502
   * from the tunnel mid-reboot, a 401 from an expired session — so per the specification the
   * browser fails the connection for good and `readyState` is CLOSED. Nothing will reopen it
   * unless the client does.
   */
  die: () => void;
  /** How many streams are currently open; a closed one must not linger. */
  openCount: () => number;
  restore: () => void;
}

export function installEventSourceStub(): EventSourceStub {
  const original = Reflect.get(globalThis, 'EventSource') as unknown;
  const urls: string[] = [];
  const open = new Set<OpenStream>();

  class StubEventSource {
    private readonly listeners = new Map<string, Listener[]>();
    private readonly entry: OpenStream;
    /** 0 CONNECTING, 1 OPEN, 2 CLOSED — the spec's values, which the client reads. */
    readyState = 0;

    constructor(url: string) {
      urls.push(url);
      this.entry = { listeners: this.listeners, source: this };
      open.add(this.entry);
    }

    addEventListener(type: string, listener: Listener): void {
      const existing = this.listeners.get(type) ?? [];
      this.listeners.set(type, [...existing, listener]);
    }

    close(): void {
      this.readyState = 2;
      open.delete(this.entry);
    }
  }

  Reflect.set(globalThis, 'EventSource', StubEventSource);

  const dispatch = (type: string, event: Event): void => {
    for (const entry of open) {
      for (const listener of entry.listeners.get(type) ?? []) listener(event);
    }
  };

  return {
    urls,
    emit: (message) => {
      dispatch('message', new MessageEvent('message', { data: JSON.stringify(message) }));
    },
    hide: (messageId) => {
      const frame: ChatHiddenView = { messageId };
      dispatch(
        CHAT_HIDDEN_EVENT,
        new MessageEvent(CHAT_HIDDEN_EVENT, { data: JSON.stringify(frame) }),
      );
    },
    emitRaw: (type, data) => dispatch(type, new MessageEvent(type, { data })),
    connect: () => {
      for (const entry of open) entry.source.readyState = 1;
      dispatch('open', new Event('open'));
    },
    fail: () => {
      for (const entry of open) entry.source.readyState = 0;
      dispatch('error', new Event('error'));
    },
    die: () => {
      for (const entry of open) entry.source.readyState = 2;
      dispatch('error', new Event('error'));
    },
    openCount: () => open.size,
    restore: () => {
      Reflect.set(globalThis, 'EventSource', original);
    },
  };
}
