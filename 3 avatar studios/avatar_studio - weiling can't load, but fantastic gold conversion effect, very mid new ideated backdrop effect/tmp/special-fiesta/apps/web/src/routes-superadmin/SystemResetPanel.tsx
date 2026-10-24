import { useState } from 'react';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { messages } from '@psd/contracts';
import { useSystemReset } from '../lib/hooks/useSystemReset.js';

/**
 * ADR-307 — the danger zone at the foot of Operations.
 *
 * Built for the morning after a practice day: facilitators and teams have filled
 * the system with rehearsals, and the real event needs it emptied without losing
 * the setup. The panel is red because there is no undo, and the guard is typed,
 * not tapped: the operator re-enters their own superadmin passcode and copies a
 * server-minted `DELETE…` confirmation exactly. Neither proof is checked here —
 * the server holds both answers, and this page's job is only to make sure nobody
 * reaches the button by accident.
 */
export function SystemResetPanel() {
  const reset = useSystemReset();
  const [passcode, setPasscode] = useState('');
  const [typed, setTyped] = useState('');

  const submit = () => {
    void reset.submit({ passcode, confirmation: typed.trim() });
    setPasscode('');
    setTyped('');
  };

  return (
    <section className="console-panel console-panel--danger-zone" data-testid="system__reset-panel">
      <h2>Reset the system</h2>
      <p className="console-danger-zone__warning" data-testid="system__reset-warning">
        Danger — this permanently deletes the practice day and cannot be undone.
      </p>
      <p className="console-hint">
        Use this after a rehearsal to ready the system for the real event. It deletes every
        participant, team, social (chat, team chat, photos and announcements), tournament and
        match, together with the scores, scans, claims, rounds and sessions that hang off them.
      </p>
      <p className="console-hint">
        Your setup stays: superadmin and facilitator accounts, clusters, titles, fringe
        activities and swag stations, tournament courts, point settings, the agenda, screen
        keys and the switches above. You stay signed in; everybody else is signed out.
      </p>

      {reset.error ? (
        <p className="error-text" data-testid="system__reset-error" role="alert">
          {reset.error}
        </p>
      ) : null}

      {reset.phase === 'done' && reset.result ? (
        <div data-testid="system__reset-result">
          <p className="console-hint">{messages.resetDone}</p>
          <ul className="console-hint">
            <li>Participants deleted: {reset.result.participants}</li>
            <li>Teams deleted: {reset.result.teams}</li>
            <li>
              Social deleted: {reset.result.chatMessages} chat messages,{' '}
              {reset.result.teamChatMessages} team messages, {reset.result.announcements}{' '}
              announcements, {reset.result.photos} photos
            </li>
            <li>
              Tournaments deleted: {reset.result.tournaments} ({reset.result.matches} matches)
            </li>
            <li>
              Rounds deleted: {reset.result.fringeRounds} fringe, {reset.result.swagRounds} swag
            </li>
            <li>Sessions ended: {reset.result.sessionsEnded} (yours was kept)</li>
          </ul>
        </div>
      ) : null}

      {reset.phase === 'confirming' && reset.confirmation ? (
        <form
          data-testid="system__reset-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <p className="console-hint">
            Type this confirmation exactly, capitals and all, then enter your own superadmin
            passcode:
          </p>
          <p className="console-code" data-testid="system__reset-challenge">
            {reset.confirmation}
          </p>
          <ConsoleField id="system-reset-passcode" label="Your superadmin passcode" topic="resetPasscode">
          <input
            id="system-reset-passcode"
            className="console-input"
            data-testid="system__reset-passcode"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
          />
          </ConsoleField>
          <ConsoleField id="system-reset-confirmation" label="Confirmation" topic="resetConfirmation">
          <input
            id="system-reset-confirmation"
            className="console-input"
            data-testid="system__reset-confirmation"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          </ConsoleField>
          <div className="console-row">
            <button
              type="submit"
              className="console-button console-button--danger"
              data-testid="system__reset-submit"
              disabled={reset.isBusy || passcode === '' || typed.trim() === ''}
            >
              Reset the system permanently
            </button>
            <button
              type="button"
              className="console-button console-button--ghost"
              data-testid="system__reset-cancel"
              disabled={reset.isBusy}
              onClick={reset.cancel}
            >
              Keep everything
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="console-button console-button--danger console-button--huge"
          data-testid="system__reset-begin"
          disabled={reset.isBusy}
          onClick={reset.begin}
        >
          {reset.phase === 'done' ? 'Reset again' : 'Reset users, teams, socials, tournaments and matches'}
        </button>
      )}
    </section>
  );
}
