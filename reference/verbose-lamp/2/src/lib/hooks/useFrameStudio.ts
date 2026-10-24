import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_FRAME_STYLE,
  DEFAULT_POSTER_BORDER_STYLE,
  FRAME_SOURCES,
  FrameSource,
  FrameStyle,
  FrameSurface,
  INTRICACY_PRESETS,
  IntricacyPreset,
  PosterBorderStyle,
} from '../../webgl/frameGrammar';

export interface FrameStudioTarget {
  setSequenceFrameStyle: (style: FrameStyle) => void;
  setPosterBorderStyle: (style: PosterBorderStyle) => void;
  setPosterBorderEnabled: (enabled: boolean) => void;
}

interface SequenceTuning {
  style: FrameStyle;
  selectPattern: (source: FrameSource) => void;
  setLevel: (level: number) => void;
  setDetail: (value: number) => void;
}

interface PosterTuning {
  style: PosterBorderStyle;
  isEnabled: boolean;
  setLevel: (level: number) => void;
  setDetail: (value: number) => void;
  setVisibility: (enabled: boolean) => void;
}

interface FrameStudioShortcutOptions {
  surface: FrameSurface;
  currentSource: FrameSource;
  detail: number;
  selectPattern: (source: FrameSource) => void;
  setDetail: (value: number) => void;
}

const detailPercent = (value: number) => Math.round(value * 100);
const detailValue = (percent: number) => Math.min(1, Math.max(0, percent / 100));

function useSequenceTuning(getTarget: () => FrameStudioTarget | null): SequenceTuning {
  const [style, setStyle] = useState<FrameStyle>({
    intricacy: DEFAULT_FRAME_STYLE.intricacy,
    formula: { ...DEFAULT_FRAME_STYLE.formula },
  });
  const apply = useCallback((next: FrameStyle) => {
    const copied = { ...next, formula: { ...next.formula } };
    setStyle(copied);
    getTarget()?.setSequenceFrameStyle(copied);
  }, [getTarget]);
  const selectPattern = useCallback(
    (source: FrameSource) => apply({ ...style, formula: { ...style.formula, source } }),
    [apply, style]
  );
  const setLevel = useCallback(
    (level: number) => apply({ ...style, formula: { ...style.formula, level } }),
    [apply, style]
  );
  const setDetail = useCallback((value: number) => apply({ ...style, intricacy: detailValue(value) }), [apply, style]);
  return { style, selectPattern, setLevel, setDetail };
}

function usePosterTuning(getTarget: () => FrameStudioTarget | null): PosterTuning {
  const [style, setStyle] = useState<PosterBorderStyle>({ ...DEFAULT_POSTER_BORDER_STYLE });
  const [isEnabled, setIsEnabled] = useState(false);
  const apply = useCallback((next: PosterBorderStyle) => {
    const copied = {
      level: Math.min(4, Math.max(1, Math.round(next.level))),
      intricacy: detailValue(detailPercent(next.intricacy)),
    };
    setStyle(copied);
    getTarget()?.setPosterBorderStyle(copied);
  }, [getTarget]);
  const setLevel = useCallback((level: number) => apply({ ...style, level }), [apply, style]);
  const setDetail = useCallback((value: number) => apply({ ...style, intricacy: detailValue(value) }), [apply, style]);
  const setVisibility = useCallback((enabled: boolean) => {
    setIsEnabled(enabled);
    getTarget()?.setPosterBorderEnabled(enabled);
  }, [getTarget]);
  return { style, isEnabled, setLevel, setDetail, setVisibility };
}

function useFrameStudioShortcuts(options: FrameStudioShortcutOptions) {
  const { surface, currentSource, detail, selectPattern, setDetail } = options;
  const cyclePattern = useCallback(() => {
    if (surface !== 'title-cards') return;
    const index = FRAME_SOURCES.findIndex((source) => source.id === currentSource);
    selectPattern(FRAME_SOURCES[(index + 1) % FRAME_SOURCES.length].id);
  }, [currentSource, selectPattern, surface]);
  const stepDetail = useCallback((delta: number) => setDetail(detailPercent(detail) + delta), [detail, setDetail]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key.toLowerCase() === 'g') cyclePattern();
      if (event.key === '[') stepDetail(-5);
      if (event.key === ']') stepDetail(5);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cyclePattern, stepDetail]);
}

function useFrameStudioReadout(surface: FrameSurface, sequence: SequenceTuning, poster: PosterTuning) {
  const activeSource = useMemo(
    () => FRAME_SOURCES.find((source) => source.id === sequence.style.formula.source) ?? FRAME_SOURCES[0],
    [sequence.style.formula.source]
  );
  const level = surface === 'title-cards' ? sequence.style.formula.level : poster.style.level;
  const detail = surface === 'title-cards' ? sequence.style.intricacy : poster.style.intricacy;
  const activePreset = useMemo(
    () => INTRICACY_PRESETS.find((preset) => detailPercent(preset.value) === detailPercent(detail)) ?? null,
    [detail]
  );
  const isFixedPattern = surface === 'title-cards' && sequence.style.formula.source === 'authored';
  return { activeSource, level, detail, activePreset, isFixedPattern };
}

export function useFrameStudio(getTarget: () => FrameStudioTarget | null) {
  const [surface, setSurfaceState] = useState<FrameSurface>('title-cards');
  const sequence = useSequenceTuning(getTarget);
  const poster = usePosterTuning(getTarget);
  const readout = useFrameStudioReadout(surface, sequence, poster);
  const setDetail = surface === 'title-cards' ? sequence.setDetail : poster.setDetail;
  const setLevel = surface === 'title-cards' ? sequence.setLevel : poster.setLevel;
  const setSurface = useCallback((next: FrameSurface) => {
    setSurfaceState(next);
    if (next === 'poster-edges' && !poster.isEnabled) poster.setVisibility(true);
  }, [poster.isEnabled, poster.setVisibility]);
  const selectPreset = useCallback(
    (preset: IntricacyPreset) => setDetail(detailPercent(preset.value)),
    [setDetail]
  );

  useFrameStudioShortcuts({
    surface,
    currentSource: sequence.style.formula.source,
    detail: readout.detail,
    selectPattern: sequence.selectPattern,
    setDetail,
  });

  return {
    surface,
    setSurface,
    sources: FRAME_SOURCES,
    activeSource: readout.activeSource,
    level: readout.level,
    detailPercent: detailPercent(readout.detail),
    detailPresets: INTRICACY_PRESETS,
    activePreset: readout.activePreset,
    isFixedPattern: readout.isFixedPattern,
    posterEnabled: poster.isEnabled,
    selectPattern: sequence.selectPattern,
    setLevel,
    setDetail,
    selectPreset,
    setPosterVisibility: poster.setVisibility,
  };
}