export interface FittedLabel {
  text: string;
  size: number;
}

export type MeasureFn = (text: string, size: number) => number;

/** Shrink-to-fit with a floor, then ellipsis. Measure function injected. */
export function fitLabel(
  text: string,
  maxWidth: number,
  baseSize: number,
  minSize: number,
  measure: MeasureFn,
): FittedLabel {
  let size = baseSize;
  while (size > minSize && measure(text, size) > maxWidth) size *= 0.92;
  size = Math.max(minSize, size);
  if (measure(text, size) <= maxWidth) return { text, size };
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}…`, size };
}