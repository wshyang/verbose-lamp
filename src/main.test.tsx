// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// main.tsx runs on import, so each case resets the module registry and re-imports it.
const mounted = vi.hoisted(() => ({ render: vi.fn(), createRoot: vi.fn() }));

vi.mock('react-dom/client', () => ({
  createRoot: (...args: unknown[]) => {
    mounted.createRoot(...args);
    return { render: mounted.render };
  },
}));
vi.mock('./App', () => ({ default: () => null }));
vi.mock('./app/fonts', () => ({}));
vi.mock('./index.css', () => ({}));

async function boot() {
  vi.resetModules();
  await import('./main');
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('main', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    mounted.render.mockClear();
    mounted.createRoot.mockClear();
  });
  afterEach(() => Reflect.deleteProperty(document, 'fonts'));

  // Canvas text is baked once from whatever face is loaded when it is drawn, so rendering the app
  // before the faces are ready leaves Georgia in the textures for good.
  it('does not mount while the fonts are still loading', async () => {
    let release: () => void = () => {};
    const ready = new Promise<void>((resolve) => (release = resolve));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } });

    await boot();
    await flush();
    expect(mounted.render).not.toHaveBeenCalled();

    release();
    await flush();
    expect(mounted.render).toHaveBeenCalledTimes(1);
  });

  it('mounts into #root once the fonts are ready', async () => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });

    await boot();
    await flush();

    expect(mounted.createRoot).toHaveBeenCalledWith(document.getElementById('root'));
    expect(mounted.render).toHaveBeenCalledTimes(1);
  });

  it('still mounts when a face fails to load, rather than leaving a blank page', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.reject(new Error('decode failed')) },
    });

    await boot();
    await flush();

    expect(mounted.render).toHaveBeenCalledTimes(1);
  });

  it('mounts at once where the browser has no font loading API', async () => {
    await boot();
    await flush();

    expect(mounted.render).toHaveBeenCalledTimes(1);
  });
});
