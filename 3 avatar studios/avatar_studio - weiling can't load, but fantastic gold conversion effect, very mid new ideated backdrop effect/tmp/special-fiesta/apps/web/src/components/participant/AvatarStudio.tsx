import { useId, useRef, useState, type ReactNode } from 'react';
import {
  AVATAR_BUILDS,
  AVATAR_FACIAL_HAIR,
  AVATAR_HAIR_STYLES,
  AVATAR_BACKDROP_SWATCHES,
  AVATAR_COLOUR_AXES,
  AVATAR_INDEX_AXES,
  formatAvatarLook,
  readAvatarLook,
  recolourSpriteBackdrop,
  type AvatarLook,
} from '@psd/contracts';
import { required } from '../../lib/required.js';
import { BackdropPatternSwatches, BackdropStyleControls } from './BackdropStyleRow.js';
import { CutOutControls } from './CutOutControls.js';
import { PhotoCropper } from './PhotoCropper.js';
import { PhotoDialog } from './PhotoDialog.js';
import { usePhotoSession, type PhotoSession, type PhotoState } from './usePhotoSession.js';
import { SelfieCapture } from './SelfieCapture.js';
import {
  AVATAR_VARIANTS,
  avatarAlt,
  avatarPersona,
  avatarUrl,
  nextVariant,
  personaLook,
  swatchOptions,
  type AvatarIdentity,
} from '../../lib/avatars.js';

/**
 * S1/S4 — the avatar studio (ADR-021). A persona is the starting point; every trait after
 * that is the participant's own. Used by sign-up and by the profile, so the two can never
 * offer different choices.
 */

export interface AvatarDraft {
  avatarVariant: number;
  avatarLook: string;
  /** ADR-031 — a sprite made from the participant's own photo, when they chose one. */
  avatarPhoto?: string | null;
}

function OptionRow(props: {
  label: string;
  testId: string;
  options: readonly string[];
  selected: number;
  onPick: (value: number) => void;
}) {
  return (
    <>
      <span className="gb-label">{props.label}</span>
      <div className="gb-row gb-row--wrap">
        {props.options.map((option, index) => (
          <button
            key={option}
            type="button"
            className="gb-button gb-button--small"
            data-testid={props.testId}
            aria-pressed={props.selected === index + 1}
            onClick={() => props.onPick(index + 1)}
          >
            {option}
          </button>
        ))}
      </div>
    </>
  );
}

function SwatchRow(props: {
  label: string;
  testId: string;
  axisKey: string;
  options: readonly string[];
  selected: number;
  onPick: (value: number) => void;
}) {
  return (
    <>
      <span className="gb-label">{props.label}</span>
      <div className="gb-swatches">
        {swatchOptions(props.axisKey, props.options).map((option) => (
          <button
            key={option.value}
            type="button"
            className="gb-swatch"
            data-testid={props.testId}
            style={{ backgroundColor: option.colour }}
            aria-pressed={props.selected === option.value}
            aria-label={`${props.label}: ${option.label}`}
            onClick={() => props.onPick(option.value)}
          />
        ))}
      </div>
    </>
  );
}

/**
 * ADR-060 — the row shows what is WORN, so a photo gets a box of its own.
 *
 * Without one, a character was always drawn as selected — including for somebody wearing a
 * photograph, who was therefore shown a character they were not wearing, marked as chosen. The
 * photo's own box is the selection while it is worn, and choosing a character moves the selection
 * there without taking the photo off yet (ADR-059). "Remove my photo" moves the selection to the next
 * character and holds the photo (ADR-227) until the save; pressing the photo box again brings it back.
 */
function PersonaRow(props: {
  draft: AvatarDraft;
  gender: AvatarIdentity['gender'];
  testId: string;
  /** The worn photo sprite, when there is one — it becomes the first box in the row. */
  photo?: string | null;
  photoSelected?: boolean;
  onPickPhoto?: () => void;
  onPick: (variant: number) => void;
}) {
  const look = readAvatarLook(props.draft.avatarLook);
  const current = props.draft.avatarVariant;
  const wearingPhoto = props.photoSelected === true;
  return (
    <>
      <span className="gb-label">Character</span>
      <div className="gb-grid">
        {props.photo ? (
          <button
            type="button"
            className="gb-avatar-option"
            data-testid="avatar-studio__photo-option"
            aria-pressed={wearingPhoto}
            aria-label="My photo"
            onClick={props.onPickPhoto}
          >
            <img src={avatarUrl({ gender: props.gender, avatarVariant: current, avatarLook: props.draft.avatarLook, avatarPhoto: props.photo })} alt="" />
            <span className="gb-avatar-name">My photo</span>
          </button>
        ) : null}
        {AVATAR_VARIANTS.map((variant) => {
          const preview = formatAvatarLook(personaLook(look, current, variant));
          return (
            <button
              key={variant}
              type="button"
              className="gb-avatar-option"
              data-testid={props.testId}
              aria-pressed={!wearingPhoto && props.draft.avatarVariant === variant}
              aria-label={avatarAlt({ avatarVariant: variant })}
              onClick={() => props.onPick(variant)}
            >
              <img
                src={avatarUrl({ gender: props.gender, avatarVariant: variant, avatarLook: preview })}
                alt=""
              />
              <span className="gb-avatar-name">{avatarPersona(variant)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * ADR-028 — shirt and backdrop are free colours: ten quick picks for the people who want
 * to be dressed in four taps, and the platform's colour wheel for everyone else. The
 * wheel is the platform's own colour input on purpose: it is the picker the phone
 * already has, it is reachable by keyboard, and it costs nothing to ship.
 */
/**
 * ADR-181 — the preview, which is one still image.
 *
 * It was two stacked layers with the backdrop rotating under a fixed face (ADR-173). The spin
 * glitched, and tuning it would have been effort spent defending a view that disagreed with the
 * product: the saved avatar is static everywhere it is ever shown, so an animated preview was
 * the only place a participant saw something they could not keep.
 *
 * `avatarSvg` already paints the sunburst into the finished picture for both drawn characters
 * and photo sprites, and `avatarUrl` memoises it — so this is now exactly the image that gets
 * saved, which is the strongest guarantee a preview can offer.
 *
 * `data-sunburst` is here for the tests: with the rays no longer their own element there is
 * otherwise nothing in the DOM that says whether the effect is on, short of decoding a data URL.
 */
function StillPreview(props: { identity: AvatarIdentity }) {
  return (
    <img
      className="gb-avatar"
      src={avatarUrl(props.identity)}
      alt={avatarAlt(props.identity)}
      width={128}
      height={128}
      data-testid="avatar-studio__preview"
      data-sunburst={readAvatarLook(props.identity.avatarLook).sunburst ? 'on' : 'off'}
    />
  );
}

/**
 * ADR-204 — `trailing` is one more square at the end of the palette, `children` is whatever
 * that square reveals. Both exist for the backdrop's spiral and nothing else, and both are
 * slots rather than a `kind` flag so this row never has to know what a spiral is.
 */
function ColourRow(props: {
  label: string;
  testId: string;
  swatches: readonly { label: string; hex: string }[];
  selected: string;
  onPick: (value: string) => void;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const named = props.swatches.find((swatch) => swatch.hex === props.selected);
  return (
    <>
      <span className="gb-label">{props.label}</span>
      <div className="gb-swatches">
        {props.swatches.map((swatch) => (
          <button
            key={swatch.hex}
            type="button"
            className="gb-swatch"
            data-testid={props.testId}
            style={{ backgroundColor: swatch.hex }}
            aria-pressed={props.selected === swatch.hex}
            aria-label={`${props.label}: ${swatch.label}`}
            onClick={() => props.onPick(swatch.hex)}
          />
        ))}
        <label className="gb-swatch gb-swatch--wheel" aria-label={`${props.label}: any colour`}>
          <input
            type="color"
            data-testid={`${props.testId}-wheel`}
            value={props.selected}
            // A colour input can only ever hand back `#rrggbb` — the browser coerces
            // anything else before this fires — so there is nothing to validate here.
            // The wire boundary still checks it (`asAvatarColour`, ADR-028).
            onChange={(event) => props.onPick(event.target.value.toLowerCase())}
          />
        </label>
        {props.trailing}
      </div>
      <span className="gb-hint" data-testid={`${props.testId}-value`}>
        {named ? named.label : props.selected.toUpperCase()}
      </span>
      {props.children}
    </>
  );
}

/**
 * ADR-031/033 — "use my photo". The file is read, converted and forgotten in the browser:
 * what the app keeps is a 128×128 sprite (ADR-037), which is why the copy says so out loud.
 *
 * Two answers, in order. The colour cut-out is instant and needs nothing, so the
 * participant sees themselves at once; then the segmentation model has a go at the same
 * pixels and replaces it if it manages — which is what handles a selfie taken in a café
 * rather than in front of a wall. If the model cannot be fetched, nothing is lost and
 * nothing is said twice.
 */
function PhotoRow(props: {
  photo: string | null;
  backdrop: string;
  /** ADR-224 — the whole look as a string, so the cropper's picture follows the backdrop and pattern. */
  avatarLook: string;
  /** ADR-227 — the photo was taken off and waits for the save. Changes the hint and the box. */
  pendingRemoval?: boolean;
  /**
   * ADR-227 — the photo is taken off, but not yet: the studio holds it until the participant saves, and moves
   * the selection to the next character. There is no gate; a character always exists.
   */
  onRemove: (photo: string) => void;
  /**
   * A photograph is ready to wear. Called by Done in the dialog and by nothing else (ADR-229), so a conversion
   * that is cancelled never reaches the draft. Starts the character choice over (ADR-059/060).
   */
  onPhoto: (sprite: string) => void;
}) {
  const session = usePhotoSession({
    backdrop: props.backdrop,
    avatarLook: props.avatarLook,
    onPhoto: props.onPhoto,
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const { state } = session;
  const worn = props.photo;

  return (
    <>
      <span className="gb-label">My own face</span>
      <div className="gb-row gb-row--wrap">
        {/* Always mounted, so the dialog's own button can open it; the label below is the visible picker. */}
        <input
          ref={fileInput}
          id={fileId}
          type="file"
          accept="image/*"
          className="gb-file"
          data-testid="avatar-studio__photo"
          onChange={(event) => void session.convert(event.target.files?.[0])}
        />
        {worn === null ? (
          <>
            <label className="gb-button gb-button--small" htmlFor={fileId} data-testid="avatar-studio__photo-label">
              Use a photo
            </label>
            <button
              type="button"
              className="gb-button gb-button--small gb-button--secondary"
              data-testid="avatar-studio__selfie-open"
              onClick={session.openSelfie}
            >
              Take a selfie
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="gb-button gb-button--small gb-button--secondary"
              data-testid="avatar-studio__photo-replace"
              onClick={session.openChoice}
            >
              Replace my photo
            </button>
            <button
              type="button"
              className="gb-button gb-button--small gb-button--danger"
              data-testid="avatar-studio__photo-clear"
              onClick={() => {
                session.view.setState('idle');
                props.onRemove(worn);
              }}
            >
              Remove my photo
            </button>
          </>
        )}
      </div>

      {session.open ? (
        <PhotoDialog title="Your photo" onCancel={session.close}>
          <PhotoSessionBody session={session} onChoose={() => fileInput.current?.click()} />
        </PhotoDialog>
      ) : (
        <span className="gb-hint" data-testid="avatar-studio__photo-state">
          {hintFor(state, { photo: props.photo, pending: props.pendingRemoval === true })}
        </span>
      )}
    </>
  );
}

/**
 * ADR-229 — what the dialog shows for each stage, one hint and one set of actions per screen (F9). The square
 * is the only stage with a photo to frame, and it is where the cut-out controls sit (ADR-073).
 */
function PhotoSessionBody(props: { session: PhotoSession; onChoose: () => void }) {
  const { session } = props;
  if (session.taking) {
    return <SelfieCapture onCapture={(photo) => void session.convert(photo)} onCancel={session.close} />;
  }
  if (session.state === 'idle' || session.state === 'failed') {
    return (
      <>
        <span className="gb-hint" data-testid="avatar-studio__photo-state">
          {PHOTO_HINT[session.state]}
        </span>
        <div className="gb-row gb-row--wrap">
          <button
            type="button"
            className="gb-button gb-button--small"
            data-testid="avatar-studio__photo-choose"
            onClick={props.onChoose}
          >
            {session.state === 'failed' ? 'Try another photo' : 'Use a photo'}
          </button>
          <button
            type="button"
            className="gb-button gb-button--small gb-button--secondary"
            data-testid="avatar-studio__selfie-dialog"
            onClick={session.openSelfie}
          >
            Take a selfie
          </button>
          <button
            type="button"
            className="gb-button gb-button--small gb-button--secondary"
            data-testid="avatar-studio__photo-cancel"
            onClick={session.close}
          >
            Cancel
          </button>
        </div>
      </>
    );
  }
  if (session.state === 'working' || session.state === 'refining' || session.chosen === null) {
    return (
      <>
        <span className="gb-hint" data-testid="avatar-studio__photo-state">
          {PHOTO_HINT[session.state]}
        </span>
        <div className="gb-row">
          <button
            type="button"
            className="gb-button gb-button--small gb-button--secondary"
            data-testid="avatar-studio__photo-cancel"
            onClick={session.close}
          >
            Cancel
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <span className="gb-hint" data-testid="avatar-studio__photo-state">
        {PHOTO_HINT[session.state]}
      </span>
      <PhotoCropper
        photoUrl={session.chosen.url}
        photo={session.chosen.bitmap}
        found={session.found}
        onUse={session.commitSquare}
        onCancel={session.close}
        onBox={session.setBox}
        preview={session.preview}
      >
        {/*
          ADR-073 — the cut-out controls sit beneath the square, where the participant is already looking at
          what we made of their photograph. They are the cropper's child rather than part of it: the cropper
          is pure rectangle arithmetic, and it has no business knowing what a sprite is.
        */}
        <CutOutControls
          tuning={session.cutOut.tuning}
          sprite={session.cutOut.sprite}
          sunburst={session.sunburst}
          isWorking={session.cutOut.isWorking}
          hasMask={session.cutOut.hasMask}
          onKnob={session.cutOut.setKnob}
          onBackground={session.cutOut.setBackground}
          onReset={session.cutOut.reset}
        />
      </PhotoCropper>
    </>
  );
}


const PHOTO_HINT: Record<PhotoState, string> = {
  idle: 'We will find your face and cut out the background.',
  working: 'Working on your photo…',
  refining: 'Tidying up the background…',
  refined: 'Background removed. Move the square if the framing is off.',
  plain: 'Background removed as best we could — a plain wall works better.',
  cropping: 'We could not find your face. Put the square over it.',
  failed: 'That photo could not be read. Try another one.',
};

/**
 * ADR-060 — what to say while a photo is simply being worn.
 *
 * `idle` means "nothing is happening", which covers two different situations: no photo yet, and a
 * photo restored from the saved avatar when the studio opens. They need opposite sentences, and the
 * old copy gave the no-photo one to both — so somebody already wearing a photograph was told their
 * photo "never leaves this phone and becomes a 128×128 sprite". True, and no use to anybody: it
 * described the implementation instead of answering the only question that screen raises, which is
 * how to get rid of the thing.
 */
/** ADR-232 (F13) — the toggle names what is behind it: build is always there, and beard is men only. */
function customiseLabel(gender: AvatarIdentity['gender']): string {
  return gender === 'male'
    ? 'Customise hair, build, beard, skin and colours'
    : 'Customise hair, build, skin and colours';
}

const WORN_HINT = 'Your photo is on. Remove my photo takes it off when you save.';

/** ADR-227 — the photo is still on the row until the save, so say when it goes and how to keep it. */
const PENDING_HINT = 'Your photo will be removed when you save. Press My photo to keep it.';

function hintFor(state: PhotoState, view: { photo: string | null; pending: boolean }): string {
  if (view.pending && view.photo === null) return PENDING_HINT;
  if (state === 'idle' && view.photo !== null) return WORN_HINT;
  return PHOTO_HINT[state];
}

export function AvatarStudio(props: {
  gender: AvatarIdentity['gender'];
  draft: AvatarDraft;
  personaTestId: string;
  onChange: (next: AvatarDraft) => void;
  id?: string;
  startExpanded?: boolean;
}) {
  // ADR-027 — the fifty-one trait buttons are folded away at sign-up. Choosing a
  // character is the required step; skin, hair and colours are a pleasure, and putting
  // them between a new participant and the join button made joining feel like work.
  const [isExpanded, setIsExpanded] = useState(props.startExpanded === true);
  /** ADR-059/060 — has a character been picked since this photo went on? It moves the highlight only. */
  const [pickedCharacter, setPickedCharacter] = useState(false);
  /*
   * ADR-227 — the photo Remove took off, held until the save. The draft carries `null` in the meantime,
   * so a save sends the removal; this keeps the picture so "My photo" can bring it back.
   */
  const [heldPhoto, setHeldPhoto] = useState<string | null>(null);
  const pending = heldPhoto !== null && (props.draft.avatarPhoto ?? null) === null;
  const look = readAvatarLook(props.draft.avatarLook);
  const identity: AvatarIdentity = { gender: props.gender, ...props.draft };

  const setLook = (patch: Partial<AvatarLook>) => {
    props.onChange({ ...props.draft, avatarLook: formatAvatarLook({ ...look, ...patch }) });
  };

  /**
   * ADR-054 — the backdrop, which a photo avatar owns as much as a drawn one does.
   *
   * It has to be its own handler because a photo sprite carries its backdrop baked into its own
   * palette, so changing the look alone would leave the picture showing the old colour. Both move
   * together, in ONE `onChange`: two calls would race, and the second would overwrite the first.
   */
  const setBackdrop = (backdrop: string) => {
    const next = { ...props.draft, avatarLook: formatAvatarLook({ ...look, backdrop }) };
    const photo = next.avatarPhoto;
    if (photo === null || photo === undefined) {
      props.onChange(next);
      return;
    }
    props.onChange({ ...next, avatarPhoto: recolourSpriteBackdrop(photo, backdrop) ?? photo });
  };

  /*
   * Picking a character brings its kit, but never over a colour the participant chose — and,
   * ADR-059, never over the photo either. Choosing a character does not take a worn photo off; only
   * Remove does. A worn photo wears the new backdrop in this same change (F4, ADR-227), as setBackdrop
   * does, because a photo carries its backdrop in its own palette and would otherwise keep the old one.
   */
  const setPersona = (variant: number) => {
    const photo = props.draft.avatarPhoto ?? null;
    const nextLook = personaLook(look, props.draft.avatarVariant, variant);
    const next: AvatarDraft = {
      ...props.draft,
      avatarVariant: variant,
      avatarLook: formatAvatarLook(nextLook),
    };
    if (photo !== null) {
      setPickedCharacter(true);
      if (nextLook.backdrop !== look.backdrop) {
        next.avatarPhoto = recolourSpriteBackdrop(photo, nextLook.backdrop) ?? photo;
      }
    }
    props.onChange(next);
  };

  /*
   * ADR-227 — Remove needs no character first, because the next one always exists. The photo is held,
   * not dropped: the selection moves to the next character, and "My photo" brings the picture back until
   * the participant saves. The draft carries `null` meanwhile, so the save is what removes the photo.
   */
  const removePhoto = (photo: string) => {
    const variant = nextVariant(props.draft.avatarVariant);
    setHeldPhoto(photo);
    setPickedCharacter(false);
    props.onChange({
      ...props.draft,
      avatarPhoto: null,
      avatarVariant: variant,
      avatarLook: formatAvatarLook(personaLook(look, props.draft.avatarVariant, variant)),
    });
  };

  /** ADR-227 — "My photo" during a pending removal: the held picture, in the backdrop now chosen. */
  const restorePhoto = () => {
    // The restore is only offered while a removal is pending, so the held picture is there.
    const photo = required(heldPhoto, 'held photo');
    setHeldPhoto(null);
    setPickedCharacter(false);
    props.onChange({
      ...props.draft,
      avatarPhoto: recolourSpriteBackdrop(photo, look.backdrop) ?? photo,
    });
  };

  return (
    <div className="gb-studio" id={props.id}>
      <div className="gb-studio__preview">
        <StillPreview identity={identity} />
      </div>

      <PhotoRow
        photo={props.draft.avatarPhoto ?? null}
        backdrop={look.backdrop}
        avatarLook={props.draft.avatarLook}
        pendingRemoval={pending}
        onRemove={removePhoto}
        onPhoto={(avatarPhoto) => {
          // A fresh photo starts the choice over, and ends a pending removal (ADR-059/060, ADR-227).
          setHeldPhoto(null);
          setPickedCharacter(false);
          props.onChange({ ...props.draft, avatarPhoto });
        }}
      />

      {/*
        ADR-034/054 — a photo is not a character. Hair, skin and shirt are pixels of a
        photograph here, not layers the studio can repaint, so offering those controls
        would be offering something that does nothing.

        The backdrop is the exception, and it is offered. Once the cut-out model has taken
        the real background away there is a genuine backdrop behind the person, painted from
        the sprite's own palette — so it is a colour the participant really does own, and it
        was only ever hidden because before background removal there was nothing to paint.
      */}
      {props.draft.avatarPhoto ? (
        <>
          {/*
            ADR-173/179 — the backdrop's STYLE belongs to a photo for the same reason its colour
            does, and `avatarSvg` has always painted a sunburst behind a sprite via
            `paintSpriteSunburst`. Only this control was missing, which left a participant who
            chose a spiral as a drawn character and then put a photo on still WEARING that spiral
            with no way to change or remove it.

            Unlike the colour, this needs no sprite repaint: the rays are composed from
            `look.sunburst` at render time rather than baked into the sprite's palette, so the
            plain `setLook` is both sufficient and correct here.
          */}
          <ColourRow
            label="Backdrop"
            testId="avatar-studio__backdrop"
            swatches={AVATAR_BACKDROP_SWATCHES}
            selected={look.backdrop}
            onPick={setBackdrop}
            trailing={
              <BackdropPatternSwatches
                sunburst={look.sunburst}
                colourOne={look.backdrop}
                onChange={(sunburst) => setLook({ sunburst })}
              />
            }
          >
            <BackdropStyleControls
              sunburst={look.sunburst}
              colourOne={look.backdrop}
              onChange={(sunburst) => setLook({ sunburst })}
            />
          </ColourRow>
          {/*
            ADR-059 — the characters stay on show while a photo is worn, because choosing one is
            how taking the photo off is unlocked. The preview keeps showing the PHOTO: the
            character is a destination, not a change, until "Remove my photo" is pressed.
          */}
          <PersonaRow
            draft={props.draft}
            gender={props.gender}
            testId={props.personaTestId}
            photo={props.draft.avatarPhoto}
            photoSelected={!pickedCharacter}
            onPickPhoto={() => setPickedCharacter(false)}
            onPick={setPersona}
          />
        </>
      ) : (
        <>
          <PersonaRow
            draft={props.draft}
            gender={props.gender}
            testId={props.personaTestId}
            photo={pending ? heldPhoto : null}
            onPickPhoto={restorePhoto}
            onPick={setPersona}
          />

          <button
            type="button"
            className="gb-button gb-button--secondary gb-button--small"
            data-testid="avatar-studio__toggle"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Hide the details' : customiseLabel(props.gender)}
          </button>

          {isExpanded ? (
            <>
              <OptionRow
                label="Hair"
                testId="avatar-studio__hair-style"
                options={AVATAR_HAIR_STYLES[props.gender]}
                selected={look.hairStyle}
                onPick={(hairStyle) => setLook({ hairStyle })}
              />

              <OptionRow
                label="Build"
                testId="avatar-studio__build"
                options={AVATAR_BUILDS}
                selected={look.build}
                onPick={(build) => setLook({ build })}
              />

              {props.gender === 'male' ? (
                <OptionRow
                  label="Beard"
                  testId="avatar-studio__facial-hair"
                  options={AVATAR_FACIAL_HAIR}
                  selected={look.facialHair}
                  onPick={(facialHair) => setLook({ facialHair })}
                />
              ) : null}

              {AVATAR_INDEX_AXES.map((axis) => (
                <SwatchRow
                  key={axis.key}
                  label={axis.label}
                  testId={`avatar-studio__${axis.key}`}
                  axisKey={axis.key}
                  options={axis.options}
                  selected={look[axis.key]}
                  onPick={(value) => setLook({ [axis.key]: value })}
                />
              ))}

              {/*
                ADR-204 — the spiral is handed to the BACKDROP row as its last swatch rather
                than rendered after it under a heading of its own. It modifies that colour, so
                it belongs in that row; a shirt has no spiral, so no other axis gets one.
              */}
              {AVATAR_COLOUR_AXES.map((axis) => (
                <ColourRow
                  key={axis.key}
                  label={axis.label}
                  testId={`avatar-studio__${axis.key}`}
                  swatches={axis.swatches}
                  selected={look[axis.key]}
                  onPick={(value) =>
                    axis.key === 'backdrop' ? setBackdrop(value) : setLook({ [axis.key]: value })
                  }
                  trailing={
                    axis.key === 'backdrop' ? (
                      <BackdropPatternSwatches
                        sunburst={look.sunburst}
                        colourOne={look.backdrop}
                        onChange={(sunburst) => setLook({ sunburst })}
                      />
                    ) : null
                  }
                >
                  {axis.key === 'backdrop' ? (
                    <BackdropStyleControls
                      sunburst={look.sunburst}
                      colourOne={look.backdrop}
                      onChange={(sunburst) => setLook({ sunburst })}
                    />
                  ) : null}
                </ColourRow>
              ))}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
