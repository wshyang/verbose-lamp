import type { FrameGeometryStats } from './types';

export function emptyFrameStats(intricacy: number): FrameGeometryStats {
  return {
    intricacy,
    railCount: 0,
    vertexCount: 0,
    echoes: 0,
    bands: 0,
    rosettes: 0,
    fractals: 0,
    extent: 0,
    extentX: 0,
    extentY: 0,
    baseExtentY: 0,
  };
}

/** Sums counts and takes maxima of envelopes across cards. */
export function aggregateFrameStats(cards: FrameGeometryStats[], intricacy: number): FrameGeometryStats {
  return cards.reduce<FrameGeometryStats>(
    (total, card) => ({
      intricacy,
      railCount: total.railCount + card.railCount,
      vertexCount: total.vertexCount + card.vertexCount,
      echoes: total.echoes + card.echoes,
      bands: total.bands + card.bands,
      rosettes: total.rosettes + card.rosettes,
      fractals: total.fractals + card.fractals,
      extent: Math.max(total.extent, card.extent),
      extentX: Math.max(total.extentX, card.extentX),
      extentY: Math.max(total.extentY, card.extentY),
      baseExtentY: Math.max(total.baseExtentY, card.baseExtentY),
    }),
    emptyFrameStats(intricacy)
  );
}
