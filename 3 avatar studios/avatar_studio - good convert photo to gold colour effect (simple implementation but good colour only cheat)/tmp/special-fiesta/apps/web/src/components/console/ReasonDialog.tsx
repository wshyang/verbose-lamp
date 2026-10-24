import { ConsoleField } from './ConsoleField.js';

/**
 * Every void / unvoid / winner edit needs a reason before it is allowed through
 * (fds.md §2.13, F44–F48). One dialog serves all of them so the requirement cannot be
 * forgotten on a new correction surface.
 */
export function ReasonDialog(props: {
  title: string;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isBusy: boolean;
  error: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="console-modal" role="dialog" aria-modal="true" aria-label={props.title}>
      <div className="console-modal-body">
        <h2>{props.title}</h2>
        {props.children}
        {/*
          ADR-085 — Enter on the reason confirms. A correction console is used at speed with one
          hand on the keyboard, and `isBusy` keeps a double Enter from sending the change twice.
        */}
        <form
          data-testid="reason-dialog__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!props.isBusy) props.onConfirm();
          }}
        >
          <ConsoleField id="reason-dialog-reason" label="Reason" topic="actReason">
            <input
              className="console-input"
              data-testid="reason-dialog__reason"
              value={props.reason}
              autoFocus
              onChange={(event) => props.onReasonChange(event.target.value)}
            />
          </ConsoleField>
          {props.error ? <p className="console-danger">{props.error}</p> : null}
          <div className="console-row" style={{ marginTop: 16 }}>
            <button
              type="submit"
              className="console-button console-button--primary"
              data-testid="reason-dialog__confirm"
              disabled={props.isBusy}
            >
              Confirm
            </button>
            <button
              type="button"
              className="console-button console-button--ghost"
              data-testid="reason-dialog__cancel"
              onClick={props.onCancel}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
