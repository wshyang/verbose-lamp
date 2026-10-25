import * as THREE from 'three';
import type { DecoTextOptions } from '../../model/decoText';
import type { MaskSurface } from './mask';

const BEVEL_STRENGTH = 3.8;
const OPAQUE = 255;

export interface FaceMaps {
  colorTex: THREE.CanvasTexture;
  normalTex: THREE.DataTexture;
}

/** Crest tint for the champagne-and-platinum finish: warm at the bevel edge, cool on the crest. */
function platinumGold(height: number): [number, number, number] {
  const crest = Math.min(1, Math.max(0, (height - 0.22) / 0.55));
  return [
    Math.round(238 * (1 - crest) + 247 * crest),
    Math.round(196 * (1 - crest) + 246 * crest),
    Math.round(108 * (1 - crest) + 249 * crest),
  ];
}

/** Plain 24k champagne gold, brightening with the height of the bevel. */
function pureGold(height: number): [number, number, number] {
  const crest = Math.min(1, Math.max(0, height));
  return [Math.round(215 + crest * 40), Math.round(166 + crest * 58), Math.round(58 + crest * 78)];
}

interface FaceRequest {
  mask: MaskSurface;
  heights: Float32Array;
  finish: DecoTextOptions['finish'];
}

/** Builds the albedo/alpha canvas and the chisel normal map from the bevel heightfield. */
export function buildFaceMaps({ mask, heights, finish }: FaceRequest): FaceMaps {
  const { width, height, data } = mask;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const cCtx = colorCanvas.getContext('2d')!;
  const image = cCtx.createImageData(width, height);
  const normalBytes = new Uint8Array(width * height * 4);
  const tint = finish === 'platinum-gold' ? platinumGold : pureGold;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const xm = Math.max(0, x - 1);
      const xp = Math.min(width - 1, x + 1);
      const ym = Math.max(0, y - 1);
      const yp = Math.min(height - 1, y + 1);
      const dx = (heights[y * width + xp] - heights[y * width + xm]) * BEVEL_STRENGTH;
      const dy = (heights[yp * width + x] - heights[ym * width + x]) * BEVEL_STRENGTH;

      const nx = -dx;
      const ny = dy;
      const nz = 1.0;
      const inv = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      normalBytes[idx * 4] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      normalBytes[idx * 4 + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      normalBytes[idx * 4 + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      normalBytes[idx * 4 + 3] = OPAQUE;

      const [r, g, b] = tint(heights[idx]);
      image.data[idx * 4] = r;
      image.data[idx * 4 + 1] = g;
      image.data[idx * 4 + 2] = b;
      image.data[idx * 4 + 3] = data[idx * 4 + 3];
    }
  }
  cCtx.putImageData(image, 0, 0);

  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.anisotropy = 8;
  const normalTex = new THREE.DataTexture(normalBytes, width, height, THREE.RGBAFormat);
  normalTex.flipY = true;
  normalTex.needsUpdate = true;
  return { colorTex, normalTex };
}
