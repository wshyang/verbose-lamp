import { accentsOf } from './accents';
import { DEFAULT_PATTERNS, PATTERN_KNOBS, SPEC_KNOBS } from './palettes';
import { RADIANCE_SHAPES, WAVE_FORMS } from './patterns';
import type { BackdropKind, BackdropPattern, BackdropSpec, EnamelPalette, InlayStyle, SpecKnob } from './types';

/** Immutable spec edits for editors. Every function returns a new object, clamped to range. */

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function withPatternKind(spec: BackdropSpec, kind: BackdropKind): BackdropSpec {
  if (spec.pattern.kind === kind) return spec;
  return { ...spec, pattern: DEFAULT_PATTERNS[kind] };
}

export function withPatternKnob(spec: BackdropSpec, change: { key: string; value: number }): BackdropSpec {
  const range = PATTERN_KNOBS[spec.pattern.kind].find((knob) => knob.key === change.key);
  if (range === undefined || !Number.isFinite(change.value)) return spec;
  const value = clamp(Math.round(change.value / range.step) * range.step, range.min, range.max);
  return { ...spec, pattern: { ...spec.pattern, [change.key]: value } as BackdropPattern };
}

export function withSpecKnob(spec: BackdropSpec, change: { knob: SpecKnob; value: number }): BackdropSpec {
  const range = SPEC_KNOBS[change.knob];
  if (!Number.isFinite(change.value)) return spec;
  const stepped = Math.round(change.value / range.step) * range.step;
  return { ...spec, [change.knob]: Number(clamp(stepped, range.min, range.max).toFixed(3)) };
}

/** Applies a palette's colours, including a jewel palette's middle enamels. */
export function withPalette(spec: BackdropSpec, palette: EnamelPalette): BackdropSpec {
  return { ...spec, colourOne: palette.colourOne, colourTwo: palette.colourTwo, accents: palette.accents ?? [] };
}

export function withColours(spec: BackdropSpec, change: { colourOne?: string; colourTwo?: string }): BackdropSpec {
  const isHex = (value: string | undefined): value is string => value !== undefined && /^#[\da-f]{6}$/i.test(value);
  return {
    ...spec,
    colourOne: isHex(change.colourOne) ? change.colourOne : spec.colourOne,
    colourTwo: isHex(change.colourTwo) ? change.colourTwo : spec.colourTwo,
  };
}

export function withInlay(spec: BackdropSpec, inlay: InlayStyle): BackdropSpec {
  return (spec.inlay ?? 'cloisonne') === inlay ? spec : { ...spec, inlay };
}

/** The current value of a pattern knob, for sliders. */
export function patternKnobValue(pattern: BackdropPattern, key: string): number {
  const value = (pattern as unknown as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : 0;
}

/** The current value of a finish knob; optional knobs read as 0. */
export function specKnobValue(spec: BackdropSpec, knob: SpecKnob): number {
  return spec[knob] ?? 0;
}

/** Human copy for a knob value: named shapes and stitches read better than numbers. */
export function describeKnob(pattern: BackdropPattern, key: string): string {
  const value = patternKnobValue(pattern, key);
  if (pattern.kind === 'radiance' && key === 'shape') return RADIANCE_SHAPES[clamp(value - 1, 0, 3)].label;
  if (pattern.kind === 'chevron' && key === 'wave') return WAVE_FORMS[clamp(value - 1, 0, 1)].label;
  return String(value);
}

/** Every enamel of a palette in band order, for swatches. */
export function paletteStops(palette: EnamelPalette): string[] {
  return [palette.colourOne, ...accentsOf(palette), palette.colourTwo];
}

/** True when the spec's enamels match a palette, so its chip can show as selected. */
export function isPaletteActive(spec: BackdropSpec, palette: EnamelPalette): boolean {
  const accents = (spec.accents ?? []).join().toLowerCase();
  return (
    spec.colourOne.toLowerCase() === palette.colourOne.toLowerCase() &&
    spec.colourTwo.toLowerCase() === palette.colourTwo.toLowerCase() &&
    accents === accentsOf(palette).join().toLowerCase()
  );
}
