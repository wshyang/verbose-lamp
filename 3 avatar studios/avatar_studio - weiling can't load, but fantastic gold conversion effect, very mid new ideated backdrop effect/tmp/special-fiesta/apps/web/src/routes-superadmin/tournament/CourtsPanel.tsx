import type { AdminCourtView } from '@psd/contracts';
import { emptyStates } from '@psd/contracts';
import { ConsoleField } from '../../components/console/ConsoleField.js';
import type { TournamentCourts } from '../../lib/hooks/useTournamentCourts.js';

/**
 * ADR-288 — the venue's courts (fds S41–S43), on the Control subtab in every phase: a court is the
 * venue's, not a tournament's. Add, rename or renumber here; switch on or off here too until a day is
 * live — then the switch belongs to "Courts and timings", which re-plans the day around it in the same
 * act (an on/off here would leave the plan pointing at a court nobody can start a match on).
 */

function CourtForm(props: { courts: TournamentCourts; isPending: boolean }) {
  const { courts } = props;
  const isEditing = courts.editingId !== null;
  return (
    <form
      className="console-row"
      data-testid="tournament-courts__form"
      onSubmit={(event) => {
        event.preventDefault();
        void courts.submit();
      }}
    >
      <ConsoleField id="court-number" label="Court number (1–20)" topic="courtNumber">
        <input
          className="console-input"
          inputMode="numeric"
          value={courts.draft.courtNumber}
          data-testid="tournament-courts__number"
          onChange={(event) => courts.update({ courtNumber: event.target.value })}
        />
      </ConsoleField>
      <ConsoleField id="court-label" label="Label" topic="courtLabel">
        <input
          className="console-input"
          maxLength={30}
          value={courts.draft.label}
          data-testid="tournament-courts__label"
          onChange={(event) => courts.update({ label: event.target.value })}
        />
      </ConsoleField>
      <button type="submit" className="console-button console-button--primary" disabled={props.isPending} data-testid="tournament-courts__submit">
        {isEditing ? 'Save court' : 'Add court'}
      </button>
      {isEditing ? (
        <button type="button" className="console-button console-button--ghost" data-testid="tournament-courts__cancel" onClick={courts.cancelEdit}>
          Cancel
        </button>
      ) : null}
    </form>
  );
}

function CourtRow(props: { court: AdminCourtView; courts: TournamentCourts; canToggle: boolean; isPending: boolean }) {
  const { court, courts } = props;
  return (
    <li className="console-row console-row--between" data-testid="tournament-courts__row">
      <span>
        #{court.courtNumber} {court.label} — <span className={court.isEnabled ? 'console-ok' : 'console-muted'}>{court.isEnabled ? 'On' : 'Off'}</span>
      </span>
      <span className="console-row">
        <button type="button" className="console-button" data-testid="tournament-courts__edit" onClick={() => courts.beginEdit(court)}>
          Edit
        </button>
        {props.canToggle ? (
          <button type="button" className="console-button" disabled={props.isPending} data-testid="tournament-courts__toggle" onClick={() => void courts.toggle(court)}>
            {court.isEnabled ? 'Switch off' : 'Switch on'}
          </button>
        ) : null}
      </span>
    </li>
  );
}

export function CourtsPanel(props: { list: readonly AdminCourtView[]; courts: TournamentCourts; isLive: boolean; isPending: boolean }) {
  const canToggle = !props.isLive;
  return (
    <section className="console-panel" data-testid="tournament-courts">
      <h2>Courts</h2>
      {props.list.length === 0 ? (
        <p className="console-muted" data-testid="tournament-courts__empty">
          {emptyStates.courtList}
        </p>
      ) : null}
      <ul className="console-list">
        {props.list.map((court) => (
          <CourtRow key={court.id} court={court} courts={props.courts} canToggle={canToggle} isPending={props.isPending} />
        ))}
      </ul>
      {props.isLive ? (
        <p className="console-meta" data-testid="tournament-courts__live-note">
          The day is live: switch courts on or off under Courts and timings, which re-plans the day around them.
        </p>
      ) : null}
      <CourtForm courts={props.courts} isPending={props.isPending} />
    </section>
  );
}
