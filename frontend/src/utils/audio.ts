class WebAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private lastPlayTime: number = 0;
  private readonly MIN_SPAM_GAP = 120; // 120ms gap to prevent rapid overlapping sound spam
  private initialized = false;

  constructor() {
    // Add event listeners on window to auto-initialize on first user interaction
    if (typeof window !== 'undefined') {
      const initEvents = ['click', 'mousedown', 'keydown', 'touchstart'];
      const handleFirstInteraction = async () => {
        await this.ensureInitialized();
        if (this.initialized) {
          // Remove listeners once successfully initialized
          initEvents.forEach(evt => window.removeEventListener(evt, handleFirstInteraction, true));
        }
      };
      initEvents.forEach(evt => window.addEventListener(evt, handleFirstInteraction, { capture: true, passive: true }));
    }
  }

  /**
   * Safe initialization and resumption of the AudioContext (only once).
   */
  public async ensureInitialized(): Promise<AudioContext | null> {
    if (this.initialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch (e) {
          console.warn('Failed to resume AudioContext:', e);
        }
      }
      return this.ctx;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return null;

      if (!this.ctx) {
        this.ctx = new AudioContextClass();
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.initialized = true;
      console.log('[AUDIO] Web Audio Context successfully initialized/resumed.');
      return this.ctx;
    } catch (err) {
      console.warn('AudioContext initialization failed:', err);
      return null;
    }
  }

  public async playNormal(volume: number) {
    const now = performance.now();
    if (now - this.lastPlayTime < this.MIN_SPAM_GAP) return;
    this.lastPlayTime = now;

    const ctx = await this.ensureInitialized();
    if (!ctx || ctx.state !== 'running') return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Frequency slide simulates soft wooden piece impact
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(volume * 0.7, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); // ~100ms duration

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  public async playCapture(volume: number) {
    const now = performance.now();
    if (now - this.lastPlayTime < this.MIN_SPAM_GAP) return;
    this.lastPlayTime = now;

    const ctx = await this.ensureInitialized();
    if (!ctx || ctx.state !== 'running') return;

    // Sharp impact sound (wood snap)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.14);

    gain.gain.setValueAtTime(volume * 0.9, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14); // ~140ms duration

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Noise snap transient burst at start (simulate capture click)
    const bufferSize = ctx.sampleRate * 0.015; // 15ms burst
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1200, ctx.currentTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.015);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    osc.start();
    noise.start();
    osc.stop(ctx.currentTime + 0.14);
    noise.stop(ctx.currentTime + 0.015);
  }

  public async playCheck(volume: number) {
    const now = performance.now();
    if (now - this.lastPlayTime < this.MIN_SPAM_GAP) return;
    this.lastPlayTime = now;

    const ctx = await this.ensureInitialized();
    if (!ctx || ctx.state !== 'running') return;

    // Metallic bell frequencies (additive sine synthesis)
    const frequencies = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    const duration = 0.22; // ~220ms duration

    frequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const decay = duration - idx * 0.02;
      gain.gain.setValueAtTime(volume * 0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + decay);
    });
  }

  public async playCheckmate(volume: number) {
    const now = performance.now();
    if (now - this.lastPlayTime < this.MIN_SPAM_GAP) return;
    this.lastPlayTime = now;

    const ctx = await this.ensureInitialized();
    if (!ctx || ctx.state !== 'running') return;

    // Decisive C major victory triad arpeggio (C4 -> E4 -> G4 -> C5 -> E5 -> G5)
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
    const duration = 0.7; // ~700ms duration

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const entryDelay = idx * 0.055; // Flourish arpeggio offset

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + entryDelay);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setValueAtTime(volume * 0.18, ctx.currentTime + entryDelay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + entryDelay + duration);

      // Low-pass filter makes triangle warm and brassy
      const lpFilter = ctx.createBiquadFilter();
      lpFilter.type = 'lowpass';
      lpFilter.frequency.setValueAtTime(1100, ctx.currentTime + entryDelay);

      osc.connect(lpFilter);
      lpFilter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + entryDelay);
      osc.stop(ctx.currentTime + entryDelay + duration);
    });
  }
}

export const audioSynth = new WebAudioSynthesizer();
