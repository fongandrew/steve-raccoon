// Tiny synthesized sound kit + a bouncy background tune. No audio files needed.

class Audio {
	constructor() {
		this.ctx = null;
		this.muted = false;
		this.engine = null;
		this.musicStep = 0;
		this.nextNoteTime = 0;
	}

	init() {
		if (this.ctx) return;
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) return;
		this.ctx = new AC();
		this.master = this.ctx.createGain();
		this.master.gain.value = 0.8;
		this.master.connect(this.ctx.destination);
		this.sfx = this.ctx.createGain();
		this.sfx.gain.value = 0.7;
		this.sfx.connect(this.master);
		this.music = this.ctx.createGain();
		this.music.gain.value = 0.16;
		this.music.connect(this.master);

		// Engine: a chuggy sawtooth through a low-pass, wobbled by an LFO
		const osc = this.ctx.createOscillator();
		osc.type = 'sawtooth';
		const filt = this.ctx.createBiquadFilter();
		filt.type = 'lowpass';
		filt.frequency.value = 400;
		const gain = this.ctx.createGain();
		gain.gain.value = 0;
		const lfo = this.ctx.createOscillator();
		lfo.frequency.value = 9;
		const lfoGain = this.ctx.createGain();
		lfoGain.gain.value = 4;
		lfo.connect(lfoGain).connect(osc.frequency);
		osc.connect(filt).connect(gain).connect(this.sfx);
		osc.start();
		lfo.start();
		this.engine = { osc, filt, gain, lfo };
		this.nextNoteTime = this.ctx.currentTime + 0.1;
	}

	resume() {
		if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
	}

	toggleMute() {
		this.muted = !this.muted;
		if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
		return this.muted;
	}

	setEngine(speed, throttle, running) {
		if (!this.engine) return;
		const t = this.ctx.currentTime;
		const s = Math.abs(speed);
		this.engine.osc.frequency.setTargetAtTime(38 + s * 2.6 + throttle * 10, t, 0.1);
		this.engine.lfo.frequency.setTargetAtTime(7 + s * 0.6, t, 0.1);
		this.engine.filt.frequency.setTargetAtTime(260 + s * 30 + throttle * 200, t, 0.1);
		this.engine.gain.gain.setTargetAtTime(running ? 0.05 + throttle * 0.03 : 0, t, 0.15);
	}

	// --- helpers ---
	tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, delay = 0, dest } = {}) {
		if (!this.ctx) return;
		const t = this.ctx.currentTime + delay;
		const o = this.ctx.createOscillator();
		o.type = type;
		o.frequency.setValueAtTime(freq, t);
		if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
		const g = this.ctx.createGain();
		g.gain.setValueAtTime(vol, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + dur);
		o.connect(g).connect(dest || this.sfx);
		o.start(t);
		o.stop(t + dur + 0.02);
	}

	noise(dur, { vol = 0.3, freq = 1200, q = 1, delay = 0, type = 'bandpass' } = {}) {
		if (!this.ctx) return;
		const t = this.ctx.currentTime + delay;
		const len = Math.max(1, (this.ctx.sampleRate * dur) | 0);
		const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
		const d = buf.getChannelData(0);
		for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
		const src = this.ctx.createBufferSource();
		src.buffer = buf;
		const f = this.ctx.createBiquadFilter();
		f.type = type;
		f.frequency.value = freq;
		f.Q.value = q;
		const g = this.ctx.createGain();
		g.gain.setValueAtTime(vol, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + dur);
		src.connect(f).connect(g).connect(this.sfx);
		src.start(t);
	}

	// --- sound effects ---
	honk() {
		this.tone(311, 0.45, { type: 'square', vol: 0.12 });
		this.tone(392, 0.45, { type: 'square', vol: 0.12 });
		this.tone(311, 0.25, { type: 'square', vol: 0.1, delay: 0.5 });
		this.tone(392, 0.25, { type: 'square', vol: 0.1, delay: 0.5 });
	}
	bonk(strength = 1) {
		this.tone(180, 0.25, { type: 'sine', vol: 0.35 * strength, slide: -120 });
		this.noise(0.12, { vol: 0.2 * strength, freq: 500 });
	}
	boing() {
		this.tone(200, 0.35, { type: 'sine', vol: 0.25, slide: 500 });
	}
	grab() {
		this.tone(220, 0.15, { type: 'triangle', vol: 0.2, slide: 200 });
		this.noise(0.3, { vol: 0.15, freq: 300, delay: 0.5 });
		this.noise(0.25, { vol: 0.12, freq: 900, delay: 0.65 });
	}
	collect(n = 1) {
		const notes = [523, 659, 784, 1047, 1319];
		for (let i = 0; i < Math.min(5, n + 1); i++)
			this.tone(notes[i], 0.12, { type: 'square', vol: 0.09, delay: i * 0.07 });
	}
	golden() {
		[784, 988, 1175, 1568, 1976].forEach((f, i) =>
			this.tone(f, 0.18, { type: 'triangle', vol: 0.12, delay: i * 0.06 }),
		);
	}
	chomp() {
		for (let i = 0; i < 3; i++) {
			this.noise(0.07, { vol: 0.35, freq: 700 + i * 120, q: 2, delay: i * 0.13 });
			this.tone(120, 0.06, { type: 'square', vol: 0.08, delay: i * 0.13 });
		}
	}
	burp() {
		this.tone(90, 0.5, { type: 'sawtooth', vol: 0.18, slide: -30 });
	}
	dumpTick() {
		this.tone(700 + Math.random() * 300, 0.06, { type: 'square', vol: 0.06 });
	}
	cash() {
		[1047, 1319, 1568, 2093].forEach((f, i) =>
			this.tone(f, 0.15, { type: 'square', vol: 0.08, delay: i * 0.05 }),
		);
	}
	meow() {
		this.tone(700, 0.35, { type: 'sawtooth', vol: 0.06, slide: 500 });
		this.tone(1100, 0.3, { type: 'triangle', vol: 0.05, slide: -500, delay: 0.15 });
	}
	splash() {
		this.noise(0.8, { vol: 0.25, freq: 2500, type: 'highpass' });
	}
	hiccup() {
		this.tone(500, 0.08, { type: 'sine', vol: 0.25, slide: 400 });
	}
	whistle() {
		this.tone(1200, 0.4, { type: 'sine', vol: 0.1, slide: -800 });
	}
	beep() {
		this.tone(1000, 0.12, { type: 'square', vol: 0.05 });
	}
	timber() {
		// creak... then the crash
		this.tone(140, 0.7, { type: 'sawtooth', vol: 0.08, slide: -60 });
		this.tone(210, 0.5, { type: 'triangle', vol: 0.06, slide: 120, delay: 0.1 });
		this.noise(0.6, { vol: 0.3, freq: 700, q: 0.8, delay: 0.55 });
	}
	oof() {
		this.tone(220, 0.18, { type: 'triangle', vol: 0.18, slide: -90 });
		this.noise(0.1, { vol: 0.12, freq: 400 });
	}
	yip() {
		this.tone(950, 0.08, { type: 'square', vol: 0.07, slide: -250 });
		this.tone(1050, 0.08, { type: 'square', vol: 0.06, slide: -300, delay: 0.12 });
	}
	huff() {
		this.noise(0.18, { vol: 0.2, freq: 600, q: 1 });
	}
	gooseHonk() {
		const pitch = 330 + Math.random() * 60;
		this.tone(pitch, 0.22, { type: 'sawtooth', vol: 0.14, slide: -90 });
		this.tone(pitch * 1.5, 0.18, { type: 'square', vol: 0.05, slide: -120 });
	}
	clang() {
		this.tone(880, 0.35, { type: 'square', vol: 0.06, slide: -200 });
		this.tone(1320, 0.25, { type: 'triangle', vol: 0.07 });
		this.noise(0.08, { vol: 0.15, freq: 3000 });
	}
	crunch() {
		for (let i = 0; i < 3; i++)
			this.noise(0.06, { vol: 0.28, freq: 500 + i * 300, q: 1.5, delay: i * 0.04 });
	}
	squeak() {
		this.tone(1400, 0.15, { type: 'sine', vol: 0.12, slide: 600 });
	}
	rustle() {
		this.noise(0.35, { vol: 0.16, freq: 4000, q: 0.6 });
	}
	flutter() {
		for (let i = 0; i < 5; i++)
			this.noise(0.05, { vol: 0.12, freq: 1800, q: 2, delay: i * 0.06 });
	}
	chargeUp(level) {
		this.tone(500 + level * 250, 0.12, { type: 'triangle', vol: 0.12, slide: 300 });
	}
	boost(level) {
		this.noise(0.6, { vol: 0.3, freq: 900, q: 0.7, type: 'bandpass' });
		this.tone(180, 0.5, { type: 'sawtooth', vol: 0.12, slide: 400 + level * 200 });
	}
	treasure() {
		[659, 880, 1109, 1319, 1760].forEach((f, i) =>
			this.tone(f, 0.22, { type: 'triangle', vol: 0.13, delay: i * 0.07 }),
		);
		this.tone(2637, 0.5, { type: 'sine', vol: 0.06, delay: 0.38 });
	}
	fanfare() {
		[523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
			this.tone(f, 0.2, { type: 'square', vol: 0.1, delay: i * 0.14 }),
		);
	}

	// --- music: a little loop scheduled ahead of time ---
	updateMusic(playing) {
		if (!this.ctx || !playing) return;
		const bpm = 132;
		const step = 60 / bpm / 2; // eighth notes
		// C - Am - F - G, bouncy bass + pentatonic melody
		const bass = [48, 48, 55, 48, 45, 45, 52, 45, 41, 41, 48, 41, 43, 43, 50, 43];
		const mel = [
			72, 0, 76, 79, 76, 0, 74, 72, 69, 0, 72, 74, 76, 0, 0, 0, 77, 0, 76, 74, 72, 0, 69, 72,
			74, 0, 79, 0, 76, 74, 72, 0,
		];
		const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
		while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
			const s = this.musicStep;
			const delay = Math.max(0, this.nextNoteTime - this.ctx.currentTime);
			const b = bass[s % 16];
			this.tone(mtof(b), step * 0.9, { type: 'triangle', vol: 0.5, delay, dest: this.music });
			const m = mel[s % 32];
			if (m)
				this.tone(mtof(m), step * 0.8, {
					type: 'square',
					vol: 0.18,
					delay,
					dest: this.music,
				});
			if (s % 4 === 2) {
				// hi-hat-ish tick
				this.noiseTo(this.music, 0.04, delay);
			}
			this.musicStep++;
			this.nextNoteTime += step;
		}
	}

	noiseTo(dest, dur, delay) {
		const t = this.ctx.currentTime + delay;
		if (!this._hat) {
			const len = (this.ctx.sampleRate * 0.05) | 0;
			this._hat = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
			const d = this._hat.getChannelData(0);
			for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
		}
		const src = this.ctx.createBufferSource();
		src.buffer = this._hat;
		const f = this.ctx.createBiquadFilter();
		f.type = 'highpass';
		f.frequency.value = 6000;
		const g = this.ctx.createGain();
		g.gain.setValueAtTime(0.25, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + dur);
		src.connect(f).connect(g).connect(dest);
		src.start(t);
	}
}

/** The one sound kit. It stays silent until `init()` runs on a user gesture. */
export const audio = new Audio();
