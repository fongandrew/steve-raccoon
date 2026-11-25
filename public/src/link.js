// The seam between the game and a multiplayer room. Game modules ask
// `link.session` what the room says (who hosts, what time it is) and send
// their claims through it; solo play has no session and does things directly.
// multi.js provides the session, so nothing here imports the game.

/** @typedef {import('./contest.js').Claim} Claim */

/**
 * What the game needs from a room.
 *
 * @typedef {object} GameLink
 * @property {number} slot this player's relay slot
 * @property {() => boolean} isHost the host puts cans out and fills dumpsters
 * @property {() => number} time seconds into the shift, by the relay's clock (negative: countdown)
 * @property {() => number} playerCount trucks in the room right now
 * @property {() => { x: number, z: number }[]} truckSpots where every truck is
 * @property {(claim: Claim) => void} claim ask the room for something contested
 * @property {(slot: number, ix: number, iz: number) => void} bumped we hit that truck: tell its owner the shove it is owed
 * @property {() => Standing[]} table everyone's score, best first
 * @property {(dt: number) => void} frame once a frame: hear from the room, report our truck
 * @property {() => boolean} startNextShift host only: start a shift for the whole room
 */

/**
 * @typedef {object} Standing
 * @property {number} slot
 * @property {string} name
 * @property {string} css their colour
 * @property {number} score
 * @property {boolean} me
 */

export const link = {
	/** @type {GameLink | null} */
	session: null,
};

/** How long to wait for the room's answer before asking again (seconds). */
const RETRY = 0.8;
/** @type {Map<string, number>} */
const asked = new Map();

/**
 * Send a claim, unless the same one went out a moment ago and the answer is
 * still on its way. The claim only takes effect when the room confirms it.
 *
 * @param {Claim} claim
 */
export function tryClaim(claim) {
	const session = link.session;
	if (!session) return;
	const key = `${claim.type}:${claim.i}`;
	const now = performance.now() / 1000;
	if (now - (asked.get(key) ?? -9) < RETRY) return;
	asked.set(key, now);
	session.claim(claim);
}
