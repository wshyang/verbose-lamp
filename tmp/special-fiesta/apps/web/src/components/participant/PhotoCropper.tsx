import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { boxToPhoto, moveBox, photoToBox, resizeBox, startingBox } from '../../lib/avatar/cropBox.js';
import type { CropBox } from '../../lib/avatar/photoSprite.js';
import { required } from '../../lib/required.js';

/**
 * ADR-036/056 — "here is the square we chose; move it if we got it wrong".
 *
 * The photo, a square the participant can drag and resize, and two buttons. The square is always
 * square because the sprite is, and it cannot leave the picture or shrink below a fifth of it.
 *
 * ADR-056 — `found` is the crop a detector produced, in photo coordinates. When there is one the
 * square OPENS on the face, so the common case is one tap to accept rather than a drag; when there
 * is none it opens in the middle of the frame and the participant places it themselves. Before, this
 * screen only ever appeared as a failure and always started from the middle.
 *
 * Pointer events rather than mouse or touch: one code path for a finger, a stylus and a
 * mouse, which is three fewer things to get wrong on a phone.
 */
export function PhotoCropper(props: {
  photoUrl: string;
  photo: { width: number; height: number };
  found?: CropBox | null;
  onUse: (crop: CropBox) => void;
  onCancel: () => void;
  /**
   * ADR-073 — the square as it stands, reported when the finger lifts.
   *
   * On release and not on every move: the cut-out controls rebuild a sprite from whatever square
   * they are given, and that costs about a tenth of a second. Per pointer-move it would be a
   * slideshow; per drag it is free.
   */
  onBox?: (crop: CropBox) => void;
  /**
   * ADR-224 — the same photograph with the chosen backdrop behind the person, laid exactly over the raw one.
   *
   * It is an overlay, not a new `src` on the photograph, on purpose: the raw image is what seeds the square
   * when it loads, so swapping its source would re-seed the square each time the picture changed (a cut-out
   * choice, say) and throw away where the participant had put it. Null, or nothing yet, shows the raw photograph.
   */
  preview?: string | null;
  /** Anything that belongs on this screen but not inside a rectangle — the cut-out controls. */
  children?: ReactNode;
}) {
  const { found = null, photo } = props;
  const surface = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState({ width: 240, height: 240 });
  const [box, setBox] = useState<CropBox>(() => startingBox({ width: 240, height: 240 }));
  const drag = useRef<{ from: { x: number; y: number }; mode: 'move' | 'resize' } | null>(null);

  const measure = () => {
    const rect = required(surface.current, 'cropper surface').getBoundingClientRect();
    const frame = { width: rect.width, height: rect.height };
    setShown(frame);
    return frame;
  };

  /*
   * Seed the square once the surface has a real size.
   * The detector's box is in photo pixels, so it cannot be placed until the displayed image has
   * been laid out — which is why this runs here and on the image's own load event rather than in
   * `useState`, where the frame is still the 240 px placeholder.
   */
  const seed = () => {
    if (surface.current === null) return;
    const frame = measure();
    if (frame.width === 0 || frame.height === 0) return;
    setBox(found == null ? startingBox(frame) : photoToBox(found, frame, photo));
  };

  // Re-seeds if the detector's answer or the photo changes, which is what "start on the face"
  // means when a participant swaps their picture without leaving the studio.
  useEffect(seed, [found, photo]);

  const begin = (mode: 'move' | 'resize') => (event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    measure();
    drag.current = { from: { x: event.clientX, y: event.clientY }, mode };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const move = (event: ReactPointerEvent) => {
    const active = drag.current;
    if (active === null) return;
    const by = { x: event.clientX - active.from.x, y: event.clientY - active.from.y };
    drag.current = { ...active, from: { x: event.clientX, y: event.clientY } };
    setBox((current) =>
      active.mode === 'move' ? moveBox(current, by, shown) : resizeBox(current, by, shown),
    );
  };

  const end = () => {
    if (drag.current === null) return;
    drag.current = null;
    props.onBox?.(boxToPhoto(box, measure(), photo));
  };

  return (
    <div className="gb-cropper" data-testid="photo-cropper">
      <p className="gb-hint">
        {found == null
          ? 'Drag the square over your face, and pull the corner to resize it.'
          : 'This is the face we found. Use it as it is, or drag the square to move it.'}
      </p>
      <div
        ref={surface}
        className="gb-cropper__surface"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <img
          className="gb-cropper__photo"
          src={props.photoUrl}
          alt="The photo you chose"
          onLoad={seed}
        />
        {props.preview ? (
          <img
            className="gb-cropper__photo gb-cropper__photo--backdrop"
            src={props.preview}
            alt=""
            aria-hidden="true"
            data-testid="photo-cropper__backdrop"
          />
        ) : null}
        <div
          className="gb-cropper__box"
          data-testid="photo-cropper__box"
          style={{ left: box.x, top: box.y, width: box.size, height: box.size }}
          onPointerDown={begin('move')}
        >
          <span
            className="gb-cropper__handle"
            data-testid="photo-cropper__handle"
            onPointerDown={begin('resize')}
          />
        </div>
      </div>
      <div className="gb-row gb-row--wrap">
        <button
          type="button"
          className="gb-button gb-button--small"
          data-testid="photo-cropper__use"
          onClick={() => props.onUse(boxToPhoto(box, measure(), photo))}
        >
          Use this square
        </button>
        <button
          type="button"
          className="gb-button gb-button--small gb-button--secondary"
          data-testid="photo-cropper__cancel"
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
      {props.children}
    </div>
  );
}
