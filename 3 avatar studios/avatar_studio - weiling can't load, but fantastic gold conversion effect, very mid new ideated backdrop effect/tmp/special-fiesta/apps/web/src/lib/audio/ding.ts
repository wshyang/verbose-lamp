/**
 * ADR-092 — the award "ding". Synthesised with the Web Audio API instead of shipping an
 * asset: zero bytes on the wire, works offline, and no <audio> element to keep alive.
 *
 * iOS Safari (ADR-041 hard requirement) only unlocks sound inside a user gesture, so
 * `primeAudio` is wired to the first pointerdown on the station page — a facilitator always
 * taps something (open round, start camera) before the first award can possibly land.
 */

let context: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
  context = context ?? new window.AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

/** Create (or wake) the audio context inside a user gesture, so later dings may sound. */
export function primeAudio(): void {
  ensureContext();
}

/** One bright two-partial chime, ~0.6 s, with an exponential decay — a classic "ding". */
export function playDing(): void {
  const audio = ensureContext();
  if (!audio) return;
  const at = audio.currentTime;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
  gain.connect(audio.destination);
  for (const [frequency, level] of [[1318.5, 1], [2637, 0.35]] as const) {
    const oscillator = audio.createOscillator();
    const partial = audio.createGain();
    partial.gain.setValueAtTime(level, at);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.connect(partial);
    partial.connect(gain);
    oscillator.start(at);
    oscillator.stop(at + 0.65);
  }
}

/** Tests own the module-level context; nothing else may call this. */
export function resetAudioForTests(): void {
  context = null;
}

/**
 * ADR-103 — the chat blip: one short, soft, low partial (~0.18 s). Deliberately quieter and
 * deeper than the award ding so a busy room sounds like a room, not a slot machine.
 */
export function playChatBlip(): void {
  const audio = ensureContext();
  if (!audio) return;
  const at = audio.currentTime;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.12, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  gain.connect(audio.destination);
  const oscillator = audio.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, at);
  oscillator.connect(gain);
  oscillator.start(at);
  oscillator.stop(at + 0.2);
}
