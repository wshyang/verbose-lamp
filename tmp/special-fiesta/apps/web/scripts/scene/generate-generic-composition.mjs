#!/usr/bin/env node
/**
 * Generic heartland scene — P0 composition pass.
 *
 * Owner decision, 2026-10-16: proceed with composition and skip the paper-edge
 * treatment for now. Players and catchers are therefore plain chroma-keyed
 * photographic cut-outs with soft contact shadows; no torn rim, no paper inset,
 * and no jig are applied in this pass.
 *
 * This is a one-off review pipeline in the same spirit as `generate-real.mjs`:
 * it processes committed renders from `.scene-src/`, writes a layered review
 * directory, and emits both a flattened `_preview.png` and a live-layer
 * `_preview.html`. It is deliberately outside every `npm run` gate and does not
 * wire the composition into the app.
 *
 * Depth is explicit (the composer's z-axis): every sprite declares the ground
 * line its feet stand on (`bottomUnits`); its draw order `z` is derived from
 * that line, and figure heights come from `depthScale` — one perspective
 * model, so moving a player deeper both shrinks and re-stacks them. Plates
 * (sky, ground, court, haze, shadows) carry fixed band z values.
 *
 * Run: `node apps/web/scripts/scene/generate-generic-composition.mjs`
 * Requires ImageMagick 6 (`convert`, `identify`).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const SRC = '.scene-src';
const OUT = 'apps/web/public/themes/generic/scene-composition';
const TMP = '/tmp/generic-scene-composition';
const SCALE = 4;
const CANVAS = { width: 480 * SCALE, height: 270 * SCALE };

/* The z-axis: one perspective model for every figure. A ground line at the
 * horizon reads at half scale; at the frame's near edge, slightly over. */
const HORIZON_UNITS = 150;
const NEAR_UNITS = 260;
const PERSON_HEIGHT_UNITS = 60;

function depthScale(feetUnits) {
  return 0.5 + ((feetUnits - HORIZON_UNITS) / (NEAR_UNITS - HORIZON_UNITS)) * 0.55;
}

function personHeightAt(feetUnits) {
  return Math.round(PERSON_HEIGHT_UNITS * depthScale(feetUnits));
}

function run(args) {
  execFileSync('convert', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

function size(file) {
  const [width, height] = execFileSync('identify', ['-format', '%w %h', file])
    .toString().split(' ').map(Number);
  return { width, height };
}

function units(value) {
  return Math.round(value * SCALE);
}

function sourceFile(name) {
  return join(SRC, name);
}

function requireSources(names) {
  for (const name of names) {
    if (!existsSync(sourceFile(name))) throw new Error(`${sourceFile(name)} is missing.`);
  }
}

function applyDespill(file, mode) {
  if (mode === 'magenta-pair' || mode === 'people') {
    // Masked clamp: build a despilled copy (red and blue dragged to green) and
    // composite it only where the pixel is magenta-ish. Two per-channel `-fx`
    // passes cannot be used: the first pass rewrites a channel the second
    // pass's condition still needs, which left blue fringes at players' feet.
    // `people` is stricter — spill has red and blue FAR above green, while a
    // red kit has blue only marginally above green and must survive.
    // The balance guard (min vs max of the red/blue pair) keeps crimson and
    // scarlet out of the mask — red carrying only a little blue is kit, not
    // spill. Only true magenta-family spill, red and blue arriving together,
    // is clamped.
    const condition = mode === 'people'
      ? '(min(r,b)>1.6*g)*(g<0.5)*(min(r,b)>0.7*max(r,b))?1:0'
      : '(min(r,b)>g)*(min(r,b)>0.7*max(r,b))?1:0';
    const despilled = join(TMP, 'despilled.png');
    const mask = join(TMP, 'spill-mask.png');
    run([file, '-channel', 'R', '-fx', 'g', '-channel', 'B', '-fx', 'g', '+channel', despilled]);
    run([file, '-alpha', 'off', '-fx', condition, mask]);
    run([file, despilled, mask, '-composite', file]);
    return;
  }
  const channels = mode === 'foliage' ? 'RB' : 'B';
  run([file, '(', '+clone', '-channel', 'G', '-separate', '+channel', ')',
    '-compose', 'Darken', '-channel', channels, '-composite', file]);
}

/* Mechanical matte, two features per pixel, both brightness-invariant:
 * `exc` — how far the weaker of red/blue rises above green, scaled by the
 * pixel's own brightness; and `bal` — how evenly red and blue arrive.
 * Backdrop-family pixels (flat magenta, its darker baked floor shadows,
 * pale magenta haze) have red AND blue together far above green: high exc,
 * bal near 1. A single min(R,B)/G ratio cannot tell that family from a
 * crimson shirt (red high, blue a third of red: bal ~0.4) and ate one —
 * the score therefore multiplies exc by a balance factor that is zero
 * below bal 0.55 and full above 0.85. A third factor, `dfc`, demands an
 * absolute green deficit: in near-black cloth (leggings, shorts, hair)
 * the channels are so small that a whisper of magenta bounce makes the
 * relative excess look backdrop-sized, and a ratio-only score dissolved
 * black leggings entirely. A fourth factor, `rfc`, demands that green be
 * proportionally weak against the pair: magenta bounce on spandex keeps
 * green at half the pair's strength, while a true backdrop shadow has
 * almost no green at all. White, skin, kits, foliage and concrete all
 * score ~0 and stay opaque. Computed on the ORIGINAL rgb, before despill
 * rewrites any channel. (fx variable names avoid reserved symbols —
 * `m`/`t` silently evaluate to zero.) */
const MATTE_FX = 'pr=min(r,b); mxv=max(r,max(g,b)); exc=(pr-g)/max(mxv,0.03); '
  + 'bal=pr/max(mxv,0.03); bfc=(bal-0.55)/0.30; bfc=bfc<0?0:(bfc>1?1:bfc); '
  + 'dfc=(pr-g)/0.08; dfc=dfc<0?0:(dfc>1?1:dfc); '
  + 'rel=(pr-g)/max(pr,0.03); rfc=(rel-0.45)/0.15; rfc=rfc<0?0:(rfc>1?1:rfc); '
  + 'scr=exc*bfc*dfc*rfc; ww=(0.16-scr)/0.10; ww<0?0:(ww>1?1:ww)';

/* Lavender atmospheric haze sits between the matte's families: too
 * desaturated to score as backdrop, too coloured to be subject. It is,
 * however, always continuous with the backdrop at the frame's edge, while
 * real subject matter is not. This pass builds a permissive backdrop
 * candidate, keeps only the candidate components that touch the border
 * (connected components; id 0 is the largest component, so membership is
 * tested by the verbose listing's mean colour, not the id), and cuts
 * exactly those pixels from the alpha. The candidate demands a minimum
 * brightness: in near-black pixels (shorts, hair) channel ratios turn
 * noisy-magenta, and without the floor the border flood eats the
 * subject's own dark cloth where it meets the silhouette. The component
 * analysis runs at half size — backdrop regions are broad — and the
 * resulting mask is scaled back. */
const BACKDROP_CANDIDATE_FX = 'pr=min(r,b); mxv=max(r,max(g,b)); '
  + 'exc=(pr-g)/max(mxv,0.03); bal=pr/max(mxv,0.03); '
  + '((exc>0.035)*(bal>0.72)*(mxv>0.25))?1:0';

function capture(args) {
  return execFileSync('convert', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function clearBorderBackdrop(file, name, candidateSource) {
  const temp = (suffix) => join(TMP, `${name}-${suffix}.png`);
  const candidate = temp('backdrop-candidate');
  const { width, height } = size(file);
  run([candidateSource, '-alpha', 'off', '-fx', BACKDROP_CANDIDATE_FX,
    '-resize', '50%', candidate]);
  const small = size(candidate);
  const touchesBorder = (w, h, x, y) => x === 0 || y === 0
    || x + w >= small.width || y + h >= small.height;
  const listing = capture([candidate, '-define', 'connected-components:verbose=true',
    '-connected-components', '4', 'null:']);
  const ids = [];
  for (const line of listing.split('\n')) {
    const match = line.match(/^\s*(\d+):\s+(\d+)x(\d+)\+(-?\d+)\+(-?\d+).*gray\((?:255|65535)\)/);
    if (!match) continue;
    const [, id, w, h, x, y] = match.map(Number);
    if (touchesBorder(w, h, x, y)) ids.push(id);
  }
  if (ids.length === 0) return;
  const components = join(TMP, `${name}-backdrop-components.miff`);
  run([candidate, '-connected-components', '4', '-depth', '16', components]);
  const select = ids.map((id) => `abs(u*65535-${id})<0.5`).join('||');
  run([components, '-fx', `(${select})?1:0`, '-resize', `${width}x${height}!`, temp('backdrop-border')]);
  run([file, '-alpha', 'extract', temp('alpha-b')]);
  run([temp('backdrop-border'), '-negate', temp('backdrop-inv')]);
  run([temp('alpha-b'), temp('backdrop-inv'), '-compose', 'Multiply', '-composite', temp('alpha-b2')]);
  run([file, temp('alpha-b2'), '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', file]);
}

function cleanDetachedFragments(file, name) {
  // Belt-and-braces residue removal: anything that is (a) disconnected from
  // the subject's main mass, and (b) near-neutral (low saturation — grey
  // specks and soft shadow smudges at any brightness, never kit, skin,
  // foliage or the dragon's coloured rings) is cut from the alpha.
  // Colourful detached matter is deliberately left alone.
  const temp = (suffix) => join(TMP, `${name}-${suffix}.png`);
  // "Detached" is relative: the threshold scales with the sprite's own
  // area (1.5%, floored low) so a small subject is never classed as its
  // own fragment.
  const { width, height } = size(file);
  const areaThreshold = Math.min(25000, Math.max(40, Math.round(width * height * 0.015)));
  run([file, '-alpha', 'extract', temp('alpha')]);
  run([temp('alpha'), '-threshold', '20%', temp('binary')]);
  run([temp('binary'), '-define', `connected-components:area-threshold=${areaThreshold}`,
    '-connected-components', '4', temp('components')]);
  run([temp('components'), '-fx', 'u>0?1:0', temp('kept')]);
  run([temp('binary'), temp('kept'), '-compose', 'Difference', '-composite', temp('detached')]);
  run([file, '-alpha', 'off', '-colorspace', 'HSL',
    '-channel', 'G', '-separate', '-threshold', '35%', '-negate', '+channel', temp('dark')]);
  run([temp('detached'), temp('dark'), '-compose', 'Multiply', '-composite', temp('residue')]);
  run([temp('alpha'), temp('residue'), '-fx', 'u-v', temp('alpha-clean')]);
  run([file, temp('alpha-clean'), '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', file]);
}

function fillEnclosedDarkHoles(file, name, rgbSource) {
  // Matte repair: magenta bounce sheen on dark cloth can still score as
  // backdrop and punch holes in leggings and sleeves. Such a hole is
  // enclosed by confident subject, while genuine backdrop gaps (between
  // the legs, under the arms) connect to the frame edge. Restore alpha
  // where a transparent component does NOT touch the border and the
  // underlying rgb is dark — bright enclosed holes (limb triangles over
  // real backdrop) stay transparent.
  const temp = (suffix) => join(TMP, `${name}-${suffix}.png`);
  const { width, height } = size(file);
  run([file, '-alpha', 'extract', temp('alpha-h')]);
  run([temp('alpha-h'), '-negate', '-threshold', '50%', temp('inv-h')]);
  const listing = capture([temp('inv-h'), '-define', 'connected-components:verbose=true',
    '-connected-components', '4', 'null:']);
  const ids = [];
  for (const line of listing.split('\n')) {
    const match = line.match(/^\s*(\d+):\s+(\d+)x(\d+)\+(-?\d+)\+(-?\d+).*gray\((?:255|65535)\)/);
    if (!match) continue;
    const [, id, w, h, x, y] = match.map(Number);
    if (x === 0 || y === 0 || x + w >= width || y + h >= height) ids.push(id);
  }
  if (ids.length === 0) return;
  const components = join(TMP, `${name}-holes-components.miff`);
  run([temp('inv-h'), '-connected-components', '4', '-depth', '16', components]);
  const select = ids.map((id) => `abs(u*65535-${id})<0.5`).join('||');
  run([components, '-fx', `(${select})?1:0`, temp('outside-h')]);
  run([temp('outside-h'), '-negate', temp('not-outside-h')]);
  run([temp('inv-h'), temp('not-outside-h'), '-compose', 'Multiply', '-composite', temp('enclosed-h')]);
  // Darkness is judged on the pre-despill rgb: despill has already turned
  // genuine backdrop black, which would make every enclosed backdrop hole
  // (a flyer's wheel interior) look like dark cloth and get filled.
  run([rgbSource, '-alpha', 'off', '-fx', 'max(r,max(g,b))<0.45?1:0', temp('dark-h')]);
  run([temp('enclosed-h'), temp('dark-h'), '-compose', 'Multiply', '-composite', temp('restore-h')]);
  run([temp('alpha-h'), temp('restore-h'), '-evaluate-sequence', 'Max', temp('alpha-h2')]);
  run([file, temp('alpha-h2'), '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', file]);
}

/* Edge unmixing: a silhouette pixel is a blend fg*a + backdrop*(1-a).
 * Despill only recolours pixels magenta enough to trip its mask, so the
 * pink rim survives on skin and shoes. With the matte's own alpha we can
 * solve for the foreground colour directly, against the backdrop colour
 * the renders use (0.95, 0.19, 0.83). Opaque pixels are untouched; the
 * denominator floor keeps near-transparent noise from exploding.
 * (Mover-tuned: this is what finally whitened the runners' shoes.) */
function unmixEdges(file) {
  const key = [['R', 'r', 0.95], ['G', 'g', 0.19], ['B', 'b', 0.83]];
  for (const [name, variable, k] of key) {
    run([file, '-channel', name, '-fx', `(${variable}-(1-a)*${k})/max(a,0.3)`, '+channel', file]);
  }
}

/* Rim despill: magenta bounce baked into near-opaque silhouette pixels
 * (the pink rim on shins) is not a blend the unmixer can solve. In the
 * semi-transparent rim only, clamp red/blue to green where the pixel is
 * magenta-balanced — the balance guard keeps crimson shirt rims (blue at
 * a third of red) out of the mask. */
function defringeEdges(file) {
  const despilled = join(TMP, 'rim-despilled.png');
  const mask = join(TMP, 'rim-mask.png');
  run([file, '-channel', 'R', '-fx', 'g', '-channel', 'B', '-fx', 'g', '+channel', despilled]);
  run([file, '-fx',
    '(a>0.03)*(a<0.98)*(min(r,b)>1.15*g)*(min(r,b)>0.75*max(r,b))?1:0', mask]);
  run([file, despilled, mask, '-composite', file]);
}

function keyMagenta(options) {
  const output = join(TMP, `${options.name}-keyed.png`);
  const base = join(TMP, `${options.name}-base.png`);
  const matte = join(TMP, `${options.name}-matte.png`);
  // Key at display size: the sources are 1408px renders shown at a quarter
  // of that, and the per-pixel fx passes are the pipeline's bottleneck.
  run([
    sourceFile(options.source),
    ...(options.orientation === 'flopped' ? ['-flop'] : []),
    ...(options.workingResize ? ['-resize', options.workingResize] : []),
    base,
  ]);
  run([base, '-alpha', 'off', '-fx', MATTE_FX, matte]);
  // Pristine rgb for the backdrop-candidate and darkness judgements:
  // despill is about to rewrite exactly the channels they read.
  const original = join(TMP, `${options.name}-original.png`);
  run([base, original]);
  applyDespill(base, options.despill);
  run([base, matte, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', output]);
  unmixEdges(output);
  defringeEdges(output);
  run([output, '-channel', 'A', '-level', '15%,90%', '-morphology', 'Open', 'Octagon:1', '+channel', output]);
  clearBorderBackdrop(output, options.name, original);
  cleanDetachedFragments(output, options.name);
  fillEnclosedDarkHoles(output, options.name, original);
  run([output, '-background', options.spill, '-alpha', 'background',
    '-trim', '+repage', output]);
  return output;
}

function gradeDistance(file, grade) {
  if (grade === 'far') {
    run([file, '-modulate', '110,55,102', '-fill', '#c9dcea', '-colorize', '14%',
      '-channel', 'A', '-evaluate', 'multiply', '0.78', '+channel', file]);
  }
  if (grade === 'near') {
    run([file, '-modulate', '104,72,101', '-fill', '#d7e5ee', '-colorize', '8%',
      '-channel', 'A', '-evaluate', 'multiply', '0.95', '+channel', file]);
  }
}

function layerFromMeasured(spec, file, measured) {
  const centre = spec.centreUnits === undefined ? undefined : units(spec.centreUnits);
  const left = centre === undefined
    ? units(spec.leftUnits)
    : Math.round(centre - measured.width / 2);
  return {
    name: spec.name,
    file: basename(file),
    left,
    top: Math.round(units(spec.bottomUnits) - measured.height),
    width: measured.width,
    height: measured.height,
    z: spec.z ?? 10 + spec.bottomUnits / 10,
  };
}

function processSprite(spec) {
  const resize = spec.heightUnits === undefined
    ? `${units(spec.widthUnits)}x`
    : `x${units(spec.heightUnits)}`;
  const keyed = keyMagenta({
    name: spec.name,
    source: spec.source,
    orientation: spec.orientation ?? 'normal',
    spill: spec.spill,
    despill: spec.despill,
    // Key at a capped size, not display size: a subject that is small in
    // its frame (the chair) would shrink to a few dozen pixels, and the
    // fragment pass would take the whole subject for residue. Trim first,
    // then the resize below scales the cut-out to display size.
    workingResize: '832x832>',
  });
  gradeDistance(keyed, spec.grade ?? 'none');
  const output = join(OUT, `${spec.name}.png`);
  run([keyed, '-resize', resize, output]);
  return layerFromMeasured(spec, output, size(output));
}

function processPlate(spec) {
  const output = join(OUT, spec.file);
  run([sourceFile(spec.source), ...spec.operations, output]);
  const measured = size(output);
  return {
    name: spec.name,
    file: spec.file,
    left: spec.leftPx ?? 0,
    top: spec.topPx ?? 0,
    width: measured.width,
    height: measured.height,
    z: spec.z ?? 0,
  };
}

function buildSky() {
  return processPlate({
    name: 'sky', file: 'sky.jpg', source: 'sky-01.png', topPx: 0, z: 0,
    operations: ['-resize', `${CANVAS.width}x${CANVAS.height}^`, '-gravity', 'center',
      '-extent', `${CANVAS.width}x${CANVAS.height}`, '-quality', '88'],
  });
}

function buildGround() {
  return processPlate({
    name: 'ground', file: 'ground.jpg', source: 'ground-01.png', topPx: 430, z: 1,
    operations: ['-resize', `${CANVAS.width}x`, '-crop', `${CANVAS.width}x650+0+0`,
      '+repage', '-quality', '88'],
  });
}

function buildHaze() {
  const output = join(OUT, 'haze.png');
  run(['-size', `${CANVAS.width}x150`, 'xc:#d9e8f2',
    '(', '-size', `${CANVAS.width}x150`, 'gradient:black-white', ')',
    '-alpha', 'off', '-compose', 'CopyOpacity', '-composite',
    '-channel', 'A', '-evaluate', 'multiply', '0.36', '+channel', output]);
  return { name: 'haze', file: 'haze.png', left: 0, top: 500, width: CANVAS.width, height: 150, z: 22 };
}

function buildCourt() {
  const keyed = keyMagenta({
    name: 'court', source: 'court-01.png', orientation: 'normal',
    spill: '#477f86', despill: 'magenta-pair',
    workingResize: `${CANVAS.width}x470!`,
  });
  const output = join(OUT, 'court.png');
  // The render's own perspective is too deep for the scene's horizon: forced to the
  // shallower box the composition uses, the same way the Sentosa net's box is forced.
  run([keyed, '-resize', `${CANVAS.width}x470!`, output]);
  const measured = size(output);
  return {
    name: 'court', file: 'court.png', left: 0, z: 28.5,
    top: CANVAS.height - measured.height, width: measured.width, height: measured.height,
  };
}

const FAR_SKYLINE = [
  { name: 'skyline-cbd', source: 'skyline-cbd-03.png', leftUnits: 18, bottomUnits: 118, widthUnits: 118 },
  { name: 'skyline-mbs', source: 'skyline-mbs-03.png', leftUnits: 145, bottomUnits: 118, widthUnits: 104 },
  // The -03 supertrees/flyer renders are haze-washed (the flyer-03 wheel is
  // even drawn as a filled disc — no matte can invent open spokes), so the
  // crisp -01 variants are cast and the distance grade supplies the faintness.
  { name: 'skyline-supertrees', source: 'skyline-supertrees-01.png', leftUnits: 252, bottomUnits: 118, widthUnits: 82 },
  { name: 'skyline-flyer', source: 'skyline-flyer-01.png', leftUnits: 342, bottomUnits: 118, widthUnits: 64 },
];

const HEARTLAND = [
  { name: 'skyline-hdb-left', source: 'skyline-hdb-01.png', leftUnits: -4, bottomUnits: 150, widthUnits: 148, grade: 'near' },
  { name: 'skyline-hdb-right', source: 'skyline-hdb-02.png', leftUnits: 338, bottomUnits: 150, widthUnits: 146, grade: 'near' },
  { name: 'mrt', source: 'mrt-01.png', leftUnits: 142, bottomUnits: 162, widthUnits: 196, grade: 'none' },
  { name: 'shophouse-left', source: 'shophouse-01.png', leftUnits: 12, bottomUnits: 153, widthUnits: 92, grade: 'none' },
  { name: 'shophouse-right', source: 'shophouse-03.png', leftUnits: 378, bottomUnits: 153, widthUnits: 94, grade: 'none' },
];

const MIDGROUND = [
  { name: 'raintree-left', source: 'raintree-01.png', leftUnits: -4, bottomUnits: 179, widthUnits: 108, despill: 'foliage', spill: '#2f5d24' },
  { name: 'palm-mid-left', source: 'palm-02.png', leftUnits: 84, bottomUnits: 177, widthUnits: 46, despill: 'foliage', spill: '#2f5d24' },
  { name: 'palm-mid-right', source: 'palm-03.png', leftUnits: 306, bottomUnits: 178, widthUnits: 48, despill: 'foliage', spill: '#2f5d24' },
  { name: 'raintree-right', source: 'raintree-03.png', leftUnits: 372, bottomUnits: 180, widthUnits: 116, despill: 'foliage', spill: '#2f5d24' },
  { name: 'playground-dragon', source: 'playground-dragon-07.png', leftUnits: 14, bottomUnits: 160, widthUnits: 126, despill: 'magenta-pair', spill: '#a34d32' },
];

const FAR_PLAYERS = [
  { name: 'player-far-marker-blue', source: 'players/marker-blue-01.png', centreUnits: 88, orientation: 'normal' },
  { name: 'player-far-thrower-red', source: 'players/thrower-red-03.png', centreUnits: 148, orientation: 'normal' },
  { name: 'player-far-receiver-blue', source: 'players/receiver-blue-02.png', centreUnits: 208, orientation: 'normal' },
  { name: 'player-far-blocker-red', source: 'players/blocker-red-05.png', centreUnits: 272, orientation: 'flopped' },
  { name: 'player-far-mover-blue', source: 'players/mover-blue-04.png', centreUnits: 338, orientation: 'flopped' },
];

const NEAR_PLAYERS = [
  { name: 'player-near-mover-red', source: 'players/mover-red-10.png', centreUnits: 118, orientation: 'normal' },
  { name: 'player-near-blocker-blue', source: 'players/blocker-blue-09.png', centreUnits: 178, orientation: 'normal' },
  { name: 'player-near-receiver-red', source: 'players/receiver-red-08.png', centreUnits: 238, orientation: 'normal' },
  { name: 'player-near-thrower-blue', source: 'players/thrower-blue-07.png', centreUnits: 302, orientation: 'flopped' },
  { name: 'player-near-marker-red', source: 'players/marker-red-06.png', centreUnits: 368, orientation: 'flopped' },
];

function playerSpec(spec, row) {
  return {
    ...spec,
    bottomUnits: row === 'far' ? 193 : 252,
    heightUnits: personHeightAt(row === 'far' ? 193 : 252),
    // Blue kits are legitimately B > G, so the blue-channel clamp the Sentosa
    // players use would turn them teal. The magenta-pair clamp only bites where
    // red AND blue both exceed green, which neither skin nor kit can satisfy.
    despill: 'people',
    spill: '#caa07a',
  };
}

function buildShadows(players) {
  const output = join(OUT, 'contact-shadows.png');
  const draws = players.flatMap((player) => {
    const centre = player.left + player.width / 2;
    const radius = Math.max(18, player.width * 0.27);
    return ['-draw', `ellipse ${centre},${player.top + player.height - 3} ${radius},6 0,360`];
  });
  run(['-size', `${CANVAS.width}x${CANVAS.height}`, 'xc:none',
    '-fill', 'rgba(20,35,28,0.11)', ...draws, '-blur', '0x3', output]);
  return { name: 'contact-shadows', file: 'contact-shadows.png', left: 0, top: 0, width: CANVAS.width, height: CANVAS.height, z: 29 };
}

function buildChairAndCatcher(side) {
  const isLeft = side === 'left';
  const centre = isLeft ? 55 : 425;
  const orientation = isLeft ? 'normal' : 'flopped';
  const chair = processSprite({
    name: `chair-${side}`, source: 'chair.png', centreUnits: centre, bottomUnits: 206,
    widthUnits: 21, orientation, despill: 'magenta-pair', spill: '#8a8f94',
  });
  const seatY = chair.top + chair.height * 0.42;
  const catcher = processSprite({
    name: `catcher-${side}`, source: isLeft ? 'players/catcher-blue-01.png' : 'players/catcher-red-01.png',
    centreUnits: centre, bottomUnits: seatY / SCALE, heightUnits: personHeightAt(206),
    orientation, despill: 'people', spill: '#caa07a',
  });
  // The catcher stands ON the chair, so the pair's stacking is fixed by hand:
  // derived z would sort the catcher (feet at the seat) behind its own chair.
  return [{ ...chair, z: 30.6 }, { ...catcher, z: 30.7 }];
}

function buildBall() {
  return processSprite({
    name: 'ball', source: 'ball.png', centreUnits: 250, bottomUnits: 203,
    widthUnits: 11, despill: 'magenta-pair', spill: '#dfe4e8',
  });
}

function buildForeground() {
  return processSprite({
    name: 'palm-foreground', source: 'palm-01.png', leftUnits: -24, bottomUnits: 272,
    widthUnits: 76, despill: 'foliage', spill: '#2f5d24',
  });
}

function percent(value, total) {
  return `${((value / total) * 100).toFixed(3)}%`;
}

function renderPreviewHtml(layers) {
  const images = layers.map((layer) => {
    const style = [
      `left:${percent(layer.left, CANVAS.width)}`,
      `top:${percent(layer.top, CANVAS.height)}`,
      `width:${percent(layer.width, CANVAS.width)}`,
      `height:${percent(layer.height, CANVAS.height)}`,
    ].join(';');
    return `<img src="${layer.file}" alt="" style="${style}">`;
  });
  writeFileSync(join(OUT, '_preview.html'), [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Generic heartland scene — composition preview</title>',
    '<style>html,body{margin:0;min-height:100%;background:#101b22}',
    '.scene{position:relative;width:min(100vw,177.778vh);aspect-ratio:16/9;margin:auto;overflow:hidden;background:#bcd9ea}',
    '.scene img{position:absolute;display:block;user-select:none;-webkit-user-drag:none}',
    '</style></head><body>',
    `<main class="scene" aria-label="Generic heartland captain's ball scene composition preview">${images.join('')}</main>`,
    '</body></html>',
  ].join('\n'));
}

function renderPreviewPng(layers) {
  const output = join(OUT, '_preview.png');
  const args = [join(OUT, 'sky.jpg')];
  for (const layer of layers.slice(1)) {
    args.push(join(OUT, layer.file), '-geometry', `+${layer.left}+${layer.top}`, '-composite');
  }
  args.push('-resize', '1600x', output);
  run(args);
}

function report(layers) {
  const files = readdirSync(OUT).sort();
  const total = files.reduce((sum, file) => sum + statSync(join(OUT, file)).size, 0);
  console.log(`${layers.length} layers, ${files.length} files, ${(total / 1048576).toFixed(2)} MB`);
  console.log(`Preview: ${join(OUT, '_preview.html')}`);
  console.log(`Composite: ${join(OUT, '_preview.png')}`);
}

function main() {
  requireSources([
    'sky-01.png', 'ground-01.png', 'court-01.png', 'chair.png', 'ball.png',
    ...FAR_SKYLINE.map((spec) => spec.source),
    ...HEARTLAND.map((spec) => spec.source),
    ...MIDGROUND.map((spec) => spec.source),
    ...FAR_PLAYERS.map((spec) => spec.source),
    ...NEAR_PLAYERS.map((spec) => spec.source),
    'players/catcher-blue-01.png', 'players/catcher-red-01.png', 'palm-01.png',
  ]);
  rmSync(TMP, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const farPlayers = FAR_PLAYERS.map((spec) => processSprite(playerSpec(spec, 'far')));
  const nearPlayers = NEAR_PLAYERS.map((spec) => processSprite(playerSpec(spec, 'near')));
  const leftGoal = buildChairAndCatcher('left');
  const rightGoal = buildChairAndCatcher('right');
  const shadowPlayers = [...farPlayers, ...nearPlayers, ...leftGoal, ...rightGoal];

  const layers = [
    buildSky(),
    buildGround(),
    ...FAR_SKYLINE.map((spec) => processSprite({
      ...spec, despill: 'magenta-pair', spill: '#9fb6c4', grade: 'far',
    })),
    buildHaze(),
    ...HEARTLAND.map((spec) => processSprite({
      ...spec, despill: 'magenta-pair', spill: '#9fb6c4',
    })),
    ...MIDGROUND.map((spec) => processSprite(spec)),
    buildCourt(),
    buildShadows(shadowPlayers),
    ...farPlayers,
    ...leftGoal,
    ...rightGoal,
    ...nearPlayers,
    buildBall(),
    buildForeground(),
  ];

  layers.sort((a, b) => a.z - b.z);
  console.log(`z-order: ${layers.map((layer) => layer.name).join(' < ')}`);
  renderPreviewHtml(layers);
  renderPreviewPng(layers);
  report(layers);
}

main();
