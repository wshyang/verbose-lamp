import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { usePolling } from './useAsyncData.js';
import type {
  AnnouncementView,
  FeedActivityView,
  FeedRetractionView,
  StatusSnapshotView,
  TeamUpSoonView,
} from '@psd/contracts';
import { useStatusStream } from './useStatusStream.js';
import type { StatusStreamInput } from './useStatusStream.js';
import { applyLiveLeaderboard, applyLiveMatch } from '../live/boardLive.js';
import { useSessionOrNull } from '../session/context.js';
import { fetchAlerts } from '../api/teamChat.js';
import { notifyAnnouncement, notifyUpSoon } from '../notify.js';
import {
  advanceUpSoonFloor,
  readUpSoonFloor,
  shouldAnnounceUpSoon,
} from '../storage/upSoonStore.js';
import {
  advanceAnnouncementFloor,
  hasAnnouncementFloor,
  readAnnouncementFloor,
  seedAnnouncementFloor,
} from '../storage/announcementStore.js';
import {
  NO_MARKS,
  advanceFeedMark,
  isFeedUnread,
  readFeedMarks,
  seedFeedMarks,
} from '../storage/feedReadStore.js';
import type { FeedMarks, FeedName } from '../storage/feedReadStore.js';

/**
 * ADR-063 — whether anything needs the participant's attention.
 *
 * The hook owns the fetch and the state; `AlertsProvider` only shares it (AGENTS-frontend.md: a
 * component never calls the server).
 *
 * **It polls, and the first version did not — which was a bug an e2e test caught.** The reasoning was
 * "the stream keeps the dot current", but the team room's stream only exists while the room is OPEN,
 * so a participant sitting on the leaderboard was never told anything had arrived. The dot appeared
 * only on the next navigation, which is the one moment it is least useful.
 *
 * **ADR-121 reversed that, and the reversal is worth reading.** The old reasoning here was that
 * three hundred sockets to drive one boolean is a bad trade against one `EXISTS` probe a minute.
 * It was the right call while the dot was all a socket would have carried. Once announcements and
 * "your team is needed at a court" wanted the same connection, the socket stopped being per-dot
 * and became per-phone: one connection carrying everything the shell knows, against three separate
 * polls. The poll below is now the fallback — for a browser with no `EventSource`, and for the
 * minutes when a socket is dead — and it is still the same cheap probe it always was, which is why
 * keeping it costs nothing.
 *
 * Two named functions rather than one taking a boolean: a positional flag is banned for good reason,
 * and "clear" and "raise" are what the callers actually mean.
 */
export interface AlertsStore {
  /** ADR-192 — true while the SSE socket is carrying; false while the fallback poll is. */
  isLive: boolean;
  /** ADR-063 — the team room has something this device has not seen. */
  teamChatUnread: boolean;
  /** ADR-083 — the global room's dot on the Social tab, cleared the moment the room absorbs. */
  chatUnread: boolean;
  /** ADR-125 — the photo wall's dot, which the gallery never had before. */
  galleryUnread: boolean;
  /**
   * ADR-125 — an open surface saying "I have now seen this feed up to its watermark".
   *
   * One function taking the feed replaces three `clear`/`raise` pairs. The flag-argument
   * objection that produced those pairs does not apply: the argument here names *which* feed,
   * not *which direction*, and there is no direction to get wrong — marks only move forward,
   * and nothing outside this store can raise a dot at all.
   */
  markFeedRead: (feed: FeedName) => void;
  /** ADR-091 — the team's next fixture is within the capacity window; lights the Feed tab. */
  teamUpSoon: boolean;
  /**
   * ADR-133 (B4) — the up-soon call this browser has not announced yet, or null.
   *
   * Separate from `teamUpSoon` because a lamp and an interruption answer different questions:
   * the lamp says "true now", the toast says "newly true, and I have not said so".
   */
  upSoonToast: TeamUpSoonView | null;
  dismissUpSoon: () => void;
  /** ADR-074 — announcements this participant has not clicked away, oldest first. */
  announcements: AnnouncementView[];
  dismissAnnouncement: (id: string) => void;
}

/**
 * ADR-133 (B4) — the toast half of the up-soon signal, kept apart from the lamp half.
 *
 * The lamp follows state and a re-statement of it is simply correct; the toast is an
 * interruption, so it must follow *news*, and the only thing separating news from a
 * re-statement is the fixture id against what this browser has already announced.
 */
function useUpSoonToast(upSoon: TeamUpSoonView): {
  upSoonToast: TeamUpSoonView | null;
  dismissUpSoon: () => void;
} {
  // Read, not seeded: an absent floor means "announce the first call you hear", which is the
  // right answer for a phone that has heard none.
  const [floor, setFloor] = useState<string | null>(readUpSoonFloor);
  /*
   * A ref, so `dismissUpSoon` keeps one identity for the life of the hook. The only thing
   * dismissable is the toast on screen, so passing the fixture as an argument would merely
   * create a way for the two to disagree.
   */
  const showing = useRef<string | null>(null);
  useEffect(() => {
    showing.current = upSoon.fixtureId;
  }, [upSoon.fixtureId]);

  /*
   * The floor advances on dismissal rather than on display, exactly as the announcement floor
   * does. A reconnect before the tap re-shows the toast already on screen, which costs
   * nothing; advancing on display would lose the call outright for a phone that reconnected
   * in a pocket.
   */
  const dismissUpSoon = useCallback(() => {
    const fixtureId = showing.current;
    if (fixtureId === null) return;
    setFloor((current) => advanceUpSoonFloor(fixtureId, current));
  }, []);

  return {
    upSoonToast: shouldAnnounceUpSoon(upSoon.fixtureId, floor) ? upSoon : null,
    dismissUpSoon,
  };
}

export function useAlertsStore(): AlertsStore {
  const [flags, setFlags] = useState<AlertFlags>(QUIET);
  /*
   * ADR-125 — two halves of one comparison. `watermarks` is what the server says each feed's
   * newest item is; `marks` is what this device has seen. Neither is a dot on its own, which is
   * why they are held as data and the LED is derived at the bottom rather than stored.
   */
  const [watermarks, setWatermarks] = useState<FeedMarks>(NO_MARKS);
  const [marks, setMarks] = useState<FeedMarks>(() => readFeedMarks());
  const [live, setLive] = useState<AnnouncementView[]>([]);
  const [floor, setFloor] = useState<string | null>(() =>
    readAnnouncementFloor(),
  );
  const mounted = useRef(true);

  /*
   * `useState` setters are stable for the life of the hook, so this object can be built once —
   * and it must be. Rebuilt per render it would hand `useStatusStream` a new identity every
   * time and tear the socket down and up again on each one, which is the opposite of the
   * change's purpose and invisible until you count the connections.
   */
  const actions = useMemo(
    () => statusActions({ setFlags, setLive, setFloor, setWatermarks, setMarks }),
    [],
  );
  const refresh = usePolledSnapshot(actions, mounted);
  const isLive = useStatusStream(useFrameHandlers(actions));

  /**
   * ADR-074/082 — dismissal is this browser's business, so there is no request to make.
   *
   * Written to storage and raised in state in the same breath, from the value the store returns, so a
   * browser that refuses writes still advances in memory for the life of the page.
   */
  const dismiss = useCallback((id: string) => {
    setFloor((current) => advanceAnnouncementFloor(id, current));
  }, []);

  const { upSoonToast, dismissUpSoon } = useUpSoonToast(flags.upSoon);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  /*
   * ADR-064's pattern, applied to the shell: the poll is what runs when the stream is not
   * carrying. A phone with a live socket makes no alerts request at all.
   */
  usePolling(isLive ? noop : refresh);
  useBrowserMirror({ live, floor, teamUpSoon: flags.upSoon.upSoon });

  /*
   * The mark is advanced to the watermark the store is *currently* holding, which is what makes
   * "read" mean "read up to what I was shown" rather than "read up to whenever I tapped". A
   * message that lands a moment later has a higher watermark, so it still lights the dot — and
   * the open room clears it again as it absorbs.
   */
  const markFeedRead = useCallback(
    (feed: FeedName) => {
      setMarks((current) => advanceFeedMark(feed, watermarks[feed], current));
    },
    [watermarks],
  );

  return {
    /*
     * ADR-192 — whether this browser's socket is actually carrying.
     *
     * Exposed because it was the one thing nobody could see. An announcement arriving a minute
     * late looks identical to an announcement sent a minute late, and the difference between
     * them is this boolean: live means the frame comes the instant it is published, not live
     * means the fallback poll will find it within 45-75 seconds. Without it on screen, the only
     * way to tell those apart after the fact is to read the source.
     */
    isLive,
    teamChatUnread: isFeedUnread(watermarks.teamChat, marks.teamChat),
    chatUnread: isFeedUnread(watermarks.chat, marks.chat),
    galleryUnread: isFeedUnread(watermarks.gallery, marks.gallery),
    markFeedRead,
    teamUpSoon: flags.upSoon.upSoon,
    /*
     * ADR-133 (B4) — the toast, which is NOT the LED.
     *
     * The LED follows state: it is lit for as long as the team is in the window, and a
     * reconnect that re-states that is simply correct. The toast is an interruption, so it
     * must follow *news*, and the only thing that distinguishes news from a re-statement is
     * the fixture id against what this browser has already announced.
     */
    upSoonToast,
    dismissUpSoon,
    /*
     * Filtered here rather than on the server: the list is the same for everybody, which is what lets
     * it be cached once for the whole event (ADR-074). A floor in a query parameter would give three
     * hundred phones three hundred cache keys — ADR-064's regression, exactly.
     *
     * ADR-082 — `id > floor` on UUIDv7 strings is the server's own ordering, and it is why a retraction
     * still wins: the floor decides what is too old to show, never what stays shown, so an announcement
     * the server has dropped is gone whatever the floor says.
     */
    announcements: live.filter(
      (announcement) => floor === null || announcement.id > floor,
    ),
    dismissAnnouncement: dismiss,
  };
}

/**
 * ADR-125 — what is left of the boolean state once the dots became a comparison.
 *
 * Only up-soon remains, because it is the one alert the server genuinely decides: "your team is
 * within the capacity window" is a fact about the draw, not about what this device has looked
 * at. The three social dots used to live here too, each with a `raise` and a `clear` transition;
 * they are now derived from two timestamps and need neither.
 */
interface AlertFlags {
  upSoon: TeamUpSoonView;
}

const NOT_UP_SOON: TeamUpSoonView = { upSoon: false, gamesAway: null, fixtureId: null };
const QUIET: AlertFlags = { upSoon: NOT_UP_SOON };

/**
 * ADR-133 — one normaliser, because the snapshot and the frame are now the same type.
 *
 * It replaces the `teamUpSoon === true` coercion that used to guard the poll. The defence is
 * unchanged in spirit and wider in reach: an older server that still sends a bare `true` is not
 * an object, so it reads as quiet rather than as an up-soon with no fixture — which would have
 * been a toast that can never be floored and therefore fires on every reconnect for ever.
 */
function normaliseUpSoon(value: unknown): TeamUpSoonView {
  if (typeof value !== 'object' || value === null) return NOT_UP_SOON;
  const { upSoon, gamesAway, fixtureId } = value as Partial<TeamUpSoonView>;
  if (upSoon !== true) return NOT_UP_SOON;
  return {
    upSoon: true,
    gamesAway: typeof gamesAway === 'number' ? gamesAway : null,
    fixtureId: typeof fixtureId === 'string' ? fixtureId : null,
  };
}

/**
 * The fallback read, expressed as a snapshot — because that is exactly what it is.
 *
 * `/api/me/alerts` returns the same shape the stream opens with, so the poll applies it through the
 * same action the socket does and there is one place where "everything the shell knows" lands.
 */
function usePolledSnapshot(
  actions: StatusActions,
  mounted: RefObject<boolean>,
): () => Promise<void> {
  return useCallback(async () => {
    try {
      const alerts = await fetchAlerts();
      if (!mounted.current) return;
      // ADR-133 — `normaliseUpSoon` in `applySnapshot` does the hardening for both paths now.
      actions.applySnapshot(alerts);
    } catch {
      // A participant with no team, or a staff session, has nothing to light up. Not an error.
    }
  }, [actions, mounted]);
}

/**
 * The frame handlers as a plain function of the setters: no hooks, so no render-identity trap,
 * and every write to this store is visible in one place.
 *
 * The setters arrive as one record rather than as five positional parameters, because five
 * same-typed arguments in a row is a swap waiting to happen.
 */
interface StatusSetters {
  setFlags: Dispatch<SetStateAction<AlertFlags>>;
  setLive: Dispatch<SetStateAction<AnnouncementView[]>>;
  setFloor: Dispatch<SetStateAction<string | null>>;
  setWatermarks: Dispatch<SetStateAction<FeedMarks>>;
  setMarks: Dispatch<SetStateAction<FeedMarks>>;
}

function statusActions(setters: StatusSetters): StatusActions {
  const { setFlags, setLive, setFloor, setWatermarks, setMarks } = setters;
  return {
    applySnapshot: (snapshot) => {
      setFlags({ upSoon: normaliseUpSoon(snapshot.teamUpSoon) });
      /*
       * ADR-125 — the snapshot replaces the watermarks rather than merging them, for the same
       * reason it replaces the announcements: a feed whose newest message has just been hidden
       * has a LOWER watermark than before, and merging by maximum would keep a dot burning for
       * a line nobody can read any more.
       */
      setWatermarks(watermarksOf(snapshot.feeds));
      /*
       * The first-sight rule. A device that has never been seeded adopts these watermarks and
       * shows every LED dark, so a new phone is not greeted by three dots for a day it was not
       * there for. Seeded from the snapshot rather than at sign-in because this is the first
       * place the answer is in hand, and all four ways into a session pass through it.
       */
      setMarks(() => seedFeedMarks(watermarksOf(snapshot.feeds)));
      // Replaces, never merges: a retracted announcement must not survive a reconnect.
      setLive(() => snapshot.announcements);
      /*
       * ADR-082 — the first answer after sign-in is what "before I logged on" means.
       *
       * Seeded here rather than at the sign-in surface because this is the first place the list is in
       * hand, and there are four ways into a session (two sign-ins, a sign-up, a restored cookie) —
       * one seam serves all of them. The guard is `hasAnnouncementFloor()` and not `floor === null`: a
       * participant who arrives before anything has been announced has a null floor and must still
       * count as seeded, or every poll would re-seed and swallow the next announcement made.
       */
      if (!hasAnnouncementFloor())
        setFloor(seedAnnouncementFloor(snapshot.announcements));
    },
    addAnnouncement: (announcement) =>
      setLive((current) => withAnnouncement(current, announcement)),
    removeAnnouncement: (id) =>
      setLive((current) => current.filter((item) => item.id !== id)),
    applyUpSoon: (view) => setFlags((flags) => ({ ...flags, upSoon: normaliseUpSoon(view) })),
    /*
     * ADR-125 — a frame moves the feed's watermark forward and nothing else. Whether that is
     * news is the comparison's business, which is what stops a frame for a room somebody is
     * reading from lighting a dot that the room then has to race to clear.
     *
     * Forward only: a frame buffered across the snapshot read can legitimately arrive after a
     * newer one, and applying it blind would wind the watermark back.
     */
    /*
     * ADR-153 — assignment, not `Math.max`. Activity raises a mark because a frame that lands
     * after a reconnect must not drag it under the snapshot just loaded; a retraction states
     * the feed's new latest outright, because a hide genuinely lowers it and a monotonic merge
     * would discard exactly the frame that matters. The two share one server topic and one
     * synchronous emitter, so a retraction cannot overtake a message posted after it.
     */
    applyFeedRetraction: (feed, retraction) =>
      setWatermarks((current) => ({ ...current, [feed]: retraction.at })),
    applyFeedActivity: (feed, activity) =>
      setWatermarks((current) =>
        current[feed] !== null && current[feed] >= activity.at
          ? current
          : { ...current, [feed]: activity.at },
      ),
  };
}

/**
 * The feed block, normalised. A payload without one — an older server, a hand-rolled fixture —
 * reads as three empty feeds rather than taking the shell down with it, which is the same
 * defence the `teamUpSoon === true` coercion makes one field over. The dots sit on every
 * surface, so this hook is the last place that may throw.
 */
function watermarksOf(feeds: FeedMarks | undefined): FeedMarks {
  if (feeds === undefined) return NO_MARKS;
  return {
    chat: feeds.chat ?? null,
    teamChat: feeds.teamChat ?? null,
    gallery: feeds.gallery ?? null,
  };
}

function noop(): void {
  // The poll's stand-in while the stream is live. Nothing to do is the point.
}

/**
 * What a frame is allowed to do to this store, named by intent rather than by setter.
 *
 * ADR-125 — the invariant that used to be structural here (a frame may raise a dot but never
 * clear one) is now stronger than a naming convention: a frame cannot touch a dot at all. It
 * moves a watermark, and the dot is a comparison nobody on this list can reach.
 */
interface StatusActions {
  applySnapshot: (snapshot: StatusSnapshotView) => void;
  addAnnouncement: (announcement: AnnouncementView) => void;
  removeAnnouncement: (announcementId: string) => void;
  applyUpSoon: (view: TeamUpSoonView) => void;
  applyFeedActivity: (feed: FeedName, activity: FeedActivityView) => void;
  applyFeedRetraction: (feed: FeedName, retraction: FeedRetractionView) => void;
}

/**
 * Ordered by id because the server orders by id and the floor compares by id: an announcement
 * arriving out of order would be filtered against the wrong neighbours. Idempotent on id,
 * because a frame buffered across the snapshot read can legitimately arrive twice.
 */
function withAnnouncement(
  current: AnnouncementView[],
  announcement: AnnouncementView,
): AnnouncementView[] {
  if (current.some((item) => item.id === announcement.id)) return current;
  return [...current, announcement].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * ADR-121 — the frame handlers, built once so the socket is not rebuilt on every render.
 *
 * ADR-125 — the three activity frames carry a timestamp and move a watermark. A room that is
 * open cannot be lit by its own incoming message any more, and not because of a race it wins:
 * the surface rendering the message marks the feed read at the same watermark, so there is
 * nothing to clear.
 */
function useFrameHandlers(actions: StatusActions): StatusStreamInput {
  const session = useSessionOrNull();
  const viewer =
    session?.participant == null
      ? ('staff' as const)
      : ('participant' as const);
  return useMemo(
    () => ({
      viewer,
      onSnapshot: actions.applySnapshot,
      onAnnouncement: actions.addAnnouncement,
      onAnnouncementRetracted: actions.removeAnnouncement,
      // State, not an instruction: the frame says what is true and the LED follows it.
      onTeamUpSoon: actions.applyUpSoon,
      onFeedActivity: actions.applyFeedActivity,
      onFeedRetracted: actions.applyFeedRetraction,
      /*
       * ADR-132 — forwarded straight to the module store rather than held here. This hook
       * answers "does anything need attention"; a board does not, and keeping the payloads
       * out of its state is what stops a score on an unwatched court re-rendering every dot.
       */
      onFeedMatch: applyLiveMatch,
      onLeaderboard: applyLiveLeaderboard,
    }),
    [viewer, actions],
  );
}

/*
 * ADR-103 — mirror the two interrupt-worthy signals into browser notifications. The same
 * floor filter as the toast applies, so pre-sign-in history never buzzes anybody; the
 * per-id and edge-trigger dedup live in lib/notify, surviving this hook's remount on
 * every navigation.
 */
function useBrowserMirror(input: {
  live: AnnouncementView[];
  floor: string | null;
  teamUpSoon: boolean;
}): void {
  const { live, floor, teamUpSoon } = input;
  useEffect(() => {
    for (const announcement of live) {
      if (floor === null || announcement.id > floor) {
        notifyAnnouncement(announcement.id, announcement.body);
      }
    }
  }, [live, floor]);
  useEffect(() => notifyUpSoon({ isUpSoon: teamUpSoon }), [teamUpSoon]);
}
