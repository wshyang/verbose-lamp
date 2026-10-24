import { messages } from '@psd/contracts';
import { AdminShell } from './AdminShell.js';
import { ScreenKeysPanel } from './ScreenKeysPanel.js';
import { StationOfflinePanel } from './StationOfflinePanel.js';
import { SystemResetPanel } from './SystemResetPanel.js';
import { ConfirmDialog } from '../components/shared/ConfirmDialog.js';
import { useConfirm } from '../lib/hooks/useConfirm.js';
import { useSystemControls } from '../lib/hooks/useSystemControls.js';

/**
 * ADR-118 — S61, Operations.
 *
 * Its own page rather than a corner of Config: point values and courts describe how the event
 * scores, these describe whether it is serving at all, and an operator reaching for them is
 * having a bad afternoon. Both actions confirm first, because both are visible to three hundred
 * people within seconds.
 */
export function SystemPage() {
  const confirm = useConfirm();
  const system = useSystemControls();

  /*
   * `StateMessage` is for lists, and this page is not one — it has no empty state, because a
   * server that answers at all has a state to report. What it does have is a before: until the
   * read lands, every sentence the panels contain ("Running", "Restart unavailable") would be a
   * guess, and a read that failed outright leaves the page with nothing true to say at all.
   * Both cases render the same way — no claims, and no buttons to press on a guess.
   */
  const view = system.view;
  if (view === null) {
    return (
      <AdminShell title="Operations">
        {system.error === null ? (
          <p className="loading" data-testid="system__loading">
            Loading…
          </p>
        ) : (
          <p className="error-text" data-testid="system__error" role="alert">
            {system.error}
          </p>
        )}
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Operations">
      <ConfirmDialog confirm={confirm} isBusy={system.isBusy} />
      {system.error ? (
        <p className="error-text" data-testid="system__error" role="alert">
          {system.error}
        </p>
      ) : null}

      <section className="console-panel">
        <h2>Chat and photos</h2>
        <p className="console-hint" data-testid="system__social-state">
          {view.isSocialPaused
            ? 'Paused — participants see an explanation in place of the room.'
            : 'Running — participants can chat and post photos.'}
        </p>
        {view.isSocialPaused && view.pausedBy ? (
          <p className="console-hint" data-testid="system__paused-by">
            Paused by {view.pausedBy}.
          </p>
        ) : null}
        {/*
          Scoring and scanning are named here because that is the question an operator is
          actually asking before they press it: what am I about to take away from people?
        */}
        <p className="console-hint">
          Pausing sheds chat, team chat and the photo gallery. Scanning, scoring, teams and the
          leaderboard are untouched.
        </p>
        {view.isSocialPaused ? (
          <button
            type="button"
            className="console-button"
            data-testid="system__resume-social"
            disabled={system.isBusy}
            onClick={() =>
              confirm.ask({
                title: 'Turn chat and photos back on?',
                body: 'Participants will be able to chat and post photos again straight away.',
                confirmLabel: 'Resume',
                run: system.resumeSocial,
              })
            }
          >
            Resume chat and photos
          </button>
        ) : (
          <button
            type="button"
            className="console-button"
            data-testid="system__pause-social"
            disabled={system.isBusy}
            onClick={() =>
              confirm.ask({
                title: 'Pause chat and photos?',
                body: messages.socialPausedConfirmation,
                confirmLabel: 'Pause',
                isDanger: true,
                run: system.pauseSocial,
              })
            }
          >
            Pause chat and photos
          </button>
        )}
      </section>

      <StationOfflinePanel system={system} confirm={confirm} view={view} />

      <ScreenKeysPanel confirm={confirm} />

      <section className="console-panel">
        <h2>Restart the app</h2>
        {/*
          Not "shut down": under supervisord every exit is a restart (ADR-043), so naming it
          after what actually happens is the only honest label. Someone who wants the event
          genuinely offline wants `docker compose stop`, at a keyboard, on purpose.
        */}
        <p className="console-hint">
          Ends the app process. The supervisor starts it again within a few seconds; sessions,
          scores and photos all survive because they live in the database.
        </p>
        {system.hasAskedToRestart ? (
          <p className="console-hint" data-testid="system__restart-asked">
            {messages.restartScheduled}
          </p>
        ) : view.canRestart ? (
          <button
            type="button"
            className="console-button"
            data-testid="system__restart"
            disabled={system.isBusy}
            onClick={() =>
              confirm.ask({
                title: 'Restart the app now?',
                body:
                  'Everyone loses their connection for a few seconds. Nothing is lost, but any ' +
                  'half-typed message is.',
                confirmLabel: 'Restart',
                isDanger: true,
                run: system.restart,
              })
            }
          >
            Restart now
          </button>
        ) : (
          <p className="console-hint" data-testid="system__restart-unavailable">
            {messages.restartUnavailable}
          </p>
        )}
      </section>

      <SystemResetPanel />
    </AdminShell>
  );
}
