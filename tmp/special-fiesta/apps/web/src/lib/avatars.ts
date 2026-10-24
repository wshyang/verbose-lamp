import {
  AVATAR_PERSONAS,
  parseAvatarSprite,
  AVATAR_PERSONA_PRESETS,
  AVATAR_VARIANT_COUNT,
  readAvatarLook,
  SUNBURST_BANDS_MIN,
  type AvatarLook,
  type Gender,
} from '@psd/contracts';
import {
  ART_SIZE,
  ART_VERSION,
  AVATAR_LAYERS,
  FIXED_COLOURS,
  HAIR_COLOURS,
  PROP_COLOURS,
  SKIN_TONES,
  type AvatarSwatch,
} from './avatarArt.js';
import { required } from './required.js';
import { splitBackdropCells } from './avatar/sunburst.js';

/**
 * ADR-021/ADR-026 — an avatar is composed, not fetched: layers of role keys plus the
 * participant's own palette choices become one SVG data URL. Ten files could never cover
 * the 1.2 million combinations the studio offers, and a beach network should not fetch a
 * file per face. The art is a 64×64 anime mugshot (ADR-026).
 *
 * fds.md §5.5: avatars appear on PARTICIPANT surfaces only. `npm run standards` fails if
 * this module is imported from a facilitator or superadmin surface.
 */

export interface AvatarIdentity {
  gender: Gender;
  avatarVariant: number;
  avatarLook: string;
  /** ADR-031 — when set, this is the face: a sprite made from the participant's photo. */
  avatarPhoto?: string | null;
}

export const AVATAR_VARIANTS = Array.from(
  { length: AVATAR_VARIANT_COUNT },
  (_unused, index) => index + 1,
);

export function avatarPersona(avatarVariant: number): string {
  return required(AVATAR_PERSONAS[avatarVariant - 1] ?? AVATAR_PERSONAS[0], 'persona');
}

/** A variant the server should never send still has to draw something. */
function clampVariant(avatarVariant: number): number {
  return AVATAR_VARIANTS.includes(avatarVariant) ? avatarVariant : 1;
}

/**
 * ADR-227 — the character Remove moves to. It is the next one in the row, and the last wraps to the
 * first. The gender does not change: the five characters are indexed the same way for both.
 */
export function nextVariant(avatarVariant: number): number {
  return (clampVariant(avatarVariant) % AVATAR_VARIANT_COUNT) + 1;
}

/** Derived tones: one key light from the upper left, so every form shades the same way. */
function darken(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const shaded = channels.map((channel) => Math.max(0, Math.round(channel * factor)));
  return `#${shaded.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function lighten(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const lit = channels.map((channel) => Math.min(255, Math.round(channel + (255 - channel) * amount)));
  return `#${lit.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * ADR-206 — interpolation in linear light, for bands that have to look evenly spaced.
 *
 * `mix` above blends the sRGB numbers directly, which is right for what it does (tinting skin
 * towards a blush) and wrong for a graded run of bands: halfway down the sRGB numbers between
 * a dark blue and a bright gold is a muddy olive, not the colour a person expects in the middle.
 */
function mixLinear(hex: string, other: string, amount: number): string {
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
  const read = (value: number) =>
    [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => toLinear(c / 255));
  const from = read(Number.parseInt(hex.slice(1), 16));
  const to = read(Number.parseInt(other.slice(1), 16));
  const blended = from.map((channel, index) =>
    Math.round(255 * toSrgb(channel + (required(to[index], 'channel') - channel) * amount)));
  return `#${blended.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function mix(hex: string, other: string, amount: number): string {
  const read = (value: number) => [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const from = read(Number.parseInt(hex.slice(1), 16));
  const to = read(Number.parseInt(other.slice(1), 16));
  const blended = from.map((channel, index) =>
    Math.round(channel + (required(to[index], 'channel') - channel) * amount));
  return `#${blended.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

const BLUSH = '#ff6b81';

function swatch(list: readonly AvatarSwatch[], index: number, factor: number) {
  const entry = required(list[index - 1], 'swatch');
  return { base: entry.base, shade: entry.shade ?? darken(entry.base, factor) };
}

/**
 * Role key → colour. Every key the art can use must resolve, or a face gets a hole.
 * ADR-026: the iris takes the archetype's accent, so a Sprinter looks out with blue eyes
 * and a Hype with pink ones whatever else the participant chose.
 */
function paletteFor(avatarVariant: number, look: AvatarLook): Record<string, string> {
  const skin = swatch(SKIN_TONES, look.skinTone, 0.78);
  const hair = swatch(HAIR_COLOURS, look.hairColour, 0.68);
  // ADR-028 — the shirt and the backdrop are whatever the participant chose, so their
  // shades are derived rather than looked up.
  const outfit = { base: look.outfitColour, shade: darken(look.outfitColour, 0.74) };
  const backdrop = { base: look.backdrop, shade: darken(look.backdrop, 0.62) };
  const two = look.sunburst?.colourTwo ?? look.backdrop;
  const sunburstTwo = { base: two, shade: darken(two, 0.62) };
  // ADR-206 — the bands BETWEEN the two ends. Two bands has none, so this is usually empty.
  const middle = middleBands(look.backdrop, two, look.sunburst?.bands ?? SUNBURST_BANDS_MIN);
  const prop = required(PROP_COLOURS[avatarVariant - 1], 'prop colours');
  return {
    K: FIXED_COLOURS.ink,
    s: skin.base,
    d: skin.shade,
    f: lighten(skin.base, 0.22),
    p: mix(skin.base, BLUSH, 0.42),
    h: hair.base,
    g: hair.shade,
    H: lighten(hair.base, 0.3),
    c: prop.base,
    e: prop.shade,
    A: prop.accent,
    W: FIXED_COLOURS.eyeWhite,
    E: prop.accent,
    I: lighten(prop.accent, 0.42),
    m: FIXED_COLOURS.lip,
    t: outfit.base,
    u: outfit.shade,
    ...middle,
    B: backdrop.base,
    b: backdrop.shade,
    // ADR-173 — the sunburst's second colour, shaded the same way so the portrait's vignette
    // reads across both halves of the pattern instead of only the first.
    R: sunburstTwo.base,
    r: sunburstTwo.shade,
  };
}

/**
 * Paint order: backdrop, torso, garment, head, features, hair, beard, mouth, prop.
 * ADR-029 — the torso carries the build (neck and shoulders) and the garment goes over
 * it, so five builds and five archetypes are ten layers rather than twenty-five.
 */
function layersFor(gender: Gender, variant: number, look: AvatarLook): readonly string[][] {
  // ADR-030 — a beard is cut to the jaw it sits on, and the jaw follows the build.
  const beard = gender === 'male' && look.facialHair > 1
    ? [`beard.${look.build}.${look.facialHair}`]
    : [];
  const names = [
    'backdrop',
    `torso.${gender}.${look.build}`,
    `outfit.${gender}.${variant}`,
    `head.${gender}.${look.build}`,
    `face.${gender}`,
    `hair.${gender}.${look.hairStyle}`,
    ...beard,
    `mouth.${gender}.${variant}`,
    `prop.${variant}`,
  ];
  return names.map((name) => decodeLayer(name));
}

const layerCache = new Map<string, string[]>();

/**
 * Layers ship run-length encoded (`.22s20.22`) because sixty-eight layers of 64×64 is a
 * quarter of a megabyte of source otherwise. Each one is expanded once and kept.
 */
function decodeLayer(name: string): string[] {
  const cached = layerCache.get(name);
  if (cached) return cached;
  const rows = required(AVATAR_LAYERS[name], `layer ${name}`).map((encoded) => {
    let row = '';
    for (const [, key, count] of encoded.matchAll(/(.)(\d+)/g)) {
      row += String(key).repeat(Number(count));
    }
    return row;
  });
  layerCache.set(name, rows);
  return rows;
}

function paintRow(cells: string[], y: number, row: string): void {
  for (let x = 0; x < ART_SIZE; x += 1) {
    const key = row.charAt(x);
    if (key !== '.') cells[y * ART_SIZE + x] = key;
  }
}

function composeKeys(gender: Gender, variant: number, look: AvatarLook): string[] {
  const cells = new Array<string>(ART_SIZE * ART_SIZE).fill('.');
  for (const layer of layersFor(gender, variant, look)) {
    for (const [y, row] of layer.entries()) paintRow(cells, y, row);
  }
  return Array.from({ length: ART_SIZE }, (_unused, y) =>
    cells.slice(y * ART_SIZE, (y + 1) * ART_SIZE).join(''),
  );
}

interface Block {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The biggest rectangle of one colour whose top-left corner is here. */
function blockAt(rows: readonly string[], at: { x: number; y: number }): Block {
  const size = rows.length;
  const key = required(rows[at.y], 'row').charAt(at.x);
  let width = 1;
  while (at.x + width < size && required(rows[at.y], 'row').charAt(at.x + width) === key) {
    width += 1;
  }
  let height = 1;
  while (at.y + height < size) {
    const row = required(rows[at.y + height], 'row');
    if (row.slice(at.x, at.x + width) !== key.repeat(width)) break;
    height += 1;
  }
  return { x: at.x, y: at.y, width, height };
}

function claim(claimed: Uint8Array, block: Block, size: number): void {
  for (let dy = 0; dy < block.height; dy += 1) {
    const offset = (block.y + dy) * size + block.x;
    for (let dx = 0; dx < block.width; dx += 1) claimed[offset + dx] = 1;
  }
}

/**
 * Cells merge into the biggest rectangle that shares a colour, and the rectangles of one
 * colour merge into one `<path>`. A 64×64 portrait is 4 096 cells; drawn as one rect each
 * it is an 80 kB data URL, which is absurd for a 32 px face in a list. This is the same
 * picture in under 9 kB.
 */
function rectsFor(rows: readonly string[], palette: Record<string, string>): string {
  // ADR-057 — the grid is as big as the DATA says, never a constant. The drawn art is 64×64
  // (ART_SIZE) and a photo sprite has been 128×128 since ADR-037; scanning 128-wide rows on a
  // 64-wide grid renders one corner of the head and stretches it over the whole frame.
  const size = rows.length;
  const claimed = new Uint8Array(size * size);
  const byColour = new Map<string, string[]>();
  for (let cell = 0; cell < claimed.length; cell += 1) {
    if (claimed[cell] === 1) continue;
    const at = { x: cell % size, y: Math.floor(cell / size) };
    const block = blockAt(rows, at);
    claim(claimed, block, size);
    const fill = required(palette[required(rows[at.y], 'row').charAt(at.x)], 'palette entry');
    const parts = byColour.get(fill) ?? [];
    parts.push(`M${block.x} ${block.y}h${block.width}v${block.height}h-${block.width}z`);
    byColour.set(fill, parts);
  }
  return [...byColour]
    .map(([fill, parts]) => `<path fill="${fill}" d="${parts.join('')}"/>`)
    .join('');
}

function svgOf(rows: readonly string[], palette: Record<string, string>): string {
  // The viewBox has to match the grid too, or the right picture is drawn at the wrong scale.
  const size = rows.length;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `shape-rendering="crispEdges" role="img">${rectsFor(rows, palette)}</svg>`
  );
}

/**
 * ADR-206 — the palette keys the drawn backdrop's bands take, outermost first.
 *
 * `B`/`b` is the backdrop and its vignette shade; `R`/`r` is the second colour and its shade.
 * Those two pairs predate bands and keep exactly the colours they always had, because band 0 is
 * always the backdrop and the last band is always `colourTwo` whatever the count. Everything in
 * between is new, which is why the middle keys are the only ones that had to be invented.
 */
const DRAWN_BAND_BASE = ['B', 'V', 'X', 'R'] as const;
const DRAWN_BAND_SHADE = ['b', 'v', 'x', 'r'] as const;

/** First band, then the middles in order, then the last. Two bands is `[first, last]`. */
function bandKeys(all: readonly string[], bands: number): string[] {
  const first = required(all[0], 'first band key');
  const last = required(all[all.length - 1], 'last band key');
  const middles = all.slice(1, -1).slice(0, Math.max(0, bands - 2));
  return [first, ...middles, last];
}

/**
 * The interpolated colours for the bands between the ends, keyed as the palette expects them.
 *
 * Interpolating in LINEAR light rather than straight down the sRGB numbers is the difference
 * between a midpoint that looks like the two colours averaged and one that looks muddy — the
 * same reason the probe does it that way.
 */
function middleBands(from: string, to: string, bands: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let index = 1; index < bands - 1; index += 1) {
    const colour = mixLinear(from, to, index / (bands - 1));
    out[required(DRAWN_BAND_BASE[index], 'band base key')] = colour;
    out[required(DRAWN_BAND_SHADE[index], 'band shade key')] = darken(colour, 0.62);
  }
  return out;
}

/** ADR-173/206 — the drawn backdrop is two key runs, so the vignette survives the pattern. */
function drawnBackdropKeys(bands: number): ReadonlyMap<string, readonly string[]> {
  return new Map([
    ['B', bandKeys(DRAWN_BAND_BASE, bands)],
    ['b', bandKeys(DRAWN_BAND_SHADE, bands)],
  ]);
}

export function avatarSvg(identity: AvatarIdentity): string {
  const look = readAvatarLook(identity.avatarLook);

  // ADR-031 — a photo sprite is already a finished picture: same size, same renderer,
  // its own palette. A code that will not parse falls back to the drawn character rather
  // than to a hole where a face should be.
  const sprite = identity.avatarPhoto ? parseAvatarSprite(identity.avatarPhoto) : null;
  if (sprite !== null) {
    const painted = paintSpriteSunburst(sprite, look.sunburst);
    return svgOf(painted.rows, painted.palette);
  }

  const variant = clampVariant(identity.avatarVariant);
  const rows = composeKeys(identity.gender, variant, look);
  const painted = look.sunburst
    ? splitBackdropCells(rows, drawnBackdropKeys(look.sunburst.bands), look.sunburst)
    : rows;
  return svgOf(painted, paletteFor(variant, look));
}

/**
 * ADR-173 — the same sunburst behind a photograph.
 *
 * Applied when the picture is DRAWN rather than when it is saved. Baking it into the stored
 * sprite would be the obvious move and is the wrong one: once the backdrop cells have been
 * split between two palette entries there is no longer any record of which cells were backdrop,
 * so moving the ray slider a second time would have nothing coherent to recolour. Here the
 * stored sprite keeps exactly what ADR-054 put in it — one backdrop colour — and the pattern is
 * a function of the look, which is where the participant's choice actually lives.
 *
 * `cluster` of palette keys: the backdrop is the second-to-last entry by construction
 * (ADR-054), and the gap colour is added under a key the sprite format cannot mint, so it can
 * never collide with a real palette index.
 */
/*
 * ADR-206 — one key per band past the sprite's own backdrop, so three for a four-band pattern.
 * A sprite palette is indexed by hex digits (`[0-9a-f]`, sixteen colours at most), so none of
 * these can ever collide with an index the sprite format is able to mint.
 */
const SPRITE_BAND_KEYS = ['z', 'y', 'x'] as const;

/**
 * The palette key holding a photo sprite's backdrop.
 *
 * Palette order is `[...photo colours, backdrop, ink]` by construction (ADR-054), and
 * `parseAvatarSprite` refuses anything with fewer than two colours, so the entry is always there.
 * `required` rather than a guard: a missing one would be a broken parser, not a broken sprite,
 * and quietly returning the picture unchanged would hide that.
 */
function spriteBackdropKey(palette: Record<string, string>): string {
  const keys = Object.keys(palette);
  return required(keys[keys.length - 2], 'sprite backdrop key');
}

export function paintSpriteSunburst(
  sprite: { size: number; palette: Record<string, string>; rows: string[] },
  sunburst: AvatarLook['sunburst'],
): { rows: string[]; palette: Record<string, string> } {
  if (sunburst === null) return sprite;
  const backdropKey = spriteBackdropKey(sprite.palette);
  const extra = SPRITE_BAND_KEYS.slice(0, sunburst.bands - 1);
  const added: Record<string, string> = {};
  extra.forEach((bandKey, index) => {
    // Band 0 is the sprite's own backdrop; these are bands 1…n-1, ending on `colourTwo`.
    added[bandKey] = mixLinear(
      required(sprite.palette[backdropKey], 'sprite backdrop colour'),
      sunburst.colourTwo,
      (index + 1) / (sunburst.bands - 1),
    );
  });
  const mapping = new Map([[backdropKey, [backdropKey, ...extra]]]);
  return {
    rows: splitBackdropCells(sprite.rows, mapping, sunburst),
    palette: { ...sprite.palette, ...added },
  };
}

/*
 * ADR-181 — the studio preview is ONE still image, the same `avatarSvg` everything else shows.
 *
 * ADR-173 split it into a backdrop layer that rotated under a face layer that did not. That is
 * gone. The rotation glitched — two separately re-encoded SVGs, the rays drawn at 150% and
 * `crisp-edges` pixelated, re-rasterised on every keystroke — and the fix was to delete the
 * mechanism rather than tune it, because nothing needed it: the saved avatar was always static,
 * so a moving preview was the one view that did NOT show what gets saved.
 *
 * `onlyKeys`, `exceptKeys`, `maskedPalette`, `svgUrl`, `DRAWN_BACKDROP_PAINT` and
 * `AvatarPreviewLayers` went with it; they existed only to paint half a grid at a time.
 * `spriteBackdropKey` stays — `paintSpriteSunburst` still needs it.
 */

/**
 * ADR-073 — one photo sprite as its own image, for the tuning preview.
 *
 * Deliberately not `avatarUrl`. That memoises every appearance it is ever shown for the life of the
 * session, which is right for a leaderboard of thirty faces and wrong for a control that mints a new
 * sprite each time a slider moves — the cache would grow by a few kilobytes per step and never let
 * go. It also wants a whole identity in order to fall back to a drawn character, and there is no
 * character to fall back to here: a sprite that will not parse means the preview shows nothing.
 *
 * ADR-225 — it wears the backdrop pattern too, through `paintSpriteSunburst`: the same call `avatarSvg`
 * makes for a photograph. Without it this picture showed the plain colour whatever pattern was chosen,
 * while the thumbnail and the preview at the top showed the pattern, so the square was not a picture of
 * what would be saved. `sunburst` is required rather than defaulted, so that leaving it out is a type
 * error and not the same bug again.
 */
export function photoSpriteUrl(sprite: string, sunburst: AvatarLook['sunburst']): string | null {
  const parsed = parseAvatarSprite(sprite);
  if (parsed === null) return null;
  const painted = paintSpriteSunburst(parsed, sunburst);
  return `data:image/svg+xml,${encodeURIComponent(svgOf(painted.rows, painted.palette))}`;
}

const urlCache = new Map<string, string>();

/**
 * One data URL per distinct appearance, remembered for the session: a leaderboard of
 * thirty rows composes at most thirty faces, and re-renders compose none.
 */
export function avatarUrl(identity: AvatarIdentity): string {
  const key = [
    ART_VERSION, identity.gender, identity.avatarVariant, identity.avatarLook,
    identity.avatarPhoto ?? '',
  ].join('|');
  const cached = urlCache.get(key);
  if (cached) return cached;
  const url = `data:image/svg+xml,${encodeURIComponent(avatarSvg(identity))}`;
  urlCache.set(key, url);
  return url;
}

export function avatarAlt(identity: Pick<AvatarIdentity, 'avatarVariant' | 'avatarPhoto'>): string {
  if (identity.avatarPhoto) return 'Photo portrait';
  return `${avatarPersona(identity.avatarVariant)} portrait`;
}

/**
 * Switching character brings the new persona's kit — but only where the participant has
 * not already chosen for themselves. An axis still sitting on the old persona's preset
 * follows the switch; one the participant picked is theirs and survives it. Without this,
 * trying on characters silently threw away the shirt and backdrop they had just set.
 */
export function personaLook(look: AvatarLook, fromVariant: number, toVariant: number): AvatarLook {
  const previous = required(AVATAR_PERSONA_PRESETS[clampVariant(fromVariant) - 1], 'persona preset');
  const next = required(AVATAR_PERSONA_PRESETS[clampVariant(toVariant) - 1], 'persona preset');
  return {
    ...look,
    outfitColour: look.outfitColour === previous.outfitColour ? next.outfitColour : look.outfitColour,
    backdrop: look.backdrop === previous.backdrop ? next.backdrop : look.backdrop,
  };
}

/** One picker row: the label comes from the contract, the colour from the art. */
export interface AvatarSwatchOption {
  value: number;
  label: string;
  colour: string;
}

/** Only the axes that are an index into the art: the other two are free colours. */
const SWATCH_COLOURS: Record<string, readonly AvatarSwatch[]> = {
  skinTone: SKIN_TONES,
  hairColour: HAIR_COLOURS,
};

export function swatchOptions(axisKey: string, labels: readonly string[]): AvatarSwatchOption[] {
  const colours = required(SWATCH_COLOURS[axisKey], `swatch colours for ${axisKey}`);
  return labels.map((label, index) => ({
    value: index + 1,
    label,
    colour: required(colours[index], `${axisKey} colour ${index}`).base,
  }));
}
