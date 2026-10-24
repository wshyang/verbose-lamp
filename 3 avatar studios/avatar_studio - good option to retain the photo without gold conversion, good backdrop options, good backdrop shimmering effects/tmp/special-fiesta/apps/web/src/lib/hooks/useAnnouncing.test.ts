import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnnouncementView } from '@psd/contracts';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';
import { useAnnouncing } from './useAnnouncing.js';

/**
 * ADR-074 — composing and retracting announcements, for the superadmin console.
 *
 * Stubbed at `fetch` rather than at `lib/api/announcements.js`, which §5 would also allow. A layer
 * lower costs nothing here and covers the request-shaping module in the same pass, so the URLs and
 * bodies this hook actually puts on the wire are asserted rather than assumed — `retract` posting to
 * the wrong path would sail through a mocked-module test.
 *
 * The list is deliberately re-read after every write, with no optimism, so each write is *two*
 * requests. That is the behaviour, not an inefficiency to tidy up.
 */

const LIST = '/api/admin/announcements';

function announcement(id: string, body: string): AnnouncementView {
  return {
    id,
    body,
    authorLabel: 'superadmin',
    createdAt: '2026-09-30T00:00:00.000Z',
  };
}

let stub: FetchStub;

beforeEach(() => {
  const first = announcement('a1', 'Lunch is at noon');
  stub = installFetchStub({
    [`GET ${LIST}`]: { status: 200, body: { announcements: [first] } },
    [`POST ${LIST}`]: { status: 201, body: { announcement: first } },
    [`POST ${LIST}/:id/retract`]: { status: 200, body: { announcement: first } },
  });
});

afterEach(() => stub.restore());

describe('useAnnouncing', () => {
  it('loads what is already announced', async () => {
    const { result } = renderHook(() => useAnnouncing());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.announcements.map((row) => row.body)).toEqual(['Lunch is at noon']);
    expect(result.current.loadError).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isSending).toBe(false);
  });

  it('sends the body, then re-reads the list rather than patching it locally', async () => {
    const { result } = renderHook(() => useAnnouncing());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(stub.callsTo(`GET ${LIST}`)).toHaveLength(1);

    await act(async () => {
      result.current.send('Rain delay on court 2');
    });

    const [post] = stub.callsTo(`POST ${LIST}`);
    expect(post?.body).toEqual({ body: 'Rain delay on court 2' });
    // Two requests per write: the write, then the re-read that would include anyone else's.
    await waitFor(() => expect(stub.callsTo(`GET ${LIST}`)).toHaveLength(2));
  });

  it('retracts by id, in the url rather than the body', async () => {
    const { result } = renderHook(() => useAnnouncing());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.retract('a1');
    });

    // `callsTo` compares paths literally — the `:id` pattern is for route *matching* only.
    const retracted = `POST ${LIST}/a1/retract`;
    await waitFor(() => expect(stub.callsTo(retracted)).toHaveLength(1));
    expect(stub.callsTo(retracted)[0]?.body).toEqual({});
    await waitFor(() => expect(stub.callsTo(`GET ${LIST}`)).toHaveLength(2));
  });

  it('reports a refused send and stops sending', async () => {
    stub.restore();
    stub = installFetchStub({
      [`GET ${LIST}`]: { status: 200, body: { announcements: [] } },
      [`POST ${LIST}`]: { status: 400, body: { error: { message: 'That announcement is too long.' } } },
    });
    const { result } = renderHook(() => useAnnouncing());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.send('x'.repeat(500));
    });

    await waitFor(() => expect(result.current.error).toBe('That announcement is too long.'));
    expect(result.current.isSending).toBe(false);
  });

  it('clears a previous error when the next send starts', async () => {
    stub.restore();
    stub = installFetchStub({
      [`GET ${LIST}`]: { status: 200, body: { announcements: [] } },
      [`POST ${LIST}`]: { status: 400, body: { error: { message: 'no' } } },
    });
    const { result } = renderHook(() => useAnnouncing());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      result.current.send('first');
    });
    await waitFor(() => expect(result.current.error).toBe('no'));

    stub.routes[`POST ${LIST}`] = { status: 201, body: { announcement: announcement('a2', 'ok') } };
    await act(async () => {
      result.current.send('second');
    });

    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('keeps the load error separate from the send error', async () => {
    stub.restore();
    stub = installFetchStub({
      [`GET ${LIST}`]: { status: 500, body: { error: { message: 'console is offline' } } },
    });
    const { result } = renderHook(() => useAnnouncing());

    await waitFor(() => expect(result.current.loadError).toBe('console is offline'));
    // A failed read must not read as a failed send, or the compose box shows an error nobody caused.
    expect(result.current.error).toBeNull();
    expect(result.current.announcements).toEqual([]);
  });
});
