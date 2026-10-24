import { AVATAR_SPRITE_SIZE, formatAvatarSprite } from '@psd/contracts';
import { required } from '../required.js';
import {
  DEFAULT_TUNING,
  keepEverything,
  maskFromModel,
  tunedMask,
  type CutOutTuning,
} from './cutOut.js';
import type { Bitmap, CropBox, SubjectMask } from './types.js';

/**
 * ADR-031 — a photograph, turned into an indexed sprite (128×128 since ADR-037), in the
 * browser.
 *
 * The pipeline is deliberately plain arithmetic over pixels: find the face, crop it to
 * the same framing the drawn avatars use, average each cell, cut the colours down to a
 * handful, replace the studio background with the participant's backdrop, and ink the
 * contour. No model, no service, no upload — the photo is read from the file the person
 * chose and thrown away, and only the sprite is saved.
 *
 * Everything here is a pure function over an RGBA array so it can be tested without a
 * canvas; `readPhotoBitmap` is the thin part that needs a browser.
 */

/**
 * ADR-072 — `Bitmap`, `CropBox` and `SubjectMask` live in `types.ts` so that `cutOut.ts` can have
 * them without importing this module, which imports `cutOut.ts`. Re-exported here because every
 * caller already asks this module for them, and a type's address is not the interesting part of
 * this change.
 */
export type { Bitmap, CropBox, SubjectMask } from './types.js';

interface Colour {
  r: number;
  g: number;
  b: number;
}

/** The drawn avatars put the eyes 52 % down and give the head 72 % of the height. */
const EYE_LINE = 0.52;
const HEAD_SHARE = 0.72;
/** Fourteen from the photo, plus the backdrop and the ink line: exactly the cap. */
const PHOTO_COLOURS = 14;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function pixelAt(bitmap: Bitmap, x: number, y: number): Colour {
  const offset = (y * bitmap.width + x) * 4;
  return {
    r: required(bitmap.pixels[offset], 'red'),
    g: required(bitmap.pixels[offset + 1], 'green'),
    b: required(bitmap.pixels[offset + 2], 'blue'),
  };
}

/**
 * The classic RGB skin rule. It is not a face detector, but a passport photo is a face on
 * a plain background, and the bounding box of "skin" is the face to within a few pixels.
 */
function isSkin({ r, g, b }: Colour): boolean {
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return r > 95 && g > 40 && b > 20 && spread > 15 && r > g && r > b && Math.abs(r - g) > 15;
}

interface SkinProfile {
  rows: Map<number, { count: number; sumX: number }>;
  step: number;
  total: number;
}

function skinProfile(bitmap: Bitmap): SkinProfile {
  const step = Math.max(1, Math.floor(Math.min(bitmap.width, bitmap.height) / 200));
  const rows = new Map<number, { count: number; sumX: number }>();
  let total = 0;
  for (let y = 0; y < bitmap.height; y += step) {
    for (let x = 0; x < bitmap.width; x += step) {
      if (!isSkin(pixelAt(bitmap, x, y))) continue;
      const row = rows.get(y) ?? { count: 0, sumX: 0 };
      rows.set(y, { count: row.count + 1, sumX: row.sumX + x });
      total += 1;
    }
  }
  return { rows, step, total };
}

/**
 * Crop the photo to the head from skin colour alone, in the framing the drawn avatars use.
 *
 * The head is measured across, not down: the widest band of skin is the cheekbones, and a
 * head is about 1.45 times as tall as it is wide. Measuring the skin box top to bottom
 * looks obvious and is wrong — an open collar puts the neck and the chest in the box, the
 * "face" comes out twice as tall as it is, and the crop slides down until the crown is
 * cut off.
 *
 * ADR-054 — this is the LAST resort for the instant preview, not a way of framing an avatar
 * anybody keeps. There used to be a `headBoxFromMask` above it that inferred a head from the
 * segmentation silhouette; it is gone, because a mask says where a *person* is and can never
 * say where a *face* is. Framed head-to-waist it called the whole person a head, and with a
 * raised arm it measured from the hand holding the phone (ADR-053). When no real detector
 * finds a face the participant is asked to place the square instead.
 */
export function faceBox(bitmap: Bitmap): CropBox {
  const shortest = Math.min(bitmap.width, bitmap.height);
  const centred = {
    x: (bitmap.width - shortest) / 2,
    y: (bitmap.height - shortest) / 2,
    size: shortest,
  };
  const profile = skinProfile(bitmap);
  // Too little skin to trust — an unlit photo, or not a face. Centre and hope.
  if (profile.total < 64) return centred;

  // Only the upper part of the skin counts. An open collar puts the neck and the chest in
  // the picture, and they are wider than the face: measured over everything, the
  // "cheekbones" land on the collarbone and the crop slides down off the top of the head.
  const ys = [...profile.rows.keys()].sort((a, b) => a - b);
  const top = required(ys[Math.floor(ys.length * 0.02)], 'top skin row');
  const bottom = required(ys[Math.floor(ys.length * 0.98)], 'bottom skin row');
  const head = [...profile.rows.entries()].filter(([y]) => y <= top + (bottom - top) * 0.55);
  const widest = Math.max(...head.map(([, row]) => row.count));
  const cheekRows = head.filter(([, row]) => row.count >= widest * 0.85);
  const cheekY = median(cheekRows.map(([y]) => y));
  const centreX = median(cheekRows.map(([, row]) => row.sumX / row.count));

  const faceWidth = widest * profile.step;
  const headHeight = faceWidth * 1.8;
  const size = clamp(headHeight / HEAD_SHARE, shortest * 0.3, shortest);
  // The eyes sit a little above the cheekbones.
  const eyeY = cheekY - headHeight * 0.05;
  return {
    x: clamp(centreX - size / 2, 0, Math.max(0, bitmap.width - size)),
    y: clamp(eyeY - size * EYE_LINE, 0, Math.max(0, bitmap.height - size)),
    size,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return required(sorted[Math.floor(sorted.length / 2)], 'median');
}

/** Average each sprite cell over the patch of photo behind it. */
function resample(bitmap: Bitmap, box: CropBox, size: number): Colour[] {
  const cells: Colour[] = [];
  const cell = box.size / size;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const from = { x: box.x + column * cell, y: box.y + row * cell };
      cells.push(averagePatch(bitmap, from, cell));
    }
  }
  return cells;
}

/**
 * The average of the patch, pulled toward its darkest sample.
 *
 * A plain average is what erases a face at this size: an eye is two cells across, and
 * averaging it with the cheek around it leaves a pale smudge. Mixing in the darkest
 * sample keeps lashes, nostrils, lips and the line of the jaw, which is what the eye
 * recognises a person by.
 */
function averagePatch(bitmap: Bitmap, from: { x: number; y: number }, cell: number): Colour {
  const step = Math.max(1, Math.floor(cell / 4));
  let total = { r: 0, g: 0, b: 0 };
  let darkest = { r: 255, g: 255, b: 255 };
  let darkestSum = 765;
  let count = 0;
  for (let y = from.y; y < from.y + cell; y += step) {
    for (let x = from.x; x < from.x + cell; x += step) {
      const sample = pixelAt(
        bitmap,
        clamp(Math.floor(x), 0, bitmap.width - 1),
        clamp(Math.floor(y), 0, bitmap.height - 1),
      );
      total = { r: total.r + sample.r, g: total.g + sample.g, b: total.b + sample.b };
      const sum = sample.r + sample.g + sample.b;
      if (sum < darkestSum) {
        darkestSum = sum;
        darkest = sample;
      }
      count += 1;
    }
  }
  const mean = { r: total.r / count, g: total.g / count, b: total.b / count };
  const pull = 0.3;
  return {
    r: mean.r * (1 - pull) + darkest.r * pull,
    g: mean.g * (1 - pull) + darkest.g * pull,
    b: mean.b * (1 - pull) + darkest.b * pull,
  };
}

/** A little more contrast and colour, because averaging flattens both. */
function enhance(cell: Colour): Colour {
  const lift = (value: number) => clamp((value / 255 - 0.5) * 1.1 + 0.5, 0, 1) * 255;
  const [r, g, b] = [lift(cell.r), lift(cell.g), lift(cell.b)];
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const saturate = (value: number) => clamp(grey + (value - grey) * 1.2, 0, 255);
  return { r: saturate(r), g: saturate(g), b: saturate(b) };
}

/**
 * An unsharp mask over the 64×64 grid. Averaging twenty source pixels into one cell wipes
 * out eyes, nostrils and lips — the features that make a face that face — so the
 * difference from the local blur is added back before the palette is chosen.
 */
function sharpen(cells: Colour[], size: number, amount: number): Colour[] {
  return cells.map((cell, index) => {
    const [x, y] = [index % size, Math.floor(index / size)];
    let total = { r: 0, g: 0, b: 0 };
    let count = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const at = clamp(y + dy, 0, size - 1) * size + clamp(x + dx, 0, size - 1);
        const neighbour = required(cells[at], 'neighbour cell');
        total = { r: total.r + neighbour.r, g: total.g + neighbour.g, b: total.b + neighbour.b };
        count += 1;
      }
    }
    const blur = { r: total.r / count, g: total.g / count, b: total.b / count };
    return {
      r: clamp(cell.r + (cell.r - blur.r) * amount, 0, 255),
      g: clamp(cell.g + (cell.g - blur.g) * amount, 0, 255),
      b: clamp(cell.b + (cell.b - blur.b) * amount, 0, 255),
    };
  });
}

/**
 * The palette is chosen from the face, twice over. Median cut counts cells, and a
 * portrait is mostly hair, shoulders and background — left alone it spends its colours
 * there and renders the skin as one flat slab.
 */
function faceWeighted(subject: Colour[], size: number, background: Uint8Array): Colour[] {
  const middle = (size - 1) / 2;
  const weighted = [...subject];
  let index = 0;
  for (let cell = 0; cell < size * size; cell += 1) {
    if (background[cell] === 1) continue;
    const [x, y] = [cell % size, Math.floor(cell / size)];
    const inFace = Math.abs(x - middle) < size * 0.22 && Math.abs(y - middle) < size * 0.26;
    if (inFace) weighted.push(required(subject[index], 'subject cell'));
    index += 1;
  }
  return weighted;
}

function channelRange(bucket: Colour[], channel: keyof Colour): number {
  const values = bucket.map((cell) => cell[channel]);
  return Math.max(...values) - Math.min(...values);
}

function widestChannel(bucket: Colour[]): keyof Colour {
  const ranges: [keyof Colour, number][] = [
    ['r', channelRange(bucket, 'r')],
    ['g', channelRange(bucket, 'g')],
    ['b', channelRange(bucket, 'b')],
  ];
  return required(ranges.sort((a, b) => b[1] - a[1])[0], 'widest channel')[0];
}

/**
 * Median cut: split the colour cloud along its widest axis until there are enough
 * buckets, then take the average of each. It is the classic answer and it keeps skin
 * tones, which a fixed palette does not.
 */
function medianCut(cells: Colour[], wanted: number): Colour[] {
  let buckets: Colour[][] = [cells];
  while (buckets.length < wanted) {
    const widest = [...buckets].sort(
      (a, b) => channelRange(b, widestChannel(b)) - channelRange(a, widestChannel(a)),
    )[0];
    if (widest === undefined || widest.length < 2 || channelRange(widest, widestChannel(widest)) < 8) break;
    const channel = widestChannel(widest);
    const sorted = [...widest].sort((a, b) => a[channel] - b[channel]);
    const middle = Math.floor(sorted.length / 2);
    buckets = buckets.filter((bucket) => bucket !== widest);
    buckets.push(sorted.slice(0, middle), sorted.slice(middle));
  }
  return buckets.map(averageOf);
}

function averageOf(bucket: Colour[]): Colour {
  const total = bucket.reduce(
    (sum, cell) => ({ r: sum.r + cell.r, g: sum.g + cell.g, b: sum.b + cell.b }),
    { r: 0, g: 0, b: 0 },
  );
  return { r: total.r / bucket.length, g: total.g / bucket.length, b: total.b / bucket.length };
}

/** The four cells orthogonally next to this one, inside the grid. */
function neighboursOf(cell: number, size: number): number[] {
  const [x, y] = [cell % size, Math.floor(cell / size)];
  const found: number[] = [];
  if (x > 0) found.push(cell - 1);
  if (x < size - 1) found.push(cell + 1);
  if (y > 0) found.push(cell - size);
  if (y < size - 1) found.push(cell + size);
  return found;
}

/** Hue in degrees and chroma in levels — the two numbers that say "this is the wall". */
function hueChroma({ r, g, b }: Colour): { hue: number; chroma: number } {
  const [high, low] = [Math.max(r, g, b), Math.min(r, g, b)];
  const chroma = high - low;
  if (chroma < 1) return { hue: 0, chroma };
  const sector = high === r ? (g - b) / chroma : high === g ? 2 + (b - r) / chroma : 4 + (r - g) / chroma;
  return { hue: (sector * 60 + 360) % 360, chroma };
}

function hueApart(a: number, b: number): number {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
}

function distance(a: Colour, b: Colour): number {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

function nearest(palette: Colour[], cell: Colour): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  palette.forEach((entry, index) => {
    const measured = distance(entry, cell);
    if (measured < bestDistance) {
      bestDistance = measured;
      best = index;
    }
  });
  return best;
}

/**
 * Drops single-cell specks: a cell that matches none of its four neighbours becomes
 * whichever neighbour is most common. Quantisation leaves grey freckles all over a face
 * otherwise, and nothing that matters at this size is one cell wide.
 */
function despeckle(indices: number[], size: number): number[] {
  return indices.map((index, cell) => {
    const neighbours = neighboursOf(cell, size).map((at) => required(indices[at], 'neighbour'));
    if (neighbours.includes(index)) return index;
    const tally = new Map<number, number>();
    for (const neighbour of neighbours) tally.set(neighbour, (tally.get(neighbour) ?? 0) + 1);
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    return required(ranked[0], 'most common neighbour')[0];
  });
}

/**
 * The wall colour, as the median of the border ring.
 *
 * The median matters: in a bust the subject's shoulders fill the bottom corners, and any
 * average — or worse, a colour interpolated between the four corners — decides the wall
 * turns navy at the bottom and then refuses to remove the grey it actually is.
 */
function wallColour(cells: Colour[], size: number): Colour {
  const ring: Colour[] = [];
  for (let at = 0; at < size; at += 1) {
    ring.push(
      required(cells[at], 'cell'),
      required(cells[(size - 1) * size + at], 'cell'),
      required(cells[at * size], 'cell'),
      required(cells[at * size + size - 1], 'cell'),
    );
  }
  const channel = (key: keyof Colour) => median(ring.map((colour) => colour[key]));
  return { r: channel('r'), g: channel('g'), b: channel('b') };
}

/**
 * ADR-032 — which cells are backdrop.
 *
 * A booth wall has a hotspot behind the head, a shadow down one side, a vignette and
 * sensor noise, and a phone photo blurs its edges — so a single colour with a tolerance
 * either stops halfway up the gradient or, widened until it does not, walks through the
 * soft edge and eats the shirt. Three rules together do hold:
 *
 *   1. start from the frame, because that is wall by definition;
 *   2. step only to a neighbour that is close to the wall *already found there*, which
 *      follows a gradient but will not cross an edge;
 *   3. and only if the cell still looks like the wall — near its median colour, or the
 *      same hue as it, which is what a hotspot or a shadow still is.
 *
 * Skin is never crossed under any of them.
 */
function backgroundMask(cells: Colour[], size: number): Uint8Array {
  const wall = wallColour(cells, size);
  const tone = hueChroma(wall);
  const isWallHued = (colour: Colour) => {
    if (tone.chroma < 12) return false;
    const other = hueChroma(colour);
    return other.chroma >= 8 && hueApart(other.hue, tone.hue) <= 28;
  };
  const couldBeWall = (colour: Colour) =>
    !isSkin(colour) && (distance(colour, wall) <= DRIFT_TOLERANCE || isWallHued(colour));

  const mask = new Uint8Array(size * size);
  for (let at = 0; at < size; at += 1) {
    for (const cell of [at, (size - 1) * size + at, at * size, at * size + size - 1]) {
      const colour = required(cells[cell], 'cell');
      if (!isSkin(colour) && distance(colour, wall) <= WALL_TOLERANCE) mask[cell] = 1;
    }
  }
  const grown = growAlongWall(cells, mask, { size, couldBeWall });
  const covered = grown.reduce((total: number, cell) => total + cell, 0);
  // Two ways the colour rules can be wrong, and the same answer to both: leave the photo
  // alone (ADR-034). If everything matched, this is a picture of a wall, not a portrait.
  // If almost nothing did, the background is a café or a crowd — removing the handful of
  // cells that happened to match the frame would carve holes out of it, and a pixelated
  // selfie with its background is a perfectly good avatar.
  const tooMuch = covered > size * size * 0.97;
  const tooLittle = covered < size * size * 0.08;
  return tooMuch || tooLittle ? new Uint8Array(size * size) : grown;
}

/**
 * Grows the mask outward, comparing each candidate to the average of its *masked
 * neighbours* rather than to any fixed colour: the wall changes slowly, so every step is
 * small, while the edge of a subject — even a blurred one — is a jump the step limit will
 * not take.
 */
function growAlongWall(
  cells: Colour[],
  mask: Uint8Array,
  frame: { size: number; couldBeWall: (colour: Colour) => boolean },
): Uint8Array {
  const { size, couldBeWall } = frame;
  for (let pass = 0; pass < size; pass += 1) {
    let added = 0;
    for (let cell = 0; cell < size * size; cell += 1) {
      if (mask[cell] === 1) continue;
      const colour = required(cells[cell], 'cell');
      if (!couldBeWall(colour)) continue;
      const neighbours = neighboursOf(cell, size).filter((at) => mask[at] === 1);
      if (neighbours.length === 0) continue;
      const here = averageOf(neighbours.map((at) => required(cells[at], 'cell')));
      if (distance(colour, here) > STEP_TOLERANCE) continue;
      mask[cell] = 1;
      added += 1;
    }
    if (added === 0) break;
  }
  return mask;
}

/** Seeding, about 30 per channel: noise and fabric texture, not a shirt. */
const WALL_TOLERANCE = 2800;
/** One step along a gradient, about 15 per channel: never across an edge. */
const STEP_TOLERANCE = 700;
/** How far the wall may drift in total: a hotspot or a shadow, not clothing. */
const DRIFT_TOLERANCE = 12000;

function hex({ r, g, b }: Colour): string {
  return [r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('');
}

interface SpriteInput {
  backdrop: string;
  ink: string;
  /** ADR-033 — a subject mask from the segmentation model, when one could be had. */
  subject?: SubjectMask | null;
  /** ADR-034 — a crop from something that actually finds faces, when one could be had. */
  crop?: CropBox | null;
  /** ADR-072 — the three cut-out numbers. Omitted means the defaults, which is most of the time. */
  tuning?: CutOutTuning | null;
}

/**
 * ADR-072/073 — the half of the pipeline a cut-out knob cannot change.
 *
 * Resampling depends on the photograph and the square and on nothing else, so when a participant
 * moves a knob the cells are the same cells. That is the reason for the seam, and it is worth being
 * precise about the size of the prize: measured over a 478×640 photograph, the whole pipeline is
 * ~104 ms, of which this is **5.8 ms** and `paintPrepared` is ~95 ms. The expensive work is
 * quantising and painting, and that genuinely does depend on the mask — a knob changes which cells
 * are subject, which changes the palette derived from them.
 *
 * So caching this buys about 6 %, not the bulk. What makes tuning bearable is the debounce in
 * `usePhotoTuning`; this seam mostly buys a `paintPrepared` that can be called on its own.
 */
export interface PreparedCells {
  size: number;
  box: CropBox;
  cells: Colour[];
}

export function preparePhotoCells(bitmap: Bitmap, crop?: CropBox | null): PreparedCells {
  const size = AVATAR_SPRITE_SIZE;
  // ADR-054 — the crop comes from something that actually found a face, or from the skin
  // estimate as a preview of last resort. The mask deliberately has no say in the framing:
  // it is the cut-out, and it cannot locate a face.
  const box = crop ?? faceBox(bitmap);
  return { size, box, cells: sharpen(resample(bitmap, box, size).map(enhance), size, 0.15) };
}

/** The whole pipeline: a photograph in, a storable sprite code out. */
export function photoToSprite(bitmap: Bitmap, input: SpriteInput): string {
  return paintPrepared(preparePhotoCells(bitmap, input.crop), input);
}

/**
 * ADR-224 — which cells are backdrop, decided on their own.
 *
 * This is the first half of `paintPrepared`, lifted out unchanged, so that the cropper's full-photo
 * preview (`backdropPreview.ts`) asks the saved sprite's question of the same kind of grid and gets the
 * same kind of answer. Nothing here reads a colour for the backdrop: whether a cell is the person does
 * not depend on what colour the backdrop is painted.
 */
export function backgroundCells(
  prepared: PreparedCells,
  input: Pick<SpriteInput, 'subject' | 'tuning'>,
): Uint8Array {
  const { size, box, cells } = prepared;
  const tuning = input.tuning ?? DEFAULT_TUNING;
  return tuning.removeBackground
    ? tunedMask(
        input.subject
          ? maskFromModel(input.subject, box, { size, threshold: tuning.threshold })
          : backgroundMask(cells, size),
        size,
        tuning,
      )
    : keepEverything(size);
}

/** The cheap half: decide what is background, quantise what is left, paint and ink it. */
export function paintPrepared(prepared: PreparedCells, input: SpriteInput): string {
  const { size, cells } = prepared;

  // Segment before quantising: a backdrop that keeps its own colours would eat half the
  // palette, and the face is what the palette is for. The model's mask wins when there is
  // one — it is the only thing that can cut a café out from behind a selfie (ADR-033).
  //
  // ADR-072 — either mask is then tuned. The threshold only means something on the model path,
  // because the colour rules have no alpha to threshold; dropping detached pieces and moving the
  // edge apply to both, so there is one behaviour rather than two.
  // ADR-077 — the cut-out is skipped entirely when it has been turned off, rather than run and
  // discarded. Nothing downstream needs to know: an all-subject mask paints the whole crop, replaces
  // no cell with the backdrop, and inks no contour.
  const background = backgroundCells(prepared, input);
  const subject = cells.filter((_unused, cell) => background[cell] === 0);
  const palette = medianCut(faceWeighted(subject, size, background), PHOTO_COLOURS);

  const backdropIndex = palette.length;
  const inkIndex = palette.length + 1;
  const painted = despeckle(
    cells.map((cell, at) => (background[at] === 1 ? backdropIndex : nearest(palette, cell))),
    size,
  );
  const outlined = painted.map((index, cell) =>
    index === backdropIndex && touchesSubject(painted, { size, cell, background: backdropIndex })
      ? inkIndex
      : index,
  );

  const rows: string[] = [];
  for (let y = 0; y < size; y += 1) {
    rows.push(
      outlined
        .slice(y * size, (y + 1) * size)
        .map((index) => index.toString(16))
        .join(''),
    );
  }
  return formatAvatarSprite({
    size,
    palette: [...palette.map(hex), input.backdrop, input.ink],
    rows,
  });
}

function touchesSubject(
  indices: number[],
  grid: { size: number; cell: number; background: number },
): boolean {
  const { size, cell, background } = grid;
  return neighboursOf(cell, size).some((neighbour) => indices[neighbour] !== background);
}
