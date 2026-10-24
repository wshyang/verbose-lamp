import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { participantFixture, scanFixture, teamFixture } from '../../test-utils/fixtures.js';
import { useAdminParticipants, useAdminTeams, useParticipantDetail } from './useAdminDirectory.js';

let stub: FetchStub;
afterEach(() => stub?.restore());

describe('useAdminParticipants', () => {
  it('searches on submit rather than on every keystroke', async () => {
    stub = installFetchStub({
      'GET /api/admin/participants': { body: { items: [{ participant: participantFixture, teamName: 'Sandstorm' }] } },
    });
    const { result } = renderHook(() => useAdminParticipants());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    act(() => result.current.setSearch('Beach'));
    expect(stub.calls).toHaveLength(1);

    act(() => result.current.applySearch());
    await waitFor(() =>
      expect(stub.calls.some((call) => call.path === '/api/admin/participants?search=Beach')).toBe(true),
    );
  });
});

describe('useParticipantDetail', () => {
  it('returns identity, totals, team and scans together', async () => {
    stub = installFetchStub({
      'GET /api/admin/participants/participant-1': {
        body: {
          participant: participantFixture,
          totals: { fringePoints: 15, tournamentPoints: 10, totalPoints: 25, scanCount: 1 },
          team: teamFixture,
          scans: [scanFixture],
        },
      },
    });
    const { result } = renderHook(() => useParticipantDetail('participant-1'));

    await waitFor(() => expect(result.current.participant?.nickname).toBe('BeachBoss'));
    expect(result.current.totals?.totalPoints).toBe(25);
    expect(result.current.team?.teamName).toBe('Sandstorm');
    expect(result.current.scans).toHaveLength(1);
  });
});

describe('useAdminTeams', () => {
  it('lists teams with their rosters', async () => {
    stub = installFetchStub({
      'GET /api/admin/teams': {
        body: { items: [{ team: teamFixture, memberNicknames: ['BeachBoss', 'SandSprinter'] }] },
      },
    });
    const { result } = renderHook(() => useAdminTeams());

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0]?.memberNicknames).toContain('SandSprinter');
  });
});
