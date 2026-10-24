import { Link } from 'react-router-dom';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import { CLUSTER_CODES, emptyStates } from '@psd/contracts';
import { AdminShell } from './AdminShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { useAdminParticipants } from '../lib/hooks/useAdminDirectory.js';

/**
 * S52 — participant directory (F49). Search by nickname, scan number or cluster.
 *
 * ADR-148 — one box, not two. A nickname can never be all digits (ADR-088), so the server
 * can tell which identifier was typed without being told, and the operator at the desk —
 * who is listening to somebody read a number out while three other people wait — does not
 * have to pick a mode first.
 */
export function ParticipantsPage() {
  const directory = useAdminParticipants();
  const searchHelp = useFieldHelp();
  const clusterHelp = useFieldHelp();

  return (
    <AdminShell title="Participants">
      <section className="console-panel">
        <form
          className="console-row"
          data-testid="participants__search-form"
          onSubmit={(event) => {
            event.preventDefault();
            directory.applySearch();
          }}
        >
          <input
            aria-describedby={searchHelp.tooltipId}
            className="console-input"
            data-testid="participants__search"
            placeholder="Search nickname or number"
            style={{ maxWidth: 320 }}
            value={directory.search}
            onChange={(event) => directory.setSearch(event.target.value)}
          />
          <button type="submit" className="console-button" data-testid="participants__search-submit">
            Search
          </button>
          <FieldHelp label="Search participants" topic="participantSearch" help={searchHelp} />
          {/*
            ADR-164 — the help-desk half of the forgotten-nickname remedy. A participant who
            cannot remember what they called themselves always still knows their cluster, and
            this turns the directory into the short list they can be read down. No submit:
            choosing the cluster IS the query.
          */}
          <select
            aria-describedby={clusterHelp.tooltipId}
            className="console-input"
            aria-label="Cluster"
            data-testid="participants__cluster"
            value={directory.clusterCode}
            onChange={(event) => directory.setClusterCode(event.target.value)}
          >
            <option value="">All clusters</option>
            {CLUSTER_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <FieldHelp label="Filter by cluster" topic="participantClusterFilter" help={clusterHelp} />
        </form>
      </section>

      <section className="console-panel">
        <StateMessage
          isLoading={directory.isLoading}
          error={directory.error}
          isEmpty={directory.rows.length === 0}
          emptyText={emptyStates.allParticipants}
          testId="participants"
        />
        <table className="console-table">
          <thead>
            <tr>
              <th>Nickname</th>
              {/*
                The number is shown because it is now searchable: an operator who typed 4821
                must be able to see at a glance which row answered, rather than trusting that
                the right one came back.
              */}
              <th>Number</th>
              <th>Cluster</th>
              <th>Team</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {directory.rows.map((row) => (
              <tr key={row.participant.id} data-testid="participants__row">
                <td>{row.participant.nickname}</td>
                <td className="console-code" data-testid="participants__scan-number">
                  {row.participant.scanNumber}
                </td>
                <td>{row.participant.clusterCode}</td>
                <td>{row.teamName ?? '—'}</td>
                <td>
                  <Link
                    className="console-button"
                    data-testid="participants__detail"
                    to={`/admin/participants/${row.participant.id}`}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
