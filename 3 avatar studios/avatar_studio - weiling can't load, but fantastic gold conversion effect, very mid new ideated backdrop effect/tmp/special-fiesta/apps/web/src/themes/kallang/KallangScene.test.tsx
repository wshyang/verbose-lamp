import { act, cleanup, render } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KallangScene } from './KallangScene.js';
import { STADIUM_OPENING_X, WORLD_HEIGHT, WORLD_WIDTH } from './engine/scene.js';

/*
 * The stage crop lives in the stylesheet and jsdom applies none of it, so the
 * CSS is asserted on directly, read from disk (the Sentosa test's idiom).
 */
function readSource(relative: string): string {
  const path = [`src/${relative}`, `apps/web/src/${relative}`]
    .map((candidate) => resolve(process.cwd(), candidate))
    .find((candidate) => existsSync(candidate));
  return readFileSync(String(path), 'utf8');
}

/** ADR-301 / ADR-306 — the Kallang backdrop: the plate and its ported canvas engine. */

const scene = (): HTMLElement =>
  document.querySelector<HTMLElement>('[data-testid="kallang-scene"]') as HTMLElement;

describe('the Kallang backdrop (ADR-301, ADR-306)', () => {
  afterEach(() => {
    cleanup();
  });

  it('is decoration: hidden from assistive tech, in the shared strip box', () => {
    render(<KallangScene />);

    expect(scene().getAttribute('aria-hidden')).toBe('true');
    expect(scene().className).toContain('gb-scene');
    expect(scene().className).toContain('venue-scene--kallang');
  });

  it('renders the world on a stage holding one canvas at world resolution', () => {
    render(<KallangScene />);

    const stage = scene().querySelector('.kallang-stage');
    expect(stage).not.toBeNull();
    const canvas = stage?.querySelector<HTMLCanvasElement>('canvas.kallang-canvas');
    expect(canvas).not.toBeNull();
    // The engine draws the full 2752 x 1536 world; the stage crops it (ADR-303).
    expect(canvas?.width).toBe(WORLD_WIDTH);
    expect(canvas?.height).toBe(WORLD_HEIGHT);
    expect(canvas?.dataset['testid']).toBe('kallang-canvas');
  });

  it('leaves the drawing to the engine: no CSS layer stack remains', () => {
    render(<KallangScene />);

    expect(scene().querySelectorAll('.kallang-layer')).toHaveLength(0);
    expect(scene().querySelectorAll('img')).toHaveLength(0);
  });

  it('centres the stadium only below the aspect where centring still covers the left edge', () => {
    const css = readSource('themes/kallang/scene.css');
    const media = /@media \(max-aspect-ratio: (\d+)\/(\d+)\)/.exec(css);

    // ADR-309 — the breakpoint is where `left:50%` + `translateX(-27.25%)` puts
    // the stage's left edge exactly at 0: viewport aspect = 2·750/1536. Centring
    // at any wider aspect (the old 2752/1536) dragged the left edge on-screen
    // and showed plain sky; below the breakpoint the source's computeSceneView
    // clamp (`x = max(0, focus − width/2)`) is what left:0 already gives.
    expect(media).not.toBeNull();
    expect(Number(media?.[1]) / Number(media?.[2])).toBeCloseTo(
      (2 * STADIUM_OPENING_X) / WORLD_HEIGHT,
      4,
    );
    expect(css).not.toContain('max-aspect-ratio: 2752/1536');
  });
});

class MockImage {
  static failWhen: ((src: string) => boolean) | undefined;
  onload: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  width = 120;
  height = 80;
  #src = '';

  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => {
      if (MockImage.failWhen?.(this.#src) === true) this.onerror?.(new Event('error'));
      else this.onload?.();
    });
  }

  get src(): string {
    return this.#src;
  }
}

function fakeContext() {
  return {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
  };
}

async function flushSceneLoad(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

describe('the Kallang canvas engine lifecycle (ADR-306)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    MockImage.failWhen = undefined;
  });

  function stubBrowser(reducedMotion: boolean) {
    const ctx = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    vi.stubGlobal('Image', MockImage);
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: reducedMotion,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    let frame: FrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 42;
    });
    const cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    return { ctx, requestFrame, cancelFrame, frame: () => frame };
  }

  it('loads the plate and population, then advances the scene clock until unmount', async () => {
    const browser = stubBrowser(false);
    const view = render(<KallangScene />);
    await flushSceneLoad();

    expect(browser.ctx.drawImage.mock.calls).toHaveLength(1);
    expect(browser.requestFrame).toHaveBeenCalled();
    const beforeTick = browser.ctx.drawImage.mock.calls.length;
    browser.frame()?.(performance.now() + 16);
    expect(browser.ctx.drawImage.mock.calls.length).toBeGreaterThan(100);
    expect(browser.ctx.drawImage.mock.calls.length).toBeGreaterThan(beforeTick);

    view.unmount();
    expect(browser.cancelFrame).toHaveBeenCalledWith(42);
    const afterUnmount = browser.ctx.drawImage.mock.calls.length;
    browser.frame()?.(performance.now() + 32);
    expect(browser.ctx.drawImage.mock.calls).toHaveLength(afterUnmount);
  });

  it('draws one still frame and starts no clock under reduced motion', async () => {
    const browser = stubBrowser(true);
    render(<KallangScene />);
    await flushSceneLoad();

    expect(browser.ctx.drawImage.mock.calls.length).toBeGreaterThan(100);
    expect(browser.requestFrame).not.toHaveBeenCalled();
  });

  it('leaves the sky composed when the plate cannot load', async () => {
    MockImage.failWhen = (src) => src.includes('backdrop-day.jpg');
    const browser = stubBrowser(false);
    render(<KallangScene />);
    await flushSceneLoad();

    expect(browser.ctx.drawImage).not.toHaveBeenCalled();
    expect(browser.requestFrame).not.toHaveBeenCalled();
  });

  it('leaves the plate composed when a sprite cannot load', async () => {
    MockImage.failWhen = (src) => src.includes('cloud-16.png');
    const browser = stubBrowser(false);
    render(<KallangScene />);
    await flushSceneLoad();

    expect(browser.ctx.drawImage.mock.calls).toHaveLength(1);
    expect(browser.requestFrame).not.toHaveBeenCalled();
  });
});
