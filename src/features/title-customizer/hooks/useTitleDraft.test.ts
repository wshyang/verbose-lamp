// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HERO_TITLE } from '@/features/premiere/model';
import type { HeroTitleConfig } from '@/features/premiere/model';
import { HERO_TITLE_PRESETS } from '../data/titlePresets';
import { normalizeHeroTitle } from '../model/normalizeHeroTitle';
import { useTitleDraft } from './useTitleDraft';

const CUSTOM: HeroTitleConfig = { ...DEFAULT_HERO_TITLE, mainTitle: 'JAZZ', pinstripeAlternation: false };

function draftOf(config: HeroTitleConfig = CUSTOM, open = true) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const view = renderHook((props: { open: boolean; config: HeroTitleConfig }) => useTitleDraft({ ...props, onApply, onClose }), {
    initialProps: { open, config },
  });
  return { ...view, onApply, onClose };
}

describe('useTitleDraft', () => {
  it('starts from the current title', () => {
    expect(draftOf().result.current.draft).toEqual(CUSTOM);
  });

  it('upper-cases whatever is typed into a text field and leaves the other fields alone', () => {
    const { result } = draftOf();

    act(() => result.current.setText('mainTitle', 'gatsby 1925'));

    expect(result.current.draft).toEqual({ ...CUSTOM, mainTitle: 'GATSBY 1925' });
  });

  it.each(['keystone', 'preTitle', 'mainTitle', 'subCredit'] as const)('writes %s to its own field', (field) => {
    const { result } = draftOf();

    act(() => result.current.setText(field, 'x'));

    expect(result.current.draft[field]).toBe('X');
  });

  it('turns the pinstripe on and off', () => {
    const { result } = draftOf();

    act(() => result.current.setPinstripe(true));
    expect(result.current.draft.pinstripeAlternation).toBe(true);
    act(() => result.current.setPinstripe(false));
    expect(result.current.draft.pinstripeAlternation).toBe(false);
  });

  it('adopts a preset as a copy, so later edits never reach the preset', () => {
    const { result } = draftOf();
    const preset = HERO_TITLE_PRESETS[0];

    act(() => result.current.applyPreset(preset));
    expect(result.current.draft).toEqual(preset.config);
    act(() => result.current.setText('mainTitle', 'edited'));

    expect(preset.config.mainTitle).not.toBe('EDITED');
  });

  it('resets to the delivered title as a copy', () => {
    const { result } = draftOf();

    act(() => result.current.reset());
    act(() => result.current.setText('mainTitle', 'edited'));

    expect(DEFAULT_HERO_TITLE.mainTitle).not.toBe('EDITED');
  });

  it('applies the normalised draft, then closes, and stops the form posting', () => {
    const { result, onApply, onClose } = draftOf();
    const preventDefault = vi.fn();
    act(() => result.current.setText('mainTitle', '  spaced  '));

    act(() => result.current.submit({ preventDefault } as unknown as FormEvent));

    expect(preventDefault).toHaveBeenCalled();
    expect(onApply).toHaveBeenCalledWith(normalizeHeroTitle({ ...CUSTOM, mainTitle: '  SPACED  ' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('discards unsent edits when the dialog is reopened', () => {
    const { result, rerender } = draftOf();
    act(() => result.current.setText('mainTitle', 'unsent'));

    rerender({ open: false, config: CUSTOM });
    expect(result.current.draft.mainTitle).toBe('UNSENT');
    rerender({ open: true, config: CUSTOM });

    expect(result.current.draft.mainTitle).toBe('JAZZ');
  });

  it('picks up a changed title while the dialog is open', () => {
    const { result, rerender } = draftOf();

    rerender({ open: true, config: { ...CUSTOM, mainTitle: 'NEW' } });

    expect(result.current.draft.mainTitle).toBe('NEW');
  });

  it('does not overwrite the draft from the config while the dialog is closed', () => {
    const { result, rerender } = draftOf(CUSTOM, false);

    rerender({ open: false, config: { ...CUSTOM, mainTitle: 'HIDDEN' } });

    expect(result.current.draft.mainTitle).toBe('JAZZ');
  });
});
