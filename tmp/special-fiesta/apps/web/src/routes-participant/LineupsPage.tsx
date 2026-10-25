import { emptyStates } from '@psd/contracts';
import type { FixtureView, UpSoonView } from '@psd/contracts';
import { FeedTabs } from './FeedTabs.js';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { useLineups } from '../lib/hooks/useBoard.js';
import { useLiveList } from '../lib/hooks/useLiveList.js';
import { pullHintFor, usePullToRefresh } from '../lib/hooks/usePullToRefresh.js';
import { formatTime } from '../lib/format.js';

/**
 * ADR-089 — the Line-ups tab: every unresolved fixture in play order, so a team knows
 * when it is up next without finding a facilitator. The viewer's own team is the one
 * thing they are scanning for, so its rows get the gold treatment — border, tint and a
 * YOUR TEAM badge — rather than a subtlety that sunlight would erase.
 */
export function LineupsPage() {
  const lineups = useLineups();
  // ADR-095 — settled fixtures leave the top of this list on every poll; without FLIP the
  // whole queue lurches up unanimated, on the one tab people watch while waiting to play.
  const fixtureList = useLiveList<HTMLUListElement>();
  // ADR-096 — drag the list down from the top and let go to ask "who plays next" NOW,
  // instead of waiting out the poll.
  const pull = usePullToRefresh<HTMLDivElement>(lineups.reload);
  const isDone = lineups.tournament !== null && lineups.items.length === 0;

  return (
    <GameboyShell title="MATCH FEED" subtitle="Who plays next">
      <FeedTabs />
      <div
        ref={pull.ref}
        data-testid="lineups__pull"
        style={{
          transform: `translateY(${pull.state.pullPx}px)`,
          transition: pull.state.pullPx === 0 ? 'transform 200ms ease-out' : 'none',
        }}
      >
      {pull.state.pullPx > 0 || pull.state.isRefreshing ? (
        <p className="gb-hint gb-pull__hint" role="status" data-testid="lineups__pull-hint">
          {pullHintFor(pull.state)}
        </p>
      ) : null}
      {lineups.viewerUpSoon ? (
        <UpSoonBanner upSoon={lineups.viewerUpSoon} items={lineups.items} />
      ) : null}
      <section className="gb-panel">
        <StateMessage
          isLoading={lineups.isLoading}
          error={lineups.error}
          isEmpty={lineups.items.length === 0}
          emptyText={lineups.mode === 'dumb' ? emptyStates.lineupsDumb : isDone ? emptyStates.lineupsDone : emptyStates.lineups}
          testId="lineups"
        />
        <ul className="gb-list gb-list--ball" ref={fixtureList}>
          {lineups.items.map((fixture, index) => (
            <LineupRow
              key={fixture.id}
              fixture={fixture}
              isNext={index === 0}
              myTeamId={lineups.myTeamId}
            />
          ))}
        </ul>
      </section>
      </div>
    </GameboyShell>
  );
}

function statusLabelFor(input: { fixture: FixtureView; isNext: boolean }): string {
  if (input.fixture.status === 'claimed') return 'In play now';
  return input.isNext ? 'Up next' : `#${input.fixture.sequence}`;
}

/**
 * ADR-111 — an unresolved seat names its feeder: "Winner of #7", not a mute TBD.
 *
 * ADR-137 — and the third-place match is fed by the two teams who LOST those fixtures, so it
 * says so. "Winner of #7" on that line would name the one team who certainly is not coming.
 */
function seatName(
  stage: FixtureView['stage'],
  teamName: string | null,
  fromSequence?: number | null,
): string {
  if (teamName !== null) return teamName;
  const outcome = stage === 'third_place' ? 'Loser' : 'Winner';
  return fromSequence ? `${outcome} of #${fromSequence}` : `${outcome} TBD`;
}

function detailLineFor(fixture: FixtureView): string {
  const stage = stageLabelFor(fixture);
  return fixture.suggestedCourtLabel ? `${stage} · ${fixture.suggestedCourtLabel}` : stage;
}

function stageLabelFor(fixture: FixtureView): string {
  if (fixture.stage === 'group') return `Group ${fixture.groupCode ?? ''}`;
  // ADR-137 — named, not numbered: "round 3" would make it look like a route to the trophy.
  if (fixture.stage === 'third_place') return 'Third-place match';
  return `Knockout · round ${fixture.roundNumber}`;
}

/**
 * ADR-091 — the "move now" banner. It only exists while the viewer's next fixture sits
 * inside the capacity window (as many queue positions as there are courts running), so
 * when it is on screen it always means the same thing: stop scrolling, start walking.
 * The LED dot is the nav's red alert, repeated here so the banner and the tab dot read
 * as one signal.
 */
function UpSoonBanner(props: { upSoon: UpSoonView; items: FixtureView[] }) {
  const fixture = props.items.find((item) => item.id === props.upSoon.fixtureId) ?? null;
  return (
    <div className="gb-upsoon" role="status" data-testid="lineups__upsoon">
      <span className="gb-upsoon__led" aria-hidden="true" />
      <div className="gb-upsoon__text">
        <strong>YOUR TEAM PLAYS SOON</strong>
        <span data-testid="lineups__upsoon-detail">{upSoonDetail(props.upSoon, fixture)}</span>
      </div>
    </div>
  );
}

function upSoonDetail(upSoon: UpSoonView, fixture: FixtureView | null): string {
  const court = fixture?.suggestedCourtLabel ? ` — head to ${fixture.suggestedCourtLabel}` : '';
  if (fixture?.status === 'claimed') return `Your match is in play now${court}!`;
  if (upSoon.gamesAway === 0) return `You are up next${court}!`;
  if (upSoon.gamesAway === 1) return `One match to go${court}. Stay close!`;
  return `${upSoon.gamesAway} matches to go${court}. Stay close!`;
}

function LineupRow(props: { fixture: FixtureView; isNext: boolean; myTeamId: string | null }) {
  const { fixture, isNext, myTeamId } = props;
  const isMine =
    myTeamId !== null && (fixture.teamAId === myTeamId || fixture.teamBId === myTeamId);

  return (
    <li
      className={isMine ? 'gb-lineup gb-lineup--mine' : 'gb-lineup'}
      data-testid={isMine ? 'lineups__row-mine' : 'lineups__row'}
      data-live-key={fixture.id}
      data-live-signature={`${fixture.status}|${fixture.teamAName ?? ''}|${fixture.teamBName ?? ''}|${fixture.suggestedCourtLabel ?? ''}|${fixture.estimatedStartAt ?? ''}|${isNext}`}
    >
      <div className="gb-row gb-row--between">
        <strong>
          {seatName(fixture.stage, fixture.teamAName, fixture.teamAFromSequence)} vs{' '}
          {seatName(fixture.stage, fixture.teamBName, fixture.teamBFromSequence)}
        </strong>
        <span className={fixture.status === 'claimed' ? 'gb-badge gb-badge--accent' : 'gb-badge'}>
          {statusLabelFor({ fixture, isNext })}
        </span>
      </div>
      <RowHint fixture={fixture} isMine={isMine} />
    </li>
  );
}

function RowHint({ fixture, isMine }: { fixture: FixtureView; isMine: boolean }) {
  return (
    <span className="gb-hint">
      {detailLineFor(fixture)}
      {/* ADR-109 — projected kick-off, simulated from live matches + the pacing config. */}
      {fixture.estimatedStartAt ? (
        <span className="gb-badge gb-badge--eta" data-testid="lineups__eta">
          ~{formatTime(fixture.estimatedStartAt)}
        </span>
      ) : null}
      {isMine ? (
        <span className="gb-badge gb-badge--accent gb-badge--you" data-testid="lineups__your-team">
          YOUR TEAM
        </span>
      ) : null}
    </span>
  );
}
