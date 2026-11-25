// GENERATED FILE — do not edit.
// Source: pomelo-penguin/packages/netplay/src/owned.js
// Regenerate with `npm run net:sync`; `npm run net:check` fails on drift.
/**
 * Remote owned state: the buffer that turns a stream of other players'
 * snapshots into something smooth to draw.
 *
 * The policy is the interesting part, and it comes straight from "nobody ever
 * waits for anybody": render ~120ms in the past so there's normally a sample on
 * both sides to interpolate between; if the next sample hasn't arrived,
 * extrapolate for up to 300ms; past that, freeze rather than invent. After a
 * long gap, teleport — a car sliding across half the track to "catch up" reads
 * as a bug, while a jump reads as lag, which is what it is.
 */

/** How far behind the server clock remote entities are rendered. */
export const INTERP_DELAY_MS = 120;

/** How long a missing sample may be extrapolated before the entity freezes. */
export const MAX_EXTRAPOLATE_MS = 300;

/** A gap beyond this teleports rather than smooths. */
export const TELEPORT_GAP_MS = 600;

/** Samples retained per slot. Enough for the delay window plus slack. */
const MAX_SAMPLES = 24;

/**
 * @template T
 * @typedef {object} Sample
 * @property {number} t Server tick, in ms.
 * @property {T} value
 */

/**
 * A per-slot buffer of decoded snapshots.
 *
 * @template T
 */
export class OwnedBuffer {
	/**
	 * @param {(a: T, b: T, t: number) => T} lerp Blend two decoded states.
	 */
	constructor(lerp) {
		this.lerp = lerp;
		/** @type {Map<number, Sample<T>[]>} */
		this.bySlot = new Map();
		/** @type {Set<number>} */
		this.teleported = new Set();
	}

	/**
	 * @param {number} slot
	 * @param {number} serverTick
	 * @param {T} value
	 */
	push(slot, serverTick, value) {
		let samples = this.bySlot.get(slot);
		if (!samples) {
			samples = [];
			this.bySlot.set(slot, samples);
		}
		const last = samples[samples.length - 1];
		// Out-of-order and duplicate frames are normal on cellular; the newest
		// wins and stale ones are simply dropped.
		if (last && serverTick <= last.t) return;
		if (last && serverTick - last.t > TELEPORT_GAP_MS) {
			// The gap is long enough that blending would be a lie. Drop history so
			// the next read snaps to the new position.
			samples.length = 0;
			this.teleported.add(slot);
		}
		samples.push({ t: serverTick, value });
		if (samples.length > MAX_SAMPLES) samples.shift();
	}

	/**
	 * @param {number} slot
	 */
	drop(slot) {
		this.bySlot.delete(slot);
		this.teleported.delete(slot);
	}

	/** @returns {number[]} */
	slots() {
		return [...this.bySlot.keys()];
	}

	/**
	 * True if the last `push` for this slot was a teleport. Read-and-clear, so a
	 * renderer can skip its own smoothing for exactly one frame.
	 *
	 * @param {number} slot
	 * @returns {boolean}
	 */
	takeTeleport(slot) {
		return this.teleported.delete(slot);
	}

	/**
	 * The state to draw for a slot right now.
	 *
	 * @param {number} slot
	 * @param {number} serverNow Current server tick, in ms.
	 * @returns {{ value: T, stale: boolean } | null}
	 */
	sample(slot, serverNow) {
		const samples = this.bySlot.get(slot);
		if (!samples || samples.length === 0) return null;
		const target = serverNow - INTERP_DELAY_MS;

		const first = samples[0];
		const last = samples[samples.length - 1];
		if (!first || !last) return null;

		// Before our oldest sample: nothing to blend, show the oldest we have.
		if (target <= first.t) return { value: first.value, stale: false };

		if (target >= last.t) {
			const ahead = target - last.t;
			if (ahead > MAX_EXTRAPOLATE_MS) {
				// Freeze. A player who left the tunnel two seconds ago is not
				// somewhere plausible any more, and guessing makes it worse.
				return { value: last.value, stale: true };
			}
			const prev = samples[samples.length - 2];
			if (!prev || last.t === prev.t) return { value: last.value, stale: ahead > 0 };
			const span = last.t - prev.t;
			return {
				value: this.lerp(prev.value, last.value, (target - prev.t) / span),
				stale: false,
			};
		}

		for (let i = samples.length - 1; i > 0; i--) {
			const b = samples[i];
			const a = samples[i - 1];
			if (!a || !b || target < a.t || target > b.t) continue;
			const span = b.t - a.t || 1;
			return { value: this.lerp(a.value, b.value, (target - a.t) / span), stale: false };
		}
		return { value: last.value, stale: false };
	}
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerpNumber(a, b, t) {
	return a + (b - a) * t;
}

/**
 * Shortest-path angle blend, in radians. Straight lerp spins a car the long way
 * round whenever it crosses the pi boundary.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerpAngle(a, b, t) {
	const tau = Math.PI * 2;
	let delta = (b - a) % tau;
	if (delta > Math.PI) delta -= tau;
	if (delta < -Math.PI) delta += tau;
	return a + delta * t;
}
