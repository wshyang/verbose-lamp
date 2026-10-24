import { emptyStates } from '@psd/contracts';
import { ConsoleField } from '../components/console/ConsoleField.js';
import type { AgendaItemView } from '@psd/contracts';
import { AdminShell } from './AdminShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { ConfirmDialog } from '../components/shared/ConfirmDialog.js';
import { useAdminAgenda } from '../lib/hooks/useAdminAgenda.js';
import { useConfirm } from '../lib/hooks/useConfirm.js';

/**
 * ADR-177 — the day's programme, edited here and read by participants in the Ball tab.
 *
 * Modelled on the activities and courts screens, including the confirm dialog on the toggle,
 * because cancelling a programme item in front of 250 people is the same class of act as
 * closing a court and deserves the same "are you sure".
 *
 * There is no delete button, and that is the design rather than an omission: cancelling leaves
 * the item on the participant's page struck through, because somebody who memorised a 3pm item
 * needs to see that it is off rather than find it silently missing.
 */
export function AgendaPage() {
  const confirm = useConfirm();
  const admin = useAdminAgenda();

  return (
    <AdminShell title="Programme">
      <ConfirmDialog confirm={confirm} isBusy={admin.isBusy} />
      <section className="console-panel">
        <h2>{admin.editingId ? 'Edit item' : 'New item'}</h2>
        <form
          data-testid="agenda__form"
          onSubmit={(event) => {
            event.preventDefault();
            void admin.submitDraft();
          }}
        >
          <div className="console-grid console-grid--fields">
            <div>
              <ConsoleField id="agenda-title" label="Item" topic="agendaTitle">
              <input
                id="agenda-title"
                className="console-input"
                data-testid="agenda__title"
                value={admin.draft.title}
                maxLength={120}
                onChange={(event) => admin.setDraft({ ...admin.draft, title: event.target.value })}
              />
          </ConsoleField>
            </div>
            <div>
              <ConsoleField id="agenda-start" label="Starts — date and time; leave blank for an item with no fixed time" topic="agendaStarts">
              <input
                id="agenda-start"
                type="datetime-local"
                className="console-input"
                data-testid="agenda__start"
                value={admin.draft.startAt}
                onChange={(event) => admin.setDraft({ ...admin.draft, startAt: event.target.value })}
              />
          </ConsoleField>
            </div>
            <div>
              <ConsoleField id="agenda-end" label="Ends — date and time; leave blank for a moment rather than a block" topic="agendaEnds">
              <input
                id="agenda-end"
                type="datetime-local"
                className="console-input"
                data-testid="agenda__end"
                value={admin.draft.endAt}
                onChange={(event) => admin.setDraft({ ...admin.draft, endAt: event.target.value })}
              />
          </ConsoleField>
            </div>
            <div>
              <ConsoleField id="agenda-location" label="Where" topic="agendaLocation">
              <input
                id="agenda-location"
                className="console-input"
                data-testid="agenda__location"
                value={admin.draft.location}
                maxLength={60}
                onChange={(event) =>
                  admin.setDraft({ ...admin.draft, location: event.target.value })
                }
              />
          </ConsoleField>
            </div>
            <div>
              <ConsoleField id="agenda-detail" label="Note" topic="agendaDetail">
              <input
                id="agenda-detail"
                className="console-input"
                data-testid="agenda__detail"
                value={admin.draft.detail}
                maxLength={300}
                onChange={(event) => admin.setDraft({ ...admin.draft, detail: event.target.value })}
              />
          </ConsoleField>
            </div>
          </div>
          {admin.error ? (
            <p className="console-danger" role="alert" data-testid="agenda__error">
              {admin.error}
            </p>
          ) : null}
          <div className="console-row" style={{ marginTop: 16 }}>
            <button
              type="submit"
              className="console-button console-button--primary"
              data-testid="agenda__submit"
              disabled={admin.isBusy}
            >
              {admin.editingId ? 'Save changes' : 'Add item'}
            </button>
            {admin.editingId ? (
              <button
                type="button"
                className="console-button console-button--ghost"
                data-testid="agenda__cancel"
                onClick={admin.cancelEdit}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="console-panel">
        <h2>The day</h2>
        <StateMessage
          isLoading={admin.isLoading}
          error={null}
          isEmpty={admin.items.length === 0}
          emptyText={emptyStates.agenda}
          testId="agenda-list"
        />
        <table className="console-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Item</th>
              <th>Where</th>
              <th>State</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admin.items.map((item) => (
              <tr key={item.id} data-testid="agenda__row">
                <td>{whenOf(item.startsAt, item.endsAt)}</td>
                <td>
                  {item.title}
                  {item.detail ? <div className="console-muted">{item.detail}</div> : null}
                </td>
                <td>{item.location ?? '—'}</td>
                <td className={item.isActive ? 'console-ok' : 'console-muted'}>
                  {item.isActive ? 'On' : 'Cancelled'}
                </td>
                <td>
                  <div className="console-row">
                    <MoveButtons admin={admin} item={item} />
                    <button
                      type="button"
                      className="console-button"
                      data-testid="agenda__edit"
                      onClick={() => admin.beginEdit(item.id)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="console-button"
                      data-testid="agenda__toggle"
                      disabled={admin.isBusy}
                      onClick={() =>
                        confirm.ask({
                          title: item.isActive ? `Cancel ${item.title}?` : `Restore ${item.title}?`,
                          body: item.isActive
                            ? 'It stays on the programme struck through, so anyone who memorised it sees that it is off.'
                            : 'It goes back on the programme as a normal item.',
                          confirmLabel: item.isActive ? 'Cancel it' : 'Restore it',
                          isDanger: item.isActive,
                          run: () => admin.setActive({ itemId: item.id, isEnabled: !item.isActive }),
                        })
                      }
                    >
                      {item.isActive ? 'Cancel item' : 'Restore'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="console-muted">
          Cancelling leaves the item visible and struck through. There is no delete — edit the
          title instead if something was typed in by mistake.
        </p>
      </section>
    </AdminShell>
  );
}

/**
 * ADR-190 — up and down, and ONLY on the items with no fixed time.
 *
 * An item with a clock is already placed by its clock, so there is nothing for these to do to
 * it that changing the time would not do better. Rendering them disabled on a timed row would
 * invite the click and then refuse it; rendering nothing says the same thing without the
 * detour, and the timeless items are a contiguous block at the top where the arrows read as a
 * group rather than as a missing control.
 */
function MoveButtons({
  admin,
  item,
}: {
  admin: ReturnType<typeof useAdminAgenda>;
  item: AgendaItemView;
}) {
  if (item.startsAt !== null) return null;
  return (
    <>
      <button
        type="button"
        className="console-button"
        data-testid="agenda__move-up"
        aria-label={`Move ${item.title} up`}
        disabled={admin.isBusy}
        onClick={() => admin.move({ itemId: item.id, direction: 'up' })}
      >
        ↑
      </button>
      <button
        type="button"
        className="console-button"
        data-testid="agenda__move-down"
        aria-label={`Move ${item.title} down`}
        disabled={admin.isBusy}
        onClick={() => admin.move({ itemId: item.id, direction: 'down' })}
      >
        ↓
      </button>
    </>
  );
}

/** The console's clock column. Same three shapes as the participant page: block, moment, none. */
function whenOf(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return 'No fixed time';
  const start = new Date(startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!endsAt) return start;
  const end = new Date(endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${start} – ${end}`;
}
