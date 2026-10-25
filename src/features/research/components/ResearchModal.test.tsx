// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { stableDigest } from '@/test/digest';
import { GATSBY_RESEARCH_SECTIONS } from '../data/researchSections';
import { ResearchModal } from './ResearchModal';

/**
 * The dossier, pinned before it was split (ADDENDUM-036).
 *
 * The whole point of this dialog is its content, so the golden records the
 * *text* of the rendered dossier plus the shape around it — headings, figures,
 * bullet counts, the test ids — rather than pixels, which jsdom cannot produce.
 * Moving eighty lines of SVG into a component must not change either.
 */

function renderModal(overrides: Partial<Parameters<typeof ResearchModal>[0]> = {}) {
  const onClose = vi.fn();
  render(<ResearchModal open onClose={onClose} {...overrides} />);
  return { onClose };
}

/** Collapses runs of whitespace: indentation is not content. */
const flat = (text: string | null) => text?.replace(/\s+/g, ' ').trim() ?? null;

function describeDossier() {
  const dialog = screen.getByTestId('research-dialog__backdrop');
  return {
    ids: Array.from(dialog.querySelectorAll<HTMLElement>('[data-testid]')).map(
      (node) => node.dataset.testid
    ),
    headings: Array.from(dialog.querySelectorAll('h2, h3')).map((node) => [
      node.tagName.toLowerCase(),
      node.id || null,
      flat(node.textContent),
    ]),
    svgs: dialog.querySelectorAll('svg').length,
    paths: dialog.querySelectorAll('path, rect, circle, text').length,
    lists: dialog.querySelectorAll('li').length,
    text: flat(dialog.textContent),
  };
}

describe('ResearchModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('research-dialog__backdrop')).toBeNull();
  });

  it('renders the same dossier text and shape as before the split', () => {
    renderModal();
    expect(stableDigest(describeDossier())).toMatchInlineSnapshot(`
      {
        "hash": "5bbd011eda7268b8fd4b65af37118072f2e6d39c",
        "length": 4582,
      }
    `);
  });

  it('draws three figures and one card per research section', () => {
    renderModal();
    const dialog = screen.getByTestId('research-dialog__backdrop');
    // Three 220x90 plates, plus the two lucide glyphs in the chrome (sparkles, X).
    expect(dialog.querySelectorAll('svg[viewBox="0 0 220 90"]')).toHaveLength(3);
    expect(dialog.querySelectorAll('svg')).toHaveLength(5);
    expect(dialog.querySelectorAll('li')).toHaveLength(
      GATSBY_RESEARCH_SECTIONS.reduce((total, section) => total + section.bulletPoints.length, 0)
    );
    for (const section of GATSBY_RESEARCH_SECTIONS) {
      expect(dialog.textContent).toContain(section.title);
      expect(dialog.textContent).toContain(`SECTION ${section.numeral}`);
    }
  });

  it('closes from the close button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByTestId('research-dialog__close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByTestId('research-dialog__close'));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
