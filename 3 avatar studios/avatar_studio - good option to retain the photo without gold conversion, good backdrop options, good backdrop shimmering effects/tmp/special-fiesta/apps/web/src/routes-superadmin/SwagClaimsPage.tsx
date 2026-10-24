import { emptyStates } from '@psd/contracts';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { AdminShell } from './AdminShell.js';
import { ReasonDialog } from '../components/console/ReasonDialog.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatDateTime } from '../lib/format.js';
import { useSwagClaimCorrections } from '../lib/hooks/useAdminCorrections.js';

/**
 * ADR-159 — swag claims with void / unvoid, built as the fringe scans page's twin.
 *
 * Until now this was the one recorded fact on the day with no way back: a tote bag handed to
 * the wrong badge burned that participant's allowance and a unit of stock, and the only
 * remedy was a points adjustment that restored neither. Voiding here gives the allowance
 * back, so the person who never received the item can still collect it.
 *
 * The voided row stays on the table, marked, rather than disappearing — a line that vanished
 * would be indistinguishable from a handout that never registered, which is exactly how a
 * second bag ends up across the table.
 */
export function SwagClaimsPage() {
  const corrections = useSwagClaimCorrections();
  const dialogTitle =
    corrections.target?.kind === 'void-claim'
      ? `Void claim — ${corrections.target.title}`
      : `Restore claim — ${corrections.target?.title ?? ''}`;

  return (
    <AdminShell title="Swag claims">
      <section className="console-panel">
        <div className="console-row">
          <ConsoleField id="claim-station" label="Counter" topic="claimStationFilter">
          <select
            id="claim-station"
            className="console-select"
            data-testid="swag-claims__station-filter"
            style={{ maxWidth: 260 }}
            value={corrections.stationFilter}
            onChange={(event) => corrections.setStationFilter(event.target.value)}
          >
            <option value="">All counters</option>
            {corrections.stationOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          </ConsoleField>
          <button
            type="button"
            className="console-button"
            data-testid="swag-claims__refresh"
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
          isEmpty={corrections.claims.length === 0}
          emptyText={emptyStates.allSwagClaims}
          testId="swag-claims"
        />
        <table className="console-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Participant</th>
              <th>Cluster</th>
              <th>Counter</th>
              <th>Round</th>
              <th>Item</th>
              <th>Facilitator</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {corrections.claims.map((claim) => (
              <tr key={claim.id} data-testid="swag-claims__row" data-voided={claim.isVoided}>
                <td>{formatDateTime(claim.claimedAt)}</td>
                <td>{claim.participantNickname}</td>
                <td>{claim.clusterCode}</td>
                <td>{claim.stationNameSnapshot}</td>
                <td>{claim.roundNumberSnapshot}</td>
                <td>{claim.itemLabelSnapshot}</td>
                <td>
                  {claim.facilitatorUsernameSnapshot}
                  {/*
                   * ADR-138's distinction, carried over: a counter that fixed its own slip
                   * inside ten seconds is a different event from a superadmin reversal, and
                   * only the latter has a reason in the ledger to go and read.
                   */}
                  {claim.undoneAt ? (
                    <span className="console-muted" data-testid="swag-claims__self-undone">
                      {' '}
                      · taken back at the counter
                    </span>
                  ) : null}
                </td>
                <td>
                  {claim.isVoided ? (
                    <button
                      type="button"
                      className="console-button"
                      data-testid="swag-claims__unvoid"
                      onClick={() =>
                        corrections.openCorrection({
                          kind: 'unvoid-claim',
                          id: claim.id,
                          title: `${claim.participantNickname} · ${claim.itemLabelSnapshot}`,
                        })
                      }
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="console-button console-button--danger"
                      data-testid="swag-claims__void"
                      onClick={() =>
                        corrections.openCorrection({
                          kind: 'void-claim',
                          id: claim.id,
                          title: `${claim.participantNickname} · ${claim.itemLabelSnapshot}`,
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
        >
          <p className="console-muted">
            Voiding gives the participant their allowance back, so they can still be given this
            item. It does not bring the stock back.
          </p>
        </ReasonDialog>
      ) : null}
    </AdminShell>
  );
}
