import { useCallback, useEffect, useRef, useState } from 'react';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import { StaffShell } from './StaffShell.js';
import { ConfirmDialog } from '../components/shared/ConfirmDialog.js';
import { useConfirm } from '../lib/hooks/useConfirm.js';
import { CameraSwitchButton } from '../components/shared/CameraSwitchButton.js';
import { useQrScanner } from '../lib/hooks/useQrScanner.js';
import { useRouteId } from '../lib/hooks/useRouteId.js';
import { useSwagStation } from '../lib/hooks/useSwagStation.js';
import { useTypeAnywhere } from '../lib/hooks/useTypeAnywhere.js';
import { formatTime } from '../lib/format.js';
import { required } from '../lib/required.js';

/**
 * ADR-110 — the swag counter console: the fringe station's twin (S25–S31 shapes). Camera
 * and typed number feed one claim path; the armed ITEM is sticky exactly like an armed
 * tier (ADR-092); the confirm names the item and the person before anything is handed over.
 */
export function SwagStationPage() {
  const station = useSwagStation(useRouteId('stationId'));
  const confirm = useConfirm();
  const isRoundOpen = station.round?.status === 'open';

  return (
    <StaffShell title={station.station?.stationName ?? 'Swag station'}>
      <ConfirmDialog confirm={confirm} isBusy={station.isBusy} />
      <RoundControls station={station} />
      {isRoundOpen ? <ClaimPanel station={station} confirm={confirm} /> : null}
      {station.error ? (
        <p className="console-danger" role="alert" data-testid="swag__error">
          {station.error}
        </p>
      ) : null}
    </StaffShell>
  );
}

type Station = ReturnType<typeof useSwagStation>;
type Confirm = ReturnType<typeof useConfirm>;

function RoundControls({ station }: { station: Station }) {
  const help = useFieldHelp();
  const round = station.round;
  return (
    <section className="console-panel">
      <h2>
        Round <FieldHelp label="Rounds" topic="swagRounds" help={help} />
      </h2>
      {round ? (
        <p className="console-muted" data-testid="swag__round">
          Round {round.roundNumber} · {round.status} · {round.claimCount} handed out
        </p>
      ) : (
        <p className="console-muted" data-testid="swag__round">
          No round open yet.
        </p>
      )}
      <div className="console-grid">
        {round?.status === 'open' ? (
          <>
            <button
              type="button"
              className="console-button"
              data-testid="swag__advance"
              disabled={station.isBusy}
              onClick={station.advanceRound}
            >
              Next round
            </button>
            <button
              type="button"
              className="console-button"
              data-testid="swag__end"
              disabled={station.isBusy}
              onClick={station.endRound}
            >
              End for the day
            </button>
          </>
        ) : (
          <button
            type="button"
            className="console-button console-button--primary"
            data-testid="swag__open"
            disabled={station.isBusy}
            onClick={station.openRound}
          >
            Open round
          </button>
        )}
      </div>
    </section>
  );
}

function ClaimPanel({ station, confirm }: { station: Station; confirm: Confirm }) {
  const armHelp = useFieldHelp();
  const numberRef = useRef<HTMLInputElement | null>(null);
  // ADR-105 — digits typed anywhere land in the number box, except under the dialog.
  useTypeAnywhere(numberRef, { disabled: confirm.request !== null });
  const onDecoded = useCallback(
    (nickname: string) => void station.claimFor(nickname),
    [station],
  );
  const scanner = useQrScanner(onDecoded);
  const armed = required(station.armedItem, 'armed item');

  const lookUpAndConfirm = async (digits: string) => {
    const found = await station.lookupNumber(digits);
    if (!found) return;
    confirm.ask({
      title: `Give ${armed.label} to ${found.participant.nickname}?`,
      body: `Limit ${armed.limit} per person this round.`,
      confirmLabel: 'Hand it over',
      run: () => {
        station.setNumber('');
        void station.claimFor(found.participant.nickname);
      },
    });
  };

  return (
    <section className="console-panel">
      <h2>
        Hand out <FieldHelp label="Arming an item" topic="swagItemArm" help={armHelp} />
      </h2>
      {/* ADR-092's arming row, re-worn: one tap arms an item for every following claim. */}
      {station.items.length > 1 ? (
        <div className="console-grid" data-testid="swag__items" aria-describedby={armHelp.tooltipId}>
          {station.items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={
                item.label === armed.label
                  ? 'console-button console-button--primary'
                  : 'console-button'
              }
              data-testid="swag__item"
              onClick={() => station.armItem(item.label)}
            >
              {item.label} · max {item.limit}
            </button>
          ))}
        </div>
      ) : null}
      <p className="console-muted" data-testid="swag__armed">
        Next claim: {armed.label} (limit {armed.limit}/person)
      </p>
      {scanner.isSupported ? (
        <div className="console-grid">
          <button
            type="button"
            className="console-button"
            data-testid="swag__camera-start"
            onClick={() => (scanner.isActive ? scanner.stop() : scanner.start())}
          >
            {scanner.isActive ? 'Stop camera' : 'Start camera'}
          </button>
          <CameraSwitchButton
            label={scanner.cameraLabel}
            onSwitch={scanner.switchCamera}
            className="console-button console-button--ghost"
            testId="swag__camera-switch"
          />
        </div>
      ) : null}
      {scanner.error ? <p className="console-warning">{scanner.error}</p> : null}
      <video ref={scanner.videoRef} className={scanner.isActive ? 'scan-video' : 'scan-video scan-video--off'} muted playsInline />
      <canvas ref={scanner.canvasRef} style={{ display: 'none' }} />
      <form
        data-testid="swag__manual-form"
        onSubmit={(event) => {
          event.preventDefault();
          void lookUpAndConfirm(station.number);
        }}
      >
        <ConsoleField id="swag-number" label="Or type their 4-digit number" topic="swagScanNumber">
        <input
          ref={numberRef}
          className="console-input"
          data-testid="swag__number"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoComplete="off"
          value={station.number}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
            const wasComplete = station.number.length === 4;
            station.setNumber(digits);
            // ADR-085 — the fourth digit IS the submit, on the transition into completeness.
            if (digits.length === 4 && !wasComplete) void lookUpAndConfirm(digits);
          }}
        />
        </ConsoleField>
      </form>
      {station.outcome ? (
        <p
          className={
            station.outcome.kind === 'claimed'
              ? 'console-status console-status--ok'
              : 'console-status console-status--warn'
          }
          data-testid="swag__outcome"
        >
          {station.outcome.text}
        </p>
      ) : null}
      {station.outcome?.undo ? (
        <UndoRow station={station} expiresAt={station.outcome.undo.expiresAt} />
      ) : null}
      <h3>This round</h3>
      <ul className="console-list" data-testid="swag__claims">
        {station.claims.map((claim) => (
          <li
            key={claim.id}
            data-testid="swag__claim-row"
            data-voided={claim.isVoided}
            /*
             * ADR-159 — a reversed handout stays on the list, struck through. Removing the
             * line would make a void look identical to a handout that never registered, and
             * the counter's next move after those two is not the same.
             */
            className={claim.isVoided ? 'console-muted' : undefined}
            style={claim.isVoided ? { textDecoration: 'line-through' } : undefined}
          >
            {claim.participantNickname} · {claim.itemLabelSnapshot} · {formatTime(claim.claimedAt)}
            {claim.isVoided ? ' · taken back' : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * ADR-159, mirroring ADR-138 — the ten seconds in which the counter can take back the
 * handout it just made. The countdown is decoration: the server owns the window and
 * re-checks it, so a button pressed on the last tick can still be refused in words. The row
 * disappears with the handle, i.e. as soon as the next handout replaces it.
 */
function UndoRow({
  station,
  expiresAt,
}: {
  station: ReturnType<typeof useSwagStation>;
  expiresAt: number;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() => remainingSeconds(expiresAt));

  useEffect(() => {
    setSecondsLeft(remainingSeconds(expiresAt));
    const timer = setInterval(() => setSecondsLeft(remainingSeconds(expiresAt)), 500);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (secondsLeft <= 0) return null;
  return (
    <div className="console-row">
      <button
        type="button"
        className="console-button"
        data-testid="swag__undo"
        disabled={station.isBusy}
        onClick={() => void station.undoLast()}
      >
        Undo ({secondsLeft}s)
      </button>
    </div>
  );
}

function remainingSeconds(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}
