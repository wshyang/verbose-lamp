import { BallroomEnvironment } from './BallroomEnvironment';
import { CinemaComposer } from './CinemaComposer';
import type { PremiereStoreApi } from './premiereStore';
import { PremiereStage } from './PremiereStage';
import type { PlaybackTelemetry } from '../scene/sceneApi';

export interface SceneCallbacks {
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
  onFrameReady?: () => void;
}

interface PremiereSceneProps extends SceneCallbacks {
  store: PremiereStoreApi;
}

/**
 * The whole sequence as a React scene graph (ADDENDUM-022 §2.3). One concern per
 * child; this file only composes them. The stage holds everything that can be built
 * without a GPU (and is therefore what the headless scene tests mount); the
 * environment and the post chain need real WebGL and sit on top (ADDENDUM-029 §2).
 */
export function PremiereScene({ store, ...callbacks }: PremiereSceneProps) {
  return (
    <>
      <PremiereStage store={store} {...callbacks} />
      <BallroomEnvironment />
      <CinemaComposer store={store} />
    </>
  );
}
