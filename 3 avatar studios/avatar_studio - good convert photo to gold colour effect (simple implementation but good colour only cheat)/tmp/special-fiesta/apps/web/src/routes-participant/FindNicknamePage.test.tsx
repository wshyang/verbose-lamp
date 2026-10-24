import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLUSTER_CODES, emptyStates } from '@psd/contracts';
import { installFetchStub, type FetchStub } from '../test-utils/fetchStub.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { FindNicknamePage } from './FindNicknamePage.js';
import { SignInPage } from './SignInPage.js';
import { SignUpPage } from './SignUpPage.js';

/**
 * ADR-164 — the screen that stops a second sign-up.
 *
 * The behaviour worth pinning is not that a list renders. It is the shape of the escape route:
 * nothing is asked for until a cluster is chosen, the typed filter narrows what has already
 * arrived rather than asking again, and choosing a nickname lands on sign-in with the name
 * filled in and a PIN still required — because recognising a nickname on a public list is not
 * proof of owning it.
 */

const NICKNAMES = '/api/participants/nicknames';
let stub: FetchStub;

function openFinder(nicknames: string[] = ['BeachBoss', 'Marcus_Lim', 'wei_ling']) {
  stub = installFetchStub({
    'GET /api/auth/session': { status: 200, body: { session: null } },
    'GET /api/clusters': {
      status: 200,
      body: { items: CLUSTER_CODES.map((code) => ({ code, displayName: code })) },
    },
    [`GET ${NICKNAMES}`]: { status: 200, body: { nicknames } },
  });
  return { user: userEvent.setup(), ...renderWithProviders(<FindNicknamePage />) };
}

/**
 * The one way to pick a cluster in these tests.
 *
 * `selectOptions` needs the `<option>` to exist, and the options arrive with `GET /api/clusters` a moment
 * after the element does — so a test that waits for the element and then selects is a test that passes when
 * the machine is idle and fails in the middle of a loaded run. Waiting for the option is the assertion the
 * sentence actually makes, and it belongs in one place rather than in nine.
 */
async function chooseCluster(user: ReturnType<typeof userEvent.setup>, code: string): Promise<void> {
  const select = await screen.findByTestId('find-nickname__cluster');
  await waitFor(() => expect(select.querySelector(`option[value='${code}']`)).not.toBeNull());
  await user.selectOptions(select, code);
}

afterEach(() => {
  stub.restore();
});

describe('finding a forgotten nickname', () => {
  /*
   * The first rule of the screen. "Every nickname at the event" is not an answer anybody can
   * read down, and asking for one before a cluster is picked would also mean the page hits the
   * server on every visit whether or not it is used.
   */
  it('asks for nothing until a cluster is chosen', async () => {
    const { user } = openFinder();
    expect(stub.callsTo(`GET ${NICKNAMES}`)).toHaveLength(0);
    expect(screen.queryByTestId('find-nickname__match')).toBeNull();

    await chooseCluster(user, 'CS');

    await waitFor(() => expect(stub.callsTo(`GET ${NICKNAMES}`)).toHaveLength(1));
  });

  it('lists the cluster once one is chosen', async () => {
    const { user } = openFinder();
    await chooseCluster(user, 'CS');

    const matches = await screen.findAllByTestId('find-nickname__match');
    expect(matches.map((button) => button.textContent)).toEqual([
      'BeachBoss',
      'Marcus_Lim',
      'wei_ling',
    ]);
  });

  /*
   * Filtering in the browser, not on the server. Somebody at a desk trying to recall whether
   * they were `BeachBoss` or `Beach_Boss` has to be able to try both in the same second, and a
   * round trip per keystroke makes that a different experience.
   */
  it('narrows the list as you type, without asking the server again', async () => {
    const { user } = openFinder();
    await chooseCluster(user, 'CS');
    await screen.findAllByTestId('find-nickname__match');
    const before = stub.callsTo(`GET ${NICKNAMES}`).length;

    await user.type(screen.getByTestId('find-nickname__filter'), 'boss');

    await waitFor(() => expect(screen.getAllByTestId('find-nickname__match')).toHaveLength(1));
    expect(screen.getByTestId('find-nickname__match')).toHaveTextContent('BeachBoss');
    expect(stub.callsTo(`GET ${NICKNAMES}`)).toHaveLength(before);
  });

  /* The fragment people retain is as often the end of the word as the start of it. */
  it('matches anywhere in the nickname, not only the start', async () => {
    const { user } = openFinder();
    await chooseCluster(user, 'CS');
    await screen.findAllByTestId('find-nickname__match');

    await user.type(screen.getByTestId('find-nickname__filter'), 'lim');

    await waitFor(() => expect(screen.getAllByTestId('find-nickname__match')).toHaveLength(1));
    expect(screen.getByTestId('find-nickname__match')).toHaveTextContent('Marcus_Lim');
  });

  it('ignores the case of what was typed, because nobody remembers that either', async () => {
    const { user } = openFinder();
    await chooseCluster(user, 'CS');
    await screen.findAllByTestId('find-nickname__match');

    await user.type(screen.getByTestId('find-nickname__filter'), 'WEI');

    await waitFor(() => expect(screen.getAllByTestId('find-nickname__match')).toHaveLength(1));
  });

  /*
   * Two different nothings. An empty cluster is a quiet morning; an empty filter result is a
   * wrong guess, and only one of those is worth telling somebody to try less of.
   */
  it('tells an empty cluster apart from a filter that matched nothing', async () => {
    const { user } = openFinder();
    await chooseCluster(user, 'CS');
    await screen.findAllByTestId('find-nickname__match');

    await user.type(screen.getByTestId('find-nickname__filter'), 'zzzz');

    expect(await screen.findByTestId('find-nickname__empty')).toHaveTextContent(
      emptyStates.clusterNicknamesFiltered,
    );
  });

  it('says so plainly when nobody from the cluster has signed up', async () => {
    const { user } = openFinder([]);
    await chooseCluster(user, 'CS');

    expect(await screen.findByTestId('find-nickname__empty')).toHaveTextContent(
      emptyStates.clusterNicknames,
    );
  });

  /* A filter typed against one cluster's list means nothing against another's. */
  it('clears the filter when the cluster changes', async () => {
    const { user } = openFinder();
    await chooseCluster(user, 'CS');
    await screen.findAllByTestId('find-nickname__match');
    await user.type(screen.getByTestId('find-nickname__filter'), 'boss');
    await waitFor(() => expect(screen.getAllByTestId('find-nickname__match')).toHaveLength(1));

    // The same helper a second time, because "the options are surely there by now" is the assumption that
    // made the first selection load-dependent.
    await chooseCluster(user, 'BP');

    await waitFor(() => expect(screen.getAllByTestId('find-nickname__match')).toHaveLength(3));
    expect(screen.getByTestId('find-nickname__filter')).toHaveValue('');
  });
});

describe('what the two doors say', () => {
  /*
   * The whole point of the feature is on the sign-up page, not the sign-in page. Somebody who
   * could remember their nickname would already have taken "I already have a nickname"; this
   * is for the person who cannot, standing in front of the form that would make the duplicate.
   */
  it('warns on the sign-up form, before the nickname field', async () => {
    stub = installFetchStub({
      'GET /api/auth/session': { status: 200, body: { session: null } },
      'GET /api/clusters': { status: 200, body: { items: [] } },
    });
    renderWithProviders(<SignUpPage />);

    const warning = await screen.findByTestId('signup-form__duplicate-warning');
    expect(warning).toHaveTextContent("leaves this morning's points behind");
    const finder = screen.getByTestId('signup-form__find-nickname');
    expect(finder).toHaveAttribute('href', '/find-nickname');
    // Before the form, so it is read before the first field is filled in rather than after.
    expect(warning.compareDocumentPosition(screen.getByTestId('signup-form__form'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('offers the same way out from sign-in, beside the PIN reset', async () => {
    stub = installFetchStub({ 'GET /api/auth/session': { status: 200, body: { session: null } } });
    renderWithProviders(<SignInPage />);

    expect(await screen.findByTestId('signin-form__find-nickname')).toHaveAttribute(
      'href',
      '/find-nickname',
    );
  });
});

describe('arriving back at sign-in with a name', () => {
  beforeEach(() => {
    stub = installFetchStub({ 'GET /api/auth/session': { status: 200, body: { session: null } } });
  });

  /*
   * Filled in, not signed in. The list this name came off is public, so recognising a nickname
   * proves nothing — the PIN is the only thing that does, and it is still required here.
   */
  it('fills the nickname in and still asks for the PIN', async () => {
    renderWithProviders(<SignInPage />, { path: '/signin?nickname=BeachBoss', route: '/signin' });

    expect(await screen.findByTestId('signin-form__nickname')).toHaveValue('BeachBoss');
    expect(screen.getByTestId('signin-form__pin')).toHaveValue('');
    expect(screen.getByTestId('signin-form__submit')).toBeDisabled();
  });

  it('leaves the field empty for somebody who came here directly', async () => {
    renderWithProviders(<SignInPage />);

    expect(await screen.findByTestId('signin-form__nickname')).toHaveValue('');
  });
});
