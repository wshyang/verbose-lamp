import type { ConfirmState } from '../../lib/hooks/useConfirm.js';

/**
 * ADR-027 — the one confirmation dialog, used by both presentations. It is deliberately
 * plain: a title that names the thing, a sentence saying what will happen, and two
 * buttons. Cancel holds the focus, because the dangerous answer should never be the one a
 * stray tap or a pressed Enter key chooses.
 */
export function ConfirmDialog(props: { confirm: ConfirmState; isBusy?: boolean | undefined }) {
  const request = props.confirm.request;
  if (request === null) return null;

  return (
    <div
      className="psd-modal"
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      data-testid="confirm-dialog"
    >
      <div className="psd-modal__body">
        <h2 data-testid="confirm-dialog__title">{request.title}</h2>
        <p data-testid="confirm-dialog__body">{request.body}</p>
        <div className="psd-modal__actions">
          <button
            type="button"
            className="psd-modal__button psd-modal__button--cancel"
            data-testid="confirm-dialog__cancel"
            autoFocus
            onClick={props.confirm.cancel}
          >
            Not yet
          </button>
          <button
            type="button"
            className={
              request.isDanger === true
                ? 'psd-modal__button psd-modal__button--danger'
                : 'psd-modal__button psd-modal__button--confirm'
            }
            data-testid="confirm-dialog__confirm"
            disabled={props.isBusy === true}
            onClick={props.confirm.accept}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
