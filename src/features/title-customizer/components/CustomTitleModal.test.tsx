// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE } from '@/features/premiere';
import { CustomTitleModal } from './CustomTitleModal';

function renderModal(overrides: Partial<Parameters<typeof CustomTitleModal>[0]> = {}) {
  const handlers = { onApply: vi.fn(), onClose: vi.fn() };
  render(
    <CustomTitleModal
      open
      config={DEFAULT_HERO_TITLE}
      {...handlers}
      {...overrides}
    />
  );
  return handlers;
}

describe('CustomTitleModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('title-customizer__dialog')).toBeNull();
  });

  it('seeds every field from the current config', () => {
    renderModal();
    expect((screen.getByTestId('title-customizer__keystone') as HTMLInputElement).value).toBe('THE');
    expect((screen.getByTestId('title-customizer__pre-title') as HTMLInputElement).value).toBe('GREAT');
    expect((screen.getByTestId('title-customizer__main-title') as HTMLInputElement).value).toBe('GATSBY');
  });

  it('applies a normalised config and closes', async () => {
    const user = userEvent.setup();
    const handlers = renderModal();
    const main = screen.getByTestId('title-customizer__main-title');
    await user.clear(main);
    await user.type(main, '  carraway  ');
    await user.click(screen.getByTestId('title-customizer__apply'));
    expect(handlers.onApply).toHaveBeenCalledWith({
      ...DEFAULT_HERO_TITLE,
      mainTitle: 'CARRAWAY',
    });
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });

  it('resets the draft to the default title', async () => {
    const user = userEvent.setup();
    const handlers = renderModal({ config: { ...DEFAULT_HERO_TITLE, mainTitle: 'BUCHANAN' } });
    await user.click(screen.getByTestId('title-customizer__reset'));
    await user.click(screen.getByTestId('title-customizer__apply'));
    expect(handlers.onApply).toHaveBeenCalledWith(DEFAULT_HERO_TITLE);
  });

  it('offers presets that fill the draft', async () => {
    const user = userEvent.setup();
    renderModal();
    const preset = screen.getAllByTestId('title-customizer__preset')[0];
    await user.click(preset);
    expect((screen.getByTestId('title-customizer__keystone') as HTMLInputElement).value).not.toBe('');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const handlers = renderModal();
    // The dialog moves focus into itself on the next frame; type from a field inside it.
    await user.click(screen.getByTestId('title-customizer__keystone'));
    await user.keyboard('{Escape}');
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('closes from the X button', async () => {
    const user = userEvent.setup();
    const handlers = renderModal();
    await user.click(screen.getByTestId('title-customizer__close'));
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });
});
