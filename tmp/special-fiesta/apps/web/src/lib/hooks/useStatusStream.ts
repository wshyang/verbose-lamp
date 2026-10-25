import { useEffect, useRef, useState } from 'react';
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
import { openStatusStream } from '../api/statusStream.js';
import type { StatusStreamHandlers } from '../api/statusStream.js';
import { useForegroundGeneration } from './liveRoom.js';

/**
 * ADR-121 — the shell's socket, and whether it is carrying anything.
 *
 * Returns `isLive`, which the alerts store uses to suppress its poll. That is the whole saving:
 * three hundred phones asking "anything for me?" every minute becomes three hundred idle
 * sockets and a frame only when something actually happened.
 *
 * Reconnection is the same mechanism the chat rooms use — re-run the effect — because it is
 * already proven and because this stream has nothing to resume from: a reconnect opens with a
 * fresh snapshot, which is strictly better than replaying what was missed.
 */
export interface StatusStreamInput {
  /** All of these must be stable across renders, or the socket is rebuilt on every one. */
  onSnapshot: (snapshot: StatusSnapshotView) => void;
  onAnnouncement: (announcement: AnnouncementView) => void;
  onAnnouncementRetracted: (announcementId: string) => void;
  onTeamUpSoon: (view: TeamUpSoonView) => void;
  onFeedActivity: (feed: FeedName, activity: FeedActivityView) => void;
  onFeedRetracted: (feed: FeedName, retraction: FeedRetractionView) => void;
  onFeedMatch: (match: MatchView) => void;
  onLeaderboard: (leaderboard: LeaderboardView) => void;
  /**
   * Whose stream this is. A staff session has none: every frame this carries is addressed to a
   * participant, so there is nothing for a facilitator's socket to say.
   *
   * ADR-140/141 — a hall screen is the third kind. It is not a participant and gets no
   * team-addressed frames (the server never builds a team gate for it), but the global ones —
   * the board, a finished match — are exactly what it exists to project, and they are what
   * makes a scene change land within a second of a result instead of at the next poll.
   */
  viewer: 'participant' | 'staff' | 'screen';
}

/**
 * How long a phone waits before rebuilding a socket the watchdog declared dead.
 *
 * The server jitters `EventSource`'s own reconnect with a per-connection `retry:` (design §6),
 * but this path does not use it: ADR-119's watchdog closes the handle and constructs a *new*
 * `EventSource`, and a new one starts again from the browser's fixed default. So the same
 * thundering herd comes back through the door the watchdog opened — three hundred phones whose
 * sockets all went quiet at the same instant, because whatever silenced them silenced them
 * together. The spread is chosen here instead, for the same reason `nextPollDelay()` exists.
 */
const REVIVE_FLOOR_MS = 1_000;
const REVIVE_SPREAD_MS = 4_000;

export function reviveDelayMs(random: () => number = Math.random): number {
  return Math.round(REVIVE_FLOOR_MS + random() * REVIVE_SPREAD_MS);
}

/**
 * How many times in a row a hard close may be answered with a QUICK reconnect.
 *
 * The two causes of a hard close want opposite things. A 502 while the API reboots fixes
 * itself in about two seconds, so retrying is exactly right. A 401 from an expired session
 * never fixes itself, and retrying it fast is a loop — three hundred phones asking to be
 * refused, for the rest of the afternoon. Three tries covers the reboot with room to spare.
 *
 * The budget resets on a connection that actually opens, so an afternoon of ordinary blips
 * never adds up to it.
 */
const QUICK_REVIVALS = 3;

/**
 * ADR-187 — what happens AFTER the quick budget is spent.
 *
 * It used to be: nothing, ever. The socket stayed shut for the rest of the session and the
 * fallback poll carried. That looked thrifty and was not, because the poll it falls back to
 * runs at 45–75s — so the phone goes on making requests at the SAME RATE either way, and the
 * only thing the surrender actually bought was every announcement arriving up to a minute late
 * for anyone whose first three attempts happened to fail. Three failures at start-up is not
 * exotic: a tunnel that buffers the opening bytes, or a reverse proxy mid-restart, will do it,
 * and then the stream is dead for the whole afternoon with nothing to bring it back.
 *
 * So the budget now governs the PACE of retrying rather than whether to retry at all. Past it,
 * revival slows to the poll's own window, which is the rate the phone was going to spend
 * anyway. The 401 loop the budget was written to prevent is unchanged in cost — the poll was
 * already making exactly that request — and the session layer still owns signing it out.
 */
const SLOW_REVIVE_FLOOR_MS = 45_000;
const SLOW_REVIVE_SPREAD_MS = 30_000;

export function slowReviveDelayMs(random: () => number = Math.random): number {
  return Math.round(SLOW_REVIVE_FLOOR_MS + random() * SLOW_REVIVE_SPREAD_MS);
}

/** Quick while the budget has anything left in it, then at the fallback poll's own pace. */
function reviveDelayFor(spent: number): number {
  return spent < QUICK_REVIVALS ? reviveDelayMs() : slowReviveDelayMs();
}

/** The effect's own moving parts, bundled so this stays a function of two things. */
interface StreamContext {
  goLive: () => void;
  goOffline: () => void;
  revive: () => void;
  /** The same revival, paced by how much of the quick budget has been spent. */
  reviveWithBackoff: () => void;
  isCancelled: () => boolean;
}

function handlersFor(input: StatusStreamInput, ctx: StreamContext): StatusStreamHandlers {
  const { goLive, goOffline, revive, reviveWithBackoff, isCancelled } = ctx;
  const unless =
    <T,>(accept: (value: T) => void) =>
    (value: T): void => {
      if (!isCancelled()) accept(value);
    };
  /** The bodyless frames: same guard, no argument to carry. */
  const unlessVoid = (accept: () => void) => (): void => {
    if (!isCancelled()) accept();
  };
  return {
    onSnapshot: unless(input.onSnapshot),
    onAnnouncement: unless(input.onAnnouncement),
    onAnnouncementRetracted: unless(input.onAnnouncementRetracted),
    onTeamUpSoon: unless(input.onTeamUpSoon),
    onFeedActivity: (feed, activity) => {
      if (!isCancelled()) input.onFeedActivity(feed, activity);
    },
    onFeedRetracted: (feed, retraction) => {
      if (!isCancelled()) input.onFeedRetracted(feed, retraction);
    },
    onFeedMatch: unless(input.onFeedMatch),
    onLeaderboard: unless(input.onLeaderboard),
    onLive: unlessVoid(goLive),
    onError: unlessVoid(goOffline),
    onDead: unlessVoid(() => {
      goOffline();
      reviveWithBackoff();
    }),
    /*
     * No `cancelled` guard, unlike its neighbours: closing the handle stops the watchdog, so a
     * stale callback cannot outlive the stream that armed it. A guard here would be a branch no
     * test could reach, and this repo treats that as a defect rather than as prudence.
     */
    onStale: () => {
      goOffline();
      revive();
    },
  };
}

export function useStatusStream(input: StatusStreamInput): boolean {
  const [isLive, setIsLive] = useState(false);
  // ADR-119 — bumped when the watchdog finds the socket dead, which re-runs the effect.
  const [revival, setRevival] = useState(0);
  // ADR-105 — a phone coming back from the lock screen rebuilds the stream rather than
  // trusting a socket that spent ten minutes in the background.
  const generation = useForegroundGeneration();
  // Everyone except staff: a console has no dots to light and nothing to project.
  const isSubscriber = input.viewer !== 'staff';
  // A ref, not state: spending a try must not itself re-render, and the count has to survive
  // the effect re-running, which is precisely what a revival does.
  const quickRevivals = useRef(0);

  useEffect(() => {
    if (!isSubscriber) return;
    let cancelled = false;
    let reviveTimer: ReturnType<typeof setTimeout> | undefined;
    const handle = openStatusStream(
      handlersFor(input, {
        goLive: () => {
          quickRevivals.current = 0;
          setIsLive(true);
        },
        goOffline: () => setIsLive(false),
        revive: () => {
          reviveTimer = setTimeout(() => setRevival((count) => count + 1), reviveDelayMs());
        },
        reviveWithBackoff: () => {
          const delay = reviveDelayFor(quickRevivals.current);
          quickRevivals.current += 1;
          reviveTimer = setTimeout(() => setRevival((count) => count + 1), delay);
        },
        isCancelled: () => cancelled,
      }),
    );
    // A browser with no `EventSource` is not live and never will be, which is what keeps the
    // fallback poll running for it.
    setIsLive(handle !== null);
    return () => {
      cancelled = true;
      clearTimeout(reviveTimer);
      handle?.close();
      setIsLive(false);
    };
    // `generation` and `revival` are reconnect triggers, not unused dependencies.
  }, [input, isSubscriber, generation, revival]);

  return isLive;
}
