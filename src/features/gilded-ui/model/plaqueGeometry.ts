/** Pure chamfer path data for Deco plaques — snapshot-tested, no pixels. */
export function chamferPlaque(w: number, h: number, c: number): string {
  return [
    `M${c} 0`, `L${w - c} 0`, `L${w} ${c}`, `L${w} ${h - c}`,
    `L${w - c} ${h}`, `L${c} ${h}`, `L0 ${h - c}`, `L0 ${c}`, 'Z',
  ].join(' ');
}

export function plaquePinstripe(w: number, h: number, c: number, inset: number): string {
  return chamferPlaque(w - inset * 2, h - inset * 2, Math.max(1, c - inset))
    .replace(/^M/, `M`) // path is relative to its own origin
    .trim();
}