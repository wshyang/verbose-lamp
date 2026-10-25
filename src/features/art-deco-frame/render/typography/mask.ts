import { CAP_HEIGHT, PAD_Y, type GlyphPlacement, type TextLayout } from './layout';

const SCRATCH_WIDTH = 1.4;
/** Where a glyph starts inside its scratch canvas, as a multiple of the stroke width. */
const SCRATCH_INSET = 0.85;
/** Distance beyond which a pixel counts as fully outside the glyph. */
const FAR = 1e6;
/** The mask's alpha at or above which a pixel is "inside" for the chamfer pass. */
const INSIDE_ALPHA = 0.35;
const AXIS_STEP = 1.0;
const DIAGONAL_STEP = 1.414;
const MIN_BEVEL = 2.0;
const BEVEL_SHARE = 0.48;

/** The rasterised word: its alpha channel and the canvas it was drawn on. */
export interface MaskSurface {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface StrokeRequest {
  sCtx: CanvasRenderingContext2D;
  item: GlyphPlacement;
  strokeW: number;
  scaleFit: number;
}

/** Strokes one glyph, pinstriped or solid, into the scratch context. */
function strokeGlyph({ sCtx, item, strokeW, scaleFit }: StrokeRequest): void {
  sCtx.save();
  sCtx.translate(strokeW * SCRATCH_INSET, PAD_Y);
  sCtx.scale(scaleFit, scaleFit);

  const path = new Path2D();
  item.def!.build(path, item.glyphW, CAP_HEIGHT);

  sCtx.lineCap = 'butt';
  sCtx.lineJoin = 'miter';
  sCtx.miterLimit = 6;

  if (item.pinstriped) {
    // 4 concentric inline stripes separated by 3 carved hollow channels.
    const widths = [strokeW, strokeW * 0.72, strokeW * 0.44, strokeW * 0.15];
    widths.forEach((width, index) => {
      const isInk = index % 2 === 0;
      sCtx.globalCompositeOperation = isInk ? 'source-over' : 'destination-out';
      if (isInk) sCtx.strokeStyle = '#ffffff';
      sCtx.lineWidth = width;
      sCtx.stroke(path);
    });
  } else {
    sCtx.globalCompositeOperation = 'source-over';
    sCtx.strokeStyle = '#ffffff';
    sCtx.lineWidth = strokeW;
    sCtx.stroke(path);
  }
  sCtx.restore();
}

/** Rasterises the whole word into one alpha mask (white = metal, clear = empty). */
export function rasteriseMask(layout: TextLayout): MaskSurface {
  const { canvasW, canvasH, strokeW, scaleFit, placements, runWidth } = layout;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = canvasW;
  maskCanvas.height = canvasH;
  const mCtx = maskCanvas.getContext('2d')!;

  // Scratch canvas per glyph so the concentric inline cuts fuse cleanly at junctions.
  const scratch = document.createElement('canvas');
  scratch.width = Math.ceil(CAP_HEIGHT * SCRATCH_WIDTH);
  scratch.height = canvasH;
  const sCtx = scratch.getContext('2d')!;

  const offsetStartX = (canvasW - runWidth * scaleFit) * 0.5;
  for (const item of placements) {
    if (!item.def) continue;
    sCtx.clearRect(0, 0, scratch.width, scratch.height);
    strokeGlyph({ sCtx, item, strokeW, scaleFit });
    mCtx.drawImage(scratch, offsetStartX + item.x * scaleFit - strokeW * SCRATCH_INSET, 0);
  }
  return { data: mCtx.getImageData(0, 0, canvasW, canvasH).data, width: canvasW, height: canvasH };
}

interface Sweep {
  dist: Float32Array;
  width: number;
  height: number;
  /** +1 sweeps from the top-left, -1 from the bottom-right. */
  direction: 1 | -1;
}

/** One chamfer pass: each inside pixel takes the nearest already-visited neighbour plus the step. */
function sweepChamfer({ dist, width, height, direction }: Sweep): void {
  const yStart = direction === 1 ? 1 : height - 2;
  const xStart = direction === 1 ? 1 : width - 2;
  const inRange = (value: number, limit: number) => (direction === 1 ? value < limit - 1 : value >= 1);
  for (let y = yStart; inRange(y, height); y += direction) {
    for (let x = xStart; inRange(x, width); x += direction) {
      const idx = y * width + x;
      if (dist[idx] <= 0) continue;
      const behind = direction === 1 ? -1 : 1;
      const row = width * behind;
      dist[idx] = Math.min(
        dist[idx],
        dist[idx + behind] + AXIS_STEP,
        dist[idx + row] + AXIS_STEP,
        dist[idx + row + behind] + DIAGONAL_STEP,
        dist[idx + row - behind] + DIAGONAL_STEP
      );
    }
  }
}

interface ChamferRequest {
  mask: MaskSurface;
  strokeW: number;
  scaleFit: number;
}

/** Two-pass chamfer distance from the glyph edge, capped into a 0..1 height for the bevel. */
export function chamferHeights({ mask, strokeW, scaleFit }: ChamferRequest): Float32Array {
  const { data, width, height } = mask;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    dist[i] = data[i * 4 + 3] / 255 > INSIDE_ALPHA ? FAR : 0;
  }
  sweepChamfer({ dist, width, height, direction: 1 });
  sweepChamfer({ dist, width, height, direction: -1 });

  // Cap the heightfield so the bevel is a sharp 45-degree chisel rather than a soft ramp.
  const maxBevel = strokeW * BEVEL_SHARE * scaleFit;
  const heights = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) heights[i] = Math.min(1.0, dist[i] / Math.max(MIN_BEVEL, maxBevel));
  return heights;
}
