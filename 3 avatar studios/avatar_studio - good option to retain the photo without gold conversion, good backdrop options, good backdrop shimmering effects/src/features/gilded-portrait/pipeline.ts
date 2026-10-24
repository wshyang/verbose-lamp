import { buildCurveLut, buildFoldLut } from './curve';
import { buildGoldRampLut, GOLD_RAMPS } from './goldRamp';
import { buildShapeMask, chokeMask } from './mask';
import { applyClarity, applyLevels, toLuminance } from './tone';
import type { GildingParams, LevelsSettings, RgbaImage } from './types';

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function resolveLevels(amount: number): LevelsSettings {
  const strength = clampUnit(amount / 100);
  return {
    blackPoint: strength * 0.12,
    whitePoint: 1 - strength * 0.035,
    gamma: 1 - strength * 0.22,
  };
}

export function buildGildingToneLut(params: GildingParams): Uint8Array {
  const baseValues = Float32Array.from({ length: 256 }, (_, index) => index / 255);
  const leveled = applyLevels(baseValues, resolveLevels(params.levels));
  const curve = buildCurveLut(params.curvePoints);
  const folds = buildFoldLut(params.folds);
  return Uint8Array.from(leveled, (value) => folds[curve[Math.round(clampUnit(value) * 255)]]);
}

function assertImageShape(image: RgbaImage): void {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0) {
    throw new RangeError('Image dimensions must be positive integers.');
  }
  if (image.data.length !== image.width * image.height * 4) {
    throw new RangeError('Image buffer size does not match its dimensions.');
  }
}

export function gildImage(image: RgbaImage, params: GildingParams): RgbaImage {
  assertImageShape(image);
  const { width, height } = image;
  const luminance = toLuminance(image);
  const detailed = applyClarity(luminance, {
    width,
    height,
    radius: params.clarityRadius,
    amount: params.clarity,
  });
  const tone = buildGildingToneLut(params);
  const ramp = buildGoldRampLut(GOLD_RAMPS[params.rampId].stops);
  const shapeMask = buildShapeMask({ width, height, ...params.mask });
  const mask = chokeMask(shapeMask, params.mask.choke);
  const output = new Uint8ClampedArray(image.data.length);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const toneIndex = tone[Math.round(clampUnit(detailed[pixel]) * 255)] * 3;
    const imageOffset = pixel * 4;
    output[imageOffset] = ramp[toneIndex];
    output[imageOffset + 1] = ramp[toneIndex + 1];
    output[imageOffset + 2] = ramp[toneIndex + 2];
    output[imageOffset + 3] = Math.round(image.data[imageOffset + 3] * mask.data[pixel] / 255);
  }
  return { width, height, data: output };
}