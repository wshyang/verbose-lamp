import { useState } from 'react';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { SCREEN_KEY_LABEL_MAX, SCREEN_SCENES, emptyStates, toggleScreenScene } from '@psd/contracts';
import type { ScreenKeyView, ScreenSceneId } from '@psd/contracts';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatDateTime } from '../lib/format.js';
import { useScreenKeys } from '../lib/hooks/useScreenKeys.js';
import type { ConfirmState } from '../lib/hooks/useConfirm.js';

/**
 * ADR-145 — the hall screen's keys, on the Operations page beside the pause and the restart.
 *
 * They belong here for the reason the server already gave (ADR-140): they are the same kind
 * of control — something an operator reaches for when the room is not doing what it should —
 * rather than a configuration of how the event scores.
 */

/** The minted URL, which exists for exactly as long as this panel is on screen. */
function MintedScreen(props: { url: string; label: string; onDismiss: () => void }) {
  const [hasCopied, setHasCopied] = useState(false);
  const clipboard = navigator.clipboard as Clipboard | undefined;

  return (
    <div className="console-panel" data-testid="screen-keys__minted">
      <h3>{props.label}</h3>
      <p className="console-hint">
        Open this on the machine driving the projector. It is shown once — close this and it is
        gone, and the only way back is a new screen.
      </p>
      {/*
        Selectable, wrapping, and in the page rather than behind a button: the copy button is
        the convenience, and the text is the thing that still works on a laptop served over
        plain HTTP, where the clipboard API does not exist at all.
      */}
      <p className="console-code" data-testid="screen-keys__url">
        {props.url}
      </p>
      {clipboard ? (
        <button
          type="button"
          className="console-button"
          data-testid="screen-keys__copy"
          onClick={() => {
            void clipboard.writeText(props.url).then(
              () => setHasCopied(true),
              // A refused clipboard is not worth an error panel: the URL is already on screen.
              () => setHasCopied(false),
            );
          }}
        >
          {hasCopied ? 'Copied' : 'Copy link'}
        </button>
      ) : null}
      <button
        type="button"
        className="console-button"
        data-testid="screen-keys__dismiss"
        onClick={props.onDismiss}
      >
        Done — hide it
      </button>
    </div>
  );
}

/**
 * ADR-160 — the scene checklist, used both when minting and when editing a live key.
 *
 * Rendered from `SCREEN_SCENES` in the canonical order, so the operator ticks boxes in the
 * sequence the room will see them rather than in whatever order the list was declared.
 *
 * The last ticked box cannot be unticked. The server refuses an empty set too, and that
 * refusal is the real one — this is here so the operator finds out by the checkbox not
 * moving, rather than by an error panel appearing after they already committed.
 */
function SceneChecklist(props: {
  selected: readonly ScreenSceneId[];
  isBusy: boolean;
  testIdPrefix: string;
  onToggle: (id: ScreenSceneId) => void;
}) {
  const isLast = props.selected.length === 1;
  const help = useFieldHelp();
  return (
    <fieldset className="console-fieldset" data-testid={`${props.testIdPrefix}__scenes`}>
      <legend className="console-label">
        What does it show? <FieldHelp label="What it shows" topic="screenScene" help={help} />
      </legend>
      {SCREEN_SCENES.map((scene) => {
        const isOn = props.selected.includes(scene.id);
        return (
          <label key={scene.id} className="console-check">
            <input
              aria-describedby={help.tooltipId}
              type="checkbox"
              data-testid={`${props.testIdPrefix}__scene-${scene.id}`}
              checked={isOn}
              disabled={props.isBusy || (isOn && isLast)}
              onChange={() => props.onToggle(scene.id)}
            />{' '}
            {scene.label}
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * ADR-160 — editing a live key's scenes in place.
 *
 * Held locally until Save rather than saved per tick: a nine-box checklist saved on every
 * change would be nine writes and, worse, would pass through states the operator never
 * meant — unticking two boxes to tick a third briefly describes a screen they do not want.
 */
function SceneEditor(props: {
  item: ScreenKeyView;
  isBusy: boolean;
  onSave: (next: readonly ScreenSceneId[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ScreenSceneId[]>([...props.item.enabledScenes]);
  return (
    <td colSpan={3}>
      <SceneChecklist
        selected={draft}
        isBusy={props.isBusy}
        testIdPrefix={`screen-keys__edit-${props.item.id}`}
        onToggle={(id) => setDraft((current) => [...toggleScreenScene(current, id)])}
      />
      <button
        type="button"
        className="console-button"
        data-testid={`screen-keys__save-${props.item.id}`}
        disabled={props.isBusy}
        onClick={() => props.onSave(draft)}
      >
        Save
      </button>
      <button
        type="button"
        className="console-button"
        data-testid={`screen-keys__cancel-${props.item.id}`}
        onClick={props.onClose}
      >
        Cancel
      </button>
    </td>
  );
}

/** How many of the nine a key shows, said in words rather than as a count of nine. */
function sceneSummary(item: ScreenKeyView): string {
  if (item.enabledScenes.length === SCREEN_SCENES.length) return 'Everything';
  const shown = SCREEN_SCENES.filter((scene) => item.enabledScenes.includes(scene.id));
  return shown.map((scene) => scene.label).join(', ');
}

function ScreenKeyRow(props: {
  item: ScreenKeyView;
  isBusy: boolean;
  onRevoke: () => void;
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSave: (next: readonly ScreenSceneId[]) => void;
}) {
  const { item } = props;
  if (props.isEditing) {
    return (
      <tr data-testid={`screen-keys__row-${item.id}`} data-revoked={false}>
        <SceneEditor
          item={item}
          isBusy={props.isBusy}
          onSave={props.onSave}
          onClose={props.onClose}
        />
      </tr>
    );
  }
  return (
    <tr data-testid={`screen-keys__row-${item.id}`} data-revoked={item.revokedAt !== null}>
      <td>
        {item.label}
        <br />
        <span className="console-hint" data-testid={`screen-keys__shows-${item.id}`}>
          {sceneSummary(item)}
        </span>
      </td>
      {/*
        Last seen, not created: before a revoke the only question that matters is whether this
        is the key the hall is running on, and the creation time answers a different one.
      */}
      <td>{item.revokedAt === null ? formatDateTime(item.lastSeenAt) : '—'}</td>
      <td>
        {item.revokedAt === null ? (
          <>
            {/*
              A revoked key is not editable: it is the record of what was projecting that day,
              and the server refuses it too.
            */}
            <button
              type="button"
              className="console-button"
              data-testid={`screen-keys__edit-${item.id}`}
              disabled={props.isBusy}
              onClick={props.onEdit}
            >
              Change scenes
            </button>{' '}
            <button
              type="button"
              className="console-button"
              data-testid={`screen-keys__revoke-${item.id}`}
              disabled={props.isBusy}
              onClick={props.onRevoke}
            >
              Revoke
            </button>
          </>
        ) : (
          <span className="console-hint">Revoked {formatDateTime(item.revokedAt)}</span>
        )}
      </td>
    </tr>
  );
}

function ScreenKeyTable(props: {
  keys: readonly ScreenKeyView[];
  state: { isLoading: boolean; error: string | null; isBusy: boolean };
  askRevoke: (item: ScreenKeyView) => () => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onSave: (id: string, next: readonly ScreenSceneId[]) => void;
}) {
  if (props.keys.length === 0) {
    return (
      <StateMessage
        isLoading={props.state.isLoading}
        // The panel prints the error above; here it only decides that an empty table is not
        // an empty event. Passing it twice would say the same sentence twice on one screen.
        error={null}
        isEmpty
        emptyText={emptyStates.screenKeys}
        testId="screen-keys"
      />
    );
  }
  return (
    <table className="console-table" data-testid="screen-keys__table">
      <thead>
        <tr>
          <th>Screen</th>
          <th>Last seen</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {props.keys.map((item) => (
          <ScreenKeyRow
            key={item.id}
            item={item}
            isBusy={props.state.isBusy}
            onRevoke={props.askRevoke(item)}
            isEditing={props.editingId === item.id}
            onEdit={() => props.setEditingId(item.id)}
            onClose={() => props.setEditingId(null)}
            onSave={(next) => props.onSave(item.id, next)}
          />
        ))}
      </tbody>
    </table>
  );
}

export function ScreenKeysPanel(props: { confirm: ConfirmState }) {
  const screens = useScreenKeys();
  const { confirm } = props;
  const [editingId, setEditingId] = useState<string | null>(null);

  const askRevoke = (item: ScreenKeyView) => () =>
    confirm.ask({
      title: `Revoke ${item.label}?`,
      /*
       * Named plainly, because the consequence is visible to the whole hall within seconds
       * and is not recoverable from the projector end: whoever is standing next to it cannot
       * sign in, and a new link has to reach that machine somehow.
       */
      body: 'That screen goes blank at its next read, within a minute. Issuing a new link is the only way back.',
      confirmLabel: 'Revoke',
      isDanger: true,
      run: screens.revoke(item.id),
    });

  return (
    <section className="console-panel">
      <h2>Hall screen</h2>
      <p className="console-hint">
        A screen link signs a projector in on its own, with no account: it can read the board,
        the matches, the line-ups and the gallery, and can write nothing at all.
      </p>

      {screens.error ? (
        <p className="console-danger" role="alert" data-testid="screen-keys__error">
          {screens.error}
        </p>
      ) : null}

      {screens.minted ? (
        <MintedScreen
          url={screens.minted.url}
          label={screens.minted.label}
          onDismiss={screens.dismissMinted}
        />
      ) : null}

      <form
        data-testid="screen-keys__form"
        onSubmit={(event) => {
          event.preventDefault();
          screens.mint();
        }}
      >
        <ConsoleField id="screen-key-label" label="Where is it?" topic="screenKeyLabel">
        <input
          id="screen-key-label"
          className="console-input"
          data-testid="screen-keys__label"
          maxLength={SCREEN_KEY_LABEL_MAX}
          placeholder="Main hall"
          value={screens.label}
          onChange={(event) => screens.setLabel(event.target.value)}
        />
          </ConsoleField>
        <div style={{ height: 12 }} />
        <SceneChecklist
          selected={screens.scenes}
          isBusy={screens.isBusy}
          testIdPrefix="screen-keys__new"
          onToggle={screens.toggleScene}
        />
        <div style={{ height: 12 }} />
        <button
          type="submit"
          className="console-button"
          data-testid="screen-keys__create"
          // A name is required by the server, and for a good reason: a list of unnamed keys
          // cannot be revoked safely, because nobody can tell which projector is which.
          disabled={screens.isBusy || screens.label.trim() === ''}
        >
          Create a screen link
        </button>
      </form>

      <ScreenKeyTable
        keys={screens.keys}
        state={{ isLoading: screens.isLoading, error: screens.error, isBusy: screens.isBusy }}
        askRevoke={askRevoke}
        editingId={editingId}
        setEditingId={setEditingId}
        onSave={(id, next) => {
          screens.setKeyScenes(id, next);
          setEditingId(null);
        }}
      />
    </section>
  );
}
