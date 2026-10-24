import { chooseTuning } from '../src/lib/avatar/cutOutScore.js';
import { DEFAULT_TUNING } from '../src/lib/avatar/cutOut.js';
import { preparePhotoCells } from '../src/lib/avatar/photoSprite.js';
import {
  CUT_OUT_STEPS,
  componentSizesOf,
  maskFromModel,
  tunedMask,
} from '../src/lib/avatar/cutOut.js';

/**
 * Probe for `docs/design/cutout-auto-tuning-assessment.md` — can the cut-out settings be chosen
 * for the participant instead of defaulted?
 *
 *   npx tsx apps/web/scripts/probe-cutout-scoring.ts
 *
 * Answers two questions with numbers rather than argument:
 *
 *   1. what does it COST to evaluate every setting in the coarse grid? (answer: ~8.8 ms for all
 *      eighteen, against ~95 ms to paint one sprite — the matting model runs once and every knob
 *      works on its output, so a sweep is flood fills on 4,096 cells);
 *   2. can a score detect a bite taken out of the subject with NO ground truth?
 *
 * The matte here is SYNTHETIC — a soft-edged blob, a detached bystander, and optionally a patch
 * the model is unsure about, standing in for a shirt the same colour as the wall. That is enough
 * to show which metrics respond to which failure, and it is not evidence about real photographs;
 * the thresholds belong to the recorded demo crowd, not to this file.
 *
 * The finding that mattered: measuring "confident subject dropped" GLOBALLY scores bystander
 * removal as 6.6 % damage, so a tuner minimising it would learn never to prune bystanders. Bite
 * has to be measured inside the face-connected component, which is what `person` below is.
 */

const W = 478, H = 640, SIZE = 64;
const box = { x: 0, y: 0, size: Math.min(W, H) };

function matte(o: { torsoAlpha: number | null }) {
  const alpha = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const dx = (x - W * 0.5) / (W * 0.30), dy = (y - H * 0.55) / (H * 0.42);
    alpha[y * W + x] = Math.round(255 * Math.max(0, Math.min(1, (1.15 - Math.hypot(dx, dy)) / 0.30)));
  }
  for (let y = 100; y < 190; y += 1) for (let x = 20; x < 90; x += 1) alpha[y * W + x] = 240;
  if (o.torsoAlpha !== null) {
    for (let y = 250; y < 340; y += 1) for (let x = 190; x < 300; x += 1) alpha[y * W + x] = o.torsoAlpha;
  }
  return { width: W, height: H, alpha };
}

const nbrs = (c: number, size: number) => {
  const x = c % size, y = (c - x) / size, out: number[] = [];
  if (x > 0) out.push(c - 1); if (x < size - 1) out.push(c + 1);
  if (y > 0) out.push(c - size); if (y < size - 1) out.push(c + size);
  return out;
};

function floodFrom(starts: number[], ok: (c: number) => boolean, size: number) {
  const seen = new Uint8Array(size * size); const stack: number[] = [];
  for (const s of starts) if (ok(s) && !seen[s]) { seen[s] = 1; stack.push(s); }
  while (stack.length) { const c = stack.pop() as number;
    for (const k of nbrs(c, size)) if (!seen[k] && ok(k)) { seen[k] = 1; stack.push(k); } }
  return seen;
}

/** Cells of a mask matching a predicate, as a plain loop the depth rule is happy with. */
function count(mask: Uint8Array, hit: (index: number) => boolean): number {
  let total = 0;
  for (let i = 0; i < mask.length; i += 1) if (hit(i)) total += 1;
  return total;
}

const enclosedHoles = (mask: Uint8Array, size: number) => {
  const border: number[] = [];
  for (let i = 0; i < size; i += 1) border.push(i, (size - 1) * size + i, i * size, i * size + size - 1);
  const reach = floodFrom(border, (c) => mask[c] === 1, size);
  let n = 0; for (let i = 0; i < mask.length; i += 1) if (mask[i] === 1 && !reach[i]) n += 1;
  return n;
};

/** A photograph-shaped bitmap, so `preparePhotoCells` does its real resample-and-sharpen work. */
function photo() {
  const pixels = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    const x = i % W, y = (i - x) / W;
    pixels[i * 4] = (x * 7 + y * 3) % 256;
    pixels[i * 4 + 1] = (x * 3 + y * 11) % 256;
    pixels[i * 4 + 2] = (x * 5 + y * 5) % 256;
    pixels[i * 4 + 3] = 255;
  }
  return { width: W, height: H, pixels };
}

const since = (t: number) => performance.now() - t;

/**
 * COST. Two axes, and they are not the same price.
 *
 * Tuning is free: the matte is already computed, so each setting is a downsample, a flood fill
 * and two dilations over 64x64 = 4,096 cells. Crop costs a `preparePhotoCells` — a resample and
 * sharpen of the photograph — but still NO second inference, because ADR-056 computes the matte
 * once for the whole photo and re-crops against it.
 */
function cost() {
  const subject = matte({ torsoAlpha: null });
  const bitmap = photo();
  const settings = gridOf();
  const crops = [0.9, 1, 1.1, 1.25, 1.45].map((f) => ({
    x: Math.round((W - Math.min(W, H) / f) / 2), y: Math.round(H * 0.08), size: Math.round(Math.min(W, H) / f),
  }));

  // Best of several runs: a single timed loop measures the JIT as much as the work.
  const best = (runs: number, body: () => void) => {
    let low = Infinity;
    for (let i = 0; i < runs; i += 1) {
      const t = performance.now();
      body();
      low = Math.min(low, since(t));
    }
    return low;
  };

  const sweepOnly = () => {
    for (const s of settings) {
      const mask = tunedMask(maskFromModel(subject, box, { size: SIZE, threshold: s.threshold }), SIZE, s);
      componentSizesOf(mask, SIZE);
    }
  };
  const sweepScored = () => {
    for (const s of settings) {
      const mask = tunedMask(maskFromModel(subject, box, { size: SIZE, threshold: s.threshold }), SIZE, s);
      componentSizesOf(mask, SIZE);
      enclosedHoles(mask, SIZE);
    }
  };

  const sweep = best(30, sweepOnly);
  const withHoles = best(30, sweepScored);
  const prepare = best(10, () => { for (const crop of crops) preparePhotoCells(bitmap, crop); });
  const joint = best(5, () => {
    for (const crop of crops) {
      preparePhotoCells(bitmap, crop);
      for (const s of settings) {
        const mask = tunedMask(maskFromModel(subject, crop, { size: SIZE, threshold: s.threshold }), SIZE, s);
        componentSizesOf(mask, SIZE);
        enclosedHoles(mask, SIZE);
      }
    }
  });

  console.log('=== cost ===');
  console.log(`  ${settings.length} settings, one crop        ${sweep.toFixed(1)} ms   (${(sweep / settings.length).toFixed(2)} ms each)`);
  console.log(`  the same, + hole detector    ${withHoles.toFixed(1)} ms   (${(withHoles / settings.length).toFixed(2)} ms each)`);
  console.log(`  ${crops.length} crops, preparePhotoCells   ${prepare.toFixed(1)} ms   (${(prepare / crops.length).toFixed(2)} ms each)`);
  console.log(`  ${crops.length} x ${settings.length} = ${crops.length * settings.length} joint grid     ${joint.toFixed(1)} ms`);
  console.log('  one paintPrepared (ADR-073)  ~95 ms');
}

const gridOf = () => CUT_OUT_STEPS.threshold.flatMap((t) => CUT_OUT_STEPS.minIsland.flatMap((m) =>
  CUT_OUT_STEPS.edge.map((e) => ({ label: `${t.label}/${m.label}/${e.label}`,
    removeBackground: true, threshold: t.value, minIsland: m.value, edge: e.value }))));

const grid = gridOf();

cost();

for (const [name, torsoAlpha] of [['clean', null], ['shirt matches wall', 105]] as const) {
  const subject = matte({ torsoAlpha });
  // THE PERSON: confident-subject cells reachable from the face seed in the loosest mask.
  // A bystander is confident subject too, so without this the score calls pruning them damage.
  const loosest = maskFromModel(subject, box, { size: SIZE, threshold: 16 });
  const seed = Math.round(SIZE * 0.52) * SIZE + Math.round(SIZE / 2);
  const person = floodFrom([seed], (c) => loosest[c] === 0, SIZE);
  const sure = maskFromModel(subject, box, { size: SIZE, threshold: 224 }).map((v) => (v === 0 ? 1 : 0));
  const empty = maskFromModel(subject, box, { size: SIZE, threshold: 32 });
  let personN = 0; for (let i = 0; i < sure.length; i += 1) if (sure[i] === 1 && person[i] === 1) personN += 1;
  const emptyN = empty.reduce((a: number, b) => a + b, 0);

  console.log(`\n=== ${name} ===  the person: ${personN} confident cells`);
  console.log('setting                 main  pieces  holes   bite*   leak');
  for (const s of grid) {
    const mask = tunedMask(maskFromModel(subject, box, { size: SIZE, threshold: s.threshold }), SIZE, s);
    const sizes = componentSizesOf(mask, SIZE);
    const bite = count(mask, (i) => sure[i] === 1 && person[i] === 1 && mask[i] === 1);
    const leak = count(mask, (i) => empty[i] === 1 && mask[i] === 0);
    console.log(`${s.label.padEnd(22)} ${String(sizes[0] ?? 0).padStart(5)} ${String(sizes.length).padStart(6)}` +
      ` ${String(enclosedHoles(mask, SIZE)).padStart(6)} ${(100 * bite / personN).toFixed(1).padStart(6)}%` +
      ` ${(100 * leak / emptyN).toFixed(1).padStart(6)}%`);
  }
}

/**
 * WHAT IT PICKS. The runnable stand-in for the step-2 gate in the assessment.
 *
 * The real gate is this table over the recorded demo crowd, and it cannot be produced here: the
 * matte needs MODNET, MODNET needs its weights, and this sandbox has no route to huggingface.co.
 * So the fixtures are named failure modes instead, and the question asked of them is the same one
 * the demo crowd will be asked — does it leave a good photograph alone, and does it move only
 * where the current default does damage?
 */
function picks() {
  const fixtures: Array<[string, { torsoAlpha: number | null }]> = [
    ['a clean matte', { torsoAlpha: null }],
    ['a shirt the colour of the wall', { torsoAlpha: 105 }],
    ['a barely-ambiguous region', { torsoAlpha: 150 }],
    ['a region the model nearly wrote off', { torsoAlpha: 60 }],
  ];
  console.log('\n=== what chooseTuning picks ===');
  console.log(`  the current default is threshold ${DEFAULT_TUNING.threshold}, minIsland ${DEFAULT_TUNING.minIsland}, edge ${DEFAULT_TUNING.edge}`);
  for (const [name, options] of fixtures) {
    const choice = chooseTuning(matte(options), box, SIZE);
    const t = choice.tuning;
    const moved = t.threshold === DEFAULT_TUNING.threshold && t.edge === DEFAULT_TUNING.edge
      ? 'agrees with the default'
      : 'MOVES';
    console.log(`  ${name.padEnd(36)} threshold ${String(t.threshold).padStart(3)}  edge ${String(t.edge).padStart(2)}  ` +
      `cut ${t.removeBackground ? 'on ' : 'OFF'}  ambiguity ${(100 * choice.ambiguity).toFixed(1).padStart(5)}%  ${moved}`);
    console.log(`      ${choice.why}`);
  }
}

picks();
