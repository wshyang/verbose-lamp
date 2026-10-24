import type { SwagClaimView, SwagRoundView, SwagStationView } from '@psd/contracts';
import { apiGet, apiPatch, apiPost, apiPut } from './client.js';

/** ADR-110 — the swag counter (S25–S31 shapes mirrored) plus its admin surface. */

export function fetchSwagStations(): Promise<{ items: SwagStationView[] }> {
  return apiGet('/api/swag/stations');
}

export function fetchSwagStation(stationId: string): Promise<{ station: SwagStationView }> {
  return apiGet(`/api/swag/stations/${stationId}`);
}

export function fetchSwagClaims(roundId: string): Promise<{ items: SwagClaimView[] }> {
  return apiGet(`/api/swag/rounds/${roundId}/claims`);
}

export function openSwagRound(stationId: string): Promise<{ round: SwagRoundView }> {
  return apiPost(`/api/swag/stations/${stationId}/rounds`, {});
}

export function advanceSwagRound(roundId: string): Promise<{ round: SwagRoundView }> {
  return apiPost(`/api/swag/rounds/${roundId}/advance`, {});
}

export function endSwagRound(roundId: string): Promise<{ round: SwagRoundView }> {
  return apiPost(`/api/swag/rounds/${roundId}/end`, {});
}

export function postSwagClaim(body: {
  nickname: string;
  roundId: string;
  itemLabel: string;
  clientClaimUuid: string;
}): Promise<{ claim: SwagClaimView; duplicate: boolean }> {
  return apiPost('/api/swag/claims', body);
}

/** ADR-159 — the counter's own ten-second take-back. */
export function undoSwagClaim(claimId: string): Promise<{ claim: SwagClaimView }> {
  return apiPost(`/api/swag/claims/${claimId}/undo`, {});
}

export function fetchAdminSwagClaims(stationId?: string): Promise<{ items: SwagClaimView[] }> {
  const query = stationId ? `?stationId=${encodeURIComponent(stationId)}` : '';
  return apiGet(`/api/admin/swag-claims${query}`);
}

export function voidSwagClaim(input: {
  claimId: string;
  reason: string;
}): Promise<{ claim: SwagClaimView }> {
  return apiPost(`/api/admin/swag-claims/${input.claimId}/void`, { reason: input.reason });
}

export function unvoidSwagClaim(input: {
  claimId: string;
  reason: string;
}): Promise<{ claim: SwagClaimView }> {
  return apiPost(`/api/admin/swag-claims/${input.claimId}/unvoid`, { reason: input.reason });
}

export function fetchAdminSwagStations(): Promise<{ items: SwagStationView[] }> {
  return apiGet('/api/admin/swag-stations');
}

export function createSwagStation(body: {
  stationName: string;
  items: { label: string; limit: number }[];
}): Promise<{ station: SwagStationView }> {
  return apiPost('/api/admin/swag-stations', body);
}

export function toggleSwagStationActive(stationId: string): Promise<{ station: SwagStationView }> {
  return apiPatch(`/api/admin/swag-stations/${stationId}/active`, {});
}

export function updateSwagStation(input: {
  stationId: string;
  stationName: string;
  items: { label: string; limit: number }[];
}): Promise<{ station: SwagStationView }> {
  return apiPut(`/api/admin/swag-stations/${input.stationId}`, {
    stationName: input.stationName,
    items: input.items,
  });
}
