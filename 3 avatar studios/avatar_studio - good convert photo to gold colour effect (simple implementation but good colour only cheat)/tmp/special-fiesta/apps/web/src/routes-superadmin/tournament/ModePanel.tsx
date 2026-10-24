import { useState } from "react";
import type { AdminTournamentView, ModeRequestView } from "@psd/contracts";
import { ConsoleField } from "../../components/console/ConsoleField.js";
import { formatAge } from "../../lib/format.js";
import { declineModeRequest } from "../../lib/api/tournament.js";
import {
  SWITCH_WORD,
  modeLine,
  type TournamentSwitch,
} from "../../lib/hooks/useTournamentSwitch.js";
import type { TournamentDesk } from "../../lib/hooks/useTournamentDesk.js";

/**
 * ADR-336 §5/§6 — the Control page's mode panel: what game the room is playing, and the one-way
 * switch to court awards.
 *
 * Two shapes, never both:
 *  - a fixture day: the switch, closed, behind one button. Opening it reveals the typed word, the
 *    reason and the award buttons the day's own rates already are, because a confirm dialog that
 *    cannot be read is not a guard;
 *  - an award day: the banner, and the drain by court while some courts are still finishing. The desk
 *    is told what it is waiting for rather than watching a paused badge.
 */

function DrainLines(props: {
  modeSwitch: NonNullable<TournamentDesk["modeSwitch"]>;
}) {
  const { modeSwitch } = props;
  return (
    <ul className="console-list" data-testid="mode-panel__drain">
      {modeSwitch.courts.map((court) => (
        <li key={court.courtId} data-testid="mode-panel__court">
          {court.courtLabel} —{" "}
          {court.isFinishing
            ? "finishing its match, then awarding"
            : "awarding points"}
        </li>
      ))}
    </ul>
  );
}

function AwardDayBanner(props: { desk: TournamentDesk }) {
  const { desk } = props;
  const info = desk.modeSwitch;
  if (info === null) {
    return (
      <p className="console-meta" data-testid="mode-panel__banner">
        {modeLine({ mode: desk.mode, isDraining: false })}
      </p>
    );
  }
  const isDraining = info.courts.some((court) => court.isFinishing);
  const switchedAtLabel = new Date(info.switchedAt).toLocaleTimeString();
  const fixturesLine = info.fixturesEnded
    ? `${info.fixturesTournamentName} has ended. Nothing is left paused.`
    : `${info.fixturesTournamentName} will end itself when the last court finishes.`;
  return (
    <>
      <h2 data-testid="mode-panel__banner">
        {modeLine({ mode: desk.mode, isDraining })}
      </h2>
      <p className="console-meta">
        Switched at {switchedAtLabel} by {info.switchedByLabel} — {info.reason}
      </p>
      <p className="console-meta">{fixturesLine}</p>
      {isDraining ? <DrainLines modeSwitch={info} /> : null}
    </>
  );
}

/**
 * ADR-336 §5.4 — a marshal's ask, on the page where the desk can answer it.
 *
 * Review opens the switch form with the ask's own reason, and the switch resolves the ask in the same
 * commit. Decline needs a reason of its own: the marshal asked why, so the desk answers why not, and
 * the court reads the reason back (ADR-342). The ask never expires — instead the banner says how long
 * it has waited, because the age of a question is the desk's to weigh, not the clock's.
 */
function AskBanner(props: {
  request: ModeRequestView;
  form: TournamentSwitch;
  desk: TournamentDesk;
}) {
  const { request, form, desk } = props;
  const [declineReason, setDeclineReason] = useState("");
  const [isDeclining, setIsDeclining] = useState(false);
  const where =
    request.courtLabel === null ? "" : ` from ${request.courtLabel}`;
  const decline = async (): Promise<void> => {
    setIsDeclining(true);
    try {
      await desk.perform(() =>
        declineModeRequest({
          requestId: request.id,
          reason: declineReason.trim(),
        }),
      );
    } finally {
      setIsDeclining(false);
    }
  };
  return (
    <div data-testid="mode-panel__ask">
      <h2>Switch the courts to awarding points?</h2>
      <p className="console-meta" data-testid="mode-panel__ask-text">
        {request.requestedByLabel} asks{where} — {request.reason}
      </p>
      <p className="console-muted" data-testid="mode-panel__ask-age">
        Asked {formatAge(request.createdAt)} ago. The room may have changed
        since — confirm with the court in view.
      </p>
      <div className="console-row">
        <button
          type="button"
          className="console-button console-button--primary"
          data-testid="mode-panel__ask-review"
          onClick={() => form.open(request)}
        >
          Review
        </button>
      </div>
      <ConsoleField id="ask-decline-reason" label="Why not" topic="actReason">
        <input
          id="ask-decline-reason"
          className="console-input"
          data-testid="mode-panel__ask-decline-reason"
          value={declineReason}
          maxLength={200}
          onChange={(event) => setDeclineReason(event.target.value)}
        />
      </ConsoleField>
      <button
        type="button"
        className="console-button console-button--danger"
        data-testid="mode-panel__ask-decline"
        disabled={declineReason.trim() === "" || isDeclining || desk.isPending}
        onClick={() => void decline()}
      >
        Decline
      </button>
    </div>
  );
}

function SwitchForm(props: { form: TournamentSwitch; isPending: boolean }) {
  const { form, isPending } = props;
  return (
    <div data-testid="mode-panel__form">
      <p className="console-warning">
        This cannot be undone. The bracket stops taking matches, every court
        becomes an award station, and the fixture day ends on its own once the
        last match on court is closed.
      </p>
      {form.reviewing === null ? null : (
        <p className="console-warning" data-testid="mode-panel__form-age">
          Asked by {form.reviewing.requestedByLabel},{" "}
          {formatAge(form.reviewing.createdAt)} ago. The room may have changed
          since — confirm with the court in view.
        </p>
      )}
      <ConsoleField
        id="switch-reason"
        label="Why the day is changing"
        topic="switchReason"
      >
        <input
          id="switch-reason"
          className="console-input"
          data-testid="mode-panel__reason"
          value={form.reason}
          maxLength={200}
          onChange={(event) => form.setReason(event.target.value)}
        />
      </ConsoleField>
      <ConsoleField
        id="switch-word"
        label={`Type “${SWITCH_WORD}” to confirm`}
        topic="switchWord"
      >
        <input
          id="switch-word"
          className="console-input"
          data-testid="mode-panel__word"
          value={form.word}
          autoComplete="off"
          onChange={(event) => form.setWord(event.target.value)}
        />
      </ConsoleField>
      <fieldset className="console-panel">
        <legend>Award buttons</legend>
        <p className="console-meta">
          From this day’s own paid rates. Edit them if the room needs different
          numbers — the day keeps what is confirmed here.
        </p>
        {form.tiers.map((tier, index) => (
          <div className="console-row" key={index}>
            <ConsoleField
              id={`switch-tier-label-${index}`}
              label="Label"
              topic="switchTierLabel"
            >
              <input
                id={`switch-tier-label-${index}`}
                className="console-input"
                data-testid="mode-panel__tier-label"
                value={tier.label}
                maxLength={20}
                onChange={(event) =>
                  form.patchTier(index, { label: event.target.value })
                }
              />
            </ConsoleField>
            <ConsoleField
              id={`switch-tier-points-${index}`}
              label="Points"
              topic="switchTierPoints"
            >
              <input
                id={`switch-tier-points-${index}`}
                className="console-input"
                data-testid="mode-panel__tier-points"
                value={tier.points}
                inputMode="numeric"
                onChange={(event) =>
                  form.patchTier(index, { points: event.target.value })
                }
              />
            </ConsoleField>
            <button
              type="button"
              className="console-button"
              data-testid="mode-panel__tier-remove"
              onClick={() => form.removeTier(index)}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="console-button"
          data-testid="mode-panel__tier-add"
          onClick={form.addTier}
          disabled={form.tiers.length >= 8}
        >
          Add a button
        </button>
      </fieldset>
      {form.error === null ? null : (
        <p
          className="console-danger"
          role="alert"
          data-testid="mode-panel__error"
        >
          {form.error}
        </p>
      )}
      <div className="console-row">
        <button
          type="button"
          className="console-button console-button--danger"
          data-testid="mode-panel__confirm"
          disabled={!form.isReady || isPending}
          onClick={() => void form.confirm()}
        >
          Switch to court awards
        </button>
        <button
          type="button"
          className="console-button"
          data-testid="mode-panel__cancel"
          onClick={form.close}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ModePanel(props: {
  desk: TournamentDesk;
  tournament: AdminTournamentView | null;
  form: TournamentSwitch;
}) {
  const { desk, tournament, form } = props;
  const isAwarding = desk.mode !== "fixtures";
  if (isAwarding) {
    return (
      <section className="console-panel" data-testid="mode-panel">
        <AwardDayBanner desk={desk} />
      </section>
    );
  }
  // Only a live fixture day can be switched: a draft has nothing on court and a closed day has no
  // room left to change what it was.
  if (tournament === null || tournament.status !== "live") return null;
  return (
    <section className="console-panel" data-testid="mode-panel">
      <h2>Mode</h2>
      <p className="console-meta">
        {modeLine({ mode: desk.mode, isDraining: false })}
      </p>
      {desk.modeRequest === null ? null : (
        <AskBanner request={desk.modeRequest} form={form} desk={desk} />
      )}
      {!form.isOpen ? (
        <>
          <p className="console-meta">
            Switching ends the fixture day and turns every court into a
            point-award station for the same teams. It is one-way.
          </p>
          <button
            type="button"
            className="console-button"
            data-testid="mode-panel__open"
            onClick={() => form.open()}
          >
            Switch courts to awarding points
          </button>
        </>
      ) : (
        <SwitchForm form={form} isPending={desk.isPending} />
      )}
    </section>
  );
}
