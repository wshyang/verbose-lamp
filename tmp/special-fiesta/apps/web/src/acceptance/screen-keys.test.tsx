import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ALL_SCREEN_SCENE_IDS, emptyStates, toggleScreenScene } from '@psd/contracts';
import type { ScreenSceneId } from '@psd/contracts';
import { formatDateTime } from '../lib/format.js';
import { SystemPage } from '../routes-superadmin/SystemPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { installFetchStub } from '../test-utils/fetchStub.js';
import type { FetchStub, RouteTable } from '../test-utils/fetchStub.js';
import { superadminSession } from '../test-utils/fixtures.js';

/**
 * ADR-145 — issuing a hall screen.
 *
 * Until this panel existed the projector could only be started by someone willing to
 * hand-write a URL around a credential nothing in the console would show them. What these
 * tests pin is the handling of that credential: shown once, gone when dismissed, and never
 * left lying underneath a list an operator has just used to revoke something.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

const TOKEN = 'scr-token-aaaabbbbccccdddd';

function key(
  over?: Partial<{
    id: string;
    label: string;
    revokedAt: string | null;
    enabledScenes: ScreenSceneId[];
  }>,
) {
  return {
    id: 'k1',
    label: 'Main hall',
    createdAt: '2026-10-04T01:00:00.000Z',
    lastSeenAt: '2026-10-04T02:30:00.000Z',
    revokedAt: null,
    // ADR-160 — a key minted without an opinion shows everything, which is what the server
    // defaults to and what every key did before scene selection existed.
    enabledScenes: [...ALL_SCREEN_SCENE_IDS],
    ...over,
  };
}

function renderSystem(routes: RouteTable = {}) {
  stub = installFetchStub({
    'GET /api/auth/session': { body: superadminSession },
    'GET /api/admin/service-state': {
      body: {
        state: { isSocialPaused: false, updatedAt: null, updatedByUsername: null },
        canRestart: true,
      },
    },
    'GET /api/admin/screen-keys': { body: { items: [] } },
    'POST /api/admin/screen-keys': {
      status: 201,
      body: { screenKey: key({ label: 'Foyer' }), token: TOKEN },
    },
    'POST /api/admin/screen-keys/k1/revoke': {
      body: { screenKey: key({ revokedAt: '2026-10-04T03:00:00.000Z' }) },
    },
    ...routes,
  });
  renderWithProviders(<SystemPage />, { path: '/admin/system' });
}

describe('ADR-145 — issuing a hall screen', () => {
  it('says there are no screens yet rather than showing an empty table', async () => {
    renderSystem();
    expect(await screen.findByText(emptyStates.screenKeys)).toBeTruthy();
  });

  it('will not create a screen with no name', async () => {
    renderSystem();
    // The server refuses it, and for a reason this panel has to respect rather than discover:
    // a list of unnamed keys cannot be revoked safely, because nobody can tell them apart.
    await waitFor(() => expect(screen.getByTestId('screen-keys__create')).toBeDisabled());
  });

  it('shows the projector link once, built around the console it was minted from', async () => {
    renderSystem();
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('screen-keys__label'), 'Foyer');
    await user.click(screen.getByTestId('screen-keys__create'));

    const url = await screen.findByTestId('screen-keys__url');
    // The whole deliverable: a URL somebody can open on the machine driving the projector.
    expect(url.textContent).toBe(`${window.location.origin}/screen?key=${TOKEN}`);
    expect(screen.getByTestId('screen-keys__minted')).toBeTruthy();
  });

  it('cannot bring the link back once it has been dismissed', async () => {
    renderSystem();
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('screen-keys__label'), 'Foyer');
    await user.click(screen.getByTestId('screen-keys__create'));
    await screen.findByTestId('screen-keys__url');

    await user.click(screen.getByTestId('screen-keys__dismiss'));

    /*
     * Gone, and no read can recover it: the list route is deliberately incapable of carrying
     * a token, so a panel that re-rendered one here would mean the server had started doing
     * the thing ADR-140 exists to prevent.
     */
    expect(screen.queryByTestId('screen-keys__url')).toBeNull();
    expect(JSON.stringify(stub.calls)).not.toContain(TOKEN);
  });

  it('copies the link when the browser has a clipboard, and still shows it when it does not', async () => {
    renderSystem();
    const user = userEvent.setup();
    const written: string[] = [];
    const clipboard = { writeText: (text: string) => (written.push(text), Promise.resolve()) };
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });

    await user.type(await screen.findByTestId('screen-keys__label'), 'Foyer');
    await user.click(screen.getByTestId('screen-keys__create'));
    await screen.findByTestId('screen-keys__url');
    await user.click(screen.getByTestId('screen-keys__copy'));

    await waitFor(() => expect(screen.getByTestId('screen-keys__copy').textContent).toBe('Copied'));
    expect(written).toEqual([`${window.location.origin}/screen?key=${TOKEN}`]);

  });

  it('still shows the link on a browser with no clipboard at all', async () => {
    renderSystem();
    const user = userEvent.setup();
    /*
     * The button is a convenience, not the mechanism. On a laptop served over plain HTTP
     * there is no clipboard API — it is a secure-context feature — and the operator must
     * still be able to read the link off the screen and type it. Its absence costs the
     * button and nothing else.
     */
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

    await user.type(await screen.findByTestId('screen-keys__label'), 'Foyer');
    await user.click(screen.getByTestId('screen-keys__create'));

    expect((await screen.findByTestId('screen-keys__url')).textContent).toContain('/screen?key=');
    expect(screen.queryByTestId('screen-keys__copy')).toBeNull();
  });

  it('says what went wrong when the list cannot be read', async () => {
    renderSystem({ 'GET /api/admin/screen-keys': { offline: true } });

    // The console is held by someone who can act on it — the opposite of the hall screen,
    // which shows no errors at all (ADR-144), and for the opposite reason.
    expect(await screen.findByTestId('screen-keys__error')).toBeTruthy();
  });

  it('asks before revoking, and says what the room will see', async () => {
    renderSystem({ 'GET /api/admin/screen-keys': { body: { items: [key()] } } });
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('screen-keys__revoke-k1'));
    expect(screen.getByTestId('confirm-dialog__body')).toHaveTextContent('goes blank');

    // Cancelled means cancelled: the wall stays up.
    await user.click(screen.getByTestId('confirm-dialog__cancel'));
    expect(stub.callsTo('POST /api/admin/screen-keys/k1/revoke')).toHaveLength(0);

    await user.click(screen.getByTestId('screen-keys__revoke-k1'));
    await user.click(screen.getByTestId('confirm-dialog__confirm'));
    await waitFor(() =>
      expect(stub.callsTo('POST /api/admin/screen-keys/k1/revoke')).toHaveLength(1),
    );
  });

  it('drops a minted link when any screen is revoked', async () => {
    renderSystem({ 'GET /api/admin/screen-keys': { body: { items: [key()] } } });
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('screen-keys__label'), 'Foyer');
    await user.click(screen.getByTestId('screen-keys__create'));
    await screen.findByTestId('screen-keys__url');

    await user.click(screen.getByTestId('screen-keys__revoke-k1'));
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    /*
     * An operator who has just retired a screen must not be left looking at a live key
     * underneath the list they used to do it. Working out which of the two the URL belongs
     * to is exactly the care nobody has at five past four.
     */
    await waitFor(() => expect(screen.queryByTestId('screen-keys__url')).toBeNull());
  });

  it('shows when each screen was last seen, and offers nothing to revoke on a dead one', async () => {
    renderSystem({
      'GET /api/admin/screen-keys': {
        body: {
          items: [key(), key({ id: 'k2', label: 'Stage left', revokedAt: '2026-10-04T03:00:00.000Z' })],
        },
      },
    });

    // "Last seen" is the question an operator actually asks before revoking: is this the key
    // the hall is running on? A revoked row answers a different one and offers no button.
    const live = await screen.findByTestId('screen-keys__row-k1');
    expect(live.textContent).toContain('Main hall');
    expect(live.textContent).toContain(formatDateTime(key().lastSeenAt));
    // Not the creation time, which answers "when was this issued" — a question nobody is
    // asking with their finger over a button that blanks a wall.
    expect(live.textContent).not.toContain(formatDateTime(key().createdAt));
    expect(screen.getByTestId('screen-keys__revoke-k1')).toBeTruthy();

    const dead = screen.getByTestId('screen-keys__row-k2');
    expect(dead.textContent).toContain('Revoked');
    expect(screen.queryByTestId('screen-keys__revoke-k2')).toBeNull();
  });
});

/**
 * ADR-160 — choosing what each screen shows.
 *
 * The checklist is obvious; the parts worth pinning are the ones that stop an operator
 * creating a screen they cannot diagnose: that the last scene cannot be unticked, that a
 * revoked key offers no edit, and that the whole set is sent on save rather than a diff.
 */
describe('ADR-160 — choosing what a screen shows', () => {
  it('mints a key showing only the scenes that are still ticked', async () => {
    renderSystem({
      'GET /api/admin/screen-keys': { body: { items: [] } },
      'POST /api/admin/screen-keys': {
        status: 201,
        body: { screenKey: key({ label: 'Foyer' }), token: TOKEN },
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('screen-keys__label'), 'Foyer');

    // Starts with everything ticked, and the operator subtracts.
    expect(screen.getByTestId('screen-keys__new__scene-board')).toBeChecked();
    await user.click(screen.getByTestId('screen-keys__new__scene-board'));
    await user.click(screen.getByTestId('screen-keys__new__scene-individuals'));
    await user.click(screen.getByTestId('screen-keys__create'));

    await waitFor(() => expect(stub.callsTo('POST /api/admin/screen-keys')).toHaveLength(1));
    const sent = stub.callsTo('POST /api/admin/screen-keys')[0]?.body as {
      enabledScenes: string[];
    };
    expect(sent.enabledScenes).not.toContain('board');
    expect(sent.enabledScenes).not.toContain('individuals');
    expect(sent.enabledScenes).toContain('onCourt');
  });

  /*
   * A screen showing nothing is indistinguishable from a projector that has died. The server
   * refuses it too — this is here so the operator finds out from the box not moving rather
   * than from an error after they committed.
   */
  it('will not let the last scene be unticked', async () => {
    renderSystem({ 'GET /api/admin/screen-keys': { body: { items: [] } } });
    const user = userEvent.setup();
    const checklist = await screen.findByTestId('screen-keys__new__scenes');
    expect(checklist).toBeInTheDocument();

    for (const id of ALL_SCREEN_SCENE_IDS.slice(0, 8)) {
      await user.click(screen.getByTestId(`screen-keys__new__scene-${id}`));
    }
    const last = screen.getByTestId('screen-keys__new__scene-photosTop');
    expect(last).toBeChecked();
    expect(last).toBeDisabled();
  });

  /*
   * Asserted directly, because over the UI it is invisible: the checkbox is disabled when it
   * is the last one ticked, so `userEvent` will not click it and the rule below never runs.
   * Disabling is the better surface — an unresponsive checkbox reads as a bug — but the
   * shared rule has three call sites including the server, and it has to be safe on its own
   * rather than safe because of the two callers that happen to guard it today. ADR-138 hit
   * the same shape and answered it the same way.
   */
  it('refuses to empty the set, as a rule rather than as a disabled attribute', () => {
    expect(toggleScreenScene(['board', 'onCourt'], 'board')).toEqual(['onCourt']);
    const last: ScreenSceneId[] = ['board'];
    // The SAME array back, so a caller can tell "refused" by identity.
    expect(toggleScreenScene(last, 'board')).toBe(last);
    expect(toggleScreenScene(last, 'onCourt')).toEqual(['board', 'onCourt']);
  });

  it('changes a live screen in place, sending the whole set', async () => {
    renderSystem({
      'GET /api/admin/screen-keys': { body: { items: [key()] } },
      'PATCH /api/admin/screen-keys/k1/scenes': {
        body: { screenKey: key({ enabledScenes: ['onCourt'] }) },
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('screen-keys__edit-k1'));

    await user.click(screen.getByTestId('screen-keys__edit-k1__scene-board'));
    await user.click(screen.getByTestId('screen-keys__save-k1'));

    await waitFor(() =>
      expect(stub.callsTo('PATCH /api/admin/screen-keys/k1/scenes')).toHaveLength(1),
    );
    const sent = stub.callsTo('PATCH /api/admin/screen-keys/k1/scenes')[0]?.body as {
      enabledScenes: string[];
    };
    /*
     * The whole set, not a diff. A checklist is read as a set, and a diff would need an
     * answer to "two superadmins each ticked one box" that nobody wants to write.
     */
    expect(sent.enabledScenes).toHaveLength(8);
    expect(sent.enabledScenes).not.toContain('board');
  });

  it('abandons an edit on cancel without writing anything', async () => {
    renderSystem({ 'GET /api/admin/screen-keys': { body: { items: [key()] } } });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('screen-keys__edit-k1'));
    await user.click(screen.getByTestId('screen-keys__edit-k1__scene-board'));
    await user.click(screen.getByTestId('screen-keys__cancel-k1'));

    expect(stub.callsTo('PATCH /api/admin/screen-keys/k1/scenes')).toHaveLength(0);
    // Reopening starts from the server's answer, not from the abandoned draft.
    await user.click(screen.getByTestId('screen-keys__edit-k1'));
    expect(screen.getByTestId('screen-keys__edit-k1__scene-board')).toBeChecked();
  });

  it('summarises what each screen shows, and offers no edit on a revoked one', async () => {
    renderSystem({
      'GET /api/admin/screen-keys': {
        body: {
          items: [
            key({ id: 'k1', enabledScenes: ['onCourt', 'upNext'] }),
            key({ id: 'k2', label: 'Dead', revokedAt: '2026-10-04T03:00:00.000Z' }),
          ],
        },
      },
    });
    expect(await screen.findByTestId('screen-keys__shows-k1')).toHaveTextContent(
      'On court now, Up next',
    );
    // All nine reads as one word rather than as a list nobody finishes.
    expect(screen.getByTestId('screen-keys__shows-k2')).toHaveTextContent('Everything');
    expect(screen.queryByTestId('screen-keys__edit-k2')).toBeNull();
  });
});
