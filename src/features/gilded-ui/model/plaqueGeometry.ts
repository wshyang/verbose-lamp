/** Pure chamfer path data for Deco plaques — snapshot-tested, no pixels. */
export function chamferPlaque(w: number, h: number, c: number): string {
  return [
    `M${c} 0`, `L${w - c} 0`, `L${w} ${c}`, `L${w} ${h - c}`,
    `L${w - c} ${h}`, `L${c} ${h}`, `L0 ${h - c}`, `L0 ${c}`, 'Z',
  ].join(' ');
}

export interface PinstripeSpec {
  w: number;
  h: number;
  chamfer: number;
  inset: number;
}

export function plaquePinstripe(spec: PinstripeSpec): string {
  const { w, h, chamfer: c, inset } = spec;
  return chamferPlaque(w - inset * 2, h - inset * 2, Math.max(1, c - inset))
    .replace(/^M/, `M`) // path is relative to its own origin
    .trim();
}