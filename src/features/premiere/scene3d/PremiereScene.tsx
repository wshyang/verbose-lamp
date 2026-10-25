import type { ReactNode } from 'react';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import type { PlaybackTelemetry } from '../scene/sceneApi';
import type { ViewportFit } from '../scene/responsiveLayout';
import { Backdrop } from './Backdrop';
import { CinemaCamera } from './CinemaCamera';
import { GoldDust } from './GoldDust';
import { GreenLight } from './GreenLight';
import { LightingRig } from './LightingRig';
import { PlaybackClock } from './PlaybackClock';
import type { PremiereStoreApi } from './premiereStore';
import { ScreenBorder } from './ScreenBorder';
import { TitleCard } from './TitleCard';

export interface PremiereSceneProps {
  store: PremiereStoreApi;
  fit: ViewportFit;
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
  onFrameReady?: () => void;
  /**
   * GPU-dependent pieces (the image-based lighting bake, the post pipeline) come in as
   * slots, so the scene itself mounts and tests without a GPU. `environment` renders before
   * everything else; `composer` renders last, so it draws the frame the others just posed.
   */
  environment?: ReactNode;
  composer?: ReactNode;
}

/**
 * The whole premiere, composed (ADDENDUM-022 §2.3). One concern per child, all reading the
 * same store. Order matters, because frame callbacks run in mount order within a priority:
 * the clock first (it has its own priority), then the world, then the cards, then the
 * camera, then the proscenium, and the composer last.
 */
export function PremiereScene({
  store,
  fit,
  onTelemetry,
  onChapterChange,
  onFrameReady,
  environment,
  composer,
}: PremiereSceneProps) {
  return (
    <>
      <PlaybackClock
        store={store}
        onTelemetry={onTelemetry}
        onChapterChange={onChapterChange}
        onFrameReady={onFrameReady}
      />
      {environment}
      <LightingRig store={store} />
      <Backdrop store={store} />
      <GreenLight store={store} />
      <GoldDust store={store} />
      {SEQUENCE_CHAPTERS.map((chapter, index) => (
        <TitleCard key={chapter.id} store={store} index={index} cardScale={fit.cardScale} />
      ))}
      <CinemaCamera store={store} fit={fit} />
      <ScreenBorder store={store} />
      {composer}
    </>
  );
}
