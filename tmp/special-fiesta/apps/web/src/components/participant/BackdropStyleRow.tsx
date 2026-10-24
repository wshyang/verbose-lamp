import {
  AVATAR_BACKDROP_SWATCHES,
  CONCENTRIC_DEPTH_MAX,
  CONCENTRIC_DEPTH_MIN,
  CONCENTRIC_LOBES_MAX,
  CONCENTRIC_LOBES_MIN,
  CONCENTRIC_RING_MAX,
  CONCENTRIC_RING_MIN,
  CONCENTRIC_SHAPES,
  DEFAULT_CONCENTRIC,
  DEFAULT_PSYCHEDELIC,
  DEFAULT_SUNBURST,
  DEFAULT_WAVES,
  PSYCHEDELIC_FREQUENCY_MAX,
  PSYCHEDELIC_FREQUENCY_MIN,
  PSYCHEDELIC_RIPPLE_MAX,
  PSYCHEDELIC_RIPPLE_MIN,
  PSYCHEDELIC_SCALE_MAX,
  PSYCHEDELIC_SCALE_MIN,
  PSYCHEDELIC_SWIRL_MAX,
  PSYCHEDELIC_SWIRL_MIN,
  SUNBURST_BANDS_MAX,
  SUNBURST_BANDS_MIN,
  SUNBURST_RAYS_MAX,
  SUNBURST_RAYS_MIN,
  SUNBURST_TWIST_MAX,
  SUNBURST_TWIST_MIN,
  WAVES_AMPLITUDE_MAX,
  WAVES_AMPLITUDE_MIN,
  WAVES_BAND_MAX,
  WAVES_BAND_MIN,
  WAVES_PERIOD_MAX,
  WAVES_PERIOD_MIN,
  WAVE_FORMS,
  type AvatarBackdropPattern,
  type AvatarConcentric,
  type AvatarPsychedelic,
  type AvatarSunburst,
  type AvatarWaves,
} from '@psd/contracts';

/**
 * ADR-173/181/204/207 — the backdrop's pattern: squares IN the palette they modify.
 *
 * A plain backdrop stays exactly what it was: one colour, chosen from the palette these squares
 * now sit in. Turning a pattern on keeps that colour as the first of the two and reveals the
 * knobs that belong only to that pattern.
 *
 * The control has shed a layer of indirection at every revision. ADR-173 made it a two-option
 * dropdown; ADR-181 made it a pressed square, because a dropdown costs a tap to discover what
 * the options are and cannot show what either looks like; ADR-204 took away the heading, because
 * a label reading \"Spiral\" above one square announces a SETTING and a setting is a thing you
 * decide about separately. ADR-207 adds a second square beside the first and changes nothing
 * else — which is the test of whether ADR-204 put it in the right place. It did: a second
 * pattern is a second swatch, not a new row, a dropdown, or a mode.
 *
 * Each square both SELECTS its pattern and, when it is already the one showing, turns it off.
 * `aria-pressed` carries which is which, and the accessible name carries the state that the
 * removed heading used to imply.
 *
 * The knobs are mounted only while their pattern is on rather than disabled, since a ray count
 * means nothing behind a plain colour — or behind a ring of petals — and a row of dead sliders
 * invites the question of what they would have done.
 */

export interface BackdropPatternProps {
  sunburst: AvatarBackdropPattern | null;
  /** The first colour — the backdrop the palette these squares sit in already set. */
  colourOne: string;
  onChange: (pattern: AvatarBackdropPattern | null) => void;
}

/** The squares themselves, handed to `ColourRow` as the last swatches of the Backdrop palette. */
export function BackdropPatternSwatches(props: BackdropPatternProps) {
  const current = props.sunburst;
  const swatch = (kind: AvatarBackdropPattern['kind'], label: string, preset: AvatarBackdropPattern) => (
    <button
      type="button"
      className={`gb-swatch gb-swatch--${kind}`}
      data-testid={`avatar-studio__backdrop-${kind}`}
      aria-pressed={current?.kind === kind}
      aria-label={`Backdrop: ${label}, ${current?.kind === kind ? 'on' : 'off'}`}
      style={{ backgroundColor: props.colourOne }}
      onClick={() => props.onChange(current?.kind === kind ? null : preset)}
    />
  );
  return (
    <>
      {swatch('spiral', 'spiral', DEFAULT_SUNBURST)}
      {swatch('concentric', 'rings', DEFAULT_CONCENTRIC)}
      {swatch('waves', 'waves', DEFAULT_WAVES)}
      {swatch('psychedelic', 'swirls', DEFAULT_PSYCHEDELIC)}
    </>
  );
}

/** Everything the pattern adds, below the palette: what it is doing, and the knobs for it. */
/** ADR-232 (F8) — the swatch's name when the palette has it, otherwise a plain phrase, never the hex. */
function namedColour(hex: string): string {
  return AVATAR_BACKDROP_SWATCHES.find((swatch) => swatch.hex === hex)?.label ?? 'a custom colour';
}

export function BackdropStyleControls(props: BackdropPatternProps) {
  const current = props.sunburst;
  return (
    <>
      <span className="gb-hint" data-testid="avatar-studio__backdrop-style-value">
        {describe(current)}
      </span>
      {current === null ? null : (
        <>
          <SecondColour pattern={current} colourOne={props.colourOne} onChange={props.onChange} />
          <PatternControls pattern={current} onChange={props.onChange} />
          <BandsControl pattern={current} onChange={props.onChange} />
        </>
      )}
    </>
  );
}

/** The one place that knows which panel belongs to which pattern. */
function PatternControls(props: {
  pattern: AvatarBackdropPattern;
  onChange: (pattern: AvatarBackdropPattern) => void;
}) {
  const { pattern } = props;
  if (pattern.kind === 'spiral') {
    return <SunburstControls sunburst={pattern} onChange={props.onChange} />;
  }
  if (pattern.kind === 'waves') {
    return <WavesControls pattern={pattern} onChange={props.onChange} />;
  }
  if (pattern.kind === 'psychedelic') {
    return <PsychedelicControls pattern={pattern} onChange={props.onChange} />;
  }
  return <ConcentricControls pattern={pattern} onChange={props.onChange} />;
}

function describe(pattern: AvatarBackdropPattern | null): string {
  if (pattern === null) return 'Pattern: off — plain colour';
  if (pattern.kind === 'spiral') return `Spiral, ${pattern.rays} rays`;
  if (pattern.kind === 'waves') {
    // Amplitude zero is not "a chevron with no chevron in it" — it is stripes, which is a
    // backdrop somebody may well have been aiming for, so it gets its own name on screen.
    if (pattern.amplitude === 0) return 'Stripes';
    return `${WAVE_FORMS[pattern.wave - 1]?.label ?? 'Chevron'} waves`;
  }
  if (pattern.kind === 'psychedelic') {
    return pattern.swirl === 0 ? 'Groovy waves' : 'Psychedelic swirls';
  }
  const shape = CONCENTRIC_SHAPES[pattern.shape - 1]?.label ?? 'Circle';
  return pattern.lobes === 0
    ? `Rings, ${shape.toLowerCase()}`
    : `Rings, ${shape.toLowerCase()}, ${pattern.lobes} petals`;
}

/**
 * The second colour, shared by every pattern because it is the same decision in every one.
 *
 * The FIRST colour is deliberately not repeated as a control here: it is the backdrop swatch
 * row directly above, and offering it twice would leave two places disagreeing about which won.
 */
function SecondColour(props: {
  pattern: AvatarBackdropPattern;
  colourOne: string;
  onChange: (pattern: AvatarBackdropPattern) => void;
}) {
  const { pattern } = props;
  const named = AVATAR_BACKDROP_SWATCHES.find((swatch) => swatch.hex === pattern.colourTwo);
  return (
    <>
      <span className="gb-hint" data-testid="avatar-studio__sunburst-first">
        {/* ADR-232 (F8) — a colour is named, never written as its hex in the visible text. */}
        First colour: {namedColour(props.colourOne)} — set by the Backdrop palette above.
      </span>

      <div className="gb-swatches">
        {AVATAR_BACKDROP_SWATCHES.map((swatch) => (
          <button
            key={swatch.hex}
            type="button"
            className="gb-swatch"
            data-testid="avatar-studio__sunburst-colour"
            style={{ backgroundColor: swatch.hex }}
            aria-pressed={pattern.colourTwo === swatch.hex}
            aria-label={`Second colour: ${swatch.label}`}
            onClick={() => props.onChange({ ...pattern, colourTwo: swatch.hex })}
          />
        ))}
        <label className="gb-swatch gb-swatch--wheel" aria-label="Second colour: any colour">
          <input
            type="color"
            data-testid="avatar-studio__sunburst-colour-wheel"
            value={pattern.colourTwo}
            onChange={(event) =>
              props.onChange({ ...pattern, colourTwo: event.target.value.toLowerCase() })
            }
          />
        </label>
      </div>
      <span className="gb-hint" data-testid="avatar-studio__sunburst-colour-value">
        Second colour: {named ? named.label : 'a custom colour'}
      </span>
    </>
  );
}

/**
 * ADR-206 — a count, not a set of pickers. Two colours are chosen and the shades between them
 * are worked out, so asking for four bands costs the participant no extra decisions. Four wells
 * instead would be four chances to pick something that clashes with a face, to fix a problem
 * nobody has.
 */
function BandsControl(props: {
  pattern: AvatarBackdropPattern;
  onChange: (pattern: AvatarBackdropPattern) => void;
}) {
  return (
    <Slider
      label="Shades"
      testId="avatar-studio__sunburst-bands"
      min={SUNBURST_BANDS_MIN}
      max={SUNBURST_BANDS_MAX}
      value={props.pattern.bands}
      onChange={(bands) => props.onChange({ ...props.pattern, bands })}
      describe={(value) => (value === SUNBURST_BANDS_MIN ? 'Two colours' : `${value} colours, blended`)}
    />
  );
}

function SunburstControls(props: {
  sunburst: AvatarSunburst;
  onChange: (pattern: AvatarSunburst) => void;
}) {
  const { sunburst } = props;
  return (
    <>
      <Slider
        label="Rays"
        testId="avatar-studio__sunburst-rays"
        min={SUNBURST_RAYS_MIN}
        max={SUNBURST_RAYS_MAX}
        value={sunburst.rays}
        onChange={(rays) => props.onChange({ ...sunburst, rays })}
        describe={(value) => String(value)}
      />
      <Slider
        label="Twist"
        testId="avatar-studio__sunburst-twist"
        min={SUNBURST_TWIST_MIN}
        max={SUNBURST_TWIST_MAX}
        value={sunburst.twist}
        onChange={(twist) => props.onChange({ ...sunburst, twist })}
        describe={(value) => (value === 0 ? 'Straight' : String(value))}
      />
    </>
  );
}

/**
 * ADR-207 — every range here is read off the contact-sheet probe at 32px, not chosen. Ring
 * width floors at four because three aliases into moiré; lobes reach twelve and still read.
 */
function ConcentricControls(props: {
  pattern: AvatarConcentric;
  onChange: (pattern: AvatarConcentric) => void;
}) {
  const { pattern } = props;
  return (
    <>
      {/* Four stops rather than a slider: the exponents between them look the same at 32px. */}
      <span className="gb-label">Shape</span>
      <div className="gb-swatches">
        {CONCENTRIC_SHAPES.map((shape, index) => (
          <button
            key={shape.label}
            type="button"
            className="gb-button gb-button--small"
            data-testid="avatar-studio__concentric-shape"
            aria-pressed={pattern.shape === index + 1}
            onClick={() => props.onChange({ ...pattern, shape: index + 1 })}
          >
            {shape.label}
          </button>
        ))}
      </div>
      <Slider
        label="Ring width"
        testId="avatar-studio__concentric-ring"
        min={CONCENTRIC_RING_MIN}
        max={CONCENTRIC_RING_MAX}
        value={pattern.ringWidth}
        onChange={(ringWidth) => props.onChange({ ...pattern, ringWidth })}
        describe={(value) => `${value} wide`}
      />
      <Slider
        label="Petals"
        testId="avatar-studio__concentric-lobes"
        min={CONCENTRIC_LOBES_MIN}
        max={CONCENTRIC_LOBES_MAX}
        value={pattern.lobes}
        onChange={(lobes) => props.onChange({ ...pattern, lobes })}
        describe={(value) => (value === 0 ? 'None — plain rings' : String(value))}
      />
      <Slider
        label="Petal depth"
        testId="avatar-studio__concentric-depth"
        min={CONCENTRIC_DEPTH_MIN}
        max={CONCENTRIC_DEPTH_MAX}
        value={pattern.lobeDepth}
        onChange={(lobeDepth) => props.onChange({ ...pattern, lobeDepth })}
        describe={(value) => (value === 0 ? 'Flat' : String(value))}
      />
    </>
  );
}

/**
 * ADR-209 — "Ripple" is a percentage of what is safe AT THE CURRENT FREQUENCY, not an absolute
 * displacement, for the same measured reason wave size is a percentage of wave width: the probe
 * found the warp dissolves when strength beats the square of frequency. Turning Waviness up
 * quietly re-scales Ripple underneath, so no combination of these two sliders can produce mud.
 */
function PsychedelicControls(props: {
  pattern: AvatarPsychedelic;
  onChange: (pattern: AvatarPsychedelic) => void;
}) {
  const { pattern } = props;
  return (
    <>
      <Slider
        label="Swirl"
        testId="avatar-studio__psychedelic-swirl"
        min={PSYCHEDELIC_SWIRL_MIN}
        max={PSYCHEDELIC_SWIRL_MAX}
        value={pattern.swirl}
        onChange={(swirl) => props.onChange({ ...pattern, swirl })}
        describe={(value) => (value === 0 ? 'None — liquid blobs' : `${value} turns`)}
      />
      <Slider
        label="Ripple"
        testId="avatar-studio__psychedelic-ripple"
        min={PSYCHEDELIC_RIPPLE_MIN}
        max={PSYCHEDELIC_RIPPLE_MAX}
        value={pattern.ripple}
        onChange={(ripple) => props.onChange({ ...pattern, ripple })}
        describe={(value) => (value === 0 ? 'Still' : `${value * 10}%`)}
      />
      <Slider
        label="Waviness"
        testId="avatar-studio__psychedelic-frequency"
        min={PSYCHEDELIC_FREQUENCY_MIN}
        max={PSYCHEDELIC_FREQUENCY_MAX}
        value={pattern.frequency}
        onChange={(frequency) => props.onChange({ ...pattern, frequency })}
        describe={(value) => String(value)}
      />
      <Slider
        label="Band width"
        testId="avatar-studio__psychedelic-scale"
        min={PSYCHEDELIC_SCALE_MIN}
        max={PSYCHEDELIC_SCALE_MAX}
        value={pattern.scale}
        onChange={(scale) => props.onChange({ ...pattern, scale })}
        describe={(value) => `${value} wide`}
      />
    </>
  );
}

/**
 * ADR-208 — amplitude is offered as a PERCENTAGE OF THE PERIOD, which is the probe's single
 * most important finding about this pattern and the one thing a participant cannot discover
 * by fiddling: the settings that turn to mush at 32px lie on a line of constant ratio, so a
 * control measured in cells would be safe at one period and ruined at another.
 */
function WavesControls(props: {
  pattern: AvatarWaves;
  onChange: (pattern: AvatarWaves) => void;
}) {
  const { pattern } = props;
  return (
    <>
      <span className="gb-label">Wave</span>
      <div className="gb-swatches">
        {WAVE_FORMS.map((form, index) => (
          <button
            key={form.label}
            type="button"
            className="gb-button gb-button--small"
            data-testid="avatar-studio__waves-form"
            aria-pressed={pattern.wave === index + 1}
            title={form.hint}
            onClick={() => props.onChange({ ...pattern, wave: index + 1 })}
          >
            {form.label}
          </button>
        ))}
      </div>
      <Slider
        label="Wave size"
        testId="avatar-studio__waves-amplitude"
        min={WAVES_AMPLITUDE_MIN}
        max={WAVES_AMPLITUDE_MAX}
        value={pattern.amplitude}
        onChange={(amplitude) => props.onChange({ ...pattern, amplitude })}
        describe={(value) => (value === 0 ? 'Flat — plain stripes' : `${value * 10}% of the width`)}
      />
      <Slider
        label="Wave width"
        testId="avatar-studio__waves-period"
        min={WAVES_PERIOD_MIN}
        max={WAVES_PERIOD_MAX}
        value={pattern.period}
        onChange={(period) => props.onChange({ ...pattern, period })}
        describe={(value) => `${value} across`}
      />
      <Slider
        label="Band height"
        testId="avatar-studio__waves-band"
        min={WAVES_BAND_MIN}
        max={WAVES_BAND_MAX}
        value={pattern.bandHeight}
        onChange={(bandHeight) => props.onChange({ ...pattern, bandHeight })}
        describe={(value) => `${value} tall`}
      />
    </>
  );
}

/** One shape for every knob here, so a new pattern's controls are a list rather than a layout. */
function Slider(props: {
  label: string;
  testId: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  describe: (value: number) => string;
}) {
  return (
    <label className="gb-controls__fine">
      <span className="gb-label">{props.label}</span>
      <input
        type="range"
        className="gb-range"
        data-testid={props.testId}
        min={props.min}
        max={props.max}
        step={1}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
      <span className="gb-hint" data-testid={`${props.testId}-value`}>
        {props.describe(props.value)}
      </span>
    </label>
  );
}
