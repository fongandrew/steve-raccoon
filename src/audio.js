// Tiny synthesized sound board. No audio files: every honk is hand-crafted, artisanal math.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.step = 0;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    // engine: a grumbly saw through a lowpass
    this.eng = ctx.createOscillator();
    this.eng.type = 'sawtooth';
    this.eng.frequency.value = 50;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 300;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.eng.connect(this.engFilter).connect(this.engGain).connect(this.master);
    this.eng.start();

    this.nextNote = ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 100);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  setEngine(ratio, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.eng.frequency.setTargetAtTime(45 + Math.abs(ratio) * 85, t, 0.08);
    this.engFilter.frequency.setTargetAtTime(250 + Math.abs(ratio) * 500, t, 0.08);
    this.engGain.gain.setTargetAtTime(on ? 0.05 + Math.abs(ratio) * 0.04 : 0, t, 0.1);
  }

  tone(freq, dur, { type = 'square', vol = 0.15, when = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.2, freq = 1200, when = 0, q = 1 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
  }

  pickup(streak) {
    const base = 392 * Math.pow(2, Math.min(streak, 12) / 12);
    this.tone(base, 0.09, { type: 'triangle', vol: 0.25 });
    this.tone(base * 1.5, 0.14, { type: 'triangle', vol: 0.25, when: 0.08 });
    this.noise(0.15, { vol: 0.12, freq: 600, when: 0.02 });
  }
  coin() { this.tone(988, 0.07, { vol: 0.1 }); this.tone(1319, 0.16, { vol: 0.1, when: 0.06 }); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.25, when: i * 0.11 })); }
  honk() {
    this.tone(430, 0.22, { type: 'sawtooth', vol: 0.16, slide: 0.8 });
    this.tone(640, 0.22, { type: 'square', vol: 0.07, slide: 0.8 });
  }
  horn() { this.tone(311, 0.35, { type: 'sawtooth', vol: 0.16 }); this.tone(392, 0.35, { type: 'sawtooth', vol: 0.16 }); }
  chomp() { for (let i = 0; i < 3; i++) this.noise(0.07, { vol: 0.3, freq: 900 + i * 300, when: i * 0.1, q: 3 }); }
  boost() { this.tone(160, 0.6, { type: 'sawtooth', vol: 0.14, slide: 3 }); this.noise(0.5, { vol: 0.12, freq: 400 }); }
  thunk() { this.tone(90, 0.2, { type: 'sine', vol: 0.5, slide: 0.5 }); this.noise(0.12, { vol: 0.25, freq: 300 }); }
  boing() { this.tone(260, 0.25, { type: 'sine', vol: 0.25, slide: 2.2 }); }
  splash() { this.noise(0.6, { vol: 0.2, freq: 2500, q: 0.6 }); }
  whistle() { this.tone(1400, 0.5, { type: 'sine', vol: 0.2, slide: 0.6 }); this.tone(1400, 0.7, { type: 'sine', vol: 0.2, slide: 0.5, when: 0.55 }); }

  // a jaunty little loop so the garbage feels festive
  schedule() {
    if (!this.ctx || !this.musicOn) return;
    const spb = 0.19;
    const bass = [0, null, 7, null, 0, null, 7, null, 5, null, 0, null, 5, null, 0, null, 7, null, 2, null, 7, null, 2, null, 0, null, 7, null, 0, 7, 11, null];
    const lead = [12, null, 16, 19, null, 16, 12, null, 17, null, 21, 17, null, 12, 14, null, 19, null, 23, 19, null, 14, 19, null, 12, 16, 19, 24, null, 19, 16, null];
    while (this.nextNote < this.ctx.currentTime + 0.25) {
      const i = this.step % 32;
      const when = Math.max(0, this.nextNote - this.ctx.currentTime);
      if (bass[i] !== null) this.tone(65.4 * Math.pow(2, bass[i] / 12), spb * 0.9, { type: 'triangle', vol: 0.11, when });
      if (lead[i] !== null) this.tone(261.6 * Math.pow(2, lead[i] / 12), spb * 0.7, { type: 'square', vol: 0.025, when });
      if (i % 4 === 2) this.noise(0.04, { vol: 0.04, freq: 5000, when });
      this.nextNote += spb;
      this.step++;
    }
  }
  music(on) {
    this.musicOn = on;
    if (this.ctx && on) this.nextNote = this.ctx.currentTime + 0.1;
  }
}
