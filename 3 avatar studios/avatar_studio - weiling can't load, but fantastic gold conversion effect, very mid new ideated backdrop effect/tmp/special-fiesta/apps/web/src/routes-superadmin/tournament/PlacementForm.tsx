import type { AdminCourtView, AdminMatchView } from '@psd/contracts';
import { ConsoleField } from '../../components/console/ConsoleField.js';
import type { MatchPlacement } from '../../lib/hooks/useMatchPlacement.js';
import { seatLabel } from './MatchesPanel.js';

/**
 * ADR-289 — requirement 9: the desk puts a queued match on a court at a time. Shown above the match
 * tables while a move is open; with the scheduler running the move is pinned, and the planner plans
 * every other match around it.
 */

function CourtPicker(props: { placement: MatchPlacement; courts: readonly AdminCourtView[] }) {
  const { placement } = props;
  return (
    <ConsoleField id="placement-court" label="Court" topic="placementCourt">
      <select
        className="console-select"
        value={placement.draft.courtId}
        data-testid="tournament-placement__court"
        onChange={(event) => placement.update({ courtId: event.target.value })}
      >
        <option value="">— select —</option>
        {props.courts.map((court) => (
          <option key={court.id} value={court.id}>
            {court.label}
            {court.isEnabled ? '' : ' (off)'}
          </option>
        ))}
      </select>
    </ConsoleField>
  );
}

export function PlacementForm(props: { placement: MatchPlacement; match: AdminMatchView; courts: readonly AdminCourtView[]; isPending: boolean }) {
  const { placement, match } = props;
  return (
    <form
      className="console-panel"
      data-testid="tournament-placement"
      onSubmit={(event) => {
        event.preventDefault();
        void placement.confirm();
      }}
    >
      <h2>
        Move {match.code} — {seatLabel(match.a)} v {seatLabel(match.b)}
      </h2>
      <div className="console-row">
        <CourtPicker placement={placement} courts={props.courts} />
        <ConsoleField id="placement-time" label="Start" topic="placementStart">
          <input
            type="time"
            className="console-input"
            value={placement.draft.time}
            data-testid="tournament-placement__time"
            onChange={(event) => placement.update({ time: event.target.value })}
          />
        </ConsoleField>
      </div>
      {placement.problem === null ? null : (
        <p className="console-warning" role="status" data-testid="tournament-placement__problem">
          {placement.problem}
        </p>
      )}
      <div className="console-row">
        <button type="submit" className="console-button console-button--primary" disabled={props.isPending} data-testid="tournament-placement__confirm">
          Put it there
        </button>
        <button type="button" className="console-button console-button--ghost" data-testid="tournament-placement__cancel" onClick={placement.cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
