import { STATUS_HEARTBEAT_EVENT, STATUS_SNAPSHOT_EVENT } from '@psd/contracts';

/**
 * ADR-350 — the SSE parser the load tier reads the server's streams with.
 *
 * The server writes through Hono's `writeSSE` (apps/api/src/routes-status/stream.ts), so the
 * wire shape is fixed and knowable: the first frame is the **snapshot**, carrying the
 * per-connection `retry:` delay (ADR-122 — 3–10 s, spread so a mass drop does not come back in
 * lockstep); every 25 s an empty **heartbeat** keeps proxied connections alive (ADR-119); and
 * every real frame is an `event:` name from `@psd/contracts` with a JSON `data:` body. There is
 * deliberately no `Last-Event-ID` — a reconnect re-syncs through a fresh snapshot, which is
 * why the plan's §9 accounts for a frame missed during a reconnect being re-synced, not
 * replayed.
 *
 * The parser is incremental and split-chunk safe: a TCP segment may end anywhere, including
 * inside a field name or between the two newlines that end an event. It follows the SSE
 * parsing rules that matter here — one optional space after the colon, multi-line `data:`
 * joined with `\n`, `:`-prefixed comments ignored, `retry:` parsed as milliseconds, unknown
 * fields ignored — and it surfaces `retryMs` so the connection layer (Phase 2) can honour the
 * server's per-connection delay instead of inventing its own metronome.
 */

/** One parsed event. `event` is '' when the sender named none (never true of this server). */
export interface SseFrame {
  readonly event: string;
  readonly data: string;
  readonly lastEventId?: string;
  readonly retryMs?: number;
}

export class SseParser {
  private buffer = '';
  private seenFirstChunk = false;
  private eventName = '';
  private dataLines: string[] = [];
  private lastEventId: string | undefined;
  private retryMs: number | undefined;

  /** Feeds a text chunk; returns every event completed by it. */
  push(chunk: string): SseFrame[] {
    let text = chunk;
    if (!this.seenFirstChunk) {
      // The spec's optional BOM arrives, if at all, as the stream's very first character.
      text = text.replace(/^\uFEFF/, '');
      this.seenFirstChunk = true;
    }
    this.buffer += text;
    const frames: SseFrame[] = [];
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline === -1) break;
      const line = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      const frame = this.applyLine(line);
      if (frame !== null) frames.push(frame);
    }
    return frames;
  }

  /** One SSE line: a blank line dispatches the pending event, anything else accumulates it. */
  private applyLine(line: string): SseFrame | null {
    if (line === '') return this.takeEvent();
    if (line.startsWith(':')) return null;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.eventName = value;
    else if (field === 'data') this.dataLines.push(value);
    else if (field === 'id') this.lastEventId = value;
    else if (field === 'retry') this.noteRetry(value);
    return null;
  }

  private noteRetry(value: string): void {
    const ms = Number.parseInt(value, 10);
    if (Number.isFinite(ms) && ms >= 0) this.retryMs = ms;
  }

  /** True when the buffer holds an unterminated event — an EOF now is a truncated stream. */
  get pending(): boolean {
    return this.buffer !== '' || this.dataLines.length > 0 || this.eventName !== '';
  }

  private takeEvent(): SseFrame | null {
    const hadAnything =
      this.eventName !== '' || this.dataLines.length > 0 || this.lastEventId !== undefined || this.retryMs !== undefined;
    const frame: SseFrame = {
      event: this.eventName,
      data: this.dataLines.join('\n'),
      ...(this.lastEventId !== undefined ? { lastEventId: this.lastEventId } : {}),
      ...(this.retryMs !== undefined ? { retryMs: this.retryMs } : {}),
    };
    this.eventName = '';
    this.dataLines = [];
    this.lastEventId = undefined;
    this.retryMs = undefined;
    return hadAnything ? frame : null;
  }
}

/** The snapshot's heartbeat — keep-alive, not news. */
export function isHeartbeat(frame: SseFrame): boolean {
  return frame.event === STATUS_HEARTBEAT_EVENT;
}

/** The first frame of every connection: the state re-sync a reconnect opens with (ADR-121). */
export function isSnapshot(frame: SseFrame): boolean {
  return frame.event === STATUS_SNAPSHOT_EVENT;
}

/**
 * Reads a `fetch` response body to completion, parsing frames as they arrive. This is the
 * connection layer's inner half — no sockets, no retry loop, just bytes to frames — so it
 * is exactly the part a unit test can drive with a hand-made `ReadableStream`.
 *
 * The optional signal is how a synthetic user leaves (Phase 2): aborting cancels the reader,
 * the loop ends, and the caller learns whether the stream ended cleanly or was cut. It is
 * deliberately not a reconnect mechanism — ADR-122's spread reconnect is the driver's job,
 * and this function must stay the part that can be tested without a clock.
 */
export async function readSseBody(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void,
  options: { signal?: AbortSignal } = {},
): Promise<{ truncated: boolean }> {
  const parser = new SseParser();
  const decoder = new TextDecoder();
  const reader = body.getReader();
  const onAbort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const emit = (frames: readonly SseFrame[]): void => {
    for (const frame of frames) onFrame(frame);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value !== undefined) emit(parser.push(decoder.decode(value, { stream: true })));
      if (done) break;
    }
    const tail = decoder.decode();
    if (tail !== '') emit(parser.push(tail));
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
  return { truncated: parser.pending };
}
