/** The extruded Deco alphabet covers A–Z 0–9 & . · - (plus spaces). */
const DECO_GLYPHS = /^[A-Z0-9&.·\- ]+$/;

export function canRenderInDecoGlyphs(text: string): boolean {
  const t = text.trim().toUpperCase();
  return t.length > 0 && DECO_GLYPHS.test(t);
}