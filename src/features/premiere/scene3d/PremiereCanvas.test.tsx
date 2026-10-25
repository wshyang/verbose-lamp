// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { setupDomTests } from '@/test/dom';
import { resolveViewportFit } from '../scene/responsiveLayout';
import { createPremiereStore } from './premiereStore';
import { PremiereCanvas, hasCoarsePointer } from './PremiereCanvas';

setupDomTests();

/**
 * The canvas without a WebGL context (ADDENDUM-022 §7). R3F's `Canvas` is replaced by a
 * div and `useThree` by a fixed camera, which leaves exactly the part that belongs to this
 * file: the mount div, the size measurement, the renderer look on creation, and the camera
 * aspect that follows the measurement.
 */
const harness = vi.hoisted(() => ({
  looks: [] as Array<{ camera: unknown }>,
  scenes: [] as Array<Record<string, unknown>>,
  observers: [] as Array<{ callback: () => void; disconnect: ReturnType<typeof vi.fn> }>,
  camera: null as unknown,
  setCamera: (camera: unknown) => {
    harness.camera = camera;
  },
}));

vi.mock('@react-three/fiber', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/fiber')>();
  const THREE = await import('three');
  const React = await import('react');
  return {
    ...actual,
    Canvas: ({
      children,
      onCreated,
    }: {
      children?: React.ReactNode;
      onCreated?: (state: { camera: unknown; gl: unknown; scene: unknown }) => void;
    }) => {
      // A real canvas creates its renderer once, so the mock does too.
      const created = React.useRef(false);
      React.useEffect(() => {
        if (created.current) return;
        created.current = true;
        onCreated?.({ camera: harness.camera ?? new THREE.PerspectiveCamera(), gl: {}, scene: {} });
      }, []);
      return <div data-testid="r3f-canvas">{children}</div>;
    },
    useThree: (selector: (state: { camera: unknown }) => unknown) => {
      if (!harness.camera) harness.camera = new THREE.PerspectiveCamera();
      return selector({ camera: harness.camera });
    },
  };
});

vi.mock('./PremiereScene', () => ({
  PremiereScene: (props: Record<string, unknown>) => {
    harness.scenes.push(props);
    return null;
  },
}));

vi.mock('./applyRendererLook', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./applyRendererLook')>();
  return {
    ...actual,
    applyRendererLook: (state: { camera: unknown }) => {
      harness.looks.push(state);
    },
  };
});

afterEach(() => {
  harness.looks.length = 0;
  harness.scenes.length = 0;
  harness.observers.length = 0;
  vi.restoreAllMocks();
});

function installResizeObserver() {
  class FakeResizeObserver {
    callback: () => void;
    disconnect = vi.fn();
    observe = vi.fn();
    unobserve = vi.fn();
    constructor(callback: () => void) {
      this.callback = callback;
      harness.observers.push(this as unknown as (typeof harness.observers)[number]);
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  return () => vi.unstubAllGlobals();
}

describe('hasCoarsePointer', () => {
  it('is false when there is no window or no matchMedia', () => {
    const original = window.matchMedia;
    // @ts-expect-error — the point of the case is a browser without matchMedia.
    window.matchMedia = undefined;
    expect(hasCoarsePointer()).toBe(false);
    window.matchMedia = original;
  });

  it('reads a coarse pointer or a touch screen', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    expect(hasCoarsePointer()).toBe(true);

    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 2, configurable: true });
    expect(hasCoarsePointer()).toBe(true);
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
  });
});

describe('PremiereCanvas', () => {
  it('renders the mount div and hands the scene the measured fit', () => {
    const restore = installResizeObserver();
    const store = createPremiereStore();
    const { getByTestId } = render(<PremiereCanvas store={store} className="stage" />);

    const mount = getByTestId('premiere-canvas__mount');
    expect(mount.className).toBe('stage');

    const fit = harness.scenes[harness.scenes.length - 1].fit as { aspect: number };
    expect(fit.aspect).toBeCloseTo(resolveViewportFit(1, 1, false).aspect, 9);
    restore();
  });

  it('applies the renderer look when the canvas is created', () => {
    const restore = installResizeObserver();
    render(<PremiereCanvas store={createPremiereStore()} />);

    expect(harness.looks).toHaveLength(1);
    restore();
  });

  it('measures the mount div and keeps the camera aspect in step', async () => {
    const restore = installResizeObserver();
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
    const camera = new THREE.PerspectiveCamera();
    harness.camera = camera;

    render(<PremiereCanvas store={createPremiereStore()} />);

    expect((harness.scenes[harness.scenes.length - 1].fit as { aspect: number }).aspect).toBeCloseTo(2, 9);
    expect(camera.aspect).toBeCloseTo(2, 9);

    // A resize runs the same measurement again.
    width.mockReturnValue(400);
    await act(async () => {
      harness.observers[0].callback();
    });

    expect((harness.scenes[harness.scenes.length - 1].fit as { aspect: number }).aspect).toBeCloseTo(
      1,
      9
    );
    expect(camera.aspect).toBeCloseTo(1, 9);
    width.mockRestore();
    restore();
  });

  it('disconnects the observer and copes with a browser that has none', () => {
    const restore = installResizeObserver();
    const { unmount } = render(<PremiereCanvas store={createPremiereStore()} />);
    unmount();
    expect(harness.observers[0].disconnect).toHaveBeenCalledTimes(1);
    restore();

    vi.stubGlobal('ResizeObserver', undefined);
    const store = createPremiereStore();
    const { getByTestId } = render(<PremiereCanvas store={store} />);
    expect(getByTestId('premiere-canvas__mount')).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
