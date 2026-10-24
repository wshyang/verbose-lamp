import { emptyStates } from '@psd/contracts';
import { ConsoleField } from '../components/console/ConsoleField.js';
import type { StationType } from '@psd/contracts';
import { AdminShell } from './AdminShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatDateTime } from '../lib/format.js';
import { useAdminFacilitators } from '../lib/hooks/useAdminAccounts.js';

/**
 * S44–S46 — facilitator accounts (F17/F18). Accounts are never deleted (F41 is out of scope):
 * every match and scan keeps a valid attribution for the audit trail.
 */
export function FacilitatorsPage() {
  const admin = useAdminFacilitators();
  const isEditing = Boolean(admin.editingId);
  const submitLabel = isEditing ? 'Save facilitator' : 'Create facilitator';
  const passcodeLabel = isEditing ? 'New passcode (leave blank to keep)' : '4-digit passcode';

  return (
    <AdminShell title="Facilitators">
      <section className="console-panel">
        <h2>{isEditing ? `Edit ${admin.draft.username}` : 'New facilitator'}</h2>
        <form
          data-testid="facilitators__form"
          onSubmit={(event) => {
            event.preventDefault();
            void admin.submitDraft();
          }}
        >
          <div className="console-grid console-grid--fields">
            <div>
              <ConsoleField id="facilitator-username" label="Username" topic="facilitatorUsername">
<input
                id="facilitator-username"
                className="console-input"
                data-testid="facilitators__username"
                autoCapitalize="none"
                disabled={isEditing}
                value={admin.draft.username}
                onChange={(event) => admin.setDraft({ ...admin.draft, username: event.target.value })}
              />
              </ConsoleField>
            </div>
            <div>
              <ConsoleField id="facilitator-passcode" label={passcodeLabel} topic="facilitatorPasscode">
<input
                id="facilitator-passcode"
                className="console-input"
                data-testid="facilitators__passcode"
                inputMode="numeric"
                maxLength={4}
                value={admin.draft.passcode}
                onChange={(event) =>
                  admin.setDraft({ ...admin.draft, passcode: event.target.value.replace(/\D/g, '') })
                }
              />
              </ConsoleField>
            </div>
            <div>
              <ConsoleField id="facilitator-label" label="Display label" topic="facilitatorLabel">
<input
                id="facilitator-label"
                className="console-input"
                data-testid="facilitators__label"
                maxLength={30}
                value={admin.draft.displayLabel}
                onChange={(event) => admin.setDraft({ ...admin.draft, displayLabel: event.target.value })}
              />
              </ConsoleField>
            </div>
            <div>
              <ConsoleField id="facilitator-station-type" label="Default station" topic="facilitatorStationType">
<select
                id="facilitator-station-type"
                className="console-select"
                data-testid="facilitators__station-type"
                value={admin.draft.defaultStationType}
                onChange={(event) =>
                  admin.setDraft({
                    ...admin.draft,
                    defaultStationType: event.target.value as StationType,
                    defaultStationId: '',
                  })
                }
              >
                <option value="none">None</option>
                <option value="court">Court</option>
                <option value="fringe_activity">Fringe activity</option>
              </select>
              </ConsoleField>
            </div>
            <div>
              <ConsoleField id="facilitator-station-id" label="Station" topic="facilitatorStationId">
              <select
                id="facilitator-station-id"
                className="console-select"
                data-testid="facilitators__station-id"
                disabled={admin.draft.defaultStationType === 'none'}
                value={admin.draft.defaultStationId}
                onChange={(event) =>
                  admin.setDraft({ ...admin.draft, defaultStationId: event.target.value })
                }
              >
                <option value="">— none —</option>
                {admin.stationChoices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
              </ConsoleField>
            </div>
          </div>
          {admin.error ? (
            <p className="console-danger" role="alert" data-testid="facilitators__error">
              {admin.error}
            </p>
          ) : null}
          <div className="console-row" style={{ marginTop: 16 }}>
            <button
              type="submit"
              className="console-button console-button--primary"
              data-testid="facilitators__submit"
              disabled={admin.isBusy}
            >
              {submitLabel}
            </button>
            {isEditing ? (
              <button
                type="button"
                className="console-button console-button--ghost"
                data-testid="facilitators__cancel"
                onClick={admin.cancelEdit}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="console-panel">
        <h2>All facilitators</h2>
        <StateMessage
          isLoading={admin.isLoading}
          error={null}
          isEmpty={admin.facilitators.length === 0}
          emptyText={emptyStates.facilitatorList}
          testId="facilitators"
        />
        <table className="console-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Label</th>
              <th>Default station</th>
              <th>Last sign-in</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admin.facilitators.map((facilitator) => (
              <tr key={facilitator.id} data-testid="facilitators__row">
                <td>{facilitator.username}</td>
                <td>{facilitator.displayLabel ?? '—'}</td>
                <td>{facilitator.defaultStationLabel ?? 'Unassigned'}</td>
                <td>{facilitator.lastLoginAt ? formatDateTime(facilitator.lastLoginAt) : 'Never'}</td>
                <td>
                  <button
                    type="button"
                    className="console-button"
                    data-testid="facilitators__edit"
                    onClick={() => admin.beginEdit(facilitator.id)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
