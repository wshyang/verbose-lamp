import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEAM_CHAT_TYPING_EVENT, TEAM_CHAT_TYPING_TTL_MS } from '@psd/contracts';
import type { TeamChatMessageView } from '@psd/contracts';
import { installEventSourceStub, type EventSourceStub } from '../../test-utils/eventSourceStub.js';
import { STREAM_STALE_MS } from '../../lib/api/streamWatchdog.js';
import { resetAudioForTests } from '../../lib/audio/ding.js';
import { writeCached } from '../../lib/storage/cacheStore.js';
import { SessionContext } from '../../lib/session/context.js';
import { participantFixture, participantSession } from '../../test-utils/fixtures.js';
import { installFetchStub, type FetchStub, type RouteTable } from '../../test-utils/fetchStub.js';
import { renderWithProviders } from '../../test-utils/renderWithProviders.js';
import { required } from '../../lib/required.js';
import { AlertsProvider } from './AlertsProvider.js';
import { TeamChatPanel } from './TeamChatPanel.js';
import { advanceFeedMark, forgetFeedMarks, NO_MARKS } from '../../lib/storage/feedReadStore.js';
import { teamChatRoutes } from '../../test-utils/ambientRoutes.js';

/**
 * ADR-063 — a team's own room, inside the team page.
 *
 * Two kinds of row share one list, and telling them apart is what is worth pinning: somebody speaking
 * is rendered with their name and title, while a roster event is rendered as a *sentence* built in the
 * app, because the row deliberately stores no body — user-facing copy stays out of the database. A
 * test that only ever sent `said` rows would miss the whole second branch.
 *
 * Rendered inside `AlertsProvider`, which the panel needs for `clearTeamChatUnread`: a hook may not
 * import a component, so the panel is what knows about both.
 */

const MESSAGES = '/api/team-chat/messages';
const TEAM_ID = 'team-a';
let stub: FetchStub;

let stream: EventSourceStub;

function said(over?: { id?: string; body?: string; authorLabel?: string; title?: string }) {
  return {
    id: '01a0f000-0000-7000-8000-000000000001',
    kind: 'said',
    authorLabel: 'Wei_Ling',
    authorParticipantId: 'p1',
    title: 'Captain',
    body: 'Warm up at the net',
    createdAt: '2026-09-30T02:00:00.000Z',
    ...over,
  } as TeamChatMessageView;
}

function rosterEvent(kind: TeamChatMessageView['kind'], authorLabel: string) {
  return {
    id: '01a0f000-0000-7000-8000-000000000002',
    kind,
    authorLabel,
    authorParticipantId: 'p2',
    title: 'Sprinter',
    body: null,
    createdAt: '2026-09-30T02:05:00.000Z',
  } as unknown as TeamChatMessageView;
}

function openRoom(messages: TeamChatMessageView[] = [said()]) {
  stub = installFetchStub({
    ...teamChatRoutes(),
    'GET /api/auth/session': { status: 200, body: { session: null } },
    'GET /api/me/alerts': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
    [`GET ${MESSAGES}`]: { status: 200, body: { messages, hasOlder: false } },
    [`POST ${MESSAGES}`]: { status: 201, body: { message: said({ id: 'new', body: 'sent' }) } },
    'POST /api/team-chat/read': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
  });
  return {
    user: userEvent.setup(),
    ...renderWithProviders(
      <AlertsProvider>
        <TeamChatPanel teamId={TEAM_ID} isCaptain={false} />
      </AlertsProvider>,
    ),
  };
}

beforeEach(() => {
  stream = installEventSourceStub();
});

afterEach(() => {
  stream.restore();
  stub.restore();
});

describe('TeamChatPanel', () => {

  /**
   * ADR-202 — spoken lines carry a face; the room's own history does not.
   *
   * A roster event is a sentence about somebody, not somebody speaking, which is why it is
   * already styled as prose rather than as a message. Giving "Wei_Ling joined the team" an
   * avatar would make the team's record read as a remark, and the two kinds would stop being
   * distinguishable at a glance — the thing ADR-063 drew them differently to achieve.
   */
  it('puts an avatar slot on spoken lines only, never on a roster event', async () => {
    openRoom([said(), rosterEvent('joined', 'Mei')]);

    const rows = await screen.findAllByTestId('team-chat__message');
    expect(rows).toHaveLength(2);
    expect(required(rows[0], 'spoken line').querySelector('.gb-chat-avatar')).not.toBeNull();
    expect(required(rows[1], 'roster event').querySelector('.gb-chat-avatar')).toBeNull();
  });
  it('shows somebody speaking with their name and their title', async () => {
    openRoom([said({ authorLabel: 'Wei_Ling', title: 'Captain' })]);

    const [row] = await screen.findAllByTestId('team-chat__message');
    expect(row).toHaveTextContent('Wei_Ling');
    expect(row).toHaveTextContent('Captain');
    expect(row).toHaveTextContent('Warm up at the net');
    expect(screen.queryByTestId('team-chat__event')).toBeNull();
  });

  /* Roster events read as history, so they are a sentence rather than a person talking. */
  it('renders a join as a sentence, not as a message with a body', async () => {
    openRoom([rosterEvent('joined', 'Marcus_Lim')]);

    expect(await screen.findByTestId('team-chat__event')).toHaveTextContent(
      'Marcus_Lim joined the team',
    );
  });

  it('renders a leave with the other verb', async () => {
    openRoom([rosterEvent('left', 'Hui_Min')]);

    expect(await screen.findByTestId('team-chat__event')).toHaveTextContent('Hui_Min left the team');
  });

  /*
   * ADR-154 §8 — a staff repair is recorded in the room it happened to, and the room is told
   * what happened WITHOUT being told which organiser did it. Three separate sentences rather
   * than one reused "left the team", because a member an organiser removed did not leave.
   */
  it('says an organiser added somebody, without naming the organiser', async () => {
    openRoom([rosterEvent('staff_added', 'Marcus_Lim')]);

    const event = await screen.findByTestId('team-chat__event');
    expect(event).toHaveTextContent('Marcus_Lim was added by an organiser');
    expect(event).not.toHaveTextContent('joined');
  });

  it('says an organiser removed somebody, rather than that they left', async () => {
    openRoom([rosterEvent('staff_removed', 'Hui_Min')]);

    const event = await screen.findByTestId('team-chat__event');
    expect(event).toHaveTextContent('Hui_Min was removed by an organiser');
    expect(event).not.toHaveTextContent('left the team');
  });

  it('announces a new captain to the room', async () => {
    openRoom([rosterEvent('captain_changed', 'Wei_Ling')]);

    expect(await screen.findByTestId('team-chat__event')).toHaveTextContent(
      'Wei_Ling is now captain',
    );
  });

  it('mixes both kinds in one list', async () => {
    openRoom([said(), rosterEvent('joined', 'Marcus_Lim')]);

    const rows = await screen.findAllByTestId('team-chat__message');
    expect(rows).toHaveLength(2);
    expect(screen.getAllByTestId('team-chat__event')).toHaveLength(1);
  });

  /*
   * The whole of the XSS story for this surface: React escapes by default, so markup a teammate types is
   * shown rather than run. Asserted as text, so a later switch to `dangerouslySetInnerHTML` fails here.
   */
  it('shows typed markup as text rather than running it', async () => {
    openRoom([said({ body: '<img src=x onerror="alert(1)">' })]);

    const row = required((await screen.findAllByTestId('team-chat__message'))[0], 'message row');
    expect(row).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(row.querySelector('img')).toBeNull();
  });

  it('will not send an empty message, or whitespace pretending to be one', async () => {
    const { user } = openRoom();
    await screen.findAllByTestId('team-chat__message');

    expect(screen.getByTestId('team-chat__send')).toBeDisabled();
    await user.type(screen.getByTestId('team-chat__draft'), '   ');
    expect(screen.getByTestId('team-chat__send')).toBeDisabled();
  });

  it('sends what was typed', async () => {
    const { user } = openRoom();
    await screen.findAllByTestId('team-chat__message');

    await user.type(screen.getByTestId('team-chat__draft'), 'Bring the spare ball');
    await user.click(screen.getByTestId('team-chat__send'));

    await waitFor(() => expect(stub.callsTo(`POST ${MESSAGES}`)).toHaveLength(1));
    expect(stub.callsTo(`POST ${MESSAGES}`)[0]?.body).toEqual({ body: 'Bring the spare ball' });
  });

  it('announces a refused send where a screen reader will hear it', async () => {
    const { user } = openRoom();
    await screen.findAllByTestId('team-chat__message');
    stub.routes[`POST ${MESSAGES}`] = {
      status: 403,
      body: { error: { message: 'You are not on this team.' } },
    };

    await user.type(screen.getByTestId('team-chat__draft'), 'hello');
    await user.click(screen.getByTestId('team-chat__send'));

    const alert = await screen.findByTestId('team-chat__send-error');
    expect(alert).toHaveTextContent('You are not on this team.');
    expect(alert).toHaveAttribute('role', 'alert');
  });

  it('says it is catching up when the stream is not live', async () => {
    openRoom();
    await screen.findAllByTestId('team-chat__message');

    act(() => stream.fail());

    await waitFor(() => expect(screen.getByTestId('team-chat__catching-up')).toBeVisible());
  });

  it('paints the remembered tail instantly while the fresh read is still in flight (ADR-112)', async () => {
    writeCached(`teamChat.tail.${TEAM_ID}`, participantFixture.id, [
      said({ id: '01a0f000-0000-7000-8000-000000000001', body: 'remembered team line' }),
    ]);
    stub = installFetchStub({
    ...teamChatRoutes(),
      'GET /api/auth/session': { status: 200, body: participantSession },
      'GET /api/me/alerts': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
      [`GET ${MESSAGES}`]: {
        status: 200,
        body: { messages: [said({ id: 'fresh', body: 'fresh from server' })], hasOlder: false },
        delayMs: 30,
      },
      'POST /api/team-chat/read': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
    });
    render(
      <SessionContext.Provider
        value={{
          session: participantSession,
          isLoading: false,
          refresh: () => Promise.resolve(participantSession),
          endSession: () => Promise.resolve(true),
        }}
      >
        <AlertsProvider>
          <TeamChatPanel teamId={TEAM_ID} isCaptain={false} />
        </AlertsProvider>
      </SessionContext.Provider>,
    );

    // The device answer is on screen before the server says a word.
    expect(screen.getByText('remembered team line')).toBeVisible();
    // The tail reconciles on top of it with only the messages after the remembered newest id.
    await waitFor(() => expect(screen.getByText('fresh from server')).toBeVisible());
    expect(stub.callsTo(`GET ${MESSAGES}`)[0]?.path).toBe(
      `${MESSAGES}?after=01a0f000-0000-7000-8000-000000000001`,
    );
  });

  /*
   * The ordinary outcome of a delta open, and the one the whole cache exists to produce:
   * nothing has been said since this phone last looked, so the server answers with an
   * empty list.
   *
   * That empty answer still has to clear the unread dot. Reading is what the participant
   * just did — the remembered tail is on their screen — but the marker that proves it
   * lives server-side on the membership row (ADR-063), and an empty page carries no
   * message to mark. Before the tail was remembered this could not arise: the room always
   * refetched real rows and marked the newest of them. Left unhandled, the cache would
   * have introduced a dot that survives reading the room.
   */
  it('marks the room read on an empty delta, because the remembered tail is what was read', async () => {
    const remembered = said({ id: '01a0f000-0000-7000-8000-000000000001', body: 'said earlier' });
    writeCached(`teamChat.tail.${TEAM_ID}`, participantFixture.id, [remembered]);
    // ADR-125 — this device has been here before and is behind, so the dot is genuinely lit.
    window.localStorage.setItem(
      'psd.feeds.read.v1',
      JSON.stringify({ chat: null, teamChat: '2026-09-30T02:00:00.000Z', gallery: null }),
    );
    stub = installFetchStub({
    ...teamChatRoutes(),
      'GET /api/auth/session': { status: 200, body: participantSession },
      'GET /api/me/alerts': {
        status: 200,
        body: {
          announcements: [],
          teamUpSoon: { upSoon: false, gamesAway: null, fixtureId: null },
          feeds: { chat: null, teamChat: '2026-09-30T02:05:00.000Z', gallery: null },
        },
      },
      // Nobody has spoken since: the delta is empty.
      [`GET ${MESSAGES}`]: { status: 200, body: { messages: [], hasOlder: false } },
    });
    render(
      <SessionContext.Provider
        value={{
          session: participantSession,
          isLoading: false,
          refresh: () => Promise.resolve(participantSession),
          endSession: () => Promise.resolve(true),
        }}
      >
        <AlertsProvider>
          <TeamChatPanel teamId={TEAM_ID} isCaptain={false} />
        </AlertsProvider>
      </SessionContext.Provider>,
    );

    expect(screen.getByText('said earlier')).toBeVisible();
    /*
     * ADR-125 — the mark moves to the watermark the store was holding, and it moves in
     * `localStorage` rather than over the wire. The assertion is deliberately on the stored
     * value and not on a request: proving the absence of the old `POST /api/team-chat/read`
     * would pass just as well if the panel had stopped marking anything read at all.
     */
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('psd.feeds.read.v1') ?? '{}')).toEqual({
        chat: null,
        teamChat: '2026-09-30T02:05:00.000Z',
        gallery: null,
      }),
    );
  });

  /*
   * ADR-269 — parity with the global room. This room used to have no polling fallback
   * at all: no `EventSource` (jsdom's native state, restored here) meant the
   * mount-time read was the last word the room ever received. Now the same jittered
   * catch-up poll the global room runs brings the delta in.
   */
  it('falls back to polling the delta when there is no stream to be had', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // The stub goes away: what remains is a browser with no EventSource at all.
      stream.restore();
      stub = installFetchStub({
        ...teamChatRoutes(),
        'GET /api/auth/session': { status: 200, body: { session: null } },
        'GET /api/me/alerts': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
        [`GET ${MESSAGES}`]: ({ url }) =>
          url.includes('after=')
            ? {
                status: 200,
                body: {
                  messages: [said({ id: '01a0f000-0000-7000-8000-000000000002', body: 'arrived by polling' })],
                  hasOlder: false,
                },
              }
            : { status: 200, body: { messages: [said()], hasOlder: false } },
      });
      renderWithProviders(
        <AlertsProvider>
          <TeamChatPanel teamId={TEAM_ID} isCaptain={false} />
        </AlertsProvider>,
      );

      expect(await screen.findByText('Warm up at the net')).toBeVisible();
      // Honest about its state: the panel says live updates are off.
      expect(screen.getByTestId('team-chat__catching-up')).toBeVisible();

      // Past the longest jittered wait (45–75 s): the poll asks for the delta.
      await act(async () => {
        vi.advanceTimersByTime(80_000);
      });

      expect(await screen.findByText('arrived by polling')).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a message that arrives on the stream', async () => {
    openRoom();
    await screen.findAllByTestId('team-chat__message');
    act(() => stream.connect());

    act(() => stream.emit(said({ id: '01a0f000-0000-7000-8000-000000000009', body: 'On the way' }) as never));

    await waitFor(() => expect(screen.getByText('On the way')).toBeVisible());
  });

  it("blips a mate's line, never your own echo (ADR-103)", async () => {
    const oscillators: unknown[] = [];
    class FakeContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = () => Promise.resolve();
      createOscillator() {
        const oscillator = {
          type: '',
          frequency: { setValueAtTime: () => undefined },
          connect: () => undefined,
          start: () => undefined,
          stop: () => undefined,
        };
        oscillators.push(oscillator);
        return oscillator;
      }
      createGain() {
        return {
          gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
          connect: () => undefined,
        };
      }
    }
    vi.stubGlobal('AudioContext', FakeContext);
    stub = installFetchStub({
    ...teamChatRoutes(),
      // The viewer is BeachBoss: their own echo must stay silent; a mate's line sounds.
      'GET /api/auth/session': { status: 200, body: participantSession },
      'GET /api/me/alerts': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
      [`GET ${MESSAGES}`]: { status: 200, body: { messages: [said()], hasOlder: false } },
      'POST /api/team-chat/read': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
    });
    renderWithProviders(
      <AlertsProvider>
        <TeamChatPanel teamId={TEAM_ID} isCaptain={false} />
      </AlertsProvider>,
    );
    await screen.findAllByTestId('team-chat__message');
    act(() => stream.connect());

    // Inside the connect window the replayed backlog is reading, not arrival (ADR-104).
    act(() =>
      stream.emit(
        said({ id: '01a0f000-0000-7000-8000-000000000008', body: 'replayed line', authorLabel: 'Hui_Min' }) as never,
      ),
    );
    await waitFor(() => expect(screen.getByText('replayed line')).toBeVisible());
    expect(oscillators).toHaveLength(0);

    // A phone sitting open on the room past the window DOES hear a mate's line.
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2030-01-01T00:00:00Z').getTime());
    act(() =>
      stream.emit(
        said({ id: '01a0f000-0000-7000-8000-00000000000a', body: 'mate speaking', authorLabel: 'Hui_Min' }) as never,
      ),
    );
    await waitFor(() => expect(screen.getByText('mate speaking')).toBeVisible());
    expect(oscillators).toHaveLength(1);

    act(() =>
      stream.emit(
        said({ id: '01a0f000-0000-7000-8000-00000000000b', body: 'my own echo', authorLabel: 'BeachBoss' }) as never,
      ),
    );
    await waitFor(() => expect(screen.getByText('my own echo')).toBeVisible());
    expect(oscillators).toHaveLength(1);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetAudioForTests();
  });

  /**
   * ADR-083 — the team room opens on fifty and reaches back on demand, as the global room has since
   * ADR-065. `IntersectionObserver` does not exist in jsdom, so the button is the path under test —
   * which is exactly why the panel renders one rather than relying on the sentinel alone.
   */
  describe('reaching back up the room', () => {
    function roomWithHistory() {
      stub = installFetchStub({
    ...teamChatRoutes(),
        'GET /api/auth/session': { status: 200, body: { session: null } },
        'GET /api/me/alerts': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
        [`GET ${MESSAGES}`]: ({ url }) => {
          const before = new URL(url, 'http://localhost').searchParams.get('before');
          if (before === null) {
            return { status: 200, body: { messages: [said()], hasOlder: true } };
          }
          return {
            status: 200,
            body: {
              messages: [
                said({ id: '01a0f000-0000-7000-8000-000000000000', body: 'said much earlier' }),
              ],
              hasOlder: false,
            },
          };
        },
        'POST /api/team-chat/read': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
      });
      return {
        user: userEvent.setup(),
        ...renderWithProviders(
          <AlertsProvider>
            <TeamChatPanel teamId={TEAM_ID} isCaptain={false} />
          </AlertsProvider>,
        ),
      };
    }

    it('fetches the page behind the oldest message and prepends it', async () => {
      const { user } = roomWithHistory();
      expect(await screen.findByText('Warm up at the net')).toBeVisible();

      await user.click(screen.getByTestId('team-chat__load-older'));

      expect(await screen.findByText('said much earlier')).toBeVisible();
      // Oldest first, so the fetched page is above what was already on screen.
      const rows = screen.getAllByTestId('team-chat__message');
      expect(rows[0]?.textContent).toContain('said much earlier');
    });

    it('stops offering the walk-back once history has run out', async () => {
      const { user } = roomWithHistory();
      expect(await screen.findByText('Warm up at the net')).toBeVisible();

      await user.click(screen.getByTestId('team-chat__load-older'));
      await screen.findByText('said much earlier');

      // The server said `hasOlder: false`, so the button must go rather than fetch an empty page.
      await waitFor(() =>
        expect(screen.queryByTestId('team-chat__load-older')).not.toBeInTheDocument(),
      );
    });

    /**
     * The walk-back is offered before anyone knows whether there is history, and one empty page is
     * what settles it. That is deliberate, and the alternative is worse: the tail read reports
     * `hasOlder: false` to mean "a forward read does not answer that question", not "there is
     * nothing older" — so a room of two hundred messages opens on fifty and says `false` too.
     * Believing it there would hide the button on precisely the rooms that need it.
     */
    it('settles the walk-back on the first empty page, not on the opening read', async () => {
      const { user } = openRoom();
      expect(await screen.findByText('Warm up at the net')).toBeVisible();

      // Offered on a room that turns out to have no history: nobody has asked yet.
      const older = screen.getByTestId('team-chat__load-older');
      stub.routes[`GET ${MESSAGES}`] = { status: 200, body: { messages: [], hasOlder: false } };
      await user.click(older);

      await waitFor(() =>
        expect(screen.queryByTestId('team-chat__load-older')).not.toBeInTheDocument(),
      );
    });

    it('does not mark the room read for a page of old messages', async () => {
      const { user } = roomWithHistory();
      expect(await screen.findByText('Warm up at the net')).toBeVisible();
      const readsAfterOpening = stub.callsTo('POST /api/team-chat/read').length;

      await user.click(screen.getByTestId('team-chat__load-older'));
      await screen.findByText('said much earlier');

      // Scrolling up is not reading something new: the mark belongs to the newest line seen.
      expect(stub.callsTo('POST /api/team-chat/read')).toHaveLength(readsAfterOpening);
    });
  });

  /** ADR-085 — the same send-key behaviour as the global room; a team room is a chat box too. */
  describe('sending from the keyboard', () => {
    it('posts the line when the send key is tapped', async () => {
      const { user } = openRoom();
      await screen.findAllByTestId('team-chat__message');

      await user.type(screen.getByTestId('team-chat__draft'), 'meet at court two{Enter}');

      await waitFor(() => expect(stub.callsTo(`POST ${MESSAGES}`)).toHaveLength(1));
      expect(stub.callsTo(`POST ${MESSAGES}`)[0]?.body).toEqual({ body: 'meet at court two' });
    });

    it('breaks the line on Shift+Enter instead of sending', async () => {
      const { user } = openRoom();
      await screen.findAllByTestId('team-chat__message');
      const draft = screen.getByTestId('team-chat__draft');

      await user.type(draft, 'one{Shift>}{Enter}{/Shift}two');

      expect(stub.callsTo(`POST ${MESSAGES}`)).toHaveLength(0);
      expect(draft).toHaveValue('one\ntwo');
    });
  });

  it('reports a room it could not read', async () => {
    stub = installFetchStub({
    ...teamChatRoutes(),
      'GET /api/auth/session': { status: 200, body: { session: null } },
      'GET /api/me/alerts': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
      [`GET ${MESSAGES}`]: {
        status: 500,
        body: { error: { message: 'That room is unavailable.' } },
      },
    });
    renderWithProviders(
      <AlertsProvider>
        <TeamChatPanel teamId={TEAM_ID} isCaptain={false} />
      </AlertsProvider>,
    );

    expect(await screen.findByText('That room is unavailable.')).toBeVisible();
  });
  /**
   * ADR-119 — the team room is the surface with the most to lose from a half-open socket: it has
   * no polling fallback, so a stream that dies quietly is a room that never updates again. The
   * stub deliberately never fires `error` here, because a half-open connection never does.
   *
   * Asserting a *working* replacement rather than merely a second URL: a reconnect that opened a
   * socket nothing was listening to would satisfy a URL count and still leave the room dead.
   */
  it('rebuilds a socket that stopped carrying frames', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      openRoom();
      await screen.findAllByTestId('team-chat__message');
      stream.connect();
      const openedBefore = stream.urls.length;

      await act(async () => {
        vi.advanceTimersByTime(STREAM_STALE_MS);
      });
      await waitFor(() => expect(stream.urls.length).toBe(openedBefore + 1));

      // The dead one must not linger: a revival every 70s would otherwise leak a socket each time.
      expect(stream.openCount()).toBe(1);

      await act(async () => {
        stream.emit(said({ id: 'after-revival', body: 'the replacement carries frames' }) as never);
      });
      expect(await screen.findByText('the replacement carries frames')).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * ADR-146 — typing indicators. The signal is cosmetic; every way it can be wrong is not.
 */
describe('TeamChatPanel — who is typing', () => {
  /** Renders inside a real session, so the panel knows which participant the reader is. */
  function openRoomAsMe(messages: TeamChatMessageView[] = [said()]) {
    stub = installFetchStub({
    ...teamChatRoutes(),
      'GET /api/auth/session': { status: 200, body: { session: participantSession } },
      'GET /api/me/alerts': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
      [`GET ${MESSAGES}`]: { status: 200, body: { messages, hasOlder: false } },
      [`POST ${MESSAGES}`]: { status: 201, body: { message: said({ id: 'new', body: 'sent' }) } },
      'POST /api/team-chat/typing': { status: 204 },
      'POST /api/team-chat/read': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
    });
    return {
      user: userEvent.setup(),
      ...render(
        <SessionContext.Provider
          value={{
            session: participantSession,
            isLoading: false,
            refresh: () => Promise.resolve(participantSession),
            endSession: () => Promise.resolve(true),
          }}
        >
          <AlertsProvider>
            <TeamChatPanel teamId={TEAM_ID} isCaptain={false} />
          </AlertsProvider>
        </SessionContext.Provider>,
      ),
    };
  }

  function typingFrom(participantId: string, label: string) {
    act(() => {
      stream.emitRaw(TEAM_CHAT_TYPING_EVENT, JSON.stringify({ participantId, label }));
    });
  }

  it('keeps the line present but empty when nobody is typing', async () => {
    openRoom();
    // Always rendered: a line that appears and disappears shoves the message list up and
    // down under the eyes of whoever is reading it.
    expect(await screen.findByTestId('team-chat__typing')).toHaveTextContent('');
  });

  it('names one team-mate, and forgets them when the signal stops', async () => {
    vi.useFakeTimers();
    try {
      openRoomAsMe();
      typingFrom('p9', 'Marcus_Lim');

      expect(screen.getByTestId('team-chat__typing')).toHaveTextContent('Marcus_Lim is typing…');

      /*
       * The whole reason there is no "stopped typing" message: a phone that is locked,
       * backgrounded or carried out of range cannot send one, and waiting for it would leave
       * this name on screen until the room was closed.
       */
      act(() => {
        vi.advanceTimersByTime(TEAM_CHAT_TYPING_TTL_MS + 1_500);
      });
      expect(screen.getByTestId('team-chat__typing')).toHaveTextContent('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('never shows you your own typing', async () => {
    openRoomAsMe();

    // The server fans out to a team topic and keeps no listener-to-participant map, so it
    // cannot filter the sender out — the phone recognises its own echo and drops it.
    typingFrom(participantFixture.id, participantFixture.nickname);

    expect(screen.getByTestId('team-chat__typing')).toHaveTextContent('');
  });

  it('drops a typist the moment their message lands', async () => {
    openRoomAsMe();
    typingFrom('p2', 'Hui_Min');
    expect(screen.getByTestId('team-chat__typing')).toHaveTextContent('Hui_Min is typing…');

    act(() => {
      stream.emitRaw(
        'message',
        // Matched by participant id, not by label: two people can share a display name, and
        // the id is the only thing the typing frame and the message agree on.
        JSON.stringify({
          ...said({ id: 'msg-2', authorLabel: 'Hui_Min', body: 'on my way' }),
          authorParticipantId: 'p2',
        }),
      );
    });

    // The proof that somebody stopped is the thing they sent, so the name goes at the same
    // instant the line appears rather than hanging under it for the rest of the window.
    await waitFor(() => expect(screen.getByTestId('team-chat__typing')).toHaveTextContent(''));
  });

  it('pings at most once every three seconds, and never on an empty box', async () => {
    const { user } = openRoomAsMe();
    await screen.findAllByTestId('team-chat__message');

    const draft = screen.getByTestId('team-chat__draft');
    await user.type(draft, 'hello there');

    // Eleven keystrokes, one ping: a POST per keystroke is the shape of this feature that
    // would have justified the whole WebSocket question, and it is not the shape built.
    expect(stub.callsTo('POST /api/team-chat/typing')).toHaveLength(1);

    await user.clear(draft);
    expect(stub.callsTo('POST /api/team-chat/typing')).toHaveLength(1);
  });
});

/**
 * ADR-155 — the captain's hide.
 *
 * The room had the storage for moderation (`hidden_at`, and a partial index on it) and no way
 * to perform it, because the only actor with moderation authority anywhere else in the app —
 * a superadmin — may not read a team room at all. The captain is the way out: the one person
 * who can both see what was said and has standing in the team.
 */
describe('TeamChatPanel — the captain hides a line', () => {
  const ROGUE = '01a0f000-0000-7000-8000-000000000001';
  const hidePath = `POST ${MESSAGES}/${ROGUE}/hide`;

  function openAsCaptain(
    messages: TeamChatMessageView[] = [said()],
    routes: RouteTable = { [hidePath]: { status: 200, body: { messageId: ROGUE } } },
  ) {
    stub = installFetchStub({
    ...teamChatRoutes(),
      'GET /api/auth/session': { status: 200, body: { session: null } },
      'GET /api/me/alerts': { status: 200, body: { announcements: [], teamChatUnread: 0 } },
      [`GET ${MESSAGES}`]: { status: 200, body: { messages, hasOlder: false } },
      ...routes,
    });
    return {
      user: userEvent.setup(),
      ...renderWithProviders(
        <AlertsProvider>
          <TeamChatPanel teamId={TEAM_ID} isCaptain />
        </AlertsProvider>,
      ),
    };
  }

  it('offers no hide at all to a member who is not the captain', async () => {
    openRoom([said()]);

    await screen.findByTestId('team-chat__message');
    expect(screen.queryByTestId('team-chat__hide')).toBeNull();
  });

  it('keeps the kebab off the title pill and at the far right of the message line', async () => {
    openAsCaptain([said()]);
    const row = (await screen.findByTestId('team-chat__message')) as HTMLElement;
    const header = row.querySelector('.gb-row--between');
    // ADR-259 — the header carries the title pill alone; the kebab is one line down,
    // after the message itself, never beside the pill.
    expect(header?.querySelector('[data-testid="team-chat__message-menu"]')).toBeNull();
    const toggle = screen.getByTestId('team-chat__message-menu');
    const body = row.querySelector('.gb-chat-body');
    expect(body?.compareDocumentPosition(toggle) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  /*
   * ADR-154 made the room the ONLY record of a staff repair — the organiser ruled against an
   * audit table. A captain who could hide those lines could erase the record of their own
   * team being changed, so the button is not offered and the server refuses it too.
   */
  it('offers no hide on a roster line, which is the team’s record rather than conversation', async () => {
    openAsCaptain([said(), rosterEvent('staff_removed', 'Hui_Min')]);

    await screen.findAllByTestId('team-chat__message');
    // ADR-258 — one kebab, on the spoken line only; the roster line offers nothing.
    expect(screen.getAllByTestId('team-chat__message-menu')).toHaveLength(1);
    expect(screen.queryByTestId('team-chat__hide')).toBeNull();
  });

  it('asks before hiding, and only then sends', async () => {
    const { user } = openAsCaptain();

    await user.click(await screen.findByTestId('team-chat__message-menu'));
    await user.click(await screen.findByTestId('team-chat__hide'));
    expect(screen.getByTestId('confirm-dialog__body')).toHaveTextContent(
      'It disappears for everyone on the team, and it cannot be put back.',
    );
    // Nothing yet: the dialog is the guard, and there is no undo behind it.
    expect(stub.callsTo(hidePath)).toHaveLength(0);

    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    await waitFor(() => expect(stub.callsTo(hidePath)).toHaveLength(1));
    // And it leaves this phone at once, rather than waiting for the frame to come back to it.
    await waitFor(() => expect(screen.queryByTestId('team-chat__message')).toBeNull());
  });

  it('sends nothing when the captain backs out', async () => {
    const { user } = openAsCaptain();

    await user.click(await screen.findByTestId('team-chat__message-menu'));
    await user.click(await screen.findByTestId('team-chat__hide'));
    await user.click(screen.getByTestId('confirm-dialog__cancel'));

    expect(stub.callsTo(hidePath)).toHaveLength(0);
    expect(screen.getByTestId('team-chat__message')).toBeVisible();
  });

  /*
   * The case the whole frame exists for: a phone that did NOT press the button. ADR-066's
   * reasoning holds here unchanged — hiding the row governs only what is fetched next, so
   * without this the line sits on every open screen in the team until somebody reloads.
   */
  it('removes a line hidden by somebody else, on a phone that has the room open', async () => {
    openRoom([said()]);
    await screen.findByTestId('team-chat__message');

    act(() => stream.hide(ROGUE));

    await waitFor(() => expect(screen.queryByTestId('team-chat__message')).toBeNull());
  });

  it('ignores a retraction for a message this phone never held', async () => {
    openRoom([said()]);
    await screen.findByTestId('team-chat__message');

    act(() => stream.hide('01a0f000-0000-7000-8000-00000000ffff'));

    expect(screen.getByTestId('team-chat__message')).toBeVisible();
  });

  // A button that silently does nothing reads as a broken button, and the next thing tried is
  // the message itself.
  it('says why a hide was refused', async () => {
    const { user } = openAsCaptain([said()], {
      [hidePath]: {
        status: 409,
        body: { error: { message: 'That is part of the team history and cannot be hidden.' } },
      },
    });

    await user.click(await screen.findByTestId('team-chat__message-menu'));
    await user.click(await screen.findByTestId('team-chat__hide'));
    await user.click(screen.getByTestId('confirm-dialog__confirm'));

    expect(await screen.findByTestId('team-chat__hide-error')).toHaveTextContent(
      'That is part of the team history and cannot be hidden.',
    );
    expect(screen.getByTestId('team-chat__message')).toBeVisible();
  });
});

/**
 * ADR-163 — the "new messages" line, in the team room.
 *
 * Placement is pinned on the hook; this is about the two things only the mounted panel can
 * show. First, the line is rendered between the right two rows of the real list — the room is
 * sorted by id, so a divider that merely *exists* proves nothing about which messages fall
 * below it. Second, and this is the organiser's ruling in so many words, the line holds its
 * place for the whole visit: opening the room marks the feed read, and a line that re-read
 * storage would disappear from under the reader a moment after they arrived.
 */
describe('the new-messages line', () => {
  const EARLIER = {
    ...said({ id: '01a0f000-0000-7000-8000-00000000000a', body: 'before you left' }),
    createdAt: '2026-09-30T02:00:00.000Z',
  } as TeamChatMessageView;
  const LATER = {
    ...said({ id: '01a0f000-0000-7000-8000-00000000000b', body: 'while you were away' }),
    createdAt: '2026-09-30T03:00:00.000Z',
  } as TeamChatMessageView;

  afterEach(() => {
    forgetFeedMarks();
  });

  function rowOrder(divider: HTMLElement) {
    const list = required(divider.parentElement, 'the divider sits in the room list');
    return [...list.children].map((child) => child.textContent ?? '');
  }

  it('draws the line between what was read and what is new', async () => {
    advanceFeedMark('teamChat', '2026-09-30T02:30:00.000Z', NO_MARKS);
    openRoom([EARLIER, LATER]);

    const divider = await screen.findByTestId('new-messages-divider__rule');
    expect(divider).toHaveTextContent('new messages');

    const rows = rowOrder(divider);
    expect(rows.findIndex((text) => text.includes('before you left'))).toBeLessThan(
      rows.findIndex((text) => text.includes('new messages')),
    );
    expect(rows.findIndex((text) => text.includes('new messages'))).toBeLessThan(
      rows.findIndex((text) => text.includes('while you were away')),
    );
  });

  it('draws nothing for a reader who is caught up', async () => {
    advanceFeedMark('teamChat', '2026-09-30T23:00:00.000Z', NO_MARKS);
    openRoom([EARLIER, LATER]);

    await screen.findAllByTestId('team-chat__message');
    expect(screen.queryByTestId('new-messages-divider__rule')).toBeNull();
  });

  /*
   * The hazard this feature is most likely to regress into: the room clears its own dot on
   * open, so the stored mark moves past everything within a tick of arriving. The line must
   * not move with it, and it must not move when a live message lands either.
   */
  it('stays where the reader found it after a new message arrives', async () => {
    advanceFeedMark('teamChat', '2026-09-30T02:30:00.000Z', NO_MARKS);
    openRoom([EARLIER, LATER]);
    await screen.findByTestId('new-messages-divider__rule');
    /*
     * Set the trap. In the running app this is what opening the room does to itself — the feed
     * is marked read, so within a tick storage claims the reader is caught up. Driven directly
     * here because the mark follows the server's watermark, which the stubbed alerts response
     * does not carry; the point is only that the panel must not consult it again.
     */
    advanceFeedMark('teamChat', '2026-09-30T05:00:00.000Z', {
      ...NO_MARKS,
      teamChat: '2026-09-30T02:30:00.000Z',
    });

    act(() =>
      stream.emit({
        ...said({ id: '01a0f000-0000-7000-8000-00000000000c', body: 'sent while you read' }),
        createdAt: '2026-09-30T04:00:00.000Z',
      } as never),
    );

    const divider = await screen.findByTestId('new-messages-divider__rule');
    const rows = rowOrder(divider);
    const line = rows.findIndex((text) => text.includes('new messages'));
    // Still above the message it was above, not pushed down to the arrival.
    expect(rows.findIndex((text) => text.includes('while you were away'))).toBe(line + 1);
    expect(rows.findIndex((text) => text.includes('sent while you read'))).toBeGreaterThan(line);
  });
});
