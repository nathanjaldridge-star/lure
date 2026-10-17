/** Procedural abyss audio. Unlocked from the first tap. */

export class SeaAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private started = false;
  muted = false;

  unlock() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!this.ctx) {
      this.ctx = new Ctx({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this.startAmbient();
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.03);
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  flap() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(380 + Math.random() * 40, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.09);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.11);
    this.noiseBurst(t, 0.05, 900, 0.04);
  }

  bite(combo: number) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    const base = 150 + Math.min(combo, 6) * 18;
    osc.frequency.setValueAtTime(base * (0.94 + Math.random() * 0.12), t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.14);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.17);
    this.noiseBurst(t, 0.07, 1400, 0.1);
  }

  sting() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const t = ctx.currentTime;
    for (const freq of [520, 690]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.28);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.33);
    }
  }

  zap() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  boom() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.28);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.34);
    this.noiseBurst(t, 0.2, 300, 0.12);
  }

  private noiseBurst(t: number, dur: number, freq: number, peak: number) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const length = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private startAmbient() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 280;
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = this.muted ? 0 : 0.045;
    src.connect(filter);
    filter.connect(this.ambientGain);
    this.ambientGain.connect(master);
    src.start();

    const hum = ctx.createOscillator();
    const humGain = ctx.createGain();
    hum.type = "sine";
    hum.frequency.value = 58;
    humGain.gain.value = this.muted ? 0 : 0.02;
    hum.connect(humGain);
    humGain.connect(master);
    hum.start();
    if (!this.muted) {
      this.ambientGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      this.ambientGain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.6);
    }
  }
}

let audio: SeaAudio | null = null;

export function seaAudio(): SeaAudio {
  audio ??= new SeaAudio();
  return audio;
}
