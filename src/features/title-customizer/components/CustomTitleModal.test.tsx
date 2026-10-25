// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE } from '@/features/premiere';
import { setupDomTests } from '@/test/dom';
import { CustomTitleModal } from './CustomTitleModal';
import { HERO_TITLE_PRESETS } from '../data/titlePresets';

setupDomTests();

const renderModal = (overrides: Partial<Parameters<typeof CustomTitleModal>[0]> = {}) =>
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
  it('renders nothing when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('title-customizer__dialog')).toBeNull();
  });

  it('starts from the supplied config', () => {
    renderModal();
    expect((screen.getByTestId('title-customizer__main-title') as HTMLInputElement).value).toBe(
      DEFAULT_HERO_TITLE.mainTitle
    );
  });

  it('applies a normalised config and closes', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    renderModal({ onApply, onClose });
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
    renderModal();
    await userEvent.click(screen.getAllByTestId('title-customizer__preset')[0]);
    expect((screen.getByTestId('title-customizer__main-title') as HTMLInputElement).value).toBe(
      preset.config.mainTitle
    );
  });

  it('closes from the header button', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.click(screen.getByTestId('title-customizer__close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape from inside the dialog', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.click(screen.getByTestId('title-customizer__main-title'));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('toggles the pinstripe alternation in the draft', () => {
    renderModal();
    const toggle = screen.getByTestId('title-customizer__pinstripe') as HTMLInputElement;
    const before = toggle.checked;
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(!before);
  });
});
