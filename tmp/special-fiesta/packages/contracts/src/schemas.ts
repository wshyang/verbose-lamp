import { z } from "zod";
import { messages } from "./messages.js";
import { avatarSpriteSchema } from "./sprites.js";
import { awardAdjustmentPoints } from "./awards.js";

/** Validation bounds are normative: fds.md §2 object tables. */
export const NICKNAME_PATTERN = /^[A-Za-z0-9_]+$/;
export const PIN_PATTERN = /^[0-9]{4}$/;
/** ADR-088 — the public, spoken-aloud scan number. Same shape as a PIN; nothing else alike. */
export const SCAN_NUMBER_PATTERN = /^[0-9]{4}$/;
export const JOIN_CODE_PATTERN = /^[A-HJ-KM-NP-Z2-9]{6}$/;
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const AVATAR_VARIANT_COUNT = 5;

/**
 * ADR-020 — `avatarVariant` is a persona, not just a palette. The order is the contract:
 * variant 1 is the Skipper, variant 5 is the Sundowner, on both presentations.
 */
export const AVATAR_PERSONAS = [
  "Skipper",
  "Sprinter",
  "Strategist",
  "Hype",
  "Sundowner",
] as const;

export const nicknameSchema = z
  .string()
  .trim()
  .min(3, messages.nicknameInvalid)
  .max(20, messages.nicknameInvalid)
  .regex(NICKNAME_PATTERN, messages.nicknameInvalid)
  // ADR-088 — nicknames and scan numbers share a spoken channel, so the namespaces must be
  // disjoint at every length, not just four digits.
  .refine((value) => !/^[0-9]+$/.test(value), messages.nicknameAllDigits);

/** ADR-088 — a scan number as the wire carries it: the zero-padded string IS the value. */
export const scanNumberSchema = z
  .string()
  .regex(SCAN_NUMBER_PATTERN, messages.scanNumberInvalid);

export const pinSchema = z.string().regex(PIN_PATTERN, messages.pinInvalid);
export const passcodeSchema = z
  .string()
  .regex(PIN_PATTERN, messages.passcodeInvalid);

export const usernameSchema = z
  .string()
  .trim()
  .min(4, messages.usernameInvalid)
  .max(20, messages.usernameInvalid)
  .regex(/^[A-Za-z0-9]+$/, messages.usernameInvalid);

/**
 * ADR-172 — shape only. Whether the code names a cluster that EXISTS and is still open is a
 * question about the catalogue, which lives in the database; the API answers it with
 * `assertClusterUsable`, and the `participant.cluster_code` foreign key is the backstop.
 *
 * It was `z.enum(CLUSTER_CODES)`, which made the valid set a compile-time fact. A cluster added
 * by a superadmin at run time would have been refused by this very schema.
 */
export const clusterCodeSchema = z
  .string()
  .trim()
  .min(1, messages.clusterRequired)
  .max(30, messages.clusterCodeInvalid)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 _-]*$/, messages.clusterCodeInvalid);

export const clusterDisplayNameSchema = z
  .string()
  .trim()
  .min(1, messages.clusterNameInvalid)
  .max(30, messages.clusterNameInvalid);

export const createClusterRequestSchema = z.object({
  code: clusterCodeSchema,
  displayName: clusterDisplayNameSchema,
});

/** The code is the primary key three tables point at, so only the label is editable (ADR-172). */
export const renameClusterRequestSchema = z.object({
  displayName: clusterDisplayNameSchema,
});

/** Retiring is refused while anyone is still in it, so the move comes first. */
export const reassignClusterRequestSchema = z.object({
  toClusterCode: clusterCodeSchema,
});

export const genderSchema = z.enum(["male", "female"], {
  errorMap: () => ({ message: messages.genderRequired }),
});

export const avatarVariantSchema = z
  .number()
  .int()
  .min(1, messages.avatarRequired)
  .max(AVATAR_VARIANT_COUNT, messages.avatarRequired);

/**
 * ADR-021 — personalisation axes. A participant picks one index on each; the six indices
 * travel as a single dash-joined code (`skin-style-hair-facial-outfit-backdrop`) so one
 * column and one wire field carry the whole appearance.
 */
export const AVATAR_SKIN_TONES = [
  "Porcelain",
  "Light",
  "Warm",
  "Tan",
  "Olive",
  "Brown",
  "Deep",
  "Ebony",
] as const;

export const AVATAR_HAIR_COLOURS = [
  "Black",
  "Dark brown",
  "Brown",
  "Auburn",
  "Ginger",
  "Blond",
  "Platinum",
  "Grey",
  "Teal",
  "Pink",
] as const;

/**
 * ADR-028 — shirt and backdrop are not anatomy, so they are not a list: the participant
 * picks any colour. These stay as one-tap quick picks next to the colour wheel, which is
 * how most people will still choose.
 */
export const AVATAR_OUTFIT_SWATCHES = [
  { label: "PSD blue", hex: "#1f4e9c" },
  { label: "Sky", hex: "#3a8fd0" },
  { label: "Jade", hex: "#0f8f76" },
  { label: "Forest", hex: "#2f7a3f" },
  { label: "Crimson", hex: "#c0392b" },
  { label: "Maroon", hex: "#7b2d3a" },
  { label: "Orange", hex: "#e07b2a" },
  { label: "Violet", hex: "#6b4bb5" },
  { label: "Charcoal", hex: "#333b49" },
  { label: "White", hex: "#e6e8ef" },
] as const;

export const AVATAR_BACKDROP_SWATCHES = [
  { label: "Sea", hex: "#1d5b8c" },
  { label: "Crimson", hex: "#93304a" },
  { label: "Indigo", hex: "#33477a" },
  { label: "Gold", hex: "#b8770a" },
  { label: "Jade", hex: "#158a5f" },
  { label: "Sunset", hex: "#c2561f" },
  { label: "Violet", hex: "#6a3f9e" },
  { label: "Lagoon", hex: "#12797f" },
  { label: "Slate", hex: "#46505e" },
  { label: "Rose", hex: "#b8467a" },
] as const;

/** Hair styles are drawn per build, so the two lists differ. */
export const AVATAR_HAIR_STYLES = {
  male: ["Crop", "Side part", "Curls", "Top knot", "Buzz"],
  female: ["Long", "Bob", "Braid", "Ponytail", "Curls"],
} as const;

export const AVATAR_FACIAL_HAIR = ["Clean", "Stubble", "Beard"] as const;

/**
 * ADR-029 — build, worded the way you would describe a friend rather than a BMI chart.
 * Three is the middle and the default.
 */
export const AVATAR_BUILDS = [
  "Slight",
  "Lean",
  "Regular",
  "Sturdy",
  "Broad",
] as const;

/**
 * Skin tone, hair style, hair colour and facial hair are indices into hand-drawn art —
 * there are eight skins because eight were drawn. Shirt and backdrop are free colours
 * (ADR-028), carried as `#rrggbb`.
 */
export interface AvatarLook {
  skinTone: number;
  hairStyle: number;
  hairColour: number;
  facialHair: number;
  build: number;
  outfitColour: string;
  backdrop: string;
  /**
   * ADR-173/207 — null is a plain backdrop; set, the backdrop wears a pattern.
   *
   * The field keeps the name it was born with. It means "the backdrop's pattern" and has meant
   * that since ADR-173; what changed in ADR-207 is that a pattern can be something other than a
   * spiral. Renaming it was offered and declined, so the honesty lives in the TYPE names and in
   * the wire tag instead — nothing here is called a sunburst unless it is one.
   */
  sunburst: AvatarBackdropPattern | null;
}

/**
 * ADR-173 — the hypnotic radial sunburst.
 *
 * `backdrop` is the first colour, so a look that already exists keeps the colour its owner
 * chose and gains the rays around it. The second colour, the ray count and the twist are the
 * three things the studio lets them move.
 */
/**
 * ADR-206/207 — what every backdrop pattern has, whichever one it is.
 *
 * Two colours and a count. The participant picks the backdrop (colour one) and `colourTwo`, and
 * any bands between them are interpolated, so a four-band pattern is still a two-colour
 * decision. Shared because it is the same decision in every pattern, not because the patterns
 * share an implementation — each one computes its own band index and knows nothing of the rest.
 */
export interface AvatarPatternBase {
  colourTwo: string;
  bands: number;
}

export interface AvatarSunburst extends AvatarPatternBase {
  kind: "spiral";
  rays: number;
  /**
   * How hard the rays are dragged sideways as they travel out, in tenths. 0 is a plain straight
   * sunburst; the curvature used when drawing is `twist * SUNBURST_TWIST_STEP`.
   */
  twist: number;
  /**
   * ADR-206 — how many colours the backdrop is cut into, counting both ends.
   *
   * 2 is the original: the backdrop colour and `colourTwo`, nothing between them. Above that the
   * intermediate bands are INTERPOLATED between the same two endpoints rather than picked, so
   * the participant still chooses exactly two colours however many bands there are.
   */
  bands: number;
}

/**
 * ADR-207 — 🌀 concentric radiating shapes.
 *
 * Bands of constant SHAPE distance rather than constant radius. `shape` indexes
 * `CONCENTRIC_SHAPES`, whose exponents are the Minkowski p-norm: the unit ball of ‖·‖ₚ is a
 * diamond at p=1, a circle at p=2, a squircle at p=4 and a square as p→∞. `lobes` modulates
 * that radius with a rose term `cos(k·θ)`, which is what turns plain rings into the petalled
 * eco-logo; `lobeDepth` is how deep the petals cut, in tenths, so the whole look stays
 * integer-valued on the wire the way `twist` already is.
 */
export interface AvatarConcentric extends AvatarPatternBase {
  kind: "concentric";
  /** 1-based index into `CONCENTRIC_SHAPES`. */
  shape: number;
  /** Cells from one band to the next, measured on the 64-cell drawn grid. */
  ringWidth: number;
  lobes: number;
  /** Tenths: the drawn depth is `lobeDepth / 10`. */
  lobeDepth: number;
}

/**
 * ADR-208 — ⚡ chevron & bargello waves.
 *
 * One pattern, two waveforms, because chevron and bargello differ in exactly one term: the
 * zigzag is a TRIANGLE wave and the flame stitch is a SINE. Everything else — period,
 * amplitude, band height — is shared, and splitting them into two patterns would have meant
 * two functions differing by one line and two sets of knobs to keep in step.
 *
 * `amplitude` is a FRACTION of the period in tenths, never a number of cells. The probe is
 * unambiguous about this: the settings that turn to mush fall on a line of constant
 * amplitude-to-period ratio, so a cell-valued control would be legible at one period and
 * ruined at another with no warning to the participant.
 */
export interface AvatarWaves extends AvatarPatternBase {
  kind: "waves";
  /** 1-based index into `WAVE_FORMS`. */
  wave: number;
  /** Cells from one crest to the next, on the 64-cell drawn grid. */
  period: number;
  /** Tenths of the period: the drawn swing is `period * amplitude / 10`. Zero is stripes. */
  amplitude: number;
  /** Cells from one colour band to the next, measured across the wave. */
  bandHeight: number;
}

/**
 * ADR-209 — 🌀 psychedelic swirls & groovy waves.
 *
 * A DOMAIN WARP: the sample point is displaced by a pair of sine terms before the pattern is
 * evaluated at all, so the bands are liquid rather than geometric. `ripple` is the strength of
 * that displacement and `frequency` is how often it undulates.
 *
 * `ripple` is a FRACTION of the usable maximum in tenths, not an absolute distance — the same
 * move ADR-208 made for wave amplitude, for the same measured reason. The probe found warp
 * legibility depends on strength against the SQUARE of the frequency (`w·f² ≤ 0.8`), so an
 * absolute control would be safe at one frequency and dissolve the avatar at another.
 *
 * `swirl` counts turns of the vortex, and the arms it produces are a multiple of the band
 * count so the colour cycle closes where the angle wraps. See `psychedelic.ts`.
 */
export interface AvatarPsychedelic extends AvatarPatternBase {
  kind: "psychedelic";
  /** Turns of the vortex. Zero is a liquid blob field with no rotation at all. */
  swirl: number;
  /** How often the warp undulates across the avatar. */
  frequency: number;
  /** Tenths of the frequency-dependent maximum. Zero is an unwarped swirl. */
  ripple: number;
  /** Cells from one band to the next before warping, on the 64-cell drawn grid. */
  scale: number;
}

export type AvatarBackdropPattern =
  AvatarSunburst | AvatarConcentric | AvatarWaves | AvatarPsychedelic;

/**
 * Two waveforms, named for the crafts they come from rather than for their trigonometry,
 * because "Chevron" and "Bargello" are what the picture looks like and "triangle" and "sine"
 * are what the code does.
 */
export const WAVE_FORMS = [
  { label: "Chevron", hint: "Sharp zigzag" },
  { label: "Bargello", hint: "Soft flame stitch" },
] as const;

export const WAVES_PERIOD_MIN = 12;
export const WAVES_PERIOD_MAX = 48;
export const WAVES_AMPLITUDE_MIN = 0;
export const WAVES_AMPLITUDE_MAX = 7;
export const WAVES_BAND_MIN = 6;
export const WAVES_BAND_MAX = 16;

export const DEFAULT_WAVES: AvatarWaves = {
  kind: "waves",
  colourTwo: "#f7d154",
  bands: 3,
  wave: 1,
  period: 24,
  amplitude: 4,
  bandHeight: 8,
};

/**
 * The four stops, not a slider. All four read as distinctly different shapes at 32px and the
 * values between them do not, so a continuous exponent would be offering precision the picture
 * cannot show. `Infinity` is the square: `max(|u|, |v|)`, which is also cheaper than `pow`.
 */
export const CONCENTRIC_SHAPES = [
  { label: "Diamond", exponent: 1 },
  { label: "Circle", exponent: 2 },
  { label: "Squircle", exponent: 4 },
  { label: "Square", exponent: Infinity },
] as const;

/* Every range below is read off `apps/web/scripts/probe-backdrop-patterns.mjs`, not chosen. */
export const CONCENTRIC_RING_MIN = 4;
export const CONCENTRIC_RING_MAX = 14;
export const CONCENTRIC_LOBES_MIN = 0;
export const CONCENTRIC_LOBES_MAX = 12;
export const CONCENTRIC_DEPTH_MIN = 0;
export const CONCENTRIC_DEPTH_MAX = 5;

/** Three bands by default, on the probe's evidence that interpolation buys legibility. */
export const DEFAULT_CONCENTRIC: AvatarConcentric = {
  kind: "concentric",
  colourTwo: "#f7d154",
  bands: 3,
  shape: 2,
  ringWidth: 8,
  lobes: 6,
  lobeDepth: 2,
};

export const PSYCHEDELIC_SWIRL_MIN = 0;
export const PSYCHEDELIC_SWIRL_MAX = 6;
export const PSYCHEDELIC_FREQUENCY_MIN = 1;
export const PSYCHEDELIC_FREQUENCY_MAX = 5;
export const PSYCHEDELIC_RIPPLE_MIN = 0;
export const PSYCHEDELIC_RIPPLE_MAX = 10;
export const PSYCHEDELIC_SCALE_MIN = 4;
export const PSYCHEDELIC_SCALE_MAX = 14;

export const DEFAULT_PSYCHEDELIC: AvatarPsychedelic = {
  kind: "psychedelic",
  colourTwo: "#f7d154",
  bands: 3,
  swirl: 1,
  frequency: 2,
  ripple: 6,
  scale: 8,
};

export const SUNBURST_BANDS_MIN = 2;
/**
 * Four, from the contact-sheet probe (`apps/web/scripts/probe-backdrop-patterns.mjs`). Past four
 * a 64-cell field has fewer cells per band than the pattern needs to still read at 32px, which
 * is the size that actually decides whether any of this works.
 */
export const SUNBURST_BANDS_MAX = 4;

export const SUNBURST_RAYS_MIN = 3;
export const SUNBURST_RAYS_MAX = 24;
export const SUNBURST_TWIST_MIN = 0;
export const SUNBURST_TWIST_MAX = 10;

/**
 * Radians of extra angle per unit of radius, per step of `twist`.
 *
 * The art is 64 cells across, so the furthest corner sits about 45 cells from the centre and
 * the maximum twist bends the outermost ray by roughly `45 * 10 * 0.006 ≈ 2.7` radians — a bit
 * under half a turn. Enough to be unmistakably a spiral, not so much that the rays wrap over
 * themselves and read as noise at 32 pixels.
 */
export const SUNBURST_TWIST_STEP = 0.006;

/**
 * Two bands, deliberately. The probe found that more bands read BETTER at 32px, and the new
 * patterns will default to three on the strength of it — but this is the look that participants
 * already wearing a spiral see, and changing what a stored code draws is not a default change,
 * it is an edit to somebody's face.
 */
export const DEFAULT_SUNBURST: AvatarSunburst = {
  kind: "spiral",
  colourTwo: "#f7d154",
  rays: 12,
  twist: 4,
  bands: 2,
};

/** Picked from a list, because the art behind them is a list. */
export const AVATAR_INDEX_AXES = [
  { key: "skinTone", label: "Skin", options: AVATAR_SKIN_TONES },
  { key: "hairColour", label: "Hair colour", options: AVATAR_HAIR_COLOURS },
] as const;

/** Picked from the whole colour wheel, with these as quick picks. */
export const AVATAR_COLOUR_AXES = [
  { key: "outfitColour", label: "Shirt", swatches: AVATAR_OUTFIT_SWATCHES },
  { key: "backdrop", label: "Backdrop", swatches: AVATAR_BACKDROP_SWATCHES },
] as const;

/** The four axes that are an index into hand-drawn art. */
type AvatarLookIndexKey =
  "skinTone" | "hairStyle" | "hairColour" | "facialHair" | "build";

const LOOK_LIMITS: Array<[AvatarLookIndexKey, number]> = [
  ["skinTone", AVATAR_SKIN_TONES.length],
  ["hairStyle", AVATAR_HAIR_STYLES.male.length],
  ["hairColour", AVATAR_HAIR_COLOURS.length],
  ["facialHair", AVATAR_FACIAL_HAIR.length],
  ["build", AVATAR_BUILDS.length],
];

const HEX_COLOUR = /^#[0-9a-f]{6}$/;

/** Anything a colour input can hand back, normalised to the wire form. */
export function asAvatarColour(value: string): string | null {
  const lower = value.trim().toLowerCase();
  const hashed = lower.startsWith("#") ? lower : `#${lower}`;
  return HEX_COLOUR.test(hashed) ? hashed : null;
}

export const DEFAULT_AVATAR_LOOK: AvatarLook = {
  skinTone: 3,
  hairStyle: 1,
  hairColour: 2,
  facialHair: 1,
  build: 3,
  outfitColour: "#1f4e9c",
  backdrop: "#1d5b8c",
  sunburst: null,
};

/** Each persona arrives wearing its own kit; the wearer's own traits are left alone. */
export const AVATAR_PERSONA_PRESETS: Array<
  Pick<AvatarLook, "outfitColour" | "backdrop">
> = [
  { outfitColour: "#1f4e9c", backdrop: "#1d5b8c" },
  { outfitColour: "#c0392b", backdrop: "#93304a" },
  { outfitColour: "#333b49", backdrop: "#33477a" },
  { outfitColour: "#e07b2a", backdrop: "#b8770a" },
  { outfitColour: "#0f8f76", backdrop: "#158a5f" },
];

export function formatAvatarLook(look: AvatarLook): string {
  const indices = LOOK_LIMITS.map(([key]) => look[key]);
  const base = [...indices, look.outfitColour.slice(1), look.backdrop.slice(1)];
  /*
   * ADR-173 — the sunburst is three extra parts on the end, written only when there is one.
   *
   * Appending rather than inserting, and omitting rather than defaulting, is what keeps every
   * code ever minted readable: a seven-part look is a plain backdrop and always was. It is the
   * same move ADR-029 made when `build` arrived, read from the other end.
   */
  if (look.sunburst === null) return base.join("-");
  return [...base, ...patternParts(look.sunburst)].join("-");
}

function patternParts(pattern: AvatarBackdropPattern): Array<string | number> {
  const colour = pattern.colourTwo.slice(1);
  if (pattern.kind === "concentric") {
    /*
     * ADR-207 — fixed arity, unlike the spiral below.
     *
     * The spiral's band count is optional because codes exist that predate bands and have to
     * keep meaning what they meant. A pattern minted after ADR-205 has no history to be
     * compatible with, so it writes every part every time: one shape for the reader, nothing
     * to infer, and no second rule to get wrong later.
     */
    const { shape, ringWidth, lobes, lobeDepth, bands } = pattern;
    return [CONCENTRIC_TAG, colour, shape, ringWidth, lobes, lobeDepth, bands];
  }
  if (pattern.kind === "psychedelic") {
    const { swirl, frequency, ripple, scale, bands } = pattern;
    return [PSYCHEDELIC_TAG, colour, swirl, frequency, ripple, scale, bands];
  }
  if (pattern.kind === "waves") {
    const { wave, period, amplitude, bandHeight, bands } = pattern;
    return [WAVES_TAG, colour, wave, period, amplitude, bandHeight, bands];
  }
  const spiral: Array<string | number> = [
    SPIRAL_TAG,
    colour,
    pattern.rays,
    pattern.twist,
  ];
  // ADR-206 — omitted when it is two, which is what every code written before bands existed
  // meant. Same move as ADR-029 and ADR-173: append, and leave out what the old meaning was.
  if (pattern.bands !== SUNBURST_BANDS_MIN) spiral.push(pattern.bands);
  return spiral;
}

function clampWhole(value: unknown, low: number, high: number): number | null {
  const number = Number(value);
  if (!Number.isInteger(number) || number < low || number > high) return null;
  return number;
}

/**
 * ADR-205 — the trailing group says what it is.
 *
 * ADR-173 appended the spiral to the end of the look code and worked out whether there was one
 * by ARITY: no trailing parts means none, three means a spiral, anything else is malformed.
 * That is a fine trick and it works exactly once. A second pattern needs its own count, and the
 * first time two patterns want the same count the format has no way to tell them apart — the
 * code would parse, and draw the wrong thing. A silent wrong answer, with no error to follow.
 *
 * So the group now opens with a one-letter tag naming the pattern. Adding it while there is
 * still only ONE pattern is the whole point: there is nothing to disambiguate yet, so there is
 * no migration, no ambiguity to resolve under pressure later, and the back-compatibility rule
 * can be proved exhaustively today rather than reasoned about.
 *
 * Old codes are read by the rule below and are never rewritten in place; a look is re-minted in
 * the tagged form the next time its owner saves. A tag is a single lowercase letter by
 * construction and a colour is six hex digits, so `asAvatarColour` separates the two with no
 * overlap and no lookahead.
 */
const SPIRAL_TAG = "s";
const CONCENTRIC_TAG = "c";
const WAVES_TAG = "w";
const PSYCHEDELIC_TAG = "p";

/** The spiral's own parts: second colour, ray count, twist, and optionally a band count. */
function spiralFrom(parts: string[]): AvatarSunburst | undefined {
  if (parts.length !== 3 && parts.length !== 4) return undefined;
  const colourTwo = asAvatarColour(String(parts[0]));
  const rays = clampWhole(parts[1], SUNBURST_RAYS_MIN, SUNBURST_RAYS_MAX);
  const twist = clampWhole(parts[2], SUNBURST_TWIST_MIN, SUNBURST_TWIST_MAX);
  const bands =
    parts.length === 3
      ? SUNBURST_BANDS_MIN
      : clampWhole(parts[3], SUNBURST_BANDS_MIN, SUNBURST_BANDS_MAX);
  if (colourTwo === null || rays === null || twist === null || bands === null)
    return undefined;
  return { kind: "spiral", colourTwo, rays, twist, bands };
}

/** ADR-207 — the concentric pattern's six parts, all of them required. */
function concentricFrom(parts: string[]): AvatarConcentric | undefined {
  if (parts.length !== 6) return undefined;
  const colourTwo = asAvatarColour(String(parts[0]));
  const shape = clampWhole(parts[1], 1, CONCENTRIC_SHAPES.length);
  const ringWidth = clampWhole(
    parts[2],
    CONCENTRIC_RING_MIN,
    CONCENTRIC_RING_MAX,
  );
  const lobes = clampWhole(
    parts[3],
    CONCENTRIC_LOBES_MIN,
    CONCENTRIC_LOBES_MAX,
  );
  const lobeDepth = clampWhole(
    parts[4],
    CONCENTRIC_DEPTH_MIN,
    CONCENTRIC_DEPTH_MAX,
  );
  const bands = clampWhole(parts[5], SUNBURST_BANDS_MIN, SUNBURST_BANDS_MAX);
  if (colourTwo === null || shape === null || ringWidth === null)
    return undefined;
  if (lobes === null || lobeDepth === null || bands === null) return undefined;
  return {
    kind: "concentric",
    colourTwo,
    shape,
    ringWidth,
    lobes,
    lobeDepth,
    bands,
  };
}

/** The trailing group, or null if there is none; `undefined` means "present but wrong". */
/** ADR-208 — six required parts, the same fixed-arity rule ADR-207 set for new patterns. */
function wavesFrom(parts: string[]): AvatarWaves | undefined {
  if (parts.length !== 6) return undefined;
  const colourTwo = asAvatarColour(String(parts[0]));
  const wave = clampWhole(parts[1], 1, WAVE_FORMS.length);
  const period = clampWhole(parts[2], WAVES_PERIOD_MIN, WAVES_PERIOD_MAX);
  const amplitude = clampWhole(
    parts[3],
    WAVES_AMPLITUDE_MIN,
    WAVES_AMPLITUDE_MAX,
  );
  const bandHeight = clampWhole(parts[4], WAVES_BAND_MIN, WAVES_BAND_MAX);
  const bands = clampWhole(parts[5], SUNBURST_BANDS_MIN, SUNBURST_BANDS_MAX);
  if (colourTwo === null || wave === null || period === null) return undefined;
  if (amplitude === null || bandHeight === null || bands === null)
    return undefined;
  return {
    kind: "waves",
    colourTwo,
    wave,
    period,
    amplitude,
    bandHeight,
    bands,
  };
}

/** ADR-209 — six required parts, the fixed-arity rule ADR-207 set for every post-tag pattern. */
function psychedelicFrom(parts: string[]): AvatarPsychedelic | undefined {
  if (parts.length !== 6) return undefined;
  const colourTwo = asAvatarColour(String(parts[0]));
  const swirl = clampWhole(
    parts[1],
    PSYCHEDELIC_SWIRL_MIN,
    PSYCHEDELIC_SWIRL_MAX,
  );
  const frequency = clampWhole(
    parts[2],
    PSYCHEDELIC_FREQUENCY_MIN,
    PSYCHEDELIC_FREQUENCY_MAX,
  );
  const ripple = clampWhole(
    parts[3],
    PSYCHEDELIC_RIPPLE_MIN,
    PSYCHEDELIC_RIPPLE_MAX,
  );
  const scale = clampWhole(
    parts[4],
    PSYCHEDELIC_SCALE_MIN,
    PSYCHEDELIC_SCALE_MAX,
  );
  const bands = clampWhole(parts[5], SUNBURST_BANDS_MIN, SUNBURST_BANDS_MAX);
  if (colourTwo === null || swirl === null || frequency === null)
    return undefined;
  if (ripple === null || scale === null || bands === null) return undefined;
  return {
    kind: "psychedelic",
    colourTwo,
    swirl,
    frequency,
    ripple,
    scale,
    bands,
  };
}

function patternFrom(
  parts: string[],
): AvatarBackdropPattern | null | undefined {
  if (parts.length === 0) return null;
  const [head, ...rest] = parts;
  // Pre-ADR-205: an untagged group opens with the second colour and is a spiral, as it always was.
  if (asAvatarColour(String(head)) !== null) return spiralFrom(parts);
  if (head === SPIRAL_TAG) return spiralFrom(rest);
  if (head === CONCENTRIC_TAG) return concentricFrom(rest);
  if (head === WAVES_TAG) return wavesFrom(rest);
  if (head === PSYCHEDELIC_TAG) return psychedelicFrom(rest);
  return undefined;
}

/**
 * Malformed or out-of-range codes yield null; callers decide whether that is an error.
 * A colour written as an index is read as the swatch it used to mean, so codes minted
 * before ADR-028 still draw the face their owner chose.
 */
function colourAt(
  raw: string,
  swatches: ReadonlyArray<{ hex: string }>,
): string | null {
  const direct = asAvatarColour(raw);
  if (direct) return direct;
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 1 || index > swatches.length)
    return null;
  return swatches[index - 1]?.hex ?? null;
}

export function parseAvatarLook(code: string): AvatarLook | null {
  const raw = code.split("-");
  // A code minted before ADR-029 has no build in it; it means the middle one.
  const withBuild =
    raw.length === LOOK_LIMITS.length + 1
      ? [...raw.slice(0, 4), String(DEFAULT_AVATAR_LOOK.build), ...raw.slice(4)]
      : raw;
  // ADR-173/205 — anything past the backdrop is the pattern, and there is either none or all of it.
  const parts = withBuild.slice(0, LOOK_LIMITS.length + 2);
  const sunburst = patternFrom(withBuild.slice(LOOK_LIMITS.length + 2));
  if (sunburst === undefined) return null;
  if (parts.length !== LOOK_LIMITS.length + 2) return null;
  const look = { ...DEFAULT_AVATAR_LOOK };
  for (const [index, [key, limit]] of LOOK_LIMITS.entries()) {
    const value = Number(parts[index]);
    if (!Number.isInteger(value) || value < 1 || value > limit) return null;
    look[key] = value;
  }
  const outfitColour = colourAt(String(parts[5]), AVATAR_OUTFIT_SWATCHES);
  const backdrop = colourAt(String(parts[6]), AVATAR_BACKDROP_SWATCHES);
  if (outfitColour === null || backdrop === null) return null;
  return { ...look, outfitColour, backdrop, sunburst };
}

/** Display path: anything unreadable falls back rather than rendering a broken face. */
export function readAvatarLook(code: string | null | undefined): AvatarLook {
  return (code ? parseAvatarLook(code) : null) ?? DEFAULT_AVATAR_LOOK;
}

export const DEFAULT_AVATAR_LOOK_CODE = formatAvatarLook(DEFAULT_AVATAR_LOOK);

/**
 * Validates and *normalises*: a look arrives however the client wrote it — an old index
 * for the shirt, an upper-case hex from a colour picker — and is stored one way
 * (ADR-028), so the database only ever holds the canonical form.
 */
export const avatarLookSchema = z
  .string()
  .refine(
    (value) => parseAvatarLook(value) !== null,
    messages.avatarLookInvalid,
  )
  .transform((value) => formatAvatarLook(readAvatarLook(value)));

export const teamNameSchema = z
  .string()
  .trim()
  .min(3, messages.teamNameInvalid)
  .max(30, messages.teamNameInvalid);

export const joinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(JOIN_CODE_PATTERN, messages.teamNotFound);

export const reasonSchema = z
  .string()
  .trim()
  .min(1, messages.voidReasonRequired)
  .max(200, messages.voidReasonRequired);

export const activityNameSchema = z
  .string()
  .trim()
  .min(3, messages.activityNameInvalid)
  .max(50, messages.activityNameInvalid);

/**
 * ADR-116 — the label a participation award is snapshotted under. One constant so the station
 * button, the scan history and the audit trail all say the same thing, and so it can never
 * collide with a configured tier by accident of spelling.
 */
export const PARTICIPATION_LABEL = "Took part";

/**
 * ADR-138 (F1) — how long a station may undo its own award, in seconds.
 *
 * Shared so the countdown a facilitator watches and the window the server enforces are the
 * same number. The client's copy is decoration: a phone with a wrong clock, a paused tab or
 * a tampered build changes what the button looks like and nothing about what is allowed.
 */
/** ADR-140 — long enough for 'Main hall projector', short enough to read in a list. */
export const SCREEN_KEY_LABEL_MAX = 40;

export const SCAN_UNDO_WINDOW_SECONDS = 10;

/**
 * ADR-160 — the hall screen's scenes, named once so a key can carry a subset of them.
 *
 * These ids were already in the code as literals inside `useScenes`, which was fine while
 * they only ever addressed a local array. They are now written into `screen_key` rows and
 * sent over the wire, so they have become a vocabulary two services agree on: renaming one
 * is a data migration, not a refactor, and that fact deserves to be visible from the
 * declaration rather than discovered from a projector showing nothing.
 *
 * ORDER IS THE RUNNING ORDER. The strip is laid out in this sequence (ADR-150 put the two
 * explainer scenes after the live ones deliberately: during play, what is happening now
 * outranks how the day is structured). The console renders its checklist from the same
 * array, so the superadmin ticks boxes in the order the room will see them.
 */
export const SCREEN_SCENES = [
  { id: "board", label: "Cluster board" },
  { id: "individuals", label: "Top players" },
  { id: "onCourt", label: "On court now" },
  { id: "finished", label: "Just finished" },
  { id: "upNext", label: "Up next" },
  { id: "groups", label: "The groups" },
  { id: "road", label: "The road to the final" },
  { id: "photosLatest", label: "Just shared" },
  { id: "photosTop", label: "Crowd favourites" },
] as const;

export type ScreenSceneId = (typeof SCREEN_SCENES)[number]["id"];

export const ALL_SCREEN_SCENE_IDS: readonly ScreenSceneId[] = SCREEN_SCENES.map(
  (scene) => scene.id,
);

/**
 * A key minted before ADR-160, or minted without an opinion, shows everything — which is
 * exactly what every key did before this existed. The feature is subtraction.
 */
export function isScreenSceneId(value: unknown): value is ScreenSceneId {
  return (
    typeof value === "string" &&
    ALL_SCREEN_SCENE_IDS.includes(value as ScreenSceneId)
  );
}

/**
 * ADR-160 — tick a scene on or off, refusing to empty the list.
 *
 * Shared because the rule has three call sites — the mint form, the per-key editor, and the
 * server — and two of them are a checkbox the operator is allowed to find unresponsive. The
 * server's refusal is the real one; this is what makes the console disagree with it never.
 *
 * Returns the SAME array when the toggle is refused, so a caller can tell "nothing changed"
 * by identity rather than by comparing contents.
 */
export function toggleScreenScene(
  current: readonly ScreenSceneId[],
  id: ScreenSceneId,
): readonly ScreenSceneId[] {
  if (!current.includes(id)) return [...current, id];
  if (current.length === 1) return current;
  return current.filter((entry) => entry !== id);
}

/**
 * ADR-092 — an activity awards through named tiers ("First place" +10). A flat-rate station
 * is simply a single-tier list, so one shape covers every station and the scan write path
 * never special-cases.
 */
export const awardTierSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, messages.tierLabelInvalid)
    .max(20, messages.tierLabelInvalid),
  points: z.number().int().min(1, messages.tierPointsInvalid),
});

export const awardTiersSchema = z
  .array(awardTierSchema)
  .min(1, messages.tierListInvalid)
  // ADR-336 — was 4. A switched day derives its buttons from the day's own paid rates, and a field
  // with two stage overrides can derive five or six distinct values. Silently dropping one is worse
  // than one more button on a grid that wraps.
  .max(8, messages.tierListInvalid)
  .refine(
    (tiers) =>
      new Set(tiers.map((tier) => tier.label.toLowerCase())).size ===
      tiers.length,
    messages.tierListInvalid,
  )
  // ADR-116 — the participation floor owns this label. A station tier spelled the same way
  // would be indistinguishable from it in scan history and the audit trail.
  .refine(
    (tiers) =>
      !tiers.some(
        (tier) =>
          tier.label.toLowerCase() === PARTICIPATION_LABEL.toLowerCase(),
      ),
    messages.tierLabelReserved,
  );

export const stationTypeSchema = z.enum(["court", "fringe_activity", "none"]);

// ── Requests ──────────────────────────────────────────────────────────────────

export const signUpRequestSchema = z.object({
  nickname: nicknameSchema,
  pin: pinSchema,
  clusterCode: clusterCodeSchema,
  gender: genderSchema,
  avatarVariant: avatarVariantSchema,
  avatarLook: avatarLookSchema,
  /** ADR-031 — the sprite made from their own photo, when they chose one. */
  avatarPhoto: avatarSpriteSchema.nullish(),
});

/** S4 — a participant may redraw themselves after sign-up (ADR-021, ADR-031). */
export const updateAvatarRequestSchema = z.object({
  avatarVariant: avatarVariantSchema,
  avatarLook: avatarLookSchema,
  avatarPhoto: avatarSpriteSchema.nullish(),
});

export const participantSignInRequestSchema = z.object({
  nickname: nicknameSchema,
  pin: pinSchema,
});

export const staffSignInRequestSchema = z.object({
  username: usernameSchema,
  passcode: passcodeSchema,
});

export const createTeamRequestSchema = z.object({ teamName: teamNameSchema });
export const joinTeamByCodeRequestSchema = z.object({
  joinCode: joinCodeSchema,
});
export const addMemberRequestSchema = z.object({ nickname: nicknameSchema });
export const transferCaptaincyRequestSchema = z.object({
  participantId: z.string().uuid(),
});
export const setLockRequestSchema = z.object({ isLocked: z.boolean() });

/*
 * ADR-270 — the three court-console requests are kept through the removal of the old tournament:
 * the facilitator console still posts exactly these shapes, and the rebuilt tournament serves them
 * at the same paths (ADR-276), so they are the compatibility contract rather than dead code.
 */
export const startMatchRequestSchema = z.object({
  courtId: z.string().uuid(),
  teamAId: z.string().uuid(),
  teamBId: z.string().uuid(),
});

/**
 * ADR-152 (F-1) — a null winner is a DECLARED draw, not a missing field. The marshal
 * presses a different button for it, so the absence is deliberate and must travel.
 */
export const completeMatchRequestSchema = z.object({
  winnerTeamId: z.string().uuid().nullable(),
  /** ADR-329 F5 — how a level knockout was settled off the scoreboard, when it was. */
  tiebreakMethod: z
    .enum(["coin_toss", "rock_paper_scissors"])
    .nullable()
    .default(null),
});

/**
 * ADR-114 — the marshal names both ends of the step: the score they can SEE, and the one
 * they are moving to.
 *
 * Sending only the new value cannot work. A console showing 3 that backs out a point and
 * a console still showing 1 that adds one both post "2", so the server has no way to tell
 * a correction from a stale screen — and silently rewinding a live match is exactly the
 * failure this feature must not have. `from` turns the write into a compare-and-set.
 *
 * Absolute values (rather than +1/-1) keep a double-tap harmless: the second request
 * finds the match already on `to` and succeeds without moving anything.
 */
export const setMatchScoreRequestSchema = z.object({
  side: z.enum(["a", "b"]),
  from: z.number().int().min(0).max(199),
  to: z.number().int().min(0).max(199),
});

export const voidRequestSchema = z.object({ reason: reasonSchema });

/**
 * ADR-154 — the superadmin's roster repairs.
 *
 * A move names both the team being left and the team being joined, rather than just the
 * destination. The `from` is not redundant: it makes the request state what the caller
 * believed, so a stale console tab moving somebody who has already been moved is a conflict
 * rather than a silent second move out of a team they are no longer in.
 */
export const moveMemberRequestSchema = z.object({
  participantId: z.string().uuid(),
  fromTeamId: z.string().uuid(),
  toTeamId: z.string().uuid(),
});

/** The subject of an add or a captaincy handover. Shares the shape of the captain's own. */
export const rosterMemberRequestSchema = z.object({
  participantId: z.string().uuid(),
});

/**
 * ADR-117 — a manual score correction. Signed and never zero, bounded so a slipped keypress
 * cannot decide the event, and always justified in the superadmin's own words: the reason is
 * the entire point of the ledger, so it is required rather than optional.
 */
export const createAdjustmentRequestSchema = z.object({
  activityId: z.string().uuid(),
  points: awardAdjustmentPoints,
  // Its own message: this is not a void, and borrowing that wording confused the operator
  // with talk of actions they had not taken.
  reason: z
    .string()
    .trim()
    .min(1, messages.adjustmentReasonRequired)
    .max(200, messages.adjustmentReasonRequired),
});

export const createScanRequestSchema = z.object({
  nickname: nicknameSchema,
  roundId: z.string().uuid(),
  // ADR-092 — the client names the armed tier; the server prices it from the activity.
  // ADR-116 — null means "took part and did not place": the server prices that from the day's
  // participation floor instead, so a station configured with placings only can still record
  // everybody else. No points number ever travels over the wire either way.
  tierLabel: z
    .string()
    .trim()
    .min(1, messages.tierNotFound)
    .max(20, messages.tierNotFound)
    .nullable(),
  // ADR-116 — the facilitator has seen the award already holding this round's slot and asked
  // to overwrite it. Absent or false, a held slot is a 409 rather than a silent discard.
  replaceExisting: z.boolean().optional(),
  clientScanUuid: z.string().uuid(),
  clientTimestamp: z.string().datetime({ offset: true }),
});

/** fds.md §2.12 — the day's fringe point settings (ADR-270: the tournament's rates live on the tournament). */
export const pointConfigRequestSchema = z.object({
  // ADR-116 — what turning up to a fringe activity is worth when you do not place. At least 1:
  // a floor of zero is not a floor, and the whole point is that taking part always scores.
  fringeParticipationPoints: z
    .number()
    .int()
    .min(1, messages.participationPointsInvalid)
    .max(100, messages.participationPointsInvalid)
    .default(5),
  /*
   * ADR-176 — the passport bonus: one payment for visiting this many DISTINCT stations.
   * Zero is off and is the default, so a day that is not running a passport is unaffected by
   * the feature existing. The threshold is configurable because the number of stations on the
   * day is not knowable here — a passport that needs more stations than the day has is
   * unwinnable, which the console warns about rather than forbids, since stations are often
   * added after the points are set.
   */
  fringePassportBonusPoints: z
    .number()
    .int()
    .min(0, messages.passportBonusInvalid)
    .max(500, messages.passportBonusInvalid)
    .default(0),
  fringePassportStations: z
    .number()
    .int()
    .min(2, messages.passportStationsInvalid)
    .max(20, messages.passportStationsInvalid)
    .default(4),
});

/** ADR-110 — the swag catalogue: 1-6 items, labels unique per station, limits 1-10. */
export const swagItemsSchema = z
  .array(
    z.object({
      label: z
        .string()
        .trim()
        .min(1, messages.swagItemsInvalid)
        .max(30, messages.swagItemsInvalid),
      limit: z
        .number()
        .int()
        .min(1, messages.swagItemsInvalid)
        .max(10, messages.swagItemsInvalid),
    }),
  )
  .min(1, messages.swagItemsInvalid)
  .max(6, messages.swagItemsInvalid)
  .refine(
    (items) =>
      new Set(items.map((item) => item.label.toLowerCase())).size ===
      items.length,
    messages.swagItemsInvalid,
  );

/** ADR-190 — one place up or down, among the timeless items only. */
export const moveAgendaItemRequestSchema = z.object({
  direction: z.enum(["up", "down"]),
});

export const createSwagStationRequestSchema = z.object({
  stationName: z
    .string()
    .trim()
    .min(3, messages.swagStationNameInvalid)
    .max(50, messages.swagStationNameInvalid),
  items: swagItemsSchema,
});

/*
 * ADR-188 — a station is editable, name included.
 *
 * The same shape as creating one, because an edit that could not reach the name was the whole
 * complaint: a station typed with a typo at eight in the morning was permanent for the day,
 * and the only way out was a second station with the right name sitting beside the wrong one.
 * Screen keys refuse renaming for a reason that does not apply here — a key is a value other
 * configuration points at, whereas a station name is a label on a table that people read.
 */
export const updateSwagStationRequestSchema = createSwagStationRequestSchema;

export const createSwagClaimRequestSchema = z.object({
  nickname: nicknameSchema,
  roundId: z.string().uuid(),
  itemLabel: z
    .string()
    .trim()
    .min(1, messages.swagItemNotFound)
    .max(30, messages.swagItemNotFound),
  clientClaimUuid: z.string().uuid(),
});

export const createActivityRequestSchema = z.object({
  activityName: activityNameSchema,
  awardTiers: awardTiersSchema,
  assignedFacilitatorId: z.string().uuid().nullable().optional(),
});

export const editActivityRequestSchema = createActivityRequestSchema.extend({
  isActive: z.boolean(),
});

export const toggleRequestSchema = z.object({ isEnabled: z.boolean() });

export const createFacilitatorRequestSchema = z.object({
  username: usernameSchema,
  passcode: passcodeSchema,
  displayLabel: z.string().trim().max(30).optional(),
  defaultStationType: stationTypeSchema.default("none"),
  defaultStationId: z.string().uuid().nullable().optional(),
});

export const editFacilitatorRequestSchema = z.object({
  passcode: passcodeSchema.optional(),
  displayLabel: z.string().trim().max(30).nullable().optional(),
  defaultStationType: stationTypeSchema,
  defaultStationId: z.string().uuid().nullable().optional(),
});

export const createSuperadminRequestSchema = z.object({
  username: usernameSchema,
  passcode: passcodeSchema,
});

export const editSuperadminPasscodeRequestSchema = z.object({
  passcode: passcodeSchema,
});
export const resetPinRequestSchema = z.object({ pin: pinSchema });

/**
 * ADR-307 — the system reset's body. The confirmation is the word DELETE in capitals
 * followed by the ten-character challenge the server issued for this one attempt; the
 * passcode is the acting superadmin's own, re-entered so a signed-in-but-unattended
 * console cannot wipe the event. The server compares both against its own records.
 */
export const systemResetRequestSchema = z.object({
  passcode: passcodeSchema,
  confirmation: z
    .string()
    .regex(/^DELETE[A-Za-z0-9]{10}$/, messages.resetConfirmationMismatch),
});

/**
 * ADR-046 — the body cap is the anti-blow-up lever for the chat table, not a cosmetic limit.
 * An extremely chatty 300-person day is ~20k messages; at 500 characters that is a few
 * megabytes, so the table cannot grow without bound no matter how the room behaves.
 */
export const CHAT_BODY_MAX_LENGTH = 500;

export const chatBodySchema = z
  .string()
  .trim()
  .min(1, messages.chatMessageEmpty)
  .max(CHAT_BODY_MAX_LENGTH, messages.chatMessageTooLong);

export const sendChatMessageRequestSchema = z.object({ body: chatBodySchema });

/** The cursor is a message id, which is a UUIDv7 and therefore already time-ordered. */
export const chatCursorSchema = z.string().uuid(messages.chatCursorInvalid);

/**
 * ADR-066 — the stream's second frame type, named here so the two sides cannot drift apart.
 *
 * A moderated message has to reach the phones that are already looking at it. The delta read only
 * ever returns *newer* ids, so nothing a reconnect fetches can retract something already on screen
 * — it takes a frame of its own.
 */
export const CHAT_HIDDEN_EVENT = "hidden";

/**
 * ADR-119 — the keep-alive frame, named here because both rooms send it and both now listen.
 *
 * The server has always written it (an idle proxied connection is dropped at roughly a hundred
 * seconds behind the Cloudflare tunnel, so a quiet room would silently lose every listener). What
 * is new is that the client times it: a frame arriving is the only evidence a browser has that the
 * socket is still carrying anything, because a half-open connection raises no `error`.
 */
export const CHAT_HEARTBEAT_EVENT = "heartbeat";

/**
 * ADR-146 — "Meera is typing…" on the team room's existing socket.
 *
 * A frame rather than a second connection, and on the ROOM's stream rather than the shell's
 * status stream: the room stream is opened by the panel and closed when it unmounts, so its
 * subscriber set already is, exactly, the team-mates who are looking. A team-mate reading the
 * Feed holds the status stream and must never be told about a keystroke.
 */
export const TEAM_CHAT_TYPING_EVENT = "typing";

/**
 * How long a typing signal stands before the phone that received it forgets it.
 *
 * There is deliberately no "stopped typing" message: a phone that is locked, backgrounded by
 * iOS or carried out of range cannot send one, and a design that waits for it leaves
 * "Meera is typing…" on screen for the rest of the afternoon. So the sender re-asserts and
 * silence is the signal. Two ticks of the ping, so one lost request is survivable and two
 * are not — the correct bias for something cosmetic.
 */
export const TEAM_CHAT_TYPING_TTL_MS = 6_000;

/** How often a phone may re-assert while someone keeps typing. */
export const TEAM_CHAT_TYPING_PING_MS = 3_000;

/**
 * How many typists are named before the line becomes a count.
 *
 * A team is about five people, so two names is the point at which a list stops being
 * information and starts being a crowd. It is a constant because that judgement is worth
 * exactly one number, and changing it should cost one edit rather than a rewrite of the copy.
 */
export const TEAM_CHAT_TYPING_NAMES_MAX = 2;

/**
 * ADR-121 — the status stream's frame names.
 *
 * One socket per phone carries all of these, because a phone holding three connections to say
 * "something changed" is three times the proxy state for one idea. They are named here for the
 * same reason the chat frames are: the writer and the listener are in different packages, and a
 * typo in a string literal is a silent dead stream rather than a failed build.
 *
 * `STATUS_SNAPSHOT_EVENT` is the first frame on every connection, including every reconnect.
 * The deltas that follow are only safe because of it: a client that missed three minutes of
 * frames behind a dead socket does not need them replayed, it needs the current answer, which
 * is the same thing its poll used to fetch.
 */
export const STATUS_SNAPSHOT_EVENT = "status.snapshot";

/** A new announcement, carrying the whole announcement — never "go and fetch it". */
export const STATUS_ANNOUNCEMENT_EVENT = "announcement";

/** ADR-074 — a retraction carries only the id: a stream must not re-send what it is unsaying. */
export const STATUS_ANNOUNCEMENT_RETRACTED_EVENT = "announcement.retracted";

/**
 * ADR-091 — the viewer's team crossed into, or out of, the up-soon window. State, not a command
 * to buzz: a reconnect re-states what is true, and the client decides whether that is news.
 */
export const STATUS_TEAM_UPSOON_EVENT = "team.upsoon";

/**
 * ADR-125 — something landed in the global room, carrying *when*.
 *
 * It used to be bodyless, on the grounds that a dot has no payload. It now carries the feed's
 * new watermark, which is the smallest possible payload and the one that turns a signal into
 * state: the phone compares it with its own last-read mark and decides. Still not the message
 * itself — pushing every line to three hundred phones whether or not the room is open is the
 * opposite of a saving, and remains the rule this frame is careful to keep.
 */
export const STATUS_CHAT_ACTIVITY_EVENT = "chat.activity";

/** The same, for the viewer's own team room. Only their team's topic reaches them. */
export const STATUS_TEAM_CHAT_ACTIVITY_EVENT = "team.chat.activity";

/**
 * ADR-125 — a photo became visible in the gallery. The gallery had no LED before this.
 *
 * Global rather than per-team: the gallery is one wall everybody looks at.
 */
export const STATUS_GALLERY_ACTIVITY_EVENT = "gallery.activity";
/** ADR-153 — a hide lowers a feed's latest, and only these two frames may do that. */
export const STATUS_CHAT_RETRACTED_EVENT = "chat.retracted";
/** ADR-155 — the same, one room over, and per-team rather than global. */
export const STATUS_TEAM_CHAT_RETRACTED_EVENT = "team.chat.retracted";
export const STATUS_GALLERY_RETRACTED_EVENT = "gallery.retracted";

/**
 * ADR-131 (B6) — a match the feed renders changed, carrying the whole `MatchView`.
 *
 * Payload-carrying rather than a watermark because the feed is a list of rows and the frame
 * replaces exactly one of them. A "something changed" signal would make three hundred phones
 * re-fetch the entire feed to learn which.
 */
export const STATUS_FEED_MATCH_EVENT = "feed.match";

/** ADR-131 (B6) — the board after a result changed. Global: cluster standings are not per-viewer. */
export const STATUS_LEADERBOARD_EVENT = "leaderboard";

/** The status stream beats on the same clock as the chat rooms, and is watched the same way. */
export const STATUS_HEARTBEAT_EVENT = CHAT_HEARTBEAT_EVENT;

/**
 * ADR-063 — the team room shares the global room's body cap, which is the load-bearing limit on
 * how large the table can get, and its cursor shape, which is just a message id.
 */
export const sendTeamChatMessageRequestSchema = z.object({
  body: chatBodySchema,
});

/**
 * ADR-074 — a staff announcement.
 *
 * Shares the chat body cap, which keeps the same arithmetic bound on the table, but is deliberately
 * its own schema: an announcement is written by one superadmin at a time and read by everybody, so if
 * its limits ever need to diverge from conversation's they can.
 */
export const ANNOUNCEMENT_BODY_MAX_LENGTH = CHAT_BODY_MAX_LENGTH;
/**
 * ADR-177 — the agenda item write shape, shared by create and update.
 *
 * `startsAt` is nullable rather than optional, and the distinction matters on an update: optional
 * would mean "leave it alone", nullable means "this item has no time". The superadmin screen needs
 * to be able to say the second one.
 *
 * The two cross-field rules are enforced here as well as in the CHECK constraints, because a 400
 * naming the field is a better answer than a 500 carrying a constraint name.
 */
export const agendaItemRequestSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }).nullish(),
    endsAt: z.string().datetime({ offset: true }).nullish(),
    title: z
      .string()
      .trim()
      .min(1, messages.agendaTitleInvalid)
      .max(120, messages.agendaTitleInvalid),
    location: z.string().trim().min(1).max(60).nullish(),
    detail: z.string().trim().min(1).max(300).nullish(),
  })
  .refine((value) => !value.endsAt || Boolean(value.startsAt), {
    message: messages.agendaEndWithoutStart,
    path: ["endsAt"],
  })
  .refine(
    (value) =>
      !value.endsAt || !value.startsAt || value.endsAt > value.startsAt,
    {
      message: messages.agendaEndBeforeStart,
      path: ["endsAt"],
    },
  );

export const createAnnouncementRequestSchema = z.object({
  body: chatBodySchema,
});

/**
 * ADR-047 — the photo gallery's limits. These are what make "the volume cannot blow up" an
 * arithmetic fact rather than a hope: 300 users × 10 photos × ~325 kB for both renditions is
 * about 1 GB, bounded. All three are enforced server-side; the client shrink is an optimisation
 * on top, never the guarantee.
 */
export const GALLERY_CAPTION_MAX_LENGTH = 140;
export const GALLERY_PHOTOS_PER_UPLOADER = 10;
export const GALLERY_RENDITION_MAX_BYTES = 400_000;

/**
 * ADR-050 — the archival original.
 *
 * **Storage arithmetic, stated because it is the load-bearing number:** at this cap the corpus is
 * 300 uploaders × 10 photos × 12 MB ≈ **36 GB worst case**, against ~1 GB before archival existed.
 * The per-uploader cap, not this one, is the cheapest lever if that is too much — halving
 * `GALLERY_PHOTOS_PER_UPLOADER` halves the whole corpus.
 *
 * 12 MB covers an iPhone HEIC (2–4 MB) and a high-end JPEG or RAW-ish capture (5–10 MB) with room
 * to spare, without leaving the door open to somebody uploading a video frame dump.
 */
export const GALLERY_RAW_MAX_BYTES = 12_000_000;

/** What a browser may ask for. `raw` is deliberately absent — see `GALLERY_STORED_RENDITIONS`. */
export const GALLERY_RENDITIONS = ["full", "thumb"] as const;
export type GalleryRendition = (typeof GALLERY_RENDITIONS)[number];
export const galleryRenditionSchema = z.enum(GALLERY_RENDITIONS);

/**
 * What is actually stored. `raw` is the untouched original kept for Corporate's archive, and it is
 * **never served to the gallery** — only through the superadmin export route. Keeping it out of
 * `GALLERY_RENDITIONS` is what makes that structural rather than a rule someone has to remember:
 * the public route validates against that enum, so `.../raw` cannot resolve there at all.
 */
export const GALLERY_STORED_RENDITIONS = ["full", "thumb", "raw"] as const;
export type GalleryStoredRendition = (typeof GALLERY_STORED_RENDITIONS)[number];

/** Uploads carry the original filename so the archive is recognisable to a human. */
export const GALLERY_FILENAME_MAX_LENGTH = 255;
export const galleryFilenameSchema = z
  .string()
  .trim()
  .min(1, messages.galleryFilenameMissing)
  .max(GALLERY_FILENAME_MAX_LENGTH, messages.galleryFilenameMissing);

export const galleryCaptionSchema = z
  .string()
  .trim()
  .max(GALLERY_CAPTION_MAX_LENGTH, messages.galleryCaptionTooLong);

export const gallerySortSchema = z.enum(["newest", "top"]);
export type GallerySort = z.infer<typeof gallerySortSchema>;

/**
 * Only the aliases something imports. A request type nothing names is dead weight: `readBody(c,
 * voidRequestSchema)` is already typed by inference at the call site, so an alias beside every schema
 * is a second name for a type the caller never had to spell (ADR-081).
 */
export type SignUpRequest = z.infer<typeof signUpRequestSchema>;
export type CreateActivityRequest = z.infer<typeof createActivityRequestSchema>;
/** ADR-177 — the agenda item write shape, shared by create and update. */
export type AgendaItemRequest = z.infer<typeof agendaItemRequestSchema>;
export type EditActivityRequest = z.infer<typeof editActivityRequestSchema>;
export type CreateFacilitatorRequest = z.infer<
  typeof createFacilitatorRequestSchema
>;
export type EditFacilitatorRequest = z.infer<
  typeof editFacilitatorRequestSchema
>;
export type StationType = z.infer<typeof stationTypeSchema>;
