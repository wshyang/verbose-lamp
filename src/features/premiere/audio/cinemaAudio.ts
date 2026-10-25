/**
 * Zero-dependency Web Audio API procedural score & golden filigree chime engine
 * inspired by Craig Armstrong's lush Gatsby orchestral pads and Jazz-Age celesta swells.
 */
export class CinemaAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private isEnabled = false;

  // Lush minor-to-Lydian chord voicings per Act (Hz)
  private readonly actChords: number[][] = [
    [130.81, 196.0, 246.94, 311.13, 392.0],  // Act I: Cm(maj9) mysterious green light
    [146.83, 220.0, 261.63, 329.63, 440.0],  // Act II: Dm9 aristocratic intrigue
    [174.61, 261.63, 329.63, 392.0, 493.88], // Act III: Fmaj7#11 golden ballroom
    [164.81, 246.94, 311.13, 392.0, 493.88], // Act IV: Em9 theatrical grandeur
    [130.81, 196.0, 261.63, 329.63, 493.88], // Act V: Cmaj9 monumental Gatsby finale
  ];

  public toggle(): boolean {
    if (!this.isEnabled) {
      this.start();
    } else {
      this.stop();
    }
    return this.isEnabled;
  }

  private start() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.masterGain.gain.exponentialRampToValueAtTime(0.18, this.ctx.currentTime + 1.4);
    this.masterGain.connect(this.ctx.destination);

    // Warm low-passed orchestral velvet drone
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    filter.Q.value = 0.7;
    filter.connect(this.masterGain);

    const baseFreqs = [65.41, 130.81, 196.0, 246.94];
    this.droneOscs = baseFreqs.map((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = idx === 0 ? 'sine' : 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = (idx - 1.5) * 6;
      g.gain.value = idx === 0 ? 0.35 : 0.08;
      osc.connect(g);
      g.connect(filter);
      osc.start();
      return osc;
    });

    this.isEnabled = true;
    this.triggerActShimmer(0);
  }

  public triggerActShimmer(actIdx: number) {
    const ctx = this.ctx;
    const masterGain = this.masterGain;
    if (!this.isEnabled || !ctx || !masterGain) return;

    const chord = this.actChords[actIdx % this.actChords.length];
    const now = ctx.currentTime;

    // Retune drone root subtly
    if (this.droneOscs[0]) {
      this.droneOscs[0].frequency.exponentialRampToValueAtTime(chord[0] * 0.5, now + 1.2);
    }
    if (this.droneOscs[1]) {
      this.droneOscs[1].frequency.exponentialRampToValueAtTime(chord[0], now + 1.2);
    }

    // Crystalline golden harp / celesta upward arpeggio as the golden frames draw outward
    chord.forEach((freq, i) => {
      const startT = now + i * 0.11;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * 2, startT);

      env.gain.setValueAtTime(0.0001, startT);
      env.gain.exponentialRampToValueAtTime(0.085, startT + 0.06);
      env.gain.exponentialRampToValueAtTime(0.0001, startT + 2.4);

      osc.connect(env);
      env.connect(masterGain);
      osc.start(startT);
      osc.stop(startT + 2.5);
    });
  }

  public stop() {
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    }
    const oscs = [...this.droneOscs];
    this.droneOscs = [];
    setTimeout(() => {
      for (const o of oscs) {
        try {
          o.stop();
          o.disconnect();
        } catch {
          // ignore already stopped
        }
      }
    }, 380);
    this.isEnabled = false;
  }

  public dispose() {
    this.stop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
