import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCHORS,
  ART_SIZE,
  BACKDROPS,
  FIXED_COLOURS,
  HAIR_COLOURS,
  LAYERS,
  OUTFIT_COLOURS,
  PROP_COLOURS,
  SKIN_TONES,
  composeLayerNames,
} from './avatar-art-source.mjs';

/**
 * ADR-021/ADR-026 — turns the drawn layers into the typed art module the app composes at
 * runtime. Committed generator, committed output: `npm run art` reproduces the file byte
 * for byte, and the anchors below are the contract the art has to keep.
 *
 * Nothing here decides colour. Layers carry role keys; the participant's own palette
 * choices resolve them when the avatar is drawn.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'lib', 'avatarArt.ts');

const KEYS = new Set([
  '.', 'K', 's', 'd', 'f', 'p', 'h', 'g', 'H', 'c', 'e', 'A', 'W', 'E', 'I', 'm', 't', 'u', 'B', 'b',
]);
const HAIR_STYLE_COUNT = 5;
const BUILD_COUNT = 5;

function assertLayer(name, rows) {
  if (rows.length !== ART_SIZE) {
    throw new Error(`${name}: ${rows.length} rows, expected ${ART_SIZE}`);
  }
  for (const [y, row] of rows.entries()) {
    if (row.length !== ART_SIZE) {
      throw new Error(`${name}: row ${y} is ${row.length} wide, expected ${ART_SIZE}`);
    }
    for (const key of row) {
      if (!KEYS.has(key)) throw new Error(`${name}: row ${y} uses unknown key "${key}"`);
    }
  }
}

function layer(name) {
  const rows = LAYERS[name];
  if (!rows) throw new Error(`missing layer ${name}`);
  return rows;
}

function compose(gender, persona, hairStyle, facialHair, build) {
  const stack = composeLayerNames(gender, persona, { hairStyle, facialHair, build }).map(layer);
  const out = [];
  for (let y = 0; y < ART_SIZE; y += 1) {
    let row = '';
    for (let x = 0; x < ART_SIZE; x += 1) {
      let key = '.';
      for (const grid of stack) {
        const candidate = grid[y][x];
        if (candidate !== '.') key = candidate;
      }
      row += key;
    }
    out.push(row);
  }
  return out;
}

/**
 * Anchors, checked on every combination rather than on a sample: a portrait that breaks
 * one of these looks wrong in a list of thirty, which is where avatars actually live.
 */
function assertComposition(gender, persona, hairStyle, facialHair, build) {
  const label = `${gender}/persona ${persona}/hair ${hairStyle}/facial ${facialHair}/build ${build}`;
  const rows = compose(gender, persona, hairStyle, facialHair, build);
  if (rows.some((row) => row.includes('.'))) {
    throw new Error(`${label}: a transparent pixel survived — the backdrop must cover the frame`);
  }
  const floor = rows[ART_SIZE - 1];
  if (floor.includes('B') || floor.includes('b')) {
    throw new Error(`${label}: shoulders must fill the bottom edge, no backdrop below them`);
  }
  const [eyeTop, eyeBottom] = ANCHORS.eyeRows;
  const eyeBand = rows.slice(eyeTop, eyeBottom + 1).join('');
  const irisCells = [...eyeBand].filter((key) => key === 'E' || key === 'I').length;
  if (irisCells < 20) throw new Error(`${label}: only ${irisCells} iris cells — the eyes are covered`);
  const whiteCells = [...eyeBand].filter((key) => key === 'W').length;
  if (whiteCells < 20) throw new Error(`${label}: only ${whiteCells} cells of sclera`);
  // Hair belongs around the face, not across it. Eyewear may cross the bridge of the
  // nose — that is what spectacles do — and a beard lives on the jaw, so this looks for
  // hair alone, in the band between the eyes, at eye level.
  const midFace = [...rows[Math.round((eyeTop + eyeBottom) / 2)]].slice(28, 36);
  const hair = midFace.filter((key) => key === 'h' || key === 'g' || key === 'H').length;
  if (hair > 2) throw new Error(`${label}: hair is hanging across the face (${hair} cells)`);
  if (new Set(rows.join('')).size > KEYS.size - 1) {
    throw new Error(`${label}: more colour keys than the palette can resolve`);
  }
}

function assertEveryCombination() {
  let checked = 0;
  for (const gender of ['male', 'female']) {
    for (let persona = 1; persona <= PROP_COLOURS.length; persona += 1) {
      for (let hairStyle = 1; hairStyle <= HAIR_STYLE_COUNT; hairStyle += 1) {
        for (const facialHair of gender === 'male' ? [1, 2, 3] : [1]) {
          for (let build = 1; build <= BUILD_COUNT; build += 1) {
            assertComposition(gender, persona, hairStyle, facialHair, build);
            checked += 1;
          }
        }
      }
    }
  }
  return checked;
}

function quote(value) {
  return `'${value}'`;
}

/**
 * Rows are run-length encoded — `key` then run length, e.g. `.22s20.22`. At 64×64 the raw
 * strings are 170 kB of source for the browser to parse; the same art as runs is under 30,
 * because most of a layer is transparent and most of a face is flat colour.
 */
function encodeRow(row) {
  let out = '';
  let start = 0;
  for (let x = 1; x <= row.length; x += 1) {
    if (x < row.length && row[x] === row[start]) continue;
    out += `${row[start]}${x - start}`;
    start = x;
  }
  return out;
}

function renderLayers() {
  const entries = Object.entries(LAYERS).map(([name, rows]) => {
    return `  ${quote(name)}: [${rows.map((row) => quote(encodeRow(row))).join(', ')}],`;
  });
  return `export const AVATAR_LAYERS: Record<string, readonly string[]> = {\n${entries.join('\n')}\n};`;
}

function renderPalette(name, items, type) {
  // `label` stays out: names are user-facing copy and live in @psd/contracts, once.
  const body = items
    .map((item) => {
      const fields = Object.entries(item)
        .filter(([key]) => key !== 'label')
        .map(([key, value]) => `${key}: ${quote(value)}`);
      return `  { ${fields.join(', ')} },`;
    })
    .join('\n');
  return `export const ${name}: readonly ${type}[] = [\n${body}\n];`;
}

async function main() {
  for (const [name, rows] of Object.entries(LAYERS)) assertLayer(name, rows);
  const checked = assertEveryCombination();

  const digest = createHash('sha256')
    .update(JSON.stringify({ LAYERS, SKIN_TONES, HAIR_COLOURS, OUTFIT_COLOURS, BACKDROPS, PROP_COLOURS, FIXED_COLOURS }))
    .digest('hex')
    .slice(0, 8);

  const file = `// GENERATED by scripts/generate-avatar-art.mjs — do not edit by hand.
// Source of record: scripts/avatar-art-source.mjs. Run \`npm run art\` after changing it.
//
// ADR-021/ADR-026 — avatars are composed at render time from these layers and the
// participant's own palette choices, so a face is data, not one of ten files. Rows are
// run-length encoded: \`.22s20.22\` is 22 transparent cells, 20 of skin, 22 transparent.

export interface AvatarSwatch {
  base: string;
  shade?: string;
}

export interface PropColours {
  base: string;
  shade: string;
  accent: string;
}

export const ART_SIZE = ${ART_SIZE};

/** Changes whenever the art or the palettes change; callers stamp it on cache keys. */
export const ART_VERSION = '${digest}';

${renderLayers()}

${renderPalette('SKIN_TONES', SKIN_TONES, 'AvatarSwatch')}

${renderPalette('HAIR_COLOURS', HAIR_COLOURS, 'AvatarSwatch')}

${renderPalette('OUTFIT_COLOURS', OUTFIT_COLOURS, 'AvatarSwatch')}

${renderPalette('BACKDROP_COLOURS', BACKDROPS, 'AvatarSwatch')}

${renderPalette('PROP_COLOURS', PROP_COLOURS, 'PropColours')}

export const FIXED_COLOURS = {
  ink: '${FIXED_COLOURS.ink}',
  eyeWhite: '${FIXED_COLOURS.eyeWhite}',
  lip: '${FIXED_COLOURS.lip}',
};
`;

  await writeFile(OUT, file, 'utf8');
  const layerCount = Object.keys(LAYERS).length;
  const kb = (Buffer.byteLength(file, 'utf8') / 1024).toFixed(1);
  console.log(
    `wrote ${layerCount} layers to src/lib/avatarArt.ts (version ${digest}, ${kb} kB); ` +
      `${checked} combinations pass the anchor checks`,
  );
}

await main();
