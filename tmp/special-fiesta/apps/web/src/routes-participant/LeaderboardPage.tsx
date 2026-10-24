import { emptyStates } from '@psd/contracts';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { PixelMotif } from '../components/participant/PixelMotif.js';
import { AvatarPeek } from '../components/participant/AvatarPeek.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatPoints, formatRankLabel, roundPoints } from '../lib/format.js';
import { useLeaderboard } from '../lib/hooks/useBoard.js';
import { useLiveList } from '../lib/hooks/useLiveList.js';
import { useSession } from '../lib/session/context.js';

/** S5 — cluster leaderboard (F8/F9) with the individual top ten below it. */
export function LeaderboardPage() {
  const { session } = useSession();
  const viewerCluster = session?.participant?.clusterCode ?? null;
  const board = useLeaderboard(viewerCluster);
  // The rows stay put and move to their new places; they are never rebuilt (ADR-024).
  const clusterList = useLiveList<HTMLUListElement>();
  const individualList = useLiveList<HTMLUListElement>();

  return (
    <GameboyShell title="CLUSTER BOARD" subtitle={board.updatedAtLabel ? `Updated ${board.updatedAtLabel}` : undefined}>
      <section className="gb-panel">
        <h2>
          <PixelMotif name="trophy" size={20} className="" />
          All 18 clusters
        </h2>
        <StateMessage
          isLoading={board.isLoading}
          error={board.error}
          isEmpty={!board.hasAnyPoints}
          emptyText={emptyStates.clusterLeaderboard}
          testId="leaderboard"
        />
        <ul className="gb-list" ref={clusterList}>
          {board.rows.map((row) => (
            <li
              key={row.clusterCode}
              data-testid="leaderboard__row"
              data-live-key={row.clusterCode}
              data-live-signature={row.totalPoints}
            >
              <div className="gb-row gb-row--between">
                <span>
                  <span className="gb-badge gb-badge--rank">{formatRankLabel(row.rank)}</span>{' '}
                  <strong>{row.displayName}</strong>
                  {row.isViewerCluster ? (
                    <span className="gb-badge gb-badge--accent gb-badge--you">you</span>
                  ) : null}
                </span>
                <strong className="gb-points">{roundPoints(row.totalPoints)}</strong>
              </div>
              <div className="gb-bar" aria-hidden="true">
                <span style={{ width: `${row.sharePercent}%` }} />
              </div>
              <span className="gb-hint">
                Fringe {roundPoints(row.fringePoints)} · Tournament {roundPoints(row.tournamentPoints)} · {row.participantCount} players
                {row.tieNote === null ? null : (
                  <strong data-testid="leaderboard__tie-note"> · {row.tieNote}</strong>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="gb-panel">
        <h2>
          <PixelMotif name="face" size={20} className="" />
          Top scorers
        </h2>
        <ul className="gb-list" ref={individualList}>
          {board.topIndividuals.map((individual) => (
            <li
              key={individual.participantId}
              data-testid="leaderboard__individual"
              data-live-key={individual.participantId}
              data-live-signature={individual.totalPoints}
            >
              <div className="gb-row">
                <span className="gb-badge gb-badge--rank">{formatRankLabel(individual.rank)}</span>
                <AvatarPeek person={individual} size={32} />
                <span style={{ flex: 1 }}>
                  <strong>{individual.nickname}</strong>{' '}
                  <span className="gb-hint">{individual.clusterCode}</span>
                </span>
                <strong className="gb-points">{formatPoints(individual.totalPoints)}</strong>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </GameboyShell>
  );
}
