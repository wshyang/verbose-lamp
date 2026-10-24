import { screenCopy } from '@psd/contracts';
import type {
  BracketGroupView,
  BracketSlotView,
  BracketRoundView,
  BracketSeatView,
  ClusterStandingView,
  FixtureView,
  GalleryPhotoView,
  IndividualStandingView,
  MatchView,
  TournamentBracketView,
} from '@psd/contracts';
import { roundPoints } from '../lib/format.js';
import { galleryImageUrl } from '../lib/photo/galleryUrls.js';

/**
 * ADR-141 — one frame of the filmstrip.
 *
 * Every scene is the same shape — a title and a list of rows — on purpose. The room's eye is
 * re-finding its place after every slide, and three differently-arranged layouts would make
 * that work harder than reading the numbers does.
 */

export interface SceneData {
  clusters: readonly ClusterStandingView[];
  individuals: readonly IndividualStandingView[];
  onCourt: readonly FixtureView[];
  finished: readonly MatchView[];
  upNext: readonly FixtureView[];
  photosLatest: readonly GalleryPhotoView[];
  photosTop: readonly GalleryPhotoView[];
  asOfLabel: string;
  /** ADR-150 — the day's shape, or null before the first read answers. */
  bracket: TournamentBracketView | null;
}

function seatName(name: string | null): string {
  return name ?? '—';
}

function BoardRows(props: { clusters: readonly ClusterStandingView[] }) {
  return (
    <ul className="screen__rows">
      {props.clusters.map((row) => (
        <li className="screen__row" key={row.clusterCode}>
          <span className="screen__rank">{row.rank}</span>
          <span className="screen__name">{row.displayName}</span>
          <strong className="screen__points">{roundPoints(row.totalPoints)}</strong>
        </li>
      ))}
    </ul>
  );
}

function IndividualRows(props: { individuals: readonly IndividualStandingView[] }) {
  return (
    <ul className="screen__rows">
      {props.individuals.map((row) => (
        <li className="screen__row" key={row.participantId}>
          <span className="screen__rank">{row.rank}</span>
          <span className="screen__name">{row.nickname}</span>
          <strong className="screen__points">{roundPoints(row.totalPoints)}</strong>
        </li>
      ))}
    </ul>
  );
}

function CourtRows(props: { fixtures: readonly FixtureView[] }) {
  return (
    <ul className="screen__rows">
      {props.fixtures.map((fixture) => (
        <li className="screen__row" key={fixture.id}>
          <span className="screen__rank">{fixture.suggestedCourtLabel ?? ''}</span>
          <span className="screen__name">
            {seatName(fixture.teamAName)} vs {seatName(fixture.teamBName)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * ADR-114 — the score IS the result: the team with more points won, so the line needs no
 * separate winner badge and cannot disagree with itself.
 */
function FinishedRows(props: { matches: readonly MatchView[] }) {
  return (
    <ul className="screen__rows">
      {props.matches.map((match) => (
        <li className="screen__row" key={match.id}>
          <span className="screen__name">
            {match.teamAName} vs {match.teamBName}
          </span>
          <strong className="screen__points">
            {match.scoreA}–{match.scoreB}
          </strong>
        </li>
      ))}
    </ul>
  );
}

function UpNextRows(props: { fixtures: readonly FixtureView[] }) {
  return (
    <ul className="screen__rows">
      {props.fixtures.map((fixture) => (
        <li className="screen__row" key={fixture.id}>
          <span className="screen__rank">{fixture.suggestedCourtLabel ?? ''}</span>
          <span className="screen__name">
            {seatName(fixture.teamAName)} vs {seatName(fixture.teamBName)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * ADR-150 — the groups, as a board rather than as a list.
 *
 * Every other scene on this strip is a single column of rows, because every other scene
 * answers a question with an ORDER — who is winning, what finished. This one answers a
 * question with a SHAPE: which four names are in the same box as mine. Laying it out as one
 * long list would destroy the only fact it exists to carry, so this is the one place the
 * strip's house style is broken on purpose.
 */
function GroupBoards(props: { bracket: TournamentBracketView }) {
  const { bracket } = props;
  return (
    <div className="screen__groups" data-group-count={bracket.groups.length}>
      {bracket.groups.map((group) => (
        <GroupCard key={group.code} group={group} advanceCount={bracket.advanceCount} />
      ))}
    </div>
  );
}

/**
 * ADR-156 — "2W" at ten metres, and "2W 1D" only when there is a draw to report.
 *
 * The board has room for one short record per team and no room for a legend, so it says the
 * fewest characters that cannot be misread. Dropping the D would make two teams on "2W" look
 * level when one of them has a point the other does not; printing "0D" for everybody would
 * spend the width on nothing on the days the format has no draws in it.
 */
function groupRecord(slot: BracketSlotView): string {
  if (slot.played === 0) return '';
  return slot.draws > 0 ? `${slot.wins}W ${slot.draws}D` : `${slot.wins}W`;
}

function GroupCard(props: { group: BracketGroupView; advanceCount: number }) {
  const { group, advanceCount } = props;
  return (
    <section className="screen__group" data-group={group.code}>
      <h2 className="screen__group-code">Group {group.code}</h2>
      <ul className="screen__group-rows">
        {props.group.slots.map((slot, index) => (
          <li
            key={slot.teamId ?? `slot-${index}`}
            className="screen__group-row"
            /*
             * Driven off a data attribute rather than a class so the stylesheet owns the
             * whole look of "this team is going through". At ten metres the difference has
             * to be a block of colour, not a bold weight, and that is a decision for CSS.
             */
            data-qualifying={slot.isQualifying ? 'yes' : 'no'}
          >
            <span className="screen__group-rank">{slot.rank ?? '·'}</span>
            <span className="screen__name">{slot.label}</span>
            <span className="screen__group-record">{groupRecord(slot)}</span>
          </li>
        ))}
      </ul>
      {advanceCount > 0 ? (
        <p className="screen__group-foot">
          TOP {advanceCount} {screenCopy.advances}
        </p>
      ) : null}
    </section>
  );
}

/**
 * ADR-150 — the bracket: rounds as columns, left to right, ending in one box.
 *
 * Read as a graph, not as a table. The connectors are drawn in CSS from each match box
 * rather than in SVG, because the whole point is that the picture survives whatever number
 * of teams turned up — an SVG would need a layout pass and a viewBox computed from a count
 * nobody knows until the morning, and would be the first thing to break when nine teams
 * enrol instead of eight.
 */
function BracketGraph(props: { bracket: TournamentBracketView }) {
  return (
    <div className="screen__bracket" data-round-count={props.bracket.rounds.length}>
      {props.bracket.rounds.map((round) => (
        <BracketColumn key={round.label} round={round} />
      ))}
    </div>
  );
}

function BracketColumn(props: { round: BracketRoundView }) {
  return (
    <section className="screen__round" data-round={props.round.label}>
      <h2 className="screen__round-label">{props.round.label}</h2>
      <ul className="screen__round-matches">
        {props.round.matches.map((match, index) => (
          <li className="screen__tie" key={match.fixtureId ?? `${props.round.label}-${index}`}>
            <BracketSeat seat={match.a} />
            <BracketSeat seat={match.b} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One name in the bracket. A seat that has won is marked and the loser is NOT struck
 * through or greyed: a room scanning for a team it cares about should find it in the same
 * place whether it won or lost, and dimming the loser makes the wall harder to read for
 * exactly the people most interested in that line.
 */
function BracketSeat(props: { seat: BracketSeatView }) {
  return (
    <span
      className="screen__seat"
      data-winner={props.seat.isWinner ? 'yes' : 'no'}
    >
      {props.seat.label}
    </span>
  );
}

/**
 * ADR-143 — every one of these has already been fetched and decoded before the scene was
 * allowed onto the strip, so this renders paint-ready bytes. `loading="eager"` says so out
 * loud: the browser's lazy heuristics are written for a page you scroll, and on a strip that
 * is translated rather than scrolled they would hold back the very images that are about to
 * slide into view.
 */
function PhotoTiles(props: { photos: readonly GalleryPhotoView[] }) {
  return (
    <ul className="screen__photos">
      {props.photos.map((photo) => (
        <li className="screen__photo" key={photo.id}>
          <img
            src={galleryImageUrl(photo.id, 'thumb')}
            alt={photo.caption}
            loading="eager"
            decoding="sync"
          />
          <span className="screen__caption">{photo.caption}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * ADR-144 — the two scenes drawn from the leaderboard say when it was generated.
 *
 * It is the cheapest possible honesty on a projected scoreboard: a room that can see the
 * board was built at 14:32 can judge for itself whether 14:32 is recent, which no indicator
 * light can tell it. It is also the one thing that keeps working when the wall itself has
 * lost the ability to notice that it is stuck — the time simply stops advancing, in public.
 */
function SceneSubtitle(props: { sceneId: string; data: SceneData }) {
  /*
   * ADR-150 — the group scene carries the enrolment count instead of a timestamp, and only
   * while nothing has been drawn. It is the one number the room is actually tracking during
   * registration, and it turns an empty-looking board of "Team 7" placeholders into a
   * statement about the day rather than a screen waiting for data.
   */
  if (props.sceneId === 'groups') {
    const bracket = props.data.bracket;
    if (bracket === null || bracket.status !== 'planned') return null;
    return (
      <p className="screen__subtitle">
        {bracket.teamCount} {screenCopy.enrolled}
      </p>
    );
  }
  const isBoardScene = props.sceneId === 'board' || props.sceneId === 'individuals';
  if (!isBoardScene || props.data.asOfLabel === '') return null;
  return (
    <p className="screen__subtitle">
      {screenCopy.asOf} {props.data.asOfLabel}
    </p>
  );
}

function SceneBody(props: { sceneId: string; data: SceneData }) {
  if (props.sceneId === 'board') return <BoardRows clusters={props.data.clusters} />;
  if (props.sceneId === 'individuals')
    return <IndividualRows individuals={props.data.individuals} />;
  if (props.sceneId === 'onCourt') return <CourtRows fixtures={props.data.onCourt} />;
  if (props.sceneId === 'finished') return <FinishedRows matches={props.data.finished} />;
  if (props.sceneId === 'upNext') return <UpNextRows fixtures={props.data.upNext} />;
  if (props.sceneId === 'groups')
    return props.data.bracket === null ? null : <GroupBoards bracket={props.data.bracket} />;
  if (props.sceneId === 'road')
    return props.data.bracket === null ? null : <BracketGraph bracket={props.data.bracket} />;
  if (props.sceneId === 'photosLatest') return <PhotoTiles photos={props.data.photosLatest} />;
  if (props.sceneId === 'photosTop') return <PhotoTiles photos={props.data.photosTop} />;
  return null;
}

export function ScreenFrame(props: {
  sceneId: string;
  title: string;
  data: SceneData;
  isCurrent: boolean;
}) {
  return (
    <section
      className="screen__frame"
      data-scene={props.sceneId}
      /*
       * `aria-hidden` on everything off-frame: a strip is a row of real, rendered panels, and
       * without this a screen reader would read all of them as one page. Nobody is driving
       * this surface with a reader, but the hall screen may be mirrored onto a laptop that is.
       */
      aria-hidden={!props.isCurrent}
    >
      <h1 className="screen__title">{props.title || screenCopy.waking}</h1>
      <SceneSubtitle sceneId={props.sceneId} data={props.data} />
      <SceneBody sceneId={props.sceneId} data={props.data} />
    </section>
  );
}
