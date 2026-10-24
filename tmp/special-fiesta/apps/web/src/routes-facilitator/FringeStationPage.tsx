import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import { useRouteId } from '../lib/hooks/useRouteId.js';
import { PARTICIPATION_LABEL, emptyStates, messages } from '@psd/contracts';
import type { AwardTier } from '@psd/contracts';
import { StaffShell } from './StaffShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { ConfirmDialog } from '../components/shared/ConfirmDialog.js';
import { LoadingPanel } from '../components/console/LoadingPanel.js';
import { formatTime, tierSummary } from '../lib/format.js';
import { useAwardCelebration } from '../lib/hooks/useAwardCelebration.js';
import { useLiveList } from '../lib/hooks/useLiveList.js';
import { required } from '../lib/required.js';
import { useConfirm } from '../lib/hooks/useConfirm.js';
import { useFringeStation } from '../lib/hooks/useFringeStation.js';
import type { ConfirmState } from '../lib/hooks/useConfirm.js';
import { CameraSwitchButton } from '../components/shared/CameraSwitchButton.js';
import { useQrScanner } from '../lib/hooks/useQrScanner.js';
import { useTypeAnywhere } from '../lib/hooks/useTypeAnywhere.js';

/**
 * S25–S31 — the fringe station console (F26–F29). Camera scan and the typed 4-digit scan
 * number (ADR-088) feed the same submit path, so an offline queue, a duplicate and a normal
 * award behave identically whichever way the participant was identified.
 */

type Station = ReturnType<typeof useFringeStation>;

const OUTCOME_CLASS: Record<string, string> = {
  awarded: 'console-status console-status--ok',
  duplicate: 'console-status console-status--warn',
  held: 'console-status console-status--warn',
  queued: 'console-status console-status--warn',
  rejected: 'console-status console-status--error',
  undone: 'console-status console-status--warn',
};

export function FringeStationPage() {
  const station = useFringeStation(useRouteId('activityId'));
  const confirm = useConfirm();
  const isRoundOpen = station.round?.status === 'open';
  // ADR-092 — a green border flash + ding on every server-acknowledged award.
  const celebration = useAwardCelebration(station.outcome);

  return (
    <StaffShell title={station.activity?.activityName ?? 'Fringe station'}>
      {celebration > 0 ? (
        <div key={celebration} className="scan-flash" data-testid="fringe__flash" aria-hidden="true" />
      ) : null}
      <ConfirmDialog confirm={confirm} isBusy={station.isBusy} />
      <StationHeader station={station} />
      {station.isLoading ? <LoadingPanel title="Round controls" testId="fringe__loading" /> : null}
      {station.isLoading ? null : (
        <>
          {isRoundOpen ? <ScanPanel station={station} confirm={confirm} /> : <OpenRoundPanel station={station} confirm={confirm} />}
          {isRoundOpen ? <LiveRoundControls station={station} confirm={confirm} /> : null}
        </>
      )}
      <RoundLogPanel station={station} />
    </StaffShell>
  );
}

function StationHeader({ station }: { station: Station }) {
  const { activity, round } = station;
  return (
    <section className="console-panel">
      <div className="console-row console-row--between">
        <h2 style={{ margin: 0 }}>
          {round ? `Round ${round.roundNumber} · ${round.status}` : 'No round open'}
        </h2>
        <span className="console-badge" data-testid="fringe__scan-count">
          {station.scanCount} scans
        </span>
      </div>
      {activity ? (
        <p className="console-muted">
          {tierSummary(activity.awardTiers)}{activity.isActive ? '' : ' · activity inactive'}
        </p>
      ) : null}
      {station.error ? (
        <p className="console-danger" role="alert" data-testid="fringe__error">
          {station.error}
        </p>
      ) : null}
    </section>
  );
}

/**
 * F27 — camera and keyboard, one award path. The camera decodes a badge's nickname and submits
 * directly (zero taps); the keyboard takes a 4-digit scan number, resolves it to a PERSON, and
 * asks the facilitator to verify the name before any points move (ADR-088).
 */
function ScanPanel({ station, confirm }: { station: Station; confirm: ConfirmState }) {
  const { submitScan, lookupNumber, setNumber } = station;
  const onDecoded = useCallback((value: string) => void submitScan(value), [submitScan]);
  const scanner = useQrScanner(onDecoded);
  const numberRef = useRef<HTMLInputElement | null>(null);
  // ADR-105 — digits typed (or scan-gunned) anywhere on the page land in the number box,
  // except while the confirm dialog is asking its question.
  useTypeAnywhere(numberRef, { disabled: confirm.request !== null });
  // The panel only renders over an open round, so these exist — `required` keeps that honest.
  const tiers = required(station.activity, 'activity').awardTiers;
  const roundNumber = required(station.round, 'open round').roundNumber;
  // ADR-116 — the armed award is either a configured tier or the day's participation floor.
  const { isParticipationArmed, participationPoints, armedTier } = station;
  const armed = useMemo(
    () =>
      isParticipationArmed
        ? { label: PARTICIPATION_LABEL, points: participationPoints }
        : required(armedTier, 'armed tier'),
    [isParticipationArmed, participationPoints, armedTier],
  );

  /*
   * ADR-088 — the number names a person before anything is awarded. The dialog leads with the
   * NICKNAME because that is the fact the facilitator can check against the human in front of
   * them; the number they just typed is only the key that found it.
   */
  const lookUpAndConfirm = useCallback(
    async (digits: string) => {
      const participant = await lookupNumber(digits);
      if (!participant) return;
      // ADR-092 — a tiered station names the armed tier in the promise it asks to confirm.
      // ADR-116 — the participation award always names itself, tiers or no tiers.
      const tierBit =
        tiers.length > 1 || station.isParticipationArmed ? `${armed.label} ` : '';
      confirm.ask({
        title: `Award ${tierBit}+${armed.points} to ${participant.nickname}?`,
        body: `Number ${digits} · Cluster ${participant.clusterCode} · Round ${roundNumber}.`,
        confirmLabel: 'Award points',
        run: () => {
          setNumber('');
          void submitScan(participant.nickname);
        },
      });
    },
    [armed, confirm, lookupNumber, roundNumber, setNumber, station.isParticipationArmed, submitScan, tiers.length],
  );

  // The queue is the point: after every outcome the caret goes back where the next
  // number is typed, so a marshal never taps the field between two people.
  useEffect(() => {
    if (station.outcome === null) return;
    required(numberRef.current, 'scan number field').focus();
  }, [station.outcome]);

  return (
    <section className="console-panel">
      <h2>Scan a participant</h2>
      {station.outcome ? (
        <p className={OUTCOME_CLASS[station.outcome.kind]} role="status" data-testid="fringe__outcome">
          {station.outcome.message}
        </p>
      ) : null}

      {station.outcome?.kind === 'held' ? <ReplaceAwardRow station={station} /> : null}
      {station.outcome?.undo ? (
        <UndoRow station={station} expiresAt={station.outcome.undo.expiresAt} />
      ) : null}
      <TierArmingRow station={station} tiers={tiers} armed={armed} />
      <video ref={scanner.videoRef} className="console-scanner" muted playsInline />
      <canvas ref={scanner.canvasRef} style={{ display: 'none' }} />
      {scanner.error ? <p className="console-muted">{scanner.error}</p> : null}
      <div className="console-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="console-button"
          data-testid="fringe__camera-start"
          disabled={scanner.isActive}
          onClick={scanner.start}
        >
          Start camera
        </button>
        <button
          type="button"
          className="console-button console-button--ghost"
          data-testid="fringe__camera-stop"
          disabled={!scanner.isActive}
          onClick={scanner.stop}
        >
          Stop camera
        </button>
        <CameraSwitchButton
          label={scanner.cameraLabel}
          onSwitch={scanner.switchCamera}
          className="console-button console-button--ghost"
          testId="fringe__camera-switch"
        />
      </div>

      <form
        data-testid="fringe__manual-form"
        onSubmit={(event) => {
          event.preventDefault();
          void lookUpAndConfirm(station.number);
        }}
      >
        <ConsoleField id="fringe-number" label="Or type their 4-digit number" topic="fringeScanNumber">
        <input
          ref={numberRef}
          className="console-input"
          data-testid="fringe__number"
          /*
           * `text` + inputMode, never type="number": number inputs shed leading zeros and
           * accept e/-. `inputMode` is the modern numeric-keypad signal; `pattern` is the one
           * legacy iOS keyed on, and costs nothing to carry.
           */
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoComplete="off"
          disabled={!station.isOnline}
          value={station.number}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
            const wasComplete = station.number.length === 4;
            station.setNumber(digits);
            // ADR-085 — the number is the last thing asked for, so the fourth digit IS the
            // submit. Only on the transition INTO completeness, or a full field would re-fire
            // the lookup on every swallowed keystroke.
            if (digits.length === 4 && !wasComplete) void lookUpAndConfirm(digits);
          }}
        />
        </ConsoleField>
        <div style={{ height: 12 }} />
        <button
          type="submit"
          className="console-button console-button--primary console-button--huge"
          data-testid="fringe__lookup"
          disabled={!station.isOnline || station.isLookingUp}
        >
          Look up
        </button>
        {station.isOnline ? null : (
          /* ADR-088 — manual entry is online-only: a number cannot name a person without the
             server, and an unverifiable award defeats the dialog this flow exists for. */
          <p className="console-muted" data-testid="fringe__manual-offline">
            {messages.manualEntryOffline}
          </p>
        )}
      </form>
    </section>
  );
}

/**
 * ADR-092 — the sticky tier arming row. One tap arms a tier for every following scan
 * (camera or number), and the echo line under the buttons says loudly what the next scan
 * pays, because a forgotten re-arm is this design's one real hazard.
 */
/**
 * ADR-092 — the award tier row. ADR-116 adds the participation control, and it renders at
 * EVERY station rather than only tiered ones: a station configured with placings alone is
 * exactly the case where somebody who merely took part had no way to be recorded.
 */
function TierArmingRow(props: { station: Station; tiers: AwardTier[]; armed: AwardTier }) {
  const { station, tiers, armed } = props;
  const help = useFieldHelp();
  const armedLabel = station.isParticipationArmed ? PARTICIPATION_LABEL : armed.label;
  const options: AwardTier[] = [
    ...tiers,
    { label: PARTICIPATION_LABEL, points: station.participationPoints },
  ];
  return (
    <>
      <div className="console-row" role="group" aria-label="Award tier" aria-describedby={help.tooltipId}>
        <FieldHelp label="Award tier" topic="fringeTierArm" help={help} />
        {options.map((tier) => (
          <button
            key={tier.label}
            type="button"
            className={`console-button${tier.label === armedLabel ? ' console-button--primary' : ''}`}
            aria-pressed={tier.label === armedLabel}
            data-testid={
              tier.label === PARTICIPATION_LABEL ? 'fringe__participation' : 'fringe__tier'
            }
            onClick={() => station.armTier(tier.label)}
          >
            {tier.label} +{tier.points}
          </button>
        ))}
      </div>
      <p className="console-armed" data-testid="fringe__armed">
        Next scan: {armed.label} +{armed.points} pts
      </p>
    </>
  );
}

/**
 * ADR-138 — the ten seconds in which the station can take back the scan it just made. The
 * countdown is decoration: it tells the marshal how long they have, but the server owns the
 * window and re-checks it, so a button pressed on the last tick can still be refused in
 * words. The row disappears with the handle, i.e. as soon as the next scan replaces it.
 */
function UndoRow({ station, expiresAt }: { station: Station; expiresAt: number }) {
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
        data-testid="fringe__undo"
        disabled={station.isScanning}
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

/**
 * ADR-116 — the slot this participant holds in the round is already taken by another award.
 * The scan was NOT written; this is the facilitator's chance to overwrite it deliberately,
 * which is the whole difference from the old behaviour of accepting it and throwing it away.
 */
function ReplaceAwardRow({ station }: { station: Station }) {
  return (
    <div className="console-row">
      <button
        type="button"
        className="console-button console-button--primary"
        data-testid="fringe__replace"
        disabled={station.isScanning}
        onClick={() => void station.replaceAward()}
      >
        Replace award for {station.heldFor}
      </button>
    </div>
  );
}

/** F26 open round 1 / the next round, F30 reopen an ended round (S29, S31). */
function OpenRoundPanel({ station, confirm }: { station: Station; confirm: ConfirmState }) {
  const { round } = station;
  const help = useFieldHelp();
  return (
    <section className="console-panel">
      <h2>
        Round controls <FieldHelp label="Rounds" topic="fringeRounds" help={help} />
      </h2>
      <p className="console-muted">Open a round before scanning.</p>
      <button
        type="button"
        className="console-button console-button--primary console-button--huge"
        data-testid="fringe__open-round"
        disabled={station.isBusy || !station.activity?.isActive}
        onClick={station.openFirstRound}
      >
        {round ? `Open round ${round.roundNumber + 1}` : 'Open round 1'}
      </button>
      {round?.status === 'ended' ? (
        <>
          <div style={{ height: 12 }} />
          <button
            type="button"
            className="console-button"
            data-testid="fringe__reactivate"
            disabled={station.isBusy}
            onClick={() => confirm.ask({
              title: `Reopen round ${required(round, 'ended round').roundNumber}?`,
              body: 'The round accepts scans again and the station goes back on the board.',
              confirmLabel: 'Reopen it',
              run: station.reactivateRoundNow,
            })}
          >
            Reopen round {round.roundNumber}
          </button>
        </>
      ) : null}
    </section>
  );
}

/** F28 advance, F29 end for the day (S29, S30). */
function LiveRoundControls({ station, confirm }: { station: Station; confirm: ConfirmState }) {
  const roundNumber = required(station.round, 'open round').roundNumber;
  const help = useFieldHelp();
  return (
    <section className="console-panel">
      <h2>
        Round controls <FieldHelp label="Rounds" topic="fringeRounds" help={help} />
      </h2>
      <div className="console-row">
        <button
          type="button"
          className="console-button"
          data-testid="fringe__advance"
          disabled={station.isBusy}
          onClick={() => confirm.ask({
            title: `Close round ${roundNumber} and open ${roundNumber + 1}?`,
            body: `Round ${roundNumber} stops accepting scans. Its ${station.scanCount} scans keep their points.`,
            confirmLabel: 'Next round',
            run: station.advanceRoundNow,
          })}
        >
          Next round
        </button>
        <button
          type="button"
          className="console-button console-button--danger"
          data-testid="fringe__end"
          disabled={station.isBusy}
          onClick={() => confirm.ask({
            title: `End round ${roundNumber}?`,
            body: `This station stops accepting scans. Its ${station.scanCount} scans keep their points, and you can reopen the round if you end it by mistake.`,
            confirmLabel: 'End the round',
            isDanger: true,
            run: station.endRoundNow,
          })}
        >
          End round
        </button>
      </div>
    </section>
  );
}

/** S28 — the live log for the open round. */
function RoundLogPanel({ station }: { station: Station }) {
  // ADR-095 — each award prepends a row right under the camera; a fade-and-slide is
  // calmer than a shove while the facilitator is lining up the next scan.
  const logRows = useLiveList<HTMLUListElement>();
  return (
    <section className="console-panel">
      <h2>This round</h2>
      <StateMessage
        isLoading={station.isLoading}
        error={null}
        isEmpty={station.scans.length === 0}
        emptyText={emptyStates.currentRoundScanLog}
        testId="fringe-log"
      />
      <ul className="console-list" ref={logRows}>
        {station.scans.map((scan) => (
          <li
            key={scan.id}
            data-testid="fringe__log-row"
            data-live-key={scan.id}
            data-live-signature={scan.pointsAwardedSnapshot}
          >
            {formatTime(scan.scannedAt)} — {scan.participantNickname} ({scan.clusterCode}) +
            {scan.pointsAwardedSnapshot}
          </li>
        ))}
      </ul>
    </section>
  );
}
