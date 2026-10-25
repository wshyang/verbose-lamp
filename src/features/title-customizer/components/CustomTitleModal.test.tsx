// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE } from '@/features/premiere/model';
import { HERO_TITLE_PRESETS } from '../data/titlePresets';
import { normalizeHeroTitle } from '../model/normalizeHeroTitle';
import { CustomTitleModal } from './CustomTitleModal';

/** The dialog moves focus on the next frame; typing before that would lose its focus mid-word. */
const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

async function open(overrides: Partial<React.ComponentProps<typeof CustomTitleModal>> = {}) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(<CustomTitleModal open config={DEFAULT_HERO_TITLE} onApply={onApply} onClose={onClose} {...overrides} />);
  await nextFrame();
  return { onApply, onClose };
}

const field = (id: string) => screen.getByTestId(`title-customizer__${id}`) as HTMLInputElement;

describe('CustomTitleModal', () => {
  it('renders nothing while closed', async () => {
    await open({ open: false });

    expect(screen.queryByTestId('title-customizer__dialog')).toBeNull();
  });

  it('names the dialog by its heading and shows the current title in each field', async () => {
    await open();

    expect(screen.getByRole('dialog', { name: /inscribe custom hero title/i })).toBeTruthy();
    expect(field('keystone').value).toBe(DEFAULT_HERO_TITLE.keystone);
    expect(field('pre-title').value).toBe(DEFAULT_HERO_TITLE.preTitle);
    expect(field('main-title').value).toBe(DEFAULT_HERO_TITLE.mainTitle);
    expect(field('credit').value).toBe(DEFAULT_HERO_TITLE.subCredit);
  });

  it('limits each field to the length its engraving can carry', async () => {
    await open();

    expect([field('keystone'), field('pre-title'), field('main-title'), field('credit')].map((input) => input.maxLength)).toEqual([8, 18, 16, 46]);
  });

  it('labels every text field', async () => {
    await open();

    for (const label of [/upper keystone/i, /upper frieze line/i, /monumental center title/i, /lower pediment credit/i]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('shows typing in capitals', async () => {
    await open();

    await userEvent.clear(field('main-title'));
    await userEvent.type(field('main-title'), 'daisy');

    expect(field('main-title').value).toBe('DAISY');
  });

  it('offers every preset and fills the form from the one chosen', async () => {
    await open();
    const buttons = screen.getAllByTestId('title-customizer__preset');
    expect(buttons.map((button) => button.textContent)).toEqual(HERO_TITLE_PRESETS.map((preset) => preset.name));

    await userEvent.click(buttons[buttons.length - 1]);

    expect(field('main-title').value).toBe(HERO_TITLE_PRESETS[HERO_TITLE_PRESETS.length - 1].config.mainTitle);
  });

  it('resets the form to the delivered title', async () => {
    await open();
    await userEvent.clear(field('main-title'));
    await userEvent.type(field('main-title'), 'other');

    await userEvent.click(screen.getByTestId('title-customizer__reset'));

    expect(field('main-title').value).toBe(DEFAULT_HERO_TITLE.mainTitle);
  });

  it('applies the normalised title and closes on submit', async () => {
    const { onApply, onClose } = await open();
    await userEvent.clear(field('main-title'));
    await userEvent.type(field('main-title'), '  spaced  ');

    await userEvent.click(screen.getByTestId('title-customizer__apply'));

    expect(onApply).toHaveBeenCalledWith(normalizeHeroTitle({ ...DEFAULT_HERO_TITLE, mainTitle: '  SPACED  ' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['keystone', 'keystone', 'ab'],
    ['pre-title', 'preTitle', 'cd'],
    ['main-title', 'mainTitle', 'ef'],
    ['credit', 'subCredit', 'gh'],
  ] as const)('sends what is typed in the %s field to %s and to no other field', async (testId, key, text) => {
    const { onApply } = await open();
    await userEvent.clear(field(testId));
    await userEvent.type(field(testId), text);

    await userEvent.click(screen.getByTestId('title-customizer__apply'));

    const applied = onApply.mock.calls[0][0];
    expect(applied[key]).toBe(text.toUpperCase());
    for (const other of ['keystone', 'preTitle', 'mainTitle', 'subCredit'] as const) {
      if (other !== key) expect(applied[other]).toBe(DEFAULT_HERO_TITLE[other]);
    }
  });

  it('toggles the pinstripe into the applied title', async () => {
    const { onApply } = await open();
    const before = field('pinstripe').checked;

    await userEvent.click(field('pinstripe'));
    await userEvent.click(screen.getByTestId('title-customizer__apply'));

    expect(onApply.mock.calls[0][0].pinstripeAlternation).toBe(!before);
  });

  it('closes from the close button without applying', async () => {
    const { onApply, onClose } = await open();

    await userEvent.click(screen.getByTestId('title-customizer__close'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const { onClose } = await open();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('frames the dialog with four decorative corner marks', async () => {
    await open();
    const dialog = screen.getByTestId('title-customizer__dialog');

    expect(within(dialog).getAllByText('', { selector: 'span.pointer-events-none' })).toHaveLength(4);
  });
});
