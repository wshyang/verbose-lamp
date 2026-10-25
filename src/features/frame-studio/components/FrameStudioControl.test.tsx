// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IntricacyPreset } from '@/features/art-deco-frame';
import {
  DEFAULT_FRAME_LAYERS,
  FRAME_SOURCES,
  INTRICACY_PRESETS,
  SIGNATURE_GENOME,
} from '@/features/art-deco-frame';
import { stableDigest } from '@/test/digest';
import { DESIGN_GALLERY } from '../data/frameDesigns';
import { FrameStudioControl } from './FrameStudioControl';

/**
 * The frame studio panel, pinned before it was split (ADDENDUM-035).
 *
 * The panel is 252 lines of markup with no test of its own, which is the worst
 * combination: plenty of surface, nothing holding it still. The goldens below
 * record the *structure* — every `data-testid` in document order with the state
 * attributes and text that the styles and the e2e suite read — so a split into
 * sections can be proved to render the same tree. Pixels are not asserted;
 * jsdom has no layout and no stylesheet.
 */

type Props = React.ComponentProps<typeof FrameStudioControl>;

const LAYERS = DEFAULT_FRAME_LAYERS.map((layer, index) => {
  const info = FRAME_SOURCES.find((source) => source.id === layer.source);
  return {
    source: layer.source,
    label: info?.label ?? '',
    blurb: info?.blurb ?? '',
    enabled: index === 0,
    level: layer.level,
  };
});

function makeProps(overrides: Partial<Props> = {}) {
  const handlers = {
    onSurfaceChange: vi.fn(),
    onPatternChange: vi.fn(),
    onLayerToggle: vi.fn(),
    onLayerLevelChange: vi.fn(),
    onDesignChange: vi.fn(),
    onLevelChange: vi.fn(),
    onDetailChange: vi.fn(),
    onProportionsToggle: vi.fn(),
    onGeneChange: vi.fn(),
    onBorderEnabledChange: vi.fn(),
    onBorderWeightChange: vi.fn(),
    onReset: vi.fn(),
    onDismiss: vi.fn(),
  };
  const props: Props = {
    isOpen: true,
    surface: 'title-cards',
    patterns: FRAME_SOURCES,
    baseSource: 'authored',
    layers: LAYERS,
    designGallery: DESIGN_GALLERY,
    activeDesignIndex: 0,
    designLabel: 'Original',
    level: 2,
    detailPercent: 50,
    detailPresets: INTRICACY_PRESETS,
    activePreset: INTRICACY_PRESETS[0],
    isDesignPattern: true,
    proportionsOpen: false,
    genome: { ...SIGNATURE_GENOME },
    borderEnabled: false,
    borderWeight: 35,
    ...handlers,
    ...overrides,
  };
  return { props, handlers };
}

/** Every test id in the panel, with the state a screenshot or a spec would read. */
function describePanel() {
  const panel = screen.getByTestId('frame-studio__panel');
  const nodes = Array.from(panel.querySelectorAll<HTMLElement>('[data-testid]')).map((node) => ({
    id: node.dataset.testid,
    tag: node.tagName.toLowerCase(),
    pressed: node.getAttribute('aria-pressed'),
    expanded: node.getAttribute('aria-expanded'),
    disabled: node.hasAttribute('disabled'),
    checked: node.matches('input[type="checkbox"]') ? (node as HTMLInputElement).checked : null,
    text: node.matches('input') ? null : node.textContent,
  }));
  return {
    nodes,
    groups: Array.from(panel.querySelectorAll('[role="group"]')).map((group) =>
      group.getAttribute('aria-label')
    ),
    fieldsets: panel.querySelectorAll('fieldset').length,
    sectionLabel: panel.getAttribute('aria-label'),
  };
}

describe('FrameStudioControl', () => {
  it('renders nothing while the studio is dismissed', () => {
    const { props } = makeProps({ isOpen: false });
    const { container } = render(<FrameStudioControl {...props} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the title surface exactly as before the split', () => {
    const { props } = makeProps();
    render(<FrameStudioControl {...props} />);
    expect(stableDigest(describePanel())).toMatchInlineSnapshot(`
      {
        "hash": "2576ca8b6d1bfbf9c78b4645411f752f571bf3d6",
        "length": 4674,
      }
    `);
  });

  it('renders the title surface with proportions open exactly as before the split', () => {
    const { props } = makeProps({ proportionsOpen: true });
    render(<FrameStudioControl {...props} />);
    expect(stableDigest(describePanel())).toMatchInlineSnapshot(`
      {
        "hash": "683632903fa7712557d225039f58587a4c354432",
        "length": 7938,
      }
    `);
  });

  it('renders the screen-border surface exactly as before the split', () => {
    const { props } = makeProps({ surface: 'screen-border', borderEnabled: true });
    render(<FrameStudioControl {...props} />);
    expect(stableDigest(describePanel())).toMatchInlineSnapshot(`
      {
        "hash": "61769b57563f09145ff627f14a3d11037c735489",
        "length": 1351,
      }
    `);
  });

  it('switches surface, foundation and design', () => {
    const { props, handlers } = makeProps();
    render(<FrameStudioControl {...props} />);

    fireEvent.click(screen.getByTestId('frame-studio__surface-border'));
    expect(handlers.onSurfaceChange).toHaveBeenCalledWith('screen-border');

    fireEvent.click(screen.getByTestId('frame-studio__surface-sequence'));
    expect(handlers.onSurfaceChange).toHaveBeenCalledWith('title-cards');

    const patterns = screen.getAllByTestId('frame-studio__pattern');
    expect(patterns).toHaveLength(FRAME_SOURCES.length);
    fireEvent.click(patterns[1]);
    expect(handlers.onPatternChange).toHaveBeenCalledWith(FRAME_SOURCES[1].id);

    fireEvent.click(screen.getAllByTestId('frame-studio__design')[2]);
    expect(handlers.onDesignChange).toHaveBeenCalledWith(2);
  });

  it('hides the design gallery and proportions unless the authored pattern is used', () => {
    const generative = makeProps({ isDesignPattern: false, proportionsOpen: true });
    const { unmount } = render(<FrameStudioControl {...generative.props} />);
    expect(screen.queryAllByTestId('frame-studio__design')).toEqual([]);
    expect(screen.queryByTestId('frame-studio__proportions')).toBeNull();
    // A design pattern owns the base level, so the slider is live; otherwise it is inert.
    expect((screen.getByTestId('frame-studio__level') as HTMLInputElement).disabled).toBe(false);
    unmount();

    const authored = makeProps({ isDesignPattern: true });
    render(<FrameStudioControl {...authored.props} />);
    // No jest-dom matchers in this project: assert the DOM property directly.
    expect((screen.getByTestId('frame-studio__level') as HTMLInputElement).disabled).toBe(true);
  });

  it('toggles a layer and edits its level', () => {
    const { props, handlers } = makeProps();
    render(<FrameStudioControl {...props} />);

    const toggles = screen.getAllByTestId('frame-studio__layer-toggle');
    expect(toggles).toHaveLength(LAYERS.length);
    fireEvent.click(toggles[1]);
    expect(handlers.onLayerToggle).toHaveBeenCalledWith(LAYERS[1].source, true);

    // Only the enabled layers expose a level slider.
    const levels = screen.getAllByTestId('frame-studio__layer-level');
    expect(levels).toHaveLength(1);
    fireEvent.change(levels[0], { target: { value: '4' } });
    expect(handlers.onLayerLevelChange).toHaveBeenCalledWith(LAYERS[0].source, 4);
  });

  it('edits the base level and the ornament detail', () => {
    const { props, handlers } = makeProps();
    render(<FrameStudioControl {...props} />);

    fireEvent.change(screen.getByTestId('frame-studio__level'), { target: { value: '3' } });
    expect(handlers.onLevelChange).toHaveBeenCalledWith(3);
    expect(screen.getByTestId('frame-studio__level-readout').textContent).toBe('2');

    fireEvent.change(screen.getByTestId('frame-studio__detail'), { target: { value: '65' } });
    expect(handlers.onDetailChange).toHaveBeenCalledWith(65);

    const presets = screen.getAllByTestId('frame-studio__detail-preset');
    fireEvent.click(presets[1]);
    expect(handlers.onDetailChange).toHaveBeenCalledWith(
      Math.round(INTRICACY_PRESETS[1].value * 100)
    );
  });

  it('labels the detail readout as Balanced, a preset name, or a percentage', () => {
    const balanced = INTRICACY_PRESETS.find((preset) => preset.id === 'baseline') as IntricacyPreset;
    const baseline = makeProps({ activePreset: balanced });
    const { unmount } = render(<FrameStudioControl {...baseline.props} />);
    expect(screen.getByTestId('frame-studio__detail-readout').textContent).toBe('Balanced');
    unmount();

    const named = makeProps({ activePreset: INTRICACY_PRESETS[1] });
    const second = render(<FrameStudioControl {...named.props} />);
    expect(screen.getByTestId('frame-studio__detail-readout').textContent).toBe(
      INTRICACY_PRESETS[1].label
    );
    second.unmount();

    const custom = makeProps({ activePreset: null, detailPercent: 43 });
    render(<FrameStudioControl {...custom.props} />);
    expect(screen.getByTestId('frame-studio__detail-readout').textContent).toBe('43%');
  });

  it('opens the proportions drawer and writes a gene', () => {
    const { props, handlers } = makeProps({ proportionsOpen: true });
    render(<FrameStudioControl {...props} />);

    expect(screen.getAllByTestId(/frame-studio__gene-/)).not.toHaveLength(0);
    // The test id sits on the slider's wrapper div; the range input is inside.
    const ray = screen.getByTestId('frame-studio__gene-rayDensity').querySelector('input');
    fireEvent.change(ray as HTMLInputElement, { target: { value: '1.25' } });
    expect(handlers.onGeneChange).toHaveBeenCalledWith('rayDensity', 1.25);

    // The drawer is open here, so the toggle asks to close it.
    fireEvent.click(screen.getByTestId('frame-studio__proportions-toggle'));
    expect(handlers.onProportionsToggle).toHaveBeenCalledWith(false);
  });

  it('opens the drawer from the collapsed state, and dims the recursion ratio at depth 0', () => {
    // fractalDepth 0 makes fractalRatio inert, which renders at 40% opacity.
    const { props } = makeProps({ proportionsOpen: true, genome: { ...SIGNATURE_GENOME, fractalDepth: 0 } });
    render(<FrameStudioControl {...props} />);
    const inert = screen.getByTestId('frame-studio__gene-fractalRatio');
    expect(inert.className).toContain('opacity-40');
    expect(screen.getByTestId('frame-studio__gene-rayDensity').className).not.toContain(
      'opacity-40'
    );
  });

  it('resets and dismisses through the header buttons', () => {
    const { props, handlers } = makeProps();
    render(<FrameStudioControl {...props} />);
    fireEvent.click(screen.getByTestId('frame-studio__reset'));
    fireEvent.click(screen.getByTestId('frame-studio__dismiss'));
    expect(handlers.onReset).toHaveBeenCalledOnce();
    expect(handlers.onDismiss).toHaveBeenCalledOnce();
  });

  it('enables the border and sets its weight on the screen-border surface', () => {
    const { props, handlers } = makeProps({ surface: 'screen-border', borderEnabled: true });
    render(<FrameStudioControl {...props} />);

    fireEvent.click(screen.getByTestId('frame-studio__border-enable'));
    expect(handlers.onBorderEnabledChange).toHaveBeenCalledWith(false);

    fireEvent.change(screen.getByTestId('frame-studio__border-weight'), {
      target: { value: '60' },
    });
    expect(handlers.onBorderWeightChange).toHaveBeenCalledWith(60);
    expect(screen.getByTestId('frame-studio__border-weight-readout').textContent).toBe('35%');
    expect(screen.getByTestId('frame-studio__border-blurb')).not.toBeNull();
  });
});
