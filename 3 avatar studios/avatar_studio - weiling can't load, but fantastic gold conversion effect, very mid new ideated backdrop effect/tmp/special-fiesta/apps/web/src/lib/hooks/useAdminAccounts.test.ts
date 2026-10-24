import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { activityFixture } from '../../test-utils/fixtures.js';
import { useAdminFacilitators, useAdminSuperadmins } from './useAdminAccounts.js';

let stub: FetchStub;
afterEach(() => stub?.restore());

const facilitator = {
  id: 'facilitator-1',
  username: 'court1',
  displayLabel: 'Court 1 marshal',
  defaultStationType: 'court' as const,
  defaultStationId: 'court-1',
  defaultStationLabel: 'Court 1 — Palawan',
  createdAt: '2026-09-29T01:00:00.000Z',
  lastLoginAt: null,
};

function mountFacilitators() {
  stub = installFetchStub({
    'GET /api/admin/facilitators': { body: { items: [facilitator] } },
    'GET /api/admin/tournament': { body: { courts: [{ id: 'court-1', courtNumber: 1, label: 'Sand 1', isEnabled: true }], tournament: null, teams: [] } },
    'GET /api/admin/activities': { body: { items: [activityFixture] } },
    'POST /api/admin/facilitators': { status: 201, body: { facilitator } },
    'PUT /api/admin/facilitators/facilitator-1': { body: { facilitator } },
  });
  return renderHook(() => useAdminFacilitators());
}

describe('useAdminFacilitators', () => {
  it('offers activity options for a fringe assignment and the venue courts for a court (ADR-285)', async () => {
    const { result } = mountFacilitators();
    await waitFor(() => expect(result.current.facilitators).toHaveLength(1));

    act(() =>
      result.current.setDraft({ ...result.current.draft, defaultStationType: 'court' }),
    );
    await waitFor(() => expect(result.current.stationChoices).toEqual([{ id: 'court-1', label: 'Sand 1', type: 'court' }]));

    act(() => result.current.setDraft({ ...result.current.draft, defaultStationType: 'none' }));
    await waitFor(() => expect(result.current.stationChoices).toEqual([]));

    act(() =>
      result.current.setDraft({ ...result.current.draft, defaultStationType: 'fringe_activity' }),
    );
    await waitFor(() =>
      expect(result.current.stationChoices[0]?.label).toBe('Beach Volleyball Rally'),
    );
  });

  it('omits the passcode on edit when it is left blank', async () => {
    const { result } = mountFacilitators();
    await waitFor(() => expect(result.current.facilitators).toHaveLength(1));

    act(() => result.current.beginEdit('facilitator-1'));
    expect(result.current.draft['passcode']).toBe('');

    await act(async () => {
      await result.current.submitDraft();
    });

    const [call] = stub.callsTo('PUT /api/admin/facilitators/facilitator-1');
    expect(call?.body).toMatchObject({ defaultStationType: 'court', defaultStationId: 'court-1' });
    expect((call?.body as Record<string, unknown>)['passcode']).toBeUndefined();
  });
});

describe('useAdminSuperadmins', () => {
  it('creates an account and rotates a passcode', async () => {
    const superadmin = {
      id: 'superadmin-1',
      username: 'superadmin',
      createdAt: '2026-09-29T00:00:00.000Z',
      lastLoginAt: null,
    };
    stub = installFetchStub({
      'GET /api/admin/superadmins': { body: { items: [superadmin] } },
      'POST /api/admin/superadmins': { status: 201, body: { superadmin } },
      'PUT /api/admin/superadmins/superadmin-1/passcode': { body: { superadmin } },
    });
    const { result } = renderHook(() => useAdminSuperadmins());
    await waitFor(() => expect(result.current.superadmins).toHaveLength(1));

    act(() => result.current.setUsername('secondadmin'));
    act(() => result.current.setPasscode('8888'));
    await act(async () => result.current.submitCreate());
    expect(stub.callsTo('POST /api/admin/superadmins')[0]?.body).toEqual({
      username: 'secondadmin',
      passcode: '8888',
    });

    act(() => result.current.setRotatingId('superadmin-1'));
    act(() => result.current.setRotatePasscode('7777'));
    await act(async () => result.current.submitRotate());
    expect(stub.callsTo('PUT /api/admin/superadmins/superadmin-1/passcode')[0]?.body).toEqual({
      passcode: '7777',
    });
  });
});
