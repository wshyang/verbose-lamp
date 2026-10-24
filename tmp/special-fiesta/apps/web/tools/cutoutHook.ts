import { AVATAR_SPRITE_SIZE } from '@psd/contracts';
import {
  DEFAULT_TUNING,
  keepEverything,
  maskFromModel,
  pruneIslands,
  trimEdge,
  tunedMask,
  type CutOutTuning,
} from '../src/lib/avatar/cutOut.js';
import { chooseTuning, type Candidate } from '../src/lib/avatar/cutOutScore.js';
import { faceBox, type Bitmap, type CropBox, type SubjectMask } from '../src/lib/avatar/photoSprite.js';
import { photoFileToSprite, refineWithModel } from '../src/lib/avatar/readPhoto.js';

/**
 * `window.__PSD_CUTOUT_RUN__` — the dev-only hook Playwright calls to score one photograph
 * through the real pipeline, without a signed-in participant or the studio's UI.
 *
 * `cutout-report.html` (ADR-212's step 2) already proved the pattern: run the code path that
 * ships (`photoFileToSprite` → `refineWithModel` → `chooseTuning`), not a re-implementation of
 * it, inside a real browser so BlazeFace and MODNET answer for real. This module is that same
 * pattern turned into a function Playwright can call once per photograph on demand, rather than
 * a report the page builds once over a fixed list — which is what lets one driver script
 * (`scripts/cutout-full-report.ts`) walk every photograph in `images/ingest/` **and**
 * `images/ingest/social/`, 86 in total, instead of the 26 `cutout-report.html` reaches.
 *
 * DEV ONLY, by construction rather than by a runtime flag: it lives outside `src/`, it is loaded
 * only by `cutout-hook.html`, which is not linked from the app and not covered by `vite build`
 * (which takes `index.html` alone). It cannot reach production because nothing in the shipped
 * bundle imports it.
 *
 * Returns a plain, JSON-serialisable object — `page.evaluate`'s return value crosses the CDP
 * wire as JSON, so the three preview images are PNG data URLs (`canvas.toDataURL()`) rather than
 * the raw masks `cutoutReport.ts` draws straight into the DOM.
 */

const SIZE = AVATAR_SPRITE_SIZE;
const COLOURS = { backdrop: '#1d5b8c', ink: '#0e1925' };
/** Big enough that a 128-cell grid is legible in the generated report. */
const PREVIEW_SIZE = 384;

/** One step of the mask pipeline, drawn over the crop, with how much of the face it removed. */
export interface CutoutStage {
  name: string;
  image: string;
  /** Background cells inside the central face rectangle of the 128-cell grid. */
  faceBackgroundCells: number;
}

export interface CutoutHookResult {
  name: string;
  /** Whether the browser handed over a WebGPU adapter, i.e. which device `segmentPhoto` tried first. */
  webgpu?: boolean;
  /** Mean alpha over the face rectangle of the crop, straight from the matte. */
  faceAlphaMean?: number;
  stages?: CutoutStage[];
  noMatte: boolean;
  box?: CropBox;
  foundFace: boolean;
  holesDefault: number;
  biteDefault: number;
  holesChosen: number;
  biteChosen: number;
  agreesWithChooser: boolean;
  chosen: CutOutTuning;
  why: string;
  original: string;
  defaultCutOut: string;
  chosenCutOut: string;
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

/** The crop, drawn at `PREVIEW_SIZE`, nothing else — what `cropCanvas` in `cutoutReport.ts` draws. */
function cropCanvas(bitmap: Bitmap, box: CropBox): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW_SIZE;
  canvas.height = PREVIEW_SIZE;
  const context = canvas.getContext('2d');
  const source = document.createElement('canvas');
  source.width = bitmap.width;
  source.height = bitmap.height;
  const sourceContext = source.getContext('2d');
  if (context !== null && sourceContext !== null) {
    const image = sourceContext.createImageData(bitmap.width, bitmap.height);
    image.data.set(bitmap.pixels);
    sourceContext.putImageData(image, 0, 0);
    context.drawImage(source, box.x, box.y, box.size, box.size, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

/** The same crop with background cells (per `mask`) replaced by a checkerboard. */
function cutOutCanvas(crop: HTMLCanvasElement, mask: Uint8Array): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW_SIZE;
  canvas.height = PREVIEW_SIZE;
  const context = canvas.getContext('2d');
  if (context === null) return canvas;
  context.drawImage(crop, 0, 0);
  const cell = PREVIEW_SIZE / SIZE;
  for (let at = 0; at < mask.length; at += 1) {
    if (mask[at] !== 1) continue;
    const x = at % SIZE;
    const y = (at - x) / SIZE;
    const px = x * cell;
    const py = y * cell;
    context.fillStyle = (Math.floor(px / 16) + Math.floor(py / 16)) % 2 === 0 ? '#e2e8ee' : '#c4ccd4';
    context.fillRect(px, py, cell, cell);
  }
  return canvas;
}

/** Background cells inside the central rectangle of the grid where a face sits in a head-and-shoulders crop. */
function faceBackgroundCells(mask: Uint8Array): number {
  let count = 0;
  for (let y = Math.round(SIZE * 0.25); y < SIZE * 0.8; y += 1) {
    for (let x = Math.round(SIZE * 0.25); x < SIZE * 0.75; x += 1) {
      if (mask[y * SIZE + x] === 1) count += 1;
    }
  }
  return count;
}

/** Mean raw alpha over the same rectangle, in crop coordinates, before any thresholding. */
function faceAlphaMean(subject: SubjectMask, box: CropBox): number {
  let total = 0;
  let count = 0;
  for (let y = Math.round(SIZE * 0.25); y < SIZE * 0.8; y += 1) {
    for (let x = Math.round(SIZE * 0.25); x < SIZE * 0.75; x += 1) {
      const px = Math.min(subject.width - 1, Math.round(box.x + (x / SIZE) * box.size));
      const py = Math.min(subject.height - 1, Math.round(box.y + (y / SIZE) * box.size));
      total += subject.alpha[py * subject.width + px] ?? 0;
      count += 1;
    }
  }
  return total / count;
}

/** The mask after each step `paintPrepared` takes, so a report can show where face cells vanish. */
function stagesOf(subject: SubjectMask, box: CropBox, crop: HTMLCanvasElement): CutoutStage[] {
  const thresholded = maskFromModel(subject, box, { size: SIZE, threshold: DEFAULT_TUNING.threshold });
  const trimmed = trimEdge(thresholded, SIZE, DEFAULT_TUNING.edge);
  const pruned = pruneIslands(trimmed, SIZE, DEFAULT_TUNING.minIsland);
  const named: [string, Uint8Array][] = [
    ['threshold 128', thresholded],
    ['+ trimEdge', trimmed],
    ['+ pruneIslands (final)', pruned],
  ];
  return named.map(([stage, mask]) => ({
    name: stage,
    image: cutOutCanvas(crop, mask).toDataURL('image/png'),
    faceBackgroundCells: faceBackgroundCells(mask),
  }));
}

/** The result for a photograph the model gave no matte for. */
function withoutMatte(name: string, foundFace: boolean): CutoutHookResult {
  return {
    name,
    noMatte: true,
    foundFace,
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
  };
}

/** The result for a photograph with a matte: both tunings drawn, both scored, every stage kept. */
function scored(name: string, photo: { bitmap: Bitmap; subject: SubjectMask; box: CropBox }, foundFace: boolean): CutoutHookResult {
  const { bitmap, subject, box } = photo;
  const choice = chooseTuning(subject, box, SIZE);
  const atDefault = findCandidate(choice.candidates, DEFAULT_TUNING);
  const atChosen = findCandidate(choice.candidates, choice.tuning);
  const crop = cropCanvas(bitmap, box);
  return {
    name,
    webgpu: (navigator as { gpu?: unknown }).gpu !== undefined,
    faceAlphaMean: faceAlphaMean(subject, box),
    stages: stagesOf(subject, box, crop),
    noMatte: false,
    box,
    foundFace,
    holesDefault: atDefault?.holes ?? 0,
    biteDefault: atDefault?.bite ?? 0,
    holesChosen: atChosen?.holes ?? 0,
    biteChosen: atChosen?.bite ?? 0,
    agreesWithChooser: JSON.stringify(choice.tuning) === JSON.stringify(DEFAULT_TUNING),
    chosen: choice.tuning,
    why: choice.why,
    original: crop.toDataURL('image/png'),
    defaultCutOut: cutOutCanvas(crop, maskFor(subject, box, DEFAULT_TUNING)).toDataURL('image/png'),
    chosenCutOut: cutOutCanvas(crop, maskFor(subject, box, choice.tuning)).toDataURL('image/png'),
  };
}

async function run(name: string): Promise<CutoutHookResult> {
  const file = await (await fetch(`/corpus/${name}`)).blob();
  const quick = await photoFileToSprite(file, COLOURS);
  const refined = await refineWithModel({ bitmap: quick.bitmap, crop: quick.crop }, COLOURS);
  const located = refined?.crop ?? quick.crop;
  const subject = refined?.subject ?? null;
  if (subject === null) return withoutMatte(name, located !== null);
  const box = located ?? faceBox(quick.bitmap);
  return scored(name, { bitmap: quick.bitmap, subject, box }, located !== null);
}

declare global {
  interface Window {
    __PSD_CUTOUT_RUN__?: (name: string) => Promise<CutoutHookResult>;
  }
}

// `import.meta.env.DEV` is Vite's own dead-code-elimination flag: a production build inlines
// `false` here and the bundler drops the branch, so this cannot reach a participant's build even
// though nothing routes to it either. `cutout-hook.html` is the only page that loads this module.
if (import.meta.env.DEV) {
  window.__PSD_CUTOUT_RUN__ = run;
}
