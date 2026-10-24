import { useState } from 'react';
import { emptyStates } from '@psd/contracts';
import { AdminShell } from './AdminShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { ConfirmDialog } from '../components/shared/ConfirmDialog.js';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { useConfirm } from '../lib/hooks/useConfirm.js';
import { useAdminClusters } from '../lib/hooks/useAdminClusters.js';
import { ClusterRow } from './ClusterRow.js';

/**
 * S44 — the cluster catalogue (ADR-172).
 *
 * Three things this page has to say out loud, because each is a refusal the superadmin would
 * otherwise only meet as an error:
 *
 *   - a cluster with members cannot be retired, so the row offers the move instead;
 *   - once scoring starts, retiring and moving are locked, so the banner says so up front;
 *   - nothing is ever deleted, so "Retire" is the word on the button rather than "Delete".
 */
export function ClustersPage() {
  const confirm = useConfirm();
  const admin = useAdminClusters();
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  const isRenaming = admin.renamingCode !== null;

  return (
    <AdminShell title="Clusters">
      <ConfirmDialog confirm={confirm} isBusy={admin.isBusy} />

      {admin.scoringStarted ? (
        <section className="console-panel">
          <p className="console-danger" data-testid="clusters__locked">
            Scoring has started, so clusters can no longer be retired and participants can no
            longer be moved between them. A participant&rsquo;s points are counted under whichever
            cluster they are in now, so a move after scoring would rewrite the leaderboard. Adding
            a cluster and renaming one are still allowed &mdash; neither moves a point.
          </p>
        </section>
      ) : null}

      <section className="console-panel">
        <h2>{isRenaming ? `Rename ${admin.renamingCode}` : 'New cluster'}</h2>
        <form
          data-testid="clusters__form"
          onSubmit={(event) => {
            event.preventDefault();
            void admin.submitDraft();
          }}
        >
          <div className="console-grid">
            <div>
              <ConsoleField id="cluster-code" label="Code" topic="clusterCode">
              <input
                className="console-input"
                data-testid="clusters__code"
                value={admin.draft.code}
                maxLength={30}
                /* The code is the key three tables point at, so it is fixed once created. */
                disabled={isRenaming}
                onChange={(event) => admin.setDraft({ ...admin.draft, code: event.target.value })}
              />
              </ConsoleField>
              <p className="console-muted">
                {isRenaming
                  ? 'The code cannot change — past messages and photos are filed under it.'
                  : 'Short and permanent. Only the display name can be changed later.'}
              </p>
            </div>
            <div>
              <ConsoleField id="cluster-name" label="Display name" topic="clusterName">
              <input
                className="console-input"
                data-testid="clusters__name"
                value={admin.draft.displayName}
                maxLength={30}
                onChange={(event) =>
                  admin.setDraft({ ...admin.draft, displayName: event.target.value })
                }
              />
              </ConsoleField>
              <p className="console-muted">What participants and the leaderboard see.</p>
            </div>
          </div>

          {admin.error ? (
            <p className="console-danger" role="alert" data-testid="clusters__error">
              {admin.error}
            </p>
          ) : null}

          <div className="console-row" style={{ marginTop: 16 }}>
            <button
              type="submit"
              className="console-button console-button--primary"
              data-testid="clusters__submit"
              disabled={admin.isBusy}
            >
              {isRenaming ? 'Save name' : 'Add cluster'}
            </button>
            {isRenaming ? (
              <button
                type="button"
                className="console-button console-button--ghost"
                data-testid="clusters__cancel"
                onClick={admin.cancelRename}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="console-panel">
        <h2>All clusters</h2>
        <StateMessage
          isLoading={admin.isLoading}
          error={null}
          isEmpty={admin.clusters.length === 0}
          emptyText={emptyStates.clusterList}
          testId="clusters"
        />
        <table className="console-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Display name</th>
              <th>Members</th>
              <th>State</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admin.clusters.map((cluster) => (
              <ClusterRow
                key={cluster.code}
                cluster={cluster}
                admin={admin}
                selected={moveTo[cluster.code] ?? admin.moveTargets(cluster.code)[0]?.code ?? ''}
                onSelect={(code) => setMoveTo({ ...moveTo, [cluster.code]: code })}
                onRename={() => admin.beginRename(cluster.code)}
                confirm={confirm}
              />
            ))}
          </tbody>
        </table>
        <p className="console-muted">
          Clusters are retired, never deleted: chat messages and gallery photos record the cluster
          their author was in at the time, and deleting one would rewrite that history.
        </p>
      </section>
    </AdminShell>
  );
}
