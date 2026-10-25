export const DEFAULT_TAGLINE = 'AN EVENING AT WEST EGG';

/** Opening line shown under the title before any section is chosen. */
export const OPENING_TAGLINE = 'CHAMPAGNE ON ARRIVAL · THE ORCHESTRA TUNES';

export const SECTION_TAGLINES: Readonly<Record<string, string>> = {
  foyer: OPENING_TAGLINE,
  program: 'THREE SETS OF JAZZ UNTIL THE SMALL HOURS',
  toast: 'RAISE A GLASS TO THE GREEN LIGHT',
  gallery: 'THE NIGHT, GILDED AND REMEMBERED',
};
