// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE } from '@/features/premiere/data/sequence';
import { HERO_TITLE_PRESETS } from '../data/titlePresets';
import { CustomTitleModal } from './CustomTitleModal';
import { setupDomTests } from '@/test/dom';

setupDomTests();
const renderModal_p6 = (overrides: Partial<Parameters<typeof CustomTitleModal>[0]> = {}) =>
  render(
    <CustomTitleModal
      open
      config={DEFAULT_HERO_TITLE}
      onApply={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />
  );
describe('CustomTitleModal', () => {
  it('starts from the supplied config', () => {
    renderModal_p6();
    expect((screen.getByTestId('title-customizer__main-title') as HTMLInputElement).value).toBe(
      DEFAULT_HERO_TITLE.mainTitle
    );
  });

  it('applies a normalised config and closes', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    renderModal_p6({ onApply, onClose });
    fireEvent.change(screen.getByTestId('title-customizer__main-title'), {
      target: { value: '  caraway  ' },
    });
    await userEvent.click(screen.getByTestId('title-customizer__apply'));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ mainTitle: 'CARAWAY' })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fills the fields from a preset', async () => {
    const preset = HERO_TITLE_PRESETS[0];
    renderModal_p6();
    await userEvent.click(screen.getAllByTestId('title-customizer__preset')[0]);
    expect((screen.getByTestId('title-customizer__main-title') as HTMLInputElement).value).toBe(
      preset.config.mainTitle
    );
  });

  it('uppercases the keystone, frieze line and credit as they are typed', () => {
    renderModal_p6();

    for (const [testId, value] of [
      ['title-customizer__keystone', 'great'],
      ['title-customizer__pre-title', 'the'],
      ['title-customizer__credit', 'from the novel'],
    ] as const) {
      const field = screen.getByTestId(testId) as HTMLInputElement;
      fireEvent.change(field, { target: { value } });
      expect(field.value).toBe(value.toUpperCase());
    }
  });

  it('resets the draft to the delivered title, without applying it', async () => {
    const onApply = vi.fn();
    renderModal_p6({ onApply });
    fireEvent.change(screen.getByTestId('title-customizer__main-title'), { target: { value: 'caraway' } });

    await userEvent.click(screen.getByTestId('title-customizer__reset'));

    expect((screen.getByTestId('title-customizer__main-title') as HTMLInputElement).value).toBe(
      DEFAULT_HERO_TITLE.mainTitle
    );
    expect(onApply).not.toHaveBeenCalled();
  });

  it('toggles the pinstripe alternation in the draft', () => {
    renderModal_p6();
    const toggle = screen.getByTestId('title-customizer__pinstripe') as HTMLInputElement;
    const before = toggle.checked;
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(!before);
  });
});
