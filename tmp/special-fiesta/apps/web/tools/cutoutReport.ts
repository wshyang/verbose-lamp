import { CUT_OUT_STEPS, DEFAULT_TUNING, maskFromModel, tunedMask } from '../src/lib/avatar/cutOut.js';
import type { CutOutTuning } from '../src/lib/avatar/cutOut.js';
import { chooseTuning } from '../src/lib/avatar/cutOutScore.js';
import type { Candidate } from '../src/lib/avatar/cutOutScore.js';
import { AVATAR_SPRITE_SIZE } from '@psd/contracts';
import { faceBox } from '../src/lib/avatar/photoSprite.js';
import type { Bitmap, CropBox, SubjectMask } from '../src/lib/avatar/photoSprite.js';
import { photoFileToSprite, refineWithModel } from '../src/lib/avatar/readPhoto.js';

/**
 * Step 2 of `docs/design/cutout-auto-tuning-assessment.md`: what does the chooser pick on real
 * photographs, and does it agree with the default on the ones that are already fine?
 *
 * DEV ONLY. It is not a route, not in `src/`, and not in the production build — `vite build` takes
 * `index.html` alone, so this page exists only while `./dev.sh` is running. Reach it at
 * `/cutout-report.html`.
 *
 * It lives here rather than in a Node script for one unavoidable reason: the matte comes from
 * MODNET through Transformers.js, loaded from a CDN, and the pipeline decodes photographs with
 * `createImageBitmap` and a canvas. Both need a browser. Running it here also means the numbers
 * come from the code path that actually ships rather than a re-implementation of it — which,
 * given that two scoring designs have already turned out to point the wrong way, is the point.
 *
 * The first load fetches the model weights (~25 MB) and is slow. After that the browser caches
 * them. Photographs are read from `images/ingest/` through a dev-server middleware in
 * `vite.config.ts`; nothing is uploaded and nothing is written.
 */

const SIZE = AVATAR_SPRITE_SIZE;
const COLOURS = { backdrop: '#1d5b8c', ink: '#0e1925' };
/** Painted at 4× so a 64-cell mask is legible beside its photograph. */
const PREVIEW_SCALE = 4;

interface Row {
  name: string;
  chosen: CutOutTuning;
  why: string;
  ambiguity: number;
  agrees: boolean;
  /** The default's own numbers, which is what the chooser has to beat. */
  atDefault: Candidate | undefined;
  atChosen: Candidate | undefined;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};

const out = (): HTMLElement => {
  const found = document.querySelector('#out');
  if (found === null) throw new Error('Missing #out.');
  return found as HTMLElement;
};

/**
 * The page's state, as an attribute rather than as prose.
 *
 * `e2e/participant/cutout-chooser.spec.ts` waits on `data-state`, not on wording: a suite that
 * waits for a sentence breaks the moment the sentence is improved.
 */
type RunState = 'running' | 'done' | 'failed';

const say = (text: string, state: RunState = 'running'): void => {
  const status = document.querySelector('#status');
  if (status === null) return;
  status.textContent = text;
  status.setAttribute('data-state', state);
};

/**
 * Everything the run produced, published for a machine.
 *
 * The suite re-derives the verdict from `rows` rather than trusting `gate` below — a tool that
 * grades its own homework is not a gate. `gate` is here so a human reading the page gets the same
 * answer, and so a disagreement between the two is itself a visible failure.
 */
export interface CutOutReport {
  corpus: number;
  scored: number;
  /** Photographs where the model returned no matte at all. */
  noMatte: string[];
  rows: Row[];
  verdict: string;
  gate: 'pass' | 'fail';
}

declare global {
  interface Window {
    __CUTOUT_REPORT__?: CutOutReport;
  }
}

/** A mask drawn as a silhouette: subject opaque, background transparent over a checker. */
function maskCanvas(mask: Uint8Array, label: string): HTMLElement {
  const canvas = el('canvas');
  canvas.width = SIZE * PREVIEW_SCALE;
  canvas.height = SIZE * PREVIEW_SCALE;
  const context = canvas.getContext('2d');
  if (context !== null) {
    for (let cell = 0; cell < mask.length; cell += 1) {
      const x = cell % SIZE;
      const y = (cell - x) / SIZE;
      context.fillStyle = mask[cell] === 0 ? '#f0baa1' : '#101418';
      context.fillRect(x * PREVIEW_SCALE, y * PREVIEW_SCALE, PREVIEW_SCALE, PREVIEW_SCALE);
    }
  }
  const wrap = el('figure');
  wrap.append(canvas, el('figcaption', label));
  return wrap;
}

/** The photograph as the pipeline sees it: the crop box, nothing else. */
function cropCanvas(bitmap: Bitmap, box: CropBox): HTMLElement {
  const canvas = el('canvas');
  canvas.width = SIZE * PREVIEW_SCALE;
  canvas.height = SIZE * PREVIEW_SCALE;
  const context = canvas.getContext('2d');
  const source = el('canvas');
  source.width = bitmap.width;
  source.height = bitmap.height;
  const sourceContext = source.getContext('2d');
  if (context !== null && sourceContext !== null) {
    const image = sourceContext.createImageData(bitmap.width, bitmap.height);
    image.data.set(bitmap.pixels);
    sourceContext.putImageData(image, 0, 0);
    context.drawImage(source, box.x, box.y, box.size, box.size, 0, 0, canvas.width, canvas.height);
  }
  const wrap = el('figure');
  wrap.append(canvas, el('figcaption', 'the crop'));
  return wrap;
}

const maskFor = (subject: SubjectMask, box: CropBox, tuning: CutOutTuning): Uint8Array =>
  tunedMask(maskFromModel(subject, box, { size: SIZE, threshold: tuning.threshold }), SIZE, tuning);

const nameOf = (tuning: CutOutTuning): string => {
  if (!tuning.removeBackground) return 'cut-out OFF';
  const parts = [
    CUT_OUT_STEPS.threshold.find((step) => step.value === tuning.threshold)?.label ?? String(tuning.threshold),
    CUT_OUT_STEPS.minIsland.find((step) => step.value === tuning.minIsland)?.label ?? String(tuning.minIsland),
    CUT_OUT_STEPS.edge.find((step) => step.value === tuning.edge)?.label ?? String(tuning.edge),
  ];
  return parts.join('/');
};

const pct = (value: number | undefined): string =>
  value === undefined ? '—' : `${(100 * value).toFixed(1)}%`;

function summaryLine(row: Row): string {
  const bite = `bite ${pct(row.atDefault?.bite)} → ${pct(row.atChosen?.bite)}`;
  const holes = `holes ${row.atDefault?.holes ?? '—'} → ${row.atChosen?.holes ?? '—'}`;
  return `${row.agrees ? 'agrees' : 'MOVES'} · ${nameOf(row.chosen)} · ${bite} · ${holes} · ambiguity ${pct(row.ambiguity)}`;
}

function render(row: Row, photo: Photo): void {
  const { bitmap, box, subject } = photo;
  const card = el('section');
  card.className = row.agrees ? 'card' : 'card card--moved';
  card.append(el('h2', row.name), el('p', summaryLine(row)), el('p', row.why));
  const strip = el('div');
  strip.className = 'strip';
  strip.append(
    cropCanvas(bitmap, box),
    maskCanvas(maskFor(subject, box, DEFAULT_TUNING), `default — ${nameOf(DEFAULT_TUNING)}`),
    maskCanvas(maskFor(subject, box, row.chosen), `chosen — ${nameOf(row.chosen)}`),
  );
  card.append(strip);
  out().append(card);
}

const sameTuning = (one: CutOutTuning, other: CutOutTuning): boolean =>
  one.removeBackground === other.removeBackground &&
  one.threshold === other.threshold &&
  one.minIsland === other.minIsland &&
  one.edge === other.edge;

const findCandidate = (candidates: Candidate[], tuning: CutOutTuning): Candidate | undefined =>
  candidates.find(
    (one) =>
      one.tuning.threshold === tuning.threshold &&
      one.tuning.minIsland === tuning.minIsland &&
      one.tuning.edge === tuning.edge,
  );

interface Photo {
  bitmap: Bitmap;
  subject: SubjectMask;
  box: CropBox;
}

async function photoOf(name: string): Promise<Photo | null> {
  const file = await (await fetch(`/corpus/${name}`)).blob();
  const quick = await photoFileToSprite(file, COLOURS);
  const refined = await refineWithModel({ bitmap: quick.bitmap, crop: quick.crop }, COLOURS);
  const subject = refined?.subject ?? null;
  if (subject === null) return null;
  return {
    bitmap: quick.bitmap,
    subject,
    box: refined?.crop ?? quick.crop ?? faceBox(quick.bitmap),
  };
}

async function runOne(name: string, rows: Row[], noMatte: string[]): Promise<void> {
  const photo = await photoOf(name);
  if (photo === null) {
    noMatte.push(name);
    out().append(el('p', `${name} — no matte; the model declined, which the studio treats as "keep the colour cut-out".`));
    return;
  }
  const choice = chooseTuning(photo.subject, photo.box, SIZE);
  const row: Row = {
    name,
    chosen: choice.tuning,
    why: choice.why,
    ambiguity: choice.ambiguity,
    agrees: sameTuning(choice.tuning, DEFAULT_TUNING),
    atDefault: findCandidate(choice.candidates, DEFAULT_TUNING),
    atChosen: findCandidate(choice.candidates, choice.tuning),
  };
  rows.push(row);
  render(row, photo);
}

/**
 * Did the default already do measurable harm to this photograph?
 *
 * Exported and used by both the page and the Playwright suite so that "damage" cannot come to mean
 * two different things in the two places that decide on it. Holes are the structural failure the
 * whole exercise is about; bite is confident subject dropped from inside the person.
 */
export const defaultDidDamage = (row: Row): boolean =>
  (row.atDefault?.holes ?? 0) > 0 || (row.atDefault?.bite ?? 0) > 0;

/** Rows where the chooser moved off the shipped default on a photograph the default handled cleanly. */
export const unjustifiedMoves = (rows: Row[]): Row[] =>
  rows.filter((row) => !row.agrees && !defaultDidDamage(row));

function verdict(rows: Row[]): { text: string; gate: 'pass' | 'fail' } {
  const moved = rows.filter((row) => !row.agrees);
  const unjustified = unjustifiedMoves(rows);
  const gate = unjustified.length === 0 ? 'pass' : 'fail';
  return {
    gate,
    text: [
      `${rows.length} photographs scored.`,
      `${rows.length - moved.length} left on the shipped default.`,
      `${moved.length} moved, of which ${moved.length - unjustified.length} had measurable damage at the default.`,
      gate === 'pass'
        ? 'It moved only where the default does damage — the step-2 gate is met.'
        : `It moved on ${unjustified.length} photograph(s) the default handles cleanly (${unjustified
            .map((row) => row.name)
            .join(', ')}) — keep it as a DETECTOR, not a default.`,
    ].join(' '),
  };
}

async function main(): Promise<void> {
  say('listing the corpus…');
  const names = (await (await fetch('/corpus/index.json')).json()) as string[];
  const rows: Row[] = [];
  const noMatte: string[] = [];
  for (const [index, name] of names.entries()) {
    say(`${index + 1} of ${names.length} — ${name} (the first one downloads the model; be patient)`);
    await runOne(name, rows, noMatte);
  }
  const { text, gate } = verdict(rows);
  const report: CutOutReport = {
    corpus: names.length,
    scored: rows.length,
    noMatte,
    rows,
    verdict: text,
    gate,
  };
  // Published BEFORE the status flips to `done`, so a suite that sees `done` always sees a report.
  window.__CUTOUT_REPORT__ = report;
  say(text, 'done');
  const dump = el('pre', JSON.stringify(report, null, 1));
  dump.className = 'dump';
  dump.setAttribute('data-testid', 'cutout-report__json');
  out().append(el('h2', 'the whole table, for pasting into the assessment'), dump);
}

void main().catch((error: unknown) => {
  // `failed` is distinct from a failing GATE: this means the run did not finish, so there is no
  // verdict either way, and a suite must not read the absence of a gate as a pass.
  say(`stopped: ${String(error)}`, 'failed');
});
