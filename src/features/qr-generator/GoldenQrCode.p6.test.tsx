// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { GoldenQrCode } from './GoldenQrCode';

import { setupDomTests } from '@/test/dom';

import { tryEncodeQr } from './encode';

import { buildRenderPlan, resolveQrStyle } from './geometry';

setupDomTests();
const plan = () => {
  const encoded = tryEncodeQr({ text: 'https://example.com', errorCorrection: 'Q' });
  if (!encoded.ok) throw new Error(encoded.reason);
  return buildRenderPlan(encoded.matrix, resolveQrStyle('plaque'));
};
const renderCode = (props: Partial<React.ComponentProps<typeof GoldenQrCode>> = {}) =>
  render(<GoldenQrCode plan={plan()} testId="golden-qr" {...props} />);
describe('GoldenQrCode', () => {
  it('draws the plaque at the plan view box', () => {
    const value = plan();
    renderCode();

    const svg = screen.getByTestId('golden-qr');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${value.viewBox} ${value.viewBox}`);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Golden QR code');
  });

  it('stacks the four symbol passes over the plaque', () => {
    renderCode();

    const groups = screen.getByTestId('golden-qr').querySelectorAll('g');
    const modulePaths = screen.getByTestId('golden-qr').querySelectorAll('path');
    // Three modules, three rings and three cores per pass, four passes, plus border.
    expect(modulePaths.length).toBeGreaterThanOrEqual(12);
    expect(groups.length).toBeGreaterThanOrEqual(4);
  });

  it('reserves a caption band and labels the image with the caption', () => {
    const value = plan();
    renderCode({ caption: 'admit one' });

    const svg = screen.getByTestId('golden-qr');
    const height = Number(svg.getAttribute('viewBox')!.split(' ')[3]);
    expect(height).toBeGreaterThan(value.viewBox);
    expect(svg.getAttribute('aria-label')).toBe('Golden QR code: admit one');
    expect(screen.getByText('ADMIT ONE')).toBeTruthy();
  });

  it('treats a whitespace-only caption as absent', () => {
    const value = plan();
    renderCode({ caption: '   ' });

    const svg = screen.getByTestId('golden-qr');
    const height = Number(svg.getAttribute('viewBox')!.split(' ')[3]);
    expect(height).toBe(value.viewBox);
    expect(svg.getAttribute('aria-label')).toBe('Golden QR code');
  });

  it('singularises gradient ids per instance so two codes cannot collide', () => {
    const value = plan();
    const first = render(<GoldenQrCode plan={value} testId="first" />);
    render(<GoldenQrCode plan={value} testId="second" />);

    const fillOf = (id: string) =>
      screen.getByTestId(id).querySelector('rect')?.getAttribute('fill');
    expect(fillOf('first')).not.toBe(fillOf('second'));
    first.unmount();
  });

  it('hands the ref to the caller', () => {
    let node: SVGSVGElement | null = null;
    renderCode({ svgRef: (element) => { node = element as SVGSVGElement | null; } });

    expect(node).not.toBeNull();
    expect((node as unknown as SVGSVGElement).getAttribute('data-testid')).toBe('golden-qr');
  });
});
