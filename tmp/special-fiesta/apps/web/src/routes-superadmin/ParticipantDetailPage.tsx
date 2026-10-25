import { emptyStates } from '@psd/contracts';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import { ConsoleField } from '../components/console/ConsoleField.js';
import type { ActivityView, ScoreAdjustmentView } from '@psd/contracts';
import { useRouteId } from '../lib/hooks/useRouteId.js';
import { AdminShell } from './AdminShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatDateTime, roundPoints } from '../lib/format.js';
import { useParticipantDetail } from '../lib/hooks/useAdminDirectory.js';
import { usePinReset, useScoreAdjustment } from '../lib/hooks/useStaffTools.js';
import { useAdminActivities } from '../lib/hooks/useAdminConfig.js';
import { ParticipantClusterPanel } from './ParticipantClusterPanel.js';

/** S53 participant detail (F50) + S56 PIN reset from the superadmin console. */
export function ParticipantDetailPage() {
  const participantId = useRouteId('participantId');
  const detail = useParticipantDetail(participantId);
  const participant = detail.participant;
  const pinHelp = useFieldHelp();
  const reset = usePinReset(
    participant ? { id: participant.id, nickname: participant.nickname } : undefined,
  );

  const totals = detail.totals;
  const { activities } = useAdminActivities();

  if (!participant || !totals) {
    return (
      <AdminShell title="Participant">
        <p className="loading">{detail.error ?? 'Loading…'}</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell title={participant.nickname}>
      <section className="console-panel">
        <h2>Identity</h2>
        <p>
          {participant.nickname} · {participant.clusterCode} · joined{' '}
          {formatDateTime(participant.createdAt)}
        </p>
        <p>
          Fringe {roundPoints(totals.fringePoints)} · Tournament {roundPoints(totals.tournamentPoints)} ·{' '}
          <strong>Total {roundPoints(totals.totalPoints)}</strong> · {totals.scanCount} scans
        </p>
        <p>Team: {detail.team ? detail.team.teamName : '—'}</p>
      </section>

      <ParticipantClusterPanel
        participantId={participant.id}
        clusterCode={participant.clusterCode}
        onMoved={detail.reload}
      />

      <section className="console-panel">
        <h2>Reset PIN</h2>
        <form
          className="console-row"
          data-testid="participant-detail__pin-form"
          onSubmit={(event) => {
            event.preventDefault();
            void reset.submitReset();
          }}
        >
          <input
            aria-describedby={pinHelp.tooltipId}
            className="console-input"
            data-testid="participant-detail__pin"
            inputMode="numeric"
            maxLength={4}
            style={{ maxWidth: 160 }}
            value={reset.newPin}
            onChange={(event) => reset.setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <FieldHelp label="Reset PIN" topic="pinResetNew" help={pinHelp} />
          <button
            type="submit"
            className="console-button console-button--primary"
            data-testid="participant-detail__pin-submit"
            disabled={reset.isBusy}
          >
            Set PIN
          </button>
        </form>
        {reset.confirmation ? (
          <p className="console-ok" data-testid="participant-detail__pin-confirmation">
            {reset.confirmation}
          </p>
        ) : null}
        {reset.error ? (
          <p className="console-danger" role="alert" data-testid="participant-detail__pin-error">
            {reset.error}
          </p>
        ) : null}
      </section>

      <AdjustmentPanel
        participantId={participant.id}
        activities={activities}
        adjustments={detail.adjustments}
        onApplied={detail.reload}
      />

      <section className="console-panel">
        <h2>Scan history</h2>
        <StateMessage
          isLoading={detail.isLoading}
          error={null}
          isEmpty={detail.scans.length === 0}
          emptyText={emptyStates.allScans}
          testId="participant-scans"
        />
        <table className="console-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Activity</th>
              <th>Round</th>
              <th>Points</th>
              <th>Facilitator</th>
            </tr>
          </thead>
          <tbody>
            {detail.scans.map((scan) => (
              <tr key={scan.id} data-testid="participant-detail__scan" data-voided={scan.isVoided}>
                <td>{formatDateTime(scan.scannedAt)}</td>
                <td>{scan.activityNameSnapshot}</td>
                <td>{scan.roundNumberSnapshot}</td>
                <td>{scan.pointsAwardedSnapshot}</td>
                <td>{scan.facilitatorUsernameSnapshot}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}

/**
 * ADR-117 — the manual correction. Deliberately placed under the totals it changes, and it
 * demands a station and a reason before it will do anything: the ledger is only worth having
 * if every line in it can be explained months later.
 */
function AdjustmentPanel(props: {
  participantId: string;
  activities: ActivityView[];
  adjustments: ScoreAdjustmentView[];
  onApplied: () => void;
}) {
  const { participantId, activities, adjustments, onApplied } = props;
  const form = useScoreAdjustment({ participantId, onApplied });
  return (
    <section className="console-panel">
      <h2>Adjust score</h2>
      <p className="console-muted">
        For putting the board right during the day. Negative values take points away. Every
        entry is kept — reverse a mistake with an opposite adjustment.
      </p>
      <form
        data-testid="participant-detail__adjust-form"
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit();
        }}
      >
        <ConsoleField id="adjust-activity" label="Station" topic="adjustActivity">
        <select
          id="adjust-activity"
          className="console-input"
          data-testid="participant-detail__adjust-activity"
          value={form.activityId}
          onChange={(event) => form.setActivityId(event.target.value)}
        >
          <option value="">Choose a station…</option>
          {activities.map((activity) => (
            <option key={activity.id} value={activity.id}>
              {activity.activityName}
            </option>
          ))}
        </select>
          </ConsoleField>
        <ConsoleField id="adjust-points" label="Points (negative to deduct)" topic="adjustPoints">
        <input
          id="adjust-points"
          className="console-input"
          data-testid="participant-detail__adjust-points"
          inputMode="numeric"
          style={{ maxWidth: 160 }}
          value={form.points}
          /* Text, not type=number: a leading minus is the common case here. */
          onChange={(event) => form.setPoints(event.target.value.replace(/[^\d-]/g, ''))}
        />
          </ConsoleField>
        <ConsoleField id="adjust-reason" label="Why" topic="adjustReason">
        <input
          id="adjust-reason"
          className="console-input"
          data-testid="participant-detail__adjust-reason"
          maxLength={200}
          value={form.reason}
          onChange={(event) => form.setReason(event.target.value)}
        />
          </ConsoleField>
        <div style={{ height: 12 }} />
        <button
          type="submit"
          className="console-button console-button--primary"
          data-testid="participant-detail__adjust-submit"
          disabled={form.isSaving}
        >
          Apply adjustment
        </button>
      </form>
      {form.confirmation ? (
        <p className="console-ok" data-testid="participant-detail__adjust-confirmation">
          {form.confirmation}
        </p>
      ) : null}
      {form.error ? (
        <p className="console-danger" role="alert" data-testid="participant-detail__adjust-error">
          {form.error}
        </p>
      ) : null}

      <table className="console-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Station</th>
            <th>Points</th>
            <th>Why</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {adjustments.map((entry) => (
            <tr key={entry.id} data-testid="participant-detail__adjustment">
              <td>{formatDateTime(entry.createdAt)}</td>
              <td>{entry.activityName}</td>
              <td>
                {entry.points > 0 ? '+' : ''}
                {entry.points}
              </td>
              <td>{entry.reason}</td>
              <td>{entry.createdByUsername}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
