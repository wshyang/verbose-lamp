import type { CurvePoint, GildingParams, GildingPreset } from './types';

function curve(...points: CurvePoint[]): readonly CurvePoint[] {
  return Object.freeze(points.map((point) => Object.freeze({ ...point })));
}

function preset(id: string, name: string, params: GildingParams): GildingPreset {
  const frozenParams = Object.freeze({
    ...params,
    curvePoints: curve(...params.curvePoints),
    mask: Object.freeze({ ...params.mask }),
  });
  return Object.freeze({ id, name, params: frozenParams });
}

const IDENTITY_CURVE = curve({ x: 0, y: 0 }, { x: 1, y: 1 });

export const GILDING_PRESETS = Object.freeze([
  preset('gatsby-bullion', 'Gatsby Bullion', {
    clarity: 0.85,
    clarityRadius: 10,
    levels: 24,
    curvePoints: IDENTITY_CURVE,
    folds: 2,
    rampId: 'bright',
    mask: { shape: 'none', feather: 0, choke: 0 },
  }),
  preset('daisys-locket', "Daisy's Locket", {
    clarity: 0.55,
    clarityRadius: 12,
    levels: 18,
    curvePoints: curve(
      { x: 0, y: 0.04 },
      { x: 0.22, y: 0.72 },
      { x: 0.46, y: 0.34 },
      { x: 0.76, y: 0.82 },
      { x: 1, y: 0.98 }
    ),
    folds: 0,
    rampId: 'champagne',
    mask: { shape: 'oval', feather: 0.08, choke: 1 },
  }),
  preset('jazz-age-patina', 'Jazz Age Patina', {
    clarity: 0.28,
    clarityRadius: 14,
    levels: 38,
    curvePoints: IDENTITY_CURVE,
    folds: 1,
    rampId: 'deep',
    mask: { shape: 'none', feather: 0, choke: 0 },
  }),
  preset('polished-trophy', 'Polished Trophy', {
    clarity: 1.45,
    clarityRadius: 8,
    levels: 32,
    curvePoints: curve(
      { x: 0, y: 0.02 },
      { x: 0.13, y: 0.9 },
      { x: 0.25, y: 0.17 },
      { x: 0.42, y: 0.97 },
      { x: 0.55, y: 0.2 },
      { x: 0.72, y: 0.91 },
      { x: 0.84, y: 0.12 },
      { x: 1, y: 1 }
    ),
    folds: 0,
    rampId: 'bright',
    mask: { shape: 'none', feather: 0, choke: 0 },
  }),
] as const);