import { useCallback, useEffect, useMemo, useState } from 'react';
import { downloadGildedPng, loadRgbaImage, validateImageFile } from '@/features/gilded-portrait';
import { artPaletteById } from '../data/artPalettes';
import { WEI_LING_SPRITE } from '../data/weiLingSprite';
import { DEFAULT_PATTERNS } from '../engine/backdropArt';
import { detectFace } from '../engine/faceDetection';
import { cropBoxFromFace, skinCropBox } from '../engine/faceCrop';
import { renderGoldStudio } from '../engine/goldStudio';
import {
  backgroundFromMatte,
  DEFAULT_MIN_ISLAND,
  DEFAULT_THRESHOLD,
  faceSeedIndex,
  keepSubjectPiece,
  pruneIslands,
} from '../engine/matte';
import {
  gridFromCrop,
  gridFromSprite,
  keepEverything,
  PORTRAIT_GRID_SIZE,
  resizeGrid,
} from '../engine/portraitGrid';
import { parseIndexedSprite } from '../engine/spriteCodec';
import { segmentSubject } from '../engine/subjectSegmentation';
import type {
  AlphaMask,
  BackdropPattern,
  CropBox,
  FaceStatus,
  GoldRampId,
  PortraitGrid,
  RgbaImage,
  StudioSource,
} from '../types';

/**
 * ADDENDUM-017 — the Gold Avatar Studio's decisions.
 *
 * A hook decides; a component renders. Nothing here touches JSX, and the studio's whole
 * behaviour can be exercised without a browser.
 */

export interface AvatarStudioState {
  readonly source: StudioSource;
  readonly image: RgbaImage | null;
  readonly crop: CropBox | null;
  readonly faceStatus: FaceStatus;
  readonly matte: AlphaMask | null;
  readonly removeBackground: boolean;
  readonly pattern: BackdropPattern;
  readonly paletteId: string;
  readonly rampId: GoldRampId;
  readonly goldShare: number;
  readonly sheen: number;
  readonly gildSubject: boolean;
  readonly rim: boolean;
  readonly shimmer: boolean;
  readonly plate: RgbaImage | null;
  readonly error: string | null;
  readonly isBusy: boolean;
  readonly loadFile: (file: File | null) => Promise<void>;
  readonly showWeiLing: () => void;
  readonly detectFaceNow: () => Promise<void>;
  readonly toggleBackground: () => Promise<void>;
  readonly setPattern: (kind: BackdropPattern['kind']) => void;
  readonly setPaletteId: (id: string) => void;
  readonly setRampId: (id: GoldRampId) => void;
  readonly setGoldShare: (value: number) => void;
  readonly setSheen: (value: number) => void;
  readonly setGildSubject: (value: boolean) => void;
  readonly setRim: (value: boolean) => void;
  readonly setShimmer: (value: boolean) => void;
  readonly downloadPng: () => Promise<void>;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function useAvatarStudio(initialSource: StudioSource = 'photograph'): AvatarStudioState {
  const [source, setSource] = useState<StudioSource>(initialSource);
  const [image, setImage] = useState<RgbaImage | null>(null);
  const [crop, setCrop] = useState<CropBox | null>(null);
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('idle');
  const [matte, setMatte] = useState<AlphaMask | null>(null);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [pattern, setPatternState] = useState<BackdropPattern>(DEFAULT_PATTERNS.rays);
  const [paletteId, setPaletteId] = useState('faience');
  const [rampId, setRampId] = useState<GoldRampId>('bright');
  const [goldShare, setGoldShareState] = useState(0.55);
  const [sheen, setSheenState] = useState(0.45);
  const [gildSubject, setGildSubject] = useState(true);
  const [rim, setRim] = useState(true);
  const [shimmer, setShimmer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [sprite, setSprite] = useState(() => parseIndexedSprite(WEI_LING_SPRITE));

  /**
   * The studio opens on the door it was opened through: the house portrait, or a clean
   * photograph session with nothing in it.
   */
  useEffect(() => {
    setSource(initialSource);
    if (initialSource !== 'wei-ling') return;
    setSprite(parseIndexedSprite(WEI_LING_SPRITE));
    setImage(null);
    setCrop(null);
    setMatte(null);
    setFaceStatus('idle');
    setError(null);
  }, [initialSource]);

  const detectFaceNow = useCallback(async () => {
    if (!image) return;
    setFaceStatus('searching');
    const reading = await detectFace(image);
    const box = reading ? cropBoxFromFace(reading, image.width, image.height) : null;
    if (box === null) {
      setFaceStatus('none');
      return;
    }
    setCrop(box);
    setFaceStatus('found');
  }, [image]);

  const loadFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const validation = validateImageFile({ type: file.type, size: file.size });
      if (!validation.ok) {
        setError(validation.reason);
        return;
      }
      setIsBusy(true);
      setError(null);
      try {
        const loaded = await loadRgbaImage(file);
        setImage(loaded);
        setCrop(skinCropBox(loaded));
        setFaceStatus('idle');
        setMatte(null);
        setSource('photograph');
        const reading = await detectFace(loaded);
        const box = reading ? cropBoxFromFace(reading, loaded.width, loaded.height) : null;
        if (box === null) {
          setFaceStatus('none');
        } else {
          setCrop(box);
          setFaceStatus('found');
        }
      } catch {
        setError('That photograph could not be read.');
      } finally {
        setIsBusy(false);
      }
    },
    []
  );

  const showWeiLing = useCallback(() => {
    setSprite(parseIndexedSprite(WEI_LING_SPRITE));
    setImage(null);
    setCrop(null);
    setMatte(null);
    setFaceStatus('idle');
    setError(null);
    setSource('wei-ling');
  }, []);

  const toggleBackground = useCallback(async () => {
    // The house portrait was cut out when it was recorded; there is no ground to lift.
    if (source !== 'photograph' || !image) return;
    if (removeBackground) {
      setRemoveBackground(false);
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const found = await segmentSubject(image);
      if (found === null) {
        setError('The ground behind the sitter could not be lifted. The photograph is unchanged.');
        setRemoveBackground(false);
      } else {
        setMatte(found);
        setRemoveBackground(true);
      }
    } finally {
      setIsBusy(false);
    }
  }, [image, removeBackground, source]);

  const baseGrid = useMemo<PortraitGrid | null>(() => {
    if (source === 'wei-ling') {
      return sprite === null ? null : resizeGrid(gridFromSprite(sprite), PORTRAIT_GRID_SIZE);
    }
    if (!image || !crop) return null;
    return gridFromCrop(image, crop, PORTRAIT_GRID_SIZE);
  }, [source, sprite, image, crop]);

  const grid = useMemo<PortraitGrid | null>(() => {
    if (!baseGrid) return null;
    // The house portrait carries its own cut-out; a photograph's ground is only lifted
    // once the model has said so.
    if (source === 'wei-ling') return baseGrid;
    if (!removeBackground) return { ...baseGrid, background: keepEverything(baseGrid.size) };
    if (!matte || !crop) return baseGrid;
    const raw = backgroundFromMatte(matte, crop, baseGrid.size, DEFAULT_THRESHOLD);
    const pruned = pruneIslands(raw, baseGrid.size, DEFAULT_MIN_ISLAND);
    const kept = keepSubjectPiece(pruned, baseGrid.size, faceSeedIndex(baseGrid.size));
    return { ...baseGrid, background: kept };
  }, [baseGrid, removeBackground, source, matte, crop]);

  const plate = useMemo(() => {
    if (!grid) return null;
    return renderGoldStudio(grid, {
      pattern,
      artColours: artPaletteById(paletteId).colours,
      rampId,
      goldShare: clamp01(goldShare),
      sheen: clamp01(sheen),
      gildSubject,
      rim,
      shimmerPhase: 0,
    });
  }, [grid, pattern, paletteId, rampId, goldShare, sheen, gildSubject, rim]);

  const setPattern = useCallback((kind: BackdropPattern['kind']) => {
    setPatternState(DEFAULT_PATTERNS[kind]);
  }, []);

  const setGoldShare = useCallback((value: number) => {
    setGoldShareState(clamp01(value));
  }, []);

  const setSheen = useCallback((value: number) => {
    setSheenState(clamp01(value));
  }, []);

  const downloadPng = useCallback(async () => {
    if (!plate) return;
    await downloadGildedPng(plate, 'gold-avatar-studio');
  }, [plate]);

  return {
    source,
    image,
    crop,
    faceStatus,
    matte,
    removeBackground,
    pattern,
    paletteId,
    rampId,
    goldShare,
    sheen,
    gildSubject,
    rim,
    shimmer,
    plate,
    error,
    isBusy,
    loadFile,
    showWeiLing,
    detectFaceNow,
    toggleBackground,
    setPattern,
    setPaletteId,
    setRampId,
    setGoldShare,
    setSheen,
    setGildSubject,
    setRim,
    setShimmer,
    downloadPng,
  };
}
