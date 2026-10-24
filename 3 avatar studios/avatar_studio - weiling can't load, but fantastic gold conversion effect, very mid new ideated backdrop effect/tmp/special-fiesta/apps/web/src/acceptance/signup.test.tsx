import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLUSTER_CODES, messages, parseAvatarSprite, readAvatarLook } from '@psd/contracts';
import { SignUpPage } from '../routes-participant/SignUpPage.js';
import { renderWithProviders } from '../test-utils/renderWithProviders.js';
import { segmentSubject } from '../lib/avatar/segmentPhoto.js';

// ADR-033 — the segmentation model is never fetched in a test; it is stubbed here and
// answers null by default, which is the "no model available" path the other tests take.
vi.mock('../lib/avatar/segmentPhoto.js', () => ({
  segmentSubject: vi.fn(async () => null),
  forgetSegmenter: vi.fn(),
  loadTransformers: vi.fn(),
}));
const segmented = vi.mocked(segmentSubject);
import { installFetchStub } from '../test-utils/fetchStub.js';
import type { FetchStub } from '../test-utils/fetchStub.js';
import { participantFixture } from '../test-utils/fixtures.js';

/** fds.md §6.5 — F1 participant sign-up, exercised through the real S1 surface. */

let stub: FetchStub;

afterEach(() => {
  // Unmount first: a studio that holds a photo releases its object URL when it goes (ADR-227), and that
  // has to happen while the URL stub is still in place.
  cleanup();
  stub?.restore();
  vi.restoreAllMocks();
  // A FaceDetector stubbed by one test must not decide the next one's outcome.
  vi.unstubAllGlobals();
});

/**
 * ADR-031 — jsdom has no canvas, so the photo path is given one: a doubled bitmap of a
 * face on a plain background, which is what a passport photo is.
 */
beforeEach(() => {
  const size = 96;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const face = ((x - 48) / 26) ** 2 + ((y - 44) / 30) ** 2 <= 1;
      const at = (y * size + x) * 4;
      pixels[at] = face ? 224 : 232;
      pixels[at + 1] = face ? 168 : 232;
      pixels[at + 2] = face ? 120 : 232;
      pixels[at + 3] = 255;
    }
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({ data: pixels, width: size, height: size }),
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: size, height: size, close: vi.fn() })),
  );
  // jsdom has neither object URLs nor layout: the cropper needs both to exist.
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 240, height: 240, x: 0, y: 0, top: 0, left: 0, right: 240, bottom: 240,
    toJSON: () => ({}),
  });
});

function stubFor(signUp: { status: number; body: unknown }) {
  stub = installFetchStub({
    'GET /api/auth/session': { status: 401, body: { error: { message: messages.signInRequired } } },
    'GET /api/clusters': {
      body: { items: CLUSTER_CODES.map((code) => ({ code, displayName: code })) },
    },
    'POST /api/auth/participants/signup': signUp,
  });
}

/*
 * ADR-229 — a photograph reaches the draft only through Done in the photo dialog. Cancel discards it.
 */
async function doneWithPhoto(user: { click: (element: Element) => Promise<void> }) {
  await waitFor(() => expect(screen.getByTestId('photo-cropper__use')).toBeEnabled());
  await user.click(screen.getByTestId('photo-cropper__use'));
  await waitFor(() => expect(screen.queryByTestId('photo-dialog')).toBeNull());
}

/** ADR-027 — the trait rows are folded away at sign-up; open them first. */
async function openStudio(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('avatar-studio__toggle'));
}

async function fillValidForm(nickname: string) {
  const user = userEvent.setup();
  await user.type(screen.getByTestId('signup-form__nickname'), nickname);
  await user.type(screen.getByTestId('signup-form__pin'), '4821');
  await user.selectOptions(screen.getByTestId('signup-form__cluster'), 'CHROO');
  await user.click(screen.getByTestId('signup-form__gender-female'));
  const avatars = screen.getAllByTestId('signup-form__avatar');
  await user.click(avatars[2] as HTMLElement);
  return user;
}

describe('F1 — participant sign-up (S1)', () => {
  it('creates the participant and signs them in', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('BeachBoss');
    await user.click(screen.getByTestId('signup-form__submit'));

    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));
    const [call] = stub.callsTo('POST /api/auth/participants/signup');
    expect(call?.body).toEqual({
      nickname: 'BeachBoss',
      pin: '4821',
      clusterCode: 'CHROO',
      gender: 'female',
      avatarVariant: 3,
      // Choosing a character brings its kit: the Strategist wears charcoal on indigo.
      avatarLook: '3-1-2-1-3-333b49-33477a',
      avatarPhoto: null,
    });
  });

  it('sends the traits the participant picked, not only the character (ADR-021)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('SunnySide');
    await openStudio(user);
    await user.click(screen.getAllByTestId('avatar-studio__skinTone')[5] as HTMLElement);
    await user.click(screen.getAllByTestId('avatar-studio__hairColour')[9] as HTMLElement);
    await user.click(screen.getAllByTestId('avatar-studio__outfitColour')[2] as HTMLElement);
    await user.click(screen.getAllByTestId('avatar-studio__backdrop')[7] as HTMLElement);
    await user.click(screen.getAllByTestId('avatar-studio__hair-style')[3] as HTMLElement);
    // ADR-029 — and a build, which is the fifth number in the code.
    await user.click(screen.getAllByTestId('avatar-studio__build')[4] as HTMLElement);
    await user.click(screen.getByTestId('signup-form__submit'));

    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));
    expect(stub.callsTo('POST /api/auth/participants/signup')[0]?.body).toMatchObject({
      avatarVariant: 3,
      avatarLook: '6-4-10-1-5-0f8f76-12797f',
    });
  });

  it('keeps the face out of the beard row on the feminine build', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = userEvent.setup();
    // ADR-231 — the studio waits for a gender, so the gender is chosen before the traits are opened.
    await user.click(screen.getByTestId('signup-form__gender-female'));
    await openStudio(user);
    expect(screen.queryAllByTestId('avatar-studio__facial-hair')).toHaveLength(0);

    await user.click(screen.getByTestId('signup-form__gender-male'));
    expect(screen.getAllByTestId('avatar-studio__facial-hair')).toHaveLength(3);
    await user.click(screen.getAllByTestId('avatar-studio__facial-hair')[2] as HTMLElement);
    const preview = screen.getByTestId('avatar-studio__preview') as HTMLImageElement;
    expect(preview.src).toContain('data:image/svg+xml');
  });

  it('offers the male sprite set too, five variants either way (DC-006)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = userEvent.setup();
    await user.type(screen.getByTestId('signup-form__nickname'), 'SandSprinter');
    await user.type(screen.getByTestId('signup-form__pin'), '1357');
    await user.selectOptions(screen.getByTestId('signup-form__cluster'), 'ITC');
    await user.click(screen.getByTestId('signup-form__gender-male'));

    const avatars = screen.getAllByTestId('signup-form__avatar');
    expect(avatars).toHaveLength(5);
    await user.click(avatars[0] as HTMLElement);
    await user.click(screen.getByTestId('signup-form__submit'));

    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));
    expect(stub.callsTo('POST /api/auth/participants/signup')[0]?.body).toMatchObject({
      gender: 'male',
      avatarVariant: 1,
    });
  });

  it('lets the participant pick any colour for the shirt and the backdrop (ADR-028)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('ColourWheel');
    await openStudio(user);

    // The quick picks name themselves…
    await user.click(screen.getAllByTestId('avatar-studio__outfitColour')[4] as HTMLElement);
    expect(screen.getByTestId('avatar-studio__outfitColour-value')).toHaveTextContent('Crimson');

    // …and the wheel takes anything, including a colour no swatch offers.
    fireEvent.change(screen.getByTestId('avatar-studio__outfitColour-wheel'), {
      target: { value: '#ff7ac3' },
    });
    expect(screen.getByTestId('avatar-studio__outfitColour-value')).toHaveTextContent('#FF7AC3');
    fireEvent.change(screen.getByTestId('avatar-studio__backdrop-wheel'), {
      target: { value: '#0b0f1a' },
    });

    await user.click(screen.getByTestId('signup-form__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));
    expect(stub.callsTo('POST /api/auth/participants/signup')[0]?.body).toMatchObject({
      avatarLook: '3-1-2-1-3-ff7ac3-0b0f1a',
    });
  });

  it('cannot be handed a colour that is not a colour', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('SafeColour');
    await openStudio(user);
    await user.click(screen.getAllByTestId('avatar-studio__backdrop')[3] as HTMLElement);
    expect(screen.getByTestId('avatar-studio__backdrop-value')).toHaveTextContent('Gold');

    // The platform coerces anything it cannot read to black before the change fires, so
    // the studio never has to guess — and the wire boundary validates regardless.
    fireEvent.change(screen.getByTestId('avatar-studio__backdrop-wheel'), {
      target: { value: 'not-a-colour' },
    });
    expect(screen.getByTestId('avatar-studio__backdrop-value')).toHaveTextContent('#000000');
  });

  it('lets a participant wear their own photo instead of a character (ADR-031)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('PhotoFace');
    void user;
    expect(screen.getByTestId('avatar-studio__photo-state')).toHaveTextContent('find your face and cut out the background');

    const file = new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), { target: { files: [file] } });

    await doneWithPhoto(user);
    await user.click(screen.getByTestId('signup-form__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));
    const sent = stub.callsTo('POST /api/auth/participants/signup')[0]?.body as { avatarPhoto: string };
    expect(parseAvatarSprite(sent.avatarPhoto)).not.toBeNull();
  });

  /**
   * Replaces the default plain-wall photo with a busy one — a crowd, a café, a hawker centre.
   *
   * ADR-032's colour rules deliberately give up on these rather than carve holes out of them, which
   * is what makes it possible to tell "the model's mask was used" from "the colour rules happened to
   * work anyway".
   */
  function busyPhotoStub(): void {
    const size = 96;
    const pixels = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const at = (y * size + x) * 4;
        // Deterministic, high-contrast clutter: no two neighbouring regions share a colour, so the
        // frame-outward flood fill cannot cross the picture.
        pixels[at] = (x * 7 + y * 3) % 256;
        pixels[at + 1] = (x * 13 + y * 29) % 256;
        pixels[at + 2] = (x * 31 + y * 17) % 256;
        pixels[at + 3] = 255;
      }
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: pixels, width: size, height: size }),
    } as unknown as CanvasRenderingContext2D);
  }

  /** An oval matte, the shape the stubbed segmentation model hands back. */
  function ovalMask() {
    return {
      width: 96,
      height: 96,
      alpha: Uint8Array.from({ length: 96 * 96 }, (_unused, at) => {
        const [x, y] = [at % 96, Math.floor(at / 96)];
        return ((x - 48) / 30) ** 2 + ((y - 44) / 34) ** 2 <= 1 ? 255 : 0;
      }),
    };
  }

  it('upgrades the cut-out when the model answers (ADR-033)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    // The model is stubbed: what matters here is that the studio shows the quick answer
    // first and replaces it when the better one arrives.
    segmented.mockResolvedValueOnce(ovalMask());
    // ADR-054 — a face has to have been FOUND for the result to stand as finished, so this
    // is the Android Chrome shape: a cut-out from the model and a box from the browser. The
    // mask alone is deliberately no longer enough (see the test below).
    vi.stubGlobal(
      'FaceDetector',
      vi.fn(() => ({
        detect: vi.fn(async () => [{ boundingBox: { x: 20, y: 20, width: 40, height: 46 } }]),
      })),
    );
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('ModelFace');
    void user;
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() =>
      expect(screen.getByTestId('avatar-studio__photo-state')).toHaveTextContent(
        'Background removed. Move the square',
      ),
    );
  });

  it('offers the backdrop on a photo avatar, and repaints the sprite when it changes', async () => {
    /*
     * ADR-054 — the colour controls are hidden behind a photo because hair, skin and shirt are
     * photograph rather than paint. The backdrop is not: once the cut-out model has removed the
     * real background, the sprite paints those cells from its own palette, so the participant
     * genuinely owns that colour. It was only ever hidden because there was nothing to paint.
     */
    stubFor({ status: 201, body: { participant: participantFixture } });
    segmented.mockResolvedValueOnce(ovalMask());
    vi.stubGlobal(
      'FaceDetector',
      vi.fn(() => ({
        detect: vi.fn(async () => [{ boundingBox: { x: 20, y: 20, width: 40, height: 46 } }]),
      })),
    );
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('BackdropPick');
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() =>
      expect(screen.getByTestId('avatar-studio__photo-state')).toHaveTextContent(
        'Background removed. Move the square',
      ),
    );

    await doneWithPhoto(user);
    // The hair and shirt controls stay away; the backdrop is there.
    expect(screen.queryByTestId('avatar-studio__hair-style')).toBeNull();
    expect(screen.queryAllByTestId('avatar-studio__outfitColour')).toHaveLength(0);
    const swatches = screen.getAllByTestId('avatar-studio__backdrop');
    expect(swatches.length).toBeGreaterThan(1);

    const before = screen.getByTestId('avatar-studio__preview').getAttribute('src');
    await user.click(swatches[3] as HTMLElement);

    // The picture itself changed, not merely the stored look — which is the whole point: a
    // photo sprite carries its backdrop baked into its own palette.
    await waitFor(() =>
      expect(screen.getByTestId('avatar-studio__preview').getAttribute('src')).not.toBe(before),
    );
  });

  it('keeps the cut-out when the square is adjusted, instead of falling back to colour', async () => {
    /*
     * ADR-056 — the regression guard for a bug that was invisible until the square started being
     * shown every time. `useCrop` rebuilt the sprite WITHOUT the model's mask, so confirming or
     * nudging the crop silently threw the background removal away and dropped back to the colour
     * rules — which cannot cut a hawker centre out from behind anybody. Every existing test passed
     * throughout, because none of them re-cropped after a successful model run and then looked at
     * the background. Caught by rendering the recorded seed and looking at it.
     */
    stubFor({ status: 201, body: { participant: participantFixture } });
    /*
     * A BUSY photograph, which is load-bearing. The default stub is a face on a plain wall, and the
     * colour rules cut that out perfectly — so with a plain photo this test passes whether the mask
     * survives or not, which is exactly how the first version of it failed to catch the bug it was
     * written for. On a busy photo the colour rules correctly refuse to guess (ADR-032), so backdrop
     * corners can ONLY come from the model's mask.
     */
    busyPhotoStub();
    segmented.mockResolvedValueOnce(ovalMask());
    vi.stubGlobal(
      'FaceDetector',
      vi.fn(() => ({
        detect: vi.fn(async () => [{ boundingBox: { x: 20, y: 20, width: 40, height: 46 } }]),
      })),
    );
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('KeepsMask');
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(screen.getByTestId('photo-cropper')).toBeVisible());

    await user.click(screen.getByTestId('photo-cropper__use'));
    await waitFor(() => expect(screen.getByTestId('avatar-studio__photo-clear')).toBeVisible());
    await user.click(screen.getByTestId('signup-form__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));

    /*
     * The stubbed mask is an oval, so a model-cut sprite has all four corners as backdrop. Asserting
     * that rather than merely "the sprite changed" is the point: a colour-rule fallback on a busy
     * photograph leaves the corners full of background, which is the exact visible symptom.
     */
    const sent = stub.callsTo('POST /api/auth/participants/signup')[0]?.body as {
      avatarPhoto: string;
      avatarLook: string;
    };
    const sprite = parseAvatarSprite(sent.avatarPhoto);
    const rows = sprite?.rows ?? [];
    const palette = sprite?.palette ?? {};
    const backdrop = readAvatarLook(sent.avatarLook).backdrop.toLowerCase();
    const corners = [
      rows[0]?.charAt(0),
      rows[0]?.at(-1),
      rows.at(-1)?.charAt(0),
      rows.at(-1)?.at(-1),
    ];
    for (const key of corners) {
      expect(palette[String(key)]).toBe(backdrop);
    }
  });

  it('marks the photo as what is worn, not a character (ADR-060)', async () => {
    /*
     * Reported from the running app: opening the studio while wearing a photograph showed a
     * CHARACTER drawn as selected — a thing the participant was not wearing, marked as chosen. The
     * photo now has its own box and holds the selection; choosing a character moves it without
     * taking the photo off (ADR-059), and pressing the photo box again changes your mind.
     */
    stubFor({ status: 201, body: { participant: participantFixture } });
    segmented.mockResolvedValueOnce(ovalMask());
    vi.stubGlobal(
      'FaceDetector',
      vi.fn(() => ({
        detect: vi.fn(async () => [{ boundingBox: { x: 20, y: 20, width: 40, height: 46 } }]),
      })),
    );
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('WornBox');
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    await doneWithPhoto(user);
    await waitFor(() => expect(screen.getByTestId('avatar-studio__photo-option')).toBeVisible());

    // The photo holds the selection, and no character does.
    const photoBox = screen.getByTestId('avatar-studio__photo-option');
    expect(photoBox).toHaveAttribute('aria-pressed', 'true');
    const characters = screen.getAllByTestId('signup-form__avatar');
    expect(characters.every((box) => box.getAttribute('aria-pressed') === 'false')).toBe(true);

    // Choosing a character moves the selection, photo still on. Removal never waited for it (ADR-227).
    await user.click(characters[3] as HTMLElement);
    expect(photoBox).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByTestId('signup-form__avatar')[3]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('avatar-studio__photo-clear')).toBeEnabled();
    expect(screen.getByTestId('avatar-studio__preview')).toHaveAttribute('alt', 'Photo portrait');

    // And pressing the photo box again is how you change your mind.
    await user.click(screen.getByTestId('avatar-studio__photo-option'));
    expect(screen.getByTestId('avatar-studio__photo-option')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('avatar-studio__photo-clear')).toBeEnabled();
  });

  it('asks for the square when the model cut out a background but nothing found a face', async () => {
    /*
     * ADR-053/054 — the regression guard for the defect that produced an avatar of somebody's
     * hand. A mask proves the background was removed; it never proves the face was located.
     * The studio used to treat a successful mask as reason enough to present the result as
     * finished, so a badly framed crop was shipped silently with no way for the participant
     * to correct it. With no detector of any kind available, the honest answer is to ask.
     */
    stubFor({ status: 201, body: { participant: participantFixture } });
    segmented.mockResolvedValueOnce(ovalMask());
    // No browser detector, and jsdom cannot load MediaPipe, so nothing locates a face.
    vi.stubGlobal('FaceDetector', undefined);
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    await fillValidForm('NoFaceFound');
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() =>
      expect(screen.getByTestId('avatar-studio__photo-state')).toHaveTextContent(
        'We could not find your face. Put the square over it.',
      ),
    );
    // And the square is actually there to be placed, not merely mentioned (ADR-036).
    expect(screen.getByTestId('photo-cropper')).toBeVisible();
  });

  it('keeps the colour cut-out when the model cannot be fetched (ADR-033)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    segmented.mockResolvedValueOnce(null);
    // A face box was found, so there is nothing to ask the participant about: the colour
    // cut-out simply stands.
    vi.stubGlobal(
      'FaceDetector',
      vi.fn(() => ({ detect: vi.fn(async () => [{ boundingBox: { x: 20, y: 20, width: 40, height: 46 } }]) })),
    );
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('PlainFace');
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() =>
      expect(screen.getByTestId('avatar-studio__photo-state')).toHaveTextContent(
        'Background removed as best we could',
      ),
    );
    await doneWithPhoto(user);
    expect(screen.getByTestId('avatar-studio__photo-clear')).toBeVisible();
  });

  it('lets the participant place the square when nothing found a face (ADR-036)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    // No Shape Detection API and no model: the crop was a guess, so ask.
    segmented.mockResolvedValueOnce(null);
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('CropMe');
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });

    const cropper = await screen.findByTestId('photo-cropper');
    expect(cropper).toBeVisible();
    expect(screen.getByTestId('avatar-studio__photo-state')).toHaveTextContent(
      'Put the square over it',
    );

    // A stray move with nothing held does nothing at all.
    const box = screen.getByTestId('photo-cropper__box');
    fireEvent.pointerMove(box, { clientX: 10, clientY: 10, pointerId: 9 });

    // Drag it, then take it. Browsers that capture the pointer get to.
    const capture = vi.fn();
    Object.defineProperty(box, 'setPointerCapture', { value: capture, configurable: true });
    fireEvent.pointerDown(box, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(capture).toHaveBeenCalledWith(1);
    fireEvent.pointerMove(box, { clientX: 130, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(box, { pointerId: 1 });
    await user.click(screen.getByTestId('photo-cropper__use'));

    expect(screen.queryByTestId('photo-cropper')).toBeNull();
    // Done commits the square and closes the dialog (ADR-229).
    expect(screen.getByTestId('avatar-studio__photo-clear')).toBeVisible();

    await user.click(screen.getByTestId('signup-form__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));
    const sent = stub.callsTo('POST /api/auth/participants/signup')[0]?.body as { avatarPhoto: string };
    expect(parseAvatarSprite(sent.avatarPhoto)).not.toBeNull();
  });

  it('shows the square already on the found face, to confirm or to tweak (ADR-056)', async () => {
    /*
     * ADR-036/056 — this used to assert that a successful detection asked nothing of the
     * participant and merely left a "Choose the square myself" button for the curious. The square is
     * now shown straight away, already sitting where the detector framed the face: accepting it is
     * one tap, and correcting it is a drag rather than a dead end. It also makes the detector's
     * answer REVIEWABLE, which is what a silently-applied crop never was (ADR-053).
     */
    stubFor({ status: 201, body: { participant: participantFixture } });
    segmented.mockResolvedValueOnce(null);
    vi.stubGlobal(
      'FaceDetector',
      vi.fn(() => ({
        detect: vi.fn(async () => [{ boundingBox: { x: 20, y: 20, width: 40, height: 46 } }]),
      })),
    );
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('AutoCrop');
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });

    // The square is there without being asked for, and it says the face was found.
    await waitFor(() => expect(screen.getByTestId('photo-cropper')).toBeVisible());
    expect(screen.getByTestId('photo-cropper')).toHaveTextContent('This is the face we found');
    expect(screen.getByTestId('photo-cropper__box')).toBeVisible();

    // It can still be tweaked, and accepted with a single tap.
    const handle = screen.getByTestId('photo-cropper__handle');
    fireEvent.pointerDown(handle, { clientX: 200, clientY: 200, pointerId: 2 });
    fireEvent.pointerMove(handle, { clientX: 260, clientY: 260, pointerId: 2 });
    fireEvent.pointerCancel(handle, { pointerId: 2 });
    await user.click(screen.getByTestId('photo-cropper__use'));

    // Done commits the square and closes the dialog (ADR-229).
    expect(screen.queryByTestId('photo-cropper')).toBeNull();
    expect(screen.getByTestId('avatar-studio__photo-clear')).toBeVisible();
  });

  it('draws no figure until a gender is chosen, and sends Skipper when no character is picked (ADR-231)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    // No gender yet: no characters are drawn, so none can be picked or left unpicked by mistake.
    expect(screen.queryAllByTestId('signup-form__avatar')).toHaveLength(0);
    expect(screen.getByTestId('signup-form__avatar-wait')).toBeVisible();

    // The rest of the form, with no character touched.
    const user = userEvent.setup();
    await user.type(screen.getByTestId('signup-form__nickname'), 'FirstLook');
    await user.type(screen.getByTestId('signup-form__pin'), '4821');
    await user.selectOptions(screen.getByTestId('signup-form__cluster'), 'CHROO');
    await user.click(screen.getByTestId('signup-form__gender-female'));
    // Skipper is the first character, and it is the one shown as chosen.
    expect(screen.getAllByTestId('signup-form__avatar')).toHaveLength(5);
    expect(screen.getAllByTestId('signup-form__avatar')[0]).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('signup-form__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));
    expect(stub.callsTo('POST /api/auth/participants/signup')[0]?.body).toMatchObject({ avatarVariant: 1 });
  });

  it('keeps the characters on show while a photo is worn, but not the traits (ADR-059)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('PhotoOnly');
    expect(screen.getAllByTestId('signup-form__avatar')).toHaveLength(5);

    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    await doneWithPhoto(user);

    // Hair, skin and shirt are pixels of a photograph now: the controls that cannot
    // touch them are gone rather than dead (ADR-034).
    expect(screen.queryByTestId('avatar-studio__toggle')).toBeNull();
    expect(screen.queryAllByTestId('avatar-studio__outfitColour')).toHaveLength(0);
    // ADR-059 — the characters DO stay, because choosing one is how the photo comes off; and the
    // picker and selfie button go, because only one avatar source is worn at a time.
    expect(screen.getAllByTestId('signup-form__avatar')).toHaveLength(5);
    expect(screen.queryByTestId('avatar-studio__photo-label')).toBeNull();
    expect(screen.queryByTestId('avatar-studio__selfie-open')).toBeNull();
    // ADR-227 — removal needs no character first: the next one is selected when it is pressed.
    expect(screen.getByTestId('avatar-studio__photo-clear')).toBeEnabled();

    await user.click(screen.getAllByTestId('signup-form__avatar')[2] as HTMLElement);
    expect(screen.getByTestId('avatar-studio__photo-clear')).toBeEnabled();
    // Choosing a character does not itself take the photo off — the preview is still the photo.
    expect(screen.getByTestId('avatar-studio__preview')).toHaveAttribute('alt', 'Photo portrait');

    // Removal is pending until the save: the photo is held on the row, and the preview is a character.
    await user.click(screen.getByTestId('avatar-studio__photo-clear'));
    expect(screen.getByTestId('avatar-studio__photo-option')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('avatar-studio__preview')).not.toHaveAttribute('alt', 'Photo portrait');
    expect(screen.getByTestId('avatar-studio__photo-state')).toHaveTextContent('removed when you save');
    expect(screen.getByTestId('avatar-studio__toggle')).toBeVisible();
    expect(screen.getByTestId('avatar-studio__photo-label')).toBeVisible();
  });

  /*
   * ADR-079 — the regression guard for "the preview looked right and the save ignored it", at unit
   * speed. `e2e/cut-out-tuning.spec.ts` covers the same ground in a browser; this runs in a second, so
   * it is the one that will actually be run on every change.
   *
   * Two assertions, and the second is what made ADR-073 skip this commit in the first place: the
   * tuning must reach the submitted payload, AND turning a knob must not wipe the fallback character,
   * because committing the sprite through `onPhoto` would have done exactly that.
   */
  it('submits the photo as tuned, and keeps the chosen character (ADR-079)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('Untuned');
    // A character chosen before the photo, so the choice is there whatever the photo does (ADR-059).
    await user.click(screen.getAllByTestId('signup-form__avatar')[2] as HTMLElement);
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(screen.getByTestId('cut-out-controls')).toBeVisible());

    // "Leave it in" — the tuning is part of the photo, and Done is what commits it (ADR-229).
    await user.click(screen.getAllByTestId('cut-out-controls__background')[1] as HTMLElement);
    await waitFor(() =>
      expect(screen.getByTestId('cut-out-controls__state')).toHaveTextContent('Tap a choice'),
    );
    await doneWithPhoto(user);

    await user.click(screen.getByTestId('signup-form__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));

    const [call] = stub.callsTo('POST /api/auth/participants/signup');
    const sprite = parseAvatarSprite((call?.body as { avatarPhoto?: string }).avatarPhoto ?? '');
    expect(sprite).not.toBeNull();
    // Nothing was cut out, so neither the backdrop nor the ink index may appear in the sent rows.
    const colours = Object.keys(sprite?.palette ?? {}).length;
    const painted = (sprite?.rows ?? []).join('');
    expect(painted).not.toContain((colours - 2).toString(16));
    expect(painted).not.toContain((colours - 1).toString(16));
  });

  it('puts the character back when the photo is removed (ADR-031)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('NoPhoto');
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    await doneWithPhoto(user);
    // ADR-059 — an avatar is never nothing, so the character to fall back to is chosen first.
    await user.click(screen.getAllByTestId('signup-form__avatar')[1] as HTMLElement);
    await user.click(screen.getByTestId('avatar-studio__photo-clear'));

    expect(screen.queryByTestId('avatar-studio__photo-clear')).toBeNull();
    await user.click(screen.getByTestId('signup-form__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));
    expect(stub.callsTo('POST /api/auth/participants/signup')[0]?.body).toMatchObject({
      avatarPhoto: null,
    });
  });

  /*
   * ADR-229 — the photo's dialog. The conversion stays in it until Done. Cancel throws it away, and the dialog
   * sits outside the form, so nothing in it can submit the sign-up.
   */
  it('keeps the conversion in the dialog until Done, and Cancel discards it (ADR-229)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');
    const user = await fillValidForm('Discarded');

    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(screen.getByTestId('photo-cropper__use')).toBeVisible());

    // The dialog is not inside the form, and the photo has not reached the draft yet.
    expect(screen.getByTestId('photo-dialog').closest('form')).toBeNull();
    expect(screen.queryByTestId('avatar-studio__photo-clear')).toBeNull();

    await user.click(screen.getByTestId('photo-cropper__cancel'));
    expect(screen.queryByTestId('photo-dialog')).toBeNull();
    expect(screen.queryByTestId('avatar-studio__photo-clear')).toBeNull();
    expect(screen.getByTestId('avatar-studio__photo-label')).toBeVisible();

    await user.click(screen.getByTestId('signup-form__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));
    expect(stub.callsTo('POST /api/auth/participants/signup')[0]?.body).toMatchObject({ avatarPhoto: null });
  });

  it('opens on Replace with focus inside, closes on Escape, and leaves the photo worn (ADR-229)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');
    const user = await fillValidForm('Replaced');
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    await doneWithPhoto(user);

    await user.click(screen.getByTestId('avatar-studio__photo-replace'));
    expect(screen.getByTestId('photo-dialog')).toBeVisible();
    expect(screen.getByTestId('avatar-studio__photo-choose')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('photo-dialog')).toBeNull();
    expect(screen.getByTestId('avatar-studio__photo-replace')).toHaveFocus();
    expect(screen.getByTestId('avatar-studio__photo-clear')).toBeVisible();
  });

  /*
   * ADR-229 — Cancel is discard. A conversion that is still running when the participant cancels must not bring
   * the dialog back, whichever step it was in when it finishes.
   */
  it('drops a picture that finishes reading after Cancel (ADR-229)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');
    await fillValidForm('Abandoned');

    let finishReading: (bitmap: { width: number; height: number; close: () => void }) => void = () => undefined;
    vi.mocked(globalThis.createImageBitmap).mockImplementationOnce(
      () => new Promise((resolve) => { finishReading = resolve; }) as never,
    );
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() => expect(screen.getByTestId('avatar-studio__photo-cancel')).toBeVisible());

    fireEvent.click(screen.getByTestId('avatar-studio__photo-cancel'));
    finishReading({ width: 96, height: 96, close: () => undefined });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByTestId('photo-dialog')).toBeNull();
    expect(screen.queryByTestId('photo-cropper')).toBeNull();
    expect(screen.queryByTestId('avatar-studio__photo-clear')).toBeNull();
  });

  it('drops a cut-out that finishes after Cancel, before the square opens (ADR-229)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');
    await fillValidForm('Withdrawn');

    let finishCutOut: (subject: null) => void = () => undefined;
    segmented.mockImplementationOnce(() => new Promise<null>((resolve) => { finishCutOut = resolve; }));
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['pretend jpeg'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() =>
      expect(screen.getByTestId('avatar-studio__photo-state')).toHaveTextContent('Tidying up the background'),
    );

    fireEvent.click(screen.getByTestId('avatar-studio__photo-cancel'));
    finishCutOut(null);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByTestId('photo-dialog')).toBeNull();
    expect(screen.queryByTestId('photo-cropper')).toBeNull();
  });

  /*
   * ADR-227 / N6 — a photograph's object URL is released when its conversion ends. Nothing did that before, so
   * each conversion left its object URL behind for the life of the page. ADR-229 makes Cancel the end of one.
   */
  it('releases the photograph when the dialog is cancelled (N6)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    await fillValidForm('Cancelled');
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['first'], 'first.jpg', { type: 'image/jpeg' })] },
    });
    // Wait for the square: that is the last step of a conversion, when the original is kept.
    await waitFor(() => expect(screen.getByTestId('cut-out-controls')).toBeVisible());
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    // Cancel discards the conversion, and with it the original photograph (ADR-229, N6).
    fireEvent.click(screen.getByTestId('photo-cropper__cancel'));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo'));
    expect(screen.queryByTestId('photo-dialog')).toBeNull();
    expect(screen.getByTestId('avatar-studio__photo-label')).toBeVisible();
  });


  it('says so when the photo cannot be read (ADR-031)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    vi.mocked(globalThis.createImageBitmap).mockRejectedValueOnce(new Error('not an image'));
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    await fillValidForm('BadPhoto');
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), {
      target: { files: [new File(['not an image'], 'me.txt', { type: 'text/plain' })] },
    });

    await waitFor(() =>
      expect(screen.getByTestId('avatar-studio__photo-state')).toHaveTextContent('could not be read'),
    );
    expect(screen.queryByTestId('avatar-studio__photo-clear')).toBeNull();

    // Opening the picker and cancelling leaves everything as it was.
    fireEvent.change(screen.getByTestId('avatar-studio__photo'), { target: { files: [] } });
    expect(screen.queryByTestId('avatar-studio__photo-clear')).toBeNull();
  });

  it('turns a space in the nickname into the underscore the participant meant', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('Ah Seng lah');
    expect(screen.getByTestId('signup-form__nickname')).toHaveValue('Ah_Seng_lah');

    await user.click(screen.getByTestId('signup-form__submit'));
    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));
    expect(stub.callsTo('POST /api/auth/participants/signup')[0]?.body).toMatchObject({
      nickname: 'Ah_Seng_lah',
    });
  });

  it('keeps the colours the participant chose when they try another character', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('ColourKeeper');
    await openStudio(user);
    await user.click(screen.getAllByTestId('avatar-studio__outfitColour')[5] as HTMLElement);
    await user.click(screen.getAllByTestId('avatar-studio__backdrop')[8] as HTMLElement);
    // Trying on two more characters must not repaint the shirt or the backdrop.
    await user.click(screen.getAllByTestId('signup-form__avatar')[4] as HTMLElement);
    await user.click(screen.getAllByTestId('signup-form__avatar')[0] as HTMLElement);
    await user.click(screen.getByTestId('signup-form__submit'));

    await waitFor(() => expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1));
    expect(stub.callsTo('POST /api/auth/participants/signup')[0]?.body).toMatchObject({
      avatarVariant: 1,
      avatarLook: '3-1-2-1-3-7b2d3a-46505e',
    });
  });

  it('shows the FDS message when the nickname is taken', async () => {
    stubFor({ status: 409, body: { error: { message: messages.nicknameInvalid, field: 'nickname' } } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = await fillValidForm('BeachBoss');
    await user.click(screen.getByTestId('signup-form__submit'));

    expect(await screen.findByTestId('signup-form__error')).toHaveTextContent(
      messages.nicknameInvalid,
    );
  });

  it('rejects a short PIN before touching the network', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = userEvent.setup();
    await user.type(screen.getByTestId('signup-form__nickname'), 'BeachBoss');
    await user.type(screen.getByTestId('signup-form__pin'), '48');
    await user.selectOptions(screen.getByTestId('signup-form__cluster'), 'CHROO');
    await user.click(screen.getByTestId('signup-form__gender-female'));
    await user.click(screen.getAllByTestId('signup-form__avatar')[0] as HTMLElement);
    await user.click(screen.getByTestId('signup-form__submit'));

    expect(await screen.findByTestId('signup-form__error')).toHaveTextContent(messages.pinInvalid);
    expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(0);
  });

  it('complains about the first empty field in reading order, and goes there (ADR-027)', async () => {
    stubFor({ status: 201, body: { participant: participantFixture } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = userEvent.setup();
    await user.click(screen.getByTestId('signup-form__submit'));

    // Not the cluster three fields below: the nickname, which is where the eye starts.
    expect(await screen.findByTestId('signup-form__error')).toHaveTextContent(
      messages.nicknameInvalid,
    );
    expect(screen.getByTestId('signup-form__error-hint')).toHaveTextContent('Three characters or more');
    expect(document.activeElement).toBe(screen.getByTestId('signup-form__nickname'));

    // Fill the fields above it and the complaint moves down the form, one field at a time.
    await user.type(screen.getByTestId('signup-form__nickname'), 'BeachBoss');
    await user.type(screen.getByTestId('signup-form__pin'), '4821');
    await user.click(screen.getByTestId('signup-form__submit'));
    expect(await screen.findByTestId('signup-form__error')).toHaveTextContent(messages.clusterRequired);
    expect(document.activeElement).toBe(screen.getByTestId('signup-form__cluster'));

    await user.selectOptions(screen.getByTestId('signup-form__cluster'), 'CHROO');
    await user.click(screen.getByTestId('signup-form__submit'));
    expect(await screen.findByTestId('signup-form__error')).toHaveTextContent(messages.genderRequired);
    expect(document.activeElement).toBe(screen.getByTestId('signup-form__gender-male'));
  });

  it('says which nickname problem it is (ADR-027)', async () => {
    stubFor({ status: 409, body: { error: { message: messages.nicknameInvalid, field: 'nickname' } } });
    renderWithProviders(<SignUpPage />);
    await screen.findByTestId('signup-form__cluster');

    const user = userEvent.setup();
    // Bad characters are impossible to type (space becomes _), so the two cases a
    // participant meets are "too short" and "taken" — and they used to read identically.
    await user.type(screen.getByTestId('signup-form__nickname'), 'Jo');
    await user.click(screen.getByTestId('signup-form__submit'));
    expect(await screen.findByTestId('signup-form__error-hint')).toHaveTextContent(
      'Three characters or more',
    );

    await user.type(screen.getByTestId('signup-form__nickname'), 'sy');
    await user.type(screen.getByTestId('signup-form__pin'), '4821');
    await user.selectOptions(screen.getByTestId('signup-form__cluster'), 'CHROO');
    await user.click(screen.getByTestId('signup-form__gender-female'));
    await user.click(screen.getAllByTestId('signup-form__avatar')[0] as HTMLElement);
    await user.click(screen.getByTestId('signup-form__submit'));

    expect(await screen.findByTestId('signup-form__error-hint')).toHaveTextContent(
      '"Josy" is taken. Try Josy_2.',
    );
    expect(document.activeElement).toBe(screen.getByTestId('signup-form__nickname'));
  });
});
