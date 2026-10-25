import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  type AvatarBackdropPattern,
  DEFAULT_AVATAR_LOOK_CODE,
  DEFAULT_SUNBURST,
  formatAvatarLook,
  readAvatarLook,
} from '@psd/contracts';
import { DEFAULT_TUNING, type CutOutTuning } from '../../lib/avatar/cutOut.js';
import { avatarUrl } from '../../lib/avatars.js';
import { CutOutControls } from './CutOutControls.js';

/**
 * ADR-073/077/078 — the cut-out panel's wiring and its two conditional shapes.
 *
 * A component test rather than a hook test because everything here is presentation and wiring: which
 * rows exist, which button claims to be pressed, what is disabled. The arithmetic lives in
 * `lib/avatar/cutOut.ts` and is tested there.
 *
 * Deliberately asserts `disabled` *separately* from presence. ADR-078 asks for two buttons that stay
 * visible and go grey, and a test that only checked they were unusable would pass if they vanished
 * (AGENTS-testing.md §1.1).
 */

/**
 * A real sprite code, so `photoSpriteUrl` parses it and the preview renders: 64×64 (the format only
 * accepts 64 or 128), two colours, and one run covering every cell.
 */
const SPRITE = `64:1d5b8c,12243a:0${(64 * 64).toString(36).padStart(3, '0')}`;

interface Overrides {
  tuning?: Partial<CutOutTuning>;
  hasMask?: boolean;
  sprite?: string | null;
  sunburst?: AvatarBackdropPattern | null;
  isWorking?: boolean;
}

function setup(overrides?: Overrides) {
  const onKnob = vi.fn();
  const onBackground = vi.fn();
  const onReset = vi.fn();
  render(
    <CutOutControls
      tuning={{ ...DEFAULT_TUNING, ...overrides?.tuning }}
      sprite={overrides?.sprite === undefined ? SPRITE : overrides.sprite}
      sunburst={overrides?.sunburst ?? null}
      isWorking={overrides?.isWorking ?? false}
      hasMask={overrides?.hasMask ?? true}
      onKnob={onKnob}
      onBackground={onBackground}
      onReset={onReset}
    />,
  );
  return { onKnob, onBackground, onReset, user: userEvent.setup() };
}

describe('CutOutControls', () => {
  it('offers all three knobs when there is a matte, and marks the current step', () => {
    setup();

    expect(screen.getAllByTestId('cut-out-controls__threshold')).toHaveLength(3);
    expect(screen.getAllByTestId('cut-out-controls__minIsland')).toHaveLength(2);
    expect(screen.getAllByTestId('cut-out-controls__edge')).toHaveLength(3);
    // Defaults are Normal / Remove / As-is.
    expect(screen.getAllByTestId('cut-out-controls__threshold')[1]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByTestId('cut-out-controls__minIsland')[1]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByTestId('cut-out-controls__edge')[1]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('drops the cut-out strength row when no model answered', () => {
    setup({ hasMask: false });

    expect(screen.queryAllByTestId('cut-out-controls__threshold')).toHaveLength(0);
    expect(screen.getAllByTestId('cut-out-controls__minIsland')).toHaveLength(2);
    expect(screen.getAllByTestId('cut-out-controls__edge')).toHaveLength(3);
  });

  it('reports a knob press with the step that was tapped', async () => {
    const { onKnob, user } = setup();

    await user.click(screen.getAllByTestId('cut-out-controls__threshold')[2] as HTMLElement);

    expect(onKnob).toHaveBeenCalledWith({ knob: 'threshold', value: 176 });
  });

  it('reports the background choice both ways', async () => {
    const { onBackground, user } = setup();

    await user.click(screen.getAllByTestId('cut-out-controls__background')[1] as HTMLElement);
    expect(onBackground).toHaveBeenCalledWith({ on: false });

    await user.click(screen.getAllByTestId('cut-out-controls__background')[0] as HTMLElement);
    expect(onBackground).toHaveBeenCalledWith({ on: true });
  });

  it('reports a reset', async () => {
    const { onReset, user } = setup();

    await user.click(screen.getByTestId('cut-out-controls__reset'));

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  describe('the fine-tune disclosure', () => {
    it('starts shut and opens onto a slider per row', async () => {
      const { user } = setup();
      const toggle = screen.getByTestId('cut-out-controls__fine-toggle');

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByTestId('cut-out-controls__threshold-range')).toBeNull();

      await user.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('cut-out-controls__threshold-range')).toBeVisible();
      expect(screen.getByTestId('cut-out-controls__threshold-value')).toHaveTextContent('128');

      await user.click(toggle);

      expect(screen.queryByTestId('cut-out-controls__threshold-range')).toBeNull();
    });

    /*
     * `fireEvent.change` rather than a keypress: jsdom does not implement keyboard stepping on a range
     * input, so arrow keys move nothing there. What matters is the wiring either way — the handler
     * must hand the knob a *number*, since `event.target.value` is a string and `withKnob` rounds it.
     */
    it('reports a moved slider as a number, not a string', async () => {
      const { onKnob, user } = setup();
      await user.click(screen.getByTestId('cut-out-controls__fine-toggle'));

      fireEvent.change(screen.getByTestId('cut-out-controls__edge-range'), {
        target: { value: '1' },
      });

      expect(onKnob).toHaveBeenCalledWith({ knob: 'edge', value: 1 });
    });
  });

  describe('with the cut-out turned off (ADR-077/078)', () => {
    const off: Overrides = { tuning: { removeBackground: false } };

    it('takes the three knob rows away entirely', () => {
      setup(off);

      expect(screen.queryAllByTestId('cut-out-controls__threshold')).toHaveLength(0);
      expect(screen.queryAllByTestId('cut-out-controls__minIsland')).toHaveLength(0);
      expect(screen.queryAllByTestId('cut-out-controls__edge')).toHaveLength(0);
    });

    it('keeps the two actions on screen and greys them out', () => {
      setup(off);

      const toggle = screen.getByTestId('cut-out-controls__fine-toggle');
      const reset = screen.getByTestId('cut-out-controls__reset');
      expect(toggle).toBeVisible();
      expect(toggle).toBeDisabled();
      expect(reset).toBeVisible();
      expect(reset).toBeDisabled();
    });

    it('reports the disclosure shut, with no sliders behind it', () => {
      setup(off);

      expect(screen.getByTestId('cut-out-controls__fine-toggle')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      expect(screen.queryByTestId('cut-out-controls__threshold-range')).toBeNull();
    });

    it('marks "Leave it in" as the pressed choice', () => {
      setup(off);

      const [takeOut, leaveIn] = screen.getAllByTestId('cut-out-controls__background');
      expect(takeOut).toHaveAttribute('aria-pressed', 'false');
      expect(leaveIn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('the preview', () => {
    it('renders the sprite when there is one', () => {
      setup();

      expect(screen.getByTestId('cut-out-controls__preview')).toBeVisible();
    });

    it('shows nothing rather than a broken image when there is no sprite', () => {
      setup({ sprite: null });

      expect(screen.queryByTestId('cut-out-controls__preview')).toBeNull();
    });

    it('shows nothing when the sprite will not parse', () => {
      setup({ sprite: 'not-a-sprite' });

      expect(screen.queryByTestId('cut-out-controls__preview')).toBeNull();
    });

    it('paints the chosen pattern into the square, as the saved picture has it (ADR-225)', () => {
      setup({ sunburst: DEFAULT_SUNBURST });

      // The address the studio gives this photograph with this look: the same one as the thumbnail and the preview.
      const saved = avatarUrl({
        gender: 'female',
        avatarVariant: 1,
        avatarPhoto: SPRITE,
        avatarLook: formatAvatarLook({ ...readAvatarLook(DEFAULT_AVATAR_LOOK_CODE), sunburst: DEFAULT_SUNBURST }),
      });
      expect(screen.getByTestId('cut-out-controls__preview')).toHaveAttribute('src', saved);
    });

    it('shows the plain colour when no pattern is chosen (ADR-225)', () => {
      setup();

      const saved = avatarUrl({
        gender: 'female',
        avatarVariant: 1,
        avatarPhoto: SPRITE,
        avatarLook: DEFAULT_AVATAR_LOOK_CODE,
      });
      expect(screen.getByTestId('cut-out-controls__preview')).toHaveAttribute('src', saved);
    });

    it('says when it is still catching up', () => {
      setup({ isWorking: true });

      expect(screen.getByTestId('cut-out-controls__state')).toHaveTextContent('Just a moment');
    });

    it('invites a tap once it has caught up', () => {
      setup();

      expect(screen.getByTestId('cut-out-controls__state')).toHaveTextContent(
        'Tap a choice to see it change.',
      );
    });
  });
});
