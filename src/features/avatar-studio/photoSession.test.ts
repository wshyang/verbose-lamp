import { describe, expect, it } from 'vitest';
import type { SubjectMatte } from '@/features/background-removal';
import type { RgbaImage, SquareBox } from '@/shared/lib/raster';
import { startingBox } from './cropBox';
import { EMPTY_SESSION, messageOf, viewOf, type SessionState } from './photoSession';
import { STAGE_HINTS } from './stage';

const PHOTO: RgbaImage = { width: 100, height: 50, data: new Uint8ClampedArray(100 * 50 * 4) };
const MATTE: SubjectMatte = { width: 2, height: 2, data: new Uint8ClampedArray(4) };
const FACE: SquareBox = { x: 10, y: 5, size: 30 };
const MANUAL: SquareBox = { x: 20, y: 10, size: 20 };

const session = (changes: Partial<SessionState>): SessionState => ({ ...EMPTY_SESSION, ...changes });

describe('EMPTY_SESSION', () => {
  it('is frozen, so no code can edit the shared starting point', () => {
    expect(Object.isFrozen(EMPTY_SESSION)).toBe(true);
  });

  it('holds nothing', () => {
    expect(EMPTY_SESSION).toEqual({
      photo: null, photoName: '', crop: null, foundCrop: null, matte: null, isLocating: false, isSegmenting: false, error: null,
    });
  });
});

describe('messageOf', () => {
  it('uses the message of a real error', () => {
    expect(messageOf(new Error('Too large.'))).toBe('Too large.');
  });

  it.each([['text'], [undefined], [null], [{ message: 'not an Error' }]])('hides anything else (%o) behind a plain sentence', (thrown) => {
    expect(messageOf(thrown)).toBe('That image could not be opened.');
  });
});

describe('viewOf stage and hint', () => {
  it('is idle, with its hint, before any photo', () => {
    const view = viewOf(EMPTY_SESSION, false);

    expect(view.stage).toBe('idle');
    expect(view.hint).toBe(STAGE_HINTS.idle);
  });

  it.each([
    ['working while the face is searched for', { photo: PHOTO, isLocating: true, isSegmenting: true }, 'working'],
    ['refining once the face is in but the matte is not', { photo: PHOTO, crop: FACE, isSegmenting: true }, 'refining'],
    ['ready with a face and a matte', { photo: PHOTO, crop: FACE, matte: MATTE }, 'ready'],
    ['plain with a face but no matte', { photo: PHOTO, crop: FACE }, 'plain'],
    ['cropping when no face was found', { photo: PHOTO }, 'cropping'],
    ['failed on an error, even with a photo', { photo: PHOTO, crop: FACE, error: 'bad' }, 'failed'],
  ] as const)('is %s', (_, changes, stage) => {
    const view = viewOf(session(changes), false);

    expect(view.stage).toBe(stage);
    expect(view.hint).toBe(STAGE_HINTS[stage]);
  });
});

describe('viewOf cropper', () => {
  it('has no cropper and no start box without a photo, even when asked to adjust', () => {
    const view = viewOf(EMPTY_SESSION, true);

    expect(view.isCropping).toBe(false);
    expect(view.cropperStart).toBeNull();
  });

  it('opens the cropper by itself when the face was not found', () => {
    expect(viewOf(session({ photo: PHOTO }), false).isCropping).toBe(true);
  });

  it('opens the cropper on request once the face search is over', () => {
    const ready = session({ photo: PHOTO, crop: FACE, matte: MATTE });

    expect(viewOf(ready, false).isCropping).toBe(false);
    expect(viewOf(ready, true).isCropping).toBe(true);
  });

  it('keeps the cropper shut on request while the face is still being searched for', () => {
    expect(viewOf(session({ photo: PHOTO, isLocating: true }), true).isCropping).toBe(false);
  });

  it('starts the square at the confirmed crop, else the found face, else the default box', () => {
    expect(viewOf(session({ photo: PHOTO, crop: MANUAL, foundCrop: FACE }), false).cropperStart).toEqual(MANUAL);
    expect(viewOf(session({ photo: PHOTO, foundCrop: FACE }), false).cropperStart).toEqual(FACE);
    expect(viewOf(session({ photo: PHOTO }), false).cropperStart).toEqual(startingBox(PHOTO));
  });
});

describe('viewOf cut-out availability', () => {
  it.each([
    ['is available before any photo, so the control is not greyed out for nothing', {}, 'available'],
    ['is pending while the background is being lifted', { photo: PHOTO, isSegmenting: true }, 'pending'],
    ['is pending even if a stale matte is present', { photo: PHOTO, isSegmenting: true, matte: MATTE }, 'pending'],
    ['is unavailable when the segmenter finished with nothing', { photo: PHOTO }, 'unavailable'],
    ['is available once there is a matte', { photo: PHOTO, matte: MATTE }, 'available'],
  ] as const)('%s', (_, changes, expected) => {
    expect(viewOf(session(changes), false).cutOut).toBe(expected);
  });
});
