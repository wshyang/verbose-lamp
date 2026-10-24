import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { activityFixture } from '../../test-utils/fixtures.js';
import { useAdminActivities, useAdminDashboard, useAdminPointConfig } from './useAdminConfig.js';

let stub: FetchStub;
afterEach(() => stub?.restore());

const emptyStatus = {
  isPointConfigSet: false,
  courtCount: 0,
  enabledCourtCount: 0,
  activityCount: 0,
  activeActivityCount: 0,
  facilitatorCount: 0,
  participantCount: 0,
  teamCount: 0,
  matchCount: 0,
  scanCount: 0,
};

describe('useAdminDashboard', () => {
  it('lists the bootstrap steps still open (B6–B7)', async () => {
    stub = installFetchStub({ 'GET /api/admin/dashboard': { body: { status: emptyStatus } } });
    const { result } = renderHook(() => useAdminDashboard());

    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.blockers).toHaveLength(2);
  });

  it('clears the checklist once the event is configured', async () => {
    stub = installFetchStub({
      'GET /api/admin/dashboard': {
        body: {
          status: {
            ...emptyStatus,
            isPointConfigSet: true,
            enabledCourtCount: 2,
            activeActivityCount: 3,
            facilitatorCount: 4,
          },
        },
      },
    });
    const { result } = renderHook(() => useAdminDashboard());

    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.blockers).toHaveLength(0);
  });
});

describe('useAdminPointConfig', () => {
  it('saves the numbers as integers, not strings', async () => {
    stub = installFetchStub({
      'GET /api/admin/point-config': { body: { pointConfig: null } },
      'PUT /api/admin/point-config': {
        body: {
          pointConfig: {
            fringeParticipationPoints: 5,
            fringePassportBonusPoints: 20,
            fringePassportStations: 4,
            updatedAt: '2026-09-29T03:00:00.000Z',
            updatedByUsername: 'superadmin',
          },
        },
      },
    });
    const { result } = renderHook(() => useAdminPointConfig());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setParticipationPoints('5'));
    // ADR-176 — the passport pair travels together; a threshold without a bonus is inert.
    act(() => result.current.setPassportBonusPoints('20'));
    act(() => result.current.setPassportStations('4'));
    await act(async () => {
      await result.current.submit();
    });

    expect(stub.callsTo('PUT /api/admin/point-config')[0]?.body).toEqual({
      fringeParticipationPoints: 5,
      fringePassportBonusPoints: 20,
      fringePassportStations: 4,
    });
  });
});

describe('useAdminActivities', () => {
  it('creates an activity and toggles one inactive', async () => {
    stub = installFetchStub({
      'GET /api/admin/activities': { body: { items: [activityFixture] } },
      'POST /api/admin/activities': { status: 201, body: { activity: activityFixture } },
      'PATCH /api/admin/activities/activity-1/active': { body: { activity: activityFixture } },
    });
    const { result } = renderHook(() => useAdminActivities());
    await waitFor(() => expect(result.current.activities).toHaveLength(1));

    act(() => result.current.setDraft({
        activityName: 'Tug of War',
        tiers: [{ label: 'Award', points: '20' }],
        assignedFacilitatorId: '',
        isActive: true,
      }));
    await act(async () => {
      await result.current.submitDraft();
    });
    expect(stub.callsTo('POST /api/admin/activities')[0]?.body).toMatchObject({
      activityName: 'Tug of War',
      awardTiers: [{ label: 'Award', points: 20 }],
    });

    await act(async () => result.current.setActive({ activityId: 'activity-1', isEnabled: false }));
    expect(stub.callsTo('PATCH /api/admin/activities/activity-1/active')[0]?.body).toEqual({
      isEnabled: false,
    });
  });

  it('prefills the draft when editing and keeps the current active flag', async () => {
    stub = installFetchStub({
      'GET /api/admin/activities': { body: { items: [activityFixture] } },
      'PUT /api/admin/activities/activity-1': { body: { activity: activityFixture } },
    });
    const { result } = renderHook(() => useAdminActivities());
    await waitFor(() => expect(result.current.activities).toHaveLength(1));

    act(() => result.current.beginEdit('activity-1'));
    expect(result.current.draft.activityName).toBe('Beach Volleyball Rally');

    await act(async () => {
      await result.current.submitDraft();
    });
    expect(stub.callsTo('PUT /api/admin/activities/activity-1')[0]?.body).toMatchObject({
      isActive: true,
    });
  });
});

