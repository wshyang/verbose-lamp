// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

// The canvas needs WebGL, so it is doubled at its module seam. What is under test is the
// stage: what it mounts for each renderer, and the contract its container keeps.
const mounted = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));

vi.mock('@/features/premiere/scene3d/PremiereCanvas', () => ({
  PremiereCanvas: (props: Record<string, unknown>) => {
    mounted.props.push(props);
    return <canvas data-testid="premiere-canvas-double" />;
  },
}));

import { createPremiereStore } from '@/features/premiere/scene3d/premiereStore';
import { CinematicStage } from './CinematicStage';

function stage(overrides: Partial<Parameters<typeof CinematicStage>[0]> = {}) {
  mounted.props.length = 0;
  const mountRef = createRef<HTMLDivElement>();
  const view = render(
    <CinematicStage mountRef={mountRef} cameraMode="cinema" hudHidden={false} {...overrides} />,
  );
  return { ...view, mountRef };
}

describe('CinematicStage container contract', () => {
  it('exposes the stage by test id with an accessible name', () => {
    stage();

    const host = screen.getByTestId('cinematic-stage__canvas');
    expect(host.getAttribute('aria-label')).toBe('Interactive WebGL title sequence');
  });

  it('attaches the mount ref to that element', () => {
    const { mountRef } = stage();

    expect(mountRef.current).toBe(screen.getByTestId('cinematic-stage__canvas'));
  });

  it('shows the grab cursor only while orbiting', () => {
    stage({ cameraMode: 'orbit' });
    expect(screen.getByTestId('cinematic-stage__canvas').className).toContain('cursor-grab');
  });

  it('keeps the default cursor in cinema mode', () => {
    stage({ cameraMode: 'cinema' });
    expect(screen.getByTestId('cinematic-stage__canvas').className).not.toContain('cursor-grab');
  });

  it('hides the corner frame with the HUD', () => {
    const { container } = stage({ hudHidden: true });

    expect(container.querySelector('[aria-hidden="true"]')!.className).toContain('opacity-0');
  });

  it('shows the corner frame when the HUD is visible', () => {
    const { container } = stage({ hudHidden: false });

    expect(container.querySelector('[aria-hidden="true"]')!.className).toContain('opacity-100');
  });
});

describe('CinematicStage renderers', () => {
  it('mounts nothing itself for the imperative manager, which draws into the container', () => {
    stage({ renderer: 'manager', store: null });

    expect(screen.queryByTestId('premiere-canvas-double')).toBeNull();
  });

  it('defaults to the manager', () => {
    stage();

    expect(screen.queryByTestId('premiere-canvas-double')).toBeNull();
  });

  it('mounts the R3F canvas inside the stage container for the port', () => {
    stage({ renderer: 'r3f', store: createPremiereStore() });

    const host = screen.getByTestId('cinematic-stage__canvas');
    expect(host.contains(screen.getByTestId('premiere-canvas-double'))).toBe(true);
  });

  it('hands the canvas the store and the host callbacks', () => {
    const store = createPremiereStore();
    const onSceneTelemetry = vi.fn();
    const onSceneChapterChange = vi.fn();
    const onSceneFrameReady = vi.fn();
    stage({ renderer: 'r3f', store, onSceneTelemetry, onSceneChapterChange, onSceneFrameReady });

    expect(mounted.props[0].store).toBe(store);
    expect(mounted.props[0].onTelemetry).toBe(onSceneTelemetry);
    expect(mounted.props[0].onChapterChange).toBe(onSceneChapterChange);
    expect(mounted.props[0].onFrameReady).toBe(onSceneFrameReady);
  });

  it('mounts nothing for the port until it has a store', () => {
    stage({ renderer: 'r3f', store: null });

    expect(screen.queryByTestId('premiere-canvas-double')).toBeNull();
  });
});
