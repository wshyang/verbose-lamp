import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  FRAME_SOURCES,
  FrameSource,
  FrameStyle,
  FrameSurface,
  INTRICACY_PRESETS,
  ScreenBorderStyle,
} from '../../webgl/frameGrammar';
import { SIGNATURE_GENOME, clampGenome, withGene, type GeneKey } from '../../webgl/frameGrammar/genome';
import { DESIGN_GALLERY, describeDesign, designAt, findDesignEntry } from '../../data/frameDesigns';

export interface FrameStudioTarget {
  setSequenceFrameStyle: (style: FrameStyle) => void;
  setScreenBorderStyle: (style: ScreenBorderStyle) => void;
  setScreenBorderEnabled: (enabled: boolean) => void;
}

const detailPercent = (value: number) => Math.round(value * 100);
const detailValue = (percent: number) => Math.min(1, Math.max(0, percent / 100));

export function useFrameStudio(getTarget: () => FrameStudioTarget | null) {
  const [isOpen, setIsOpen] = useState(true);
  const [surface, setSurfaceState] = useState<FrameSurface>('title-cards');
  const [formula, setFormula] = useState(() => ({ ...DEFAULT_FRAME_STYLE.formula, genome: { ...SIGNATURE_GENOME } }));
  const [intricacy, setIntricacy] = useState(DEFAULT_FRAME_STYLE.intricacy);
  const [border, setBorder] = useState<ScreenBorderStyle>({ ...DEFAULT_SCREEN_BORDER_STYLE, genome: { ...SIGNATURE_GENOME } });
  const [borderEnabled, setBorderEnabledState] = useState(false);
  const [proportionsOpen, setProportionsOpen] = useState(false);

  const commitSequence = useCallback(
    (nextFormula: typeof formula, nextIntricacy: number) => {
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
    (source: FrameSource) => commitSequence({ ...formula, source }, intricacy),
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

  const setLevel = useCallback(
    (level: number) => commitSequence({ ...formula, level }, intricacy),
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
    const original = { ...DEFAULT_FRAME_STYLE.formula, genome: { ...SIGNATURE_GENOME } };
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key.toLowerCase() === 'f') setIsOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return {
    isOpen,
    selectPattern,
    selectDesign,
    setLevel,
    setDetail,
    dismiss: useCallback(() => setIsOpen(false), []),
    reveal: useCallback(() => setIsOpen(true), []),
    surface,
    setSurface,
    patterns: FRAME_SOURCES,
    designGallery: DESIGN_GALLERY,
    activeDesignIndex: activeDesign?.index ?? null,
    designLabel,
    level: formula.level,
    detailPercent: detailPercent(intricacy),
    detailPresets: INTRICACY_PRESETS,
    activePreset,
    isDesignPattern: formula.source === 'authored',
    proportionsOpen,
    setProportionsOpen,
    genome: activeGenome,
    setGene: setGeneForSurface,
    borderEnabled,
    setBorderEnabled,
    borderWeight: detailPercent(border.weight),
    setBorderWeight,
    resetAll,
  };
}
