import type { ClusterAdminView } from '@psd/contracts';
import type { useConfirm } from '../lib/hooks/useConfirm.js';
import type { useAdminClusters } from '../lib/hooks/useAdminClusters.js';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';

/**
 * One row of the cluster catalogue (ADR-172).
 *
 * Its own component because a row has to express three different refusals — scoring has
 * started, the cluster still has members, the cluster is already retired — and expressing them
 * inline put the table body over the complexity limit. Each branch below is one of those
 * states, which is easier to check here than threaded through a single JSX expression.
 */

interface ClusterRowProps {
  cluster: ClusterAdminView;
  admin: ReturnType<typeof useAdminClusters>;
  selected: string;
  onSelect: (code: string) => void;
  onRename: () => void;
  confirm: ReturnType<typeof useConfirm>;
}

export function ClusterRow({
  cluster,
  admin,
  selected,
  onSelect,
  onRename,
  confirm,
}: ClusterRowProps) {
  const targets = admin.moveTargets(cluster.code);
  const hasMembers = cluster.memberCount > 0;
  const canRetire = !cluster.isRetired && !hasMembers && !admin.scoringStarted;

  return (
    <tr data-testid="clusters__row">
      <td>{cluster.code}</td>
      <td>{cluster.displayName}</td>
      <td data-testid="clusters__members">{cluster.memberCount}</td>
      <td className={cluster.isRetired ? 'console-muted' : 'console-ok'}>
        {cluster.isRetired ? 'Retired' : 'Open'}
      </td>
      <td>
        <div className="console-row">
          <button
            type="button"
            className="console-button"
            data-testid="clusters__rename"
            onClick={onRename}
          >
            Rename
          </button>
          {cluster.isRetired ? (
            <RestoreButton cluster={cluster} admin={admin} />
          ) : (
            <RetireButton
              cluster={cluster}
              admin={admin}
              canRetire={canRetire}
              confirm={confirm}
            />
          )}
        </div>

        {/* The way out of "cannot retire: it still has members". */}
        {!cluster.isRetired && hasMembers && !admin.scoringStarted ? (
          <MoveControls
            cluster={cluster}
            admin={admin}
            targets={targets}
            selected={selected}
            onSelect={onSelect}
            confirm={confirm}
          />
        ) : null}
      </td>
    </tr>
  );
}

function RestoreButton({
  cluster,
  admin,
}: {
  cluster: ClusterAdminView;
  admin: ReturnType<typeof useAdminClusters>;
}) {
  return (
    <button
      type="button"
      className="console-button"
      data-testid="clusters__restore"
      disabled={admin.isBusy}
      onClick={() => admin.setRetired({ code: cluster.code, isRetired: false })}
    >
      Restore
    </button>
  );
}

function RetireButton({
  cluster,
  admin,
  canRetire,
  confirm,
}: {
  cluster: ClusterAdminView;
  admin: ReturnType<typeof useAdminClusters>;
  canRetire: boolean;
  confirm: ReturnType<typeof useConfirm>;
}) {
  // Why it is disabled, rather than only that it is.
  const reason = admin.scoringStarted
    ? 'Scoring has started.'
    : cluster.memberCount > 0
      ? 'Move its participants out first.'
      : undefined;

  return (
    <button
      type="button"
      className="console-button"
      data-testid="clusters__retire"
      disabled={admin.isBusy || !canRetire}
      title={reason}
      onClick={() =>
        confirm.ask({
          title: `Retire ${cluster.displayName}?`,
          body: 'It disappears from the signup list. Nothing is deleted — past messages, photos and points stay exactly as they are, and you can restore it at any time.',
          confirmLabel: 'Retire it',
          isDanger: true,
          run: async () => admin.setRetired({ code: cluster.code, isRetired: true }),
        })
      }
    >
      Retire
    </button>
  );
}

function MoveControls({
  cluster,
  admin,
  targets,
  selected,
  onSelect,
  confirm,
}: {
  cluster: ClusterAdminView;
  admin: ReturnType<typeof useAdminClusters>;
  targets: ClusterAdminView[];
  selected: string;
  onSelect: (code: string) => void;
  confirm: ReturnType<typeof useConfirm>;
}) {
  const targetName = targets.find((target) => target.code === selected)?.displayName ?? selected;
  const help = useFieldHelp();

  return (
    <div className="console-row" style={{ marginTop: 8 }}>
      <label className="console-label" htmlFor={`move-${cluster.code}`}>
        Move {cluster.memberCount} to
      </label>
      <FieldHelp label="Move cluster members" topic="clusterMove" help={help} />
      <select
        aria-describedby={help.tooltipId}
        id={`move-${cluster.code}`}
        className="console-input"
        data-testid="clusters__move-target"
        value={selected}
        onChange={(event) => onSelect(event.target.value)}
      >
        {targets.map((target) => (
          <option key={target.code} value={target.code}>
            {target.displayName}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="console-button"
        data-testid="clusters__move"
        disabled={admin.isBusy || !selected}
        onClick={() =>
          confirm.ask({
            title: `Move everyone out of ${cluster.displayName}?`,
            body: `All ${cluster.memberCount} of them join ${targetName}. Their points go with them, so both clusters' totals change.`,
            confirmLabel: 'Move them',
            isDanger: true,
            run: async () => admin.reassign({ code: cluster.code, toClusterCode: selected }),
          })
        }
      >
        Move
      </button>
    </div>
  );
}
