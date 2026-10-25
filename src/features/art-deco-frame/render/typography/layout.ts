import { DECO_ALPHABET, type GlyphDef } from '../../model/decoAlphabet';
import type { DecoTextOptions } from '../../model/decoText';

/** Supersampled pixel cap height: the mask is drawn at this size, then sampled. */
export const CAP_HEIGHT = 220;
export const PAD_X = 56;
export const PAD_Y = 54;
/** The mask canvas never grows past this width; wider text is scaled to fit. */
const MAX_CANVAS_W = 2560;
const MIN_CANVAS_W = 256;
const SPACE_ADVANCE = 0.36;
const EMPTY_TEXT_ADVANCE = 0.5;
const HERO_TRACKING = 0.18;
const OTHER_TRACKING = 0.24;
const STROKE_BY_WEIGHT = { hero: 32, regular: 24, fine: 18 } as const;
/** Glyphs the pinstripe alternation skips, and does not count towards the alternation. */
const PUNCTUATION = new Set(['.', '·', '-', "'", 'I', '1']);

export interface GlyphPlacement {
  ch: string;
  def: GlyphDef | null;
  x: number;
  glyphW: number;
  pinstriped: boolean;
}

export interface TextLayout {
  placements: GlyphPlacement[];
  /** Width of the laid-out run in cap-height pixels, before any scale-to-fit. */
  runWidth: number;
  canvasW: number;
  canvasH: number;
  /** Below 1 when the run is wider than the canvas allows. */
  scaleFit: number;
  strokeW: number;
}

/** Stroke weight for a weight name; the hero face is cut heaviest. */
export function strokeFor(weight: DecoTextOptions['weight'] = 'hero'): number {
  return STROKE_BY_WEIGHT[weight];
}

/** Places each glyph along the baseline and sizes the canvas that will hold the word. */
export function layoutGlyphs(options: DecoTextOptions): TextLayout {
  const rawText = (options.text || ' ').toUpperCase();
  const alternatePinstripes = options.alternatePinstripes ?? true;
  const weight = options.weight ?? 'hero';
  const tracking = options.tracking ?? (weight === 'hero' ? HERO_TRACKING : OTHER_TRACKING);

  let cursorX = 0;
  let visibleIndex = 0;
  const placements: GlyphPlacement[] = [];
  for (const ch of Array.from(rawText)) {
    if (ch === ' ') {
      cursorX += CAP_HEIGHT * SPACE_ADVANCE;
      continue;
    }
    const def = DECO_ALPHABET[ch] ?? DECO_ALPHABET['O'];
    const glyphW = def.w * CAP_HEIGHT;
    const isPunct = PUNCTUATION.has(ch);
    const pinstriped = alternatePinstripes && !isPunct && visibleIndex % 2 === 0;
    placements.push({ ch, def, x: cursorX, glyphW, pinstriped });
    if (!isPunct) visibleIndex++;
    cursorX += glyphW + CAP_HEIGHT * tracking;
  }

  const runWidth = placements.length > 0 ? cursorX - CAP_HEIGHT * tracking : CAP_HEIGHT * EMPTY_TEXT_ADVANCE;
  return {
    placements,
    runWidth,
    canvasW: Math.min(MAX_CANVAS_W, Math.max(MIN_CANVAS_W, Math.ceil(runWidth + PAD_X * 2))),
    canvasH: CAP_HEIGHT + PAD_Y * 2,
    scaleFit: runWidth + PAD_X * 2 > MAX_CANVAS_W ? (MAX_CANVAS_W - PAD_X * 2) / runWidth : 1.0,
    strokeW: strokeFor(weight),
  };
}
