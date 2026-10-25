/**
 * SVG/PNG export helpers, shared by every feature that hands the user a drawing (the golden
 * QR code, the Deco Lattice frames). `toSafeFileStem` is pure and tested; the download
 * functions are thin DOM wrappers that hold no logic beyond serialisation. Failures reject
 * with a message a UI can show, because a silent no-op reads as a broken button.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_PNG_SIZE = 1024;
const DEFAULT_STEM = 'download';
const BACKGROUND = '#050406';

export function toSafeFileStem(label: string, fallback = DEFAULT_STEM): string {
  const stem = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return stem.length > 0 ? stem : fallback;
}

export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // The serializer emits `xmlns` itself for any element that has the SVG namespace, including
  // one parsed out of an HTML string. Setting the attribute by hand would duplicate it, which
  // is invalid XML, so the markup is checked instead. Only an element with no namespace at all
  // (`createElementNS(null, 'svg')`) comes out bare and needs it added.
  const markup = new XMLSerializer().serializeToString(clone);
  const namespaced = markup.includes('xmlns=')
    ? markup
    : markup.replace(/^<svg/, `<svg xmlns="${SVG_NS}"`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${namespaced}`;
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
    image.onerror = () => reject(new Error('Could not rasterise the image.'));
    image.src = url;
  });
}

function paintToCanvas(image: HTMLImageElement, pixelSize: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');
  context.fillStyle = BACKGROUND;
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
    if (!png) throw new Error('The browser could not produce a PNG.');
    triggerDownload(png, `${stem}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
