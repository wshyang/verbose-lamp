// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HERO_TITLE_PRESETS } from '../data/titlePresets';
import { DEFAULT_HERO_TITLE } from '@/features/premiere';
import { stableDigest } from '@/test/digest';
import { CustomTitleModal } from './CustomTitleModal';

/**
 * Structure of the dialog as rendered, in document order: every `data-testid`
 * with its tag, its value/checked state and its text, plus the ids the labels
 * point at. Pixels are out of reach in jsdom; this is the part a refactor can
 * silently break (ADDENDUM-036).
 */
function describeDialog() {
  const dialog = screen.getByTestId('title-customizer__dialog');
  // Whitespace is collapsed: the assertions are about wording and order, not
  // about how deeply the markup is indented.
  const flat = (text: string | null) => text?.replace(/\s+/g, ' ').trim() ?? null;
  const nodes = Array.from(dialog.querySelectorAll<HTMLElement>('[data-testid]')).map((node) => ({
    id: node.dataset.testid,
    tag: node.tagName.toLowerCase(),
    value: node.matches('input[type="text"], input[type="range"]')
      ? (node as HTMLInputElement).value
      : null,
    checked: node.matches('input[type="checkbox"]') ? (node as HTMLInputElement).checked : null,
    text: node.matches('input') ? null : flat(node.textContent),
  }));
  return {
    nodes,
    labels: Array.from(dialog.querySelectorAll('label[for]')).map((label) => [
      label.getAttribute('for'),
      flat(label.textContent),
    ]),
    headings: Array.from(dialog.querySelectorAll('h2')).map((heading) => [
      heading.id,
      flat(heading.textContent),
    ]),
  };
}

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
  it('renders the same dialog structure as before the split', () => {
    renderModal();
    expect(stableDigest(describeDialog())).toMatchInlineSnapshot(`
      {
        "hash": "2ccb24bf121feeea980c0b62fa600da4e540f8eb",
        "length": 1495,
      }
    `);
  });

  it('shows every archival preset, and the pinstripe toggle starts from the config', () => {
    renderModal({ config: { ...DEFAULT_HERO_TITLE, pinstripeAlternation: false } });
    expect(screen.getAllByTestId('title-customizer__preset')).toHaveLength(
      HERO_TITLE_PRESETS.length
    );
    expect((screen.getByTestId('title-customizer__pinstripe') as HTMLInputElement).checked).toBe(
      false
    );
  });

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

  it('carries the pinstripe toggle into the applied config', async () => {
    const user = userEvent.setup();
    const handlers = renderModal({ config: { ...DEFAULT_HERO_TITLE, pinstripeAlternation: false } });
    await user.click(screen.getByTestId('title-customizer__pinstripe'));
    await user.click(screen.getByTestId('title-customizer__apply'));
    expect(handlers.onApply).toHaveBeenCalledWith({
      ...DEFAULT_HERO_TITLE,
      pinstripeAlternation: true,
    });
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
