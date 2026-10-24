import { emptyStates } from '@psd/contracts';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { AdminShell } from './AdminShell.js';
import { ReasonDialog } from '../components/console/ReasonDialog.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatDateTime } from '../lib/format.js';
import { useScanCorrections } from '../lib/hooks/useAdminCorrections.js';

/** S50–S51 — all fringe scans with void / unvoid (F47/F48). */
export function ScansPage() {
  const corrections = useScanCorrections();
  const dialogTitle =
    corrections.target?.kind === 'void-scan'
      ? `Void scan — ${corrections.target.title}`
      : `Restore scan — ${corrections.target?.title ?? ''}`;

  return (
    <AdminShell title="Fringe scans">
      <section className="console-panel">
        <div className="console-row">
          <ConsoleField id="scan-activity" label="Activity" topic="scanActivityFilter">
          <select
            id="scan-activity"
            className="console-select"
            data-testid="scans__activity-filter"
            style={{ maxWidth: 260 }}
            value={corrections.activityFilter}
            onChange={(event) => corrections.setActivityFilter(event.target.value)}
          >
            <option value="">All activities</option>
            {corrections.activityOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          </ConsoleField>
          <button
            type="button"
            className="console-button"
            data-testid="scans__refresh"
            onClick={corrections.reload}
          >
            Refresh
          </button>
        </div>
      </section>

      <section className="console-panel">
        <StateMessage
          isLoading={corrections.isLoading}
          error={corrections.error}
          isEmpty={corrections.scans.length === 0}
          emptyText={emptyStates.allScans}
          testId="scans"
        />
        <table className="console-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Participant</th>
              <th>Cluster</th>
              <th>Activity</th>
              <th>Round</th>
              <th>Points</th>
              <th>Facilitator</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {corrections.scans.map((scan) => (
              <tr key={scan.id} data-testid="scans__row" data-voided={scan.isVoided}>
                <td>{formatDateTime(scan.scannedAt)}</td>
                <td>{scan.participantNickname}</td>
                <td>{scan.clusterCode}</td>
                <td>{scan.activityNameSnapshot}</td>
                <td>{scan.roundNumberSnapshot}</td>
                <td>{scan.pointsAwardedSnapshot}</td>
                <td>{scan.facilitatorUsernameSnapshot}</td>
                <td>
                  {scan.isVoided ? (
                    <button
                      type="button"
                      className="console-button"
                      data-testid="scans__unvoid"
                      onClick={() =>
                        corrections.openCorrection({
                          kind: 'unvoid-scan',
                          id: scan.id,
                          title: `${scan.participantNickname} @ ${scan.activityNameSnapshot}`,
                        })
                      }
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="console-button console-button--danger"
                      data-testid="scans__void"
                      onClick={() =>
                        corrections.openCorrection({
                          kind: 'void-scan',
                          id: scan.id,
                          title: `${scan.participantNickname} @ ${scan.activityNameSnapshot}`,
                        })
                      }
                    >
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {corrections.target ? (
        <ReasonDialog
          title={dialogTitle}
          reason={corrections.reason}
          onReasonChange={corrections.setReason}
          onConfirm={() => void corrections.confirm()}
          onCancel={corrections.closeDialog}
          isBusy={corrections.isBusy}
          error={corrections.dialogError}
        />
      ) : null}
    </AdminShell>
  );
}
