import {
  STATUS_ANNOUNCEMENT_EVENT,
  STATUS_ANNOUNCEMENT_RETRACTED_EVENT,
  STATUS_CHAT_ACTIVITY_EVENT,
  STATUS_FEED_MATCH_EVENT,
  STATUS_CHAT_RETRACTED_EVENT,
  STATUS_GALLERY_ACTIVITY_EVENT,
  STATUS_GALLERY_RETRACTED_EVENT,
  STATUS_LEADERBOARD_EVENT,
  STATUS_HEARTBEAT_EVENT,
  STATUS_SNAPSHOT_EVENT,
  STATUS_TEAM_CHAT_ACTIVITY_EVENT,
  STATUS_TEAM_CHAT_RETRACTED_EVENT,
  STATUS_TEAM_UPSOON_EVENT,
} from '@psd/contracts';
import type {
  AnnouncementView,
  FeedActivityView,
  FeedRetractionView,
  LeaderboardView,
  MatchView,
  StatusSnapshotView,
  TeamUpSoonView,
} from '@psd/contracts';
import type { FeedName } from '../storage/feedReadStore.js';
import { readSessionToken } from '../session/tokenStore.js';
import { readScreenKey } from '../session/screenKeyStore.js';
import { createStreamWatchdog } from './streamWatchdog.js';
import type { StreamWatchdog } from './streamWatchdog.js';

/**
 * ADR-121 — the shell's live connection: everything that is not a chat room, on one socket.
 *
 * Shaped deliberately like `chatStream.ts` rather than sharing code with it. The two differ in
 * the one place that matters — a chat stream resumes from a cursor because it carries a log,
 * this one re-syncs from a snapshot because it carries state — and a shared abstraction over
 * that difference would have to be told which it was on every call. What they genuinely share
 * is the watchdog, and that is already a module.
 *
 * `EventSource` cannot set request headers, which is normally the hard part of authenticating
 * a stream; ADR-016 already made the session token acceptable from the query string.
 */

const STREAM_PATH = '/api/status/stream';

/**
 * `EventSource.CLOSED`, by its numeric value rather than through the constructor.
 *
 * The browser has two ways to fail a stream and only tells them apart here. A dropped
 * connection leaves `readyState` at `CONNECTING` and the browser reconnects itself, on the
 * delay our `retry:` gave it. A reconnect that gets an actual HTTP response which is not 200
 * with `text/event-stream` — the tunnel's 502 while the API reboots, a 401 from an expired
 * session, the sweep's 503 — makes the browser *fail the connection* per the specification:
 * `CLOSED`, and it never retries. The constant is spelled out because `globalThis.EventSource`
 * is captured as a local here and reading statics off it reads worse than this does.
 */
const EVENT_SOURCE_CLOSED = 2;

export interface StatusStreamHandlers {
  /** The current answer, on connect and on every reconnect. Replaces state; never merges. */
  onSnapshot: (snapshot: StatusSnapshotView) => void;
  onAnnouncement: (announcement: AnnouncementView) => void;
  onAnnouncementRetracted: (announcementId: string) => void;
  onTeamUpSoon: (view: TeamUpSoonView) => void;
  /**
   * ADR-125 — a social feed changed, and when.
   *
   * One handler for all three feeds rather than three, because the frames differ only by which
   * name they carry and the store does the identical thing with each. Still not the message
   * itself: the dot needs a time, and pushing every chat line to every phone whether or not the
   * room is open is the cost this frame exists to avoid.
   */
  onFeedActivity: (feed: FeedName, activity: FeedActivityView) => void;
  /** ADR-153 — a hide; the only handler permitted to lower a watermark. */
  onFeedRetracted: (feed: FeedName, retraction: FeedRetractionView) => void;
  /**
   * ADR-131/132 — one match the feed renders, whole.
   *
   * Payload-carrying, unlike the activity frames above, and the asymmetry is the point: a dot
   * needs only a time, but a feed row needs the row. The server sends the same object it put
   * in its own HTTP response, so this can replace a row outright rather than trigger a re-fetch.
   */
  onFeedMatch: (match: MatchView) => void;
  /** ADR-131/132 — the board after a result changed. Global; the same list for every phone. */
  onLeaderboard: (leaderboard: LeaderboardView) => void;
  onLive: () => void;
  onError: () => void;
  /**
   * The browser has given up on this socket for good and will not retry it.
   *
   * Distinct from `onError`, which fires for both failures: for the retrying kind the right
   * answer is to do nothing and let the browser get on with it, and reopening ourselves would
   * put two sockets in the air. For this kind nothing reopens it at all, so without this the
   * only recovery is the staleness watchdog — an instrument built for the *silent* half-open
   * socket, seventy seconds after the last frame, when the browser has already told us.
   */
  onDead: () => void;
  /** ADR-119 — silent for longer than the heartbeat allows, so the socket is dead. */
  onStale: () => void;
}

export interface StatusStreamHandle {
  close: () => void;
}

/**
 * Exported for the hook's tests, which assert the credential travels in the query string.
 *
 * Always the query string here, whatever the client learned about headers elsewhere:
 * `EventSource` cannot set one at all. ADR-140 gave the hall screen's key the same treatment
 * for the same reason — the screen's whole purpose is to sit on this stream.
 */
export function statusStreamUrl(): string {
  const query = new URLSearchParams();
  const token = readSessionToken();
  const screenKey = readScreenKey();
  if (token !== null) query.set('session_token', token);
  if (screenKey !== null) query.set('screen_key', screenKey);
  const search = query.toString();
  return search === '' ? STREAM_PATH : `${STREAM_PATH}?${search}`;
}

/**
 * The three things that are about the connection itself rather than about a frame.
 *
 * Separate from the frame listeners because the error branch is where the two kinds of
 * failure are told apart, and that distinction deserves to be read on its own.
 */
function bindLifecycle(
  source: EventSource,
  handlers: StatusStreamHandlers,
  watchdog: StreamWatchdog,
): void {
  source.addEventListener('open', () => {
    watchdog.touch();
    handlers.onLive();
  });
  source.addEventListener('error', () => {
    handlers.onError();
    /*
     * The watchdog is deliberately left armed: it is the long-stop if the quick revivals are
     * used up, which is what keeps an expired session from becoming a reconnect loop.
     */
    if (source.readyState === EVENT_SOURCE_CLOSED) handlers.onDead();
  });
}

/** Reads a frame's JSON and hands it on, or reports the frame as an error and drops it. */
type ParseFrame = <T>(event: Event, accept: (value: T) => void) => void;

/**
 * The frames about *content* rather than about the connection: the three watermarks and the
 * two payload-carrying ones.
 *
 * Extracted when the match and leaderboard frames arrived (ADR-132) and `openStatusStream`
 * crossed the fifty-line limit. The split is along a real seam rather than at a convenient
 * line: everything here is "something happened in the event", everything left behind is
 * "something happened to the socket".
 */
function bindFeedFrames(
  source: EventSource,
  handlers: StatusStreamHandlers,
  parsed: ParseFrame,
): void {
  source.addEventListener(STATUS_CHAT_ACTIVITY_EVENT, (event) => {
    parsed<FeedActivityView>(event, (activity) => handlers.onFeedActivity('chat', activity));
  });
  source.addEventListener(STATUS_TEAM_CHAT_ACTIVITY_EVENT, (event) => {
    parsed<FeedActivityView>(event, (activity) => handlers.onFeedActivity('teamChat', activity));
  });
  source.addEventListener(STATUS_GALLERY_ACTIVITY_EVENT, (event) => {
    parsed<FeedActivityView>(event, (activity) => handlers.onFeedActivity('gallery', activity));
  });
  source.addEventListener(STATUS_CHAT_RETRACTED_EVENT, (event) => {
    parsed<FeedRetractionView>(event, (r) => handlers.onFeedRetracted('chat', r));
  });
  source.addEventListener(STATUS_GALLERY_RETRACTED_EVENT, (event) => {
    parsed<FeedRetractionView>(event, (r) => handlers.onFeedRetracted('gallery', r));
  });
  // ADR-155 — the team room can lower its watermark too, now that its captain can hide a line.
  source.addEventListener(STATUS_TEAM_CHAT_RETRACTED_EVENT, (event) => {
    parsed<FeedRetractionView>(event, (r) => handlers.onFeedRetracted('teamChat', r));
  });
  source.addEventListener(STATUS_FEED_MATCH_EVENT, (event) => {
    parsed<MatchView>(event, handlers.onFeedMatch);
  });
  source.addEventListener(STATUS_LEADERBOARD_EVENT, (event) => {
    parsed<LeaderboardView>(event, handlers.onLeaderboard);
  });
}

/**
 * Returns `null` when the browser has no `EventSource`, which is the caller's signal to keep
 * polling rather than to show an error.
 */
export function openStatusStream(handlers: StatusStreamHandlers): StatusStreamHandle | null {
  const Source = globalThis.EventSource;
  if (typeof Source !== 'function') return null;

  const source = new Source(statusStreamUrl(), { withCredentials: true });
  const watchdog = createStreamWatchdog(handlers.onStale);

  /*
   * One parser for every frame that carries JSON. A malformed frame must not take the shell
   * down — the alerts store drives the nav dots on every surface — so it is reported as an
   * error and skipped, which leaves the fallback poll to carry on.
   */
  const parsed = <T,>(event: Event, accept: (value: T) => void): void => {
    watchdog.touch();
    try {
      accept(JSON.parse((event as MessageEvent<string>).data) as T);
    } catch {
      handlers.onError();
    }
  };

  source.addEventListener(STATUS_SNAPSHOT_EVENT, (event) => {
    parsed<StatusSnapshotView>(event, handlers.onSnapshot);
  });
  source.addEventListener(STATUS_ANNOUNCEMENT_EVENT, (event) => {
    parsed<AnnouncementView>(event, handlers.onAnnouncement);
  });
  source.addEventListener(STATUS_ANNOUNCEMENT_RETRACTED_EVENT, (event) => {
    parsed<{ announcementId: string }>(event, (view) =>
      handlers.onAnnouncementRetracted(view.announcementId),
    );
  });
  source.addEventListener(STATUS_TEAM_UPSOON_EVENT, (event) => {
    parsed<TeamUpSoonView>(event, handlers.onTeamUpSoon);
  });

  bindFeedFrames(source, handlers, parsed);

  // Carries no data: its only job is to prove the socket is still carrying frames.
  source.addEventListener(STATUS_HEARTBEAT_EVENT, () => watchdog.touch());

  bindLifecycle(source, handlers, watchdog);

  return {
    close: () => {
      watchdog.stop();
      source.close();
    },
  };
}
