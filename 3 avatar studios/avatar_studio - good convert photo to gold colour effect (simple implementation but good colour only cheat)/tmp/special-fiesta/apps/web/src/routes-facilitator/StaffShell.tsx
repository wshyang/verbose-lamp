import type { ReactNode } from 'react';
import { ConsoleShell } from '../components/console/ConsoleShell.js';
import { useSync } from '../lib/session/syncContext.js';

/**
 * Facilitator chrome. The pending-sync count rides in the header on every station screen so
 * an offline queue is never a surprise at the end of the day (fds.md DC-004).
 */

const TABS = [
  { to: '/staff', label: 'Stations', end: true },
  { to: '/staff/sync', label: 'Sync queue' },
  { to: '/staff/pin-reset', label: 'PIN reset' },
];

export function StaffShell(props: { title: string; children: ReactNode }) {
  const sync = useSync();
  const connectionLabel = sync.isOnline ? 'Online' : 'Offline';
  const pendingLabel = sync.pendingCount > 0 ? `${sync.pendingCount} queued` : 'All synced';

  return (
    <ConsoleShell
      title={props.title}
      tabs={TABS}
      meta={
        <span className={sync.isOnline ? 'console-badge console-ok' : 'console-badge console-danger'}>
          {connectionLabel} · {pendingLabel}
        </span>
      }
    >
      {props.children}
    </ConsoleShell>
  );
}
