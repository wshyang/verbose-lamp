import { BaseGenome, GENE_DEFINITIONS, SIGNATURE_GENOME, clampGenome, genomeForVariant, isSignatureGenome, GeneKey } from '../webgl/frameGrammar/genome';

export interface GeneUi {
  key: GeneKey;
  label: string;
  hint: string;
}

export const GENE_UI: Record<GeneKey, GeneUi> = {
  cornerScale: { key: 'cornerScale', label: 'Corner size', hint: 'How deep the plate corners are cut or stepped.' },
  cornerProfile: { key: 'cornerProfile', label: 'Corner profile', hint: 'Notched inward, straight chamfer, or rounded outward.' },
  zigguratSteps: { key: 'zigguratSteps', label: 'Setback stairs', hint: 'Stairs per stepped corner; the total setback stays the same.' },
  rayDensity: { key: 'rayDensity', label: 'Ray density', hint: 'How many rays each sunburst carries; the centre ray is always kept.' },
  raySpread: { key: 'raySpread', label: 'Fan opening', hint: 'How wide each sunburst opens.' },
  rayReach: { key: 'rayReach', label: 'Ray reach', hint: 'How far the rays extend.' },
  wingDelta: { key: 'wingDelta', label: 'Wing count', hint: 'Chevron wings added to or removed from each flank.' },
  wingSweep: { key: 'wingSweep', label: 'Wing sweep', hint: 'How sharply the chevrons point outward.' },
  fractalDepth: { key: 'fractalDepth', label: 'Recursion depth', hint: 'Self-similar levels for rules and rays.' },
  fractalRatio: { key: 'fractalRatio', label: 'Recursion ratio', hint: 'Scale of each level relative to its parent.' },
};

export interface GeneGroup {
  id: 'corners' | 'sunbursts' | 'wings' | 'recursion';
  title: string;
  caption: string;
  genes: GeneKey[];
}

export const GENE_GROUPS: readonly GeneGroup[] = [
  { id: 'corners', title: 'Corners', caption: 'Plate silhouette', genes: ['cornerScale', 'cornerProfile', 'zigguratSteps'] },
  { id: 'sunbursts', title: 'Sunbursts', caption: 'Chrysler fans', genes: ['rayDensity', 'raySpread', 'rayReach'] },
  { id: 'wings', title: 'Wings', caption: 'Chevron flanks', genes: ['wingDelta', 'wingSweep'] },
  { id: 'recursion', title: 'Recursion', caption: 'Fractal rules', genes: ['fractalDepth', 'fractalRatio'] },
];

export interface DesignEntry {
  index: number;
  label: string;
  genome: BaseGenome;
  kind: 'original' | 'named' | 'variation';
}

const NAMED_GENOMES: Array<[string, string, Partial<BaseGenome>]> = [
  ['Skyscraper', 'Deeper four-stair setbacks, taller and narrower sunbursts, one extra wing.', { cornerScale: 1.35, zigguratSteps: 4, rayDensity: 0.7, raySpread: 0.85, rayReach: 1.2, wingDelta: 1, wingSweep: 0.8 }],
  ['Moderne', 'Streamline rounded corners, single setbacks, sparse rays and long swept wings.', { cornerScale: 1.3, cornerProfile: 0.9, zigguratSteps: 1, rayDensity: 0.6, raySpread: 0.9, rayReach: 0.9, wingDelta: -2, wingSweep: 1.3 }],
  ['Jazz Fan', 'Dense, wide, far-reaching sunbursts with one recursion level.', { rayDensity: 1.5, raySpread: 1.15, rayReach: 1.25, fractalDepth: 1, fractalRatio: 0.5 }],
  ['Cathedral', 'Notched concave corners, three-stair setbacks and a fuller wing array.', { cornerScale: 1.4, cornerProfile: -0.85, zigguratSteps: 3, rayDensity: 1.2, rayReach: 1.1, wingDelta: 2, wingSweep: 1.2 }],
  ['Filigree', 'Three recursion levels: Cantor-dashed rules and graduated rays.', { rayDensity: 1.25, raySpread: 1.05, rayReach: 1.1, fractalDepth: 3, fractalRatio: 0.48 }],
];

export const VARIATION_COUNT = 6;

/** Every design the studio can select, in one ordered list. Entry 0 is the original. */
export const DESIGN_GALLERY: readonly DesignEntry[] = [
  { index: 0, label: 'Original', genome: { ...SIGNATURE_GENOME }, kind: 'original' },
  ...NAMED_GENOMES.map(([label, , genome], position) => ({
    index: position + 1,
    label,
    genome: clampGenome(genome),
    kind: 'named' as const,
  })),
  ...Array.from({ length: VARIATION_COUNT }, (_, position) => ({
    index: NAMED_GENOMES.length + 1 + position,
    label: `Variation ${position + 1}`,
    genome: genomeForVariant(position + 1),
    kind: 'variation' as const,
  })),
];

export function designAt(index: number): DesignEntry {
  const total = DESIGN_GALLERY.length;
  return DESIGN_GALLERY[((Math.round(index) % total) + total) % total];
}

export function findDesignEntry(genome: BaseGenome): DesignEntry | undefined {
  const key = JSON.stringify(clampGenome(genome));
  return DESIGN_GALLERY.find((entry) => JSON.stringify(clampGenome(entry.genome)) === key);
}

export function describeDesign(entry: DesignEntry | undefined, genome: BaseGenome): string {
  if (entry) return entry.kind === 'original' ? 'Original' : entry.label;
  return isSignatureGenome(genome) ? 'Original' : 'Custom';
}

export function formatGeneValue(key: GeneKey, value: number): string {
  const stairs = (count: number) => `${count} stair${Math.abs(count) === 1 ? '' : 's'}`;
  switch (key) {
    case 'cornerProfile':
      if (value === 0) return 'Chamfer';
      return value > 0 ? `Rounded ${Math.round(value * 100)}%` : `Notched ${Math.round(-value * 100)}%`;
    case 'zigguratSteps':
      return stairs(value);
    case 'wingDelta':
      return value === 0 ? '±0 wings' : `${value > 0 ? '+' : '−'}${Math.abs(value)} wing${Math.abs(value) === 1 ? '' : 's'}`;
    case 'fractalDepth':
      return value === 0 ? 'Off' : `Depth ${value}`;
    case 'fractalRatio':
      return `r = ${value.toFixed(2)}`;
    default:
      return `×${value.toFixed(2)}`;
  }
}

export function isGeneAtSignature(key: GeneKey, value: number): boolean {
  return value === SIGNATURE_GENOME[key];
}

/** Position of the signature tick along a gene slider, in percent. */
export function signatureMarkerPercent(key: GeneKey): number {
  const definition = GENE_DEFINITIONS[key];
  return ((definition.signature - definition.min) / (definition.max - definition.min)) * 100;
}
