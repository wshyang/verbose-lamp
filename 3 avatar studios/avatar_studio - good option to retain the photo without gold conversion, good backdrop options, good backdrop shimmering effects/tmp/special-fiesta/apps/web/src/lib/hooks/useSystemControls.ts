import { useCallback, useState } from 'react';
import type { ServiceStateResponse } from '../api/admin.js';
import {
  disableStationOffline,
  enableStationOffline,
  fetchServiceState,
  pauseSocial,
  restartServer,
  resumeSocial,
} from '../api/admin.js';
import { useAction } from './useAction.js';
import { firstError, useAsyncData } from './useAsyncData.js';

/**
 * What the two panels report, derived only from an answer that actually arrived.
 *
 * There are deliberately no defaults for the not-yet-read case. A default is a claim, and both
 * claims available here are harmful: "not paused" invites an operator to pause something that
 * is already paused, and "can restart" puts an enabled restart in front of a deployment that
 * cannot honour it. `null` instead, and the page says it does not know yet.
 */
function describeServiceState(data: ServiceStateResponse) {
  return {
    isSocialPaused: data.state.isSocialPaused,
    pausedBy: data.state.updatedByUsername,
    pausedAt: data.state.updatedAt,
    canRestart: data.canRestart,
    isStationOfflineEnabled: data.state.isStationOfflineEnabled,
    stationOfflineAt: data.state.stationOfflineUpdatedAt,
  };
}

/**
 * ADR-118 — S61, the operations switch.
 *
 * Two controls that have nothing to do with each other except the afternoon on which they get
 * pressed: pause the non-essentials, and restart the app.
 *
 * `hasAskedToRestart` is the only state the restart has, and deliberately so. The 202 is the
 * last thing this server says before it exits, so there is no later answer to wait for and no
 * "restarted" to report — the honest thing the console can know is that it asked. Recovery is
 * the operator reloading a page that works again, not a spinner resolving.
 */
export function useSystemControls() {
  const state = useAsyncData(useCallback(() => fetchServiceState(), []));
  const reload = state.reload;

  const pause = useAction(
    useCallback(() => pauseSocial(), []),
    reload,
  );
  const resume = useAction(
    useCallback(() => resumeSocial(), []),
    reload,
  );
  const enableOffline = useAction(
    useCallback(() => enableStationOffline(), []),
    reload,
  );
  const disableOffline = useAction(
    useCallback(() => disableStationOffline(), []),
    reload,
  );
  const [hasAskedToRestart, setHasAskedToRestart] = useState(false);
  const restart = useAction(
    useCallback(() => restartServer(), []),
    useCallback(() => setHasAskedToRestart(true), []),
  );

  return {
    view: state.data === null ? null : describeServiceState(state.data),
    hasAskedToRestart,
    isLoading: state.isLoading,
    error: firstError([
      state.error,
      pause.error,
      resume.error,
      enableOffline.error,
      disableOffline.error,
      restart.error,
    ]),
    isBusy:
      pause.isPending ||
      resume.isPending ||
      enableOffline.isPending ||
      disableOffline.isPending ||
      restart.isPending,
    pauseSocial: () => void pause.run(undefined),
    resumeSocial: () => void resume.run(undefined),
    enableStationOffline: () => void enableOffline.run(undefined),
    disableStationOffline: () => void disableOffline.run(undefined),
    restart: () => void restart.run(undefined),
  };
}
