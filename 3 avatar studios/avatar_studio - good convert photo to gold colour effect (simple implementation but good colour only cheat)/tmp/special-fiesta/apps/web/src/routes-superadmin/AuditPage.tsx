import { emptyStates, type VoidTargetType } from '@psd/contracts';
import { AdminShell } from './AdminShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatDateTime } from '../lib/format.js';
import { useVoidAudit } from '../lib/hooks/useAdminCorrections.js';

/** What a target is called in the log's Target column. */
const TARGET_LABEL: Record<VoidTargetType, string> = {
  fringescan: 'scan',
  swagclaim: 'swag claim',
  awardbatch: 'award batch',
};

/** S55 — the void audit log (F45/F48, §2.13): append-only, one row per correction. */
export function AuditPage() {
  const audit = useVoidAudit();

  return (
    <AdminShell title="Correction audit">
      <section className="console-panel">
        <StateMessage
          isLoading={audit.isLoading}
          error={audit.error}
          isEmpty={audit.entries.length === 0}
          emptyText={emptyStates.voidAuditLog}
          testId="audit"
        />
        <table className="console-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Target</th>
              <th>Reason</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {audit.entries.map((entry) => (
              <tr key={entry.id} data-testid="audit__row">
                <td>{formatDateTime(entry.performedAt)}</td>
                <td>{entry.action}</td>
                <td className="console-muted">
                  {TARGET_LABEL[entry.targetType]} {entry.targetId}
                </td>
                <td>{entry.reason}</td>
                <td>{entry.performedByUsername}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
