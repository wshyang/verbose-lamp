// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GATSBY_RESEARCH_SECTIONS } from '../data/researchSections';
import { ResearchModal } from './ResearchModal';

describe('ResearchModal', () => {
  it('renders nothing closed and every research section open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<ResearchModal open={false} onClose={onClose} />);
    expect(screen.queryByTestId('research-dialog__backdrop')).toBeNull();
    rerender(<ResearchModal open onClose={onClose} />);
    expect(GATSBY_RESEARCH_SECTIONS.length).toBeGreaterThan(0);
    for (const section of GATSBY_RESEARCH_SECTIONS) {
      expect(screen.getByText(section.title)).toBeTruthy();
      for (const point of section.bulletPoints) expect(screen.getByText(point)).toBeTruthy();
    }
    await user.click(screen.getByTestId('research-dialog__close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
