import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { screenCopy } from '@psd/contracts';
import type {
  ClusterStandingView,
  FixtureView,
  GalleryPhotoView,
  IndividualStandingView,
  MatchView,
  ScreenSceneId,
  TournamentBracketView,
} from '@psd/contracts';
import { adoptScreenKey } from '../session/screenKeyStore.js';
import { applyLiveLeaderboard, applyLiveMatch } from '../live/boardLive.js';
import { useBracketBoard, useLeaderboard, useLineupBoard, useMatchFeed } from './useBoard.js';
import { useScreenDeck, type SceneInput } from './useScreenDeck.js';
import { useScreenHealth } from './useScreenHealth.js';
import { useScreenPhotos } from './useScreenPhotos.js';
import { useStatusStream } from './useStatusStream.js';
import { fetchScreenProfile } from '../api/screen.js';
import { useAsyncData, usePolling } from './useAsyncData.js';

/**
 * ADR-141 — everything the hall screen knows, assembled in one place.
 *
 * The page below this is deliberately thin: it turns frames into pixels and nothing else.
 * Which scenes exist, which of them have anything to say, and where the strip is pointed are
 * all decided here, where they can be tested without a projector.
 */

/** How long each scene holds before the strip moves on. Longer than a phone would need. */
const DWELL_MS = {
  board: 15_000,
  individuals: 12_000,
  onCourt: 12_000,
  finished: 12_000,
  upNext: 12_000,
  // Longer: a photograph is looked at, not read. Three of them at ten metres is about this.
  photosLatest: 14_000,
  photosTop: 14_000,
  /*
   * ADR-150 — the longest dwells on the strip, and deliberately so. These two are the only
   * scenes a room has to WORK OUT rather than read: finding your team in a group, then
   * tracing where it goes next, is several seconds of looking before the first fact lands.
   * A scoreboard rewards a glance; a bracket does not, and timing it like one would make it
   * decoration.
   */
  groups: 18_000,
  road: 18_000,
} as const;

/** How many rows a scene shows. Beyond this the text is too small to read from the back. */
const ROW_LIMIT = 6;

export interface HallScene extends SceneInput {
  /**
   * ADR-160 — narrowed from `SceneInput`'s plain string. These ids are stored on screen key
   * rows now, so a scene the console cannot name is a scene no key can ever enable; the type
   * is what stops one being added here and nowhere else.
   */
  id: ScreenSceneId;
  title: string;
}

/**
 * The key, taken out of the URL on the first render and kept (ADR-140).
 *
 * A projector reloads — a power blip, a browser update, someone closing the lid at lunch —
 * and there is nobody standing at it with the email containing the link. Reading the key once
 * and storing it is what makes the second load work at all.
 */
export function useScreenKey(): string | null {
  const [key] = useState(() => adoptScreenKey(window.location.search));
  useEffect(() => {
    /*
     * Having taken it, drop the key out of the address bar. A stuck slide with the URL
     * showing is otherwise a credential projected on a wall in front of the whole hall.
     */
    if (key !== null && window.location.search !== '') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [key]);
  return key;
}

const ignore = (): void => {};

/**
 * ADR-121/141 — the screen's own socket.
 *
 * The participant shell opens one of these from `useAlertsStore`; a projector is not inside
 * that shell, so without this the screen would be a page that polls every forty-five seconds
 * and announces a result some time in the following minute. The frames it keeps are the two
 * global ones — a finished match and the board behind it — which go into the same module
 * store the polled hooks already read from (ADR-132), so the scenes need no live plumbing of
 * their own.
 *
 * Everything addressed to a person is ignored rather than rendered: announcements are written
 * to a participant, and a hall screen repeating "your team is up next" to two hundred people
 * is noise with a stranger's name on it.
 */
function useScreenLive(): void {
  const handlers = useMemo(
    () => ({
      onSnapshot: ignore,
      onAnnouncement: ignore,
      onAnnouncementRetracted: ignore,
      onTeamUpSoon: ignore,
      onFeedActivity: ignore,
      // ADR-153 — the hall wall carries no unread dot, so a retraction is as moot as activity.
      onFeedRetracted: ignore,
      onFeedMatch: applyLiveMatch,
      onLeaderboard: applyLiveLeaderboard,
      viewer: 'screen' as const,
    }),
    [],
  );
  useStatusStream(handlers);
}

/**
 * ADR-141 — a result just landed, so go and look at it.
 *
 * Fires on a match becoming complete, never on the backlog: the ids present at the first
 * read are adopted silently. Without that, a projector restarted at four o'clock would dash
 * through an afternoon of finished matches the moment it came back, which is both wrong and
 * the single most visible kind of wrong this surface has.
 *
 * The deck's own 20 s floor decides whether the dash actually happens, which is why nothing
 * here tries to be clever about four courts finishing together.
 */
function useFinishedAlert(watch: {
  finished: readonly MatchView[];
  /** False until the first read has actually come back. */
  hasLoaded: boolean;
  alert: (sceneId: string) => void;
}): void {
  const { finished, hasLoaded, alert } = watch;
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    /*
     * The baseline is the first LOADED list, not the first render. Before the feed answers,
     * the list is empty for a reason that has nothing to do with the event — and adopting
     * that as the baseline makes the whole afternoon's results arrive as news a tenth of a
     * second later, which is the restart case this guard exists for.
     */
    if (!hasLoaded) return;
    const ids = new Set(finished.map((match) => match.id));
    const known = seen.current;
    seen.current = ids;
    if (known === null) return;
    const isNew = finished.some((match) => !known.has(match.id));
    if (isNew) alert('finished');
  }, [finished, hasLoaded, alert]);
}

interface ScenePopulation {
  hasPoints: boolean;
  individuals: number;
  onCourt: number;
  finished: number;
  upNext: number;
  /** ADR-150 — how many groups, and how many knockout rounds, the day's shape has. */
  groups: number;
  rounds: number;
  /** Counts of DECODED photos only — a scene with an undecoded image is not ready (ADR-143). */
  photosLatest: number;
  photosTop: number;
}

/**
 * ADR-160 — what this particular screen is allowed to show.
 *
 * Polled rather than read once at pairing time, because a projector runs for eight hours and
 * nobody is walking to the booth after a change. Until the first answer arrives the screen
 * shows everything, which is what every screen did before this existed: a slow read must
 * never be the reason a wall goes blank in front of a room.
 */
function useEnabledScenes(): ReadonlySet<ScreenSceneId> | null {
  const state = useAsyncData(useCallback(() => fetchScreenProfile(), []));
  usePolling(state.reload);
  const enabled = state.data?.enabledScenes;
  return useMemo(() => (enabled ? new Set(enabled) : null), [enabled]);
}

/**
 * ADR-160 — the running order, minus the scenes this key may not show.
 *
 * A disabled scene simply leaves the strip, which is exactly what happens to a scene with
 * nothing to say. The deck was already built to cope with a strip that changes shape
 * (ADR-141 adopts a new one at rest), so a superadmin unticking a box mid-event slides the
 * scene out at the next pause rather than cutting an animation in half.
 */
function useStripFor(population: ScenePopulation): HallScene[] {
  const all = useScenes(population);
  const enabled = useEnabledScenes();
  return useMemo(
    () => (enabled === null ? all : all.filter((scene) => enabled.has(scene.id))),
    [all, enabled],
  );
}

/** The strip's running order, and which of its frames currently have anything to say. */
function useScenes(population: ScenePopulation): HallScene[] {
  const { hasPoints, individuals, onCourt, finished, upNext } = population;
  const { groups, rounds, photosLatest, photosTop } = population;
  return useMemo(
    () => [
      { id: 'board', title: screenCopy.board, isReady: hasPoints, dwellMs: DWELL_MS.board },
      {
        id: 'individuals',
        title: screenCopy.individuals,
        // Points, not just people: a top-ten where everybody is on zero is a list of names
        // that happens to be sorted, and it reads as a scoreboard that is broken.
        isReady: hasPoints && individuals > 0,
        dwellMs: DWELL_MS.individuals,
      },
      {
        id: 'onCourt',
        title: screenCopy.onCourt,
        isReady: onCourt > 0,
        dwellMs: DWELL_MS.onCourt,
      },
      {
        id: 'finished',
        title: screenCopy.finished,
        isReady: finished > 0,
        dwellMs: DWELL_MS.finished,
      },
      { id: 'upNext', title: screenCopy.upNext, isReady: upNext > 0, dwellMs: DWELL_MS.upNext },
      /*
       * Placed after the live scenes, not before them. During play, what is happening now
       * outranks how the day is structured; before play there is nothing live to outrank
       * them and they are the only scenes with anything to say, so they carry the wall on
       * their own.
       */
      { id: 'groups', title: screenCopy.groups, isReady: groups > 0, dwellMs: DWELL_MS.groups },
      {
        id: 'road',
        title: screenCopy.road,
        /*
         * A round robin has no bracket — the table IS the road to the final — so the server
         * sends no rounds and this scene simply never appears. The strip adapts to the
         * format without knowing what a format is.
         */
        isReady: rounds > 0,
        dwellMs: DWELL_MS.road,
      },
      {
        id: 'photosLatest',
        title: screenCopy.photosLatest,
        isReady: photosLatest > 0,
        dwellMs: DWELL_MS.photosLatest,
      },
      {
        id: 'photosTop',
        title: screenCopy.photosTop,
        isReady: photosTop > 0,
        dwellMs: DWELL_MS.photosTop,
      },
    ],
    [hasPoints, individuals, onCourt, finished, upNext, groups, rounds, photosLatest, photosTop],
  );
}

/**
 * D-6 — a photo scene re-reads its listing as it LEAVES, never as it arrives.
 *
 * Leaving is the moment with a whole cycle of slack after it: the new batch has the rest of
 * the lap to decode, so the scene comes round complete instead of swapping photographs under
 * the room's eyes halfway through its own dwell. It also means a hide lands one visit later
 * at worst, which is the bound the live-photo decision was taken against.
 */
function useRefreshOnExit(scene: { id: string; currentId: string | null; refresh: () => void }) {
  const wasShowing = useRef(false);
  const { id, currentId, refresh } = scene;
  useEffect(() => {
    const isShowing = currentId === id;
    const hasJustLeft = wasShowing.current && !isShowing;
    wasShowing.current = isShowing;
    if (hasJustLeft) refresh();
  }, [id, currentId, refresh]);
}

/**
 * The three tournament lists the wall shows, cut from the one listing read.
 *
 * Out of the main hook because they are a different kind of statement — what counts as "on
 * court", what counts as a result — and because that hook is otherwise a list of the parts
 * the screen is assembled from.
 */
function useTournamentSlices(source: {
  fixtures: readonly FixtureView[];
  matches: readonly MatchView[];
}) {
  const { fixtures, matches } = source;
  // A fixture is only "on court now" once a facilitator has claimed it (ADR-089).
  const onCourt = useMemo(
    () => fixtures.filter((fixture) => fixture.status === 'claimed').slice(0, ROW_LIMIT),
    [fixtures],
  );
  const upNext = useMemo(
    () => fixtures.filter((fixture) => fixture.status === 'pending').slice(0, ROW_LIMIT),
    [fixtures],
  );
  /*
   * A voided match is one the superadmin decided did not happen (ADR-035). It keeps its row
   * in the audit and loses it here: a hall screen is the one surface where a result nobody is
   * counting is worse than no result, because the room reads it as the score.
   */
  const finished = useMemo(
    () =>
      matches
        .filter((match) => match.status === 'completed' && !match.isVoided)
        .slice(0, ROW_LIMIT),
    [matches],
  );
  return { onCourt, upNext, finished };
}

export interface HallScreenState {
  frames: readonly HallScene[];
  index: number;
  motion: ReturnType<typeof useScreenDeck>['motion'];
  slideMs: number;
  clusters: readonly ClusterStandingView[];
  individuals: readonly IndividualStandingView[];
  onCourt: readonly FixtureView[];
  finished: readonly MatchView[];
  upNext: readonly FixtureView[];
  photosLatest: readonly GalleryPhotoView[];
  photosTop: readonly GalleryPhotoView[];
  /** ADR-144 — the reads have been failing long enough that the wall must say so. */
  isStale: boolean;
  /** ADR-144 — when the leaderboard on screen was generated, for the board scene. */
  asOfLabel: string;
  /** ADR-150 — the day's shape: groups, and the road from them to the final. */
  bracket: TournamentBracketView | null;
}

/**
 * Only ever called once a key is in hand: the page MOUNTS this hook's component rather than
 * calling it and ignoring the result. An unkeyed projector that still polled would spend the
 * whole event collecting 401s from a wall nobody can fix without reloading it anyway.
 */
export function useHallScreen(): HallScreenState {
  /*
   * Called for what it does, not for what it returns. The boolean it hands back — is the
   * socket up — is deliberately not rendered: see `useScreenHealth` for why a live-connection
   * light would have been decoration at best and a false alarm at worst.
   */
  useScreenLive();
  const board = useLeaderboard(null);
  const lineups = useLineupBoard();
  const feed = useMatchFeed();

  const { onCourt, upNext, finished } = useTournamentSlices({
    fixtures: lineups.items,
    matches: feed.matches,
  });

  const draw = useBracketBoard();
  const latest = useScreenPhotos('newest');
  const top = useScreenPhotos('top');

  const scenes = useStripFor({
    hasPoints: board.hasAnyPoints,
    individuals: board.topIndividuals.length,
    onCourt: onCourt.length,
    finished: finished.length,
    upNext: upNext.length,
    groups: draw.bracket?.groups.length ?? 0,
    rounds: draw.bracket?.rounds.length ?? 0,
    photosLatest: latest.photos.length,
    photosTop: top.photos.length,
  });
  /*
   * ANY of the three tournament reads failing is enough, not all of them. Each one owns
   * scenes of its own, so a dead match feed freezes "JUST FINISHED" while the leaderboard
   * carries on updating beside it — and a wall that is two-thirds current is still lying
   * about the third. The ninety-second grace is what makes erring this way affordable.
   *
   * The gallery is excluded on purpose: a superadmin pausing the social surfaces (ADR-118)
   * makes both photo reads fail by design, and a wall that answered an intended pause with
   * "SCORES NOT UPDATING" would send an organiser hunting a fault they caused themselves —
   * about scores that are perfectly fine.
   */
  const isStale = useScreenHealth({
    isFailing: board.error !== null || lineups.error !== null || feed.error !== null,
  });

  const deck = useScreenDeck(scenes);
  useFinishedAlert({ finished, hasLoaded: !feed.isLoading, alert: deck.alert });

  const currentId = deck.frames[deck.index]?.id ?? null;
  useRefreshOnExit({ id: 'photosLatest', currentId, refresh: latest.refresh });
  useRefreshOnExit({ id: 'photosTop', currentId, refresh: top.refresh });

  return {
    frames: deck.frames,
    index: deck.index,
    motion: deck.motion,
    slideMs: deck.slideMs,
    bracket: draw.bracket,
    clusters: board.rows,
    individuals: board.topIndividuals,
    onCourt,
    finished,
    upNext,
    photosLatest: latest.photos,
    photosTop: top.photos,
    isStale,
    asOfLabel: board.updatedAtLabel,
  };
}
