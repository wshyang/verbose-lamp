// @vitest-environment jsdom
// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
describe('ResearchModal', () => {

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
});
