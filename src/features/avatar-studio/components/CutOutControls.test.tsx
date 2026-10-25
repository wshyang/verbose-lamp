// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { CUT_OUT_STEPS } from '@/features/background-removal';
import { useAvatarLook } from '../hooks/useAvatarLook';
import type { AvatarLook } from '../hooks/useAvatarLook';
import type { CutOutAvailability } from '../hooks/usePhotoSession';
import { CutOutControls } from './CutOutControls';
import { STAGE_HINTS } from '../stage';

setupDomTests();

const look = (): AvatarLook => renderHook(() => useAvatarLook()).result.current;

const spies = (value: AvatarLook): AvatarLook => ({
  ...value,
  setBackgroundRemoved: vi.fn(),
  setTuningKnob: vi.fn(),
  toggleFineTuning: vi.fn(),
  resetTuning: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

const mount = (availability: CutOutAvailability = 'available', value = spies(look())) => ({
  value,
  ...render(<CutOutControls look={value} availability={availability} />),
});

describe('CutOutControls', () => {
  it('offers both sides of the background decision', () => {
    const { value } = mount();

    const chips = screen.getAllByTestId('avatar-studio__cut-background');
    expect(chips.map((chip) => chip.textContent)).toEqual(['Take it out', 'Leave it in']);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(chips[1]);
    expect(value.setBackgroundRemoved).toHaveBeenCalledWith(false);

    fireEvent.click(chips[0]);
    expect(value.setBackgroundRemoved).toHaveBeenCalledWith(true);
  });

  it('disables the decision while the matte is not ready', () => {
    mount('pending');

    for (const chip of screen.getAllByTestId('avatar-studio__cut-background')) {
      expect((chip as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('explains a pending or unavailable matte', () => {
    const pending = mount('pending');
    expect(screen.getByText(STAGE_HINTS.refining)).toBeTruthy();
    pending.unmount();

    mount('unavailable');
    expect(screen.getByText(STAGE_HINTS.plain)).toBeTruthy();
  });

  it('shows the cut steps only while the background is being removed', () => {
    const { value, unmount } = mount();
    expect(screen.getAllByTestId('avatar-studio__cut-threshold')).toHaveLength(
      CUT_OUT_STEPS.threshold.length
    );
    unmount();

    const leftIn = spies({ ...value, tuning: { ...value.tuning, removeBackground: false } });
    mount('available', leftIn);

    expect(screen.queryAllByTestId('avatar-studio__cut-threshold')).toHaveLength(0);
    expect(screen.queryByTestId('avatar-studio__cut-fine-toggle')).toBeNull();
  });

  it('applies a step from each row', () => {
    const { value } = mount();

    fireEvent.click(screen.getAllByTestId('avatar-studio__cut-threshold')[2]);
    expect(value.setTuningKnob).toHaveBeenCalledWith('threshold', CUT_OUT_STEPS.threshold[2].value);

    fireEvent.click(screen.getAllByTestId('avatar-studio__cut-strays')[1]);
    expect(value.setTuningKnob).toHaveBeenCalledWith('minIsland', CUT_OUT_STEPS.minIsland[1].value);

    fireEvent.click(screen.getAllByTestId('avatar-studio__cut-edge')[0]);
    expect(value.setTuningKnob).toHaveBeenCalledWith('edge', CUT_OUT_STEPS.edge[0].value);
  });

  it('toggles and resets the fine-tuning panel', () => {
    const { value } = mount();

    fireEvent.click(screen.getByTestId('avatar-studio__cut-fine-toggle'));
    expect(value.toggleFineTuning).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('avatar-studio__cut-reset'));
    expect(value.resetTuning).toHaveBeenCalledTimes(1);
  });

  it('opens the continuous knobs only when fine tuning is on', () => {
    const { value, unmount } = mount();
    // Steps are chips, not sliders.
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
    unmount();

    const fine = spies({ ...value, isFineTuning: true });
    mount('available', fine);

    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(3);

    fireEvent.change(screen.getByLabelText('Cut'), { target: { value: '96' } });
    expect(fine.setTuningKnob).toHaveBeenCalledWith('threshold', 96);
  });
});
