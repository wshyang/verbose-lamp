// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import {
  BACKDROP_PRESETS,
  DEFAULT_PATTERNS,
  ENAMEL_PALETTES,
  PATTERN_KNOBS,
  patternKnobValue,
} from '@/features/enamel-backdrop';
import { useAvatarLook } from '../hooks/useAvatarLook';
import type { AvatarLook } from '../hooks/useAvatarLook';
import { BackdropControls } from './BackdropControls';

setupDomTests();

/** A real look, so the controls read genuine state. */
const look = () => renderHook(() => useAvatarLook()).result.current;

const spies = (value: AvatarLook): AvatarLook => ({
  ...value,
  applyBackdropPreset: vi.fn(),
  choosePattern: vi.fn(),
  setPatternKnob: vi.fn(),
  setSpecKnob: vi.fn(),
  choosePalette: vi.fn(),
  setColour: vi.fn(),
  setInlay: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BackdropControls', () => {
  it('lists every preset, pattern, palette and inlay', () => {
    const value = spies(look());
    render(<BackdropControls look={value} />);

    expect(screen.getAllByTestId('avatar-studio__backdrop-preset')).toHaveLength(BACKDROP_PRESETS.length);
    expect(screen.getAllByTestId('avatar-studio__pattern')).toHaveLength(Object.keys(DEFAULT_PATTERNS).length);
    expect(screen.getAllByTestId('avatar-studio__palette')).toHaveLength(ENAMEL_PALETTES.length);
    expect(screen.getAllByTestId('avatar-studio__inlay')).toHaveLength(2);
  });

  it('marks the active preset, pattern and palette', () => {
    const value = spies(look());
    render(<BackdropControls look={value} />);

    const presets = screen.getAllByTestId('avatar-studio__backdrop-preset');
    expect(presets[0].getAttribute('aria-pressed')).toBe('true');

    const patterns = screen.getAllByTestId('avatar-studio__pattern');
    const activePattern = patterns.find((chip) => chip.getAttribute('aria-pressed') === 'true');
    expect(activePattern).toBeDefined();
  });

  it('applies a preset', () => {
    const value = spies(look());
    render(<BackdropControls look={value} />);

    fireEvent.click(screen.getAllByTestId('avatar-studio__backdrop-preset')[1]);

    expect(value.applyBackdropPreset).toHaveBeenCalledWith(BACKDROP_PRESETS[1]);
  });

  it('switches the pattern kind', () => {
    const value = spies(look());
    render(<BackdropControls look={value} />);

    fireEvent.click(screen.getAllByTestId('avatar-studio__pattern')[1]);

    expect(value.choosePattern).toHaveBeenCalledTimes(1);
  });

  it('applies a palette', () => {
    const value = spies(look());
    render(<BackdropControls look={value} />);

    fireEvent.click(screen.getAllByTestId('avatar-studio__palette')[1]);

    expect(value.choosePalette).toHaveBeenCalledWith(ENAMEL_PALETTES[1]);
  });

  it('edits both enamel colours', () => {
    const value = spies(look());
    render(<BackdropControls look={value} />);

    fireEvent.change(screen.getByTestId('avatar-studio__colour-one'), {
      target: { value: '#112233' },
    });
    expect(value.setColour).toHaveBeenCalledWith('colourOne', '#112233');

    fireEvent.change(screen.getByTestId('avatar-studio__colour-two'), {
      target: { value: '#445566' },
    });
    expect(value.setColour).toHaveBeenCalledWith('colourTwo', '#445566');
  });

  it('switches the inlay style', () => {
    const value = spies(look());
    render(<BackdropControls look={value} />);

    fireEvent.click(screen.getAllByTestId('avatar-studio__inlay')[1]);

    expect(value.setInlay).toHaveBeenCalledWith('gilded-bands');
  });

  it('exposes the band count and one slider per pattern knob', () => {
    const value = spies(look());
    render(<BackdropControls look={value} />);

    fireEvent.change(screen.getByTestId('avatar-studio__bands'), { target: { value: '3' } });
    expect(value.setSpecKnob).toHaveBeenCalledWith('bands', 3);

    const knob = PATTERN_KNOBS[value.backdrop.pattern.kind][0];
    const sliders = screen.getAllByTestId('avatar-studio__pattern-knob');
    expect(sliders).toHaveLength(PATTERN_KNOBS[value.backdrop.pattern.kind].length);

    fireEvent.change(sliders[0], { target: { value: String(knob.max) } });
    expect(value.setPatternKnob).toHaveBeenCalledWith(knob.key, knob.max);
    expect(patternKnobValue(value.backdrop.pattern, knob.key)).toBeGreaterThanOrEqual(knob.min);
  });

  it('exposes the gilt finish knobs', () => {
    const value = spies(look());
    render(<BackdropControls look={value} />);

    for (const testId of [
      'avatar-studio__gilt',
      'avatar-studio__wire-width',
      'avatar-studio__leaf-density',
      'avatar-studio__guilloche',
    ]) {
      fireEvent.change(screen.getByTestId(testId), { target: { value: '0.5' } });
    }

    expect(value.setSpecKnob).toHaveBeenCalledTimes(4);
    expect(value.setSpecKnob).toHaveBeenCalledWith('gilt', 0.5);
  });

  it('is announced as a titled section', () => {
    const value = spies(look());
    render(<BackdropControls look={value} />);

    const section = screen.getByRole('region', { name: 'ENAMEL BACKDROP' });
    expect(section.tagName).toBe('SECTION');
  });
});
