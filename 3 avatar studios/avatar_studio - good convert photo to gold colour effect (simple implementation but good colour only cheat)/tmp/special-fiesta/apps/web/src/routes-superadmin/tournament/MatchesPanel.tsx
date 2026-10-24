import type { AdminMatchView, AdminSeatView } from '@psd/contracts';
import type { MatchGroups } from '../../lib/hooks/useTournamentDesk.js';
import type { DeskAct } from '../../lib/hooks/useTournamentActs.js';

/**
 * ADR-279 — the day's matches, in the three groups the desk works through: on court now, queued
 * (in planned order) and finished. Every act on a match opens the one ReasonDialog, except putting a
 * queued match on a court by hand (ADR-289), which changes no result and so needs no reason.
 */

/** ADR-289 — what a queued row can do besides the reason-gated acts. */
export interface PlacementActs {
  onPlace: (match: AdminMatchView) => void;
  onRelease: (match: AdminMatchView) => void;
}

const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export function timeOf(at: string | null): string {
  return at === null ? '—' : TIME.format(new Date(at));
}

export function seatLabel(seat: AdminSeatView): string {
  return seat.teamName ?? seat.label;
}

export function scoreLine(match: AdminMatchView): string {
  if (match.resultKind === 'walkover') return `walkover → ${match.winnerSide === 'a' ? 'A' : 'B'}`;
  return `${match.scoreA} – ${match.scoreB}`;
}

function PlacementButtons(props: { match: AdminMatchView; placement: PlacementActs }) {
  const { match, placement } = props;
  return (
    <>
      <button type="button" className="console-button" data-testid="tournament-matches__move" onClick={() => placement.onPlace(match)}>
        Move
      </button>
      {match.isPinned ? (
        <button type="button" className="console-button console-button--ghost" data-testid="tournament-matches__release" onClick={() => placement.onRelease(match)}>
          Release to the planner
        </button>
      ) : null}
    </>
  );
}

/** ADR-329 F3 — the seat the table would now fill differently, in team terms. */
export function seatConflictLine(match: AdminMatchView): string | null {
  const conflict = match.seatConflict;
  if (conflict === null) return null;
  const side = conflict.side === 'a' ? 'Side A' : 'Side B';
  const wouldBe = conflict.wouldBeTeamName ?? 'nobody (the source resolves empty)';
  return `Seat conflict — ${side} is ${conflict.seatedTeamName ?? 'empty'} but the results now send ${wouldBe} here. Reseat to fix it.`;
}

function FinishedActs(props: { match: AdminMatchView; onAct: (act: DeskAct) => void }) {
  const { match, onAct } = props;
  if (match.status !== 'completed') return null;
  return (
    <>
      <button type="button" className="console-button" data-testid="tournament-matches__correct" onClick={() => onAct({ kind: 'correct', match })}>
        Correct
      </button>
      <button type="button" className="console-button" data-testid="tournament-matches__void" onClick={() => onAct({ kind: 'void', match })}>
        {match.isVoided ? 'Reinstate' : 'Void'}
      </button>
    </>
  );
}

/** ADR-329 F1 — either team can be the no-show, so either side can be handed the win. */
function WalkoverButtons(props: { match: AdminMatchView; onAct: (act: DeskAct) => void }) {
  const { match, onAct } = props;
  const isOpen = match.status === 'scheduled' || match.status === 'in_progress';
  if (!isOpen || match.a.teamId === null || match.b.teamId === null) return null;
  return (
    <>
      <button type="button" className="console-button" data-testid="tournament-matches__walkover-a" onClick={() => onAct({ kind: 'walkover', match, winnerSide: 'a' })}>
        Walkover to {seatLabel(match.a)}
      </button>
      <button type="button" className="console-button" data-testid="tournament-matches__walkover-b" onClick={() => onAct({ kind: 'walkover', match, winnerSide: 'b' })}>
        Walkover to {seatLabel(match.b)}
      </button>
    </>
  );
}

/** ADR-329 F3/F4 — reseat a queued seat; hand a live structure match back to the queue. */
function SeatActs(props: { match: AdminMatchView; onAct: (act: DeskAct) => void }) {
  const { match, onAct } = props;
  const conflict = match.seatConflict;
  return (
    <>
      {match.status === 'scheduled' ? (
        <button
          type="button"
          className="console-button"
          data-testid="tournament-matches__reseat"
          onClick={() =>
            onAct(
              conflict !== null && conflict.wouldBeTeamId !== null
                ? { kind: 'reseat', match, side: conflict.side, teamId: conflict.wouldBeTeamId }
                : { kind: 'reseat', match },
            )
          }
        >
          Reseat
        </button>
      ) : null}
      {match.status === 'in_progress' && match.origin === 'structure' ? (
        <button type="button" className="console-button" data-testid="tournament-matches__hand-back" onClick={() => onAct({ kind: 'handBack', match })}>
          Hand back
        </button>
      ) : null}
    </>
  );
}

/** What can be done to a match from where it stands: a finished one is corrected, an open one settled. */
function MatchActs(props: { match: AdminMatchView; onAct: (act: DeskAct) => void; placement: PlacementActs }) {
  const { match, onAct } = props;
  const isOpen = match.status === 'scheduled' || match.status === 'in_progress';
  return (
    <td className="console-row">
      <FinishedActs match={match} onAct={onAct} />
      <WalkoverButtons match={match} onAct={onAct} />
      <SeatActs match={match} onAct={onAct} />
      {isOpen ? (
        <button type="button" className="console-button console-button--danger" data-testid="tournament-matches__cancel" onClick={() => onAct({ kind: 'cancel', match })}>
          Call off
        </button>
      ) : null}
      {match.status === 'scheduled' ? <PlacementButtons match={match} placement={props.placement} /> : null}
    </td>
  );
}

function MatchRow(props: { match: AdminMatchView; onAct: (act: DeskAct) => void; placement: PlacementActs }) {
  const { match } = props;
  const when = timeOf(match.startedAt ?? match.plannedStartAt);
  const conflictLine = seatConflictLine(match);
  return (
    <tr data-testid="tournament-matches__row" data-voided={match.isVoided ? 'true' : 'false'}>
      <td>{match.code}</td>
      <td>{match.stageLabel}</td>
      <td>
        {seatLabel(match.a)} v {seatLabel(match.b)}
        {conflictLine === null ? null : (
          <div className="console-warning" data-testid="tournament-matches__seat-conflict">
            {conflictLine}
          </div>
        )}
      </td>
      <td>{match.courtLabel ?? '—'}</td>
      <td>{when}</td>
      <td>{scoreLine(match)}</td>
      <MatchActs match={match} onAct={props.onAct} placement={props.placement} />
    </tr>
  );
}

function MatchTable(props: { title: string; matches: readonly AdminMatchView[]; onAct: (act: DeskAct) => void; placement: PlacementActs; testId: string }) {
  const isEmpty = props.matches.length === 0;
  return (
    <section className="console-panel" data-testid={props.testId}>
      <h2>
        {props.title} ({props.matches.length})
      </h2>
      {isEmpty ? (
        <p className="console-muted">None.</p>
      ) : (
        <table className="console-table">
          <thead>
            <tr>
              <th>Match</th>
              <th>Stage</th>
              <th>Teams</th>
              <th>Court</th>
              <th>Time</th>
              <th>Score</th>
              <th>Act</th>
            </tr>
          </thead>
          <tbody>
            {props.matches.map((match) => (
              <MatchRow key={match.id} match={match} onAct={props.onAct} placement={props.placement} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function MatchesPanel(props: { groups: MatchGroups; onAct: (act: DeskAct) => void; placement: PlacementActs }) {
  const { onAct, placement } = props;
  return (
    <>
      <MatchTable title="On court" matches={props.groups.live} onAct={onAct} placement={placement} testId="tournament-matches__live" />
      <MatchTable title="Queued" matches={props.groups.queued} onAct={onAct} placement={placement} testId="tournament-matches__queued" />
      <MatchTable title="Finished" matches={props.groups.finished} onAct={onAct} placement={placement} testId="tournament-matches__finished" />
    </>
  );
}
