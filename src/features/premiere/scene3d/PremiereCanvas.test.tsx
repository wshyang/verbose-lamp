// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// <Canvas> needs a real WebGL context, which jsdom does not have, so it is replaced by a
// plain host that records its props and renders its children. What is under test is the
// wrapper: the props it hands the canvas, and how it tracks the box it sits in.
const canvas = vi.hoisted(() => ({
  props: [] as Array<Record<string, unknown>>,
  children: [] as Array<unknown>,
}));

vi.mock('@react-three/fiber', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/fiber')>();
  return {
    ...actual,
    Canvas: (props: Record<string, unknown> & { children?: unknown }) => {
      canvas.props.push(props);
      canvas.children.push(props.children);
      return <div data-testid="canvas-host" />;
    },
  };
});

import { PREMIERE_CANVAS } from './applyRendererLook';
import { PremiereCanvas, hasCoarsePointer } from './PremiereCanvas';
import { createPremiereStore } from './premiereStore';

afterEach(() => {
  canvas.props.length = 0;
  canvas.children.length = 0;
  vi.unstubAllGlobals();
});

function stubPointer(coarse: boolean, touchPoints = 0) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)' ? coarse : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true });
}

describe('hasCoarsePointer', () => {
  it('is false for a mouse', () => {
    stubPointer(false, 0);

    expect(hasCoarsePointer()).toBe(false);
  });

  it('is true when the primary pointer is coarse', () => {
    stubPointer(true, 0);

    expect(hasCoarsePointer()).toBe(true);
  });

  it('is true on a touch device even if the media query disagrees', () => {
    stubPointer(false, 5);

    expect(hasCoarsePointer()).toBe(true);
  });

  it('is false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });

    expect(hasCoarsePointer()).toBe(false);
  });
});

describe('PremiereCanvas', () => {
  it('hands the canvas the shipped lens, renderer and pixel-ratio settings', () => {
    stubPointer(false);
    render(<PremiereCanvas store={createPremiereStore()} />);

    const props = canvas.props[0];
    expect(props.dpr).toEqual(PREMIERE_CANVAS.dpr);
    expect(props.gl).toEqual(PREMIERE_CANVAS.gl);
    expect(props.camera).toEqual(PREMIERE_CANVAS.camera);
    expect(typeof props.onCreated).toBe('function');
  });

  it('wraps the canvas in a test-addressable mount', () => {
    stubPointer(false);
    render(<PremiereCanvas store={createPremiereStore()} />);

    expect(screen.getByTestId('premiere-canvas__mount')).toBeTruthy();
    expect(screen.getByTestId('canvas-host')).toBeTruthy();
  });

  it('passes the class name to the mount', () => {
    stubPointer(false);
    render(<PremiereCanvas store={createPremiereStore()} className="absolute inset-0" />);

    expect(screen.getByTestId('premiere-canvas__mount').className).toBe('absolute inset-0');
  });

  it('applies the renderer look through onCreated', () => {
    stubPointer(false);
    render(<PremiereCanvas store={createPremiereStore()} />);
    const gl = { toneMapping: 0, toneMappingExposure: 1 };
    const scene = { background: null as unknown, fog: null as unknown, add: vi.fn() };
    const camera = {};

    (canvas.props[0].onCreated as (state: unknown) => void)({ gl, scene, camera });

    expect(gl.toneMappingExposure).toBe(1.18);
    expect(scene.add).toHaveBeenCalledWith(camera);
  });

  it('measures the box it sits in and re-measures when it resizes', () => {
    stubPointer(false);
    let notify: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    render(<PremiereCanvas store={createPremiereStore()} />);
    const before = canvas.children.length;
    const mount = screen.getByTestId('premiere-canvas__mount');
    Object.defineProperty(mount, 'clientWidth', { value: 390, configurable: true });
    Object.defineProperty(mount, 'clientHeight', { value: 844, configurable: true });

    act(() => notify());

    expect(canvas.children.length).toBeGreaterThan(before);
  });
});
