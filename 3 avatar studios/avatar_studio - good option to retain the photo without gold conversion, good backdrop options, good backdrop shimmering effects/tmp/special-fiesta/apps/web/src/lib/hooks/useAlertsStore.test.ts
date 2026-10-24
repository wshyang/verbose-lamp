import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import {
  STATUS_ANNOUNCEMENT_EVENT,
  STATUS_ANNOUNCEMENT_RETRACTED_EVENT,
  STATUS_CHAT_ACTIVITY_EVENT,
  STATUS_CHAT_RETRACTED_EVENT,
  STATUS_TEAM_CHAT_RETRACTED_EVENT,
  STATUS_GALLERY_ACTIVITY_EVENT,
  STATUS_SNAPSHOT_EVENT,
  STATUS_TEAM_CHAT_ACTIVITY_EVENT,
  STATUS_TEAM_UPSOON_EVENT,
} from '@psd/contracts';
import type { AlertsView, AnnouncementView } from '@psd/contracts';
import { installEventSourceStub } from '../../test-utils/eventSourceStub.js';
import type { EventSourceStub } from '../../test-utils/eventSourceStub.js';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { participantSession } from '../../test-utils/fixtures.js';
import { SessionContext } from '../session/context.js';
import type { SessionState } from '../session/context.js';
import { useAlertsStore } from './useAlertsStore.js';
import { reviveDelayMs, slowReviveDelayMs } from './useStatusStream.js';
import { STREAM_STALE_MS } from '../api/streamWatchdog.js';

/**
 * ADR-121 — the shell's socket, as the alerts store sees it.
 *
 * The store is the one surface the whole app's nav dots hang off, so what matters here is not
 * that frames arrive but that the store is never *wrong*: a reconnect must re-state rather than
 * merge, a retraction must remove, and the fallback poll must stop while the socket carries and
 * resume when it does not.
 */

let stub: FetchStub;
let stream: EventSourceStub;

const T0 = '2026-09-30T02:00:00.000Z';
const T1 = '2026-09-30T02:05:00.000Z';
const T2 = '2026-09-30T02:10:00.000Z';

const QUIET: AlertsView = {
  teamUpSoon: { upSoon: false, gamesAway: null, fixtureId: null },
  feeds: { chat: null, teamChat: null, gallery: null },
  announcements: [],
};

const FIXTURE_A = '01a0f000-0000-7000-8000-00000000000a';
const FIXTURE_B = '01a0f000-0000-7000-8000-00000000000b';

/** ADR-133 — an up-soon fact for a named fixture, which is what the toast is keyed on. */
const upSoonAt = (fixtureId: string, gamesAway = 1): AlertsView['teamUpSoon'] => ({
  upSoon: true,
  gamesAway,
  fixtureId,
});

/** A snapshot's feed block, spelled out so a test says which feed it is talking about. */
const feeds = (over: Partial<AlertsView['feeds']>): AlertsView['feeds'] => ({
  ...QUIET.feeds,
  ...over,
});

const activity = (at: string) => JSON.stringify({ at });

function announcement(over?: Partial<AnnouncementView>): AnnouncementView {
  return {
    id: '01a0f000-0000-7000-8000-000000000001',
    body: 'Lunch is at the pavilion',
    authorLabel: 'superadmin',
    createdAt: '2026-09-30T02:00:00.000Z',
    ...over,
  };
}

function participantWrapper({ children }: { children: ReactNode }) {
  const state: SessionState = {
    session: participantSession,
    isLoading: false,
    refresh: () => Promise.resolve(participantSession),
    endSession: () => Promise.resolve(true),
  };
  return createElement(SessionContext.Provider, { value: state }, children);
}

function renderStore(alerts: Partial<AlertsView> = {}) {
  stub = installFetchStub({
    'GET /api/me/alerts': { body: { ...QUIET, ...alerts } },
  });
  return renderHook(() => useAlertsStore(), { wrapper: participantWrapper });
}

const snapshot = (view: Partial<AlertsView>) =>
  stream.emitRaw(STATUS_SNAPSHOT_EVENT, JSON.stringify({ ...QUIET, ...view }));

beforeEach(() => {
  window.localStorage.clear();
  stream = installEventSourceStub();
});
afterEach(() => {
  stream.restore();
  stub?.restore();
});

describe('useAlertsStore over the status stream', () => {
  it('carries the session token in the query string, because EventSource cannot set headers', async () => {
    renderStore();
    await waitFor(() => expect(stream.urls.length).toBe(1));
    expect(stream.urls[0]).toContain('/api/status/stream');
  });

  it('takes the whole picture from the snapshot', async () => {
    const { result } = renderStore();
    await waitFor(() => expect(stream.openCount()).toBe(1));

    act(() => {
      snapshot({
        feeds: feeds({ chat: T1 }),
        teamUpSoon: upSoonAt(FIXTURE_A),
        announcements: [announcement()],
      });
    });

    await waitFor(() => expect(result.current.teamUpSoon).toBe(true));
    expect(result.current.teamUpSoon).toBe(true);
    expect(result.current.announcements).toHaveLength(1);
  });

  it('replaces on reconnect rather than merging, so a retracted item cannot survive', async () => {
    const { result } = renderStore();
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => {
      snapshot({ announcements: [announcement(), announcement({ id: '01a0f000-0000-7000-8000-000000000002', body: 'Court 3 is closed' })] });
    });
    await waitFor(() => expect(result.current.announcements).toHaveLength(2));

    // A reconnect's snapshot is the current answer, not an addition to the old one. Merging
    // here would leave an announcement on screen that the server has already dropped.
    act(() => {
      snapshot({ announcements: [announcement({ id: '01a0f000-0000-7000-8000-000000000002', body: 'Court 3 is closed' })] });
    });

    await waitFor(() => expect(result.current.announcements).toHaveLength(1));
    expect(result.current.announcements[0]?.body).toBe('Court 3 is closed');
  });

  it('adds a pushed announcement once, however many times the frame arrives', async () => {
    const { result } = renderStore();
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => snapshot({}));

    act(() => {
      stream.emitRaw(STATUS_ANNOUNCEMENT_EVENT, JSON.stringify(announcement()));
      // A frame buffered across the snapshot read can legitimately arrive twice; the store
      // must be idempotent on id rather than relying on the server never repeating itself.
      stream.emitRaw(STATUS_ANNOUNCEMENT_EVENT, JSON.stringify(announcement()));
    });

    await waitFor(() => expect(result.current.announcements).toHaveLength(1));
  });

  it('removes a retracted announcement by id', async () => {
    const { result } = renderStore();
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => snapshot({ announcements: [announcement()] }));
    await waitFor(() => expect(result.current.announcements).toHaveLength(1));

    act(() => {
      stream.emitRaw(
        STATUS_ANNOUNCEMENT_RETRACTED_EVENT,
        JSON.stringify({ announcementId: announcement().id }),
      );
    });

    await waitFor(() => expect(result.current.announcements).toHaveLength(0));
  });

  it('lights each dot from its own feed frame, and only that one', async () => {
    const { result } = renderStore({ feeds: feeds({ chat: T0, teamChat: T0, gallery: T0 }) });
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => snapshot({ feeds: feeds({ chat: T0, teamChat: T0, gallery: T0 }) }));
    await waitFor(() => expect(result.current.chatUnread).toBe(false));

    act(() => stream.emitRaw(STATUS_CHAT_ACTIVITY_EVENT, activity(T1)));
    await waitFor(() => expect(result.current.chatUnread).toBe(true));
    expect(result.current.teamChatUnread).toBe(false);
    expect(result.current.galleryUnread).toBe(false);

    act(() => stream.emitRaw(STATUS_TEAM_CHAT_ACTIVITY_EVENT, activity(T1)));
    await waitFor(() => expect(result.current.teamChatUnread).toBe(true));

    act(() => stream.emitRaw(STATUS_GALLERY_ACTIVITY_EVENT, activity(T1)));
    await waitFor(() => expect(result.current.galleryUnread).toBe(true));
  });

  /*
   * ADR-125 — the first-sight rule. A device that has never been seeded must adopt the current
   * watermarks and show every LED dark: without it, a phone joining at four o'clock is greeted
   * by three dots for a day it was not present for.
   */
  it('seeds a fresh device dark, however much history the snapshot carries', async () => {
    const { result } = renderStore({ feeds: feeds({ chat: T2, teamChat: T2, gallery: T2 }) });
    await waitFor(() => expect(stream.openCount()).toBe(1));

    act(() => snapshot({ feeds: feeds({ chat: T2, teamChat: T2, gallery: T2 }) }));

    await waitFor(() => expect(stream.openCount()).toBe(1));
    expect(result.current.chatUnread).toBe(false);
    expect(result.current.teamChatUnread).toBe(false);
    expect(result.current.galleryUnread).toBe(false);
  });

  /*
   * ADR-125 — seeding happens ONCE. A device that arrived while every feed was empty holds
   * three null marks, and if that counted as unseeded it would re-seed on the next snapshot —
   * swallowing the first message ever sent, which is the one most worth a dot.
   */
  it('does not re-seed on the second snapshot, so the first message still lights the dot', async () => {
    const { result } = renderStore();
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => snapshot({}));
    await waitFor(() => expect(result.current.chatUnread).toBe(false));

    act(() => snapshot({ feeds: feeds({ chat: T1 }) }));

    await waitFor(() => expect(result.current.chatUnread).toBe(true));
  });

  it('lets the open room mark the feed read, and keeps it read on the next snapshot', async () => {
    const { result } = renderStore({ feeds: feeds({ chat: T0 }) });
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => snapshot({ feeds: feeds({ chat: T0 }) }));

    act(() => stream.emitRaw(STATUS_CHAT_ACTIVITY_EVENT, activity(T1)));
    await waitFor(() => expect(result.current.chatUnread).toBe(true));

    act(() => result.current.markFeedRead('chat'));
    await waitFor(() => expect(result.current.chatUnread).toBe(false));

    // The mark is a position, not a moment: re-stating the same watermark cannot relight it.
    act(() => snapshot({ feeds: feeds({ chat: T1 }) }));
    await waitFor(() => expect(result.current.chatUnread).toBe(false));

    // Something genuinely newer still does.
    act(() => snapshot({ feeds: feeds({ chat: T2 }) }));
    await waitFor(() => expect(result.current.chatUnread).toBe(true));
  });

  /*
   * ADR-125 — a frame that arrives out of order must not wind the watermark back. A frame
   * buffered across the snapshot read can legitimately be delivered after a newer one, and
   * applying it blind would put a lit dot out while the newer message is still unread.
   */
  it('ignores a feed frame older than the watermark it already holds', async () => {
    const { result } = renderStore({ feeds: feeds({ chat: T1 }) });
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => snapshot({ feeds: feeds({ chat: T1 }) }));
    await waitFor(() => expect(result.current.chatUnread).toBe(false));

    act(() => stream.emitRaw(STATUS_CHAT_ACTIVITY_EVENT, activity(T2)));
    await waitFor(() => expect(result.current.chatUnread).toBe(true));

    // The straggler. Taken at face value it would drag the watermark below the read mark and
    // put the dot out, hiding a message nobody has looked at.
    act(() => stream.emitRaw(STATUS_CHAT_ACTIVITY_EVENT, activity(T0)));

    await waitFor(() => expect(stream.openCount()).toBe(1));
    expect(result.current.chatUnread).toBe(true);
  });

  /*
   * ADR-153 — the other half of the rule above. Activity may only raise the mark; a RETRACTION
   * states it outright, because a hide genuinely lowers the feed's latest and the monotonic
   * merge would discard precisely the frame that puts the dot out. Before this frame existed
   * the dot stayed lit until the next snapshot, which is what ADR-131 recorded and declined
   * to fix.
   */
  it('puts the dot out when a retraction lowers the watermark below the read mark', async () => {
    const { result } = renderStore({ feeds: feeds({ chat: T0 }) });
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => snapshot({ feeds: feeds({ chat: T0 }) }));

    act(() => stream.emitRaw(STATUS_CHAT_ACTIVITY_EVENT, activity(T2)));
    await waitFor(() => expect(result.current.chatUnread).toBe(true));

    // The superadmin hides that message; T0 is what is left, and the reader had already read it.
    act(() => stream.emitRaw(STATUS_CHAT_RETRACTED_EVENT, activity(T0)));

    await waitFor(() => expect(result.current.chatUnread).toBe(false));
  });

  /*
   * ADR-155 — the same rule, in the room ADR-153 did not reach. The team room has its own
   * watermark and now its own moderator, so it needs its own retraction: a captain hiding the
   * newest line must put the team dot out, and must not touch the other two.
   */
  it('puts the team-chat dot out when its captain hides the newest line', async () => {
    const { result } = renderStore({ feeds: feeds({ chat: T2, teamChat: T0, gallery: T2 }) });
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => snapshot({ feeds: feeds({ chat: T2, teamChat: T0, gallery: T2 }) }));

    act(() => stream.emitRaw(STATUS_TEAM_CHAT_ACTIVITY_EVENT, activity(T2)));
    await waitFor(() => expect(result.current.teamChatUnread).toBe(true));

    act(() => stream.emitRaw(STATUS_TEAM_CHAT_RETRACTED_EVENT, activity(T0)));

    await waitFor(() => expect(result.current.teamChatUnread).toBe(false));
    // One room's moderation is not another's: the global dot is untouched.
    expect(result.current.chatUnread).toBe(false);
  });

  /*
   * Hiding the only message there has ever been. `at` is null rather than absent, and the dot
   * has to go out rather than throw or cling to the moment it was lit.
   */
  it('puts the dot out when a retraction empties the feed entirely', async () => {
    const { result } = renderStore();
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => snapshot({}));

    act(() => stream.emitRaw(STATUS_CHAT_ACTIVITY_EVENT, activity(T2)));
    await waitFor(() => expect(result.current.chatUnread).toBe(true));

    act(() => stream.emitRaw(STATUS_CHAT_RETRACTED_EVENT, JSON.stringify({ at: null })));

    await waitFor(() => expect(result.current.chatUnread).toBe(false));
  });

  /*
   * ADR-125 — a hidden message LOWERS the watermark, so the snapshot has to replace rather than
   * merge by maximum. Merging would keep a dot burning for a line nobody can read any more.
   */
  it('follows the watermark down when a message is moderated away', async () => {
    const { result } = renderStore({ feeds: feeds({ chat: T0 }) });
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => snapshot({ feeds: feeds({ chat: T0 }) }));

    act(() => stream.emitRaw(STATUS_CHAT_ACTIVITY_EVENT, activity(T2)));
    await waitFor(() => expect(result.current.chatUnread).toBe(true));

    act(() => snapshot({ feeds: feeds({ chat: T0 }) }));

    await waitFor(() => expect(result.current.chatUnread).toBe(false));
  });

  it('survives a malformed frame and falls back to the poll rather than going down', async () => {
    const { result } = renderStore();
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => snapshot({ announcements: [announcement()] }));
    await waitFor(() => expect(result.current.announcements).toHaveLength(1));

    // The shell's dots sit on every surface, so a frame that will not parse must cost the
    // frame, not the page. It counts as the socket failing: the poll is the safety net.
    act(() => stream.emitRaw(STATUS_ANNOUNCEMENT_EVENT, 'not json'));

    expect(result.current.announcements).toHaveLength(1);
  });

  it('follows the up-soon frame in both directions, because it carries state not a buzz', async () => {
    const { result } = renderStore();
    await waitFor(() => expect(stream.openCount()).toBe(1));
    act(() => snapshot({}));

    act(() => {
      stream.emitRaw(
        STATUS_TEAM_UPSOON_EVENT,
        JSON.stringify({ upSoon: true, gamesAway: 0, fixtureId: 'fixture-1' }),
      );
    });
    await waitFor(() => expect(result.current.teamUpSoon).toBe(true));

    // Leaving the window has to turn the LED off, or the signal stops being believed.
    act(() => {
      stream.emitRaw(
        STATUS_TEAM_UPSOON_EVENT,
        JSON.stringify({ upSoon: false, gamesAway: null, fixtureId: null }),
      );
    });
    await waitFor(() => expect(result.current.teamUpSoon).toBe(false));
  });

  /**
   * ADR-133 (B4) — the toast, and the reason the server had to change first.
   *
   * ADR-118's restart button re-states the window to every team at once, and a reconnecting
   * phone is handed a snapshot that is indistinguishable from news unless it carries the
   * fixture. These are the cases that distinguish them.
   */
  describe('the up-soon toast', () => {
    it('raises on the first call, and not again for the same fixture', async () => {
      const { result } = renderStore();
      await waitFor(() => expect(stream.openCount()).toBe(1));

      act(() => snapshot({ teamUpSoon: upSoonAt(FIXTURE_A, 1) }));
      await waitFor(() => expect(result.current.upSoonToast?.fixtureId).toBe(FIXTURE_A));
      expect(result.current.upSoonToast?.gamesAway).toBe(1);

      act(() => result.current.dismissUpSoon());
      await waitFor(() => expect(result.current.upSoonToast).toBeNull());

      // The reconnect. Same fixture, same words, and the participant has already read them.
      act(() => snapshot({ teamUpSoon: upSoonAt(FIXTURE_A, 0) }));
      expect(result.current.upSoonToast).toBeNull();
      // The lamp is a different question: the team IS up soon, so it stays lit.
      expect(result.current.teamUpSoon).toBe(true);
    });

    /*
     * `upSoonWatch` republishes when `gamesAway` changes, so "one game away" becomes "you're
     * up next" as a second frame for the same fixture. The floor keys on the fixture alone
     * precisely so that second frame does not interrupt a second time.
     */
    it('does not re-toast when the same fixture only moves closer', async () => {
      const { result } = renderStore();
      await waitFor(() => expect(stream.openCount()).toBe(1));
      act(() => snapshot({}));

      act(() => {
        stream.emitRaw(STATUS_TEAM_UPSOON_EVENT, JSON.stringify(upSoonAt(FIXTURE_A, 1)));
      });
      await waitFor(() => expect(result.current.upSoonToast).not.toBeNull());
      act(() => result.current.dismissUpSoon());

      act(() => {
        stream.emitRaw(STATUS_TEAM_UPSOON_EVENT, JSON.stringify(upSoonAt(FIXTURE_A, 0)));
      });
      expect(result.current.upSoonToast).toBeNull();
    });

    it('raises again for the next fixture, which is a different call to a different court', async () => {
      const { result } = renderStore();
      await waitFor(() => expect(stream.openCount()).toBe(1));
      act(() => snapshot({ teamUpSoon: upSoonAt(FIXTURE_A) }));
      await waitFor(() => expect(result.current.upSoonToast).not.toBeNull());
      act(() => result.current.dismissUpSoon());

      act(() => {
        stream.emitRaw(STATUS_TEAM_UPSOON_EVENT, JSON.stringify(upSoonAt(FIXTURE_B)));
      });
      await waitFor(() => expect(result.current.upSoonToast?.fixtureId).toBe(FIXTURE_B));
    });

    /* The frame that says the window was closed. It darkens the lamp and has nothing to say. */
    it('stays silent when the team leaves the window', async () => {
      const { result } = renderStore();
      await waitFor(() => expect(stream.openCount()).toBe(1));
      act(() => snapshot({}));

      act(() => {
        stream.emitRaw(
          STATUS_TEAM_UPSOON_EVENT,
          JSON.stringify({ upSoon: false, gamesAway: null, fixtureId: null }),
        );
      });
      expect(result.current.upSoonToast).toBeNull();
    });

    /*
     * An older server still sending a bare boolean. There is no fixture to floor it against,
     * so a toast raised here could never be dismissed for good — it would fire on every
     * reconnect for the rest of the day. The lamp still works, which is the ADR-091 behaviour.
     */
    it('lights the lamp but raises no toast for a server that sends only a boolean', async () => {
      const { result } = renderStore();
      await waitFor(() => expect(stream.openCount()).toBe(1));

      act(() =>
        stream.emitRaw(
          STATUS_SNAPSHOT_EVENT,
          JSON.stringify({ ...QUIET, teamUpSoon: true }),
        ),
      );
      await waitFor(() => expect(result.current.upSoonToast).toBeNull());
      expect(result.current.teamUpSoon).toBe(false);
    });

    /*
     * A frame that says "up soon" but garbles its details. The lamp is still the honest
     * answer — the team IS up soon — but there is no fixture to floor a toast against, so
     * raising one would be raising a toast that fires again on every reconnect for ever.
     */
    it('lights the lamp and raises no toast when the details are not what they claim', async () => {
      const { result } = renderStore();
      await waitFor(() => expect(stream.openCount()).toBe(1));
      act(() => snapshot({}));

      act(() => {
        stream.emitRaw(
          STATUS_TEAM_UPSOON_EVENT,
          JSON.stringify({ upSoon: true, gamesAway: 'one', fixtureId: 7 }),
        );
      });

      await waitFor(() => expect(result.current.teamUpSoon).toBe(true));
      expect(result.current.upSoonToast).toBeNull();
    });

    it('dismissing nothing is not an error, and does not move the floor', async () => {
      const { result } = renderStore();
      await waitFor(() => expect(stream.openCount()).toBe(1));
      act(() => snapshot({}));

      act(() => result.current.dismissUpSoon());

      act(() => {
        stream.emitRaw(STATUS_TEAM_UPSOON_EVENT, JSON.stringify(upSoonAt(FIXTURE_A)));
      });
      await waitFor(() => expect(result.current.upSoonToast?.fixtureId).toBe(FIXTURE_A));
    });
  });

  /*
   * The saving, asserted as a count of requests rather than described in a comment. Everything
   * else in this file is correctness; this is the reason the change exists.
   */
  it('waits a jittered moment before rebuilding a socket the watchdog buried', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderStore();
      await vi.waitFor(() => expect(stream.urls.length).toBe(1));
      act(() => snapshot({}));

      // Whatever silences one phone's socket — the tunnel, the Wi-Fi, the restart button —
      // silences all of them at the same instant, so they all go stale at the same instant.
      await act(async () => {
        vi.advanceTimersByTime(STREAM_STALE_MS + 100);
        await Promise.resolve();
      });
      expect(stream.urls.length).toBe(1);

      // The server's per-connection `retry:` cannot help here: this path builds a brand new
      // EventSource, which starts again from the browser's fixed default.
      await act(async () => {
        vi.advanceTimersByTime(5_000);
        await Promise.resolve();
      });
      expect(stream.urls.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reconnect twice when the phone wakes up with a revival already pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderStore();
      await vi.waitFor(() => expect(stream.urls.length).toBe(1));
      act(() => snapshot({}));

      // The socket goes quiet, so a revival is armed...
      await act(async () => {
        vi.advanceTimersByTime(STREAM_STALE_MS + 100);
        await Promise.resolve();
      });
      // ...and then the participant unlocks the phone, which rebuilds the stream itself
      // (ADR-105). The armed revival belongs to a connection that no longer exists.
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
      });
      expect(stream.urls.length).toBe(2);

      await act(async () => {
        vi.advanceTimersByTime(5_000);
        await Promise.resolve();
      });
      expect(stream.urls.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconnects straight away when the browser gives up, rather than waiting for the watchdog', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderStore();
      await vi.waitFor(() => expect(stream.urls.length).toBe(1));
      act(() => stream.connect());
      act(() => snapshot({}));

      /*
       * A hard close is what the tunnel's 502 looks like while the API reboots: the browser
       * fails the connection for good and will not retry it. Waiting seventy seconds for the
       * staleness watchdog would be waiting for news we have already had.
       */
      await act(async () => {
        stream.die();
        await Promise.resolve();
      });
      expect(stream.urls.length).toBe(1);

      await act(async () => {
        vi.advanceTimersByTime(5_000);
        await Promise.resolve();
      });
      expect(stream.urls.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves a merely dropped connection to the browser, which is already retrying it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderStore();
      await vi.waitFor(() => expect(stream.urls.length).toBe(1));
      act(() => stream.connect());
      act(() => snapshot({}));

      // `readyState` is still CONNECTING here, so the browser will reconnect on the delay the
      // server's `retry:` gave it. Opening a second socket would put two in the air.
      await act(async () => {
        stream.fail();
        vi.advanceTimersByTime(20_000);
        await Promise.resolve();
      });

      expect(stream.urls.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('slows to the poll\'s own pace after three hard closes rather than giving up for good', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderStore();
      await vi.waitFor(() => expect(stream.urls.length).toBe(1));
      act(() => stream.connect());
      act(() => snapshot({}));

      const dieAndWait = async () => {
        await act(async () => {
          stream.die();
          vi.advanceTimersByTime(5_000);
          await Promise.resolve();
        });
      };

      // A 401 never fixes itself, so three quick tries is the whole quick budget; the five
      // seconds each `dieAndWait` advances is not enough to reach a slow revival.
      for (let attempt = 0; attempt < 5; attempt += 1) await dieAndWait();
      expect(stream.urls.length).toBe(4);

      /*
       * ADR-187 — but it does NOT stay shut for the rest of the afternoon. The fallback poll
       * runs at 45-75s, so a phone that has given up on the socket is making requests at that
       * rate regardless; retrying the stream on the same cadence costs nothing extra and is
       * the only thing that can bring the stream back when the cause was transient.
       */
      await act(async () => {
        vi.advanceTimersByTime(80_000);
        await Promise.resolve();
      });
      expect(stream.urls.length).toBe(5);

      // A connection that actually opens buys the quick budget back, so an afternoon of
      // ordinary blips never adds up to the cap.
      act(() => stream.connect());
      await dieAndWait();
      expect(stream.urls.length).toBe(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it('spreads those revivals across seconds rather than drawing the same one twice', () => {
    expect(reviveDelayMs(() => 0)).toBe(1_000);
    expect(reviveDelayMs(() => 0.999)).toBeLessThanOrEqual(5_000);
    expect(reviveDelayMs(() => 0.5)).toBe(3_000);
  });

  it('paces the revivals past the budget at the window the fallback poll already spends', () => {
    // Deliberately the same 45-75s as `nextPollDelay`: that is the argument for retrying at all.
    expect(slowReviveDelayMs(() => 0)).toBe(45_000);
    expect(slowReviveDelayMs(() => 0.999)).toBeLessThanOrEqual(75_000);
    expect(slowReviveDelayMs(() => 0.5)).toBe(60_000);
  });

  it('stops polling while the socket carries, and starts again when it dies', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderStore();
      await waitFor(() => expect(stream.openCount()).toBe(1));
      // One read on mount, which is the bootstrap for a browser that has no stream at all.
      const afterMount = stub.callsTo('GET /api/me/alerts').length;
      act(() => stream.connect());

      // Two full poll windows (45–75 s each) with a live socket: not one request.
      await act(async () => {
        vi.advanceTimersByTime(160_000);
      });
      expect(stub.callsTo('GET /api/me/alerts')).toHaveLength(afterMount);

      // The socket drops. The fallback has to come back, or the dots freeze for the rest of
      // the afternoon — the exact failure a stream is most likely to introduce.
      act(() => stream.fail());
      await act(async () => {
        vi.advanceTimersByTime(160_000);
      });
      await waitFor(() =>
        expect(stub.callsTo('GET /api/me/alerts').length).toBeGreaterThan(afterMount),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes the socket when the shell unmounts', async () => {
    const { unmount } = renderStore();
    await waitFor(() => expect(stream.openCount()).toBe(1));

    unmount();

    // A socket per abandoned navigation would accumulate for the whole afternoon.
    expect(stream.openCount()).toBe(0);
  });

  it('opens no socket for a staff session: none of these frames are about them', async () => {
    stub = installFetchStub({ 'GET /api/me/alerts': { status: 403, body: {} } });
    renderHook(() => useAlertsStore());

    await waitFor(() => expect(stub.callsTo('GET /api/me/alerts').length).toBeGreaterThan(0));
    expect(stream.openCount()).toBe(0);
  });
});
