import type { GoldRampDefinition, GoldRampId, GoldRampStop } from './types';

function freezeRamp(id: GoldRampId, name: string, stops: readonly GoldRampStop[]): GoldRampDefinition {
  const frozenStops = Object.freeze(stops.map((stop) => Object.freeze({ ...stop })));
  return Object.freeze({ id, name, stops: frozenStops });
}

export const GOLD_RAMPS = Object.freeze({
  bright: freezeRamp('bright', 'Bullion Bright', [
    { position: 0, color: '#2a1a06' },
    { position: 0.18, color: '#8c661c' },
    { position: 0.5, color: '#d4af37' },
    { position: 0.78, color: '#f8e29b' },
    { position: 1, color: '#fff6dc' },
  ]),
  deep: freezeRamp('deep', 'Jazz Age Deep', [
    { position: 0, color: '#130c04' },
    { position: 0.3, color: '#4c3210' },
    { position: 0.56, color: '#8c661c' },
    { position: 0.82, color: '#d4af37' },
    { position: 1, color: '#f8e29b' },
  ]),
  champagne: freezeRamp('champagne', 'Champagne Light', [
    { position: 0, color: '#281b0d' },
    { position: 0.24, color: '#9b6b24' },
    { position: 0.54, color: '#d4af37' },
    { position: 0.8, color: '#fff0bd' },
    { position: 1, color: '#fff6dc' },
  ]),
});

function parseHex(color: string): readonly [number, number, number] {
  const match = /^#?([\da-f]{6})$/i.exec(color);
  if (!match) return [42, 26, 6];
  const hex = match[1];
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

function normalizeStops(stops: readonly GoldRampStop[]): GoldRampStop[] {
  const sorted = stops
    .filter((stop) => Number.isFinite(stop.position))
    .map((stop) => ({ position: Math.min(1, Math.max(0, stop.position)), color: stop.color }))
    .sort((left, right) => left.position - right.position);
  const unique: GoldRampStop[] = [];
  for (const stop of sorted) {
    if (unique.length > 0 && unique[unique.length - 1].position === stop.position) unique[unique.length - 1] = stop;
    else unique.push(stop);
  }
  if (unique.length === 0) return [{ position: 0, color: '#2a1a06' }, { position: 1, color: '#fff6dc' }];
  if (unique[0].position > 0) unique.unshift({ ...unique[0], position: 0 });
  if (unique[unique.length - 1].position < 1) unique.push({ ...unique[unique.length - 1], position: 1 });
  return unique;
}

export function buildGoldRampLut(stops: readonly GoldRampStop[]): Uint8Array {
  const anchors = normalizeStops(stops);
  const parsed = anchors.map((stop) => parseHex(stop.color));
  const lut = new Uint8Array(256 * 3);
  let segment = 0;
  for (let index = 0; index < 256; index += 1) {
    const position = index / 255;
    while (segment < anchors.length - 2 && position > anchors[segment + 1].position) segment += 1;
    const left = anchors[segment];
    const right = anchors[segment + 1];
    const amount = (position - left.position) / Math.max(Number.EPSILON, right.position - left.position);
    for (let channel = 0; channel < 3; channel += 1) {
      lut[index * 3 + channel] = Math.round(parsed[segment][channel] + (parsed[segment + 1][channel] - parsed[segment][channel]) * amount);
    }
  }
  for (const [index, stop] of anchors.entries()) {
    const offset = Math.round(stop.position * 255) * 3;
    lut.set(parseHex(stop.color), offset);
    if (index === anchors.length - 1) break;
  }
  return lut;
}