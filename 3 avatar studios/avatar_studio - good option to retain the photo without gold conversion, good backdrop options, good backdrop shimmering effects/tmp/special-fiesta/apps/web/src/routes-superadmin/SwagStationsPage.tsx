import { AdminShell } from './AdminShell.js';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { useAdminSwagStations } from '../lib/hooks/useAdminSwag.js';

/**
 * ADR-110/188 — swag station administration: the Activities page mirrored, with an item
 * editor in place of the tier editor (label + per-person limit, 1–6 rows).
 *
 * One form does both jobs. Edit loads a station into it and the heading says so, because a
 * station is a name and a short item list either way, and a separate inline editor per row
 * would be the same fields written twice.
 */
export function SwagStationsPage() {
  const admin = useAdminSwagStations();

  return (
    <AdminShell title="Swag stations">
      <section className="console-panel">
        <h2>{admin.editingId ? 'Edit station' : 'New station'}</h2>
        <form
          data-testid="swag-admin__form"
          onSubmit={(event) => {
            event.preventDefault();
            void admin.submit();
          }}
        >
          <ConsoleField id="swag-name" label="Station name" topic="swagStationName">
          <input
            id="swag-name"
            className="console-input"
            data-testid="swag-admin__name"
            value={admin.stationName}
            onChange={(event) => admin.setStationName(event.target.value)}
          />
          </ConsoleField>
          <ItemsEditor admin={admin} />
          {admin.error ? (
            <p className="console-danger" role="alert" data-testid="swag-admin__error">
              {admin.error}
            </p>
          ) : null}
          <div style={{ height: 12 }} />
          <button
            type="submit"
            className="console-button console-button--primary"
            data-testid="swag-admin__create"
            disabled={admin.isSaving}
          >
            {admin.editingId ? 'Save station' : 'Create station'}
          </button>
          {admin.editingId ? (
            <button
              type="button"
              className="console-button console-button--small"
              data-testid="swag-admin__cancel"
              onClick={admin.cancelEdit}
            >
              Cancel
            </button>
          ) : null}
        </form>
      </section>

      <section className="console-panel">
        <h2>Stations</h2>
        <StateMessage
          isLoading={admin.isLoading}
          error={null}
          isEmpty={admin.stations.length === 0}
          emptyText="No swag stations yet — create the first above."
          testId="swag-admin"
        />
        <ul className="console-list">
          {admin.stations.map((station) => (
            <li key={station.id} data-testid="swag-admin__row">
              <div className="console-row">
                <strong>{station.stationName}</strong>
                <span className="console-meta">
                  {station.items.map((item) => `${item.label} ×${item.limit}`).join(' · ')}
                  {station.isActive ? '' : ' · inactive'}
                </span>
                <button
                  type="button"
                  className="console-button console-button--small"
                  data-testid="swag-admin__edit"
                  onClick={() => admin.beginEdit(station)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="console-button console-button--small"
                  data-testid="swag-admin__toggle"
                  onClick={() => admin.toggleActive(station.id)}
                >
                  {station.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </AdminShell>
  );
}

type Admin = ReturnType<typeof useAdminSwagStations>;

function ItemsEditor({ admin }: { admin: Admin }) {
  const help = useFieldHelp();
  return (
    <div data-testid="swag-admin__items">
      <div className="console-field__head">
        <span className="console-label">Items and per-round limits</span>
        <FieldHelp label="Items and limits" topic="swagItems" help={help} />
      </div>
      {admin.items.map((item, index) => (
        <div className="console-row" key={index}>
          <input
            className="console-input"
            aria-describedby={help.tooltipId}
            data-testid="swag-admin__item-label"
            placeholder="Item (e.g. Tote bag)"
            value={item.label}
            onChange={(event) => admin.setItem(index, { ...item, label: event.target.value })}
          />
          <input
            className="console-input console-input--narrow"
            aria-describedby={help.tooltipId}
            data-testid="swag-admin__item-limit"
            inputMode="numeric"
            placeholder="Limit"
            value={item.limit}
            onChange={(event) =>
              admin.setItem(index, { ...item, limit: event.target.value.replace(/\D/g, '') })
            }
          />
          {admin.items.length > 1 ? (
            <button
              type="button"
              className="console-button console-button--small"
              data-testid="swag-admin__remove-item"
              onClick={() => admin.removeItem(index)}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      {admin.items.length < 6 ? (
        <button
          type="button"
          className="console-button console-button--small"
          data-testid="swag-admin__add-item"
          onClick={admin.addItem}
        >
          Add item
        </button>
      ) : null}
    </div>
  );
}
