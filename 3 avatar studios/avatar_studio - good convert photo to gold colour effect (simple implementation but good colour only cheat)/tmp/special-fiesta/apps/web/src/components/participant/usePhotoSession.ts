import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { readAvatarLook } from '@psd/contracts';
import { warmUpFaceLocator } from '../../lib/avatar/locateFace.js';
import { photoFileToSprite, refineWithModel } from '../../lib/avatar/readPhoto.js';
import { photoToSprite, type Bitmap, type CropBox, type SubjectMask } from '../../lib/avatar/photoSprite.js';
import { useBackdropPreview } from '../../lib/hooks/useBackdropPreview.js';
import { usePhotoTuning } from '../../lib/hooks/usePhotoTuning.js';
import { required } from '../../lib/required.js';

/**
 * ADR-229 — one conversion, from the moment a photograph is picked until the participant says Done or Cancel.
 *
 * Everything the conversion does lives here, in view state. The draft hears about the photo only through
 * `commitSquare`, which is Done. `close` throws the whole session away, and a result that arrives after `close`
 * belongs to a session that is over, so it is ignored. That is what makes Cancel mean discard.
 */

const PHOTO_INK = '#12243a';

export interface ChosenPhoto {
  url: string;
  bitmap: Bitmap;
}

/** `working` and `refining` are the two stages with nothing to show but a hint. */
export type PhotoState = 'idle' | 'working' | 'refining' | 'refined' | 'plain' | 'cropping' | 'failed';

/** The session's own state, and the setters the work needs. Nothing here is the draft. */
export interface PhotoView {
  state: PhotoState;
  setState: Dispatch<SetStateAction<PhotoState>>;
  chosen: ChosenPhoto | null;
  setChosen: Dispatch<SetStateAction<ChosenPhoto | null>>;
  found: CropBox | null;
  setFound: Dispatch<SetStateAction<CropBox | null>>;
  subject: SubjectMask | null;
  setSubject: Dispatch<SetStateAction<SubjectMask | null>>;
  box: CropBox | null;
  setBox: Dispatch<SetStateAction<CropBox | null>>;
  taking: boolean;
  setTaking: Dispatch<SetStateAction<boolean>>;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  /** Which session is current. A result that arrives after Cancel belongs to a session that is over. */
  session: { current: number };
}

/** The state of one session, and the resources that go with it. */
export function usePhotoView(): PhotoView {
  const [state, setState] = useState<PhotoState>('idle');
  const [chosen, setChosen] = useState<ChosenPhoto | null>(null);
  const [found, setFound] = useState<CropBox | null>(null);
  const [subject, setSubject] = useState<SubjectMask | null>(null);
  const [taking, setTaking] = useState(false);
  const [box, setBox] = useState<CropBox | null>(null);
  const [open, setOpen] = useState(false);
  const session = useRef(0);

  /*
   * ADR-227 / N6 — the original photograph's object URL is released when a newer one replaces it and when the
   * studio goes away. The cleanup of this effect is the single place that does it.
   */
  useEffect(() => {
    if (chosen === null) return undefined;
    const { url } = chosen;
    return () => URL.revokeObjectURL(url);
  }, [chosen]);

  /* ADR-054 — the detector is fetched now, not when a photo arrives. Fire-and-forget: a failed warm-up must not disturb the studio. */
  useEffect(() => warmUpFaceLocator(), []);

  return { state, setState, chosen, setChosen, found, setFound, subject, setSubject, box, setBox, taking, setTaking, open, setOpen, session };
}

/** ADR-229 — what Cancel and the end of a Done do: everything the session held goes, and the draft is untouched. */
export function resetPhotoView(view: PhotoView): void {
  view.session.current += 1;
  view.setOpen(false);
  view.setTaking(false);
  view.setState('idle');
  view.setChosen(null);
  view.setFound(null);
  view.setSubject(null);
  view.setBox(null);
}

/** The conversion, its tuning and its preview. The draft hears about it only through `commitSquare`. */
export function usePhotoWork(input: {
  view: PhotoView;
  backdrop: string;
  avatarLook: string;
  onPhoto: (sprite: string) => void;
}) {
  const { view, onPhoto } = input;
  /*
   * Memoised because `usePhotoTuning` keys its sprite on it. A fresh object literal every render would repaint
   * the sprite every render, at about a tenth of a second each.
   */
  const colours = useMemo(() => ({ backdrop: input.backdrop, ink: PHOTO_INK }), [input.backdrop]);
  const cutOut = usePhotoTuning({ bitmap: view.chosen?.bitmap ?? null, subject: view.subject, crop: view.box, colours });
  /* ADR-224 — the picture follows the SETTLED tuning, the one the saved sprite is painted from. */
  const preview = useBackdropPreview({
    bitmap: view.chosen?.bitmap ?? null,
    subject: view.subject,
    tuning: cutOut.settled,
    avatarLook: input.avatarLook,
  });

  const convert = async (file: Blob | undefined) => {
    if (file === undefined) return;
    view.session.current += 1;
    const current = view.session.current;
    view.setOpen(true);
    view.setTaking(false);
    view.setState('working');
    const quick = await photoFileToSprite(file, colours).catch(() => null);
    if (view.session.current !== current) return;
    if (quick === null) {
      view.setState('failed');
      return;
    }
    view.setState('refining');
    const refined = await refineWithModel(quick, colours).catch(() => null);
    if (view.session.current !== current) return;
    /*
     * ADR-036/054 — did anything actually FIND a face? If not, the framing is a skin-colour guess, so the
     * participant is asked to put the square where it belongs. A cut-out is not a face box (ADR-053).
     */
    const located = refined?.crop ?? quick.crop;
    view.setFound(located);
    view.setBox(located);
    view.setSubject(refined?.subject ?? null);
    view.setChosen({ url: URL.createObjectURL(file), bitmap: quick.bitmap });
    view.setState(located === null ? 'cropping' : refined === null ? 'plain' : 'refined');
  };

  /** ADR-229 — Done. The square as the participant left it is the photo, painted from the square they confirmed. */
  const commitSquare = (crop: CropBox) => {
    const photo = required(view.chosen, 'chosen photo');
    onPhoto(photoToSprite(photo.bitmap, { ...colours, subject: view.subject, crop, tuning: cutOut.tuning }));
    resetPhotoView(view);
  };

  return { convert, commitSquare, cutOut, preview, sunburst: readAvatarLook(input.avatarLook).sunburst };
}

export interface PhotoSession {
  view: PhotoView;
  close: () => void;
  openChoice: () => void;
  openSelfie: () => void;
  convert: (file: Blob | undefined) => Promise<void>;
  commitSquare: (crop: CropBox) => void;
  cutOut: ReturnType<typeof usePhotoWork>['cutOut'];
  preview: string | null;
  sunburst: ReturnType<typeof readAvatarLook>['sunburst'];
  state: PhotoState;
  chosen: ChosenPhoto | null;
  found: CropBox | null;
  setBox: (box: CropBox) => void;
  open: boolean;
  taking: boolean;
}

/** One photo session, as the studio uses it: the view, the work, and the four ways in and out. */
export function usePhotoSession(input: { backdrop: string; avatarLook: string; onPhoto: (sprite: string) => void }): PhotoSession {
  const view = usePhotoView();
  const work = usePhotoWork({ view, ...input });
  const openSelfie = () => {
    view.session.current += 1;
    view.setState('idle');
    view.setTaking(true);
    view.setOpen(true);
  };
  const openChoice = () => {
    view.session.current += 1;
    view.setTaking(false);
    view.setState('idle');
    view.setOpen(true);
  };
  return {
    view,
    close: () => resetPhotoView(view),
    openChoice,
    openSelfie,
    convert: work.convert,
    commitSquare: work.commitSquare,
    cutOut: work.cutOut,
    preview: work.preview,
    sunburst: work.sunburst,
    state: view.state,
    chosen: view.chosen,
    found: view.found,
    setBox: view.setBox,
    open: view.open,
    taking: view.taking,
  };
}
