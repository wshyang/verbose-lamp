/**
 * Hand-built Art Deco glyph paths, on a 24 × 24 grid (ADDENDUM-033).
 *
 * The gilded nav bar drew its glyphs as colour emoji run through the gold-ramp
 * filter. That reads correctly on macOS, Windows and Android — and as an empty box
 * on any host without an emoji font, which includes the Linux CI image, most
 * minimal containers and many kiosks. These paths replace the five icons the gilded
 * UI ships by default, so the bar looks the same everywhere; user-edited lines still
 * fall back to whatever emoji they typed.
 *
 * All five are stroke geometry: `GildedGlyph` strokes them in white inside the
 * `#gilded-glyph` filter, so the same luminance → gold-ramp chain applies.
 */
export const DECO_ICONS = Object.freeze({
  /** Pediment over three columns — the ballroom foyer. */
  portico:
    'M3 21 H21 M5 21 V11.5 M9.5 21 V11.5 M14.5 21 V11.5 M19 21 V11.5 ' +
    'M4 11 H20 L15.4 4.6 H8.6 Z M11.9 6.4 V9.2',
  /** Eighth note with a deco flag — the program. */
  note:
    'M10 18 V6 L19 4 V16 M10 18 a2.3 2.3 0 1 1 -4.6 0 a2.3 2.3 0 1 1 4.6 0 ' +
    'M19 16 a2.3 2.3 0 1 1 -4.6 0 a2.3 2.3 0 1 1 4.6 0 M10 9.4 L19 7.4',
  /** Five-pip die — the lucky draw drum. */
  dice:
    'M5 5 H19 V19 H5 Z M8.4 8.4 h0.02 M15.6 8.4 h0.02 M12 12 h0.02 ' +
    'M8.4 15.6 h0.02 M15.6 15.6 h0.02',
  /** Coupe glass with a broad deco bowl — the toast. */
  coupe: 'M6 4.4 H18 L15.6 10.6 H8.4 Z M12 10.6 V18.4 M7.6 21 H16.4 M8.8 7 H15.2',
  /** Camera with a bellows step — the gallery. */
  camera:
    'M3 8.4 H8 L9.6 5.6 H14.4 L16 8.4 H21 V19 H3 Z ' +
    'M12 16.4 a4.1 4.1 0 1 0 0.01 0 M17.8 11 h1.4',
  /** The house star, for lines that are not an emoji at all. */
  star: 'M12 3 L14.2 9.4 L21 12 L14.2 14.6 L12 21 L9.8 14.6 L3 12 L9.8 9.4 Z',
} as const);

export type DecoIconName = keyof typeof DECO_ICONS;

/** Emoji the gilded UI ships with, mapped to their built-in icon. */
const ICON_BY_EMOJI: Readonly<Record<string, DecoIconName>> = Object.freeze({
  '🏛': 'portico',
  '🎷': 'note',
  '🎰': 'dice',
  '🥂': 'coupe',
  '📸': 'camera',
});

/** Emoji presentation selectors are not part of the key; `parseNavLines` drops them too. */
const stripVariation = (emoji: string | undefined | null): string =>
  typeof emoji === 'string' ? emoji.replace(/[\uFE0E\uFE0F]/g, '').trim() : '';

/**
 * The icon for a nav glyph, or `null` when the glyph is something only a font can
 * draw. Callers fall back to the emoji text in that case — the editor stays open.
 */
export function iconNameFor(emoji: string | undefined | null): DecoIconName | null {
  return ICON_BY_EMOJI[stripVariation(emoji)] ?? null;
}

/** The SVG path for a nav glyph, or `null` for an emoji we have not drawn. */
export function iconPathFor(emoji: string | undefined | null): string | null {
  const name = iconNameFor(emoji);
  return name === null ? null : DECO_ICONS[name];
}
