#!/usr/bin/env node
/**
 * ADR-193 — turns the photoreal renders in `.scene-src/` into the layer set the scene
 * contract expects, and prints the geometry to paste into `src/themes/sentosa/art/realArt.ts`.
 *
 * This is NOT `generate-pixel.mjs`. That one *draws* the classic and fine backdrops from
 * code, so its output is reproducible from the repo alone. This one *processes* renders
 * that cannot be reproduced from the repo, so the sources are committed alongside it and
 * this script is a one-off asset pipeline, deliberately outside every `npm run` gate.
 *
 * Requires ImageMagick 6 (`convert`), which the toolchain has but the build does not.
 * Run: `node apps/web/scripts/scene/generate-real.mjs`
 *
 * ADR-298 — this is Sentosa's, and only Sentosa's, by design. It processes photographs whose
 * sources live in one venue's `.scene-src/` and whose geometry is that venue's
 * (`themes/sentosa/scene/real-geometry.mjs`); it is not a pipeline a second venue plugs into,
 * and it takes no `--theme` because pretending it did would promise a build nobody can run. A
 * venue with photoreal art would get its own script beside its own sources. A venue without one
 * simply declares no `real` style in its theme (`VenueTheme.styles`).
 *
 * The three jobs the scene CSS imposes, and how each is met:
 *
 *  - `.gb-scene__drift` (clouds, waves) sits in a 200%-wide box with `repeat-x` at
 *    `50% auto` and is translated by exactly one tile, so the art MUST tile seamlessly or
 *    a vertical seam walks across the sky every cycle. A photoreal render never tiles.
 *    Mirroring it — tile + its own horizontal flip — makes both the join and the wrap
 *    identical by construction, which is why the output is twice the width of the input.
 *  - `.gb-scene__foam` and every `.gb-scene__frame` layer are TWO-FRAME SHEETS stepped by
 *    `steps(2, jump-none)`. Asking an image model for a sprite sheet gets you two unrelated
 *    pictures, so frame B is derived here from frame A by a small deterministic transform:
 *    the surf rolls half a tile, the palms and players shift and shear a little, the gull
 *    drops its wings. Derived frames guarantee the pair actually belongs to one subject.
 *  - Sprites keyed off flat magenta. The subjects are grey, white, green, blue, yellow and
 *    skin, none of which sit near #FF00FF, so a 25% fuzz lifts the background without
 *    biting into the art.
 *
 * Clouds, waves and foam are keyed differently: they were rendered as white-on-black, and
 * their own luminance becomes their alpha. Soft-edged white things — cloud fringes, foam
 * lace, water glints — have no clean outline to trim to, and a chroma key on them leaves a
 * hard halo. Luminance-as-alpha keeps the feathering the render already has.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCENE as SCENE_UNITS, STRIPS, WIDTH_SPRITES, SHEETS, PLACED, PLAYER_PERIODS_REAL,
  CLASSES, CABLE, CABLECARS, CABLE_SECONDS, pct } from '../themes/sentosa/scene/real-geometry.mjs';

/*
 * Every figure, whichever side of the net. Derived rather than listed, because this used to
 * be three separate hardcoded arrays — the spill colour, the despill channel and the build
 * loop — and adding four players meant finding all three. A roster that the generator still
 * has to be told about is not a roster.
 */
const PLAYERS = Object.keys(SHEETS).filter((name) => SHEETS[name].roster?.startsWith('player'));

if (process.argv.includes('--theme') && process.argv[process.argv.indexOf('--theme') + 1] !== 'sentosa') {
  throw new Error('generate-real.mjs builds the Sentosa photoreal scene only (ADR-298); other venues have none.');
}

const SRC = '.scene-src';
const OUT = 'apps/web/public/themes/sentosa/scene-real';
const TMP = '/tmp/real-scene';

const SCENE = SCENE_UNITS;
/** Pixels per art unit. 8 puts the panorama at 3840x2160. */
const SCALE = 8;

function run(args) {
  execFileSync('convert', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

function size(file) {
  const out = execFileSync('identify', ['-format', '%w %h', file]).toString().split(' ');
  return { width: Number(out[0]), height: Number(out[1]) };
}

/**
 * Flat-magenta background to alpha, trimmed to the subject's bounding box — and then the
 * two steps that stop the key from showing.
 *
 * ImageMagick resizes RGBA without premultiplying, so a *fully transparent* pixel still
 * carries its colour into the average when the image is scaled down. Key magenta, shrink a
 * palm from 1024px to 464px, and every gap between the leaflets averages green with the
 * magenta that is still sitting invisibly behind it: the frond comes back wearing a bright
 * pink halo. It is invisible at full size and unmissable in the composite, which is the
 * whole reason `renderPreview` exists.
 *
 * `-alpha background` repaints the transparent region in a colour taken from the subject
 * while leaving it transparent, so the bleed is green into green and reads as nothing. The
 * erode then pulls the edge in by a pixel to clear whatever partial-alpha ring survives
 * the fuzz.
 */
const SPILL = {
  palmLeft: '#2f5d24',
  palmRight: '#2f5d24',
  portal: '#2f5d24',
  bird: '#d8dde2',
  ball: '#dfe4e8',
  cablecar: '#8a8f94',
  express: '#dfe4e8',
  ...Object.fromEntries(PLAYERS.map((name) => [name, '#caa07a'])),
};

/**
 * Subjects whose every edge pixel is green, so a green despill is safe. `-alpha background`
 * only repaints pixels that are FULLY transparent; the partial-alpha ring around a frond
 * keeps whatever magenta it blended with, and on fronds that ring is most of the silhouette.
 * Taking `min(channel, green)` in red and blue drags those pixels back to green — correct
 * for foliage, and exactly why it is opt-in rather than applied to the volleyball.
 */
/**
 * Which channels to drag back toward green, per subject.
 *
 * `rb` clamps red AND blue to green: right for foliage, and a no-op on anything already
 * neutral, which is why the net uses it too — a white tape band has R=G=B, so the clamp only
 * bites on pixels that actually went magenta.
 *
 * `b` clamps blue alone, and exists entirely for skin. Human skin is legitimately R > G > B,
 * so clamping red would turn every player grey-green; blue is the only channel magenta spill
 * raises that skin does not.
 *
 * `M` is neither, and ADR-214 needed it. The USS globe carries legitimate GOLD (R > G > B) and
 * legitimate BLUE (B > G) in the same sprite, so a red clamp greys the lettering and a blue
 * clamp greys the sphere: every unconditional choice destroys something real. `M` instead
 * clamps a pixel only where it is actually magenta-ish — where R and B BOTH exceed G, which
 * gold cannot satisfy (its B is low) and blue cannot satisfy (its R is low), but a white mist
 * blended with the magenta backdrop does. Prefer it whenever a subject spans both sides.
 */
const DESPILL = {
  palmLeft: 'RB', palmRight: 'RB', portal: 'RB', net: 'RB',
  // Pale stone and white water: neutral, so the full clamp only bites where magenta got in.
  merlion: 'RB', skyHelix: 'RB', guideway: 'RB',
  // Red and green planking on the same hull: red wants blue clamped, green wants red
  // clamped, and doing both leaves grey. Blue alone is the only choice that harms neither.
  bumboat: 'B',
  ferry2: 'R',
  // Chrome, white hulls and a cream terminal: red alone. Clamping blue would grey out the
  // globe's oceans and the stripe along the waterline, both of which are honestly blue.
  // Gold letters AND a blue sphere: see `M` above. The mist at the fountain is what forced it.
  uss: 'M',
  ferry: 'R', ferryMoored: 'R', ferryJetty: 'B',
  // Cream walls want red clamped, an orange tile roof very much does not. Roof wins: it is
  // most of the sprite, and a terminal with a grey roof stops being the terminal.
  ferryTerminal: 'B',
  // Skin, and anything warm-toned, is legitimately R > G > B. Clamping red would turn it
  // grey-green, so these get blue alone — the one channel magenta raises that they do not.
  ...Object.fromEntries(PLAYERS.map((name) => [name, 'B'])),
  umbrella: 'B',
  // Blue-and-white stripes are legitimately B > G, so the clamp runs the other way round.
  deckchair: 'R',
};

/*
 * Parts that are not rendered from a file of their own. `ferryMoored` is the same boat as
 * `ferry`, flopped and tied up at the pier — asking the image tool for a second ferry would
 * have produced a different vessel, and two obviously different ferries in one small bay is
 * a busier claim than the scene needs to make.
 */
const SOURCE = { ferryMoored: 'ferry' };
const FLOP = new Set(['ferryMoored']);
/*
 * The guideway render rises left to right, because that is how the model drew a viaduct.
 * A train travelling a horizontal path would walk off it, so the beam is sheared level
 * before anything else happens to it. Cheaper and more exact than asking for another one.
 */
const SHEAR = { guideway: '0x-9.5' };

function keyMagenta(name) {
  const dst = join(TMP, `${name}-keyed.png`);
  run([
    join(SRC, `${SOURCE[name] ?? name}.png`),
    ...(FLOP.has(name) ? ['-flop'] : []),
    ...(SHEAR[name] ? ['-background', 'magenta', '-shear', SHEAR[name]] : []),
    '-fuzz', '30%', '-transparent', 'magenta',
    '-channel', 'A', '-morphology', 'Erode', 'Octagon:1', '+channel',
    '-background', SPILL[name] ?? '#808080', '-alpha', 'background',
    '-trim', '+repage',
    dst,
  ]);
  const channels = DESPILL[name];
  if (channels === 'M') {
    run([dst,
      '-channel', 'R', '-fx', 'min(u.r,u.b)>u.g ? u.g : u.r',
      '-channel', 'B', '-fx', 'min(u.r,u.b)>u.g ? u.g : u.b',
      '+channel', dst]);
  } else if (channels) {
    run([dst, '(', '+clone', '-channel', 'G', '-separate', '+channel', ')',
      '-compose', 'Darken', '-channel', channels, '-composite', dst]);
  }
  return dst;
}

/** White-on-black render to a soft alpha: the image's own luminance becomes its opacity. */
function keyLuminance(name) {
  const dst = join(TMP, `${name}-keyed.png`);
  run([
    join(SRC, `${name}.png`),
    '(', '+clone', '-colorspace', 'gray', '-auto-level', ')',
    '-alpha', 'off', '-compose', 'copy_opacity', '-composite',
    dst,
  ]);
  return dst;
}

/** Fit inside the box without distorting, then pad to it so the CSS geometry still holds. */
function fitInto(src, dst, width, height) {
  run([
    src, '-resize', `${width}x${height}`,
    '-background', 'none', '-gravity', 'center', '-extent', `${width}x${height}`,
    dst,
  ]);
  return dst;
}

/** tile + its own mirror, so the join and the wrap are the same edge by construction. */
function mirrorTile(src, dst, width, height) {
  const half = Math.round(width / 2);
  run([
    src, '-resize', `${half}x${height}!`,
    '(', '+clone', '-flop', ')', '+append',
    dst,
  ]);
  return dst;
}

/** Two frames side by side: the layer is one frame wide with the sheet at 200%. */
function sheet(frameA, frameB, dst) {
  run([frameA, frameB, '+append', dst]);
  return dst;
}

function main() {
  if (!existsSync(SRC)) throw new Error(`${SRC} is missing — the renders are not in the tree.`);
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const parts = {};

  buildPanorama();
  buildStrips(parts);
  buildWidthSprites(parts);
  buildCable(parts);
  buildCableCars(parts);
  buildPlaced(parts);
  buildPalms(parts);
  buildBirds(parts);
  buildPlayers(parts);

  writeFileSync('apps/web/src/themes/sentosa/art/realArt.ts', renderModule(parts));
  renderPreview(parts);
  renderPreviewHtml(parts);
  report(parts);
}

/** Opaque, so JPEG: 3840x2160 of photoreal PNG is 11 MB of alpha channel nobody reads. */
function buildPanorama() {
  const box = `${units(SCENE.width)}x${units(SCENE.height)}`;
  /*
   * Most-decomposed wins. Each of these is the one before it with another object painted
   * out: `panorama.png` is the original, `-nonet` dropped the volleyball net (ADR-194) and
   * `-base` dropped the Merlion, the pier, the umbrella and the chair (ADR-195). They are
   * all kept because each was produced by editing its predecessor, so the chain is the only
   * record of how the backdrop was stripped — and re-running an edit is not reproducible.
   */
  const source = ['panorama-nowires.png', 'panorama-terminal.png', 'panorama-sentosa.png', 'panorama-base.png', 'panorama-nonet.png', 'panorama.png']
    .find((name) => existsSync(join(SRC, name)));
  run([
    join(SRC, source),
    '-resize', `${box}^`, '-gravity', 'center', '-extent', box,
    '-quality', '88', '-interlace', 'Plane',
    join(OUT, 'panorama.jpg'),
  ]);
}

/** An alpha ramp the full size of the tile: white keeps, black hides. */
function fadeMask(name, strip, spec) {
  const box = `${units(SCENE.width)}x${units(strip.height)}`;
  const dst = join(TMP, `${name}-mask.png`);
  if (spec === 'both') {
    // Opaque through the middle, transparent at both edges, so the band has no rectangle.
    const half = `${units(SCENE.width)}x${Math.round(units(strip.height) / 2)}`;
    run(['-size', half, 'gradient:black-white', '-size', half, 'gradient:white-black',
      '-append', '-resize', `${box}!`, dst]);
  } else {
    run(['-size', box, 'gradient:white-black', dst]);
  }
  return dst;
}

function buildStrips(parts) {
  for (const [name, strip] of Object.entries(STRIPS)) {
    const source = strip.mode === 'opaque'
      ? join(SRC, `${name}.png`)
      : keyLuminance(name);
    const tile = mirrorTile(source, join(TMP, `${name}-tile.png`),
      units(SCENE.width), units(strip.height));
    if (strip.fade) {
      run([tile, '(', '+clone', '-alpha', 'extract', fadeMask(name, strip, strip.fade),
        '-compose', 'multiply', '-composite', ')',
        '-alpha', 'off', '-compose', 'copy_opacity', '-composite', tile]);
    }
    if (name === 'foam') {
      // Two-frame sheet: frame B is frame A rolled half a tile, so the lace travels along
      // the shore instead of two unrelated surf lines blinking at each other.
      const b = join(TMP, 'foam-b.png');
      run([tile, '-roll', `+${units(SCENE.width / 2)}+0`, b]);
      sheet(tile, b, join(OUT, 'foam.png'));
      parts[`${name}__frames`] = 2;
    } else {
      run([tile, join(OUT, `${name}.png`)]);
    }
    parts[name] = {
      file: `${name}.png`,
      style: { top: pct(strip.top, SCENE.height), height: pct(strip.height, SCENE.height) },
    };
  }
}

function buildWidthSprites(parts) {
  for (const [name, spec] of Object.entries(WIDTH_SPRITES)) {
    const keyed = keyMagenta(name);
    run([keyed, '-resize', `${units(spec.artWidth)}x`, join(OUT, `${name}.png`)]);
    parts[name] = {
      file: `${name}.png`,
      style: {
        backgroundSize: `${pct(spec.artWidth, SCENE.width)} auto`,
        backgroundPosition: `${spec.posX}% ${spec.posY}%`,
        // The stagger is data, not a list in the component. A cabin or a boat that wants
        // its own offset or its own pace says so here and nothing else has to know.
        ...(spec.delay ? { animationDelay: spec.delay } : {}),
        ...(spec.duration ? { animationDuration: spec.duration } : {}),
      },
      previewX: spec.previewX ?? 0,
      previewY: spec.previewY ?? 0,
    };
  }
}

/** Frame box from the measured aspect, then the anchor decides where the box hangs. */
function boxFor(spec, aspect) {
  const width = spec.drive === 'width' ? spec.units : Math.round(spec.units * aspect);
  const height = spec.drive === 'width' ? Math.round(spec.units / aspect) : spec.units;
  const top = spec.anchor === 'bottom' ? spec.bottom - height : spec.top;
  return { width, height, top };
}

function frameStyle(spec, box) {
  return {
    left: pct(spec.left, SCENE.width),
    top: pct(box.top, SCENE.height),
    width: pct(box.width, SCENE.width),
    height: pct(box.height, SCENE.height),
    backgroundSize: '200% auto',
  };
}

/** Single frame, explicit box, height from the measured aspect. No sheet, no animation. */
function buildPlaced(parts) {
  for (const [name, spec] of Object.entries(PLACED)) {
    const keyed = keyMagenta(name);
    const measured = size(keyed);
    const height = spec.height ?? Math.round(spec.width / (measured.width / measured.height));
    const width = units(spec.width);
    run([keyed, '-resize', `${width}x${units(height)}!`, join(OUT, `${name}.png`)]);
    parts[name] = {
      file: `${name}.png`,
      style: {
        left: pct(spec.left, SCENE.width),
        top: pct(spec.bottom - height, SCENE.height),
        width: pct(spec.width, SCENE.width),
        height: pct(height, SCENE.height),
        backgroundSize: '100% 100%',
      },
    };
  }
}

/**
 * ADR-201 — the wire itself, drawn from `CABLE` rather than photographed.
 *
 * Two ropes, because a cable car hangs from a track rope with a haul rope beside it, and
 * one line reads as a scratch on the lens. Drawn at full scene size so the geometry is
 * literally the art: there is no scaling step in which it could drift off the cabins.
 */
function buildCable(parts) {
  const W = units(SCENE.width);
  const H = units(SCENE.height);
  const [x0, y0, x1, y1] = [CABLE.x0, CABLE.y0, CABLE.x1, CABLE.y1].map(units);
  const gap = units(CABLE.gap);
  run(['-size', `${W}x${H}`, 'xc:none', '-stroke', '#45494e', '-strokewidth', '2',
    '-draw', `line ${x0},${y0} ${x1},${y1}`,
    '-draw', `line ${x0},${y0 + gap} ${x1},${y1 + gap}`,
    join(OUT, 'cable.png')]);
  // Boxed to the whole scene explicitly. `gb-scene__layer` already is, but saying so keeps
  // it in the same shape as every other placed part — including for the preview compositor.
  parts.cable = {
    file: 'cable.png',
    style: { left: '0%', top: '0%', width: '100%', height: '100%', backgroundSize: '100% 100%' },
  };
}

/**
 * The cabins. Each hangs by the top centre of its own box from a point on the cable, and
 * travels the whole vector to the far end; the negative delay is what spreads them out.
 *
 * Both numbers come from `CABLE`, so "is the cabin on the wire" is not a thing that can be
 * got wrong by a pixel — it is the same two points in both places. The translate is handed
 * to the keyframe as custom properties because each cabin is a different size and a
 * percentage transform is relative to the element, not the scene.
 */
function buildCableCars(parts) {
  const span = { x: CABLE.x1 - CABLE.x0, y: CABLE.y1 - CABLE.y0 };
  for (const [name, spec] of Object.entries(CABLECARS)) {
    const keyed = keyMagenta(name);
    const measured = size(keyed);
    const boxW = spec.artWidth;
    const boxH = boxW / (measured.width / measured.height);
    run([keyed, '-resize', `${units(boxW)}x${units(boxH)}!`, join(OUT, `${name}.png`)]);
    parts[name] = {
      file: `${name}.png`,
      style: {
        left: pct(CABLE.x0 - boxW / 2, SCENE.width),
        top: pct(CABLE.y0, SCENE.height),
        width: pct(boxW, SCENE.width),
        height: pct(boxH, SCENE.height),
        backgroundSize: '100% 100%',
        '--gb-cable-dx': `${((span.x / boxW) * 100).toFixed(1)}%`,
        '--gb-cable-dy': `${((span.y / boxH) * 100).toFixed(1)}%`,
        animationDelay: `${(-spec.at * CABLE_SECONDS).toFixed(2)}s`,
      },
      // The still frame draws t=0 for everything, so it is told where each cabin actually
      // sits once the delays have taken effect.
      previewX: spec.at * span.x,
      previewY: spec.at * span.y,
    };
  }
}

function buildPalms(parts) {
  const base = keyMagenta('palmLeft');
  for (const name of ['palmLeft', 'palmRight']) {
    const spec = SHEETS[name];
    const oriented = join(TMP, `${name}-base.png`);
    run(name === 'palmRight' ? [base, '-flop', oriented] : [base, oriented]);
    const measured = size(oriented);
    const box = boxFor(spec, measured.width / measured.height);
    const frameW = units(box.width);
    const frameH = units(box.height);
    const a = fitInto(oriented, join(TMP, `${name}-a.png`), frameW, frameH);
    // The breeze: a small shear, which reads as fronds moving rather than the whole tree
    // sliding sideways. `-background none` or the shear fills the new corner with black.
    const b = join(TMP, `${name}-b.png`);
    run([a, '-background', 'none', '-shear', '1.6x0', '-resize', `${frameW}x${frameH}!`, b]);
    sheet(a, b, join(OUT, `${name}.png`));
    parts[name] = { file: `${name}.png`, style: frameStyle(spec, box) };
  }
}

function buildBirds(parts) {
  const spec = SHEETS.birds;
  const keyed = keyMagenta('bird');
  const measured = size(keyed);
  const box = boxFor(spec, measured.width / measured.height);
  const frameW = units(box.width);
  const frameH = units(box.height);
  const a = fitInto(keyed, join(TMP, 'bird-a.png'), frameW, frameH);
  // Frame B drops the wings: squashed to 62% and re-padded, so the gull flaps in place.
  const b = join(TMP, 'bird-b.png');
  run([a, '-resize', `${frameW}x${Math.round(frameH * 0.62)}!`,
    '-background', 'none', '-gravity', 'center', '-extent', `${frameW}x${frameH}`, b]);
  sheet(a, b, join(OUT, 'birds.png'));
  parts.birds = { file: 'birds.png', style: frameStyle(spec, box) };
}

function buildPlayers(parts) {
  for (const name of PLAYERS) {
    if (!existsSync(join(SRC, `${name}.png`))) continue;
    const spec = SHEETS[name];
    const keyed = keyMagenta(name);
    const measured = size(keyed);
    const box = boxFor(spec, measured.width / measured.height);
    const frameW = units(box.width);
    const frameH = units(box.height);
    const a = fitInto(keyed, join(TMP, `${name}-a.png`), frameW, frameH);
    const b = join(TMP, `${name}-b.png`);
    run([a, '-background', 'none', '-virtual-pixel', 'none',
      '-distort', 'SRT', `${frameW / 2},${frameH} 1.03 0 ${frameW / 2},${frameH}`, b]);
    sheet(a, b, join(OUT, `${name}.png`));
    parts[name] = { file: `${name}.png`, style: frameStyle(spec, box) };
  }
}

function units(value) {
  return Math.round(value * SCALE);
}

/**
 * Back to front. The three that matter: `player1`/`player2` before `net`, `net` before
 * `player3`/`player4`, and the palms last of all because they are the closest thing in the
 * frame and must crop everything else, players included.
 */
const ORDER = ['panorama', 'clouds', 'cable', 'cablecar', 'cablecar2', 'cablecar3',
  'skyHelix', 'uss', 'ferry', 'bumboat',
  'water', 'waves', 'foam', 'merlion',
  'guideway', 'express', 'portal',
  'ferryJetty', 'ferry2', 'ferryTerminal', 'birds', 'umbrella', 'deckchair',
  'player5', 'player1', 'player6', 'player2', 'net',
  'player7', 'player3', 'player8', 'player4', 'ball',
  'palmLeft', 'palmRight'];

function styleLiteral(style) {
  // CSS custom properties are legal style keys and illegal JS identifiers, so anything
  // that is not a plain name gets quoted rather than emitted bare.
  const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`);
  return Object.entries(style).map(([k, v]) => `${key(k)}: '${v}'`).join(', ');
}

function renderModule(parts) {
  const version = Date.now().toString(36);
  /*
   * Rosters. A sprite declares which item type it is one of; the emitter groups them and
   * writes one list per type. Adding a fourth cable car or a ninth player is then a line of
   * geometry and a PNG — the generator, the component and the CSS all stay shut.
   */
  const ROSTER_EXPORTS = {
    playerFar: ['REAL_PLAYERS_FAR', 'Far side: drawn UNDER the net.'],
    playerNear: ['REAL_PLAYERS_NEAR', 'Near side: drawn OVER the net.'],
    cablecar: ['REAL_CABLECARS', 'Cabins on the cable, each with its own livery and offset.'],
    crossing: ['REAL_BOATS', 'Vessels crossing the open water, each at its own pace.'],
    moored: ['REAL_MOORED', 'Vessels tied up at the jetty.'],
  };
  const specs = { ...WIDTH_SPRITES, ...CABLECARS, ...SHEETS, ...PLACED };
  const rosters = Object.entries(ROSTER_EXPORTS).map(([roster, [name, doc]]) => {
    const members = ORDER.filter((part) => specs[part]?.roster === roster);
    return ['', `/** ${doc} */`, `export const ${name}: readonly RealScenePart[] = [`,
      ...members.map((part) => `  SCENE_PARTS_REAL.${part},`), '];'];
  }).flat();
  const lines = ORDER.filter((name) => name === 'panorama' || typeof parts[name] === 'object').map((name) => {
    if (name === 'panorama') {
      return `  panorama: { src: '/themes/sentosa/scene-real/panorama.jpg?v=${version}', `
        + `className: '${CLASSES.panorama}', style: { backgroundSize: '100% 100%' } },`;
    }
    return `  ${name}: { src: '/themes/sentosa/scene-real/${parts[name].file}?v=${version}', `
      + `className: '${CLASSES[name] ?? ''}', style: { ${styleLiteral(parts[name].style)} } },`;
  });
  return [
    '/* GENERATED by apps/web/scripts/scene/generate-real.mjs — do not edit. */',
    '/* Run `node apps/web/scripts/scene/generate-real.mjs` after changing the renders. */',
    '',
    '/**',
    ' * ADR-193/200 — the photoreal backdrop, reached by `?backdrop=real`.',
    ' *',
    ' * Same art space and the same layer contract as `pixelArt.ts`, so `<SentosaRealScene>` is',
    ' * the pixel scene with different files and smoothing turned back on. Nothing imports',
    ' * this into a route: it is built, reviewable and inert until somebody asks for it.',
    ' */',
    '',
    `export const REAL_SCENE_VERSION = '${version}';`,
    '',
    '/** Art-space size of the backdrop; the scene box keeps this ratio at every width. */',
    `export const REAL_SCENE_SIZE = { width: ${SCENE.width}, height: ${SCENE.height} } as const;`,
    '',
    'export const SCENE_PARTS_REAL = {',
    ...lines,
    '} as const;',
    '',
    '/**',
    ' * Far side: drawn UNDER the net, which is what makes the court have a far side at all.',
    ' *',
    ' * The sheets that exist, in draw order. Exported as lists rather than read off',
    ' * the record so the component never has to ask whether a figure was rendered yet: the',
    ' * renders arrive in batches, and a half-populated scene must still compile and draw.',
    ' *',
    ' * Typed rather than `as const` for exactly that reason: an empty `as const` array has',
    ' * element type `never`, so the component stops compiling the moment the list is bare.',
    ' */',
    'export interface RealScenePart {',
    '  src: string;',
    '  className: string;',
    '  style: Record<string, string>;',
    '}',
    '',
    ...rosters,
    '',
    '/** Flip periods, one per figure, deliberately non-harmonic. */',
    `export const REAL_PLAYER_PERIODS = ${JSON.stringify(PLAYER_PERIODS_REAL)} as const;`,
    '',
  ].join('\n');
}

/**
 * ADR-199 — a live, animated review page.
 *
 * `_preview.png` is one frame at t=0, which is exactly how a cable car spent several turns
 * travelling off its own wire without anybody seeing it. This writes the real layer stack
 * as plain HTML next to the art, linked against the real `gameboy.css`, so the scene can be
 * watched moving without being wired into the app: no route, no `resolveBackdrop`, no
 * import from any shipped module. It is generated from the same `ORDER` and the same
 * `CLASSES` the component uses, so it cannot drift away from what the app would draw.
 *
 * Gitignored, like the PNG. It is a tool, not an artefact.
 */
function renderPreviewHtml(parts) {
  // The panorama never enters `parts` — the module emitter writes it as a literal, because
  // it is the one layer that is a JPEG and has no generated style. It still has to be here.
  const base = `<div class="${CLASSES.panorama}" style="background-size: 100% 100%; `
    + `background-image: url('panorama.jpg')"></div>`;
  const layers = ORDER.filter((name) => typeof parts[name] === 'object').map((name, index) => {
    const style = Object.entries(parts[name].style)
      .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value}`)
      .concat(`background-image: url('${parts[name].file}')`)
      .concat(CLASSES[name]?.includes('__player')
        ? `--gb-period: ${PLAYER_PERIODS_REAL[index % PLAYER_PERIODS_REAL.length]}` : [])
      .join('; ');
    const div = `<div class="${CLASSES[name] ?? ''}" style="${style}"></div>`;
    // The ball hops inside a serving arc, so it needs its wrapper here too.
    return name === 'ball' ? `<div class="gb-scene__layer gb-scene__serve">${div}</div>` : div;
  });
  writeFileSync(join(OUT, '_preview.html'), [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<title>Photoreal backdrop — live review</title>',
    '<link rel="stylesheet" href="../../../../src/styles/gameboy.css">',
    '<style>html,body{margin:0;height:100%;background:#0b1d2a;overflow:hidden}',
    '.gb-scene{z-index:0}</style>',
    '</head><body class="theme-gameboy">',
    `<div class="gb-scene gb-scene--real" aria-hidden="true">${base}${layers.join('')}</div>`,
    '</body></html>',
  ].join('\n'));
}

/**
 * A flattened composite at full size. The scene is fifteen transparent layers that only
 * ever meet in a browser. It predates `?backdrop=life` and still earns its place: it is the
 * only view of the scene that needs no server, and it is what the generator prints.
 */
function renderPreview(parts) {
  const args = [join(OUT, 'panorama.jpg')];
  const W = units(SCENE.width);
  const H = units(SCENE.height);
  for (const name of ORDER.slice(1)) {
    const part = parts[name];
    if (!part || typeof part !== 'object') continue;
    const file = join(OUT, part.file);
    const style = part.style;
    const measured = size(file);
    const isSheet = style.backgroundSize === '200% auto' || parts[`${name}__frames`] === 2;
    const frameW = isSheet ? Math.round(measured.width / 2) : measured.width;
    const cropped = join(TMP, `pv-${name}.png`);
    run([file, '-crop', `${frameW}x${measured.height}+0+0`, '+repage', cropped]);
    let x = 0;
    let y = 0;
    if (style.left !== undefined) {
      x = Math.round((Number.parseFloat(style.left) / 100) * W) + units(part.previewX ?? 0);
      y = Math.round((Number.parseFloat(style.top) / 100) * H) + units(part.previewY ?? 0);
      run([cropped, '-resize',
        `${Math.round((Number.parseFloat(style.width) / 100) * W)}x${Math.round((Number.parseFloat(style.height) / 100) * H)}!`,
        cropped]);
    } else if (style.backgroundPosition !== undefined) {
      const [px, py] = style.backgroundPosition.split(' ').map(Number.parseFloat);
      const sized = Math.round((Number.parseFloat(style.backgroundSize) / 100) * W);
      run([cropped, '-resize', `${sized}x`, cropped]);
      const after = size(cropped);
      x = Math.round((px / 100) * (W - after.width)) + units(part.previewX ?? 0);
      y = Math.round((py / 100) * (H - after.height)) + units(part.previewY ?? 0);
    } else {
      y = Math.round((Number.parseFloat(style.top) / 100) * H);
      run([cropped, '-resize', `${W}x${Math.round((Number.parseFloat(style.height) / 100) * H)}!`, cropped]);
    }
    args.push(cropped, '-geometry', `+${x}+${y}`, '-composite');
  }
  args.push('-resize', '1600x', 'apps/web/public/themes/sentosa/scene-real/_preview.png');
  run(args);
}

function report(parts) {
  const files = readdirSync(OUT).sort();
  const total = files.reduce((sum, f) => sum + statSync(join(OUT, f)).size, 0);
  for (const f of files) {
    // ImageMagick will cheerfully try to rasterise the review page through html2ps.
    if (!/\.(png|jpg)$/.test(f)) {
      console.log(`  ${f.padEnd(16)} ${'—'.padStart(11)}` +
        ` ${(statSync(join(OUT, f)).size / 1024).toFixed(0)} kB`);
      continue;
    }
    const s = size(join(OUT, f));
    console.log(`  ${f.padEnd(16)} ${String(s.width).padStart(5)}x${String(s.height).padEnd(5)}` +
      ` ${(statSync(join(OUT, f)).size / 1024).toFixed(0)} kB`);
  }
  console.log(`\n${files.length} files, ${(total / 1048576).toFixed(2)} MB; ${Object.keys(parts).length} layers`);
}

main();
