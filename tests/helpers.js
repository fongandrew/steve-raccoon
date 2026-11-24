/**
 * Shared test helpers (not a test file).
 */

/**
 * jsdom has no 2D canvas. The world and model builders paint a few textures
 * (signs, the beach ball), so give them a context that accepts any call and
 * draws nothing.
 */
export function stubCanvas() {
	const ctx = new Proxy(
		{},
		{
			get: (target, prop) => {
				if (prop === 'measureText') return () => ({ width: 0 });
				if (prop in target) return Reflect.get(target, prop);
				return () => ctx;
			},
			set: (target, prop, value) => Reflect.set(target, prop, value),
		},
	);
	HTMLCanvasElement.prototype.getContext = /** @type {any} */ (() => ctx);
}

/**
 * Make `Math.random` a repeating sequence for the duration of `fn`.
 *
 * @template T
 * @param {number[]} values
 * @param {() => T} fn
 * @returns {T}
 */
export function withRandom(values, fn) {
	const real = Math.random;
	let i = 0;
	Math.random = () => /** @type {number} */ (values[i++ % values.length]);
	try {
		return fn();
	} finally {
		Math.random = real;
	}
}
