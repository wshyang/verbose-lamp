import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_FRAME_LAYERS,
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  FRAME_LAYER_SOURCES,
  FRAME_SOURCES,
  FrameFormula,
  FrameLayerSource,
  FramePatternLayer,
  FrameSource,
  FrameStyle,
  FrameSurface,
  INTRICACY_PRESETS,
  ScreenBorderPattern,
  ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { SIGNATURE_GENOME, clampGenome, withGene, type GeneKey } from '@/features/art-deco-frame';
import { DESIGN_GALLERY, describeDesign, designAt, findDesignEntry } from '../data/frameDesigns';
import { nextPatternSeed } from '../model/patternSeed';

export { nextPatternSeed } from '../model/patternSeed';

export interface FrameStudioTarget {
  setSequenceFrameStyle: (style: FrameStyle) => void;
  setScreenBorderStyle: (style: ScreenBorderStyle) => void;
  setScreenBorderEnabled: (enabled: boolean) => void;
}


const detailPercent = (value: number) => Math.round(value * 100);
const detailValue = (percent: number) => Math.min(1, Math.max(0, percent / 100));

const defaultFrameFormula = (): FrameFormula => ({
  ...DEFAULT_FRAME_STYLE.formula,
  genome: { ...SIGNATURE_GENOME },
  layers: DEFAULT_FRAME_LAYERS.map((layer) => ({ ...layer })),
});

export function useFrameStudio(getTarget: () => FrameStudioTarget | null) {
  const [isOpen, setIsOpen] = useState(true);
  const [surface, setSurfaceState] = useState<FrameSurface>('title-cards');
  const [formula, setFormula] = useState<FrameFormula>(defaultFrameFormula);
  const [intricacy, setIntricacy] = useState(DEFAULT_FRAME_STYLE.intricacy);
  const [border, setBorder] = useState<ScreenBorderStyle>({ ...DEFAULT_SCREEN_BORDER_STYLE, genome: { ...SIGNATURE_GENOME } });
  const [borderEnabled, setBorderEnabledState] = useState(false);
  const [proportionsOpen, setProportionsOpen] = useState(false);

  const commitSequence = useCallback(
    (nextFormula: FrameFormula, nextIntricacy: number) => {
      setFormula(nextFormula);
      setIntricacy(nextIntricacy);
      getTarget()?.setSequenceFrameStyle({ intricacy: nextIntricacy, formula: nextFormula });
    },
    [getTarget]
  );

  const commitBorder = useCallback(
    (next: ScreenBorderStyle) => {
      setBorder(next);
      getTarget()?.setScreenBorderStyle(next);
    },
    [getTarget]
  );

  const selectPattern = useCallback(
    (source: FrameSource) => {
      const layers = (formula.layers ?? DEFAULT_FRAME_LAYERS).map((layer) =>
        layer.source === source ? { ...layer, enabled: false } : layer
      );
      const level = source === 'authored' ? DEFAULT_FRAME_STYLE.formula.level : formula.level;
      commitSequence({ ...formula, source, level, layers }, intricacy);
    },
    [commitSequence, formula, intricacy]
  );

  const selectDesign = useCallback(
    (index: number) => {
      const entry = designAt(index);
      commitSequence({ ...formula, genome: clampGenome(entry.genome) }, intricacy);
    },
    [commitSequence, formula, intricacy]
  );

  const setGene = useCallback(
    (key: GeneKey, value: number) => commitSequence({ ...formula, genome: withGene(formula.genome, key, value) }, intricacy),
    [commitSequence, formula, intricacy]
  );

  const updateLayer = useCallback(
    (source: FrameLayerSource, changes: Partial<Pick<FramePatternLayer, 'enabled' | 'level'>>) => {
      const layers = (formula.layers ?? DEFAULT_FRAME_LAYERS).map((layer) =>
        layer.source === source ? { ...layer, ...changes } : layer
      );
      commitSequence({ ...formula, layers }, intricacy);
    },
    [commitSequence, formula, intricacy]
  );

  const setLayerEnabled = useCallback(
    (source: FrameLayerSource, enabled: boolean) => updateLayer(source, { enabled }),
    [updateLayer]
  );

  const setLayerLevel = useCallback(
    (source: FrameLayerSource, level: number) =>
      updateLayer(source, { level: Math.min(4, Math.max(1, Math.round(level))) }),
    [updateLayer]
  );

  const setLevel = useCallback(
    (level: number) => commitSequence({ ...formula, level }, intricacy),
    [commitSequence, formula, intricacy]
  );

  const rerollPattern = useCallback(
    () => commitSequence({ ...formula, seed: nextPatternSeed(formula.seed) }, intricacy),
    [commitSequence, formula, intricacy]
  );

  const setDetail = useCallback(
    (percent: number) => commitSequence(formula, detailValue(percent)),
    [commitSequence, formula]
  );

  const setBorderWeight = useCallback(
    (weight: number) => commitBorder({ ...border, weight: detailValue(weight) }),
    [border, commitBorder]
  );

  const setBorderPattern = useCallback(
    (pattern: ScreenBorderPattern) => commitBorder({ ...border, pattern }),
    [border, commitBorder]
  );

  const setGeneOnBorder = useCallback(
    (key: GeneKey, value: number) => commitBorder({ ...border, genome: withGene(border.genome, key, value) }),
    [border, commitBorder]
  );

  const setBorderEnabled = useCallback(
    (enabled: boolean) => {
      setBorderEnabledState(enabled);
      getTarget()?.setScreenBorderEnabled(enabled);
    },
    [getTarget]
  );

  const setSurface = useCallback((next: FrameSurface) => {
    setSurfaceState(next);
    if (next === 'screen-border' && !borderEnabled) setBorderEnabled(true);
  }, [borderEnabled, setBorderEnabled]);

  const resetAll = useCallback(() => {
    const original = defaultFrameFormula();
    setSurfaceState('title-cards');
    commitSequence(original, DEFAULT_FRAME_STYLE.intricacy);
    setBorder({ ...DEFAULT_SCREEN_BORDER_STYLE, genome: { ...SIGNATURE_GENOME } });
    setBorderEnabled(false);
    setProportionsOpen(false);
  }, [commitSequence]);

  const activeGenome = surface === 'title-cards' ? formula.genome : border.genome;
  const setGeneForSurface = surface === 'title-cards' ? setGene : setGeneOnBorder;

  const activeDesign = useMemo(() => {
    if (formula.source !== 'authored') return undefined;
    return findDesignEntry(formula.genome) ?? undefined;
  }, [formula.genome, formula.source]);
  const designLabel = describeDesign(activeDesign, formula.genome);

  const activePreset = useMemo(
    () => INTRICACY_PRESETS.find((preset) => detailPercent(preset.value) === detailPercent(intricacy)) ?? null,
    [intricacy]
  );

  const layerOptions = useMemo(() => {
    const settings = formula.layers ?? DEFAULT_FRAME_LAYERS;
    return FRAME_LAYER_SOURCES.filter((pattern) => pattern.id !== formula.source).map((pattern) => {
      const layer = settings.find((entry) => entry.source === pattern.id);
      return {
        source: pattern.id,
        label: pattern.label,
        blurb: pattern.blurb,
        enabled: layer?.enabled ?? false,
        level: layer?.level ?? 2,
      };
    });
  }, [formula.layers, formula.source]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key.toLowerCase() === 'f') setIsOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isLatticeActive =
    formula.source === 'lattice' ||
    layerOptions.some((layer) => layer.source === 'lattice' && layer.enabled);

  return {
    isOpen,
    isLatticeActive,
    rerollPattern,
    selectPattern,
    selectDesign,
    setLevel,
    setDetail,
    dismiss: useCallback(() => setIsOpen(false), []),
    reveal: useCallback(() => setIsOpen(true), []),
    surface,
    setSurface,
    patterns: FRAME_SOURCES,
    baseSource: formula.source,
    layers: layerOptions,
    designGallery: DESIGN_GALLERY,
    activeDesignIndex: activeDesign?.index ?? null,
    designLabel,
    level: formula.level,
    detailPercent: detailPercent(intricacy),
    detailPresets: INTRICACY_PRESETS,
    activePreset,
    isDesignPattern: formula.source === 'authored',
    setLayerEnabled,
    setLayerLevel,
    proportionsOpen,
    setProportionsOpen,
    genome: activeGenome,
    setGene: setGeneForSurface,
    borderEnabled,
    setBorderEnabled,
    borderPattern: border.pattern ?? 'poster',
    setBorderPattern,
    borderWeight: detailPercent(border.weight),
    setBorderWeight,
    resetAll,
  };
}

export type FrameStudioController = ReturnType<typeof useFrameStudio>;
