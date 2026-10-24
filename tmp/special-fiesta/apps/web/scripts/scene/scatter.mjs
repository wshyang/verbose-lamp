/**
 * ADR-298 — deterministic scatter, shared by every venue's scene.
 *
 * Modulo strides (`i * 131 % W`) line up into visible diagonal corduroy across a wide plate; a
 * hashed sequence does not. Moved out of Sentosa's `pixel-art.mjs` unchanged so a second venue
 * does not import another venue's drawing code.
 */
export function scatter(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
