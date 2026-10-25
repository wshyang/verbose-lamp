// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE } from '@/features/premiere/model';
import { HERO_TITLE_PRESETS } from '../data/titlePresets';
import { CustomTitleModal } from './CustomTitleModal';

const config = { ...DEFAULT_HERO_TITLE };
describe('CustomTitleModal', () => {
  it('opens with the current title in every field', () => {
    render(<CustomTitleModal open config={config} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('INSCRIBE CUSTOM HERO TITLE')).toBeDefined();
    expect((screen.getByTestId('title-customizer__keystone') as HTMLInputElement).value).toBe('THE');
    expect((screen.getByTestId('title-customizer__pre-title') as HTMLInputElement).value).toBe('GREAT');
    expect((screen.getByTestId('title-customizer__main-title') as HTMLInputElement).value).toBe('GATSBY');
    expect((screen.getByTestId('title-customizer__credit') as HTMLInputElement).value).toBe(
      DEFAULT_HERO_TITLE.subCredit,
    );
    expect(screen.getByTestId('title-customizer__pinstripe')).toHaveProperty('checked', true);
  });

  it('upcases edits as they are typed', async () => {
    render(<CustomTitleModal open config={config} onApply={vi.fn()} onClose={vi.fn()} />);
    const main = screen.getByTestId('title-customizer__main-title') as HTMLInputElement;
    fireEvent.change(main, { target: { value: 'gatsby' } });
    expect(main.value).toBe('GATSBY');

    const keystone = screen.getByTestId('title-customizer__keystone') as HTMLInputElement;
    fireEvent.change(keystone, { target: { value: 'a' } });
    expect(keystone.value).toBe('A');

    const preTitle = screen.getByTestId('title-customizer__pre-title') as HTMLInputElement;
    fireEvent.change(preTitle, { target: { value: 'the great' } });
    expect(preTitle.value).toBe('THE GREAT');

    const credit = screen.getByTestId('title-customizer__credit') as HTMLInputElement;
    fireEvent.change(credit, { target: { value: 'a novel' } });
    expect(credit.value).toBe('A NOVEL');
  });

  it('toggles the pinstripe and applies a preset to the draft', () => {
    render(<CustomTitleModal open config={config} onApply={vi.fn()} onClose={vi.fn()} />);
    const pinstripe = screen.getByTestId('title-customizer__pinstripe') as HTMLInputElement;
    fireEvent.click(pinstripe);
    expect(pinstripe.checked).toBe(false);

    const presets = screen.getAllByTestId('title-customizer__preset');
    expect(presets).toHaveLength(HERO_TITLE_PRESETS.length);
    fireEvent.click(presets[1]);
    expect((screen.getByTestId('title-customizer__main-title') as HTMLInputElement).value).toBe(
      HERO_TITLE_PRESETS[1].config.mainTitle,
    );
  });

  it('normalises the draft and closes when applied', async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<CustomTitleModal open config={config} onApply={onApply} onClose={onClose} />);
    fireEvent.change(screen.getByTestId('title-customizer__main-title'), {
      target: { value: '  great   gatsby ' },
    });
    await userEvent.click(screen.getByTestId('title-customizer__apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].mainTitle).toBe('GREAT   GATSBY');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resets the draft to the film lockup', () => {
    render(<CustomTitleModal open config={config} onApply={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('title-customizer__main-title'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('title-customizer__reset'));
    expect((screen.getByTestId('title-customizer__main-title') as HTMLInputElement).value).toBe(
      DEFAULT_HERO_TITLE.mainTitle,
    );
  });

  it('adopts a new config when it is reopened', () => {
    const { rerender } = render(
      <CustomTitleModal open={false} config={config} onApply={vi.fn()} onClose={vi.fn()} />,
    );
    rerender(
      <CustomTitleModal
        open
        config={{ ...config, mainTitle: 'TRIMALCHIO' }}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect((screen.getByTestId('title-customizer__main-title') as HTMLInputElement).value).toBe(
      'TRIMALCHIO',
    );
  });
});
