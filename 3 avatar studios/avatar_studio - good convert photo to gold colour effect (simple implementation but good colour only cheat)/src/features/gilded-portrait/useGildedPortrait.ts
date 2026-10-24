import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { gildImage } from './pipeline';
import { downloadGildedPng } from './export';
import { loadRgbaImage } from './load';
import { GILDING_PRESETS } from './presets';
import { validateImageFile } from './validate';
import type { GoldRampId, GildingParams, GildingPreset, MaskShape, RgbaImage } from './types';

export interface GildedPortraitState {
  readonly sourceImage: RgbaImage | null;
  readonly gildedImage: RgbaImage | null;
  readonly sourceName: string;
  readonly params: GildingParams;
  readonly activePresetId: string | null;
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly isExporting: boolean;
  readonly isShimmering: boolean;
  readonly isShowingOriginal: boolean;
  readonly loadFile: (file: File | null) => Promise<void>;
  readonly applyPreset: (preset: GildingPreset) => void;
  readonly setClarity: (value: number) => void;
  readonly setLevels: (value: number) => void;
  readonly setFolds: (value: number) => void;
  readonly setRamp: (value: GoldRampId) => void;
  readonly setMaskShape: (value: MaskShape) => void;
  readonly setShimmering: (value: boolean) => void;
  readonly setShowingOriginal: (value: boolean) => void;
  readonly downloadPng: () => Promise<void>;
}

type ParamsUpdate = (current: GildingParams) => GildingParams;

interface SourceImageState {
  readonly sourceImage: RgbaImage | null;
  readonly sourceName: string;
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly loadFile: (file: File | null) => Promise<void>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
}

function useSourceImage(): SourceImageState {
  const [sourceImage, setSourceImage] = useState<RgbaImage | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const loadSequence = useRef(0);

  const loadFile = useCallback(async (file: File | null) => {
    if (!file) return;
    const requestId = ++loadSequence.current;
    const validation = validateImageFile({ type: file.type, size: file.size });
    if (!validation.ok) {
      setError(validation.reason);
      setIsLoading(false);
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const image = await loadRgbaImage(file);
      if (requestId !== loadSequence.current) return;
      setSourceImage(image);
      setSourceName(file.name);
    } catch (loadError) {
      if (requestId === loadSequence.current) {
        setError(loadError instanceof Error ? loadError.message : 'That image could not be opened.');
      }
    } finally {
      if (requestId === loadSequence.current) setIsLoading(false);
    }
  }, []);

  return { sourceImage, sourceName, error, isLoading, loadFile, setError };
}

interface GildingControls {
  readonly params: GildingParams;
  readonly activePresetId: string | null;
  readonly applyPreset: (preset: GildingPreset) => void;
  readonly setClarity: (value: number) => void;
  readonly setLevels: (value: number) => void;
  readonly setFolds: (value: number) => void;
  readonly setRamp: (value: GoldRampId) => void;
  readonly setMaskShape: (value: MaskShape) => void;
}

function useGildingControls(): GildingControls {
  const initialPreset = GILDING_PRESETS[0];
  const [params, setParams] = useState(initialPreset.params);
  const [activePresetId, setActivePresetId] = useState<string | null>(initialPreset.id);
  const applyParams = useCallback((update: ParamsUpdate) => {
    setParams((current) => update(current));
    setActivePresetId(null);
  }, []);

  const applyPreset = useCallback((preset: GildingPreset) => {
    setParams(preset.params);
    setActivePresetId(preset.id);
  }, []);

  const setClarity = useCallback((value: number) => {
    applyParams((current) => ({ ...current, clarity: Math.min(1.6, Math.max(0, value)) }));
  }, [applyParams]);

  const setLevels = useCallback((value: number) => {
    applyParams((current) => ({ ...current, levels: Math.min(100, Math.max(0, value)) }));
  }, [applyParams]);

  const setFolds = useCallback((value: number) => {
    applyParams((current) => ({ ...current, folds: Math.min(4, Math.max(0, Math.round(value))) }));
  }, [applyParams]);

  const setRamp = useCallback((value: GoldRampId) => {
    applyParams((current) => ({ ...current, rampId: value }));
  }, [applyParams]);

  const setMaskShape = useCallback((value: MaskShape) => {
    applyParams((current) => ({
      ...current,
      mask: {
        ...current.mask,
        shape: value,
        feather: value === 'none' ? 0 : current.mask.feather || 0.06,
        choke: value === 'none' ? 0 : current.mask.choke,
      },
    }));
  }, [applyParams]);

  return { params, activePresetId, applyPreset, setClarity, setLevels, setFolds, setRamp, setMaskShape };
}

export function useGildedPortrait(): GildedPortraitState {
  const source = useSourceImage();
  const controls = useGildingControls();
  const [isExporting, setIsExporting] = useState(false);
  const [isShimmering, setIsShimmering] = useState(true);
  const [isShowingOriginal, setIsShowingOriginal] = useState(false);
  const gildedImage = useMemo(
    () => source.sourceImage ? gildImage(source.sourceImage, controls.params) : null,
    [source.sourceImage, controls.params]
  );
  const loadFile = useCallback(async (file: File | null) => {
    await source.loadFile(file);
    if (file) setIsShowingOriginal(false);
  }, [source.loadFile]);

  const downloadPng = useCallback(async () => {
    if (!gildedImage || isExporting) return;
    setIsExporting(true);
    try {
      await downloadGildedPng(gildedImage, source.sourceName || 'gilded-portrait');
    } catch {
      source.setError('The PNG could not be prepared. Please try downloading again.');
    } finally {
      setIsExporting(false);
    }
  }, [gildedImage, isExporting, source.sourceName, source.setError]);

  return {
    sourceImage: source.sourceImage,
    gildedImage,
    sourceName: source.sourceName,
    params: controls.params,
    activePresetId: controls.activePresetId,
    error: source.error,
    isLoading: source.isLoading,
    isExporting,
    isShimmering,
    isShowingOriginal,
    loadFile,
    applyPreset: controls.applyPreset,
    setClarity: controls.setClarity,
    setLevels: controls.setLevels,
    setFolds: controls.setFolds,
    setRamp: controls.setRamp,
    setMaskShape: controls.setMaskShape,
    setShimmering: setIsShimmering,
    setShowingOriginal: setIsShowingOriginal,
    downloadPng,
  };
}