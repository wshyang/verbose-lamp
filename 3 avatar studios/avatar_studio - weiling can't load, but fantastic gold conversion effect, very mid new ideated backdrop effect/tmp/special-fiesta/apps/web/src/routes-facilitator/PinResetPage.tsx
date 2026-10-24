import { useRef } from 'react';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { StaffShell } from './StaffShell.js';
import { required } from '../lib/required.js';
import { ConfirmDialog } from '../components/shared/ConfirmDialog.js';
import { useConfirm } from '../lib/hooks/useConfirm.js';
import { useParticipantSuggestions, usePinReset } from '../lib/hooks/useStaffTools.js';
import { useTypeAnywhere } from '../lib/hooks/useTypeAnywhere.js';

/** S33 — participant PIN reset (F33). Look the participant up, then set a new 4-digit PIN. */
export function PinResetPage() {
  const reset = usePinReset();
  const confirm = useConfirm();
  const participant = reset.participant;
  // ADR-101 — live suggestions while typing; hidden once somebody has been found.
  const suggestions = useParticipantSuggestions(reset.nickname);
  const showSuggestions = !participant && suggestions.items.length > 0;
  // ADR-105 — typing anywhere lands in the step you are on: the nickname until somebody
  // is found, the new-PIN field after. Suspended while the confirm dialog is up.
  const nicknameRef = useRef<HTMLInputElement | null>(null);
  const pinRef = useRef<HTMLInputElement | null>(null);
  useTypeAnywhere(participant ? pinRef : nicknameRef, {
    disabled: confirm.request !== null,
  });

  return (
    <StaffShell title="PIN reset">
      <ConfirmDialog confirm={confirm} isBusy={reset.isBusy} />
      <section className="console-panel">
        <h2>Find the participant</h2>
        <form
          data-testid="pin-reset__lookup-form"
          onSubmit={(event) => {
            event.preventDefault();
            void reset.findParticipant();
          }}
        >
          <ConsoleField id="pin-reset-nickname" label="Nickname" topic="pinResetFind">
          <input
            id="pin-reset-nickname"
            ref={nicknameRef}
            className="console-input"
            data-testid="pin-reset__nickname"
            autoCapitalize="none"
            autoComplete="off"
            value={reset.nickname}
            onChange={(event) => reset.setNickname(event.target.value)}
          />
          </ConsoleField>
          {showSuggestions ? (
            <ul
              className="console-suggest"
              aria-label="Matching participants"
              data-testid="pin-reset__suggestions"
            >
              {suggestions.items.map((item) => (
                <li key={item.participant.id}>
                  <button
                    type="button"
                    className="console-suggest__option"
                    data-testid="pin-reset__suggestion"
                    onClick={() => reset.choose(item.participant)}
                  >
                    <strong>{item.participant.nickname}</strong>
                    <span className="console-suggest__hint">
                      {item.participant.clusterCode} · #{item.participant.scanNumber}
                      {item.teamName ? ` · ${item.teamName}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div style={{ height: 12 }} />
          <button
            type="submit"
            className="console-button console-button--huge"
            data-testid="pin-reset__lookup"
            disabled={reset.isBusy}
          >
            Look up
          </button>
        </form>
      </section>

      {reset.participant ? (
        <section className="console-panel">
          <h2>{reset.participant.nickname}</h2>
          <p className="console-muted">Cluster {reset.participant.clusterCode}</p>
          <form
            data-testid="pin-reset__set-form"
            onSubmit={(event) => {
              event.preventDefault();
              // A PIN that is not four digits is refused before anything happens, so
              // there is nothing to confirm yet.
              if (reset.newPin.length !== 4) {
                void reset.submitReset();
                return;
              }
              confirm.ask({
                title: `Set a new PIN for ${required(participant, 'participant').nickname}?`,
                body: 'Their old PIN stops working straight away. Read the new one out to them before they walk off.',
                confirmLabel: 'Set the new PIN',
                run: () => void reset.submitReset(),
              });
            }}
          >
            <ConsoleField id="pin-reset-new" label="New 4-digit PIN" topic="pinResetNew">
            <input
              id="pin-reset-new"
              ref={pinRef}
              className="console-input"
              data-testid="pin-reset__new-pin"
              inputMode="numeric"
              maxLength={4}
              value={reset.newPin}
              onChange={(event) => reset.setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </ConsoleField>
            <div style={{ height: 12 }} />
            <button
              type="submit"
              className="console-button console-button--primary console-button--huge"
              data-testid="pin-reset__submit"
              disabled={reset.isBusy}
            >
              Set new PIN
            </button>
          </form>
        </section>
      ) : null}

      {reset.confirmation ? (
        <p className="console-status console-status--ok" data-testid="pin-reset__confirmation">
          {reset.confirmation}
        </p>
      ) : null}
      {reset.error ? (
        <p className="console-danger" role="alert" data-testid="pin-reset__error">
          {reset.error}
        </p>
      ) : null}
    </StaffShell>
  );
}
