/**
 * Base architecture genome (Addendum 0003).
 *
 * Every gene has a signature value; together they reproduce the original frame
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
  /** d — recursion depth of the three fractal rules (integer) */
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
  exploreMin: number;
  exploreMax: number;
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

function continuous(key: GeneKey, range: [number, number], explore: [number, number], step = 0.05): GeneDefinition {
  return {
    key,
    min: range[0],
    max: range[1],
    step,
    signature: SIGNATURE_GENOME[key],
    isInteger: false,
    exploreMin: explore[0],
    exploreMax: explore[1],
  };
}

function integral(key: GeneKey, range: [number, number], explore: [number, number]): GeneDefinition {
  return { ...continuous(key, range, explore, 1), isInteger: true };
}

export const GENE_DEFINITIONS: Readonly<Record<GeneKey, GeneDefinition>> = Object.freeze({
  cornerScale: continuous('cornerScale', [0.5, 1.8], [0.75, 1.5]),
  cornerProfile: continuous('cornerProfile', [-1, 1], [-0.9, 0.9]),
  zigguratSteps: integral('zigguratSteps', [1, 5], [1, 4]),
  rayDensity: continuous('rayDensity', [0.5, 1.6], [0.6, 1.5]),
  raySpread: continuous('raySpread', [0.75, 1.2], [0.85, 1.15]),
  rayReach: continuous('rayReach', [0.75, 1.35], [0.85, 1.25]),
  wingDelta: integral('wingDelta', [-3, 2], [-2, 2]),
  wingSweep: continuous('wingSweep', [0.6, 1.6], [0.7, 1.4]),
  fractalDepth: integral('fractalDepth', [0, 3], [0, 3]),
  fractalRatio: continuous('fractalRatio', [0.3, 0.6], [0.35, 0.55], 0.01),
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
  return {
    cornerScale: read('cornerScale'),
    cornerProfile: read('cornerProfile'),
    zigguratSteps: read('zigguratSteps'),
    rayDensity: read('rayDensity'),
    raySpread: read('raySpread'),
    rayReach: read('rayReach'),
    wingDelta: read('wingDelta'),
    wingSweep: read('wingSweep'),
    fractalDepth: read('fractalDepth'),
    fractalRatio: read('fractalRatio'),
  };
}

/** True when the genome renders the original frame; r is inert at depth 0. */
export function isSignatureGenome(candidate: Partial<BaseGenome>): boolean {
  const genome = clampGenome(candidate);
  return GENE_ORDER.every(
    (key) => key === 'fractalRatio' || genome[key] === SIGNATURE_GENOME[key]
  );
}

export function withGene(genome: BaseGenome, key: GeneKey, value: number): BaseGenome {
  return clampGenome({ ...genome, [key]: value });
}

/* ------------------------------ variant explorer ------------------------------ */

/** Positive root of x^(d+1) = x + 1 (the generalised golden ratio for d dimensions). */
function solveGeneralisedGoldenRatio(dimensions: number): number {
  let estimate = 1.5;
  for (let iteration = 0; iteration < 96; iteration += 1) {
    estimate = Math.pow(1 + estimate, 1 / (dimensions + 1));
  }
  return estimate;
}

export const EXPLORER_PHI = solveGeneralisedGoldenRatio(GENE_ORDER.length);

const KRONECKER_STEPS = GENE_ORDER.map((_, index) => Math.pow(1 / EXPLORER_PHI, index + 1));

function fractionalPart(value: number): number {
  return value - Math.floor(value);
}

/** R-sequence point k in the unit hypercube: u_j = frac(0.5 + k·α_j). */
export function variantCoordinates(variantIndex: number): number[] {
  return KRONECKER_STEPS.map((alpha) => fractionalPart(0.5 + alpha * variantIndex));
}

function quantize(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(4));
}

function exploreValue(key: GeneKey, unit: number): number {
  const definition = GENE_DEFINITIONS[key];
  const span = definition.exploreMax - definition.exploreMin;
  if (definition.isInteger) {
    return Math.min(definition.exploreMax, definition.exploreMin + Math.floor(unit * (span + 1)));
  }
  return quantize(definition.exploreMin + unit * span, definition.step);
}

/** Variant #0 is the signature; #k ≥ 1 is a deterministic, evenly spread genome. */
export function genomeForVariant(variantIndex: number): BaseGenome {
  const index = Math.max(0, Math.floor(variantIndex));
  if (index === 0) return { ...SIGNATURE_GENOME };

  const unit = variantCoordinates(index);
  const candidate = GENE_ORDER.reduce<Partial<BaseGenome>>(
    (genome, key, position) => ({ ...genome, [key]: exploreValue(key, unit[position]) }),
    {}
  );
  return clampGenome(candidate);
}

export function nextVariantIndex(current: number | null, direction: number): number {
  return Math.max(0, (current ?? 0) + Math.sign(direction));
}
