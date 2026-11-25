// GENERATED FILE — do not edit.
// Source: pomelo-penguin/packages/netplay/src/codes.js
// Regenerate with `npm run net:sync`; `npm run net:check` fails on drift.
/**
 * Join codes. Short enough for a kid to read across a table, drawn from an
 * alphabet with no visually ambiguous characters (no I/L/O/0/1). Codes are
 * always generated server-side — clients never propose one, so nobody can
 * squat a code they expect a friend to use.
 */

export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const CODE_LENGTH = 4;

/**
 * Generate a code. Takes an explicit random source so tests are deterministic
 * and the server can use `crypto.getRandomValues` in production.
 *
 * @param {() => number} random Returns a float in [0, 1).
 * @returns {string}
 */
export function makeCode(random) {
	let out = '';
	for (let i = 0; i < CODE_LENGTH; i++) {
		const idx = Math.min(ALPHABET.length - 1, Math.floor(random() * ALPHABET.length));
		out += ALPHABET[idx];
	}
	return out;
}

/**
 * Generate a code from the platform CSPRNG. Available in browsers, workerd and
 * Node 22 alike.
 *
 * @returns {string}
 */
export function randomCode() {
	const buf = new Uint32Array(CODE_LENGTH);
	crypto.getRandomValues(buf);
	let out = '';
	for (let i = 0; i < CODE_LENGTH; i++) {
		out += ALPHABET[(buf[i] ?? 0) % ALPHABET.length];
	}
	return out;
}

/**
 * Upper-case a human-typed code and drop the separators people add. Does not
 * validate — pair with `isValidCode`.
 *
 * Deliberately does no character "repair": the alphabet already excludes every
 * ambiguous glyph (I/L/O/0/1), so a typed `O` has no sound target to map to and
 * guessing would turn a typo into a join to somebody else's room.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeCode(raw) {
	let out = '';
	for (const ch of raw.trim().toUpperCase()) {
		if (ch === '-' || ch === ' ') continue;
		out += ch;
	}
	return out;
}

/**
 * @param {string} code
 * @returns {boolean}
 */
export function isValidCode(code) {
	if (code.length !== CODE_LENGTH) return false;
	for (const ch of code) {
		if (!ALPHABET.includes(ch)) return false;
	}
	return true;
}
