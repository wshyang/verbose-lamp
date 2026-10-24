import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

/**
 * Times MODNET end to end in a real Chromium on WebAssembly and on WebGPU, for one image.
 * Measures what a participant waits for: the first call (model download and session start
 * included) and then warm calls (the model already loaded).
 *
 *     npm run dev:web
 *     npx tsx apps/web/scripts/cutout-timing.ts --file ~/Downloads/captured-frame.png --runs 5
 *     npx tsx apps/web/scripts/cutout-timing.ts --file ~/Downloads/captured-frame.png --headed
 *
 * `--headed` opens an installed Google Chrome window instead of Playwright's headless Chromium. Use
 * it for the WebGPU number: headless Chromium usually gets a software adapter (SwiftShader), which
 * runs "WebGPU" on the CPU and says nothing about a real GPU. The adapter is printed so you can tell.
 *
 * `segmentPhoto.ts` only runs WebAssembly now (ADR-221), so the WebGPU leg calls Transformers.js
 * directly with the same model and the same input; it is a measurement, not a code path the app takes.
 */

const BASE = 'http://127.0.0.1:5173';
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';

function argument(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}

interface AdapterLike {
  info?: Record<string, string>;
  isFallbackAdapter?: boolean;
  requestAdapterInfo?: () => Promise<Record<string, string>>;
}

interface GpuLike {
  requestAdapter: () => Promise<AdapterLike | null>;
}

interface PlaneLike {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channels?: number;
}

interface TransformersLike {
  pipeline: (task: string, model: string, options: object) => Promise<(image: unknown) => Promise<unknown>>;
  RawImage: new (data: Uint8ClampedArray, width: number, height: number, channels: number) => unknown;
}

interface Timing {
  device: string;
  adapter: string;
  coldMs: number;
  warmMs: number[];
  faceAlphaMean: number;
}

async function timeDevice(
  file: Buffer,
  device: 'wasm' | 'webgpu',
  options: { runs: number; headed: boolean },
): Promise<Timing> {
  const { runs, headed } = options;
  const browser = await chromium.launch({
    args: ['--enable-unsafe-webgpu'],
    ...(headed ? { headless: false, channel: 'chrome' } : {}),
  });
  const page = await browser.newPage();
  await page.route('**/corpus/timing-image.png', (route) => route.fulfill({ contentType: 'image/png', body: file }));
  await page.goto(`${BASE}/cutout-hook.html`);
  const result = await page.evaluate(
    async ({ url, device, runs }) => {
      const { pipeline, RawImage } = (await import(/* @vite-ignore */ url)) as TransformersLike;
      const gpu = (navigator as { gpu?: GpuLike }).gpu;
      const found = gpu ? await gpu.requestAdapter().catch(() => null) : null;
      const info = found?.info ?? (found?.requestAdapterInfo ? await found.requestAdapterInfo() : null);
      const adapter = info
        ? [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' / ') +
          (found.isFallbackAdapter ? ' [FALLBACK = software]' : '')
        : gpu ? 'no adapter' : 'navigator.gpu absent';
      const blob = await (await fetch('/corpus/timing-image.png')).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const image = new RawImage(pixels, canvas.width, canvas.height, 4);

      const started = performance.now();
      const segment = await pipeline('background-removal', 'Xenova/modnet', { device });
      let output = await segment(image);
      const coldMs = performance.now() - started;

      const warmMs: number[] = [];
      for (let run = 0; run < runs; run += 1) {
        const t = performance.now();
        output = await segment(image);
        warmMs.push(performance.now() - t);
      }
      const plane = (Array.isArray(output) ? output[0] : output) as PlaneLike;
      const channels = plane.channels ?? 4;
      let total = 0;
      let count = 0;
      for (let y = Math.round(plane.height * 0.3); y < plane.height * 0.85; y += 1) {
        for (let x = Math.round(plane.width * 0.32); x < plane.width * 0.75; x += 1) {
          total += plane.data[(y * plane.width + x) * channels + channels - 1];
          count += 1;
        }
      }
      return { adapter, coldMs, warmMs, faceAlphaMean: total / count };
    },
    { url: TRANSFORMERS, device, runs },
  );
  await browser.close();
  return { device, ...result };
}

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

async function main(): Promise<void> {
  const path = argument('--file');
  if (path === undefined) {
    console.error('usage: cutout-timing.ts --file <image.png> [--runs 5]');
    process.exit(2);
  }
  const runs = Number(argument('--runs') ?? '5');
  const headed = process.argv.includes('--headed');
  const file = readFileSync(path);
  console.log(`\n${path}  (${runs} warm runs per device; ${headed ? 'headed Chrome' : 'headless Chromium'}, ${process.platform})\n`);
  for (const device of ['wasm', 'webgpu'] as const) {
    try {
      const t = await timeDevice(file, device, { runs, headed });
      console.log(
        `${device.padEnd(7)} cold ${t.coldMs.toFixed(0).padStart(6)} ms   warm median ${median(t.warmMs).toFixed(0).padStart(5)} ms` +
          `   (min ${Math.min(...t.warmMs).toFixed(0)}, max ${Math.max(...t.warmMs).toFixed(0)})   mean face alpha ${t.faceAlphaMean.toFixed(1)}`,
      );
      console.log(`        adapter: ${t.adapter}`);
    } catch (error) {
      console.log(`${device.padEnd(7)} failed: ${String(error).slice(0, 160)}`);
    }
  }
  console.log('');
}

void main().catch((error: unknown) => {
  console.error(String(error));
  process.exit(2);
});
