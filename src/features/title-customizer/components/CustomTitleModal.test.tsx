// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE } from '@/features/premiere';
import { normalizeHeroTitle } from '../model/normalizeHeroTitle';
import { CustomTitleModal } from './CustomTitleModal';

function renderModal() {
  const handlers = { onApply: vi.fn(), onClose: vi.fn() };
  render(
    <CustomTitleModal open config={DEFAULT_HERO_TITLE} onApply={handlers.onApply} onClose={handlers.onClose} />,
  );
  return handlers;
}

describe('CustomTitleModal', () => {
  it('applies an edited, normalised title and closes', async () => {
    const user = userEvent.setup();
    const handlers = renderModal();
    const mainTitle = screen.getByTestId('title-customizer__main-title');
    await user.clear(mainTitle);
    await user.type(mainTitle, '  daisy  ');
    await user.click(screen.getByTestId('title-customizer__apply'));
    expect(handlers.onApply).toHaveBeenCalledWith(
      normalizeHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: '  DAISY  ' }),
    );
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('closes on Escape through the shared Dialog', async () => {
    const user = userEvent.setup();
    const handlers = renderModal();
    await user.click(screen.getByTestId('title-customizer__main-title'));
    await user.keyboard('{Escape}');
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('resets the draft to the delivered title', () => {
    renderModal();
    const mainTitle = screen.getByTestId('title-customizer__main-title') as HTMLInputElement;
    fireEvent.change(mainTitle, { target: { value: 'OTHER' } });
    fireEvent.click(screen.getByTestId('title-customizer__reset'));
    expect(mainTitle.value).toBe(DEFAULT_HERO_TITLE.mainTitle);
  });

  it('renders nothing when closed', () => {
    render(<CustomTitleModal open={false} config={DEFAULT_HERO_TITLE} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('title-customizer__dialog')).toBeNull();
  });
});
