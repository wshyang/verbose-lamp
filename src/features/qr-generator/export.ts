/**
 * Thin DOM download wrappers; intentionally no logic beyond serialisation.
 * The pure filename stemming lives in `fileStem.ts` (ADDENDUM-029) and is
 * re-exported here for compatibility.
 */
export { toSafeFileStem } from './fileStem';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_PNG_SIZE = 1024;

export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', SVG_NS);
  const markup = new XMLSerializer().serializeToString(clone);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvgElement(svg: SVGSVGElement, stem: string): void {
  const blob = new Blob([serializeSvg(svg)], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, `${stem}.svg`);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not rasterise the code.'));
    image.src = url;
  });
}

function paintToCanvas(image: HTMLImageElement, pixelSize: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');
  context.fillStyle = '#050406';
  context.fillRect(0, 0, pixelSize, pixelSize);
  context.drawImage(image, 0, 0, pixelSize, pixelSize);
  return canvas;
}

export async function downloadSvgAsPng(
  svg: SVGSVGElement,
  stem: string,
  pixelSize = DEFAULT_PNG_SIZE
): Promise<void> {
  const svgBlob = new Blob([serializeSvg(svg)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = await loadImage(url);
    const canvas = paintToCanvas(image, pixelSize);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (png) triggerDownload(png, `${stem}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
