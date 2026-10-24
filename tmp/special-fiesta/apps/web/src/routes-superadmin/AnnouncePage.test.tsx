import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ANNOUNCEMENT_BODY_MAX_LENGTH } from '@psd/contracts';
import { installFetchStub, type FetchStub } from '../test-utils/fetchStub.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { AnnouncePage } from './AnnouncePage.js';

/**
 * ADR-074 — announcing to the beach.
 *
 * Two traps here, both capable of wasting an afternoon:
 *
 *   1. The send button is gated on `useIsOnline()` — deliberately *not* `useSync`, which throws on this
 *      surface because `SyncProvider` is not in the superadmin tree. `navigator.onLine` must therefore
 *      be controlled, or the button is disabled in every test and the page looks broken.
 *   2. A retracted announcement **stays in the console list**, because that list is an audit trail and
 *      `AnnouncementView` carries no `retractedAt` for the table to filter on. Only the participant
 *      feed hides them. Asserting the row disappears would fail forever, correctly.
 */

const LIST = '/api/admin/announcements';
let stub: FetchStub;

function announcement(id: string, body: string) {
  return { id, body, authorLabel: 'superadmin', createdAt: '2026-09-30T02:00:00.000Z' };
}

function setLink(isOnline: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: isOnline, configurable: true });
}

function openConsole(announcements: unknown[] = []) {
  stub = installFetchStub({
    'GET /api/auth/session': { status: 200, body: { session: null } },
    [`GET ${LIST}`]: { status: 200, body: { announcements } },
    [`POST ${LIST}`]: { status: 201, body: { announcement: announcement('new', 'sent') } },
    [`POST ${LIST}/:id/retract`]: { status: 200, body: { announcement: announcement('a1', 'x') } },
  });
  return { user: userEvent.setup(), ...renderWithProviders(<AnnouncePage />) };
}

beforeEach(() => setLink(true));

afterEach(() => {
  stub.restore();
  setLink(true);
});

describe('AnnouncePage', () => {
  it('will not send an empty announcement', async () => {
    openConsole();

    expect(await screen.findByTestId('announce__send')).toBeDisabled();
  });

  it('will not send whitespace dressed up as a message', async () => {
    const { user } = openConsole();
    await screen.findByTestId('announce__send');

    await user.type(screen.getByTestId('announce__body'), '    ');

    expect(screen.getByTestId('announce__send')).toBeDisabled();
  });

  it('sends once there is something to say', async () => {
    const { user } = openConsole();
    await screen.findByTestId('announce__send');

    await user.type(screen.getByTestId('announce__body'), 'Lunch is at noon');
    expect(screen.getByTestId('announce__send')).toBeEnabled();
    await user.click(screen.getByTestId('announce__send'));

    await waitFor(() => expect(stub.callsTo(`POST ${LIST}`)).toHaveLength(1));
    expect(stub.callsTo(`POST ${LIST}`)[0]?.body).toEqual({ body: 'Lunch is at noon' });
  });

  /* Connectivity, not the sync queue — a dead link must stop the send before it is attempted. */
  it('refuses to send while the link is down, and says so', async () => {
    setLink(false);
    const { user } = openConsole();
    await screen.findByTestId('announce__send');

    await user.type(screen.getByTestId('announce__body'), 'Rain delay');

    expect(screen.getByTestId('announce__offline')).toBeVisible();
    expect(screen.getByTestId('announce__send')).toBeDisabled();
    expect(stub.callsTo(`POST ${LIST}`)).toHaveLength(0);
  });

  it('comes back to life when the link does', async () => {
    setLink(false);
    const { user } = openConsole();
    await screen.findByTestId('announce__send');
    await user.type(screen.getByTestId('announce__body'), 'Back on');

    setLink(true);
    act(() => window.dispatchEvent(new Event('online')));

    await waitFor(() => expect(screen.getByTestId('announce__send')).toBeEnabled());
    expect(screen.queryByTestId('announce__offline')).toBeNull();
  });

  it('caps the draft at the contract length rather than trusting the server to refuse it', async () => {
    openConsole();

    expect(await screen.findByTestId('announce__body')).toHaveAttribute(
      'maxlength',
      String(ANNOUNCEMENT_BODY_MAX_LENGTH),
    );
  });

  /*
   * The author column is asserted because it was silently blank for a while: the fixture here supplied
   * `createdByUsername`, which is not a field on `AnnouncementView` — the real shape is
   * `{ id, body, authorLabel, createdAt }`. Vitest transpiles without typechecking, so the suite stayed
   * green while the page rendered an empty cell. Asserting the column is what makes the fixture's shape
   * matter at run time as well as to `tsc`.
   */
  it('lists what has been announced, with who said it, in the order the server gave', async () => {
    openConsole([announcement('a1', 'First thing'), announcement('a2', 'Second thing')]);

    const rows = await screen.findAllByTestId('announce__row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('First thing');
    expect(rows[0]).toHaveTextContent('superadmin');
  });

  /*
   * The audit trail. A retracted announcement is gone from the participants' feed and still here, so
   * there is a record of what was said. The row count must not fall.
   */
  it('keeps a retracted announcement in the console list', async () => {
    const { user } = openConsole([announcement('a1', 'Wrong court number')]);
    await screen.findAllByTestId('announce__row');

    await user.click(screen.getByTestId('announce__retract'));

    await waitFor(() => expect(stub.callsTo(`POST ${LIST}/a1/retract`)).toHaveLength(1));
    expect(screen.getAllByTestId('announce__row')).toHaveLength(1);
  });

  it('announces a refused send where a screen reader will hear it', async () => {
    const { user } = openConsole();
    await screen.findByTestId('announce__send');
    stub.routes[`POST ${LIST}`] = {
      status: 400,
      body: { error: { message: 'That announcement is too long.' } },
    };

    await user.type(screen.getByTestId('announce__body'), 'Something');
    await user.click(screen.getByTestId('announce__send'));

    const alert = await screen.findByTestId('announce__error');
    expect(alert).toHaveTextContent('That announcement is too long.');
    expect(alert).toHaveAttribute('role', 'alert');
  });
});
