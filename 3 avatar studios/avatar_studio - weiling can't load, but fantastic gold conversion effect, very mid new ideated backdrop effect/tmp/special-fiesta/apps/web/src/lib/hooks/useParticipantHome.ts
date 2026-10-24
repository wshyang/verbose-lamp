import { useCallback, useEffect, useState } from 'react';
import type { ScanView } from '@psd/contracts';
import { fetchMe, fetchMyScans, updateAvatar } from '../api/participants.js';
import { renderQrDataUrl } from '../qr.js';
import { invalidateCached } from '../storage/cacheStore.js';
import { ME_CACHE, POINTS_BEARING_WARM_MS, SCANS_CACHE } from '../storage/cacheNames.js';
import { useAction } from './useAction.js';
import { useLocalCachedData } from './useLocalCachedData.js';

/** S3 QR home, S4 profile, S6 my scan history. */

/**
 * ADR-113 (amended) — warm start, never a TTL skip: this payload carries live points.
 * The card paints from the device instantly; the read still goes out on every mount.
 */
export function useProfile() {
  const state = useLocalCachedData({
    name: ME_CACHE,
    loader: useCallback(() => fetchMe(), []),
    ttlMs: POINTS_BEARING_WARM_MS,
  });
  return {
    participant: state.data?.participant ?? null,
    totals: state.data?.totals ?? null,
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}

/** S4 — save a redrawn avatar, then re-read the profile so every surface agrees. */
export function useAvatarSave(onSaved: () => void) {
  const onAvatarSaved = useCallback(() => {
    // ADR-113 — a write always wins over a cached profile, not merely its sixty-second TTL.
    invalidateCached(ME_CACHE);
    onSaved();
  }, [onSaved]);
  return useAction(updateAvatar, onAvatarSaved);
}

/**
 * The QR payload is the nickname (F25), rendered to a data URL once per nickname so the
 * image is available offline for the rest of the day.
 */
export function useQrCode(nickname: string | null) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nickname) {
      setDataUrl(null);
      return undefined;
    }
    let isCurrent = true;
    renderQrDataUrl(nickname)
      .then((url) => {
        if (isCurrent) setDataUrl(url);
      })
      .catch(() => {
        if (isCurrent) setError('Could not draw your QR code.');
      });
    return () => {
      isCurrent = false;
    };
  }, [nickname]);

  return { dataUrl, error };
}

export interface ScanHistory {
  scans: ScanView[];
  totalPoints: number;
  fringePoints: number;
  tournamentPoints: number;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

/** ADR-113 (amended) — the page that answers "did my scan land?" may never skip the ask. */
export function useMyScans(): ScanHistory {
  const state = useLocalCachedData({
    name: SCANS_CACHE,
    loader: useCallback(() => fetchMyScans(), []),
    ttlMs: POINTS_BEARING_WARM_MS,
  });
  return {
    scans: state.data?.items ?? [],
    totalPoints: state.data?.totals.totalPoints ?? 0,
    fringePoints: state.data?.totals.fringePoints ?? 0,
    tournamentPoints: state.data?.totals.tournamentPoints ?? 0,
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}
