import { readdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AVATAR_SPRITE_SIZE } from '@psd/contracts';
import {
  DEFAULT_TUNING,
  maskFromModel,
  tunedMask,
  componentSizesOf,
  keepEverything,
  type CutOutTuning,
} from '../src/lib/avatar/cutOut.js';
import { chooseTuning, type Candidate } from '../src/lib/avatar/cutOutScore.js';
import { faceBox, type Bitmap, type CropBox, type SubjectMask } from '../src/lib/avatar/photoSprite.js';
import { CUTOUT_CORPUS_PATTERN, listCutoutCorpus } from '../tools/cutoutCorpus.js';

/**
 * Headless before/after preview of background removal over the real corpus — a reusable tool,
 * not a one-off. Run it any time the cut-out pipeline, MODNET's weights, or the corpus itself
 * changes, to see the shipped result on every photograph in one page.
 *
 * It calls the production mask builder (`maskFromModel` + `tunedMask` in `cutOut.ts`) — the same
 * functions `AvatarStudio` calls. The one thing it cannot reproduce is BlazeFace
 * (`locateFace.ts`), which needs a browser (MediaPipe) — so the crop here is `faceBox`'s
 * skin-colour fallback, the same caveat `cutout-corpus-report.ts` carries. A disagreement with
 * the real browser gate (`e2e/participant/cutout-chooser.spec.ts`) is expected and the gate wins;
 * this tool is for a fast first look, headless, with no dev server.
 *
 * ## Running it
 *
 *     npm install --no-save @huggingface/transformers@4.3.0 sharp     # once per machine
 *     npx tsx apps/web/scripts/cutout-preview-report.ts
 *     npx tsx apps/web/scripts/cutout-preview-report.ts --include-social   # +60 from images/ingest/social
 *     npx tsx apps/web/scripts/cutout-preview-report.ts --out /path/to/report.html
 *
 * Needs outbound HTTPS to `huggingface.co` for MODNET (~25 MB, cached under
 * `node_modules/.cache` after the first run).
 *
 * Writes one self-contained HTML file (every image inlined as base64 — open it directly, no
 * server needed) to `$TMPDIR` by default. It is a scratch artefact: regenerate it, do not commit
 * it.
 */

const SIZE = AVATAR_SPRITE_SIZE;
const CORPUS_DIR = join(process.cwd(), 'images/ingest');
const SOCIAL_DIR = join(CORPUS_DIR, 'social');
/** `readPhoto.ts` works at this size; the matte and the crop must agree with it (ADR-037). */
const WORKING_SIZE = 640;
/** Big enough that a 128-cell grid is legible; a multiple of 128 keeps cell edges crisp. */
const PREVIEW_SIZE = 384;
const CELL_PIXELS = PREVIEW_SIZE / SIZE;
const CHECKER_LIGHT: Rgb = { r: 226, g: 232, b: 238 };
const CHECKER_DARK: Rgb = { r: 196, g: 204, b: 212 };

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface SharpModule {
  default: (
    input: Buffer,
    options?: { raw?: { width: number; height: number; channels: number } },
  ) => SharpImage;
}

interface SharpImage {
  resize: (width: number, height: number, options?: { fit?: string; kernel?: string }) => SharpImage;
  ensureAlpha: () => SharpImage;
  raw: () => SharpImage;
  png: () => SharpImage;
  extract: (region: { left: number; top: number; width: number; height: number }) => SharpImage;
  toBuffer: () => Promise<Buffer>;
  metadata: () => Promise<{ width?: number; height?: number }>;
}

interface PixelPlane {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channels?: number;
}

interface RawImageLike {
  width: number;
  height: number;
}

interface TransformersLike {
  pipeline: (task: string, model: string) => Promise<(image: unknown) => Promise<unknown>>;
  RawImage: { read: (path: string) => Promise<RawImageLike> };
}

interface Row {
  name: string;
  box: CropBox;
  holesDefault: number;
  biteDefault: number;
  holesChosen: number;
  biteChosen: number;
  agreesWithChooser: boolean;
  chosen: CutOutTuning;
  why: string;
  /** The crop, no background removal — what the participant uploaded. */
  original: string;
  /** The crop with `DEFAULT_TUNING`'s mask applied — what ships today. */
  defaultCutOut: string;
  /** The crop with `chooseTuning`'s mask applied — ADR-212, wired to nothing in the app. */
  chosenCutOut: string;
  error?: string;
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(2);
}

async function sharpLib(): Promise<SharpModule['default']> {
  try {
    const mod = (await import('sharp')) as unknown as SharpModule;
    return mod.default;
  } catch {
    return fail('sharp is not installed. Run:\n    npm install --no-save @huggingface/transformers@4.3.0 sharp');
  }
}

async function transformersLib(): Promise<TransformersLike> {
  try {
    return (await import('@huggingface/transformers')) as unknown as TransformersLike;
  } catch {
    return fail('Transformers.js is not installed. Run:\n    npm install --no-save @huggingface/transformers@4.3.0 sharp');
  }
}

/** The photograph at the pipeline's working size, decoded to raw RGBA (ADR-037's 640 px edge). */
async function bitmapOf(sharp: SharpModule['default'], path: string): Promise<Bitmap> {
  const file = await readFile(path);
  const meta = await sharp(file).metadata();
  const sourceWidth = meta.width ?? WORKING_SIZE;
  const sourceHeight = meta.height ?? WORKING_SIZE;
  const scale = Math.min(1, WORKING_SIZE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const buffer = await sharp(file).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  return { width, height, pixels: new Uint8ClampedArray(buffer) };
}

/** The matte's alpha channel, at the model's own resolution. */
function maskOf(output: unknown): { width: number; height: number; alpha: Uint8Array } | null {
  const plane = (Array.isArray(output) ? output[0] : output) as PixelPlane | undefined;
  if (plane === undefined) return null;
  const channels = plane.channels ?? 4;
  const alpha = new Uint8Array(plane.width * plane.height);
  for (let at = 0; at < alpha.length; at += 1) {
    alpha[at] = Number(plane.data[at * channels + (channels - 1)]);
  }
  return { width: plane.width, height: plane.height, alpha };
}

/** The matte comes back at the model's resolution; everything downstream works in bitmap space. */
function resampleMask(subject: { width: number; height: number; alpha: Uint8Array }, bitmap: Bitmap): SubjectMask {
  if (subject.width === bitmap.width && subject.height === bitmap.height) {
    return { width: bitmap.width, height: bitmap.height, alpha: subject.alpha };
  }
  const alpha = new Uint8Array(bitmap.width * bitmap.height);
  for (let y = 0; y < bitmap.height; y += 1) {
    const sourceY = Math.min(subject.height - 1, Math.floor((y * subject.height) / bitmap.height));
    for (let x = 0; x < bitmap.width; x += 1) {
      const sourceX = Math.min(subject.width - 1, Math.floor((x * subject.width) / bitmap.width));
      alpha[y * bitmap.width + x] = subject.alpha[sourceY * subject.width + sourceX] ?? 0;
    }
  }
  return { width: bitmap.width, height: bitmap.height, alpha };
}

/**
 * `faceBox`'s skin estimate can land on a fractional pixel. The shipped mask builder
 * (`maskFromModel`) rounds every pixel it touches, so that is harmless in production; the
 * never-wired scorer (`cutOutScore.ts`'s `ambiguityOf`) does not round and throws "Missing matte
 * alpha" on exactly these boxes. Rounding here is a workaround for calling that code from this
 * tool, not a production fix.
 */
const integerBox = (box: CropBox): CropBox => ({
  x: Math.round(box.x),
  y: Math.round(box.y),
  size: Math.round(box.size),
});

/** The crop, read straight from the bitmap, scaled to `PREVIEW_SIZE` with nearest-neighbour. */
async function cropPreview(sharp: SharpModule['default'], bitmap: Bitmap, box: CropBox): Promise<Buffer> {
  const left = Math.max(0, Math.min(box.x, bitmap.width - 1));
  const top = Math.max(0, Math.min(box.y, bitmap.height - 1));
  const width = Math.max(1, Math.min(box.size, bitmap.width - left));
  const height = Math.max(1, Math.min(box.size, bitmap.height - top));
  const source = sharp(Buffer.from(bitmap.pixels.buffer, bitmap.pixels.byteOffset, bitmap.pixels.byteLength), {
    raw: { width: bitmap.width, height: bitmap.height, channels: 4 },
  });
  return source.extract({ left, top, width, height }).resize(PREVIEW_SIZE, PREVIEW_SIZE, { kernel: 'nearest' }).raw().toBuffer();
}

/** The same crop with background cells (per `mask`) replaced by a checkerboard. */
function cutOutPreview(cropRgba: Buffer, mask: Uint8Array): Buffer {
  const out = Buffer.from(cropRgba);
  for (let py = 0; py < PREVIEW_SIZE; py += 1) {
    const cellY = Math.min(SIZE - 1, Math.floor(py / CELL_PIXELS));
    for (let px = 0; px < PREVIEW_SIZE; px += 1) {
      const cellX = Math.min(SIZE - 1, Math.floor(px / CELL_PIXELS));
      const isBackground = mask[cellY * SIZE + cellX] === 1;
      const offset = (py * PREVIEW_SIZE + px) * 4;
      if (!isBackground) {
        out[offset + 3] = 255;
        continue;
      }
      const checker = (Math.floor(px / 16) + Math.floor(py / 16)) % 2 === 0 ? CHECKER_LIGHT : CHECKER_DARK;
      out[offset] = checker.r;
      out[offset + 1] = checker.g;
      out[offset + 2] = checker.b;
      out[offset + 3] = 255;
    }
  }
  return out;
}

async function pngBase64(sharp: SharpModule['default'], rgba: Buffer): Promise<string> {
  const png = await sharp(rgba, { raw: { width: PREVIEW_SIZE, height: PREVIEW_SIZE, channels: 4 } }).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

const findCandidate = (candidates: Candidate[], tuning: CutOutTuning): Candidate | undefined =>
  candidates.find(
    (one) =>
      one.tuning.threshold === tuning.threshold &&
      one.tuning.minIsland === tuning.minIsland &&
      one.tuning.edge === tuning.edge,
  );

/** `tuning.removeBackground === false` is ADR-077's hatch: keep the whole crop, cut nothing. */
const maskFor = (subject: SubjectMask, box: CropBox, tuning: CutOutTuning): Uint8Array =>
  tuning.removeBackground
    ? tunedMask(maskFromModel(subject, box, { size: SIZE, threshold: tuning.threshold }), SIZE, tuning)
    : keepEverything(SIZE);

async function scoreOne(
  sharp: SharpModule['default'],
  tools: { segment: (image: unknown) => Promise<unknown>; RawImage: TransformersLike['RawImage'] },
  photo: { dir: string; name: string },
): Promise<Row> {
  const { name } = photo;
  const path = join(photo.dir, name);
  const bitmap = await bitmapOf(sharp, path);
  const image = await tools.RawImage.read(path);
  const matte = maskOf(await tools.segment(image));
  if (matte === null) {
    return {
      name,
      box: faceBox(bitmap),
      holesDefault: 0,
      biteDefault: 0,
      holesChosen: 0,
      biteChosen: 0,
      agreesWithChooser: true,
      chosen: DEFAULT_TUNING,
      why: 'the model declined — no matte',
      original: '',
      defaultCutOut: '',
      chosenCutOut: '',
      error: 'no matte',
    };
  }
  const box = integerBox(faceBox(bitmap));
  const subject = resampleMask(matte, bitmap);
  const choice = chooseTuning(subject, box, SIZE);
  const atDefault = findCandidate(choice.candidates, DEFAULT_TUNING);
  const atChosen = findCandidate(choice.candidates, choice.tuning);

  const defaultMask = maskFor(subject, box, DEFAULT_TUNING);
  const chosenMask = maskFor(subject, box, choice.tuning);
  const sizes = componentSizesOf(defaultMask, SIZE);

  const crop = await cropPreview(sharp, bitmap, box);

  return {
    name,
    box,
    holesDefault: atDefault?.holes ?? 0,
    biteDefault: atDefault?.bite ?? 0,
    holesChosen: atChosen?.holes ?? 0,
    biteChosen: atChosen?.bite ?? 0,
    agreesWithChooser: JSON.stringify(choice.tuning) === JSON.stringify(DEFAULT_TUNING),
    chosen: choice.tuning,
    why: sizes.length > 1 ? `${sizes.length} pieces (largest ${sizes[0] ?? 0} of ${SIZE * SIZE} cells) — ${choice.why}` : choice.why,
    original: await pngBase64(sharp, crop),
    defaultCutOut: await pngBase64(sharp, cutOutPreview(crop, defaultMask)),
    chosenCutOut: await pngBase64(sharp, cutOutPreview(crop, chosenMask)),
  };
}

function cardHtml(row: Row): string {
  if (row.error !== undefined) {
    return `<section class="card card--error"><h2>${row.name}</h2><p>${row.error}</p></section>`;
  }
  const flagged = row.holesDefault > 0 || row.biteDefault > 0;
  return `
    <section class="card${flagged ? ' card--flagged' : ''}">
      <h2>${row.name}</h2>
      <p class="meta">DEFAULT_TUNING: holes ${row.holesDefault} &middot; bite ${(100 * row.biteDefault).toFixed(1)}%
        &nbsp;|&nbsp; chosen (${nameOf(row.chosen)}): holes ${row.holesChosen} &middot; bite ${(100 * row.biteChosen).toFixed(1)}%
        &nbsp;|&nbsp; chooser ${row.agreesWithChooser ? 'agrees with the default' : 'would move'} &middot; ${row.why}</p>
      <div class="strip">
        <figure><img src="${row.original}" width="${PREVIEW_SIZE}" height="${PREVIEW_SIZE}"><figcaption>original</figcaption></figure>
        <figure><img src="${row.defaultCutOut}" width="${PREVIEW_SIZE}" height="${PREVIEW_SIZE}"><figcaption>existing algorithm — DEFAULT_TUNING</figcaption></figure>
        <figure><img src="${row.chosenCutOut}" width="${PREVIEW_SIZE}" height="${PREVIEW_SIZE}"><figcaption>new chooser — ${nameOf(row.chosen)}</figcaption></figure>
      </div>
    </section>`;
}

const nameOf = (tuning: CutOutTuning): string => (tuning.removeBackground ? `threshold ${tuning.threshold}, island ${tuning.minIsland}, edge ${tuning.edge}` : 'cut-out OFF');

function pageHtml(rows: Row[], noMatte: string[]): string {
  const flaggedCount = rows.filter((row) => row.holesDefault > 0 || row.biteDefault > 0).length;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Cut-out before/after — ${rows.length} photographs</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0e1925; color: #e7edf3; margin: 0; padding: 24px; }
  h1 { font-size: 18px; }
  .summary { color: #9fb3c4; margin-bottom: 24px; }
  .card { background: #16263a; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .card--flagged { outline: 2px solid #e0a94a; }
  .card--error { outline: 2px solid #c0392b; }
  .card h2 { margin: 0 0 4px; font-size: 15px; }
  .meta { color: #9fb3c4; font-size: 12px; margin: 0 0 12px; }
  .strip { display: flex; gap: 12px; }
  figure { margin: 0; }
  figcaption { color: #9fb3c4; font-size: 12px; text-align: center; margin-top: 4px; }
  img { background: #fff; border-radius: 4px; image-rendering: pixelated; }
</style>
</head>
<body>
  <h1>Cut-out before/after — ${rows.length} photographs scored, ${noMatte.length} without a matte</h1>
  <p class="summary">${flaggedCount} photograph(s) show measurable damage at DEFAULT_TUNING (holes or bite &gt; 0), outlined in amber. Generated ${new Date().toISOString()}.</p>
  ${rows.map(cardHtml).join('\n')}
</body>
</html>`;
}

function corpusNames(includeSocial: boolean): { dir: string; name: string }[] {
  const top = listCutoutCorpus(CORPUS_DIR).map((name) => ({ dir: CORPUS_DIR, name }));
  if (!includeSocial) return top;
  const social = readdirSync(SOCIAL_DIR)
    .filter((name) => CUTOUT_CORPUS_PATTERN.test(name) || /\.png$/.test(name))
    .sort()
    .map((name) => ({ dir: SOCIAL_DIR, name }));
  return [...top, ...social];
}

async function main(): Promise<void> {
  const includeSocial = process.argv.includes('--include-social');
  const outArgument = process.argv.indexOf('--out');
  const outPath = outArgument === -1 ? join(tmpdir(), `cutout-preview-${Date.now()}.html`) : process.argv[outArgument + 1];
  if (outPath === undefined) return fail('--out needs a path.');

  const sharp = await sharpLib();
  const { pipeline, RawImage } = await transformersLib();
  const photos = corpusNames(includeSocial);
  console.log(`\n${photos.length} photographs; fetching MODNET (~25 MB on a cold cache)…\n`);
  const segment = await pipeline('background-removal', 'Xenova/modnet');

  const rows: Row[] = [];
  const noMatte: string[] = [];
  for (const { dir, name } of photos) {
    try {
      const row = await scoreOne(sharp, { segment, RawImage }, { dir, name });
      if (row.error !== undefined) noMatte.push(name);
      rows.push(row);
      console.log(`  ${name.padEnd(32)} ${row.error ?? `holes ${row.holesDefault}  bite ${(100 * row.biteDefault).toFixed(1)}%`}`);
    } catch (error) {
      rows.push({
        name,
        box: { x: 0, y: 0, size: 0 },
        holesDefault: 0,
        biteDefault: 0,
        holesChosen: 0,
        biteChosen: 0,
        agreesWithChooser: true,
        chosen: DEFAULT_TUNING,
        why: '',
        original: '',
        defaultCutOut: '',
        chosenCutOut: '',
        error: String(error),
      });
      console.log(`  ${name.padEnd(32)} ERROR ${String(error)}`);
    }
  }

  writeFileSync(outPath, pageHtml(rows, noMatte));
  console.log(`\nwrote ${outPath}\nopen it directly in a browser — every image is inlined, no server needed.\n`);
}

void main().catch((error: unknown) => {
  fail(`the run did not complete: ${String(error)}`);
});
