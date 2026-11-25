// GENERATED FILE — do not edit.
// Source: pomelo-penguin/packages/netplay/src/clock.js
// Regenerate with `npm run net:sync`; `npm run net:check` fails on drift.
/**
 * Clock sync against the server tick.
 *
 * There is no server tick loop — ticks are stamped onto messages as they pass
 * through — so this is a plain round-trip estimate, not a simulation clock.
 * What matters is that `serverNow()` is monotonic and reasonably stable: the
 * interpolation buffer reads it every frame, and a clock that jitters or steps
 * backwards makes every remote car stutter.
 */

/** Samples kept for the round-trip estimate. */
const MAX_SAMPLES = 12;

/** How fast a corrected offset is eased in, per second. */
const SLEW_PER_SEC = 0.25;

export class Clock {
	/**
	 * @param {{ now?: () => number }} [opts]
	 */
	constructor(opts = {}) {
		this.localNow = opts.now ?? (() => Date.now());
		/** @type {number[]} */
		this.rtts = [];
		/** Best estimate of serverTick minus local time. */
		this.offset = 0;
		/** Where `serverNow()` currently sits, eased toward `offset`. */
		this.applied = 0;
		this.synced = false;
		this.lastStep = this.localNow();
	}

	/**
	 * Fold in a completed ping/pong.
	 *
	 * @param {number} sentLocal Local time the ping left.
	 * @param {number} serverTick Server tick from the pong.
	 */
	sample(sentLocal, serverTick) {
		const now = this.localNow();
		const rtt = Math.max(0, now - sentLocal);
		this.rtts.push(rtt);
		if (this.rtts.length > MAX_SAMPLES) this.rtts.shift();

		// Assume a symmetric path: the server stamped the tick about half an RTT
		// ago. Cellular uplink and downlink are often not symmetric, which is
		// exactly why this is an estimate that gets eased in rather than snapped.
		const estimate = serverTick + rtt / 2 - now;

		// Prefer the lowest-latency sample seen recently: a fast round trip is
		// far more likely to be an honest one than a slow trip is.
		const best = Math.min(...this.rtts);
		if (!this.synced || rtt <= best * 1.25) {
			this.offset = estimate;
			if (!this.synced) {
				this.applied = estimate;
				this.synced = true;
			}
		}
	}

	/**
	 * Ease `applied` toward `offset`. Call once per frame.
	 *
	 * @param {number} [dtSeconds]
	 */
	step(dtSeconds) {
		const now = this.localNow();
		const dt = dtSeconds ?? Math.max(0, (now - this.lastStep) / 1000);
		this.lastStep = now;
		if (!this.synced) return;
		const delta = this.offset - this.applied;
		// A big correction (a rejoin, a suspended tab) is taken at once — easing
		// several seconds of drift would leave every remote entity wrong the whole
		// time. Small ones slew so the picture doesn't jitter.
		if (Math.abs(delta) > 750) this.applied = this.offset;
		else this.applied += delta * Math.min(1, SLEW_PER_SEC * dt * 4);
	}

	/** Current server tick, in ms since the room epoch. */
	serverNow() {
		return this.localNow() + this.applied;
	}

	/** Smoothed round-trip time, for the HUD and for diagnosing a bad link. */
	get rtt() {
		if (this.rtts.length === 0) return 0;
		const sorted = [...this.rtts].sort((a, b) => a - b);
		return sorted[Math.floor(sorted.length / 2)] ?? 0;
	}
}
