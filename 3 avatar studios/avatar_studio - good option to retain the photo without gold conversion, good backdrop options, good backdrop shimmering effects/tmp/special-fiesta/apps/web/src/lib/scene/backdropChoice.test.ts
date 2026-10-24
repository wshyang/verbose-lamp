import { beforeEach, describe, expect, it } from 'vitest';
import { BACKDROP_KEY, requestedBackdrop, resolveBackdrop } from './backdropChoice.js';

/** ADR-023/200 — the classic/fine/life switch that makes the A/B comparison possible. */

beforeEach(() => window.localStorage.clear());

describe('backdrop choice', () => {
  it('reads a deliberate switch out of the query string', () => {
    expect(requestedBackdrop('?backdrop=fine')).toBe('fine');
    expect(requestedBackdrop('?backdrop=classic&foo=1')).toBe('classic');
    expect(requestedBackdrop('?backdrop=sparkly')).toBeNull();
    expect(requestedBackdrop('')).toBeNull();
  });

  it('defaults to the classic art', () => {
    expect(resolveBackdrop('')).toBe('classic');
  });

  it('remembers the last switch so the comparison survives navigation', () => {
    expect(resolveBackdrop('?backdrop=fine')).toBe('fine');
    expect(window.localStorage.getItem(BACKDROP_KEY)).toBe('fine');
    expect(resolveBackdrop('')).toBe('fine');

    // Asking again for what is already remembered changes nothing.
    expect(resolveBackdrop('?backdrop=fine')).toBe('fine');
    expect(window.localStorage.getItem(BACKDROP_KEY)).toBe('fine');

    expect(resolveBackdrop('?backdrop=classic')).toBe('classic');
    expect(resolveBackdrop('')).toBe('classic');
  });

  it('shows the photoreal scene only while the URL asks, and never remembers it', () => {
    expect(resolveBackdrop('?backdrop=real')).toBe('real');
    // ADR-201 — the asymmetry is the point. classic and fine exist to be compared, so they
    // are written down; `real` is eighteen megabytes and must not be left switched on for
    // whoever opens the laptop next. Drop the parameter and the old backdrop is back.
    expect(window.localStorage.getItem(BACKDROP_KEY)).toBeNull();
    expect(resolveBackdrop('')).toBe('classic');
  });

  it('does not let a remembered classic or fine survive being asked for real', () => {
    expect(resolveBackdrop('?backdrop=fine')).toBe('fine');
    expect(resolveBackdrop('?backdrop=real')).toBe('real');
    // ...and the remembered one is still there underneath, untouched.
    expect(window.localStorage.getItem(BACKDROP_KEY)).toBe('fine');
    expect(resolveBackdrop('')).toBe('fine');
  });

  it('ignores a stored value it does not recognise', () => {
    window.localStorage.setItem(BACKDROP_KEY, 'hologram');
    expect(resolveBackdrop('')).toBe('classic');
  });
});
