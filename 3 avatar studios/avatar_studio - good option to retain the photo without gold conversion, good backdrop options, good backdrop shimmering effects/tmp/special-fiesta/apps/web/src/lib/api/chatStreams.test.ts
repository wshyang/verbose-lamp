import { CHAT_HEARTBEAT_EVENT } from '@psd/contracts';
import type { ChatMessageView } from '@psd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installEventSourceStub, type EventSourceStub } from '../../test-utils/eventSourceStub.js';
import { openChatStream } from './chatStream.js';
import { openTeamChatStream } from './teamChatStream.js';
import { STREAM_STALE_MS } from './streamWatchdog.js';

/**
 * ADR-119 — both rooms' live connections, at the `EventSource` boundary.
 *
 * What is pinned here is the thing `EventSource` itself will never tell us: that a socket which
 * has stopped carrying frames is dead even though no `error` was raised. The stub never fires
 * `error` in any of these tests, which is the whole point — a half-open connection does not.
 */

let stream: EventSourceStub;

function handlers() {
  return {
    onMessage: vi.fn(),
    onError: vi.fn(),
    onLive: vi.fn(),
    onHidden: vi.fn(),
    onTyping: vi.fn(),
    onStale: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  stream = installEventSourceStub();
});

afterEach(() => {
  stream.restore();
  vi.useRealTimers();
});

describe('openChatStream', () => {
  it('reports a silent socket as stale without any transport error', () => {
    const spies = handlers();
    openChatStream(null, spies);
    stream.connect();

    vi.advanceTimersByTime(STREAM_STALE_MS);

    expect(spies.onStale).toHaveBeenCalledTimes(1);
    expect(spies.onError).not.toHaveBeenCalled();
  });

  /* The heartbeat is the only traffic a quiet room has; if it did not count, every quiet room
     would be declared dead a minute after opening. */
  it('stays alive on heartbeats alone', () => {
    const spies = handlers();
    openChatStream(null, spies);
    stream.connect();

    for (let beat = 0; beat < 6; beat += 1) {
      vi.advanceTimersByTime(25_000);
      stream.emitRaw(CHAT_HEARTBEAT_EVENT, '');
    }

    expect(spies.onStale).not.toHaveBeenCalled();
  });

  it('counts a message as proof of life', () => {
    const spies = handlers();
    openChatStream(null, spies);
    stream.connect();

    vi.advanceTimersByTime(STREAM_STALE_MS - 1_000);
    stream.emit({ id: '01a0f000-0000-7000-8000-000000000001', body: 'still here' } as ChatMessageView);
    vi.advanceTimersByTime(STREAM_STALE_MS - 1_000);

    expect(spies.onStale).not.toHaveBeenCalled();
  });

  it('cannot go stale once closed', () => {
    const spies = handlers();
    const handle = openChatStream(null, spies);
    stream.connect();

    handle?.close();
    vi.advanceTimersByTime(10 * STREAM_STALE_MS);

    expect(spies.onStale).not.toHaveBeenCalled();
  });
});

describe('openTeamChatStream', () => {
  /* The team room has no polling fallback, so this is the only thing standing between a dead
     socket and a room that never updates again. */
  it('reports a silent socket as stale without any transport error', () => {
    const spies = handlers();
    openTeamChatStream(null, spies);
    stream.connect();

    vi.advanceTimersByTime(STREAM_STALE_MS);

    expect(spies.onStale).toHaveBeenCalledTimes(1);
    expect(spies.onError).not.toHaveBeenCalled();
  });

  it('stays alive on heartbeats alone', () => {
    const spies = handlers();
    openTeamChatStream(null, spies);
    stream.connect();

    for (let beat = 0; beat < 6; beat += 1) {
      vi.advanceTimersByTime(25_000);
      stream.emitRaw(CHAT_HEARTBEAT_EVENT, '');
    }

    expect(spies.onStale).not.toHaveBeenCalled();
  });

  it('counts a message as proof of life', () => {
    const spies = handlers();
    openTeamChatStream(null, spies);
    stream.connect();

    vi.advanceTimersByTime(STREAM_STALE_MS - 1_000);
    stream.emit({
      id: '01a0f000-0000-7000-8000-000000000002',
      kind: 'said',
      body: 'still here',
    } as never);
    vi.advanceTimersByTime(STREAM_STALE_MS - 1_000);

    expect(spies.onStale).not.toHaveBeenCalled();
  });

  it('cannot go stale once closed', () => {
    const spies = handlers();
    const handle = openTeamChatStream(null, spies);
    stream.connect();

    handle?.close();
    vi.advanceTimersByTime(10 * STREAM_STALE_MS);

    expect(spies.onStale).not.toHaveBeenCalled();
  });
});
