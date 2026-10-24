import { genomeForVariant } from '../webgl/frame';
import {
  GENE_DEFINITIONS,
  SIGNATURE_GENOME,
  clampGenome,
  isSignatureGenome,
  type BaseGenome,
  type FrameGeometryStats,
  type FrameFamily,
  type GeneKey,
} from '../webgl/frame';

export type GenomePresetId = 'signature' | 'skyscraper' | 'moderne' | 'jazz-fan' | 'cathedral' | 'filigree';

export interface GenomePreset {
  id: GenomePresetId;
  label: string;
  description: string;
  genome: BaseGenome;
}

export const GENOME_PRESETS: GenomePreset[] = [
  {
    id: 'signature',
    label: 'Signature',
    description: 'The original architecture, unchanged.',
    genome: { ...SIGNATURE_GENOME },
  },
  {
    id: 'skyscraper',
    label: 'Skyscraper',
    description: 'Deeper four-stair setbacks, taller and narrower sunbursts, one extra wing.',
    genome: clampGenome({ cornerScale: 1.35, zigguratSteps: 4, rayDensity: 0.7, raySpread: 0.85, rayReach: 1.2, wingDelta: 1, wingSweep: 0.8 }),
  },
  {
    id: 'moderne',
    label: 'Moderne',
    description: 'Streamline rounded corners, single setbacks, sparse rays and long swept wings.',
    genome: clampGenome({ cornerScale: 1.3, cornerProfile: 0.9, zigguratSteps: 1, rayDensity: 0.6, raySpread: 0.9, rayReach: 0.9, wingDelta: -2, wingSweep: 1.3 }),
  },
  {
    id: 'jazz-fan',
    label: 'Jazz Fan',
    description: 'Dense, wide, far-reaching sunbursts with one level of graduated rays.',
    genome: clampGenome({ rayDensity: 1.5, raySpread: 1.15, rayReach: 1.25, fractalDepth: 1, fractalRatio: 0.5 }),
  },
  {
    id: 'cathedral',
    label: 'Cathedral',
    description: 'Notched concave corners, three-stair setbacks and a fuller wing array.',
    genome: clampGenome({ cornerScale: 1.4, cornerProfile: -0.85, zigguratSteps: 3, rayDensity: 1.2, rayReach: 1.1, wingDelta: 2, wingSweep: 1.2 }),
  },
  {
    id: 'filigree',
    label: 'Filigree',
    description: 'Three recursion levels: lozenge trees, graduated rays and Cantor-dashed rules.',
    genome: clampGenome({ rayDensity: 1.25, raySpread: 1.05, rayReach: 1.1, fractalDepth: 3, fractalRatio: 0.48 }),
  },
];

export interface FrameStyleOption {
  id: FrameFamily;
  label: string;
  vocabulary: string;
  description: string;
}

/**
 * Two ornament vocabularies for the title frame, named by what they draw.
 * Neither produces the screen border — that is a separate control.
 */
export const FRAME_STYLES: FrameStyleOption[] = [
  {
    id: 'sequence',
    label: 'Sunburst',
    vocabulary: 'Octagon plate · stepped ziggurat · sunburst · chevron',
    description:
      'The on-screen Deco vocabulary of the title cards: a stepped plate around the type, radiating sunburst crowns and chevron flanks.',
  },
  {
    id: 'poster',
    label: 'Fluted',
    vocabulary: 'Corner fan · fluted pilaster · skyline comb · ring',
    description:
      'The printed one-sheet vocabulary: quarter-circle fans of ribs and arcs, reeded columns, a graduated skyline and ring medallions.',
  },
];

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
  fractalDepth: { key: 'fractalDepth', label: 'Recursion depth', hint: 'Self-similar levels for diamonds, rays and rules.' },
  fractalRatio: { key: 'fractalRatio', label: 'Recursion ratio', hint: 'Scale of each level relative to its parent.' },
};

export interface GeneGroup {
  id: 'corners' | 'sunbursts' | 'wings' | 'recursion';
  title: string;
  caption: string;
  genes: GeneKey[];
}

export const GENE_GROUPS: GeneGroup[] = [
  { id: 'corners', title: 'Corners', caption: 'Plate silhouette', genes: ['cornerScale', 'cornerProfile', 'zigguratSteps'] },
  { id: 'sunbursts', title: 'Sunbursts', caption: 'Chrysler fans', genes: ['rayDensity', 'raySpread', 'rayReach'] },
  { id: 'wings', title: 'Wings', caption: 'Chevron flanks', genes: ['wingDelta', 'wingSweep'] },
  { id: 'recursion', title: 'Recursion', caption: 'Fractal rules', genes: ['fractalDepth', 'fractalRatio'] },
];


/* ------------------------- single design gallery ------------------------- */

export interface DesignEntry {
  /** index into the merged gallery; 0 is the original */
  index: number;
  label: string;
  genome: BaseGenome;
  kind: 'original' | 'named' | 'variation';
}

const NAMED_DESIGNS = GENOME_PRESETS.slice(1);
export const VARIATION_COUNT = 6;

/** Every design the panel can show, in one ordered list. Entry 0 is the original. */
export const DESIGN_GALLERY: DesignEntry[] = [
  { index: 0, label: 'Original', genome: { ...GENOME_PRESETS[0].genome }, kind: 'original' },
  ...NAMED_DESIGNS.map((preset, position) => ({
    index: position + 1,
    label: preset.label,
    genome: preset.genome,
    kind: 'named' as const,
  })),
  ...Array.from({ length: VARIATION_COUNT }, (_, position) => ({
    index: NAMED_DESIGNS.length + 1 + position,
    label: `Variation ${position + 1}`,
    genome: genomeForVariant(position + 1),
    kind: 'variation' as const,
  })),
];

export function designAt(index: number): DesignEntry {
  const total = DESIGN_GALLERY.length;
  const wrapped = ((Math.round(index) % total) + total) % total;
  return DESIGN_GALLERY[wrapped];
}

/** Which gallery entry, if any, the current genome corresponds to. */
export function findDesignEntry(genome: BaseGenome): DesignEntry | undefined {
  const key = JSON.stringify(clampGenome(genome));
  return DESIGN_GALLERY.find((entry) => JSON.stringify(clampGenome(entry.genome)) === key);
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${Math.abs(count) === 1 ? '' : 's'}`;
}

export function formatGeneValue(key: GeneKey, value: number): string {
  switch (key) {
    case 'cornerProfile':
      if (value === 0) return 'Chamfer';
      return value > 0 ? `Rounded ${Math.round(value * 100)}%` : `Notched ${Math.round(-value * 100)}%`;
    case 'zigguratSteps':
      return pluralize(value, 'stair');
    case 'wingDelta':
      if (value === 0) return '±0 wings';
      return `${value > 0 ? '+' : '−'}${pluralize(Math.abs(value), 'wing')}`;
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

/** Position of the signature tick along a slider, in percent. */
export function signatureMarkerPercent(key: GeneKey): number {
  const definition = GENE_DEFINITIONS[key];
  return ((definition.signature - definition.min) / (definition.max - definition.min)) * 100;
}

function genomeKey(genome: BaseGenome): string {
  return JSON.stringify(clampGenome(genome));
}

export function findActiveGenomePreset(genome: BaseGenome): GenomePreset | undefined {
  if (isSignatureGenome(genome)) return GENOME_PRESETS[0];
  const key = genomeKey(genome);
  return GENOME_PRESETS.find((preset) => genomeKey(preset.genome) === key);
}

export function describeDesign(entry: DesignEntry | undefined, genome: BaseGenome): string {
  if (entry) return entry.kind === 'original' ? 'Original' : `${entry.label} · ${entry.index}`;
  return isSignatureGenome(genome) ? 'Original' : 'Custom';
}

export interface ReadoutRow {
  label: string;
  value: string;
}

export function buildFrameReadoutRows(stats: FrameGeometryStats | null): ReadoutRow[] {
  if (!stats) return [{ label: 'Golden rails · 5 cards', value: '—' }];
  const count = (value: number) => value.toLocaleString('en-US');
  return [
    { label: 'Golden rails · 5 cards', value: count(stats.railCount) },
    { label: 'Vertices · 5 cards', value: count(stats.vertexCount) },
    { label: 'Fractal rails', value: count(stats.fractals) },
    { label: 'Echo layers', value: count(stats.echoes) },
    { label: 'Bands · rosettes', value: `${count(stats.bands)} · ${count(stats.rosettes)}` },
    { label: 'Envelope', value: `${stats.extentX.toFixed(2)} × ${stats.extentY.toFixed(2)} u` },
  ];
}
