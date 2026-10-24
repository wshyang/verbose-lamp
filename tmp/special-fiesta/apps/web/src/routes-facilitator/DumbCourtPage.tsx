import { StaffShell } from './StaffShell.js';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import { ConfirmDialog } from '../components/shared/ConfirmDialog.js';
import { useConfirm } from '../lib/hooks/useConfirm.js';
import { useDumbCourt } from '../lib/hooks/useDumbCourt.js';
import { useRouteId } from '../lib/hooks/useRouteId.js';
import { formatTime, tierButtonLine } from '../lib/format.js';

/**
 * ADR-321 — the dumb court console. There is no match here: no line-up, no start, no score.
 * The court master arms a point tier, taps the team that earned it, confirms the sentence
 * the room will read in Results ("Team XXX is awarded XXX points!"), and can take their own
 * award back for a few seconds after. Everything else — disputes, late corrections — is the
 * desk's, with the reason the audit trail requires.
 */
export function DumbCourtPage() {
  const court = useDumbCourt(useRouteId('courtId'));
  const confirm = useConfirm();
  const tierHelp = useFieldHelp();
  const teamHelp = useFieldHelp();
  const view = court.view;

  return (
    <StaffShell title={view?.courtLabel ?? 'Court'}>
      <ConfirmDialog confirm={confirm} isBusy={court.isBusy} />
      {court.error ? (
        <p className="console-danger" role="alert" data-testid="dumb-court__error">
          {court.error}
        </p>
      ) : null}
      {view ? (
        <>
          <section className="console-panel">
            <h2>
              {view.tournamentName} — award points <FieldHelp label="Award tiers" topic="dumbCourtTier" help={tierHelp} />
            </h2>
            <div className="console-grid" role="group" aria-label="Point tiers" aria-describedby={tierHelp.tooltipId}>
              {court.tiers.map((tier) => (
                <button
                  key={tier.label}
                  type="button"
                  className={court.activeTier?.label === tier.label ? 'console-button console-button--active' : 'console-button'}
                  data-testid="dumb-court__tier"
                  aria-pressed={court.activeTier?.label === tier.label}
                  onClick={() => court.armTier(tier.label)}
                >
                  {tierButtonLine(tier)}
                </button>
              ))}
            </div>
          </section>
          <section className="console-panel">
            <h2>
              Teams <FieldHelp label="Awarding a team" topic="dumbCourtTeam" help={teamHelp} />
            </h2>
            <div className="console-grid" aria-describedby={teamHelp.tooltipId}>
              {view.teams.map((team) => (
                <button
                  key={team.teamId}
                  type="button"
                  className="console-button console-button--huge"
                  data-testid="dumb-court__team"
                  disabled={court.isBusy || court.activeTier === null}
                  onClick={() => {
                    const tier = court.activeTier;
                    if (tier === null) return;
                    const clientAwardUuid = court.mintAwardUuid();
                    confirm.ask({
                      title: `Award ${tier.points} points to ${team.teamName}?`,
                      body: `Results will read: "${team.teamName} is awarded ${tier.points} points!" (${tier.label}). Every member of the team as it stands is paid.`,
                      confirmLabel: 'Award points',
                      run: () => void court.award(team.teamId, clientAwardUuid),
                    });
                  }}
                >
                  <span>{team.teamName}</span>
                  <span className="console-meta">{team.memberCount} members</span>
                </button>
              ))}
            </div>
            {court.outcome ? (
              <p className="console-ok" role="status" data-testid="dumb-court__outcome">
                {court.outcome}
              </p>
            ) : null}
          </section>
          <section className="console-panel">
            <h2>Awarded here</h2>
            {view.awards.length === 0 ? (
              <p className="console-muted" data-testid="dumb-court__log-empty">
                Nothing awarded on this court yet.
              </p>
            ) : (
              <ul className="console-list">
                {view.awards.map((award) => (
                  <li key={award.id} data-testid="dumb-court__log-row">
                    <span style={{ textDecoration: award.isVoided ? 'line-through' : 'none' }}>
                      {award.teamName} is awarded {award.points} points!
                    </span>{' '}
                    <span className="console-meta">
                      {award.tierLabel} · {formatTime(award.awardedAt)} · {award.awardedByLabel}
                      {award.isVoided ? ' · taken back' : ''}
                    </span>{' '}
                    {award.canUndo ? (
                      <button
                        type="button"
                        className="console-button"
                        data-testid="dumb-court__undo"
                        disabled={court.isBusy}
                        onClick={() =>
                          confirm.ask({
                            title: `Take back ${award.points} points from ${award.teamName}?`,
                            body: 'The award stops counting and Results shows it struck through.',
                            confirmLabel: 'Take back',
                            isDanger: true,
                            run: () => void court.undo(award.id),
                          })
                        }
                      >
                        Undo
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </StaffShell>
  );
}
