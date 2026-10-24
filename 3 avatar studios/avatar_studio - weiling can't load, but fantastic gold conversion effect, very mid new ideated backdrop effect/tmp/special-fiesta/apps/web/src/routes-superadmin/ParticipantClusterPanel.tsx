import { useState } from 'react';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { useAdminClusters } from '../lib/hooks/useAdminClusters.js';
import { useParticipantClusterMove } from '../lib/hooks/useParticipantClusterMove.js';

/**
 * ADR-172 — correcting one participant's cluster, from the person rather than the catalogue.
 *
 * The bulk move on the clusters page exists to empty a cluster so it can be retired. This is
 * the other half: somebody mis-tapped at signup, which is the most ordinary mistake of the day,
 * and the only place anyone will think to look for the fix is the participant they are already
 * looking at.
 *
 * fds.md §2.1 calls a participant's cluster immutable post-signup. This is the deliberate
 * exception, and it is held to the same freeze as the bulk move, for the same reason: the
 * leaderboard groups on this column, so after scoring a correction would move points that have
 * already been counted.
 */
export function ParticipantClusterPanel({
  participantId,
  clusterCode,
  onMoved,
}: {
  participantId: string;
  clusterCode: string;
  onMoved: () => void;
}) {
  const catalogue = useAdminClusters();
  const move = useParticipantClusterMove(participantId, onMoved);
  const [target, setTarget] = useState('');

  const options = catalogue.clusters.filter(
    (cluster) => !cluster.isRetired && cluster.code !== clusterCode,
  );
  const selected = target || (options[0]?.code ?? '');

  return (
    <section className="console-panel">
      <h2>Cluster</h2>
      <p>
        Currently <strong data-testid="participant-detail__cluster">{clusterCode}</strong>.
      </p>

      {catalogue.scoringStarted ? (
        <p className="console-danger" data-testid="participant-detail__cluster-locked">
          Scoring has started, so this can no longer be changed. Their points are counted under
          the cluster they are in, and moving them now would move every point they have already
          earned.
        </p>
      ) : (
        <div className="console-row">
          <ConsoleField id="participant-cluster" label="Move to" topic="participantClusterMove">
          <select
            id="participant-cluster"
            className="console-input"
            data-testid="participant-detail__cluster-target"
            value={selected}
            onChange={(event) => setTarget(event.target.value)}
          >
            {options.map((cluster) => (
              <option key={cluster.code} value={cluster.code}>
                {cluster.displayName}
              </option>
            ))}
          </select>
          </ConsoleField>
          <button
            type="button"
            className="console-button"
            data-testid="participant-detail__cluster-move"
            disabled={move.isPending || !selected}
            onClick={() => move.run(selected)}
          >
            Move
          </button>
        </div>
      )}

      {move.error ? (
        <p className="console-danger" role="alert" data-testid="participant-detail__cluster-error">
          {move.error}
        </p>
      ) : null}
    </section>
  );
}
