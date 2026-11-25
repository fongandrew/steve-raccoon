// The things two trucks can want at once: curbside cans, dumpsters and
// treasures. In a room they only change through events, which every client
// applies in the relay's order with this reducer, so everybody agrees who got
// there first. Pure: no DOM, no three.js.

/**
 * @typedef {object} Contest
 * @property {boolean[]} cans by house index: a full can is out at the curb
 * @property {boolean[]} bins by dumpster index: it is full and waiting
 * @property {number[]} gems by treasure index: the slot that found it, or -1
 */

/**
 * - `out` / `binOut`: the host put a can out / filled a dumpster
 * - `can` / `bin` / `gem`: the sender claims it
 *
 * @typedef {{ type: 'out' | 'can' | 'binOut' | 'bin' | 'gem', i: number }} Claim
 */

/**
 * @param {number} houses
 * @param {number} bins
 * @param {number} gems
 * @returns {Contest}
 */
export function freshContest(houses, bins, gems) {
	return {
		cans: new Array(houses).fill(false),
		bins: new Array(bins).fill(false),
		gems: new Array(gems).fill(-1),
	};
}

/**
 * Apply one event. Returns false, changing nothing, when the event lost the
 * race: the can was already taken, the dumpster already hoisted, and so on.
 *
 * @param {Contest} c
 * @param {Claim} claim
 * @param {number} slot who sent it
 * @returns {boolean}
 */
export function applyClaim(c, claim, slot) {
	const i = claim.i;
	switch (claim.type) {
		case 'out':
			if (c.cans[i] !== false) return false;
			c.cans[i] = true;
			return true;
		case 'can':
			if (c.cans[i] !== true) return false;
			c.cans[i] = false;
			return true;
		case 'binOut':
			if (c.bins[i] !== false) return false;
			c.bins[i] = true;
			return true;
		case 'bin':
			if (c.bins[i] !== true) return false;
			c.bins[i] = false;
			return true;
		case 'gem':
			if (c.gems[i] !== -1) return false;
			c.gems[i] = slot;
			return true;
	}
}

/**
 * Final standings, best first. Ties keep slot order, so every screen shows
 * the same table.
 *
 * @template {{ slot: number, score: number }} P
 * @param {P[]} players
 * @returns {P[]}
 */
export function standings(players) {
	return [...players].sort((a, b) => b.score - a.score || a.slot - b.slot);
}
