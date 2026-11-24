// Small pure helpers: easing, angles, formatting, phase timelines. No DOM, no three.js.

/**
 * Cubic ease in/out over 0..1.
 *
 * @param {number} x
 */
export const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/**
 * Wrap an angle into -PI..PI.
 *
 * @param {number} a
 */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Capitalise the first letter.
 *
 * @param {string} s
 */
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Drift boost tier (0 = none, 3 = ultra) for seconds of drift charge.
 *
 * @param {number} charge
 * @returns {0 | 1 | 2 | 3}
 */
export function boostLevel(charge) {
	return charge >= 1.9 ? 3 : charge >= 1.2 ? 2 : charge >= 0.6 ? 1 : 0;
}

/**
 * Seconds left as `m:ss`, rounded up so the clock hits 0:00 exactly at the end.
 *
 * @param {number} left
 */
export function fmtCountdown(left) {
	const s = Math.max(0, Math.ceil(left));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Lay named phases end to end, for scripted animations like the grabber arm.
 *
 * @template {string} K
 * @param {Record<K, number>} durations seconds per phase, in play order
 * @returns {{
 *   end: Record<K, number>,
 *   total: number,
 *   phase: (t: number, k: K) => number,
 * }} `end[k]` is when phase `k` finishes; `phase(t, k)` is 0..1 progress through it
 */
export function timeline(durations) {
	const keys = /** @type {K[]} */ (Object.keys(durations));
	const start = /** @type {Record<K, number>} */ ({});
	const end = /** @type {Record<K, number>} */ ({});
	let t = 0;
	for (const k of keys) {
		start[k] = t;
		t += durations[k];
		end[k] = t;
	}
	return {
		end,
		total: t,
		phase: (time, k) => Math.max(0, Math.min(1, (time - start[k]) / durations[k])),
	};
}
