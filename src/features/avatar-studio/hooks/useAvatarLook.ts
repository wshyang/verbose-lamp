import { useMemo, useState } from 'react';
import { DEFAULT_TUNING, withBackground, withKnob, type CutOutTuning, type TuningKnob } from '@/features/background-removal';
import {
  DEFAULT_BACKDROPS,
  withColours,
  withInlay,
  withPalette,
  withPatternKind,
  withPatternKnob,
  withSpecKnob,
  type BackdropKind,
  type BackdropPreset,
  type BackdropSpec,
  type EnamelPalette,
  type InlayStyle,
  type SpecKnob,
} from '@/features/enamel-backdrop';
import { GILDING_PRESETS, type GildingParams, type GildingPreset } from '@/features/gilded-portrait';
import type { GoldRampId } from '@/shared/lib/goldRamp';
import { withGildingTone, type GildingToneKey } from '../gilding';
import type { AvatarFrame, SubjectFinish } from '../types';

/** Everything about how the avatar looks, independent of which photo is loaded. */
export interface AvatarLookValues {
  readonly backdrop: BackdropSpec;
  readonly tuning: CutOutTuning;
  readonly finish: SubjectFinish;
  readonly frame: AvatarFrame;
  readonly gilding: GildingParams;
  /** The gilding preset in use, or null once a tone has been hand-tuned. */
  readonly gildingPresetId: string | null;
  readonly isShimmering: boolean;
  readonly isFineTuning: boolean;
}

export interface AvatarLookActions {
  readonly applyBackdropPreset: (preset: BackdropPreset) => void;
  readonly choosePattern: (kind: BackdropKind) => void;
  readonly setPatternKnob: (key: string, value: number) => void;
  readonly setSpecKnob: (knob: SpecKnob, value: number) => void;
  readonly choosePalette: (palette: EnamelPalette) => void;
  readonly setColour: (which: 'colourOne' | 'colourTwo', value: string) => void;
  readonly setInlay: (inlay: InlayStyle) => void;
  readonly setTuningKnob: (knob: TuningKnob, value: number) => void;
  readonly setBackgroundRemoved: (isRemoved: boolean) => void;
  readonly resetTuning: () => void;
  readonly setFinish: (finish: SubjectFinish) => void;
  readonly applyGildingPreset: (preset: GildingPreset) => void;
  readonly setGildingRamp: (rampId: GoldRampId) => void;
  readonly setGildingTone: (key: GildingToneKey, sliderValue: number) => void;
  readonly setFrame: (frame: AvatarFrame) => void;
  readonly toggleShimmer: () => void;
  readonly toggleFineTuning: () => void;
  readonly applySampleDefaults: () => void;
}

export type AvatarLook = AvatarLookValues & AvatarLookActions;

/** Wei_Ling's defaults (ADDENDUM-017 §4.6): Sunburst / Emerald Ballroom, natural, medallion. */
const STUDIO_DEFAULTS = Object.freeze({
  backdrop: DEFAULT_BACKDROPS[0].spec, finish: 'natural', frame: 'medallion', gilding: GILDING_PRESETS[0],
} as const);

export function useAvatarLook(): AvatarLook {
  const [backdrop, setBackdrop] = useState<BackdropSpec>(STUDIO_DEFAULTS.backdrop);
  const [tuning, setTuning] = useState<CutOutTuning>(DEFAULT_TUNING);
  const [finish, setFinish] = useState<SubjectFinish>(STUDIO_DEFAULTS.finish);
  const [frame, setFrame] = useState<AvatarFrame>(STUDIO_DEFAULTS.frame);
  const [gilding, setGilding] = useState<GildingParams>(STUDIO_DEFAULTS.gilding.params);
  const [gildingPresetId, setGildingPresetId] = useState<string | null>(STUDIO_DEFAULTS.gilding.id);
  const [isShimmering, setShimmering] = useState(true);
  const [isFineTuning, setFineTuning] = useState(false);

  const actions = useMemo<AvatarLookActions>(() => {
    const applyGildingPreset = (preset: GildingPreset) => { setGilding(preset.params); setGildingPresetId(preset.id); };
    return {
      applyBackdropPreset: (preset) => setBackdrop(preset.spec),
      choosePattern: (kind) => setBackdrop((spec) => withPatternKind(spec, kind)),
      setPatternKnob: (key, value) => setBackdrop((spec) => withPatternKnob(spec, { key, value })),
      setSpecKnob: (knob, value) => setBackdrop((spec) => withSpecKnob(spec, { knob, value })),
      choosePalette: (palette) => setBackdrop((spec) => withPalette(spec, palette)),
      setColour: (which, value) => setBackdrop((spec) => withColours(spec, { [which]: value })),
      setInlay: (inlay) => setBackdrop((spec) => withInlay(spec, inlay)),
      setTuningKnob: (knob, value) => setTuning((current) => withKnob(current, { knob, value })),
      setBackgroundRemoved: (isRemoved) => setTuning((current) => withBackground(current, { on: isRemoved })),
      resetTuning: () => setTuning(DEFAULT_TUNING),
      setFinish,
      applyGildingPreset,
      setGildingRamp: (rampId) => { setGilding((params) => ({ ...params, rampId })); setGildingPresetId(null); },
      setGildingTone: (key, sliderValue) => { setGilding((params) => withGildingTone(params, { key, sliderValue })); setGildingPresetId(null); },
      setFrame,
      toggleShimmer: () => setShimmering((value) => !value),
      toggleFineTuning: () => setFineTuning((value) => !value),
      applySampleDefaults: () => {
        setBackdrop(STUDIO_DEFAULTS.backdrop);
        setFinish(STUDIO_DEFAULTS.finish);
        setFrame(STUDIO_DEFAULTS.frame);
        setTuning(DEFAULT_TUNING);
        applyGildingPreset(STUDIO_DEFAULTS.gilding);
      },
    };
  }, []);

  return { backdrop, tuning, finish, frame, gilding, gildingPresetId, isShimmering, isFineTuning, ...actions };
}
