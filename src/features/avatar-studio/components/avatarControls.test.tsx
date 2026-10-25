// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TUNING } from '@/features/background-removal';
import { DEFAULT_BACKDROPS } from '@/features/enamel-backdrop';
import { GILDING_PRESETS } from '@/features/gilded-portrait';
import type { AvatarLook } from '../hooks/useAvatarLook';
import { BackdropControls } from './BackdropControls';
import { CutOutControls } from './CutOutControls';
import { GildingControls, GoldToneRow } from './GildingControls';
import { SubjectControls } from './SubjectControls';
import { Chip, RangeControl } from './studioUi';

function look(overrides: Record<string, unknown> = {}): AvatarLook {
  return {
    backdrop: { ...DEFAULT_BACKDROPS[0].spec },
    tuning: DEFAULT_TUNING,
    finish: 'natural',
    frame: 'medallion',
    gilding: GILDING_PRESETS[0].params,
    gildingPresetId: GILDING_PRESETS[0].id,
    isShimmering: true,
    isFineTuning: false,
    applyBackdropPreset: vi.fn(), choosePattern: vi.fn(), setPatternKnob: vi.fn(),
    setSpecKnob: vi.fn(), choosePalette: vi.fn(), setColour: vi.fn(), setInlay: vi.fn(),
    setTuningKnob: vi.fn(), setBackgroundRemoved: vi.fn(), resetTuning: vi.fn(),
    setFinish: vi.fn(), applyGildingPreset: vi.fn(), setGildingRamp: vi.fn(),
    setGildingTone: vi.fn(), setFrame: vi.fn(), toggleShimmer: vi.fn(),
    toggleFineTuning: vi.fn(), applySampleDefaults: vi.fn(),
    ...overrides,
  } as AvatarLook;
}

const fn = (value: AvatarLook, key: string) => value[key as keyof AvatarLook] as ReturnType<typeof vi.fn>;

describe('BackdropControls', () => {
  it('forwards presets, patterns, palettes, colours, inlay, and all ranges', async () => {
    const user = userEvent.setup();
    const current = look();
    render(<BackdropControls look={current} />);
    await user.click(screen.getAllByTestId('avatar-studio__backdrop-preset')[1]);
    await user.click(screen.getAllByTestId('avatar-studio__pattern')[1]);
    await user.click(screen.getAllByTestId('avatar-studio__palette')[1]);
    fireEvent.change(screen.getByTestId('avatar-studio__colour-one'), { target: { value: '#112233' } });
    fireEvent.change(screen.getByTestId('avatar-studio__colour-two'), { target: { value: '#445566' } });
    await user.click(screen.getAllByTestId('avatar-studio__inlay')[1]);
    fireEvent.change(screen.getByTestId('avatar-studio__bands'), { target: { value: '3' } });
    for (const knob of screen.getAllByTestId('avatar-studio__pattern-knob')) {
      fireEvent.change(knob, { target: { value: knob.getAttribute('min') } });
    }
    fireEvent.change(screen.getByTestId('avatar-studio__gilt'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByTestId('avatar-studio__wire-width'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByTestId('avatar-studio__leaf-density'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByTestId('avatar-studio__guilloche'), { target: { value: '0.5' } });
    expect(fn(current, 'applyBackdropPreset')).toHaveBeenCalledOnce();
    expect(fn(current, 'choosePattern')).toHaveBeenCalledWith('radiance');
    expect(fn(current, 'setColour')).toHaveBeenCalledWith('colourTwo', '#445566');
    expect(fn(current, 'setPatternKnob')).toHaveBeenCalledTimes(2);
    expect(fn(current, 'setSpecKnob')).toHaveBeenCalledWith('guilloche', 0.5);
  });

  it('honours an explicit inlay value', () => {
    const current = look({ backdrop: { ...DEFAULT_BACKDROPS[0].spec, inlay: 'gilded-bands' } });
    render(<BackdropControls look={current} />);
    expect(screen.getAllByTestId('avatar-studio__inlay')[1].getAttribute('aria-pressed')).toBe('true');
  });
});

describe('CutOutControls', () => {
  it('shows all coarse and fine controls when cutting is available', async () => {
    const user = userEvent.setup();
    const current = look({ isFineTuning: true });
    render(<CutOutControls look={current} availability="available" />);
    await user.click(screen.getAllByTestId('avatar-studio__cut-background')[0]);
    await user.click(screen.getAllByTestId('avatar-studio__cut-background')[1]);
    await user.click(screen.getAllByTestId('avatar-studio__cut-threshold')[1]);
    await user.click(screen.getAllByTestId('avatar-studio__cut-strays')[0]);
    await user.click(screen.getAllByTestId('avatar-studio__cut-edge')[0]);
    fireEvent.change(screen.getAllByTestId('avatar-studio__cut-threshold').at(-1)!, { target: { value: '20' } });
    await user.click(screen.getByTestId('avatar-studio__cut-fine-toggle'));
    await user.click(screen.getByTestId('avatar-studio__cut-reset'));
    expect(fn(current, 'setBackgroundRemoved')).toHaveBeenCalledWith(false);
    expect(fn(current, 'toggleFineTuning')).toHaveBeenCalledOnce();
    expect(fn(current, 'resetTuning')).toHaveBeenCalledOnce();
  });

  it('hides cut controls when background stays and explains pending/unavailable states', () => {
    const off = look({ tuning: { ...DEFAULT_TUNING, removeBackground: false } });
    const { rerender } = render(<CutOutControls look={off} availability="available" />);
    expect(screen.queryByTestId('avatar-studio__cut-fine-toggle')).toBeNull();
    rerender(<CutOutControls look={look()} availability="pending" />);
    expect(screen.getByText(/Lifting the background/)).toBeTruthy();
    expect((screen.getAllByTestId('avatar-studio__cut-background')[0] as HTMLButtonElement).disabled).toBe(true);
    rerender(<CutOutControls look={look()} availability="unavailable" />);
    expect(screen.getByText(/showing the full photo/)).toBeTruthy();
    rerender(<CutOutControls look={look({ isFineTuning: false })} availability="available" />);
    expect(screen.getAllByTestId('avatar-studio__cut-threshold')).toHaveLength(3);
  });
});

describe('Subject and gilding controls', () => {
  it('selects finishes and frames and toggles shimmer', async () => {
    const user = userEvent.setup();
    const current = look();
    render(<SubjectControls look={current} />);
    await user.click(screen.getAllByTestId('avatar-studio__subject-finish')[1]);
    await user.click(screen.getAllByTestId('avatar-studio__frame-shape')[1]);
    await user.click(screen.getByTestId('avatar-studio__shimmer'));
    expect(fn(current, 'setFinish')).toHaveBeenCalledWith('tinted');
    expect(fn(current, 'setFrame')).toHaveBeenCalledWith('plaque');
    expect(fn(current, 'toggleShimmer')).toHaveBeenCalledOnce();
  });

  it('shows the gold tone row for tinted subjects and forwards ramp choices', async () => {
    const user = userEvent.setup();
    const current = look({ finish: 'tinted' });
    render(<SubjectControls look={current} />);
    await user.click(screen.getAllByTestId('avatar-studio__gold-tone')[1]);
    expect(fn(current, 'setGildingRamp')).toHaveBeenCalledOnce();
  });

  it('shows full gilding presets and every tone slider for gilded subjects', async () => {
    const user = userEvent.setup();
    const current = look({ finish: 'gilded' });
    render(<SubjectControls look={current} />);
    await user.click(screen.getAllByTestId('avatar-studio__gilding-preset')[1]);
    for (const key of ['clarity', 'levels', 'folds'] as const) {
      const slider = screen.getByTestId(`avatar-studio__gilding-${key}`);
      fireEvent.change(slider, { target: { value: slider.getAttribute('min') } });
    }
    expect(fn(current, 'applyGildingPreset')).toHaveBeenCalledOnce();
    expect(fn(current, 'setGildingTone')).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('avatar-studio__gilding-clarity').closest('label')?.textContent).toContain('%');
  });

  it('GoldToneRow can stand alone', () => {
    render(<GoldToneRow look={look()} />);
    expect(screen.getAllByTestId('avatar-studio__gold-tone').length).toBeGreaterThan(1);
  });

  it('GildingControls renders standalone', () => {
    render(<GildingControls look={look()} />);
    expect(screen.getAllByTestId('avatar-studio__gilding-preset')).toHaveLength(GILDING_PRESETS.length);
  });
});

describe('studio UI primitives', () => {
  it('covers active/idle/disabled chips and enabled/disabled ranges', () => {
    const onClick = vi.fn();
    const onChange = vi.fn();
    const { rerender } = render(
      <>
        <Chip isActive onClick={onClick} testId="chip">Active</Chip>
        <RangeControl id="range" label="Range" min={0} max={2} step={1} value={1} displayValue="1" testId="range" onChange={onChange} />
      </>
    );
    fireEvent.change(screen.getByTestId('range'), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith(2);
    rerender(
      <>
        <Chip isActive={false} onClick={onClick} testId="chip" isDisabled title="No">Idle</Chip>
        <RangeControl id="range" label="Range" min={0} max={2} step={1} value={1} displayValue="1" testId="range" onChange={onChange} isDisabled />
      </>
    );
    expect((screen.getByTestId('chip') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('range') as HTMLInputElement).disabled).toBe(true);
  });
});
