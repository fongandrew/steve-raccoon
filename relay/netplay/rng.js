// GENERATED FILE — do not edit.
// Source: pomelo-penguin/packages/netplay/src/rng.js
// Regenerate with `npm run net:sync`; `npm run net:check` fails on drift.
/**
 * Seeded RNG for seed-derived state: hazards, shuffles, spawn tables — anything
 * every client must compute identically from `seed + tick` without a byte
 * crossing the wire.
 *
 * splitmix32. Chosen because it is exactly reproducible across every JS engine
 * we care about: integer ops and `Math.imul` only, no floating-point
 * accumulation, no engine-dependent transcendentals. Games relying on
 * determinism must use this rather than `Math.random`, and must avoid
 * `Math.sin`/`Math.pow`-style math in the deterministic path — those are not
 * bit-identical between engines.
 */

/**
 * @typedef {() => number} Rng A function returning a float in [0, 1).
 */

/**
 * @param {number} seed Any 32-bit integer.
 * @returns {Rng}
 */
export function makeRng(seed) {
	let s = seed >>> 0;
	return function next() {
		s = (s + 0x9e3779b9) >>> 0;
		let z = s;
		z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
		z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
		z = (z ^ (z >>> 15)) >>> 0;
		return z / 4294967296;
	};
}

/**
 * A stream keyed by both the room seed and some coordinate (a tick, an entity
 * id, a lap number). Lets a game pull independent, reproducible randomness at
 * any point without threading a mutable generator through its state.
 *
 * @param {number} seed
 * @param {number} key
 * @returns {Rng}
 */
export function streamFor(seed, key) {
	return makeRng((Math.imul(seed >>> 0, 0x85ebca6b) ^ Math.imul(key >>> 0, 0xc2b2ae35)) >>> 0);
}

/**
 * Integer in [min, max]. Inclusive on both ends — the shape kids' games
 * actually want.
 *
 * @param {Rng} rng
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function intRange(rng, min, max) {
	return min + Math.floor(rng() * (max - min + 1));
}

/**
 * @template T
 * @param {Rng} rng
 * @param {readonly T[]} items
 * @returns {T | undefined}
 */
export function pick(rng, items) {
	if (items.length === 0) return undefined;
	return items[Math.floor(rng() * items.length)];
}

/**
 * Fisher-Yates, returning a new array. Every client shuffling the same deck
 * with the same seed gets the same order — that's the whole point of
 * seed-derived state for a card game.
 *
 * @template T
 * @param {Rng} rng
 * @param {readonly T[]} items
 * @returns {T[]}
 */
export function shuffle(rng, items) {
	const out = items.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const a = out[i];
		const b = out[j];
		if (a === undefined || b === undefined) continue;
		out[i] = b;
		out[j] = a;
	}
	return out;
}

/**
 * A fresh room seed from the platform CSPRNG.
 *
 * @returns {number}
 */
export function randomSeed() {
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	return (buf[0] ?? 1) >>> 0;
}
