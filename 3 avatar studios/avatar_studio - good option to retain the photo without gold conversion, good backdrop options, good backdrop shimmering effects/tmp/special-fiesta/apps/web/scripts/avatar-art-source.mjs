/**
 * The avatar art, drawn at 64×64 — the source of record (ADR-021, ADR-026).
 *
 * Framing is a *mugshot*: crown at row 4, eyes across rows 31–39, chin at 50, shoulders
 * filling the bottom. The head is 62 % of the frame wide and 72 % tall, so a face still
 * reads at 32 px in a leaderboard row and looks drawn, not distant, at 96 px.
 *
 * The style is anime/manga: a heavy ink contour, oversized eyes with an iris, a pupil and
 * two catchlights, a bold lash line, blush, a hair highlight band, and one clear
 * expression per archetype. Colour is NOT baked in — every cell holds a role key that the
 * participant's own palette resolves at render time.
 *
 * Keys: K ink · s/d/f skin, shade, light · p blush · h/g/H hair, shade, highlight
 *       c/e/A prop, shade, accent · W eye white · E iris · m lip · t/u outfit + shade
 *       B/b backdrop + shade
 *
 * generate-avatar-art.mjs refuses to emit art that breaks the anchors.
 */

import { TRANSPARENT, canvas } from './avatar-canvas.mjs';

export const ART_SIZE = 64;

/** Shared anchors. Props are drawn against these, so headwear fits either build. */
export const ANCHORS = {
  crownRow: 4,
  eyeRows: [29, 39],
  eyeCentre: [23.5, 33],
  chinRow: 50,
  shoulderRow: 55,
};

const BUILD = {
  male: {
    head: { top: 9, cheek: 33, chin: 49, rx: 15.5, taper: 0.8 },
    shoulderTop: 52,
    browRows: [[23, 19, 28], [24, 18, 28]],
    eye: { rx: 4.5, ry: 4, irisRx: 3, irisRy: 3.4 },
    blush: [[39, 19, 24], [40, 20, 23]],
  },
  female: {
    head: { top: 10, cheek: 32, chin: 48, rx: 15, taper: 0.82 },
    shoulderTop: 51,
    browRows: [[22, 20, 28]],
    eye: { rx: 4.4, ry: 4.3, irisRx: 3.1, irisRy: 3.6 },
    blush: [[38, 18, 24], [39, 18, 24], [40, 19, 23]],
  },
};

/**
 * The head, row by row: a wide cranium through the temples, then a fast taper to a small
 * chin. An ellipse alone gives an egg, and an egg reads as a doll rather than as a
 * character.
 */
/**
 * The jaw is the part of the skull a build changes: a Slight face runs to a narrow chin,
 * a Broad one keeps its width down to the jawline. Only rows BELOW the hairline band
 * move, so every hairstyle still frames every build without a gap of backdrop opening up
 * between hair and cheek.
 */
const JAW_ROW = 42;
const JAW_BY_BUILD = [0.8, 0.9, 1, 1.1, 1.22];

function headRows(spec, build = 3) {
  const { top, cheek, chin, rx, taper } = spec.head;
  const jaw = JAW_BY_BUILD[build - 1] ?? 1;
  const rows = [];
  for (let y = top; y <= chin; y += 1) {
    const base = y <= cheek
      ? rx * Math.sqrt(Math.max(0, 1 - ((cheek - y) / (cheek - top)) ** 2 * 0.93))
      : rx * (1 - taper * ((y - cheek) / (chin - cheek)) ** 1.7);
    const half = y <= JAW_ROW ? base : base * jaw;
    rows.push([y, Math.round(32 - half), Math.round(32 + half)]);
  }
  return rows;
}

/**
 * ADR-029 — five builds, which are five shoulder lines and five necks. A portrait shows
 * the top of a person, so build reads as the slope from the neck outwards: Slight drops
 * away, Broad is nearly square. Every build still fills the bottom edge of the frame,
 * because a bust always does.
 */
const BUILDS = [
  { neck: 4, base: 6, slope: 2.5 },
  { neck: 4, base: 9, slope: 2.8 },
  { neck: 5, base: 11, slope: 3.3 },
  { neck: 6, base: 14, slope: 4.0 },
  { neck: 8, base: 17, slope: 4.8 },
];

/** Shoulder spans for one build, from the shoulder line down to the frame edge. */
function torsoRows(gender, build) {
  const spec = BUILD[gender];
  const shape = BUILDS[build - 1];
  const narrower = gender === 'female' ? 1.5 : 0;
  const rows = [];
  for (let y = spec.shoulderTop; y < ART_SIZE; y += 1) {
    const half = shape.base - narrower + (y - spec.shoulderTop) * shape.slope;
    rows.push([y, Math.max(0, Math.round(32 - half)), Math.min(63, Math.round(32 + half))]);
  }
  return rows;
}

/** Neck width follows the build too — a broad person is not wearing a narrow neck. */
function neckSpan(gender, build) {
  const half = BUILDS[build - 1].neck - (gender === 'female' ? 1 : 0);
  return [32 - half, 32 + half];
}

// ---------------------------------------------------------------------------- backdrop

function backdropLayer() {
  const c = canvas(ART_SIZE);
  c.rect(0, 0, ART_SIZE, ART_SIZE, 'b');
  c.disc(32, 30, 30, 'B');
  // A rim of the darker tone keeps the roundel from touching the frame on the light side.
  c.disc(32, 30, 30, 'B');
  return c;
}

// -------------------------------------------------------------------------------- head

function range(from, to) {
  const out = [];
  for (let value = from; value <= to; value += 1) out.push(value);
  return out;
}

/** Turns the rightmost cells of every skin row into the shade — one key light, upper left. */
function shadeRight(c, width = 3) {
  for (let y = 0; y < ART_SIZE; y += 1) {
    const xs = [];
    for (let x = 0; x < ART_SIZE; x += 1) if (c.get(x, y) === 's') xs.push(x);
    for (const x of xs.slice(-width)) c.set(x, y, 'd');
  }
  return c;
}

function headLayer(gender, build) {
  const spec = BUILD[gender];
  const c = canvas(ART_SIZE);
  const rows = headRows(spec, build);
  // The neck belongs to the torso (ADR-029): it is as wide as the build, and the jaw
  // drawn herecovers its top either way.
  c.ellipse(16, 32, 2.5, 4, 's');
  c.ellipse(48, 32, 2.5, 4, 's');
  for (const [y, x0, x1] of rows) c.span(y, x0, x1, 's');
  // One key light from the upper left: the right of every form goes to shade.
  shadeRight(c, 3);
  // Cheek light and the planes of the face.
  c.ellipse(24, 20, 6, 4, 'f');
  c.ellipse(26, 29, 3, 2, 'f');
  c.span(43, 20, 22, 'd');
  c.span(45, 30, 34, 'd');
  // Blush belongs to the head, not the face: the cheek it sits on moves with the build,
  // and a patch drawn at fixed coordinates hangs off a Slight jaw.
  const inner = new Map(rows.map(([y, x0, x1]) => [y, [x0, x1]]));
  for (const [index, [y, from, to]] of spec.blush.entries()) {
    const [x0, x1] = inner.get(y) ?? [from, to];
    for (const x of [...range(Math.max(from, x0 + 1), to), ...range(64 - to, Math.min(64 - from, x1 - 1))]) {
      const edge = x === from || x === to || index === spec.blush.length - 1;
      if (!edge || (x + y) % 2 === 0) c.set(x, y, 'p');
    }
  }
  // The contour: an anime face is defined by its ink line, and without one a pale
  // character dissolves into a pale backdrop (ADR-023).
  c.outline('K');
  return c;
}

// -------------------------------------------------------------------------------- face

/**
 * Ink along the top of an eye. `outward` is −1 here: this is the LEFT eye, so its outer
 * corner is at the low-x end and the line has to thicken that way. Thickening toward the
 * nose instead — the mistake that is easy to make and impossible to unsee — mirrors into
 * a dark bridge between the eyes, and the character is suddenly wearing spectacles.
 */
function lashLine(c, cx, cy, rx, ry, thickness) {
  for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx) - 1; x += 1) {
    const dx = (x - cx) / rx;
    const top = cy - ry * Math.sqrt(Math.max(0, 1 - dx * dx));
    const fromOuter = 1 - (x - (cx - rx)) / (2 * rx);
    const weight = fromOuter < 0.4 ? 1 : Math.max(1, Math.round(thickness * fromOuter));
    for (let t = 0; t < weight; t += 1) c.set(x, Math.round(top) - t, 'K');
  }
}

function eye(c, build) {
  const spec = BUILD[build];
  const [ex, ey] = ANCHORS.eyeCentre;
  const { rx, ry, irisRx, irisRy } = spec.eye;
  const outer = Math.round(ex - rx);
  c.ellipse(ex, ey, rx, ry, 'W');
  // The iris runs from lash to lower lid: big eyes are the whole point of the style.
  c.ellipse(ex, ey, irisRx, irisRy, 'E');
  // A lit lower half and a small pupil — an anime iris is two tones, never a black disc.
  c.ellipse(ex, ey + 1.4, irisRx - 0.6, irisRy - 1.4, 'I');
  c.ellipse(ex, ey + 0.3, irisRx - 2, irisRy - 2, 'K');
  lashLine(c, ex, ey, rx, ry, build === 'female' ? 3 : 2);
  // Catchlights: the single most anime thing about an anime eye.
  c.rect(ex - 2, ey - 2, 2, 2, 'W');
  c.set(ex + 2, ey + 2, 'W');
  if (build === 'female') c.set(ex + 1, ey - 3, 'W');
  // The outer corner: the lash flicks up and away from the face.
  const top = Math.round(ey - ry);
  c.set(outer, top - 1, 'K');
  c.set(outer - 1, top - 2, 'K');
  if (build === 'female') {
    c.set(outer - 1, top - 1, 'K');
    c.set(outer - 2, top - 3, 'K');
    c.set(outer, top - 3, 'K');
    // Two cells of lower lash at the outer corner close the eye without ringing it.
    c.set(outer + 1, Math.round(ey + ry) - 1, 'K');
    c.set(outer + 2, Math.round(ey + ry), 'K');
  } else {
    for (let x = outer + 2; x <= Math.round(ex + rx) - 1; x += 1) {
      const dx = (x - ex) / rx;
      c.set(x, Math.round(ey + ry * Math.sqrt(Math.max(0, 1 - dx * dx))), 'd');
    }
  }
}

function faceLayer(build) {
  const spec = BUILD[build];
  const c = canvas(ART_SIZE);
  eye(c, build);
  // Brow: heavy and straight on the masculine build, thin and arched on the feminine.
  for (const [y, x0, x1] of spec.browRows) c.span(y, x0, x1, 'K');
  if (build === 'female') {
    c.set(19, 23, 'K');
    c.set(29, 23, 'K');
  } else {
    c.span(25, 20, 27, 'K');
    c.set(18, 24, 'K');
  }
  c.mirrorLeft();
  // Nose: a shadow under the tip with a lit bridge — mirrored into a centred nose.
  c.span(39, 30, 31, 'd');
  c.span(40, 29, 31, 'd');
  c.set(31, 38, 'f');
  c.set(31, 37, 'f');
  c.mirrorLeft();
  return c;
}

// -------------------------------------------------------------------------------- hair

/**
 * Hair is cut from the head it sits on: a slightly larger, slightly taller skull clipped
 * to the hairline, plus a band down each side of the face. Drawing a cap and then
 * punching a hole for the face — the obvious way — buries the cheeks and leaves a
 * character peering out of a hood.
 */
function hairShape(build, { lift = 4, thickness = 3 } = {}) {
  const spec = BUILD[build];
  return headRows({ head: { ...spec.head, top: spec.head.top - lift, rx: spec.head.rx + thickness } });
}

function hairCap(c, build, { hairline = 25, sideTo = 38, lift = 4, thickness = 3 } = {}) {
  const outer = hairShape(build, { lift, thickness });
  const inner = new Map(headRows(BUILD[build]).map(([y, x0, x1]) => [y, [x0, x1]]));
  for (const [y, x0, x1] of outer) {
    if (y <= hairline) {
      c.span(y, x0, x1, 'h');
      continue;
    }
    if (y > sideTo) continue;
    const [ix0, ix1] = inner.get(y) ?? [x0 + thickness, x1 - thickness];
    // The band stops one cell outside the face: hair frames a head, it does not eat it.
    c.span(y, x0, ix0 - 1, 'h');
    c.span(y, ix1 + 1, x1, 'h');
  }
  return c;
}

/** A band of lighter hair across the crown — the anime shine, and it reads at 32 px. */
function hairShine(c, rows = [[13, 20, 30], [14, 19, 28], [15, 20, 24]]) {
  for (const [y, x0, x1] of rows) {
    for (let x = x0; x <= x1; x += 1) if (c.get(x, y) === 'h') c.set(x, y, 'H');
  }
  return c;
}

function hairShade(c, from = 38) {
  for (let y = 0; y < ART_SIZE; y += 1) {
    for (let x = from; x < ART_SIZE; x += 1) if (c.get(x, y) === 'h') c.set(x, y, 'g');
  }
  return c;
}

/** A few strands falling over the forehead, stopping short of the brows. */
function fringe(c, wedges) {
  for (const [x, drop, width] of wedges) {
    c.triangle([[x - width, 14], [x + Math.round(width * 0.4), drop], [x + width, 14]], 'h');
  }
  return c;
}

/** Male 1 — shounen spikes. */
function hairMale1() {
  const c = canvas(ART_SIZE);
  hairCap(c, 'male', { hairline: 24, sideTo: 34, lift: 3 });
  for (const [x, lift] of [[15, 12], [21, 4], [28, 0], [35, 1], [42, 6], [48, 14]]) {
    c.triangle([[x - 5, 22], [x + 2, lift], [x + 5, 22]], 'h');
  }
  fringe(c, [[21, 28, 5], [30, 30, 5], [39, 27, 5], [45, 23, 4]]);
  hairShine(c, [[11, 22, 32], [12, 21, 28], [13, 22, 25]]);
  hairShade(c, 37);
  c.outline('K');
  return c;
}

/** Male 2 — a side part with a swept fringe. */
function hairMale2() {
  const c = canvas(ART_SIZE);
  hairCap(c, 'male', { hairline: 25, sideTo: 33, lift: 3 });
  c.curve([14, 24], [28, 2], [50, 20], 'h', 4);
  c.curve([16, 27], [32, 16], [48, 26], 'h', 3);
  // The swept fringe crosses the forehead and tucks behind the far temple.
  c.curve([17, 22], [30, 30], [47, 22], 'h', 3);
  c.span(23, 40, 47, 'g');
  hairShine(c, [[13, 22, 34], [14, 21, 30]]);
  hairShade(c, 39);
  c.outline('K');
  return c;
}

/** Male 3 — tight curls. */
function hairMale3() {
  const c = canvas(ART_SIZE);
  hairCap(c, 'male', { hairline: 25, sideTo: 34, lift: 5, thickness: 4 });
  for (const [x, y] of [[16, 18], [20, 11], [27, 7], [35, 7], [43, 11], [48, 18], [50, 26], [14, 26]]) {
    c.disc(x, y, 5, 'h');
  }
  // Clear the face again: the curls are drawn over the top of everything.
  for (const [y, x0, x1] of headRows(BUILD.male)) {
    if (y >= 25) c.span(y, x0 + 2, x1 - 2, '.');
  }
  fringe(c, [[24, 27, 5], [34, 26, 5]]);
  hairShine(c, [[9, 24, 30], [13, 19, 22]]);
  hairShade(c, 39);
  c.outline('K');
  return c;
}

/** Male 4 — an undercut with a top knot. */
function hairMale4() {
  const c = canvas(ART_SIZE);
  hairCap(c, 'male', { hairline: 20, sideTo: 22, lift: 3, thickness: 2 });
  c.disc(32, 6, 6, 'h');
  c.rect(29, 9, 7, 3, 'g');
  c.curve([18, 21], [32, 12], [46, 21], 'h', 3);
  // Shaved sides: a whisper of hair over the temple, nothing more.
  for (const [y, x0, x1] of headRows(BUILD.male)) {
    if (y >= 21 && y <= 30) {
      c.span(y, x0 - 1, x0 + 1, 'g');
      c.span(y, x1 - 1, x1 + 1, 'g');
    }
  }
  hairShine(c, [[12, 24, 34], [13, 23, 30]]);
  hairShade(c, 39);
  c.outline('K');
  return c;
}

/** Male 5 — a buzz cut with one stubborn cowlick. */
function hairMale5() {
  const c = canvas(ART_SIZE);
  hairCap(c, 'male', { hairline: 23, sideTo: 30, lift: 1, thickness: 2 });
  c.curve([31, 10], [36, 1], [41, 5], 'h', 2);
  hairShine(c, [[12, 22, 32], [13, 21, 28]]);
  hairShade(c, 39);
  c.outline('K');
  return c;
}

/** Female 1 — long, past the shoulders. */
function hairFemale1() {
  const c = canvas(ART_SIZE);
  hairCap(c, 'female', { hairline: 24, sideTo: 40, lift: 4, thickness: 4 });
  c.rows({}, 'h');
  for (let y = 30; y < ART_SIZE; y += 1) {
    const flare = Math.min(6, Math.round((y - 30) / 3));
    c.span(y, 11 - flare, 17, 'h');
    c.span(y, 47, 53 + flare, 'h');
  }
  // A parted curtain fringe, longest at the outside.
  c.curve([16, 18], [24, 27], [29, 25], 'h', 3);
  c.curve([48, 18], [40, 27], [35, 25], 'h', 3);
  hairShine(c, [[12, 21, 32], [13, 20, 28], [14, 21, 25]]);
  hairShade(c, 41);
  c.outline('K');
  return c;
}

/** Female 2 — a hime bob with a blunt fringe. */
function hairFemale2() {
  const c = canvas(ART_SIZE);
  hairCap(c, 'female', { hairline: 23, sideTo: 42, lift: 3, thickness: 4 });
  for (let y = 30; y <= 45; y += 1) {
    const flare = Math.min(4, Math.round((y - 30) / 2));
    c.span(y, 12 - flare, 17, 'h');
    c.span(y, 47, 52 + flare, 'h');
  }
  c.rows({ 44: [[8, 18], [46, 56]], 45: [[9, 17], [47, 55]] }, 'h');
  // The blunt fringe: one straight edge, which is the whole point of the cut.
  c.rect(18, 12, 28, 9, 'h');
  c.rows({ 21: [[19, 45]], 22: [[21, 27], [37, 43]] }, 'h');
  hairShine(c, [[12, 21, 33], [13, 20, 29]]);
  hairShade(c, 41);
  c.outline('K');
  return c;
}

/** Female 3 — a braid over one shoulder. */
function hairFemale3() {
  const c = canvas(ART_SIZE);
  hairCap(c, 'female', { hairline: 24, sideTo: 36, lift: 4, thickness: 3 });
  c.curve([17, 19], [26, 26], [30, 24], 'h', 3);
  c.curve([47, 19], [38, 26], [34, 24], 'h', 3);
  for (const [x, y] of [[12, 40], [11, 46], [12, 52], [14, 58], [16, 63]]) c.disc(x, y, 5, 'h');
  for (const y of [43, 49, 55, 61]) c.span(y, 7, 17, 'g');
  hairShine(c, [[12, 22, 32], [13, 21, 28]]);
  hairShade(c, 42);
  c.outline('K');
  return c;
}

/** Female 4 — twin tails, ribbons and all. */
function hairFemale4() {
  const c = canvas(ART_SIZE);
  hairCap(c, 'female', { hairline: 23, sideTo: 32, lift: 4, thickness: 3 });
  for (const side of [-1, 1]) {
    const x = 32 + side * 20;
    c.disc(x, 20, 6, 'h');
    c.curve([x, 22], [x + side * 9, 34], [x + side * 4, 50], 'h', 7);
  }
  c.curve([18, 18], [26, 25], [30, 23], 'h', 3);
  c.curve([46, 18], [38, 25], [34, 23], 'h', 3);
  hairShine(c, [[11, 23, 33], [12, 22, 29]]);
  hairShade(c, 42);
  c.outline('K');
  // Ribbons last, so the ink contour does not swallow them.
  for (const side of [-1, 1]) {
    const x = 32 + side * 20;
    c.rect(x - 4, 14, 9, 5, 'A');
    c.rect(x - 2, 12, 5, 2, 'c');
  }
  return c;
}

/** Female 5 — shoulder-length waves. */
function hairFemale5() {
  const c = canvas(ART_SIZE);
  hairCap(c, 'female', { hairline: 24, sideTo: 38, lift: 4, thickness: 4 });
  for (const [x, y] of [[12, 32], [10, 40], [12, 48], [16, 55], [52, 32], [54, 40], [52, 48], [48, 55]]) {
    c.disc(x, y, 6, 'h');
  }
  for (const [y, x0, x1] of headRows(BUILD.female)) {
    if (y >= 26) c.span(y, x0 + 1, x1 - 1, '.');
  }
  c.curve([17, 18], [26, 26], [30, 24], 'h', 3);
  c.curve([47, 18], [39, 27], [34, 25], 'h', 3);
  hairShine(c, [[12, 22, 32], [13, 21, 28]]);
  hairShade(c, 41);
  c.outline('K');
  return c;
}

// ------------------------------------------------------------------------------- beard

/**
 * The cells a beard can occupy: inside the head outline, below a beard line that rides
 * high at the ears and dips under the mouth. `depth` is how far below that line a cell
 * is, which is what makes stubble thicken toward the jaw.
 *
 * Both beards are clipped to the head this way. Painting a rectangle of dither instead —
 * which is what the first stubble did — hangs a checkerboard off the cheeks and over the
 * neck, and the head had changed shape underneath it.
 */
function jawCells(build) {
  const cells = [];
  for (const [y, x0, x1] of headRows(BUILD.male, build)) {
    for (let x = x0 + 1; x <= x1 - 1; x += 1) {
      // High at the ears, low under the mouth — and never so high that it reaches the
      // outer corner of an eye.
      const line = Math.max(37, 42 - Math.abs(x - 32) * 0.35);
      if (y >= line) cells.push([x, y, y - line]);
    }
  }
  return cells;
}

/**
 * Clears anything outside the skull it belongs to. Every beard ends with this, so no
 * detail — a chin highlight, a moustache, a stray sideburn — can hang off a jaw that a
 * different build made narrower.
 */
function clipToHead(c, build) {
  const inside = new Map(headRows(BUILD.male, build).map(([y, x0, x1]) => [y, [x0, x1]]));
  for (let y = 0; y < ART_SIZE; y += 1) {
    const span = inside.get(y);
    for (let x = 0; x < ART_SIZE; x += 1) {
      if (span === undefined || x < span[0] || x > span[1]) c.set(x, y, TRANSPARENT);
    }
  }
  return c;
}

/** Stubble: a scatter that thickens toward the jaw, never a regular grid. */
function beard2(build) {
  const c = canvas(ART_SIZE);
  for (const [x, y, depth] of jawCells(build)) {
    // Around the mouth it thins out, so the expression still reads through it.
    const mouth = ((x - 32) / 7) ** 2 + ((y - 43) / 3.5) ** 2 < 1;
    const noise = (x * 73 + y * 151 + ((x * y) % 11)) % 7;
    if (noise < Math.min(5, 1 + depth * 0.8) - (mouth ? 3 : 0)) c.set(x, y, 'g');
  }
  // The jaw line itself reads as the edge of the growth.
  for (const [y, x0, x1] of headRows(BUILD.male, build)) {
    if (y < 44) continue;
    c.set(x0 + 1, y, 'g');
    c.set(x1 - 1, y, 'g');
  }
  return clipToHead(c, build);
}

/** A full beard: solid, with a moustache and a lit edge along the jaw. */
function beard3(build) {
  const c = canvas(ART_SIZE);
  for (const [x, y, depth] of jawCells(build)) {
    c.set(x, y, depth < 1.5 ? 'g' : 'h');
  }
  // Moustache above the mouth, and sideburns joining the hairline.
  c.rows({ 39: [[28, 36]], 40: [[27, 37]] }, 'h');
  for (const [y, x0, x1] of headRows(BUILD.male, build)) {
    if (y < 30 || y > 38) continue;
    c.span(y, x0 + 1, x0 + 3, 'h');
    c.span(y, x1 - 3, x1 - 1, 'h');
  }
  // A little light where the chin catches it, so the mass has a form.
  c.ellipse(29, 46, 3, 2, 'g');
  return clipToHead(c, build);
}

// ------------------------------------------------------------------------------- mouth

/** One expression per archetype: the face is the character, not just the hat. */
const MOUTHS = {
  // Skipper — a closed, confident smirk, one corner pulled up.
  1: (c, build) => {
    c.span(43, 30, 34, 'K');
    c.set(35, 42, 'K');
    c.set(29, 43, 'K');
    if (build === 'female') c.span(44, 31, 34, 'm');
  },
  // Sprinter — mid-shout, mid-race, with one fang.
  2: (c, build) => {
    c.rows({ 41: [[30, 34]], 42: [[29, 35]], 43: [[29, 35]], 44: [[30, 34]] }, 'K');
    c.rows({ 42: [[30, 34]] }, 'W');
    c.set(30, 43, 'W');
    if (build === 'female') c.set(32, 44, 'm');
  },
  // Strategist — a small, unbothered smile.
  3: (c, build) => {
    c.span(43, 30, 34, 'K');
    c.set(29, 42, 'K');
    c.set(35, 42, 'K');
    if (build === 'female') c.span(44, 31, 33, 'm');
  },
  // Hype — a full open grin, teeth and all.
  4: (c, build) => {
    c.rows({ 41: [[29, 35]], 42: [[28, 36]], 43: [[28, 36]], 44: [[29, 35]], 45: [[31, 33]] }, 'K');
    c.rows({ 42: [[29, 35]] }, 'W');
    c.rows({ 44: [[31, 33]] }, 'm');
    if (build === 'female') {
      c.set(27, 42, 'm');
      c.set(37, 42, 'm');
    }
  },
  // Sundowner — half a smile, entirely relaxed.
  5: (c, build) => {
    c.span(43, 30, 33, 'K');
    c.set(34, 44, 'K');
    c.set(29, 42, 'K');
    if (build === 'female') c.span(44, 30, 33, 'm');
  },
};

function mouthLayer(build, persona) {
  const c = canvas(ART_SIZE);
  MOUTHS[persona](c, build);
  return c;
}

// -------------------------------------------------------------------------------- prop

/** Headwear and eyewear, painted last so they sit over the hair. */
const PROPS = {
  // Skipper — a captain's cap with a badge.
  1: (c) => {
    c.ellipse(32, 14, 18, 9, 'c');
    c.rect(14, 14, 37, 6, 'c');
    c.rows({ 20: [[10, 54]], 21: [[9, 55]], 22: [[11, 53]] }, 'e');
    c.rect(26, 10, 13, 7, 'A');
    c.rows({ 12: [[29, 35]], 13: [[30, 34]] }, 'e');
    c.rows({ 6: [[24, 40]], 7: [[22, 42]] }, 'e');
  },
  // Sprinter — a headband, knotted, with the tails flying.
  2: (c) => {
    c.rows({ 17: [[15, 49]], 18: [[14, 50]], 19: [[14, 50]], 20: [[15, 49]] }, 'c');
    c.rows({ 19: [[14, 50]] }, 'A');
    c.rows({ 18: [[8, 14]], 19: [[6, 14]], 20: [[5, 13]], 21: [[6, 12]], 22: [[8, 11]] }, 'c');
    c.rows({ 22: [[4, 10]], 23: [[3, 9]], 24: [[4, 8]] }, 'e');
    c.rect(29, 16, 7, 5, 'A');
  },
  // Strategist — round glasses over the eyes, arms back to the ears.
  3: (c) => {
    for (const side of [-1, 1]) {
      const cx = 32 + side * 7.5;
      c.ellipse(cx, 35, 8, 7, 'K');
      c.ellipse(cx, 35, 6.5, 5.5, '.');
      c.set(cx - side * 3, 32, 'A');
      c.set(cx - side * 3 + 1, 32, 'A');
      c.set(cx - side * 3, 33, 'A');
    }
    c.rows({ 34: [[30, 34]] }, 'K');
    c.rows({ 33: [[12, 17], [47, 52]] }, 'K');
  },
  // Hype — star clips and a ribbon, because the crowd needs finding.
  4: (c) => {
    // A star clip on one side…
    c.triangle([[15, 11], [19, 21], [11, 21]], 'A');
    c.triangle([[15, 23], [11, 15], [19, 15]], 'A');
    c.disc(15, 17, 2, 'c');
    // …and a ribbon bow on the other.
    c.triangle([[48, 13], [48, 23], [41, 18]], 'c');
    c.triangle([[49, 13], [49, 23], [56, 18]], 'c');
    c.triangle([[48, 15], [48, 21], [43, 18]], 'A');
    c.triangle([[49, 15], [49, 21], [54, 18]], 'A');
    c.rect(47, 16, 3, 5, 'c');
    c.rect(47, 21, 2, 6, 'A');
  },
  // Sundowner — shades pushed up, and a flower behind the ear.
  5: (c) => {
    c.rows({ 16: [[14, 50]], 17: [[13, 51]] }, 'K');
    c.rows({ 18: [[14, 27], [37, 50]], 19: [[15, 26], [38, 49]], 20: [[16, 25], [39, 48]] }, 'A');
    c.rows({ 18: [[28, 36]] }, 'K');
    for (const [dx, dy] of [[0, -4], [4, -1], [2, 4], [-3, 3], [-4, -2]]) {
      c.disc(49 + dx, 30 + dy, 2.5, 'A');
    }
    c.disc(49, 30, 2, 'c');
    c.set(49, 30, 'e');
  },
};

function propLayer(persona) {
  const c = canvas(ART_SIZE);
  PROPS[persona](c);
  return c;
}

// ------------------------------------------------------------------------------- torso

/** Neck and shoulders, one layer per build (ADR-029). The garment goes on top. */
function torsoLayer(gender, build) {
  const c = canvas(ART_SIZE);
  const [neckLeft, neckRight] = neckSpan(gender, build);
  // Neck first: the head's jaw covers its top, so it starts well above the collar.
  c.rect(neckLeft, 40, neckRight - neckLeft + 1, 16, 'd');
  c.rect(neckLeft + 1, 46, neckRight - neckLeft - 1, 10, 's');
  for (const [y, x0, x1] of torsoRows(gender, build)) {
    c.span(y, x0, x1, 't');
    // Lit from the upper left like everything else.
    c.span(y, Math.max(x0, x1 - 7), x1, 'u');
  }
  c.outline('K');
  return c;
}

/**
 * The garment, drawn over whatever shoulders are underneath. Everything above row 56
 * stays inside the narrowest build's silhouette, so a Slight character is not wearing a
 * collar that floats off their shoulders.
 */
const OUTFITS = {
  // Skipper — a sailor collar with two stripes.
  1: (c, drop) => {
    c.rows({ [55 + drop]: [[22, 42]], [56 + drop]: [[19, 45]] }, 'u');
    c.triangle([[25, 53 + drop], [39, 53 + drop], [32, 63]], 'A');
    c.triangle([[27, 53 + drop], [37, 53 + drop], [32, 60]], 'u');
    c.rows({ [58 + drop]: [[14, 21], [43, 50]], [60 + drop]: [[11, 22], [42, 53]] }, 'A');
  },
  // Sprinter — a track jacket, zip and stripe.
  2: (c, drop) => {
    c.rows({ [55 + drop]: [[23, 41]], [56 + drop]: [[20, 44]], [57 + drop]: [[18, 46]] }, 'u');
    c.rect(30, 54 + drop, 4, 10, 'A');
    c.rows({ [59 + drop]: [[8, 18], [46, 56]], [60 + drop]: [[6, 17], [47, 58]] }, 'A');
  },
  // Strategist — a hoodie with the hood bunched at the neck.
  3: (c, drop) => {
    c.ellipse(32, 58 + drop, 16, 6, 'u');
    c.ellipse(32, 57 + drop, 12, 4, 't');
    c.rect(28, 58 + drop, 2, 6, 'A');
    c.rect(36, 58 + drop, 2, 6, 'A');
    c.rows({ [62 + drop]: [[28, 30], [35, 37]] }, 'A');
  },
  // Hype — a cheer top with a bold chevron.
  4: (c, drop) => {
    c.triangle([[24, 53 + drop], [40, 53 + drop], [32, 62]], 'A');
    c.triangle([[26, 53 + drop], [38, 53 + drop], [32, 59]], 't');
    c.rows({ [57 + drop]: [[14, 21], [43, 50]] }, 'A');
  },
  // Sundowner — an open shirt and a flower lei.
  5: (c, drop) => {
    c.triangle([[27, 52 + drop], [37, 52 + drop], [32, 62]], 'd');
    c.rows({ [55 + drop]: [[22, 27], [37, 42]], [56 + drop]: [[19, 26], [38, 45]] }, 'u');
    for (const [x, y] of [[23, 57], [27, 60], [32, 62], [37, 60], [41, 57]]) {
      c.disc(x, y + drop, 2.5, 'A');
      c.set(x, y + drop, 'c');
    }
  },
};

function outfitLayer(gender, persona) {
  const c = canvas(ART_SIZE);
  OUTFITS[persona](c, gender === 'male' ? 0 : 1);
  return c;
}

// ------------------------------------------------------------------------------ layers

function buildLayers() {
  const layers = { backdrop: backdropLayer() };
  const hair = {
    male: [hairMale1, hairMale2, hairMale3, hairMale4, hairMale5],
    female: [hairFemale1, hairFemale2, hairFemale3, hairFemale4, hairFemale5],
  };
  for (const build of ['male', 'female']) {
    layers[`face.${build}`] = faceLayer(build);
    for (let shape = 1; shape <= BUILDS.length; shape += 1) {
      layers[`head.${build}.${shape}`] = headLayer(build, shape);
    }
    hair[build].forEach((draw, index) => {
      layers[`hair.${build}.${index + 1}`] = draw();
    });
    for (let persona = 1; persona <= 5; persona += 1) {
      layers[`outfit.${build}.${persona}`] = outfitLayer(build, persona);
      layers[`mouth.${build}.${persona}`] = mouthLayer(build, persona);
    }
    for (let shape = 1; shape <= BUILDS.length; shape += 1) {
      layers[`torso.${build}.${shape}`] = torsoLayer(build, shape);
    }
  }
  // A beard is cut to the jaw it sits on, so there is one per build (ADR-030).
  for (let shape = 1; shape <= BUILDS.length; shape += 1) {
    layers[`beard.${shape}.2`] = beard2(shape);
    layers[`beard.${shape}.3`] = beard3(shape);
  }
  for (let persona = 1; persona <= 5; persona += 1) layers[`prop.${persona}`] = propLayer(persona);
  return Object.fromEntries(Object.entries(layers).map(([name, c]) => [name, c.toRows()]));
}

export const LAYERS = buildLayers();

/**
 * The stack the runtime paints, in order — shared with the generator and the review sheet
 * so the three can never disagree about what an avatar is made of.
 */
export function composeLayerNames(gender, variant, look) {
  return [
    'backdrop',
    `torso.${gender}.${look.build}`,
    `outfit.${gender}.${variant}`,
    `head.${gender}.${look.build}`,
    `face.${gender}`,
    `hair.${gender}.${look.hairStyle}`,
    ...(gender === 'male' && look.facialHair > 1 ? [`beard.${look.build}.${look.facialHair}`] : []),
    `mouth.${gender}.${variant}`,
    `prop.${variant}`,
  ];
}

export const SKIN_TONES = [
  { label: 'Porcelain', base: '#f6d5b8', shade: '#d9ab8a' },
  { label: 'Light', base: '#eec096', shade: '#cf9a70' },
  { label: 'Warm', base: '#e0a878', shade: '#bd8155' },
  { label: 'Tan', base: '#c98a58', shade: '#a4663d' },
  { label: 'Olive', base: '#ab7448', shade: '#875530' },
  { label: 'Brown', base: '#8a5a36', shade: '#6a4124' },
  { label: 'Deep', base: '#6a4126', shade: '#4e2d19' },
  { label: 'Ebony', base: '#4a2c1b', shade: '#351e12' },
];

/** Ten hair colours; the shade and the highlight are derived. */
export const HAIR_COLOURS = [
  { label: 'Black', base: '#1d1d28' },
  { label: 'Dark brown', base: '#3b2418' },
  { label: 'Brown', base: '#6b4322' },
  { label: 'Auburn', base: '#8c3b1e' },
  { label: 'Ginger', base: '#c2611f' },
  { label: 'Blond', base: '#d9ab4d' },
  { label: 'Platinum', base: '#e8ddc4' },
  { label: 'Grey', base: '#9ba0a8' },
  { label: 'Teal', base: '#1f7f86' },
  { label: 'Pink', base: '#c2468a' },
];

/** Ten shirt colours; the shade is derived. */
export const OUTFIT_COLOURS = [
  { label: 'PSD blue', base: '#1f4e9c' },
  { label: 'Sky', base: '#3a8fd0' },
  { label: 'Jade', base: '#0f8f76' },
  { label: 'Forest', base: '#2f7a3f' },
  { label: 'Crimson', base: '#c0392b' },
  { label: 'Maroon', base: '#7b2d3a' },
  { label: 'Orange', base: '#e07b2a' },
  { label: 'Violet', base: '#6b4bb5' },
  { label: 'Charcoal', base: '#333b49' },
  { label: 'White', base: '#e6e8ef' },
];

/** Ten backdrop colours — the strongest signal at 32 px. */
export const BACKDROPS = [
  { label: 'Sea', base: '#1d5b8c' },
  { label: 'Crimson', base: '#93304a' },
  { label: 'Indigo', base: '#33477a' },
  { label: 'Gold', base: '#b8770a' },
  { label: 'Jade', base: '#158a5f' },
  { label: 'Sunset', base: '#c2561f' },
  { label: 'Violet', base: '#6a3f9e' },
  { label: 'Lagoon', base: '#12797f' },
  { label: 'Slate', base: '#46505e' },
  { label: 'Rose', base: '#b8467a' },
];

/**
 * Persona-fixed prop colours: the cap, band, frames, clips and shades say who you are —
 * and `accent` is also the iris, so each archetype looks out with its own eyes.
 */
export const PROP_COLOURS = [
  { base: '#c0392b', shade: '#8d2820', accent: '#f2d06b' },
  { base: '#f2c14e', shade: '#c1913a', accent: '#1f6fd0' },
  { base: '#2b3242', shade: '#1b2130', accent: '#7fc4ff' },
  { base: '#f4f6fb', shade: '#c3c9d8', accent: '#e0508a' },
  { base: '#d9c58c', shade: '#ab9765', accent: '#2f9f7a' },
];

/** The iris is not here: each archetype looks out with its own accent colour. */
export const FIXED_COLOURS = {
  ink: '#101a2b',
  eyeWhite: '#f4f7ff',
  lip: '#b4485a',
};
