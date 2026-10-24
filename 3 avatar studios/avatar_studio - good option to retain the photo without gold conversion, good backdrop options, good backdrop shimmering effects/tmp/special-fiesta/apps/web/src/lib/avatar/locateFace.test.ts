import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forgetFaceLocator,
  locateFace,
  warmUpFaceLocator,
  type TasksVisionLoader,
} from './locateFace.js';
import type { Bitmap } from './photoSprite.js';

/**
 * ADR-054 — the face locator that replaced `headBoxFromMask`.
 *
 * The lesson of ADR-053 is written into the shape of these tests: the fix that was reverted passed a
 * suite of idealised synthetic *silhouettes* and then regressed a real photograph, because a circle
 * on a rectangle is not what a mask looks like. So nothing here invents an image and asks the code to
 * interpret it. The detector is a double that answers with keypoints, and what is asserted is the
 * arithmetic that turns keypoints into a crop — which is the only part this module is responsible
 * for — plus the thing that actually matters at the product level: **every way of failing returns
 * null**, because null is what routes the participant to the manual square instead of shipping a
 * confident wrong answer.
 */

afterEach(() => {
  forgetFaceLocator();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PHOTO: Bitmap = { width: 640, height: 480, pixels: new Uint8ClampedArray(640 * 480 * 4) };

interface FakeFace {
  keypoints?: { x: number; y: number }[];
  boundingBox?: { originX: number; originY: number; width: number; height: number };
}

/** jsdom has no canvas, so the 2D context the locator needs is supplied rather than assumed. */
function stubCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
}

/** A loader whose detector answers with exactly the faces given. */
function loaderFor(faces: FakeFace[]): TasksVisionLoader {
  stubCanvas();
  return async () => ({
    FilesetResolver: { forVisionTasks: async () => ({}) },
    FaceDetector: {
      createFromOptions: async () => ({ detect: () => ({ detections: faces }) }),
    },
  });
}

/** Eyes level, centred on (x, y) in normalised coordinates, `apart` normalised units apart. */
function eyesAt(centre: { x: number; y: number }, apart: number): FakeFace {
  return {
    keypoints: [
      { x: centre.x - apart / 2, y: centre.y },
      { x: centre.x + apart / 2, y: centre.y },
    ],
    boundingBox: { originX: 0, originY: 0, width: 0, height: 0 },
  };
}

describe('the crop, from the eye line', () => {
  it('centres horizontally on the midpoint between the eyes', async () => {
    const crop = await locateFace(PHOTO, loaderFor([eyesAt({ x: 0.5, y: 0.4 }, 0.06)]));

    expect(crop).not.toBeNull();
    // The eye midpoint is the middle of the photo, so the crop is centred on it.
    expect((crop?.x ?? 0) + (crop?.size ?? 0) / 2).toBeCloseTo(320, 0);
  });

  it('puts the eyes on the drawn avatars eye line, not in the middle of the crop', async () => {
    const crop = await locateFace(PHOTO, loaderFor([eyesAt({ x: 0.5, y: 0.4 }, 0.06)]));

    // EYE_LINE is 0.52: the eyes sit slightly below centre, which is what the drawn avatars do.
    const eyeY = 0.4 * 480;
    expect(crop?.y).toBeCloseTo(eyeY - (crop?.size ?? 0) * 0.52, 0);
  });

  it('scales with inter-ocular distance, so a closer face is cropped wider', async () => {
    const near = await locateFace(PHOTO, loaderFor([eyesAt({ x: 0.5, y: 0.4 }, 0.12)]));
    forgetFaceLocator();
    const far = await locateFace(PHOTO, loaderFor([eyesAt({ x: 0.5, y: 0.4 }, 0.06)]));

    // Twice the eye separation is twice the head, hence twice the crop. This is the whole reason
    // keypoints were chosen over the bounding box: it is a real measurement of the head's size.
    expect((near?.size ?? 0) / (far?.size ?? 1)).toBeCloseTo(2, 1);
    expect(near?.size).toBeCloseTo(0.12 * 640 * (3.65 / 0.72), 0);
  });

  it('uses the detector box as a floor, so a turned head is framed wide not cropped into', async () => {
    // Yaw squashes the apparent distance between the eyes; the box height does not shrink with it.
    const profile: FakeFace = {
      keypoints: [
        { x: 0.49, y: 0.4 },
        { x: 0.51, y: 0.4 },
      ],
      boundingBox: { originX: 200, originY: 100, width: 120, height: 200 },
    };

    const crop = await locateFace(PHOTO, loaderFor([profile]));

    // From the eyes alone this would be 0.02 * 640 * 5.07 ≈ 65 px — far too tight for a real head.
    expect(crop?.size).toBeCloseTo((200 * 1.45) / 0.72, 0);
  });

  it('never hands back a box that leaves the photograph', async () => {
    // A face right at the edge, close enough that the crop is wider than the room available.
    const crop = await locateFace(PHOTO, loaderFor([eyesAt({ x: 0.02, y: 0.02 }, 0.2)]));

    expect(crop?.x).toBeGreaterThanOrEqual(0);
    expect(crop?.y).toBeGreaterThanOrEqual(0);
    expect((crop?.x ?? 0) + (crop?.size ?? 0)).toBeLessThanOrEqual(PHOTO.width);
    expect((crop?.y ?? 0) + (crop?.size ?? 0)).toBeLessThanOrEqual(PHOTO.height);
  });

  it('takes the largest face, because in a group shot that is whose photo this is', async () => {
    const small = eyesAt({ x: 0.2, y: 0.4 }, 0.03);
    small.boundingBox = { originX: 0, originY: 0, width: 40, height: 40 };
    const large = eyesAt({ x: 0.7, y: 0.4 }, 0.09);
    large.boundingBox = { originX: 0, originY: 0, width: 160, height: 160 };

    const crop = await locateFace(PHOTO, loaderFor([small, large]));

    // Centred on the large face at x = 0.7, not on the bystander at 0.2.
    expect((crop?.x ?? 0) + (crop?.size ?? 0) / 2).toBeCloseTo(0.7 * 640, 0);
  });
});

describe('every way of failing returns null', () => {
  /*
   * This block is the point of the module. `headBoxFromMask` failed by producing a plausible box for
   * a photograph it had completely misread, and `AvatarStudio` then presented it as finished. Null
   * is what sends the participant to the manual square instead (ADR-036/054), so each failure mode
   * gets its own test rather than being assumed to collapse into the same branch.
   */

  it('when the detector finds no face at all', async () => {
    expect(await locateFace(PHOTO, loaderFor([]))).toBeNull();
  });

  it('when the face it found has no keypoints to measure', async () => {
    const eyeless: FakeFace = { boundingBox: { originX: 0, originY: 0, width: 80, height: 80 } };

    expect(await locateFace(PHOTO, loaderFor([eyeless]))).toBeNull();
  });

  it('when the two eyes land on the same pixel, which is not a measurement', async () => {
    expect(await locateFace(PHOTO, loaderFor([eyesAt({ x: 0.5, y: 0.4 }, 0)]))).toBeNull();
  });

  it('when the library cannot be fetched — an offline phone must not lose its photo', async () => {
    stubCanvas();
    const offline: TasksVisionLoader = async () => {
      throw new Error('Failed to fetch dynamically imported module');
    };

    await expect(locateFace(PHOTO, offline)).resolves.toBeNull();
  });

  it('when the runtime refuses to create a detector', async () => {
    stubCanvas();
    const refuses: TasksVisionLoader = async () => ({
      FilesetResolver: { forVisionTasks: async () => ({}) },
      FaceDetector: {
        createFromOptions: async () => {
          throw new Error('no WebAssembly');
        },
      },
    });

    await expect(locateFace(PHOTO, refuses)).resolves.toBeNull();
  });

  it('when there is no canvas to hand the detector', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const load = vi.fn(async () => ({
      FilesetResolver: { forVisionTasks: async () => ({}) },
      FaceDetector: { createFromOptions: async () => ({ detect: () => ({ detections: [] }) }) },
    }));

    expect(await locateFace(PHOTO, load)).toBeNull();
  });

  it('forgets a failed load, so the next photo tries again rather than inheriting it', async () => {
    stubCanvas();
    const failing = vi.fn(async (): Promise<never> => {
      throw new Error('flaky Wi-Fi');
    });

    await locateFace(PHOTO, failing);
    await locateFace(PHOTO, failing);

    // ADR-045 caught exactly this shape in the segmenter: a cached rejection poisoning every later
    // attempt, so one bad moment on beach Wi-Fi cost the participant the feature for the session.
    expect(failing).toHaveBeenCalledTimes(2);
  });
});

describe('the background warm-up', () => {
  it('loads the detector once and lets the first real photo reuse it', async () => {
    const load = vi.fn(loaderFor([eyesAt({ x: 0.5, y: 0.4 }, 0.06)]));

    warmUpFaceLocator(load);
    const crop = await locateFace(PHOTO, load);

    // The 2.7 MB is fetched while the participant is still choosing a photo (ADR-054), and choosing
    // one must not start a second download.
    expect(load).toHaveBeenCalledTimes(1);
    expect(crop).not.toBeNull();
  });

  it('swallows a failed warm-up: a head start is not a step', async () => {
    stubCanvas();
    const failing = vi.fn(async (): Promise<never> => {
      throw new Error('CDN down');
    });

    // No unhandled rejection, and nothing thrown at the caller.
    expect(() => warmUpFaceLocator(failing)).not.toThrow();
    await expect(locateFace(PHOTO, failing)).resolves.toBeNull();
  });
});
