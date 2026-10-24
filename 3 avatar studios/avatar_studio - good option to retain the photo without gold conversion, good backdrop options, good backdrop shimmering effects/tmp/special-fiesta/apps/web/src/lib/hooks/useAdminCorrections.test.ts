import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { messages } from '@psd/contracts';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { scanFixture } from '../../test-utils/fixtures.js';
import { useScanCorrections, useVoidAudit } from './useAdminCorrections.js';

let stub: FetchStub;
afterEach(() => stub?.restore());

const auditEntry = {
  id: 'audit-1',
  targetType: 'fringescan' as const,
  targetId: scanFixture.id,
  action: 'void' as const,
  reason: 'Wrong scan badge',
  performedByUsername: 'superadmin',
  performedAt: '2026-09-29T03:10:00.000Z',
};

describe('useScanCorrections', () => {
  it('derives the activity filter options from the scans on screen', async () => {
    stub = installFetchStub({
      'GET /api/admin/scans': { body: { items: [scanFixture] } },
      'POST /api/admin/scans/scan-1/void': { body: { scan: { ...scanFixture, isVoided: true } } },
    });
    const { result } = renderHook(() => useScanCorrections());
    await waitFor(() => expect(result.current.scans).toHaveLength(1));

    expect(result.current.activityOptions).toEqual([
      { id: 'activity-1', label: 'Beach Volleyball Rally' },
    ]);

    act(() => result.current.openCorrection({ kind: 'void-scan', id: 'scan-1', title: 'BeachBoss' }));
    act(() => result.current.setReason('Scanned the wrong badge'));
    await act(async () => {
      await result.current.confirm();
    });
    expect(stub.callsTo('POST /api/admin/scans/scan-1/void')[0]?.body).toEqual({
      reason: 'Scanned the wrong badge',
    });
  });

  it('demands a real reason, and does nothing with no row selected', async () => {
    stub = installFetchStub({ 'GET /api/admin/scans': { body: { items: [scanFixture] } } });
    const { result } = renderHook(() => useScanCorrections());
    await waitFor(() => expect(result.current.scans).toHaveLength(1));

    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.dialogError).toBeNull();

    act(() => result.current.openCorrection({ kind: 'void-scan', id: 'scan-1', title: 'BeachBoss' }));
    act(() => result.current.setReason('x'));
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.dialogError).toBe(messages.voidReasonRequired);
    expect(stub.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  });
});

describe('useVoidAudit', () => {
  it('reads the append-only correction log', async () => {
    stub = installFetchStub({ 'GET /api/admin/void-audit': { body: { items: [auditEntry] } } });
    const { result } = renderHook(() => useVoidAudit());

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.entries[0]?.reason).toBe('Wrong scan badge');
  });
});
