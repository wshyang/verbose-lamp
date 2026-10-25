import type { ChapterWindow, Vec3Tuple } from './choreography';

/**
 * Where the orbit camera sits for a chapter, extracted verbatim from
 * GatsbySceneManager.focusOrbitOnChapter (ADDENDUM-022 §2.3). When the
 * playhead sits outside the card's hold window (42 %–85 % through the
 * chapter), `holdAt` retimes it into the hold so the visitor orbits a
 * fully drawn frame — the caller sets that time and pauses, exactly as
 * the manager did. Inside the hold window `holdAt` is null and playback
 * state is left untouched.
 */
export interface OrbitFocus {
  target: Vec3Tuple;
  cameraPosition: Vec3Tuple;
  holdAt: number | null;
}

export function orbitFocus(chapter: ChapterWindow, currentTime: number): OrbitFocus {
  const duration = chapter.endTime - chapter.startTime;
  const local = (currentTime - chapter.startTime) / duration;
  const holdAt = local < 0.42 || local > 0.85 ? chapter.startTime + duration * 0.56 : null;
  return {
    target: [0, 0, chapter.zPosition],
    cameraPosition: [2.4, 0.9, chapter.zPosition + 9.2],
    holdAt,
  };
}
