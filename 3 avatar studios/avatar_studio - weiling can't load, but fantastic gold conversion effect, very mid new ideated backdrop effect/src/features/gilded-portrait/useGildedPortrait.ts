import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildArtBackdrop, compositeImages } from './artBackdrop';
import { detectPortraitFace, warmUpFaceDetector } from './faceDetection';
import { downloadGildedPng } from './export';
import { loadRgbaImage } from './load';
import { gildImage } from './pipeline';
import { GILDING_PRESETS } from './presets';
import { segmentPortraitSubject } from './subjectSegmentation';
import { applySubjectMask, estimateSubjectMask } from './subjectMask';
import { validateImageFile } from './validate';
import type {
  BackdropId,
  FaceDetection,
  GoldRampId,
  GildingParams,
  GildingPreset,
  MaskShape,
  PortraitAnalysisStatus,
  RgbaImage,
  SubjectMask,
} from './types';

const WEI_LING_IMAGE = '/demo/wei-ling.png';

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
  readonly isBackgroundRemoved: boolean;
  readonly backdropId: BackdropId;
  readonly faceDetection: FaceDetection | null;
  readonly analysisStatus: PortraitAnalysisStatus;
  readonly loadFile: (file: File | null) => Promise<void>;
  readonly loadWeiLing: () => Promise<void>;
  readonly applyPreset: (preset: GildingPreset) => void;
  readonly setClarity: (value: number) => void;
  readonly setLevels: (value: number) => void;
  readonly setFolds: (value: number) => void;
  readonly setRamp: (value: GoldRampId) => void;
  readonly setMaskShape: (value: MaskShape) => void;
  readonly setShimmering: (value: boolean) => void;
  readonly setShowingOriginal: (value: boolean) => void;
  readonly setBackgroundRemoved: (value: boolean) => void;
  readonly setBackdropId: (value: BackdropId) => void;
  readonly downloadPng: () => Promise<void>;
}

interface AnalysisResult {
  readonly face: FaceDetection | null;
  readonly mask: SubjectMask;
  readonly usedFallback: boolean;
}

interface PortraitSourceState {
  readonly image: RgbaImage | null;
  readonly name: string;
  readonly mask: SubjectMask | null;
  readonly face: FaceDetection | null;
  readonly status: PortraitAnalysisStatus;
  readonly error: string | null;
  readonly isLoading: boolean;
}

const EMPTY_SOURCE: PortraitSourceState = {
  image: null,
  name: '',
  mask: null,
  face: null,
  status: 'idle',
  error: null,
  isLoading: false,
};

async function analysePortrait(
  image: RgbaImage,
  onStatus: (status: PortraitAnalysisStatus) => void,
): Promise<AnalysisResult> {
  onStatus('detecting-face');
  const face = await detectPortraitFace(image);
  onStatus('removing-background');
  const modelMask = await segmentPortraitSubject(image);
  return {
    face,
    mask: modelMask ?? estimateSubjectMask(image),
    usedFallback: modelMask === null,
  };
}

function buildPortraitArtwork(
  source: RgbaImage,
  params: GildingParams,
  mask: SubjectMask | null,
  backdropId: BackdropId,
): RgbaImage {
  const gold = gildImage(source, params);
  if (!mask) return gold;
  const subject = applySubjectMask(gold, mask);
  return compositeImages(subject, buildArtBackdrop(source.width, source.height, backdropId));
}

type ParamsUpdate = (current: GildingParams) => GildingParams;

function useGildingControls() {
  const initialPreset = GILDING_PRESETS[0];
  const [params, setParams] = useState<GildingParams>(initialPreset.params);
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
  const setRamp = useCallback((rampId: GoldRampId) => {
    applyParams((current) => ({ ...current, rampId }));
  }, [applyParams]);
  const setMaskShape = useCallback((shape: MaskShape) => {
    applyParams((current) => ({
      ...current,
      mask: { ...current.mask, shape, feather: shape === 'none' ? 0 : current.mask.feather || 0.06 },
    }));
  }, [applyParams]);
  return { params, activePresetId, applyPreset, setClarity, setLevels, setFolds, setRamp, setMaskShape };
}

function fileFromResponse(blob: Blob): File {
  return new File([blob], 'Wei_Ling.png', { type: blob.type || 'image/png' });
}

function usePortraitSource() {
  const [state, setState] = useState<PortraitSourceState>(EMPTY_SOURCE);
  const loadSequence = useRef(0);
  useEffect(() => warmUpFaceDetector(), []);
  const loadFile = useCallback(async (file: File | null) => {
    if (!file) return;
    const requestId = ++loadSequence.current;
    const validation = validateImageFile({ type: file.type, size: file.size });
    if (!validation.ok) {
      setState((current) => ({ ...current, error: validation.reason }));
      return;
    }
    setState((current) => ({ ...current, error: null, isLoading: true, status: 'idle', face: null, mask: null }));
    try {
      const image = await loadRgbaImage(file);
      if (requestId !== loadSequence.current) return;
      setState({ image, name: file.name, mask: null, face: null, status: 'idle', error: null, isLoading: false });
      const report = (status: PortraitAnalysisStatus) => {
        if (requestId === loadSequence.current) setState((current) => ({ ...current, status }));
      };
      const analysis = await analysePortrait(image, report);
      if (requestId !== loadSequence.current) return;
      setState((current) => ({
        ...current,
        face: analysis.face,
        mask: analysis.mask,
        status: analysis.usedFallback ? 'fallback' : 'ready',
      }));
    } catch (loadError) {
      if (requestId === loadSequence.current) {
        const message = loadError instanceof Error ? loadError.message : 'That image could not be opened.';
        setState((current) => ({ ...current, error: message, status: 'idle' }));
      }
    } finally {
      if (requestId === loadSequence.current) setState((current) => ({ ...current, isLoading: false }));
    }
  }, []);
  const loadWeiLing = useCallback(async () => {
    try {
      const response = await fetch(WEI_LING_IMAGE);
      if (!response.ok) throw new Error('Wei_Ling could not be loaded.');
      await loadFile(fileFromResponse(await response.blob()));
    } catch {
      setState((current) => ({ ...current, error: 'Wei_Ling could not be loaded. Please try again.' }));
    }
  }, [loadFile]);
  return { state, loadFile, loadWeiLing, setError: (error: string | null) => setState((current) => ({ ...current, error })) };
}

export function useGildedPortrait(): GildedPortraitState {
  const controls = useGildingControls();
  const source = usePortraitSource();
  const [isExporting, setIsExporting] = useState(false);
  const [isShimmering, setIsShimmering] = useState(true);
  const [isShowingOriginal, setIsShowingOriginal] = useState(false);
  const [isBackgroundRemoved, setIsBackgroundRemoved] = useState(true);
  const [backdropId, setBackdropId] = useState<BackdropId>('sapphire-fan');
  const loadFile = useCallback(async (file: File | null) => {
    if (file) setIsShowingOriginal(false);
    await source.loadFile(file);
  }, [source.loadFile]);
  const loadWeiLing = useCallback(async () => {
    setIsShowingOriginal(false);
    await source.loadWeiLing();
  }, [source.loadWeiLing]);

  const activeMask = isBackgroundRemoved ? source.state.mask : null;
  const gildedImage = useMemo(() => source.state.image
    ? buildPortraitArtwork(source.state.image, controls.params, activeMask, backdropId)
    : null, [source.state.image, controls.params, activeMask, backdropId]);

  const downloadPng = useCallback(async () => {
    if (!gildedImage || isExporting) return;
    setIsExporting(true);
    try {
      await downloadGildedPng(gildedImage, source.state.name || 'gilded-avatar');
    } catch {
      source.setError('The PNG could not be prepared. Please try downloading again.');
    } finally {
      setIsExporting(false);
    }
  }, [gildedImage, isExporting, source.state.name, source.setError]);

  return {
    sourceImage: source.state.image, gildedImage, sourceName: source.state.name,
    error: source.state.error, isLoading: source.state.isLoading, isExporting,
    params: controls.params, activePresetId: controls.activePresetId,
    isShimmering, isShowingOriginal, isBackgroundRemoved, backdropId,
    faceDetection: source.state.face, analysisStatus: source.state.status,
    loadFile, loadWeiLing,
    applyPreset: controls.applyPreset, setClarity: controls.setClarity,
    setLevels: controls.setLevels, setFolds: controls.setFolds,
    setRamp: controls.setRamp, setMaskShape: controls.setMaskShape,
    setShimmering: setIsShimmering, setShowingOriginal: setIsShowingOriginal,
    setBackgroundRemoved: setIsBackgroundRemoved, setBackdropId, downloadPng,
  };
}