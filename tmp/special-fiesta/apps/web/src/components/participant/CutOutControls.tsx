import type { AvatarBackdropPattern } from '@psd/contracts';
import { useState } from 'react';
import {
  CUT_OUT_STEPS,
  TUNING_BOUNDS,
  type CutOutTuning,
  type TuningKnob,
} from '../../lib/avatar/cutOut.js';
import { photoSpriteUrl } from '../../lib/avatars.js';

/**
 * ADR-073 — "this is the square we chose", and now also "this is how we cut you out of it".
 *
 * Three rows of named choices, because a participant on a beach wants a labelled button and not a
 * number: `Loose · Normal · Tight` says what it does, where `96` says what it sets. The same three
 * values are reachable as sliders behind "Fine tune" for anyone who would rather have the number,
 * which is the only reason the sliders exist.
 *
 * The cut-out row is hidden without a matte. The colour rules (ADR-031/032) have no alpha to
 * threshold, so the control would be present, turnable, and attached to nothing.
 */

interface KnobRow {
  knob: TuningKnob;
  label: string;
  hint: string;
  /** Whether it means anything when the segmentation model never answered. */
  needsMask: boolean;
}

const KNOB_ROWS: readonly KnobRow[] = [
  {
    knob: 'threshold',
    label: 'How much to cut away',
    hint: 'Tighter removes more of what is behind you.',
    needsMask: true,
  },
  {
    knob: 'minIsland',
    label: 'Stray bits',
    hint: 'Pieces of the background that came along with you.',
    needsMask: false,
  },
  {
    knob: 'edge',
    label: 'Edge',
    hint: 'Trim if there is a halo, grow if a shoulder went missing.',
    needsMask: false,
  },
];

export function CutOutControls(props: {
  tuning: CutOutTuning;
  sprite: string | null;
  /**
   * ADR-225 — the backdrop pattern the participant has chosen, so this square shows the picture that
   * will be saved, with the pattern on it, as the thumbnail and the preview at the top already do.
   */
  sunburst: AvatarBackdropPattern | null;
  isWorking: boolean;
  hasMask: boolean;
  onKnob: (change: { knob: TuningKnob; value: number }) => void;
  onBackground: (change: { on: boolean }) => void;
  onReset: () => void;
}) {
  const [isFine, setIsFine] = useState(false);
  const { tuning, hasMask } = props;

  // Named above the return: the JSX interior stays presentation-only (AGENTS-frontend.md §2).
  const isRemoving = tuning.removeBackground;
  // ADR-077 — with the cut-out off, the three numbers govern nothing, so they are not offered.
  const rows = isRemoving ? KNOB_ROWS.filter((row) => hasMask || !row.needsMask) : [];
  // ADR-078 — the disclosure cannot be open over nothing, so it reports shut while the cut-out is off.
  const isShowingNumbers = isFine && isRemoving;
  const preview = props.sprite === null ? null : photoSpriteUrl(props.sprite, props.sunburst);

  return (
    <div className="gb-controls" data-testid="cut-out-controls">
      <div className="gb-controls__preview">
        {preview === null ? null : (
          <img
            className="gb-avatar"
            src={preview}
            alt="Your photo as it will be saved"
            width={96}
            height={96}
            data-testid="cut-out-controls__preview"
          />
        )}
        <span className="gb-hint" data-testid="cut-out-controls__state">
          {props.isWorking ? 'Just a moment…' : 'Tap a choice to see it change.'}
        </span>
      </div>

      {/*
        ADR-077 — the first question, because it decides whether the rest are worth asking. Some
        photographs defeat every setting: a crowd right behind the subject, a wall the colour of a
        shirt. Keeping the photograph whole is a better answer than a bad cut-out.
      */}
      <span className="gb-label">Background</span>
      <div className="gb-row gb-row--wrap">
        <button
          type="button"
          className="gb-button gb-button--small"
          data-testid="cut-out-controls__background"
          aria-pressed={isRemoving}
          onClick={() => props.onBackground({ on: true })}
        >
          Take it out
        </button>
        <button
          type="button"
          className="gb-button gb-button--small"
          data-testid="cut-out-controls__background"
          aria-pressed={!isRemoving}
          onClick={() => props.onBackground({ on: false })}
        >
          Leave it in
        </button>
      </div>
      {/*
        ADR-078 — both buttons name the background, which is what the label above them is. "Keep my
        photo" was the first attempt and it read as "do not delete it"; worse, the cropper's own
        cancel button a few pixels above said "Keep what you had" (it says "Cancel" since ADR-229), so "keep" meant two different
        things on one screen.
      */}
      <span className="gb-hint">
        {isRemoving
          ? 'We will put a colour behind you.'
          : 'Your photo stays exactly as you took it.'}
      </span>

      {rows.map((row) => (
        <div key={row.knob}>
          <span className="gb-label">{row.label}</span>
          <div className="gb-row gb-row--wrap">
            {CUT_OUT_STEPS[row.knob].map((step) => (
              <button
                key={step.label}
                type="button"
                className="gb-button gb-button--small"
                data-testid={`cut-out-controls__${row.knob}`}
                aria-pressed={tuning[row.knob] === step.value}
                onClick={() => props.onKnob({ knob: row.knob, value: step.value })}
              >
                {step.label}
              </button>
            ))}
          </div>
          <span className="gb-hint">{row.hint}</span>
        </div>
      ))}

      <div className="gb-row gb-row--wrap">
        {/*
          ADR-078 — greyed rather than gone while the cut-out is off.
          The three numeric rows above disappear, because with nothing being cut out they are choices
          that no longer exist. These two are different: they are the panel's fixed actions, and
          removing them would collapse the controls to two buttons and move everything under the
          participant's thumb. Disabled keeps them where they were and says "not for this".
        */}
        <button
          type="button"
          className="gb-button gb-button--secondary gb-button--small"
          data-testid="cut-out-controls__fine-toggle"
          aria-expanded={isShowingNumbers}
          disabled={!isRemoving}
          onClick={() => setIsFine(!isFine)}
        >
          {isShowingNumbers ? 'Hide the numbers' : 'Fine tune'}
        </button>
        <button
          type="button"
          className="gb-button gb-button--secondary gb-button--small"
          data-testid="cut-out-controls__reset"
          disabled={!isRemoving}
          onClick={props.onReset}
        >
          Back to normal
        </button>
      </div>

      {isShowingNumbers
        ? rows.map((row) => (
            <label key={row.knob} className="gb-controls__fine">
              <span className="gb-label">{row.label}</span>
              <input
                type="range"
                className="gb-range"
                data-testid={`cut-out-controls__${row.knob}-range`}
                min={TUNING_BOUNDS[row.knob].min}
                max={TUNING_BOUNDS[row.knob].max}
                step={1}
                value={tuning[row.knob]}
                onChange={(event) =>
                  props.onKnob({ knob: row.knob, value: Number(event.target.value) })
                }
              />
              <span className="gb-hint" data-testid={`cut-out-controls__${row.knob}-value`}>
                {tuning[row.knob]}
              </span>
            </label>
          ))
        : null}
    </div>
  );
}
