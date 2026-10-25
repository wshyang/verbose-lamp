// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE } from '@/features/premiere/data/sequence';
import { normalizeHeroTitle } from '../model/normalizeHeroTitle';
import { CustomTitleModal } from './CustomTitleModal';

function renderModal_p2(open = true) {
  const handlers = { onApply: vi.fn(), onClose: vi.fn() };
  render(<CustomTitleModal open={open} config={{ ...DEFAULT_HERO_TITLE }} {...handlers} />);
  return handlers;
}
describe('CustomTitleModal', () => {
  it('applies edited fields through normalizeHeroTitle and closes', async () => {
    const user = userEvent.setup();
    const handlers = renderModal_p2();
    const keystone = screen.getByTestId('title-customizer__keystone');
    const preTitle = screen.getByTestId('title-customizer__pre-title');
    const credit = screen.getByTestId('title-customizer__credit');
    await user.clear(keystone);
    await user.type(keystone, 'a');
    await user.clear(preTitle);
    await user.type(preTitle, 'grand');
    await user.clear(credit);
    await user.type(credit, 'one night only');
    const main = screen.getByTestId('title-customizer__main-title');
    await user.clear(main);
    await user.type(main, '  premiere  ');
    await user.click(screen.getByTestId('title-customizer__pinstripe'));
    await user.click(screen.getByTestId('title-customizer__apply'));
    expect(handlers.onApply).toHaveBeenCalledWith(normalizeHeroTitle({
      keystone: 'A', preTitle: 'GRAND', mainTitle: 'PREMIERE',
      subCredit: 'ONE NIGHT ONLY', pinstripeAlternation: false,
    }));
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });

  it('loads presets, resets drafts, and closes from the close button', async () => {
    const user = userEvent.setup();
    const handlers = renderModal_p2();
    await user.click(screen.getAllByTestId('title-customizer__preset')[0]);
    expect((screen.getByTestId('title-customizer__main-title') as HTMLInputElement).value).not.toBe('');
    await user.click(screen.getByTestId('title-customizer__reset'));
    expect((screen.getByTestId('title-customizer__main-title') as HTMLInputElement).value).toBe('GATSBY');
    await user.click(screen.getByTestId('title-customizer__close'));
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });
});
