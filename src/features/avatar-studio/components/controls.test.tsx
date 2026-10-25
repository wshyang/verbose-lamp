// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BACKDROP_PRESETS,
  ENAMEL_PALETTES,
  INLAY_LABELS,
  PATTERN_LABELS,
  type BackdropKind,
  type InlayStyle,
} from '@/features/enamel-backdrop';
import { GILDING_PRESETS, GOLD_RAMPS } from '@/features/gilded-portrait';
import { DEFAULT_TUNING as TUNING } from '@/features/background-removal';
import { BackdropControls } from './BackdropControls';
import { CutOutControls } from './CutOutControls';
import { GildingControls, GoldToneRow } from './GildingControls';
import { SubjectControls } from './SubjectControls';
import { RangeControl } from './studioUi';
import { makeLook } from '../testing/studioFixtures';


describe('SubjectControls', () => {
  it('picks a finish, a frame and the sheen', async () => {
    const look = makeLook();
    render(<SubjectControls look={look} />);
    const finishes = screen.getAllByTestId('avatar-studio__subject-finish');
    expect(finishes).toHaveLength(3);
    expect(finishes[0].getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(finishes[2]);
    expect(look.setFinish).toHaveBeenCalledWith('gilded');

    const frames = screen.getAllByTestId('avatar-studio__frame-shape');
    await userEvent.click(frames[1]);
    expect(look.setFrame).toHaveBeenCalledWith('plaque');

    await userEvent.click(screen.getByTestId('avatar-studio__shimmer'));
    expect(look.toggleShimmer).toHaveBeenCalledTimes(1);
  });

  it('shows the tone controls only for a gilded subject', () => {
    const gilded = render(<SubjectControls look={makeLook({ finish: 'gilded' })} />);
    expect(screen.getAllByTestId('avatar-studio__gilding-preset').length).toBe(GILDING_PRESETS.length);
    gilded.unmount();

    render(<SubjectControls look={makeLook({ finish: 'tinted' })} />);
    expect(screen.queryAllByTestId('avatar-studio__gilding-preset')).toHaveLength(0);
    expect(screen.getAllByTestId('avatar-studio__gold-tone')).toHaveLength(3);
  });
});

describe('GildingControls', () => {
  it('applies a preset, a ramp and a tone slider', () => {
    const look = makeLook();
    render(<GildingControls look={look} />);

    fireEvent.click(screen.getAllByTestId('avatar-studio__gilding-preset')[1]);
    expect(look.applyGildingPreset).toHaveBeenCalledWith(GILDING_PRESETS[1]);

    fireEvent.click(screen.getAllByTestId('avatar-studio__gold-tone')[2]);
    expect(look.setGildingRamp).toHaveBeenCalledWith(Object.values(GOLD_RAMPS)[2].id);

    const clarity = screen.getByTestId('avatar-studio__gilding-clarity') as HTMLInputElement;
    expect(clarity.value).toBe(String(Math.round(GILDING_PRESETS[0].params.clarity * 100)));
    fireEvent.change(clarity, { target: { value: '120' } });
    expect(look.setGildingTone).toHaveBeenCalledWith('clarity', 120);
    expect(screen.getByText('Levels')).toBeDefined();
  });
});

describe('GoldToneRow', () => {
  it('marks the active ramp', () => {
    render(<GoldToneRow look={makeLook({ gilding: { ...GILDING_PRESETS[0].params, rampId: 'deep' } })} />);
    const chips = screen.getAllByTestId('avatar-studio__gold-tone');
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    expect(chips[0].getAttribute('aria-pressed')).toBe('false');
  });
});

describe('CutOutControls', () => {
  it('switches the background on and off', async () => {
    const look = makeLook();
    render(<CutOutControls look={look} availability="available" />);
    const chips = screen.getAllByTestId('avatar-studio__cut-background');
    expect(chips).toHaveLength(2);
    await userEvent.click(chips[1]);
    expect(look.setBackgroundRemoved).toHaveBeenCalledWith(false);

    await userEvent.click(chips[0]);
    expect(look.setBackgroundRemoved).toHaveBeenCalledWith(true);
  });

  it('explains a pending or unavailable cut-out and disables the choice', () => {
    const pending = render(<CutOutControls look={makeLook()} availability="pending" />);
    expect(screen.getByText(/Lifting the background/)).toBeDefined();
    expect(screen.getAllByTestId('avatar-studio__cut-background')[0]).toHaveProperty('disabled', true);
    pending.unmount();

    render(<CutOutControls look={makeLook()} availability="unavailable" />);
    expect(screen.getByText(/could not be removed/)).toBeDefined();
  });

  it('shows the step chips, the fine-tune sliders and the reset', async () => {
    const look = makeLook();
    render(<CutOutControls look={look} availability="available" />);
    expect(screen.getAllByTestId('avatar-studio__cut-threshold').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('avatar-studio__cut-strays').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('avatar-studio__cut-edge').length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByTestId('avatar-studio__cut-edge')[0]);
    expect(look.setTuningKnob).toHaveBeenCalledWith('edge', expect.any(Number));

    await userEvent.click(screen.getByTestId('avatar-studio__cut-fine-toggle'));
    expect(look.toggleFineTuning).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByTestId('avatar-studio__cut-reset'));
    expect(look.resetTuning).toHaveBeenCalledTimes(1);
  });

  it('renders the fine-tune sliders only when fine tuning is on', () => {
    const look = makeLook({ isFineTuning: true });
    render(<CutOutControls look={look} availability="available" />);
    const slider = screen
      .getAllByTestId('avatar-studio__cut-threshold')
      .find((element) => element.tagName === 'INPUT') as HTMLInputElement;
    expect(slider).toBeDefined();
    fireEvent.change(slider, { target: { value: '40' } });
    expect(look.setTuningKnob).toHaveBeenCalledWith('threshold', 40);
  });

  it('hides the step chips when the background is kept', () => {
    render(
      <CutOutControls
        look={makeLook({ tuning: { ...TUNING, removeBackground: false } })}
        availability="available"
      />,
    );
    expect(screen.queryAllByTestId('avatar-studio__cut-threshold')).toHaveLength(0);
  });
});

describe('BackdropControls', () => {
  it('applies presets, pattern kinds, palettes and inlays', async () => {
    const look = makeLook();
    render(<BackdropControls look={look} />);

    await userEvent.click(screen.getAllByTestId('avatar-studio__backdrop-preset')[1]);
    expect(look.applyBackdropPreset).toHaveBeenCalledWith(BACKDROP_PRESETS[1]);

    const kinds = screen.getAllByTestId('avatar-studio__pattern');
    expect(kinds).toHaveLength(Object.keys(PATTERN_LABELS).length);
    const chevronIndex = (Object.keys(PATTERN_LABELS) as BackdropKind[]).indexOf('chevron');
    await userEvent.click(kinds[chevronIndex]);
    expect(look.choosePattern).toHaveBeenCalledWith('chevron');

    await userEvent.click(screen.getAllByTestId('avatar-studio__palette')[1]);
    expect(look.choosePalette).toHaveBeenCalledWith(ENAMEL_PALETTES[1]);

    const inlays = screen.getAllByTestId('avatar-studio__inlay');
    expect(inlays).toHaveLength(Object.keys(INLAY_LABELS).length);
    await userEvent.click(inlays[1]);
    expect(look.setInlay).toHaveBeenCalledWith(Object.keys(INLAY_LABELS)[1] as InlayStyle);
  });

  it('edits both enamel colours', () => {
    const look = makeLook();
    render(<BackdropControls look={look} />);
    fireEvent.change(screen.getByTestId('avatar-studio__colour-one'), { target: { value: '#123456' } });
    expect(look.setColour).toHaveBeenCalledWith('colourOne', '#123456');
    fireEvent.change(screen.getByTestId('avatar-studio__colour-two'), { target: { value: '#654321' } });
    expect(look.setColour).toHaveBeenCalledWith('colourTwo', '#654321');
  });

  it('drives the band, pattern and finish sliders', () => {
    const look = makeLook();
    render(<BackdropControls look={look} />);

    fireEvent.change(screen.getByTestId('avatar-studio__bands'), { target: { value: '4' } });
    expect(look.setSpecKnob).toHaveBeenCalledWith('bands', 4);

    const patternKnobs = screen.getAllByTestId('avatar-studio__pattern-knob');
    expect(patternKnobs.length).toBeGreaterThan(0);
    fireEvent.change(patternKnobs[0], { target: { value: '6' } });
    expect(look.setPatternKnob).toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('avatar-studio__gilt'), { target: { value: '0.5' } });
    expect(look.setSpecKnob).toHaveBeenCalledWith('gilt', 0.5);
    fireEvent.change(screen.getByTestId('avatar-studio__wire-width'), { target: { value: '2' } });
    expect(look.setSpecKnob).toHaveBeenCalledWith('wireWidth', 2);
    expect(screen.getByTestId('avatar-studio__leaf-density')).toBeDefined();
    expect(screen.getByTestId('avatar-studio__guilloche')).toBeDefined();
  });
});

describe('RangeControl', () => {
  it('dims itself while disabled', () => {
    const { container } = render(
      <RangeControl
        id="studio__range"
        label="Brightness"
        min={0}
        max={1}
        step={0.1}
        value={0.5}
        displayValue="50%"
        testId="studio__range"
        onChange={vi.fn()}
        isDisabled
      />,
    );
    expect(container.querySelector('label')?.className).toContain('opacity-40');
    expect(container.querySelector('input')?.getAttribute('id')).toBe('studio__range');
  });

  it('stays bright while enabled', () => {
    const { container } = render(
      <RangeControl
        id="studio__range-on"
        label="Brightness"
        min={0}
        max={1}
        step={0.1}
        value={0.5}
        displayValue="50%"
        testId="studio__range-on"
        onChange={vi.fn()}
      />,
    );
    expect(container.querySelector('label')?.className).not.toContain('opacity-40');
  });
});
