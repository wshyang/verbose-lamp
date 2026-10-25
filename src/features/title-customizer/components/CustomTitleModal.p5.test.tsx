// @vitest-environment jsdom
// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE } from '@/features/premiere/data/sequence';
import { normalizeHeroTitle } from '../model/normalizeHeroTitle';
import { CustomTitleModal } from './CustomTitleModal';

function renderModal_p5() {
  const handlers = { onApply: vi.fn(), onClose: vi.fn() };
  render(
    <CustomTitleModal open config={DEFAULT_HERO_TITLE} onApply={handlers.onApply} onClose={handlers.onClose} />,
  );
  return handlers;
}
describe('CustomTitleModal', () => {
  it('applies an edited, normalised title and closes', async () => {
    const user = userEvent.setup();
    const handlers = renderModal_p5();
    const mainTitle = screen.getByTestId('title-customizer__main-title');
    await user.clear(mainTitle);
    await user.type(mainTitle, '  daisy  ');
    await user.click(screen.getByTestId('title-customizer__apply'));
    expect(handlers.onApply).toHaveBeenCalledWith(
      normalizeHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: '  DAISY  ' }),
    );
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('resets the draft to the delivered title', () => {
    renderModal_p5();
    const mainTitle = screen.getByTestId('title-customizer__main-title') as HTMLInputElement;
    fireEvent.change(mainTitle, { target: { value: 'OTHER' } });
    fireEvent.click(screen.getByTestId('title-customizer__reset'));
    expect(mainTitle.value).toBe(DEFAULT_HERO_TITLE.mainTitle);
  });
});
