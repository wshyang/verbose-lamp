import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { participantFixture, participantSession, scanFixture } from '../../test-utils/fixtures.js';
import { readCached, writeCached } from '../storage/cacheStore.js';
import { SessionContext } from '../session/context.js';
import type { SessionState } from '../session/context.js';
import { useAvatarSave, useMyScans, useProfile, useQrCode } from './useParticipantHome.js';

let stub: FetchStub;
afterEach(() => stub?.restore());
beforeEach(() => window.localStorage.clear());

const totals = { fringePoints: 30, tournamentPoints: 10, totalPoints: 40, scanCount: 2 };
const ACTOR = participantSession.participant?.id as string;

function participantWrapper({ children }: { children: ReactNode }) {
  const state: SessionState = {
    session: participantSession,
    isLoading: false,
    refresh: () => Promise.resolve(participantSession),
    endSession: () => Promise.resolve(true),
  };
  return createElement(SessionContext.Provider, { value: state }, children);
}

describe('useProfile', () => {
  it('returns the participant and their point totals', async () => {
    stub = installFetchStub({ 'GET /api/me': { body: { participant: participantFixture, totals } } });
    const { result } = renderHook(() => useProfile());

    await waitFor(() => expect(result.current.participant?.nickname).toBe('BeachBoss'));
    expect(result.current.totals?.totalPoints).toBe(40);
  });

  it('paints its own remembered identity at once, and still asks for the points', async () => {
    writeCached('me', ACTOR, { participant: participantFixture, totals });
    const fresher = { ...totals, totalPoints: 65, scanCount: 4 };
    stub = installFetchStub({
      'GET /api/me': { body: { participant: participantFixture, totals: fresher } },
    });

    const { result } = renderHook(() => useProfile(), { wrapper: participantWrapper });

    // No spinner: the card the device already knows is on screen immediately…
    expect(result.current.participant?.nickname).toBe('BeachBoss');
    expect(result.current.isLoading).toBe(false);
    // …but the total is never served from memory alone (fds.md §642).
    await waitFor(() => expect(result.current.totals?.totalPoints).toBe(65));
    expect(stub.callsTo('GET /api/me')).toHaveLength(1);
  });
});

describe('useAvatarSave', () => {
  it('invalidates the profile snapshot before its caller reloads', async () => {
    writeCached('me', ACTOR, { participant: participantFixture, totals });
    stub = installFetchStub({
      'PUT /api/me/avatar': { body: { participant: participantFixture } },
    });
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAvatarSave(onSaved), { wrapper: participantWrapper });

    await act(async () => {
      await result.current.run({ avatarVariant: 2, avatarLook: 'look' });
    });

    expect(readCached('me', ACTOR, 60_000)).toBeNull();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

describe('useMyScans', () => {
  it('lists scans newest-first as the API returned them, with totals', async () => {
    stub = installFetchStub({
      'GET /api/me/scans': { body: { items: [scanFixture], totals } },
    });
    const { result } = renderHook(() => useMyScans());

    await waitFor(() => expect(result.current.scans).toHaveLength(1));
    expect(result.current.totalPoints).toBe(40);
    expect(result.current.scans[0]?.activityNameSnapshot).toBe('Beach Volleyball Rally');
  });
});

describe('useQrCode', () => {
  it('encodes the nickname into a data URL (F25)', async () => {
    const { result } = renderHook(() => useQrCode('BeachBoss'));

    await waitFor(() => expect(result.current.dataUrl).not.toBeNull());
    expect(result.current.dataUrl).toMatch(/^data:image\/svg\+xml/);
  });

  it('renders nothing until a nickname is known', () => {
    const { result } = renderHook(() => useQrCode(null));
    expect(result.current.dataUrl).toBeNull();
  });
});
