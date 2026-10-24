import { emptyStates } from '@psd/contracts';
import type { AwardFeedEntryView, MatchView } from '@psd/contracts';
import { FeedTabs } from './FeedTabs.js';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatTime, matchResultLine } from '../lib/format.js';
import { useMatchFeed } from '../lib/hooks/useBoard.js';
import { useLiveList } from '../lib/hooks/useLiveList.js';

/**
 * S60 — shared match feed (F51). ADR-109: matches being played RIGHT NOW lead the list
 * with their start times; each row wears its state on a chip — LIVE (LED red), ENDED
 * (palm green), VOIDED (grey) — because "which of these is actually happening" should
 * survive sunlight and a three-second glance.
 *
 * ADR-114 — the chip says ENDED, not FINAL. In a knockout tournament "the final" is a
 * specific match, so a chip reading FINAL on every finished group game is reading the
 * wrong word to anyone scanning the feed for the actual final. ENDED describes the state
 * and cannot be mistaken for a round.
 */

type FeedState = 'live' | 'ended' | 'voided';

function stateOf(match: MatchView): FeedState {
  if (match.status === 'in_progress') return 'live';
  return match.isVoided ? 'voided' : 'ended';
}

const CHIP_LABEL: Record<FeedState, string> = {
  live: 'LIVE',
  ended: 'ENDED',
  voided: 'VOIDED',
};

function timeLineFor(match: MatchView, state: FeedState): string {
  if (state === 'live') return `Started ${formatTime(match.startedAt)}`;
  const ended = match.completedAt ? formatTime(match.completedAt) : formatTime(match.startedAt);
  return state === 'voided' ? `${ended} · does not count` : `Ended ${ended}`;
}

/**
 * ADR-114 — the score, for the people who are standing on the sideline watching it.
 *
 * 0 - 0 on a finished match means nobody tracked it, not that it ended goalless, so the
 * line is omitted rather than printing a result that never happened. A live match shows
 * 0 - 0 honestly: it has genuinely just kicked off.
 */
function scoreLineFor(match: MatchView, state: FeedState): string | null {
  if (state !== 'live' && match.scoreA === 0 && match.scoreB === 0) return null;
  return `${match.scoreA} - ${match.scoreB}`;
}

export function MatchFeedPage() {
  const feed = useMatchFeed();
  // New results slide in above the old ones rather than replacing the list (ADR-024).
  const feedList = useLiveList<HTMLUListElement>();
  if (feed.mode === 'dumb') return <DumbResults awards={feed.awards} isLoading={feed.isLoading} error={feed.error} />;
  // ADR-341 — a day that switched mid-way keeps both kinds of result on this tab.
  if (feed.mode === 'mixed') {
    return (
      <MixedResults
        awards={feed.awards}
        matches={feed.matches}
        isLoading={feed.isLoading}
        error={feed.error}
      />
    );
  }
  const isEmpty = feed.matches.length === 0;

  return (
    <GameboyShell title="MATCH FEED" subtitle="Captain's ball, live and final">
      <FeedTabs />
      <section className="gb-panel">
        <StateMessage
          isLoading={feed.isLoading}
          error={feed.error}
          isEmpty={isEmpty}
          emptyText={emptyStates.matchFeed}
          testId="match-feed"
        />
        <ul className="gb-list gb-list--ball" ref={feedList}>
          {feed.matches.map((match) => (
            <FeedRow key={match.id} match={match} />
          ))}
        </ul>
      </section>
    </GameboyShell>
  );
}

function FeedRow({ match }: { match: MatchView }) {
  const state = stateOf(match);
  const scoreLine = scoreLineFor(match, state);
  return (
    <li
      className={`gb-feed-row gb-feed-row--${state}`}
      data-testid="match-feed__row"
      data-live-key={match.id}
      // ADR-114 — the score is part of what "changed", so a point repaints the row.
      data-live-signature={`${match.status}|${match.winnerTeamName ?? ''}|${match.isVoided}|${match.scoreA}-${match.scoreB}`}
    >
      <div className="gb-row gb-row--between">
        <strong style={{ textDecoration: state === 'voided' ? 'line-through' : 'none' }}>
          {matchResultLine({
            teamAName: match.teamAName,
            teamBName: match.teamBName,
            winnerTeamName: match.winnerTeamName,
            status: match.status,
          })}
        </strong>
        <span className={`gb-chip gb-chip--${state}`} data-testid="match-feed__state">
          {CHIP_LABEL[state]}
        </span>
      </div>
      {scoreLine ? (
        <div className="gb-row">
          <span className="gb-score" data-testid="match-feed__score">
            {scoreLine}
          </span>
        </div>
      ) : null}
      <div className="gb-row gb-row--between">
        <span className="gb-hint" data-testid="match-feed__time">
          {timeLineFor(match, state)}
        </span>
        <span className="gb-badge">{match.courtLabel}</span>
      </div>
    </li>
  );
}

/**
 * ADR-321 — one award as the room says it: "Team XXX is awarded XXX points!", with the tier and the
 * time underneath and a struck line for an award that was taken back.
 */
function AwardRow({ award }: { award: AwardFeedEntryView }) {
  return (
    <li
      className={award.isVoided ? 'gb-feed-row gb-feed-row--voided' : 'gb-feed-row gb-feed-row--ended'}
      data-testid="match-feed__award-row"
      data-live-key={award.id}
      data-live-signature={`${award.isVoided}`}
    >
      <div className="gb-row gb-row--between">
        <strong style={{ textDecoration: award.isVoided ? 'line-through' : 'none' }}>
          {award.teamName} is awarded {award.points} points!
        </strong>
        <span
          className={award.isVoided ? 'gb-chip gb-chip--voided' : 'gb-chip gb-chip--ended'}
          data-testid="match-feed__state"
        >
          {award.isVoided ? 'VOIDED' : 'AWARDED'}
        </span>
      </div>
      <div className="gb-row gb-row--between">
        <span className="gb-hint" data-testid="match-feed__time">
          {award.tierLabel} · {formatTime(award.awardedAt)}
          {award.isVoided ? ' · does not count' : ''}
        </span>
      </div>
    </li>
  );
}

/**
 * ADR-321 — Results in dumb mode: nothing but award lines. There are no matches to narrate,
 * so each entry is the sentence the room actually says, with a struck line for an award taken back.
 */
function DumbResults(props: { awards: AwardFeedEntryView[]; isLoading: boolean; error: string | null }) {
  const feedList = useLiveList<HTMLUListElement>();
  return (
    <GameboyShell title="MATCH FEED" subtitle="Court awards, as they happen">
      <FeedTabs />
      <section className="gb-panel">
        <StateMessage
          isLoading={props.isLoading}
          error={props.error}
          isEmpty={props.awards.length === 0}
          emptyText={emptyStates.resultsDumbEmpty}
          testId="match-feed"
        />
        <ul className="gb-list gb-list--ball" ref={feedList}>
          {props.awards.map((award) => (
            <AwardRow key={award.id} award={award} />
          ))}
        </ul>
      </section>
    </GameboyShell>
  );
}

/**
 * ADR-341 (§7 option B) — Results on a day that switched.
 *
 * Awards lead, because that is what is happening now and what the room is waiting on. The matches
 * played before the switch follow, under their own heading, because deleting them from the tab would
 * tell a participant their morning did not happen. If a court is still finishing while the rest of
 * the room awards, its match is live here too and the heading says so rather than pretending
 * everything below it is over.
 */
function MixedResults(props: {
  awards: AwardFeedEntryView[];
  matches: MatchView[];
  isLoading: boolean;
  error: string | null;
}) {
  const feedList = useLiveList<HTMLUListElement>();
  const hasLive = props.matches.some((match) => match.status === 'in_progress');
  return (
    <GameboyShell title="MATCH FEED" subtitle="Court awards, and today's matches">
      <FeedTabs />
      <section className="gb-panel">
        <StateMessage
          isLoading={props.isLoading}
          error={props.error}
          isEmpty={props.awards.length === 0}
          emptyText={emptyStates.resultsDumbEmpty}
          testId="match-feed"
        />
        <ul className="gb-list gb-list--ball" ref={feedList}>
          {props.awards.map((award) => (
            <AwardRow key={award.id} award={award} />
          ))}
        </ul>
      </section>
      {props.matches.length === 0 ? null : (
        <section className="gb-panel" data-testid="match-feed__earlier">
          {/* ADR-336 §8 — the recorded divider: the one sentence that tells a participant the day
              changed shape, between the awards they are watching land and the matches they watched. */}
          <p className="gb-hint" data-testid="match-feed__switch-divider">
            Tournament switched to points award mode
          </p>
          <h2 className="gb-hint" data-testid="match-feed__earlier-heading">
            {hasLive ? 'Matches today' : 'Earlier: match results'}
          </h2>
          <ul className="gb-list gb-list--ball">
            {props.matches.map((match) => (
              <FeedRow key={match.id} match={match} />
            ))}
          </ul>
        </section>
      )}
    </GameboyShell>
  );
}
