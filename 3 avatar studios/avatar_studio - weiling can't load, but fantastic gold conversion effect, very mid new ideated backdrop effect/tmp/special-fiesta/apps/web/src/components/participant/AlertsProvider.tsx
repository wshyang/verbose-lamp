import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useAlertsStore, type AlertsStore } from '../../lib/hooks/useAlertsStore.js';

/**
 * ADR-063 — shares the alert state between the nav and the rooms.
 *
 * A context because two places must agree: the dot is drawn on the Teams tab in `GameboyShell`, and
 * the thing that clears it is the team room several routes inside `children`. Without shared state
 * the dot would keep burning after the participant had read the messages, which is the one behaviour
 * that makes an attention light untrustworthy.
 *
 * The decisions live in `useAlertsStore`; this file only passes them down.
 */
const AlertsContext = createContext<AlertsStore | null>(null);

export function AlertsProvider(props: { children: ReactNode }) {
  const store = useAlertsStore();
  return <AlertsContext.Provider value={store}>{props.children}</AlertsContext.Provider>;
}

/*
 * One shared no-op rather than three identical arrows: they are literally the same behaviour,
 * and three of them is three functions nothing ever calls.
 */
const noop = () => undefined;

const QUIET: AlertsStore = {
  // Nothing outside the shell has a socket, and "no socket" is not "a broken socket".
  isLive: true,
  teamChatUnread: false,
  chatUnread: false,
  galleryUnread: false,
  markFeedRead: noop,
  teamUpSoon: false,
  upSoonToast: null,
  dismissUpSoon: noop,
  announcements: [],
  dismissAnnouncement: noop,
};

/**
 * Null-safe on purpose: `GameboyShell` is the only mount point, and anything rendered outside it —
 * a test harness, a staff surface — should read "nothing to report" rather than throw.
 */
export function useAlerts(): AlertsStore {
  return useContext(AlertsContext) ?? QUIET;
}
