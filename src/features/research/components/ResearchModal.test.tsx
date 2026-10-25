// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GATSBY_RESEARCH_SECTIONS } from '../data/researchSections';
import { ResearchModal } from './ResearchModal';
import { ResearchSectionCard } from './ResearchSectionCard';

describe('ResearchModal', () => {
  it('renders nothing while closed', () => {
    render(<ResearchModal open={false} onClose={vi.fn()} />);

    expect(screen.queryByTestId('research-dialog__backdrop')).toBeNull();
  });

  it('names the dialog by its heading', () => {
    render(<ResearchModal open onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /anatomy of the great gatsby/i })).toBeTruthy();
  });

  it('shows the three figures in order, each with its explanation', () => {
    render(<ResearchModal open onClose={vi.fn()} />);

    const captions = screen.getAllByText(/^Fig\. (I|II|III) ·/).map((node) => node.textContent);
    expect(captions).toEqual(['Fig. I · Deco Pinstripe System', 'Fig. II · 3D Bevelled Gold Rail', 'Fig. III · Z-Axis Portal Sweep']);
    expect(screen.getByText(/4-stripe concentric inline glyphs/)).toBeTruthy();
    expect(screen.getByText(/3D chamfered rail/)).toBeTruthy();
    expect(screen.getByText(/multi-plane golden frames/)).toBeTruthy();
  });

  it('draws one SVG per figure', () => {
    const { container } = render(<ResearchModal open onClose={vi.fn()} />);

    expect(container.ownerDocument.querySelectorAll('svg[viewBox="0 0 220 90"]')).toHaveLength(3);
  });

  it('gives every research section its own card, in data order', () => {
    render(<ResearchModal open onClose={vi.fn()} />);

    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(GATSBY_RESEARCH_SECTIONS.map((section) => section.title));
  });

  it('closes from the close button and on Escape', async () => {
    const onClose = vi.fn();
    render(<ResearchModal open onClose={onClose} />);

    await userEvent.click(screen.getByTestId('research-dialog__close'));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ResearchSectionCard', () => {
  const section = GATSBY_RESEARCH_SECTIONS[0];

  it('shows the numeral, subtitle, title, credits and summary', () => {
    render(<ResearchSectionCard section={section} />);

    expect(screen.getByText(`SECTION ${section.numeral}`)).toBeTruthy();
    expect(screen.getByText(section.subtitle)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(section.title);
    expect(screen.getByText(section.credits)).toBeTruthy();
    expect(screen.getByText(section.summary)).toBeTruthy();
  });

  it('lists every bullet point once, in order', () => {
    render(<ResearchSectionCard section={section} />);

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([...section.bulletPoints]);
  });

  it('renders a section with no bullets as an empty list', () => {
    render(<ResearchSectionCard section={{ ...section, bulletPoints: [] }} />);

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
