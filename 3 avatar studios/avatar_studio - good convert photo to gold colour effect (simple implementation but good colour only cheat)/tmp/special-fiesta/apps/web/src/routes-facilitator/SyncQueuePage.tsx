import { emptyStates } from '@psd/contracts';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import { StaffShell } from './StaffShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatTime } from '../lib/format.js';
import { useLiveList } from '../lib/hooks/useLiveList.js';
import { useSync } from '../lib/session/syncContext.js';

/** S32 — offline sync queue (F29). Visible count, manual retry, and per-entry failure detail. */
export function SyncQueuePage() {
  const sync = useSync();
  const help = useFieldHelp();
  // ADR-095 — the 15-second auto-drain removes rows while a facilitator is reaching for
  // Discard; animating the departure keeps the finger and the row honest with each other.
  const queueRows = useLiveList<HTMLTableSectionElement>();
  const statusClass = sync.isOnline ? 'console-status console-status--ok' : 'console-status console-status--warn';
  const statusLabel = sync.isOnline
    ? `Online · ${sync.pendingCount} waiting`
    : `Offline · ${sync.pendingCount} waiting`;

  return (
    <StaffShell title="Sync queue">
      <section className="console-panel">
        <p className={statusClass} data-testid="sync__status">
          {statusLabel}
        </p>
        {sync.lastSyncError ? (
          <p className="console-danger" role="alert" data-testid="sync__error">
            {sync.lastSyncError}
          </p>
        ) : null}
        <button
          type="button"
          className="console-button console-button--primary console-button--huge"
          data-testid="sync__retry"
          disabled={sync.isSyncing || sync.pendingCount === 0}
          onClick={sync.retryNow}
        >
          Sync now
        </button>
      </section>

      <section className="console-panel">
        <h2>
          Waiting scans <FieldHelp label="The sync queue" topic="syncQueueActions" help={help} />
        </h2>
        <StateMessage
          isLoading={false}
          error={null}
          isEmpty={sync.items.length === 0}
          emptyText={emptyStates.syncQueue}
          testId="sync-queue"
        />
        <table className="console-table">
          <tbody ref={queueRows}>
            {sync.items.map((item) => (
              <tr
                key={item.clientScanUuid}
                data-testid="sync__row"
                data-live-key={item.clientScanUuid}
                data-live-signature={`${item.attempts}|${item.lastError ?? ''}|${item.isParked}`}
              >
                <td>{item.nickname}</td>
                <td>{item.activityName}</td>
                <td>+{item.pointValue}</td>
                <td>{formatTime(item.clientTimestamp)}</td>
                <td className="console-muted">
                  {item.lastError ? `${item.attempts}× ${item.lastError}` : 'queued'}
                  {item.isParked ? ' · held for manual retry' : ''}
                </td>
                <td>
                  <button
                    type="button"
                    className="console-button console-button--ghost"
                    data-testid="sync__discard"
                    onClick={() => sync.discard(item.clientScanUuid)}
                  >
                    Discard
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </StaffShell>
  );
}
