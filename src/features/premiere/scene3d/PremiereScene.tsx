import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { SEQUENCE_CHAPTERS } from '../data/sequence';
import { activeChapterIndex, rigAnchors } from '../scene/choreography';
import type { ViewportFit } from '../scene/responsiveLayout';
import { BallroomEnvironment } from './BallroomEnvironment';
import { CinemaCamera } from './CinemaCamera';
import { CinemaComposer } from './CinemaComposer';
import { DecoWall } from './DecoWall';
import { GoldDust } from './GoldDust';
import { GreenLight } from './GreenLight';
import { LightingRig } from './LightingRig';
import { PlaybackClock, type PlaybackTelemetry } from './PlaybackClock';
import { ScreenBorder } from './ScreenBorder';
import { Searchlights } from './Searchlights';
import { TitleCard } from './TitleCard';
import type { PremiereStore } from './premiereStore';

export interface PremiereSceneProps {
  store: PremiereStore;
  fit: ViewportFit;
  containerRef?: { current: HTMLElement | null };
  onTelemetry?: (telemetry: PlaybackTelemetry) => void;
  onChapterChange?: (chapterIndex: number) => void;
  /** The environment bake needs real GL; the scene tests mount without it. */
  withEnvironment?: boolean;
  /** Likewise the post pipeline. Production always has both. */
  withComposer?: boolean;
}

/**
 * The whole premiere, composed (ADDENDUM-022 §6 step 2.3). One concern per child, all
 * of them reading the same store: the clock first, then the world, then the cards, then
 * the camera, then the proscenium, then the composer last so it renders the frame the
 * others have just posed.
 */
export function PremiereScene({
  store,
  fit,
  containerRef,
  onTelemetry,
  onChapterChange,
  withEnvironment = true,
  withComposer = true,
}: PremiereSceneProps) {
  return (
    <>
      <PlaybackClock
        store={store}
        containerRef={containerRef}
        onTelemetry={onTelemetry}
        onChapterChange={onChapterChange}
      />

      {withEnvironment ? <BallroomEnvironment /> : null}
      <LightingRig store={store} />

      <Backdrop store={store}>
        <DecoWall />
        <Searchlights store={store} />
      </Backdrop>

      <GreenLight store={store} />
      <GoldDust store={store} />

      {SEQUENCE_CHAPTERS.map((chapter, index) => (
        <TitleCard
          key={chapter.id}
          store={store}
          chapter={chapter}
          index={index}
          isFinale={index === SEQUENCE_CHAPTERS.length - 1}
          cardScale={fit.cardScale}
        />
      ))}

      <CinemaCamera store={store} fit={fit} />
      <ScreenBorder store={store} />

      {withComposer ? <CinemaComposer store={store} /> : null}
    </>
  );
}

/**
 * The recessed wallpaper and the searchlights track *behind* the active chamber: the
 * group slides along Z so the wall never ends, whatever the camera is doing.
 */
function Backdrop({ store, children }: { store: PremiereStore; children: React.ReactNode }) {
  const camera = useThree((state) => state.camera);
  const group = useRef<{ position: { z: number } } | null>(null);

  useFrame(() => {
    const { currentTime, cameraMode } = store.getState();
    const activeIndex = activeChapterIndex(currentTime, SEQUENCE_CHAPTERS);
    const anchors = rigAnchors({
      cameraMode,
      cameraZ: camera.position.z,
      chapterZ: SEQUENCE_CHAPTERS[activeIndex].zPosition,
    });
    if (group.current) group.current.position.z = anchors.backdropZ;
  });

  return (
    <group ref={group as never} name="backdrop">
      {children}
    </group>
  );
}
