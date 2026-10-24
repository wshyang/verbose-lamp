import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { messages } from '@psd/contracts';
import type { ChatMessageView } from '@psd/contracts';
import { installEventSourceStub, type EventSourceStub } from '../test-utils/eventSourceStub.js';
import { installFetchStub, type FetchStub } from '../test-utils/fetchStub.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { ChatPanel } from './ChatPanel.js';
import { required } from '../lib/required.js';
import { advanceFeedMark, forgetFeedMarks, NO_MARKS } from '../lib/storage/feedReadStore.js';
import { identityRoutes } from '../test-utils/ambientRoutes.js';

/**
 * ADR-046/064/065/066 — the one room, as a surface.
 *
 * `useChatRoom.test.ts` covers the merge logic; this covers what the panel does with it, stubbing the
 * same two boundaries: `fetch` and `EventSource`. Everything between — the hook, the api modules,
 * `useLoadOlder`, the shell — is real.
 *
 * Three things want a surface test rather than a hook test: a staff message must be badged differently
 * from a participant's (ADR-046, and it is the only way to tell staff from a neighbour), the "Earlier
 * messages" button must exist as a real control rather than relying on an `IntersectionObserver` a
 * keyboard user never triggers (ADR-065), and the panel must *say* when it has fallen back to polling
 * (ADR-064) instead of quietly going stale.
 */

const MESSAGES = '/api/chat/messages';
let stub: FetchStub;
let stream: EventSourceStub;

function message(over?: {
  id?: string;
  body?: string;
  authorType?: 'participant' | 'facilitator';
  authorLabel?: string;
  clusterCode?: string;
}): ChatMessageView {
  return {
    id: '01a0f000-0000-7000-8000-000000000001',
    authorType: 'participant',
    authorLabel: 'BeachBoss',
    authorParticipantId: over?.authorType === 'participant' || over?.authorType === undefined ? 'p1' : null,
    clusterCode: 'CS',
    body: 'Anyone at court 2?',
    createdAt: '2026-09-30T02:00:00.000Z',
    ...over,
  } as ChatMessageView;
}

function openRoom(options?: { messages?: ChatMessageView[]; hasOlder?: boolean }) {
  stub = installFetchStub({
    ...identityRoutes(),
    'GET /api/auth/session': { status: 200, body: { session: null } },
    'GET /api/me/alerts': { status: 200, body: { announcements: [] } },
    [`GET ${MESSAGES}`]: {
      status: 200,
      body: { messages: options?.messages ?? [message()], hasOlder: options?.hasOlder ?? false },
    },
    [`POST ${MESSAGES}`]: { status: 201, body: { message: message({ id: 'new', body: 'sent' }) } },
    // ADR-083 — opening the room reports how far it read; the panel does not care about the answer.
    'POST /api/chat/read': { status: 200, body: { chatUnread: false } },
  });
  return { user: userEvent.setup(), ...renderWithProviders(<ChatPanel />) };
}

beforeEach(() => {
  stream = installEventSourceStub();
});

afterEach(() => {
  stream.restore();
  stub.restore();
});

describe('ChatPanel', () => {
  /*
   * ADR-118 — the room is closed. The tab must survive the closure: a participant who has been
   * chatting all morning and finds the tab gone concludes their phone is broken and signs out
   * and in again, which is more load applied by exactly the people we were shedding load from.
   */
  it('keeps the tabs and explains itself when chat is paused', async () => {
    stub = installFetchStub({
    ...identityRoutes(),
      'GET /api/auth/session': { status: 200, body: { session: null } },
      'GET /api/me/alerts': { status: 200, body: { announcements: [] } },
      [`GET ${MESSAGES}`]: { status: 503, body: { error: { message: messages.socialPaused } } },
    });
    renderWithProviders(<ChatPanel />);

    expect(await screen.findByTestId('social-paused')).toHaveTextContent(messages.socialPaused);
    expect(screen.getAllByTestId('social-tabs__link').length).toBeGreaterThan(0);
    // No composer behind the notice: a box you can type into is a promise to deliver it.
    expect(screen.queryByTestId('chat-panel__send')).toBeNull();
  });

  it('still shows an ordinary failure as a failure, not as a pause', async () => {
    stub = installFetchStub({
    ...identityRoutes(),
      'GET /api/auth/session': { status: 200, body: { session: null } },
      'GET /api/me/alerts': { status: 200, body: { announcements: [] } },
      [`GET ${MESSAGES}`]: { status: 500, body: { error: { message: 'Boom.' } } },
    });
    renderWithProviders(<ChatPanel />);

    expect(await screen.findByTestId('chat-panel__error')).toHaveTextContent('Boom.');
    expect(screen.queryByTestId('social-paused')).toBeNull();
  });

  it('shows the room, one row per message', async () => {
    openRoom();

    const rows = await screen.findAllByTestId('chat-panel__message');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Anyone at court 2?');
    expect(rows[0]).toHaveTextContent('BeachBoss');
  });

  /* A participant is badged by cluster; staff are badged STAFF, which is how you tell them apart. */
  it('badges a participant by their cluster', async () => {
    openRoom({ messages: [message({ clusterCode: 'ITC' })] });

    const [row] = await screen.findAllByTestId('chat-panel__message');
    expect(row).toHaveTextContent('ITC');
    expect(row).not.toHaveTextContent('STAFF');
  });

  it('badges staff as staff, not by cluster', async () => {
    openRoom({
      messages: [message({ authorType: 'facilitator', authorLabel: 'court1', clusterCode: 'ITC' })],
    });

    const [row] = await screen.findAllByTestId('chat-panel__message');
    expect(row).toHaveTextContent('STAFF');
  });

  /**
   * ADR-202 — the slot beside every name. The room is rendered here without a
   * `PeopleProvider`, which is exactly the state a real room spends its first moment in, so
   * this pins the two things that must be true before any directory answer arrives: the slot
   * exists, and a staff line is already distinguishable without one.
   */
  it('gives every line an avatar slot, and marks the staff ones as not being faces', async () => {
    openRoom({
      messages: [
        message({ id: '01a0f000-0000-7000-8000-000000000001' }),
        message({
          id: '01a0f000-0000-7000-8000-000000000002',
          authorType: 'facilitator',
          authorLabel: 'court1',
        }),
      ],
    });

    const rows = await screen.findAllByTestId('chat-panel__message');
    expect(rows).toHaveLength(2);
    // A participant: a slot holding their face, or holding its width until it arrives.
    expect(required(rows[0], 'participant row').querySelector('.gb-chat-avatar')).not.toBeNull();
    // An organiser: no participant, so no face is invented for them (ADR-202).
    expect(
      required(rows[1], 'staff row').querySelector('[data-testid="chat-avatar__staff"]'),
    ).not.toBeNull();
  });

  it('will not send an empty message, or whitespace pretending to be one', async () => {
    const { user } = openRoom();
    await screen.findAllByTestId('chat-panel__message');

    expect(screen.getByTestId('chat-panel__send')).toBeDisabled();
    await user.type(screen.getByTestId('chat-panel__draft'), '   ');
    expect(screen.getByTestId('chat-panel__send')).toBeDisabled();
  });

  it('sends what was typed', async () => {
    const { user } = openRoom();
    await screen.findAllByTestId('chat-panel__message');

    await user.type(screen.getByTestId('chat-panel__draft'), 'On my way');
    await user.click(screen.getByTestId('chat-panel__send'));

    await waitFor(() => expect(stub.callsTo(`POST ${MESSAGES}`)).toHaveLength(1));
    expect(stub.callsTo(`POST ${MESSAGES}`)[0]?.body).toEqual({ body: 'On my way' });
  });

  it('announces a refused send where a screen reader will hear it', async () => {
    const { user } = openRoom();
    await screen.findAllByTestId('chat-panel__message');
    stub.routes[`POST ${MESSAGES}`] = {
      status: 429,
      body: { error: { message: 'Slow down a moment.' } },
    };

    await user.type(screen.getByTestId('chat-panel__draft'), 'again');
    await user.click(screen.getByTestId('chat-panel__send'));

    const alert = await screen.findByTestId('chat-panel__send-error');
    expect(alert).toHaveTextContent('Slow down a moment.');
    expect(alert).toHaveAttribute('role', 'alert');
  });

  /*
   * ADR-065 — the button is not decoration. An IntersectionObserver is an optimisation, and a reader on
   * a keyboard, or a browser without one, still needs a way back through the history.
   */
  it('offers a real button back through the history when there is more', async () => {
    const { user } = openRoom({ hasOlder: true });
    await screen.findAllByTestId('chat-panel__message');

    await user.click(screen.getByTestId('chat-panel__load-older'));

    await waitFor(() => expect(stub.calls.some((call) => call.path.includes('before='))).toBe(true));
  });

  /*
   * `hasOlder` starts **true** on purpose (`useChatRoom.ts:69`): a fresh room has not been told
   * otherwise, and the first backwards page is what settles it. So the way the button disappears is by
   * reaching the beginning, not by the opening fetch saying so — asserting the latter would have been
   * testing my own assumption rather than ADR-065.
   */
  it('takes the way back away once the history runs out', async () => {
    const { user } = openRoom({ hasOlder: true });
    await screen.findAllByTestId('chat-panel__message');
    /*
     * A function handler, because the stub matches on the path with its query stripped first — a
     * separate `?before=…` key never wins against the base route, and the opening page's answer would
     * have been served back with `hasOlder: true`.
     */
    stub.routes[`GET ${MESSAGES}`] = ({ url }) =>
      url.includes('before=')
        ? { status: 200, body: { messages: [], hasOlder: false } }
        : { status: 200, body: { messages: [message()], hasOlder: true } };

    await user.click(screen.getByTestId('chat-panel__load-older'));

    await waitFor(() => expect(screen.queryByTestId('chat-panel__load-older')).toBeNull());
  });

  it('hides the history button in an empty room, where it would lead nowhere', async () => {
    openRoom({ messages: [], hasOlder: true });

    await waitFor(() => expect(screen.queryAllByTestId('chat-panel__message')).toHaveLength(0));
    expect(screen.queryByTestId('chat-panel__load-older')).toBeNull();
  });

  /* ADR-064 — falling back to polling is said out loud rather than left to look live. */
  /**
   * ADR-085 — a phone keyboard's send key is an Enter, so typing a line and tapping it posts the
   * line. Asserted at the surface rather than only in the hook because the wiring between the box,
   * the guard and the send is exactly what can be connected wrongly.
   */
  describe('sending from the keyboard', () => {
    it('posts the line when the send key is tapped', async () => {
      const { user } = openRoom();
      await screen.findAllByTestId('chat-panel__message');

      await user.type(screen.getByTestId('chat-panel__draft'), 'court three is free{Enter}');

      await waitFor(() => expect(stub.callsTo(`POST ${MESSAGES}`)).toHaveLength(1));
      expect(stub.callsTo(`POST ${MESSAGES}`)[0]?.body).toEqual({ body: 'court three is free' });
    });

    it('leaves the box empty afterwards, with no newline left in it', async () => {
      const { user } = openRoom();
      await screen.findAllByTestId('chat-panel__message');
      const draft = screen.getByTestId('chat-panel__draft');

      await user.type(draft, 'sent and gone{Enter}');

      await waitFor(() => expect(draft).toHaveValue(''));
    });

    it('breaks the line on Shift+Enter instead of sending', async () => {
      const { user } = openRoom();
      await screen.findAllByTestId('chat-panel__message');
      const draft = screen.getByTestId('chat-panel__draft');

      await user.type(draft, 'first line{Shift>}{Enter}{/Shift}second line');

      expect(stub.callsTo(`POST ${MESSAGES}`)).toHaveLength(0);
      expect(draft).toHaveValue('first line\nsecond line');
    });

    it('sends nothing when the box holds only whitespace', async () => {
      const { user } = openRoom();
      await screen.findAllByTestId('chat-panel__message');

      // The same guard the disabled button advertises: the keyboard must not be a way around it.
      await user.type(screen.getByTestId('chat-panel__draft'), '   {Enter}');

      expect(stub.callsTo(`POST ${MESSAGES}`)).toHaveLength(0);
    });
  });

  it('says it is catching up when the stream is not live', async () => {
    openRoom();
    await screen.findAllByTestId('chat-panel__message');

    act(() => stream.fail());

    await waitFor(() => expect(screen.getByTestId('chat-panel__catching-up')).toBeVisible());
  });

  it('says nothing about catching up while the stream is live', async () => {
    openRoom();
    await screen.findAllByTestId('chat-panel__message');

    act(() => stream.connect());

    await waitFor(() => expect(screen.queryByTestId('chat-panel__catching-up')).toBeNull());
  });

  it('shows a message that arrives on the stream, without a reload', async () => {
    openRoom();
    await screen.findAllByTestId('chat-panel__message');
    act(() => stream.connect());

    act(() =>
      stream.emit(
        message({ id: '01a0f000-0000-7000-8000-000000000009', body: 'Court 2 is free now' }),
      ),
    );

    await waitFor(() => expect(screen.getByText('Court 2 is free now')).toBeVisible());
  });

  it('reports a room it could not read', async () => {
    stub = installFetchStub({
    ...identityRoutes(),
      'GET /api/auth/session': { status: 200, body: { session: null } },
      'GET /api/me/alerts': { status: 200, body: { announcements: [] } },
      [`GET ${MESSAGES}`]: { status: 500, body: { error: { message: 'Chat is unavailable.' } } },
    });
    renderWithProviders(<ChatPanel />);

    expect(await screen.findByText('Chat is unavailable.')).toBeVisible();
  });
});

/**
 * ADR-163 — the "new messages" line, in the global room.
 *
 * The placement rules are pinned on the hook (`useNewMessageBoundary.test.ts`). What is worth
 * asserting through the surface is the part a hook test cannot see: the divider is rendered
 * *inside* the list and in the right place in the order, so the reader sees it between the two
 * messages it separates rather than above or below the whole room.
 */
describe('the new-messages line', () => {
  /*
   * Ids ascend with time, because the room is sorted by id (`mergeById`) on the promise that
   * a UUIDv7 sorts chronologically. Fixtures that break that promise render out of order.
   */
  const EARLIER = message({ id: '01a0f000-0000-7000-8000-00000000000a', body: 'before you left' });
  const LATER = {
    ...message({ id: '01a0f000-0000-7000-8000-00000000000b', body: 'while you were away' }),
    createdAt: '2026-09-30T03:00:00.000Z',
  };

  afterEach(() => {
    forgetFeedMarks();
  });

  it('draws the line between what was read and what is new', async () => {
    advanceFeedMark('chat', '2026-09-30T02:30:00.000Z', NO_MARKS);
    openRoom({ messages: [EARLIER, LATER] });

    const divider = await screen.findByTestId('new-messages-divider__rule');
    expect(divider).toHaveTextContent('new messages');

    /*
     * Order, not merely presence. A divider rendered above the list would satisfy a
     * `findByTestId` and tell the reader nothing — the whole feature is which side of it
     * each message falls on.
     */
    const list = required(divider.parentElement, 'the divider sits in the room list');
    const rows = [...list.children].map((child) => child.textContent ?? '');
    const line = rows.findIndex((text) => text.includes('new messages'));
    const before = rows.findIndex((text) => text.includes('before you left'));
    const after = rows.findIndex((text) => text.includes('while you were away'));
    expect(before).toBeLessThan(line);
    expect(line).toBeLessThan(after);
  });

  it('draws nothing when the reader is caught up', async () => {
    advanceFeedMark('chat', '2026-09-30T23:00:00.000Z', NO_MARKS);
    openRoom({ messages: [EARLIER, LATER] });

    await screen.findAllByTestId('chat-panel__message');
    expect(screen.queryByTestId('new-messages-divider__rule')).toBeNull();
  });

  /*
   * ADR-267 — the reported behaviour, end to end. A caught-up reader sends a message;
   * the absorbed copy is newer than the entry mark, and the room used to draw the line
   * directly above the very line the reader had just written.
   */
  it('draws no line above the message the reader just sent', async () => {
    advanceFeedMark('chat', '2026-09-30T23:00:00.000Z', NO_MARKS);
    stub = installFetchStub({
      ...identityRoutes(),
      'GET /api/auth/session': { status: 200, body: { session: null } },
      'GET /api/me/alerts': { status: 200, body: { announcements: [] } },
      [`GET ${MESSAGES}`]: {
        status: 200,
        body: { messages: [EARLIER, LATER], hasOlder: false },
      },
      [`POST ${MESSAGES}`]: {
        status: 201,
        body: {
          message: {
            ...message({ id: '01a0f000-0000-7000-8000-0000000000ff', body: 'mine, just now' }),
            createdAt: '2026-10-01T09:00:00.000Z',
          },
        },
      },
      'POST /api/chat/read': { status: 200, body: { chatUnread: false } },
    });
    const user = userEvent.setup();
    renderWithProviders(<ChatPanel />);

    await screen.findAllByTestId('chat-panel__message');
    expect(screen.queryByTestId('new-messages-divider__rule')).toBeNull();

    await user.type(screen.getByTestId('chat-panel__draft'), 'mine, just now');
    await user.click(screen.getByTestId('chat-panel__send'));

    expect(await screen.findByText('mine, just now')).toBeVisible();
    expect(screen.queryByTestId('new-messages-divider__rule')).toBeNull();
  });
});
