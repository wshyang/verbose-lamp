/**
 * Measures how close the React Three Fiber scene is to the classic renderer
 * (ADDENDUM-045). Both are painted from the same frozen frame and compared pixel
 * by pixel in the browser; nothing is judged by eye.
 *
 *   node scripts/compare-renderers.mjs [baseUrl]
 *
 * `baseUrl` defaults to the dev server the Playwright config expects. The pair of
 * captures is written to /tmp/renderer-parity so a human can look at the ones with
 * the highest difference.
 *
 * This is a *comparison* tool, not a gate: the two renderers legitimately differ in
 * dust-mote phase, because the dust field advances with the clock rather than with
 * the film. What it proves is that geometry, materials, lighting and camera agree to
 * within a couple of 8-bit steps, which is the claim ADDENDUM-022 §2.5 asked for.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';

const { chromium: playwright } = await import('playwright-core');
const { default: sandboxChromium } = await import('@sparticuz/chromium');

/** Frames spread across all five acts, including one mid-hold and one finale. */
const FRAMES = [1.0, 4.32, 11.28, 24.82, 33.8];
const VIEWPORT = { width: 960, height: 600 };
const OUT_DIR = '/tmp/renderer-parity';
const READY = '[data-testid="cinematic-stage__canvas"]';

const baseUrl = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (await sandboxChromium.executablePath());
const browser = await playwright.launch({
  executablePath,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  headless: true,
});

async function capture(freezeAt, label) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(`${baseUrl}/?${label === 'classic' ? 'renderer=classic&' : ''}freezeAt=${freezeAt}`);
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.dataset.frameReady === 'true',
    READY,
    { timeout: 180_000 }
  );
  await page.keyboard.press('h');
  await page.waitForTimeout(1200);
  const png = await page.screenshot({ timeout: 240_000 });
  await page.close();
  return png;
}

/**
 * Decodes a PNG into RGBA bytes. Node has the inflate; the only missing piece is the
 * per-scanline filter, which is four short cases. Doing it here rather than in the
 * browser keeps the two full frames out of a renderer process that is already
 * software-rasterising a WebGL scene (an in-page diff crashed the tab).
 */
function decodePng(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const chunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
    } else if (type === 'IDAT') {
      chunks.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`unsupported colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const current = Buffer.from(line);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) current[x] = (current[x] + left) & 0xff;
      else if (filter === 2) current[x] = (current[x] + up) & 0xff;
      else if (filter === 3) current[x] = (current[x] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        const nearest = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
        current[x] = (current[x] + nearest) & 0xff;
      }
    }
    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      out[to] = current[from];
      out[to + 1] = current[from + 1];
      out[to + 2] = current[from + 2];
      out[to + 3] = channels === 4 ? current[from + 3] : 255;
    }
    previous = current;
  }
  return { width, height, data: out };
}

/** Mean absolute difference per channel, plus the share of clearly-changed pixels. */
export function compareFrames(left, right) {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error('frames differ in size');
  }
  let total = 0;
  let outliers = 0;
  const count = left.width * left.height;
  for (let i = 0; i < left.data.length; i += 4) {
    const delta =
      (Math.abs(left.data[i] - right.data[i]) +
        Math.abs(left.data[i + 1] - right.data[i + 1]) +
        Math.abs(left.data[i + 2] - right.data[i + 2])) /
      3;
    total += delta;
    if (delta > 24) outliers += 1;
  }
  return {
    meanAbsDiff: Number((total / count).toFixed(2)),
    outlierRatio: Number((outliers / count).toFixed(4)),
    width: left.width,
    height: left.height,
  };
}

mkdirSync(OUT_DIR, { recursive: true });
const rows = [];
for (const freezeAt of FRAMES) {
  const react = await capture(freezeAt, 'r3f');
  const classic = await capture(freezeAt, 'classic');
  writeFileSync(`${OUT_DIR}/r3f-${freezeAt}.png`, react);
  writeFileSync(`${OUT_DIR}/classic-${freezeAt}.png`, classic);
  const measured = compareFrames(decodePng(react), decodePng(classic));
  rows.push({ freezeAt, ...measured });
  console.log(`${freezeAt}s mean ${measured.meanAbsDiff}/255, outliers ${measured.outlierRatio}`);
}

writeFileSync(`${OUT_DIR}/report.json`, JSON.stringify(rows, null, 2));
await browser.close();

const worst = rows.reduce((a, b) => (b.meanAbsDiff > a.meanAbsDiff ? b : a));
console.log(
  `\nworst frame ${worst.freezeAt}s: mean ${worst.meanAbsDiff}/255, ` +
    `${(worst.outlierRatio * 100).toFixed(2)}% of pixels differ by >24/255`
);
console.log(`captures and report.json in ${OUT_DIR}`);
