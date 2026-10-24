import { describe, expect, it } from 'vitest';
import { STATUS_HEARTBEAT_EVENT, STATUS_SNAPSHOT_EVENT } from '@psd/contracts';
import { SseParser, isHeartbeat, isSnapshot, readSseBody } from './sseReader.js';

/**
 * The server's real shapes, as `writeFrame` writes them (apps/api/src/routes-status/stream.ts):
 * a snapshot carrying `retry:`, a heartbeat with empty data, and a data frame with a JSON body.
 */
const WIRE = [
  `event: ${STATUS_SNAPSHOT_EVENT}`,
  'data: {"alerts":[]}',
  'retry: 4123',
  '',
  `event: ${STATUS_HEARTBEAT_EVENT}`,
  'data: ',
  '',
  'event: announcement',
  'data: {"body":"Results at the desk in five minutes [r1:b2]"}',
  '',
  '',
].join('\n');

function parseAll(text: string): ReturnType<SseParser['push']> {
  const parser = new SseParser();
  return parser.push(text);
}

describe('SseParser — the wire as the server writes it', () => {
  it('parses snapshot (with retry), heartbeat, and data frames', () => {
    const frames = parseAll(WIRE);
    expect(frames).toHaveLength(3);

    const [snapshot, beat, announcement] = frames;
    expect(snapshot?.event).toBe(STATUS_SNAPSHOT_EVENT);
    expect(snapshot?.retryMs).toBe(4123);
    expect(isSnapshot(snapshot ?? { event: '', data: '' })).toBe(true);
    expect(JSON.parse(snapshot?.data ?? '{}')).toEqual({ alerts: [] });

    expect(beat?.event).toBe(STATUS_HEARTBEAT_EVENT);
    expect(beat?.data).toBe('');
    expect(isHeartbeat(beat ?? { event: '', data: '' })).toBe(true);

    expect(announcement?.event).toBe('announcement');
    expect(JSON.parse(announcement?.data ?? '{}')).toEqual({ body: 'Results at the desk in five minutes [r1:b2]' });
  });

  it('is split-chunk safe: one character at a time yields the same frames', () => {
    const whole = parseAll(WIRE);
    const parser = new SseParser();
    const pieced: ReturnType<SseParser['push']> = [];
    for (const ch of WIRE) pieced.push(...parser.push(ch));
    expect(pieced).toEqual(whole);
  });

  it('survives CRLF line endings — a proxy may rewrite them', () => {
    const frames = parseAll(WIRE.replace(/\n/g, '\r\n'));
    expect(frames).toHaveLength(3);
    expect(frames[0]?.retryMs).toBe(4123);
  });

  it('joins multi-line data with \\n, ignores comments and unknown fields, captures id', () => {
    const frames = parseAll(
      [': keep-alive comment', 'event: leaderboard', 'id: 42', 'data: line one', 'data: line two', 'x-custom: whatever', '', ''].join(
        '\n',
      ),
    );
    expect(frames).toHaveLength(1);
    expect(frames[0]?.data).toBe('line one\nline two');
    expect(frames[0]?.lastEventId).toBe('42');
    expect(frames[0]?.event).toBe('leaderboard');
  });

  it('strips exactly one space after the colon, and none the sender did not send', () => {
    const frames = parseAll(['data: padded', 'data:tight', '', ''].join('\n'));
    expect(frames[0]?.data).toBe('padded\ntight');
  });

  it('reports a truncated tail as pending — an EOF now is a cut stream, not a clean end', () => {
    const parser = new SseParser();
    parser.push('event: announcement\ndata: {"body":"cut of');
    expect(parser.push('')).toEqual([]);
    expect(parser.pending).toBe(true);
  });
});

describe('readSseBody — bytes to frames through a real stream', () => {
  it('decodes chunks as they arrive and reports a clean end', async () => {
    const chunks = [WIRE.slice(0, 40), WIRE.slice(40, 90), WIRE.slice(90)];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
    const seen: string[] = [];
    const result = await readSseBody(body, (frame) => seen.push(frame.event));
    expect(result.truncated).toBe(false);
    expect(seen).toEqual([STATUS_SNAPSHOT_EVENT, STATUS_HEARTBEAT_EVENT, 'announcement']);
  });

  it('flags a body that ends mid-event as truncated', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: x\ndata: half'));
        controller.close();
      },
    });
    const result = await readSseBody(body, () => undefined);
    expect(result.truncated).toBe(true);
  });
});
