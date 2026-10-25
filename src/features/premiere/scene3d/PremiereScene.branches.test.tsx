// @vitest-environment jsdom
import 'vitest-canvas-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { PremiereScene } from './PremiereScene';
import { createPremiereStore } from './premiereStore';

const full = vi.hoisted(() => ({ ballroom: 0, composer: 0, matches: false }));

vi.mock('./BallroomEnvironment', () => ({
  BallroomEnvironment: () => { full.ballroom += 1; return null; },
}));
vi.mock('./CinemaComposer', () => ({
  CinemaComposer: () => { full.composer += 1; return null; },
}));

function setPointer(matches: boolean, touches: number) {
  full.matches = matches;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: full.matches })),
  });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: touches });
}

beforeEach(() => {
  full.ballroom = 0;
  full.composer = 0;
});

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('PremiereScene full/coarse-pointer branches', () => {
  it('defaults to full and treats a coarse media query as touch', async () => {
    setPointer(true, 0);
    const store = createPremiereStore({ freezeAt: 1 });
    const renderer = await ReactThreeTestRenderer.create(<PremiereScene store={store} />);
    expect(full.ballroom).toBeGreaterThan(0);
    expect(full.composer).toBeGreaterThan(0);
    await renderer.unmount();
  });

  it('treats touch points as coarse even when media does not match', async () => {
    setPointer(false, 2);
    const store = createPremiereStore({ freezeAt: 1 });
    const renderer = await ReactThreeTestRenderer.create(
      <PremiereScene store={store} variant="core" />, { width: 500, height: 800 }
    );
    expect(full.ballroom).toBe(0);
    await renderer.unmount();
  });

  it('treats no coarse media and no touch points as a fine pointer', async () => {
    setPointer(false, 0);
    const store = createPremiereStore({ freezeAt: 1 });
    const renderer = await ReactThreeTestRenderer.create(
      <PremiereScene store={store} variant="core" />
    );
    expect(full.composer).toBe(0);
    await renderer.unmount();
  });
});
