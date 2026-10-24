/**
 * Base architecture genome — ported from wshyang/verbose-lamp `1/src/webgl/frame/genome.ts`.
 *
 * Every gene has a signature value; together they reproduce the delivered frame
 * exactly. Pure module: no Three.js, no DOM, no randomness.
 */
export interface BaseGenome {
  /** κ — multiplies octagon corner cuts and ziggurat step size */
  cornerScale: number;
  /** p — octagon corners: −1 concave notch, 0 straight chamfer, +1 rounded */
  cornerProfile: number;
  /** n — stairs per ziggurat corner (integer) */
  zigguratSteps: number;
  /** ρ — sunburst ray-count multiplier (counts stay odd) */
  rayDensity: number;
  /** σ — sunburst opening-angle multiplier */
  raySpread: number;
  /** λ — sunburst ray-length multiplier */
  rayReach: number;
  /** Δw — chevron wings added or removed (integer) */
  wingDelta: number;
  /** ω — chevron depth multiplier */
  wingSweep: number;
  /** d — recursion depth applied to split rules (integer) */
  fractalDepth: number;
  /** r — scale per recursion level; inert when d = 0 */
  fractalRatio: number;
}

export type GeneKey = keyof BaseGenome;

export interface GeneDefinition {
  key: GeneKey;
  min: number;
  max: number;
  step: number;
  signature: number;
  isInteger: boolean;
}

export const GENE_ORDER: readonly GeneKey[] = [
  'cornerScale',
  'cornerProfile',
  'zigguratSteps',
  'rayDensity',
  'raySpread',
  'rayReach',
  'wingDelta',
  'wingSweep',
  'fractalDepth',
  'fractalRatio',
];

export const SIGNATURE_GENOME: Readonly<BaseGenome> = Object.freeze({
  cornerScale: 1,
  cornerProfile: 0,
  zigguratSteps: 2,
  rayDensity: 1,
  raySpread: 1,
  rayReach: 1,
  wingDelta: 0,
  wingSweep: 1,
  fractalDepth: 0,
  fractalRatio: 0.45,
});

function continuous(key: GeneKey, range: [number, number], step = 0.05): GeneDefinition {
  return { key, min: range[0], max: range[1], step, signature: SIGNATURE_GENOME[key], isInteger: false };
}

function integral(key: GeneKey, range: [number, number]): GeneDefinition {
  return { ...continuous(key, range, 1), isInteger: true };
}

export const GENE_DEFINITIONS: Readonly<Record<GeneKey, GeneDefinition>> = Object.freeze({
  cornerScale: continuous('cornerScale', [0.5, 1.8]),
  cornerProfile: continuous('cornerProfile', [-1, 1]),
  zigguratSteps: integral('zigguratSteps', [1, 5]),
  rayDensity: continuous('rayDensity', [0.5, 1.6]),
  raySpread: continuous('raySpread', [0.75, 1.2]),
  rayReach: continuous('rayReach', [0.75, 1.35]),
  wingDelta: integral('wingDelta', [-3, 2]),
  wingSweep: continuous('wingSweep', [0.6, 1.6]),
  fractalDepth: integral('fractalDepth', [0, 3]),
  fractalRatio: continuous('fractalRatio', [0.3, 0.6], 0.01),
});

export function clampGene(key: GeneKey, value: number): number {
  const definition = GENE_DEFINITIONS[key];
  if (!Number.isFinite(value)) return definition.signature;
  const bounded = Math.min(definition.max, Math.max(definition.min, value));
  return definition.isInteger ? Math.round(bounded) : bounded;
}

/** Fills missing genes from the signature, clamps ranges and rounds integer genes. */
export function clampGenome(candidate: Partial<BaseGenome> = {}): BaseGenome {
  const read = (key: GeneKey) => clampGene(key, candidate[key] ?? SIGNATURE_GENOME[key]);
  return GENE_ORDER.reduce((genome, key) => ({ ...genome, [key]: read(key) }), {} as BaseGenome);
}

/** True when the genome renders the original frame; r is inert at depth 0. */
export function isSignatureGenome(candidate: Partial<BaseGenome>): boolean {
  const genome = clampGenome(candidate);
  return GENE_ORDER.every((key) => key === 'fractalRatio' || genome[key] === SIGNATURE_GENOME[key]);
}

export function withGene(genome: BaseGenome, key: GeneKey, value: number): BaseGenome {
  return clampGenome({ ...genome, [key]: value });
}

/* ---------------------------- variation explorer --------------------------- */

/** Positive root of x^(d+1) = x + 1 — the generalised golden ratio for d dimensions. */
function solveGeneralisedGoldenRatio(dimensions: number): number {
  let estimate = 1.5;
  for (let iteration = 0; iteration < 96; iteration += 1) {
    estimate = Math.pow(1 + estimate, 1 / (dimensions + 1));
  }
  return estimate;
}

const EXPLORER_PHI = solveGeneralisedGoldenRatio(GENE_ORDER.length);
const KRONECKER_STEPS = GENE_ORDER.map((_, index) => Math.pow(1 / EXPLORER_PHI, index + 1));

function fractionalPart(value: number): number {
  return value - Math.floor(value);
}

/** R-sequence point k in the unit hypercube: u_j = frac(0.5 + k·α_j). */
export function variantCoordinates(variantIndex: number): number[] {
  return KRONECKER_STEPS.map((alpha) => fractionalPart(0.5 + alpha * variantIndex));
}

function exploreValue(key: GeneKey, unit: number): number {
  const definition = GENE_DEFINITIONS[key];
  const span = definition.max - definition.min;
  if (definition.isInteger) {
    return Math.min(definition.max, Math.round(definition.min + unit * span));
  }
  return Number((Math.round((definition.min + unit * span) / definition.step) * definition.step).toFixed(4));
}

/** Variant #0 is the signature; #k ≥ 1 is a deterministic, evenly spread genome. */
export function genomeForVariant(variantIndex: number): BaseGenome {
  const index = Math.max(0, Math.floor(variantIndex));
  if (index === 0) return { ...SIGNATURE_GENOME };
  const unit = variantCoordinates(index);
  return clampGenome(GENE_ORDER.reduce<Partial<BaseGenome>>((g, key, i) => ({ ...g, [key]: exploreValue(key, unit[i]) }), {}));
}
