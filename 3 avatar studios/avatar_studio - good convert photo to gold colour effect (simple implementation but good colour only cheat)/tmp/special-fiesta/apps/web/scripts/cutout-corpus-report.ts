import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AVATAR_SPRITE_SIZE } from '@psd/contracts';
import { DEFAULT_TUNING } from '../src/lib/avatar/cutOut.js';
import type { CutOutTuning } from '../src/lib/avatar/cutOut.js';
import { chooseTuning } from '../src/lib/avatar/cutOutScore.js';
import type { Candidate } from '../src/lib/avatar/cutOutScore.js';
import { faceBox } from '../src/lib/avatar/photoSprite.js';
import { CUTOUT_CORPUS_PATTERN, listCutoutCorpus } from '../tools/cutoutCorpus.js';
import type { Bitmap, CropBox, SubjectMask } from '../src/lib/avatar/photoSprite.js';

/**
 * The cut-out chooser scored over the real corpus, headless — for a host that has the internet
 * but no browser.
 *
 * ## Read this before trusting its output
 *
 * **This is a SCREENING tool. The gate is `e2e/participant/cutout-chooser.spec.ts`**, which drives
 * a real browser through the code path that ships. The difference is the crop, and the difference
 * matters: in the browser the crop comes from BlazeFace (ADR-054), which actually finds the face.
 * There is no BlazeFace here — MediaPipe needs a browser — so this falls back to `faceBox`, the
 * skin-colour estimate the app uses only as a last resort. A crop that is off changes which cells
 * the sweep sees, so a disagreement between this script and the Playwright suite is expected and
 * the suite wins. Use this to find problems early and cheaply; do not close the question with it.
 *
 * ## Running it
 *
 *     npm install --no-save @huggingface/transformers@4.3.0 sharp
 *     npx tsx apps/web/scripts/cutout-corpus-report.ts
 *     npx tsx apps/web/scripts/cutout-corpus-report.ts --json out.json
 *
 * `--no-save` is deliberate: the app loads Transformers.js from a CDN at run time precisely so
 * that onnxruntime's WebAssembly never enters the shipped bundle (ADR-033), and putting it in
 * `package.json` for the sake of one script would undo that. If the install trips over a
 * postinstall script that wants an unreachable host, `--ignore-scripts` is usually enough.
 *
 * Needs outbound HTTPS to `huggingface.co` for ~25 MB of MODNET weights, cached under
 * `node_modules/.cache` afterwards. Expect a couple of minutes for 26 photographs once warm.
 *
 * ## What it prints
 *
 * One line per photograph — the chosen tuning, whether it agrees with `DEFAULT_TUNING`, and the
 * before/after of the two metrics that matter — then the same verdict rule the browser page and
 * the Playwright suite use: **it may only move on photographs where the default did measurable
 * damage.** Exit code 0 if that holds, 1 if it does not, 2 if the run could not be completed.
 * The three implementations state the rule separately on purpose; if they ever disagree, that
 * disagreement is information.
 *
 * Full background, acceptance criteria and what to do with each outcome:
 * `docs/design/cutout-chooser-validation.md`.
 */

const SIZE = AVATAR_SPRITE_SIZE;
const CORPUS = join(process.cwd(), 'images/ingest');
/** `readPhoto.ts` works at this size, so the matte must be computed at it too (ADR-037). */
const WORKING_SIZE = 640;

interface PixelPlane {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channels?: number;
}

interface RawImageLike {
  width: number;
  height: number;
  channels: number;
  data: ArrayLike<number>;
  resize: (width: number, height: number) => Promise<RawImageLike>;
  rgba: () => RawImageLike;
}

interface TransformersLike {
  pipeline: (task: string, model: string) => Promise<(image: unknown) => Promise<unknown>>;
  RawImage: { read: (path: string) => Promise<RawImageLike> };
}

interface Row {
  name: string;
  chosen: CutOutTuning;
  agrees: boolean;
  ambiguity: number;
  atDefault: Candidate | undefined;
  atChosen: Candidate | undefined;
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(2);
}

async function library(): Promise<TransformersLike> {
  try {
    return (await import('@huggingface/transformers')) as unknown as TransformersLike;
  } catch {
    return fail(
      'Transformers.js is not installed. Run:\n' +
        '    npm install --no-save @huggingface/transformers@4.3.0 sharp',
    );
  }
}

/** The photograph at the pipeline's working size, in the shape the pure code wants. */
async function bitmapOf(image: RawImageLike): Promise<Bitmap> {
  const scale = Math.min(1, WORKING_SIZE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const resized = (await image.resize(width, height)).rgba();
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let at = 0; at < pixels.length; at += 1) pixels[at] = Number(resized.data[at]);
  return { width, height, pixels };
}

/** The alpha channel of the background-removal result, which is the matte (ADR-045). */
function maskOf(output: unknown, width: number, height: number): SubjectMask | null {
  const plane = (Array.isArray(output) ? output[0] : output) as PixelPlane | undefined;
  if (plane === undefined || plane.width !== width || plane.height !== height) return null;
  const channels = plane.channels ?? 4;
  const alpha = new Uint8Array(width * height);
  for (let at = 0; at < alpha.length; at += 1) {
    alpha[at] = Number(plane.data[at * channels + (channels - 1)]);
  }
  return { width, height, alpha };
}

const damaged = (row: Row): boolean => (row.atDefault?.holes ?? 0) > 0 || (row.atDefault?.bite ?? 0) > 0;

const findCandidate = (candidates: Candidate[], tuning: CutOutTuning): Candidate | undefined =>
  candidates.find(
    (one) =>
      one.tuning.threshold === tuning.threshold &&
      one.tuning.minIsland === tuning.minIsland &&
      one.tuning.edge === tuning.edge,
  );

const pct = (value: number | undefined): string => `${(100 * (value ?? 0)).toFixed(1)}%`;

function print(row: Row): void {
  const flag = row.agrees ? 'agrees' : 'MOVES ';
  console.log(
    `  ${row.name.padEnd(24)} ${flag}  threshold ${String(row.chosen.threshold).padStart(3)}` +
      `  edge ${String(row.chosen.edge).padStart(2)}  cut ${row.chosen.removeBackground ? 'on ' : 'OFF'}` +
      `  holes ${String(row.atDefault?.holes ?? 0).padStart(4)} → ${String(row.atChosen?.holes ?? 0).padStart(4)}` +
      `  bite ${pct(row.atDefault?.bite).padStart(6)} → ${pct(row.atChosen?.bite).padStart(6)}`,
  );
}

async function scoreOne(
  name: string,
  tools: { segment: (image: unknown) => Promise<unknown>; RawImage: TransformersLike['RawImage'] },
): Promise<Row | null> {
  const image = await tools.RawImage.read(join(CORPUS, name));
  const bitmap = await bitmapOf(image);
  const subject = maskOf(await tools.segment(image), image.width, image.height);
  if (subject === null) return null;
  // No BlazeFace outside a browser: the skin estimate is the honest fallback, and the reason
  // this script screens rather than decides. See the header.
  const box: CropBox = faceBox(bitmap);
  const scaled: SubjectMask = subject.width === bitmap.width ? subject : resampleMask(subject, bitmap);
  const choice = chooseTuning(scaled, box, SIZE);
  return {
    name,
    chosen: choice.tuning,
    agrees: JSON.stringify(choice.tuning) === JSON.stringify(DEFAULT_TUNING),
    ambiguity: choice.ambiguity,
    atDefault: findCandidate(choice.candidates, DEFAULT_TUNING),
    atChosen: findCandidate(choice.candidates, choice.tuning),
  };
}

/** The matte comes back at the photograph's size; the crop box is in working-size coordinates. */
function resampleMask(subject: SubjectMask, bitmap: Bitmap): SubjectMask {
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

async function main(): Promise<void> {
  const { pipeline, RawImage } = await library();
  let names: string[];
  try {
    names = listCutoutCorpus(CORPUS);
  } catch {
    return fail(`no corpus at ${CORPUS} — run this from the repository root.`);
  }
  if (names.length === 0) {
    return fail(`no photographs matching ${String(CUTOUT_CORPUS_PATTERN)} in ${CORPUS}.`);
  }

  console.log(`\n${names.length} photographs; fetching MODNET (~25 MB on a cold cache)…\n`);
  const segment = await pipeline('background-removal', 'Xenova/modnet');

  const rows: Row[] = [];
  const noMatte: string[] = [];
  for (const name of names) {
    const row = await scoreOne(name, { segment, RawImage });
    if (row === null) {
      noMatte.push(name);
      console.log(`  ${name.padEnd(24)} no matte — the model declined`);
      continue;
    }
    rows.push(row);
    print(row);
  }

  const moved = rows.filter((row) => !row.agrees);
  const unjustified = moved.filter((row) => !damaged(row));
  console.log(
    `\n${rows.length} scored, ${noMatte.length} without a matte.` +
      ` ${rows.length - moved.length} left on the default; ${moved.length} moved,` +
      ` ${moved.length - unjustified.length} of those on photographs the default damaged.`,
  );

  const argument = process.argv.indexOf('--json');
  if (argument !== -1) {
    const path = process.argv[argument + 1] ?? 'cutout-corpus-report.json';
    writeFileSync(path, JSON.stringify({ rows, noMatte }, null, 1));
    console.log(`wrote ${path}`);
  }

  if (unjustified.length === 0) {
    console.log('\nIt moved only where the default does damage — the screening criterion holds.');
    console.log('Confirm with the gate: PSD_E2E_REAL_MODEL=1 npx playwright test e2e/participant/cutout-chooser.spec.ts\n');
    return;
  }
  console.log(
    `\nIt moved on ${unjustified.length} photograph(s) the default handles cleanly:` +
      ` ${unjustified.map((row) => row.name).join(', ')}.` +
      '\nSee docs/design/cutout-chooser-validation.md §Outcomes before changing any constant.\n',
  );
  process.exitCode = 1;
}

void main().catch((error: unknown) => {
  fail(`the run did not complete: ${String(error)}`);
});
