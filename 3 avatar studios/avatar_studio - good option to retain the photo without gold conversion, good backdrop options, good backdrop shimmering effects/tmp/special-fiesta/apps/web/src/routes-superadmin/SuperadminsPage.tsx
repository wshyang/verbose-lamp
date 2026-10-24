import { AdminShell } from './AdminShell.js';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { formatDateTime } from '../lib/format.js';
import { useAdminSuperadmins } from '../lib/hooks/useAdminAccounts.js';

/** S57–S59 — superadmin accounts: list, create, rotate passcode. Never deleted. */
export function SuperadminsPage() {
  const admin = useAdminSuperadmins();

  return (
    <AdminShell title="Superadmins">
      <section className="console-panel">
        <h2>New superadmin</h2>
        <form
          data-testid="superadmins__form"
          onSubmit={(event) => {
            event.preventDefault();
            admin.submitCreate();
          }}
        >
          <div className="console-grid console-grid--fields">
            <div>
              <ConsoleField id="superadmin-username" label="Username" topic="superadminUsername">
              <input
                id="superadmin-username"
                className="console-input"
                data-testid="superadmins__username"
                autoCapitalize="none"
                value={admin.username}
                onChange={(event) => admin.setUsername(event.target.value)}
              />
          </ConsoleField>
            </div>
            <div>
              <ConsoleField id="superadmin-passcode" label="4-digit passcode" topic="superadminPasscode">
              <input
                id="superadmin-passcode"
                className="console-input"
                data-testid="superadmins__passcode"
                inputMode="numeric"
                maxLength={4}
                value={admin.passcode}
                onChange={(event) => admin.setPasscode(event.target.value.replace(/\D/g, ''))}
              />
          </ConsoleField>
            </div>
          </div>
          {admin.error ? (
            <p className="console-danger" role="alert" data-testid="superadmins__error">
              {admin.error}
            </p>
          ) : null}
          <div style={{ height: 16 }} />
          <button
            type="submit"
            className="console-button console-button--primary"
            data-testid="superadmins__submit"
            disabled={admin.isBusy}
          >
            Create superadmin
          </button>
        </form>
      </section>

      <section className="console-panel">
        <h2>All superadmins</h2>
        <table className="console-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Created</th>
              <th>Last sign-in</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admin.superadmins.map((superadmin) => (
              <tr key={superadmin.id} data-testid="superadmins__row">
                <td>{superadmin.username}</td>
                <td>{formatDateTime(superadmin.createdAt)}</td>
                <td>{superadmin.lastLoginAt ? formatDateTime(superadmin.lastLoginAt) : 'Never'}</td>
                <td>
                  <button
                    type="button"
                    className="console-button"
                    data-testid="superadmins__rotate"
                    onClick={() => admin.setRotatingId(superadmin.id)}
                  >
                    Change passcode
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {admin.rotatingId ? (
        <div className="console-modal" role="dialog" aria-modal="true" aria-label="Change passcode">
          <div className="console-modal-body">
            <h2>Change passcode</h2>
            <ConsoleField id="rotate-passcode" label="New 4-digit passcode" topic="rotatePasscode">
            <input
              id="rotate-passcode"
              className="console-input"
              data-testid="superadmins__rotate-passcode"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={admin.rotatePasscode}
              onChange={(event) => admin.setRotatePasscode(event.target.value.replace(/\D/g, ''))}
            />
          </ConsoleField>
            <div className="console-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="console-button console-button--primary"
                data-testid="superadmins__rotate-confirm"
                disabled={admin.isBusy}
                onClick={admin.submitRotate}
              >
                Save
              </button>
              <button
                type="button"
                className="console-button console-button--ghost"
                data-testid="superadmins__rotate-cancel"
                onClick={() => admin.setRotatingId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
