// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { buildGoldenQrIds, GoldenQrDefs } from './GoldenQrDefs';

setupDomTests();

const ids = buildGoldenQrIds('abc');

const renderDefs = (isShimmering = true) =>
  render(
    <svg>
      <GoldenQrDefs ids={ids} viewBox={33} isShimmering={isShimmering} />
    </svg>
  );

describe('buildGoldenQrIds', () => {
  it('namespaces every id under one sanitised seed', () => {
    const unsafe = buildGoldenQrIds(':r1: weird/id');

    expect(Object.values(unsafe).every((id) => id.startsWith('gq-r1weirdid-'))).toBe(true);
    expect(new Set(Object.values(buildGoldenQrIds('abc'))).size).toBe(5);
  });
});

describe('GoldenQrDefs', () => {
  it('defines the plaque, gold, sheen, brush and glow it promises', () => {
    const { container } = renderDefs();

    for (const id of Object.values(ids)) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
    expect(container.querySelector('radialGradient')).not.toBeNull();
    expect(container.querySelectorAll('linearGradient')).toHaveLength(2);
    expect(container.querySelectorAll('filter')).toHaveLength(2);
  });

  it('keeps the sheen still when the shimmer is off', () => {
    const animated = renderDefs(true).container;
    const still = render(<svg><GoldenQrDefs ids={ids} viewBox={33} isShimmering={false} /></svg>).container;

    expect(animated.querySelector(`#${ids.sheen}`)!.innerHTML).not.toBe(
      still.querySelector(`#${ids.sheen}`)!.innerHTML
    );
  });

  it('renders no stray text', () => {
    renderDefs();

    expect(screen.queryByText(/./)).toBeNull();
  });
});
