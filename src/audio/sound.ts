/** Small synthesised sound effects, so the game ships no audio files. */
export class SoundEngine {
  enabled = true;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Browsers only allow audio after a user gesture; call this from a click handler. */
  unlock(): void {
    const context = this.ensure();
    if (context && context.state === 'suspended') void context.resume();
  }

  private ensure(): AudioContext | null {
    if (this.context) return this.context;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.context = new Ctor();
    } catch {
      return null;
    }
    this.master = this.context.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.context.destination);
    const length = this.context.sampleRate;
    this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return this.context;
  }

  private ready(): AudioContext | null {
    if (!this.enabled) return null;
    const context = this.ensure();
    return context && context.state === 'running' ? context : null;
  }

  private burst(frequency: number, duration: number, gain: number, delay = 0, q = 0.9): void {
    const context = this.ready();
    if (!context || !this.master || !this.noise) return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(envelope).connect(this.master);
    source.start(start, Math.random() * 0.5, duration + 0.02);
  }

  private tone(frequency: number, duration: number, gain: number, delay = 0, type: OscillatorType = 'sine'): void {
    const context = this.ready();
    if (!context || !this.master) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  shuffle(): void {
    for (let i = 0; i < 22; i++) this.burst(2200 + Math.random() * 1600, 0.035, 0.1, i * 0.024 + Math.random() * 0.008);
    for (let i = 0; i < 18; i++) this.burst(2600 + Math.random() * 1400, 0.03, 0.09, 0.62 + i * 0.02);
  }

  deal(): void {
    this.burst(3200, 0.05, 0.11);
  }

  select(): void {
    this.burst(4200, 0.03, 0.09);
    this.tone(1320, 0.05, 0.03);
  }

  deselect(): void {
    this.burst(3000, 0.03, 0.07);
    this.tone(990, 0.05, 0.025);
  }

  place(): void {
    this.burst(1500, 0.07, 0.16);
    this.burst(320, 0.09, 0.2, 0.01, 0.6);
  }

  discard(): void {
    this.burst(1800, 0.14, 0.1, 0, 0.5);
  }

  flip(): void {
    this.burst(2400, 0.06, 0.13);
    this.burst(1100, 0.08, 0.1, 0.05);
  }

  tick(): void {
    this.tone(1560, 0.045, 0.035, 0, 'triangle');
  }

  click(): void {
    this.burst(3600, 0.025, 0.06);
  }

  warn(): void {
    this.tone(233, 0.16, 0.06, 0, 'triangle');
  }

  win(): void {
    [659.25, 830.61, 987.77].forEach((note, i) => this.tone(note, 0.55, 0.07, i * 0.085, 'triangle'));
    this.tone(1318.5, 0.9, 0.035, 0.26);
  }

  lose(): void {
    this.tone(392, 0.4, 0.04, 0, 'triangle');
    this.tone(311.13, 0.55, 0.04, 0.12, 'triangle');
  }

  fanfare(): void {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((note, i) => this.tone(note, 0.9, 0.07, i * 0.11, 'triangle'));
    [523.25, 783.99, 1046.5].forEach((note) => this.tone(note, 1.6, 0.04, 0.6));
  }

  finish(): void {
    [392, 493.88, 587.33].forEach((note, i) => this.tone(note, 0.8, 0.05, i * 0.12, 'triangle'));
  }
}
