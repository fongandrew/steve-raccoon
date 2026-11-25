// Who's who in a room: up to four raccoons, each with their own truck colours.
// A player's relay slot picks their raccoon, so every screen agrees who is who
// without sending a name. Pure data: no DOM, no three.js.

/**
 * @typedef {object} Raccoon
 * @property {string} name
 * @property {number} body truck body colour
 * @property {number} dark trim, a shade down
 * @property {string} ink outline on the truck's lettering (CSS)
 * @property {string} css body colour for HUD chips and the minimap
 */

/** @type {Raccoon[]} */
export const RACCOONS = [
	{ name: 'Steve', body: 0x3fb26b, dark: 0x2f8f55, ink: '#1d5e37', css: '#3fb26b' },
	{ name: 'Gary', body: 0x4a90d9, dark: 0x356fae, ink: '#1f4673', css: '#4a90d9' },
	{ name: 'Lou', body: 0xf08a3c, dark: 0xc66a22, ink: '#7a3d0e', css: '#f08a3c' },
	{ name: 'Barb', body: 0xa56cd6, dark: 0x8050ad, ink: '#4b2a6e', css: '#a56cd6' },
];

export const MAX_PLAYERS = RACCOONS.length;

/**
 * The raccoon for a relay slot. Solo play is slot 0: Steve.
 *
 * @param {number} slot
 * @returns {Raccoon}
 */
export function raccoonFor(slot) {
	const n = RACCOONS.length;
	return /** @type {Raccoon} */ (RACCOONS[((slot % n) + n) % n]);
}

/**
 * Cans out at once: more trucks, more trash.
 *
 * @param {number} players
 * @param {number} solo how many a lone truck gets
 */
export function activeCansFor(players, solo) {
	return solo + 3 * Math.max(0, Math.min(MAX_PLAYERS, players) - 1);
}

/**
 * Where each slot's truck parks at the start of a shift, as offsets from the
 * solo starting spot: two abreast, two rows, so nobody starts inside anybody.
 *
 * @param {number} slot
 * @returns {{ dx: number, dz: number }}
 */
export function startOffset(slot) {
	const s = ((slot % MAX_PLAYERS) + MAX_PLAYERS) % MAX_PLAYERS;
	return { dx: s % 2 === 0 ? 0 : -4.2, dz: s < 2 ? 0 : -11 };
}
