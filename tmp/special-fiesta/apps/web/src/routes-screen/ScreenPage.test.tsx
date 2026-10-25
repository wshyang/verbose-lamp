import { screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screenCopy } from '@psd/contracts';
import { STATUS_FEED_MATCH_EVENT } from '@psd/contracts';
import { installEventSourceStub, type EventSourceStub } from '../test-utils/eventSourceStub.js';
import { installFetchStub, type FetchStub } from '../test-utils/fetchStub.js';
import { resetLiveBoard } from '../lib/live/boardLive.js';
import { purgeAllCached } from '../lib/storage/cacheStore.js';
import { installImageStub, type ImageStub } from '../test-utils/imageStub.js';
import { resetImagePreload } from '../lib/photo/imagePreload.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { clearScreenKey } from '../lib/session/screenKeyStore.js';
import { ScreenFrame } from './ScreenFrame.js';
import { ScreenPage } from './ScreenPage.js';
import { screenRoutes } from '../test-utils/ambientRoutes.js';

/**
 * ADR-141 — the hall screen as a surface.
 *
 * `useScreenDeck.test.ts` owns the motion rules; this owns the three things only the page can
 * get wrong: that a projector with no key says so instead of showing a blank wall, that the
 * key leaves the address bar, and that a scene change is a *slide* — a transform on one track
 * — rather than a swap, which is the entire point of the design and the easiest thing to lose
 * in a later refactor.
 */

let stub: FetchStub;
let stream: EventSourceStub;
let images: ImageStub;

/** Move the clock one step and let React settle: a deck leg per flush, never several. */
async function tick(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

function match(over?: { id?: string; status?: string; isVoided?: boolean }) {
  return {
    id: 'm1',
    courtId: 'c1',
    courtLabel: 'Court 1',
    teamAId: 't1',
    teamAName: 'Reef Raiders',
    teamBId: 't2',
    teamBName: 'Dune Dogs',
    status: 'completed',
    scoreA: 21,
    scoreB: 18,
    winnerTeamId: 't1',
    winnerTeamName: 'Reef Raiders',
    startedByFacilitatorId: 'f1',
    startedByUsername: 'ref',
    startedAt: '2026-10-04T02:00:00.000Z',
    completedAt: '2026-10-04T02:20:00.000Z',
    winPointsSnapshot: 10,
    lossPointsSnapshot: 2,
    isVoided: false,
    lastEditedAt: null,
    editReason: null,
    ...over,
  };
}

function board(points: number) {
  return {
    generatedAt: '2026-10-04T02:00:00.000Z',
    clusters: [
      {
        clusterCode: 'CS',
        displayName: 'Coral Surge',
        totalPoints: points,
        fringePoints: points,
        tournamentPoints: 0,
        participantCount: 12,
        rank: 1,
        reachedAt: null,
      },
    ],
    topIndividuals: [
      {
        participantId: 'p1',
        nickname: 'BeachBoss',
        clusterCode: 'CS',
        gender: 'female',
        avatarVariant: 1,
        avatarLook: 'a',
        avatarPhotoId: null,
        title: 'Spiker',
        totalPoints: points,
        rank: 1,
        reachedAt: null,
      },
    ],
  };
}

function fixture(over?: {
  id?: string;
  status?: string;
  teamBName?: string | null;
  suggestedCourtLabel?: string | null;
}) {
  return {
    id: 'f1',
    stage: 'group',
    roundNumber: 1,
    groupCode: 'A',
    sequence: 1,
    teamAId: 't1',
    teamAName: 'Reef Raiders',
    teamBId: 't2',
    teamBName: 'Dune Dogs',
    suggestedCourtLabel: 'Court 2',
    status: 'claimed',
    resolvedWinnerTeamId: null,
    ...over,
  };
}

function photo(id: string) {
  return {
    id,
    caption: `caption ${id}`,
    uploaderType: 'participant',
    uploaderLabel: 'BeachBoss',
    uploaderParticipantId: 'p1',
    clusterCode: 'CS',
    width: 1200,
    height: 900,
    voteCount: 3,
    createdAt: '2026-10-04T02:00:00.000Z',
  };
}

/** ADR-150 — a shape read, with the knobs as the day's superadmin would have left them. */
function bracket(over?: {
  status?: string;
  teamCount?: number;
  advanceCount?: number;
  groups?: unknown[];
  rounds?: unknown[];
}) {
  return {
    status: 'planned',
    format: 'world_cup',
    teamCount: 6,
    groupSize: 3,
    advanceCount: 2,
    hasThirdPlace: false,
    groups: [
      { code: 'A', slots: [slot('Team 1'), slot('Team 2'), slot('Team 3')] },
      { code: 'B', slots: [slot('Team 4'), slot('Team 5'), slot('Team 6')] },
    ],
    rounds: [
      {
        label: 'Semi-finals',
        matches: [
          { fixtureId: null, a: seat('Winner A'), b: seat('2nd B') },
          { fixtureId: null, a: seat('Winner B'), b: seat('2nd A') },
        ],
      },
      {
        label: 'Final',
        matches: [{ fixtureId: null, a: seat('Winner SF1'), b: seat('Winner SF2') }],
      },
    ],
    ...over,
  };
}

function slot(label: string, over?: { rank?: number | null; isQualifying?: boolean }) {
  return {
    teamId: null,
    label,
    played: 0,
    wins: 0,
    draws: 0,
    rank: null,
    isQualifying: false,
    ...over,
  };
}

function seat(label: string, over?: { isWinner?: boolean }) {
  return { label, teamId: null, isWinner: false, ...over };
}

interface OpenOptions {
  key: string | null;
  points: number;
  items: unknown[];
  matches: unknown[];
  photos: unknown[];
  bracket: unknown;
  withStream: boolean;
  /** ADR-160 — null leaves the profile read failing, which the screen reads as "show all". */
  enabledScenes: string[] | null;
}

const DEFAULTS: OpenOptions = {
  key: 'scr-1',
  points: 40,
  items: [],
  matches: [],
  photos: [],
  bracket: null,
  withStream: false,
  enabledScenes: null,
};

function open(overrides?: Partial<OpenOptions>) {
  const options: OpenOptions = { ...DEFAULTS, ...overrides };
  stub = installFetchStub({
    ...screenRoutes(),
    'GET /api/auth/session': { status: 200, body: { session: null } },
    'GET /api/leaderboard': { status: 200, body: board(options.points) },
    'GET /api/tournament/lineups': {
      status: 200,
      body: { tournament: null, items: options.items, viewerUpSoon: null },
    },
    'GET /api/tournament/matches/feed': { status: 200, body: { items: options.matches } },
    'GET /api/tournament/bracket': { status: 200, body: { bracket: options.bracket } },
    'GET /api/gallery/photos': {
      status: 200,
      body: { photos: options.photos, myVoteIds: [], remainingUploads: 0 },
    },
    ...(options.enabledScenes === null
      ? {}
      : {
          'GET /api/status/screen': {
            status: 200,
            body: { label: 'Test screen', enabledScenes: options.enabledScenes },
          },
        }),
  });
  images = installImageStub();
  if (options.withStream) stream = installEventSourceStub();
  const search = options.key === null ? '' : `?key=${options.key}`;
  window.history.replaceState(null, '', `/screen${search}`);
  return renderWithProviders(<ScreenPage />, { path: '/screen' });
}

afterEach(() => {
  images?.restore();
  resetImagePreload();
  stream?.restore();
  resetLiveBoard();
  // ADR-112's device cache outlives a test: without this, one case's finished matches are
  // the next case's startup backlog — and a test that only passes in isolation is worse than
  // no test, because it fails later for a reason that has nothing to do with the change.
  purgeAllCached();
  clearScreenKey();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.useRealTimers();
});

describe('the hall screen', () => {
  it('asks for a key instead of projecting a blank wall', () => {
    open({ key: null });
    expect(screen.getByText(screenCopy.noKey)).toBeTruthy();
    // The deck was never mounted, so nothing it polls was asked for: an unkeyed screen must
    // not sit there collecting 401s every forty seconds from a wall nobody is watching.
    expect(stub.calls.filter((call) => call.path.includes('/api/leaderboard'))).toHaveLength(0);
    expect(stub.calls.filter((call) => call.path.includes('/api/tournament'))).toHaveLength(0);
  });

  it('takes the key out of the address bar — a projected URL is a projected credential', async () => {
    open();
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.queryByText(screenCopy.noKey)).toBeNull();
  });

  it('lays every scene out side by side on one track and moves the track', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open();

    // Wait for the whole strip — both scenes plus the trailing clone — rather than for the
    // first frame: a scene joining the strip re-lays it and restarts the dwell, so timing
    // from a half-built strip would be timing from the wrong moment.
    const track = await waitFor(() => {
      const found = document.querySelector('.screen__track');
      expect(found?.querySelectorAll('.screen__frame').length).toBe(3);
      return found as HTMLElement;
    });

    // At rest on the first frame, and the strip is one frame wider than the scene list: the
    // spare is the cloned first frame the cruise wraps onto.
    expect(track.style.transform).toBe('translateX(-0vw)');
    const frames = track.querySelectorAll('.screen__frame').length;
    expect(track.style.width).toBe(`${frames * 100}vw`);

    /*
     * One short tick first, so the last arriving read settles the strip: a scene joining
     * re-lays the row and restarts the dwell, and a test that straddled that moment would be
     * measuring the wrong clock and would fail about one run in three.
     */
    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });
    expect(track.style.transform).toBe('translateX(-0vw)');

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });

    // A scene change is a sideways scroll of the whole strip, not a swap of the panel: both
    // frames are still mounted, and only the transform moved.
    expect(track.style.transform).toBe('translateX(-100vw)');
    expect(track.className).toContain('screen__track--cruise');
    expect(track.querySelectorAll('.screen__frame').length).toBe(frames);
  });

  it('carries no controls at all — nobody is standing at a projector', async () => {
    open();
    await waitFor(() => expect(document.querySelector('.screen__track')).toBeTruthy());
    expect(document.querySelectorAll('button, input, select, textarea, a').length).toBe(0);
  });

  it('puts what is on court on the strip, and never a half-named fixture', async () => {
    open({
      items: [
        fixture(),
        // No court label either: an ad-hoc match that a facilitator claimed off-schedule.
        fixture({ id: 'f2', teamBName: null, suggestedCourtLabel: null }),
      ],
    });

    await waitFor(() => expect(screen.getByText(screenCopy.onCourt)).toBeTruthy());
    expect(screen.getByText('Court 2')).toBeTruthy();
    expect(screen.getByText(/Reef Raiders vs Dune Dogs/)).toBeTruthy();
    // A knockout seat whose team is not decided yet still renders as a row rather than as a
    // gap: the hall can see a court is busy even before it knows who is on it.
    expect(screen.getByText(/Reef Raiders vs —/)).toBeTruthy();
  });

  it('says it is waking rather than showing an empty strip before anything has happened', async () => {
    open({ points: 0, items: [] });

    // Nothing has points, nobody is on court, so every scene is empty and the strip has no
    // frames at all. A projector at 08:50 must still look switched on.
    await waitFor(() => expect(screen.getByText(screenCopy.waking)).toBeTruthy());
    expect(document.querySelectorAll('.screen__frame')).toHaveLength(1);
  });

  it('renders a scene it does not recognise as a quiet frame rather than crashing the wall', () => {
    // Belt and braces for the one failure a projector cannot recover from on its own: a
    // scene id the frame has no body for must leave the title standing, not throw and take
    // the whole screen to a blank page nobody in the hall can reload.
    renderWithProviders(
      <ScreenFrame
        sceneId="not-a-scene"
        title=""
        data={{
          clusters: [],
          individuals: [],
          onCourt: [],
          finished: [],
          upNext: [],
          bracket: null,
          photosLatest: [],
          photosTop: [],
          asOfLabel: '',
        }}
        isCurrent
      />,
    );
    // Titleless and bodyless, it still says something: a hall screen showing nothing at all
    // is indistinguishable from a projector somebody switched off.
    expect(screen.getByText(screenCopy.waking)).toBeTruthy();
  });

  it('shows what just finished, score and all, and what is up next', async () => {
    open({
      items: [
        fixture({ id: 'f9', status: 'pending', suggestedCourtLabel: 'Court 4' }),
        // An unscheduled seat: no court assigned yet, and still a row, because "who is next"
        // is the question the scene answers even before "where".
        fixture({ id: 'f10', status: 'pending', suggestedCourtLabel: null }),
      ],
      matches: [match()],
    });

    await waitFor(() => expect(screen.getByText(screenCopy.finished)).toBeTruthy());
    // ADR-114 — the score is the result, so the row needs no winner badge to be unambiguous.
    expect(screen.getByText('21–18')).toBeTruthy();
    expect(screen.getByText(screenCopy.upNext)).toBeTruthy();
    expect(screen.getByText('Court 4')).toBeTruthy();
  });

  it('leaves a voided match off the wall entirely', async () => {
    open({ matches: [match({ isVoided: true })] });

    await waitFor(() => expect(document.querySelector('.screen__track')).toBeTruthy());
    // ADR-035 — a voided match is one that officially did not happen. It keeps its row in the
    // audit; on a projector a result nobody is counting is worse than no result, because the
    // room reads whatever is on the wall as the score.
    expect(screen.queryByText(screenCopy.finished)).toBeNull();
    expect(screen.queryByText('21–18')).toBeNull();
  });

  it('dashes to a result the moment it lands, then comes back to where it was', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open({ matches: [], withStream: true });

    const track = await waitFor(() => {
      const found = document.querySelector('.screen__track');
      expect(found?.querySelectorAll('.screen__frame').length).toBe(3);
      return found as HTMLElement;
    });
    expect(track.style.transform).toBe('translateX(-0vw)');

    // A court finishes. The frame it belongs on does not even exist yet — the Just Finished
    // scene is empty until this very match arrives — which is the case the held alert exists
    // for (ADR-141).
    await act(async () => {
      stream.emitRaw(STATUS_FEED_MATCH_EVENT, JSON.stringify(match()));
      await Promise.resolve();
    });

    expect(track.dataset['motion']).toBe('dash');
    expect(track.style.transform).toBe('translateX(-200vw)');

    /*
     * One step per flush: each leg of the move schedules the next from an effect, and effects
     * only run when the act block ends. Advancing thirty seconds in one go would move the
     * clock past three timers that do not exist yet.
     */
    await tick(1_000); // the dash lands
    expect(track.dataset['motion']).toBe('rest');
    await tick(13_000); // it holds the result for that scene's dwell, then turns back
    expect(track.dataset['motion']).toBe('return');
    await tick(1_000);

    // Back on the frame the cycle was on — not at the start of the strip.
    expect(track.style.transform).toBe('translateX(-0vw)');
    expect(track.dataset['motion']).toBe('rest');
  });

  it('does not dash through the backlog when a projector is restarted mid-event', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open({ matches: [match(), match({ id: 'm2' })], withStream: true });

    const track = await waitFor(() => {
      const found = document.querySelector('.screen__track');
      expect(found?.querySelectorAll('.screen__frame').length).toBe(4);
      return found as HTMLElement;
    });

    // Every result of the afternoon is new to this page, and none of it is news to the hall.
    expect(track.style.transform).toBe('translateX(-0vw)');
    expect(track.dataset['motion']).toBe('rest');
  });

  it('keeps a photo scene off the strip until every image has decoded', async () => {
    open({ photos: [photo('p1'), photo('p2'), photo('p3')] });

    const track = await waitFor(() => {
      const found = document.querySelector('.screen__track');
      expect(found?.querySelectorAll('.screen__frame').length).toBeGreaterThan(1);
      return found as HTMLElement;
    });
    await waitFor(() => expect(images.requested.length).toBeGreaterThan(0));

    /*
     * The listing is in, the images are requested, and the photo scenes are still NOT on the
     * strip. This is the assertion the whole preload exists for: every frame is mounted at
     * once, so a scene admitted now would already be on the wall — a half-arrived photograph
     * three metres wide, which the slide would then scroll the room onto.
     */
    expect(track.querySelector('.screen__photos')).toBeNull();
    expect(screen.queryByText(screenCopy.photosLatest)).toBeNull();

    await act(async () => {
      images.settleAll();
    });

    await waitFor(() => expect(screen.getByText(screenCopy.photosLatest)).toBeTruthy());
    // Both photo scenes are on the strip now — the stub answers either sort with the same
    // three photographs — so count within the one frame rather than across the whole track.
    expect(track.querySelectorAll('[data-scene="photosLatest"] .screen__photo img')).toHaveLength(
      3,
    );
  });

  it('never projects a half-complete batch when one image fails', async () => {
    open({ photos: [photo('p1')] });
    await waitFor(() => expect(images.requested.length).toBeGreaterThan(0));

    await act(async () => {
      images.failAll();
    });

    // A hidden photo, a revoked key: either way the scene stays off the strip rather than
    // showing the wall a broken-image glyph with a caption under it.
    await waitFor(() => expect(document.querySelector('.screen__track')).toBeTruthy());
    expect(screen.queryByText(screenCopy.photosLatest)).toBeNull();
    expect(document.querySelector('.screen__photos')).toBeNull();
  });

  it('carries the screen key on the image URL, or the whole wall is broken glyphs', async () => {
    open({ photos: [photo('p1')] });
    await waitFor(() => expect(images.requested.length).toBeGreaterThan(0));

    // An <img> cannot send a header and a projector holds no cookie (ADR-140/143).
    expect(images.requested[0]).toContain('screen_key=scr-1');
  });

  it('re-reads the photo listing as the scene leaves, never holding a batch (D-6)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open({ photos: [photo('p1')] });

    await waitFor(() => expect(images.requested.length).toBeGreaterThan(0));
    await act(async () => {
      images.settleAll();
    });
    await waitFor(() => expect(screen.getByText(screenCopy.photosLatest)).toBeTruthy());
    const readsBefore = stub.calls.filter((call) => call.path.includes('sort=newest')).length;

    // Walk the cycle onto Just Shared and then off it again: board, top players, Just Shared.
    for (const dwellMs of [15_000, 12_000, 14_000]) {
      await tick(dwellMs);
      await tick(1_000);
    }

    /*
     * Photos are projected live (D-6), so the only thing between a reported photo and the
     * wall is how fast a hide takes effect. A deck that cached its batch would still be
     * holding that photo when the scene came round again; re-reading on the way OUT gives
     * the new batch a whole lap to decode before it is needed.
     */
    const readsAfter = stub.calls.filter((call) => call.path.includes('sort=newest')).length;
    expect(readsAfter).toBeGreaterThan(readsBefore);
  });

  /**
   * ADR-144 — the wall under failure. Every read is dead and the projector has nobody
   * standing at it; what the room sees must still be the best thing anyone can tell them.
   */
  it('keeps the last good scores up when every read dies, and never prints an error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open({ points: 40 });
    await waitFor(() => expect(screen.getAllByText('40').length).toBeGreaterThan(0));

    for (const route of ['GET /api/leaderboard', 'GET /api/tournament/lineups', 'GET /api/tournament/matches/feed']) {
      stub.routes[route] = { offline: true };
    }
    // Well past the slowest poll, so every one of the three has failed at least twice.
    await tick(200_000);

    // The scores are stale, and they are still the only information in the room. The string
    // every other surface in the app would show instead must not be anywhere near this one.
    expect(screen.getAllByText('40').length).toBeGreaterThan(0);
    expect(screen.queryByText(/went wrong/i)).toBeNull();
    expect(screen.queryByText(/failed|error/i)).toBeNull();
  });

  it('waits out the grace period before admitting the wall has stopped updating', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open({ points: 40 });
    await waitFor(() => expect(screen.getAllByText('40').length).toBeGreaterThan(0));
    expect(screen.queryByText(screenCopy.stale)).toBeNull();

    for (const route of ['GET /api/leaderboard', 'GET /api/tournament/lineups', 'GET /api/tournament/matches/feed']) {
      stub.routes[route] = { offline: true };
    }
    // Past the slowest poll, so the reads have certainly failed — but nowhere near ninety
    // seconds of failure, which is the only thing that earns the mark.
    await tick(76_000);
    expect(screen.queryByText(screenCopy.stale)).toBeNull();

    await tick(95_000);
    const mark = screen.getByText(screenCopy.stale);
    expect(mark).toBeTruthy();
    // Outside the filmstrip: a warning that slides off the wall with the next scene change
    // is a warning the one person who could act on it will never happen to be looking at.
    const track = document.querySelector('.screen__track');
    expect(track?.contains(mark)).toBe(false);
  });

  it('marks the wall when any one read dies, not only when all of them do', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open({ points: 40, matches: [match()] });
    await waitFor(() => expect(screen.getAllByText('40').length).toBeGreaterThan(0));

    // The leaderboard is fine; the results are not. Two-thirds of a current wall is still a
    // wall lying about the third, and "JUST FINISHED" is the scene the room checks.
    stub.routes['GET /api/tournament/matches/feed'] = { offline: true };
    await tick(76_000);
    await tick(95_000);

    expect(screen.getByText(screenCopy.stale)).toBeTruthy();
  });

  it('takes the mark down again when the reads come back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    open({ points: 40 });
    await waitFor(() => expect(screen.getAllByText('40').length).toBeGreaterThan(0));

    for (const route of ['GET /api/leaderboard', 'GET /api/tournament/lineups', 'GET /api/tournament/matches/feed']) {
      stub.routes[route] = { offline: true };
    }
    /*
     * Two legs, not one jump: the countdown is only armed once React has re-rendered with a
     * failing read, and a single `advanceTimersByTime` runs every timer that already exists
     * before that render ever happens. One jump would arm the ninety seconds at the end of
     * the leap and then stop the clock.
     */
    await tick(76_000);
    await tick(95_000);
    expect(screen.getByText(screenCopy.stale)).toBeTruthy();

    stub.routes['GET /api/leaderboard'] = { status: 200, body: board(55) };
    stub.routes['GET /api/tournament/lineups'] = {
      status: 200,
      body: { tournament: null, items: [], viewerUpSoon: null },
    };
    stub.routes['GET /api/tournament/matches/feed'] = { status: 200, body: { items: [] } };
    await tick(80_000);

    await waitFor(() => expect(screen.queryByText(screenCopy.stale)).toBeNull());
  });

  it('says when the board on the wall was generated', async () => {
    open({ points: 40 });

    // A room that can see the board was built at 14:32 can judge its own freshness, which is
    // the one thing no indicator light can do for it.
    await waitFor(() =>
      expect(screen.getAllByText(new RegExp(`^${screenCopy.asOf} .+`)).length).toBeGreaterThan(0),
    );
  });
});

/**
 * ADR-150 — the two shape scenes. These are the only frames on the strip a room has to WORK
 * OUT rather than read, so what is tested here is not that the data arrived but that the
 * picture is legible from the back of the hall: the boxes are boxes, the advancing places
 * are marked, and nothing is blank where the room would read a missing team.
 */
describe('the shape of the day on the wall', () => {
  it('draws the groups as separate boxes, not as one long list', async () => {
    open({ bracket: bracket() });

    const groups = await waitFor(() => {
      const found = document.querySelector('[data-scene="groups"]');
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    // Two boxes, each with its own code and its own three rows: the shape IS the content.
    expect(groups.querySelectorAll('.screen__group')).toHaveLength(2);
    expect(groups.querySelector('[data-group="A"]')?.textContent).toContain('Team 2');
    expect(groups.querySelector('[data-group="B"]')?.textContent).toContain('Team 5');
    expect(groups.querySelectorAll('[data-group="B"] .screen__group-row')).toHaveLength(3);
  });

  it('counts the teams enrolled while the draw has not happened', async () => {
    open({ bracket: bracket() });

    // The one number the room is actually tracking at 08:50, and it turns a board of
    // "Team 4" placeholders into a statement about the day rather than a screen waiting.
    await waitFor(() => expect(screen.getByText(`6 ${screenCopy.enrolled}`)).toBeTruthy());
  });

  it('drops the enrolment count once the draw is real', async () => {
    // Teams have been drawn, so the count is no longer what anybody is watching, and a
    // scene still shouting it is a scene that has not noticed the day moved on.
    open({ bracket: bracket({ status: 'group_stage' }) });

    await waitFor(() => expect(document.querySelector('[data-scene="groups"]')).toBeTruthy());
    expect(screen.queryByText(`6 ${screenCopy.enrolled}`)).toBeNull();
  });

  it('marks the advancing places so a team can see whether it is going through', async () => {
    open({
      bracket: bracket({
        status: 'group_stage',
        groups: [
          {
            code: 'A',
            slots: [
              { ...slot('Reef Raiders'), played: 2, wins: 2, rank: 1, isQualifying: true },
              { ...slot('Dune Dogs'), played: 2, wins: 1, rank: 2, isQualifying: true },
              { ...slot('Kelp Kings'), played: 2, wins: 0, rank: 3, isQualifying: false },
            ],
          },
        ],
      }),
    });

    const groups = await waitFor(() => {
      const found = document.querySelector('[data-scene="groups"]');
      expect(found?.querySelectorAll('.screen__group-row').length).toBe(3);
      return found as HTMLElement;
    });
    const marked = [...groups.querySelectorAll('[data-qualifying="yes"]')].map(
      (row) => row.textContent,
    );
    expect(marked).toHaveLength(2);
    expect(marked.join(' ')).toContain('Reef Raiders');
    expect(marked.join(' ')).toContain('Dune Dogs');
    // And the scene says how many go through, so the mark needs no legend.
    expect(groups.textContent).toContain(`TOP 2 ${screenCopy.advances}`);
  });

  /*
   * ADR-156 — the board used to print only a W count, so a team on two wins and a draw and a
   * team on two wins and a loss were the same three characters at ten metres.
   */
  it('shows a group record with its draws, and omits the D when there are none', async () => {
    open({
      bracket: bracket({
        status: 'group_stage',
        groups: [
          {
            code: 'A',
            slots: [
              { ...slot('Reef Raiders'), played: 3, wins: 2, draws: 1, rank: 1 },
              { ...slot('Dune Dogs'), played: 3, wins: 2, draws: 0, rank: 2 },
              { ...slot('Kelp Kings'), played: 0, wins: 0, draws: 0, rank: 3 },
            ],
          },
        ],
      }),
    });

    const groups = await waitFor(() => {
      const found = document.querySelector('[data-scene="groups"]');
      expect(found?.querySelectorAll('.screen__group-row').length).toBe(3);
      return found as HTMLElement;
    });
    const records = [...groups.querySelectorAll('.screen__group-record')].map(
      (cell) => cell.textContent,
    );
    // A draw is reported, a record without one is not padded, and nobody who has
    // not played is given a record at all.
    expect(records).toEqual(['2W 1D', '2W', '']);
  });

  it('draws the road to the final as one column per round, ending in a single tie', async () => {
    open({ bracket: bracket() });

    const road = await waitFor(() => {
      const found = document.querySelector('[data-scene="road"]');
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    expect([...road.querySelectorAll('.screen__round-label')].map((node) => node.textContent)).toEqual(
      ['Semi-finals', 'Final'],
    );
    expect(road.querySelectorAll('[data-round="Final"] .screen__tie')).toHaveLength(1);
    // Every seat says what will fill it. A blank box reads as a team that failed to load.
    const seats = [...road.querySelectorAll('.screen__seat')];
    expect(seats).toHaveLength(6);
    expect(seats.every((node) => (node.textContent ?? '').trim() !== '')).toBe(true);
    expect(road.textContent).toContain('Winner A');
  });

  it('leaves the loser of a tie as readable as the winner', async () => {
    open({
      bracket: bracket({
        status: 'knockout',
        rounds: [
          {
            label: 'Final',
            matches: [
              {
                fixtureId: 'f-final',
                a: seat('Reef Raiders', { isWinner: true }),
                b: seat('Dune Dogs'),
              },
            ],
          },
        ],
      }),
    });

    const road = await waitFor(() => {
      const found = document.querySelector('[data-scene="road"]');
      expect(found?.querySelectorAll('.screen__seat').length).toBe(2);
      return found as HTMLElement;
    });
    const [winner, loser] = [...road.querySelectorAll('.screen__seat')];
    expect(winner?.getAttribute('data-winner')).toBe('yes');
    /*
     * The loser carries no mark of its own — no `data-loser`, nothing for a stylesheet to
     * hang a strike-through on. The room scanning for its team must find that name in the
     * same place and the same weight whether the match went its way or not.
     */
    expect(loser?.getAttribute('data-winner')).toBe('no');
    expect(loser?.className).toBe('screen__seat');
  });

  it('keeps the road off the strip entirely when the format has no knockout', async () => {
    // A round robin: the table IS the road to the final, and the server says so by sending
    // no rounds at all. The strip adapts to the tournament rather than showing an empty box.
    open({
      bracket: bracket({ status: 'group_stage', advanceCount: 0, rounds: [] }),
    });

    await waitFor(() => expect(document.querySelector('[data-scene="groups"]')).toBeTruthy());
    expect(document.querySelector('[data-scene="road"]')).toBeNull();
    // With nobody advancing there is no "TOP n" footnote either: a mark with no meaning.
    expect(screen.queryByText(new RegExp(screenCopy.advances))).toBeNull();
  });

  it('shows neither scene before a shape exists', async () => {
    // 08:40, nothing configured. The shape scenes are absent rather than empty.
    open({ bracket: null, points: 40 });

    await waitFor(() => expect(document.querySelector('.screen__track')).toBeTruthy());
    expect(document.querySelector('[data-scene="groups"]')).toBeNull();
    expect(document.querySelector('[data-scene="road"]')).toBeNull();
  });
});

/**
 * ADR-160 — a key that shows only some of the nine scenes.
 *
 * The filter had to go somewhere the deck already understood, and it did: a scene the key
 * may not show leaves the strip exactly as a scene with nothing to say does. These assert
 * that from the outside — by counting frames on the track — because that is the only place
 * the room can see the difference.
 */
describe('a screen key that shows only some scenes (ADR-160)', () => {
  it('lays out only the scenes its key allows', async () => {
    open({ enabledScenes: ['board'] });

    const track = await waitFor(() => {
      const found = document.querySelector('.screen__track');
      // One real frame plus the trailing clone the wrap slides onto.
      expect(found?.querySelectorAll('.screen__frame').length).toBe(2);
      return found as HTMLElement;
    });
    expect(track).toBeTruthy();
  });

  /*
   * The fallback is the one that must not be got wrong: a slow or failing profile read must
   * never be the reason a wall goes blank in front of a room. Until the first answer lands,
   * the screen shows everything — which is what every screen did before this existed.
   */
  it('shows everything while the profile read has not answered', async () => {
    open({ enabledScenes: null });

    await waitFor(() => {
      const found = document.querySelector('.screen__track');
      expect(found?.querySelectorAll('.screen__frame').length).toBe(3);
    });
  });
});
