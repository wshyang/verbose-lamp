import { useCallback, useRef, useState, type RefObject } from 'react';
import {
  SIGNATURE_GENOME,
  SIGNATURE_INTRICACY,
  clampGenome,
  clampIntricacy,
  type FrameFamily,
  type FrameGeometryStats,
  type FrameStyle,
  type GeneKey,
} from '../webgl/frame';
import { designAt } from '../data/frameGenomeUi';
import type { GatsbySceneManager } from '../webgl/GatsbySceneManager';

const INTRICACY_STEPS_PER_UNIT = 20;

interface EdgeBorderUiState {
  enabled: boolean;
  weight: number;
  railCount: number | null;
}

function originalStyle(): FrameStyle {
  return { family: 'sequence', intricacy: SIGNATURE_INTRICACY, genome: { ...SIGNATURE_GENOME } };
}

function quantizeIntricacy(value: number): number {
  return clampIntricacy(Math.round(value * INTRICACY_STEPS_PER_UNIT) / INTRICACY_STEPS_PER_UNIT);
}

export interface FrameStyleController {
  style: FrameStyle;
  stats: FrameGeometryStats | null;
  /** Index into the merged design gallery; null once a slider overrides it. */
  designIndex: number | null;
  edge: EdgeBorderUiState;
  receiveStats: (stats: FrameGeometryStats) => void;
  setIntricacy: (value: number) => void;
  stepIntricacy: (direction: number) => void;
  setFamily: (family: FrameFamily) => void;
  selectDesign: (index: number) => void;
  stepDesign: (direction: number) => void;
  setGene: (key: GeneKey, value: number) => void;
  setEdgeEnabled: (enabled: boolean) => void;
  setEdgeWeight: (weight: number) => void;
  resetAll: () => void;
}

/** Owns frame style and screen-border state, pushing every change to the scene. */
export function useFrameStyle(managerRef: RefObject<GatsbySceneManager | null>): FrameStyleController {
  const [style, setStyle] = useState<FrameStyle>(originalStyle);
  const [stats, setStats] = useState<FrameGeometryStats | null>(null);
  const [designIndex, setDesignIndex] = useState<number | null>(0);
  const [edge, setEdge] = useState<EdgeBorderUiState>({ enabled: false, weight: 0.5, railCount: null });
  const styleRef = useRef<FrameStyle>(style);
  const designRef = useRef<number | null>(0);
  const edgeRef = useRef<EdgeBorderUiState>(edge);

  const commit = useCallback(
    (next: FrameStyle, index: number | null) => {
      styleRef.current = next;
      designRef.current = index;
      setStyle(next);
      setDesignIndex(index);
      managerRef.current?.setFrameStyle(next);
      managerRef.current?.setEdgeBorder(edgeRef.current.enabled, edgeRef.current.weight, next.genome);
    },
    [managerRef]
  );

  const commitEdge = useCallback(
    (next: EdgeBorderUiState) => {
      edgeRef.current = next;
      setEdge(next);
      managerRef.current?.setEdgeBorder(next.enabled, next.weight, styleRef.current.genome);
    },
    [managerRef]
  );

  const setIntricacy = useCallback(
    (value: number) => commit({ ...styleRef.current, intricacy: quantizeIntricacy(value) }, designRef.current),
    [commit]
  );

  const stepIntricacy = useCallback(
    (direction: number) =>
      setIntricacy(styleRef.current.intricacy + Math.sign(direction) / INTRICACY_STEPS_PER_UNIT),
    [setIntricacy]
  );

  const setFamily = useCallback(
    (family: FrameFamily) => commit({ ...styleRef.current, family }, designRef.current),
    [commit]
  );

  const selectDesign = useCallback(
    (index: number) => {
      const entry = designAt(index);
      commit({ ...styleRef.current, genome: clampGenome(entry.genome) }, entry.index);
    },
    [commit]
  );

  const stepDesign = useCallback(
    (direction: number) => selectDesign((designRef.current ?? 0) + Math.sign(direction)),
    [selectDesign]
  );

  const setGene = useCallback(
    (key: GeneKey, value: number) =>
      commit({ ...styleRef.current, genome: clampGenome({ ...styleRef.current.genome, [key]: value }) }, null),
    [commit]
  );

  const setEdgeEnabled = useCallback(
    (enabled: boolean) => commitEdge({ ...edgeRef.current, enabled }),
    [commitEdge]
  );

  const setEdgeWeight = useCallback(
    (weight: number) => commitEdge({ ...edgeRef.current, weight: clampIntricacy(weight) }),
    [commitEdge]
  );

  const resetAll = useCallback(() => {
    commit(originalStyle(), 0);
    commitEdge({ ...edgeRef.current, enabled: false, weight: 0.5 });
  }, [commit, commitEdge]);

  return {
    style,
    stats,
    designIndex,
    edge,
    receiveStats: setStats,
    setIntricacy,
    stepIntricacy,
    setFamily,
    selectDesign,
    stepDesign,
    setGene,
    setEdgeEnabled,
    setEdgeWeight,
    resetAll,
  };
}
