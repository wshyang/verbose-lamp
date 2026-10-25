// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { GoldenQrCode } from './GoldenQrCode';
import { buildGoldenQrIds } from './GoldenQrDefs';
import type { QrRenderPlan } from './types';

const PLAN: QrRenderPlan = {
  size: 21,
  version: 1,
  quietZone: 2,
  viewBox: 25,
  finders: [],
  finderPaths: { ring: 'M0 0h1v1H0z', core: 'M0 0h1v1H0z' },
  modulePath: 'M1 1h1v1H1z',
  darkModuleCount: 1,
};

describe('GoldenQrCode', () => {
  it('renders defaults without a caption and with an animated sheen', () => {
    const ref = createRef<SVGSVGElement>();
    const { container } = render(<GoldenQrCode plan={PLAN} svgRef={ref} />);
    const svg = ref.current!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 25 25');
    expect(svg.getAttribute('aria-label')).toBe('Golden QR code');
    expect(container.querySelectorAll('path')).toHaveLength(13);
    expect(container.querySelector('animateTransform')).toBeTruthy();
    expect(container.querySelector('text')).toBeNull();
  });

  it('treats a whitespace caption as absent', () => {
    const { container } = render(<GoldenQrCode plan={PLAN} caption="   " isShimmering={false} />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 25 25');
    expect(container.querySelector('animateTransform')).toBeNull();
  });

  it('reserves a caption band and labels the plaque', () => {
    render(
      <GoldenQrCode plan={PLAN} caption="Admit one" className="plaque" testId="golden-qr" isShimmering={false} />
    );
    const svg = screen.getByTestId('golden-qr');
    expect(svg.getAttribute('viewBox')).toBe('0 0 25 28.2');
    expect(svg.getAttribute('aria-label')).toBe('Golden QR code: Admit one');
    expect(svg.getAttribute('class')).toBe('plaque');
    expect(screen.getByText('ADMIT ONE')).toBeTruthy();
  });
});

describe('buildGoldenQrIds', () => {
  it('strips unsafe seed characters and preserves word characters', () => {
    expect(buildGoldenQrIds(':r-1_é*')).toEqual({
      plaque: 'gq-r-1_-plaque', gold: 'gq-r-1_-gold', sheen: 'gq-r-1_-sheen',
      brush: 'gq-r-1_-brush', glow: 'gq-r-1_-glow',
    });
  });
});
