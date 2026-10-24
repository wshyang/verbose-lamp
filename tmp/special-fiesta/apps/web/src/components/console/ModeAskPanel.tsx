import { ConsoleField } from "./ConsoleField.js";
import type { ModeAsk } from "../../lib/hooks/useModeAsk.js";

/**
 * ADR-336 §5.4 — a marshal's ask, on the page where the problem is seen.
 *
 * The ask is a question, not a button that changes anything: it names who asked and why, and it waits
 * for the desk. While one is pending the page says whose it is, so a second marshal adds nothing and
 * knows why. The same panel sits on the court page and on the station picker, because a marshal
 * standing at the picker is standing in the same room.
 *
 * ADR-342 — the desk's decline comes back with its reason, because a "no" that teaches nothing
 * invites the same ask again. It stays until the marshal has read it, and the form below it is
 * ready the whole time: the owner's rule is ask again at once if the room still needs it.
 */
export function ModeAskPanel(props: { ask: ModeAsk }) {
  const { ask } = props;
  if (ask.isAwarding) return null;
  const declined =
    ask.declinedAnswer === null ? null : (
      <section className="console-panel" data-testid="mode-ask__declined">
        <h2>The desk said no</h2>
        <p className="console-meta" data-testid="mode-ask__declined-reason">
          {ask.declinedAnswer.declineReason ?? "The desk did not say why."}
        </p>
        <p className="console-muted">
          Ask again if the room still needs it — the desk will say why if not.
        </p>
        <button
          type="button"
          className="console-button"
          data-testid="mode-ask__dismiss"
          onClick={ask.dismissDeclined}
        >
          Understood
        </button>
      </section>
    );
  if (ask.pendingRequest !== null) {
    // The decline above this block is the asker's last question; the pending ask is their current
    // one, and seeing both is how a marshal learns what the desk objected to while asking again.
    return (
      <>
        {declined}
        <section className="console-panel" data-testid="mode-ask__pending">
          <h2>Waiting on the desk</h2>
          <p className="console-meta">
            {ask.pendingRequest.requestedByLabel} asked to switch the courts to
            awarding points — {ask.pendingRequest.reason}
          </p>
          <p className="console-muted">
            The desk answers from Tournament Control. It stays open however long
            that takes.
          </p>
        </section>
      </>
    );
  }
  return (
    <>
      {declined}
      <section className="console-panel" data-testid="mode-ask">
        <h2>Courts need to award points?</h2>
        <p className="console-muted">
          Only the desk can end the fixture day. Ask, and say why — the desk sees
          it on Tournament Control.
        </p>
        <ConsoleField
          id="mode-ask-reason"
          label="Why the courts should award points"
          topic="switchReason"
        >
          <input
            id="mode-ask-reason"
            className="console-input"
            data-testid="mode-ask__reason"
            value={ask.reason}
            maxLength={200}
            onChange={(event) => ask.setReason(event.target.value)}
          />
        </ConsoleField>
        {ask.error === null ? null : (
          <p
            className="console-danger"
            role="alert"
            data-testid="mode-ask__error"
          >
            {ask.error}
          </p>
        )}
        <button
          type="button"
          className="console-button"
          data-testid="mode-ask__submit"
          disabled={ask.isBusy || ask.reason.trim() === ""}
          onClick={() => void ask.ask()}
        >
          Ask the desk to switch
        </button>
      </section>
    </>
  );
}
