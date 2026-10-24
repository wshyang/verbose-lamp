import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog.js';
import { useConfirm } from '../../lib/hooks/useConfirm.js';

/**
 * ADR-027 — the guard in front of every action that awards points, ends a phase or
 * removes somebody. What matters is that nothing runs until the second tap, and that a
 * stray Enter chooses the safe answer.
 */

function Harness(props: { run: () => void; isDanger?: boolean; isBusy?: boolean }) {
  const confirm = useConfirm();
  return (
    <>
      <button
        type="button"
        data-testid="harness__trigger"
        onClick={() =>
          confirm.ask({
            title: 'End round 2?',
            body: 'The station stops accepting scans.',
            confirmLabel: 'End the round',
            isDanger: props.isDanger,
            run: props.run,
          })
        }
      >
        End round
      </button>
      <ConfirmDialog confirm={confirm} isBusy={props.isBusy} />
    </>
  );
}

describe('ConfirmDialog', () => {
  it('shows nothing until something is asked', () => {
    render(<Harness run={() => undefined} />);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('runs the action only after the second tap', async () => {
    const run = vi.fn();
    render(<Harness run={run} />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('harness__trigger'));
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-dialog__title')).toHaveTextContent('End round 2?');
    expect(screen.getByTestId('confirm-dialog__body')).toHaveTextContent('stops accepting scans');
    // The safe answer holds the focus, so Enter or a stray tap cannot award anything.
    expect(document.activeElement).toBe(screen.getByTestId('confirm-dialog__cancel'));

    await user.click(screen.getByTestId('confirm-dialog__confirm'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('backs out without running anything', async () => {
    const run = vi.fn();
    render(<Harness run={run} />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('harness__trigger'));
    await user.click(screen.getByTestId('confirm-dialog__cancel'));

    expect(run).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('marks a destructive answer, and stops a double tap while the request is in flight', async () => {
    render(<Harness run={() => undefined} isDanger isBusy />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('harness__trigger'));

    expect(screen.getByTestId('confirm-dialog__confirm')).toHaveClass('psd-modal__button--danger');
    expect(screen.getByTestId('confirm-dialog__confirm')).toBeDisabled();
    expect(screen.getByTestId('confirm-dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('refuses to accept a request that is not there', () => {
    const { result } = renderHook(() => useConfirm());
    expect(() => act(() => result.current.accept())).toThrow(/confirm request/);
  });
});
