// The shift's game state and the truck's physical body. Everything a new
// shift starts over lives here, so `resetShiftState()` is the whole reset.
import * as THREE from '../vendor/three.module.js';
import { blockCenter, ROAD_Y, roadCenter } from './world.js';

/** @typedef {'title' | 'playing' | 'paused' | 'results'} Mode */

/** @typedef {ReturnType<typeof newStats>} Stats */

/**
 * A curbside can on its way up a side arm and back (see cans.js).
 *
 * @typedef {object} Grab
 * @property {import('./world.js').House} h whose can it is
 * @property {import('./models.js').ArmModel} arm
 * @property {number} t seconds since the arm started reaching
 * @property {boolean} added bags counted into the load
 * @property {boolean} attached can is parented to the gripper
 * @property {boolean} released can is back on the curb
 * @property {boolean} hold truck must stay put (until the can is released)
 * @property {THREE.Vector3} home where the can stood
 * @property {number} rotY the can's heading at the curb
 */

/**
 * A dumpster going over the cab on the front loader (see loader.js).
 *
 * @typedef {object} Lift
 * @property {import('./world.js').Bin} b
 * @property {number} t seconds since the forks started reaching
 * @property {boolean} attached
 * @property {boolean} added
 * @property {boolean} released
 * @property {boolean} hold truck must stay put
 * @property {THREE.Vector3} aligned where the dumpster sits once squared up with the forks
 * @property {number} alignedRot its heading there
 */

/**
 * Unloading at The Dump: bags in the truck on arrival, bags tipped so far,
 * and the countdown to the next one.
 *
 * @typedef {{ start: number, n: number, tick: number }} Dumping
 */

/** Everything the results screen tallies. */
export const newStats = () => ({
	cans: 0,
	golden: 0,
	dumpsters: 0,
	bags: 0,
	snacks: 0,
	bonks: 0,
	cats: 0,
	air: 0,
	loads: 0,
	doubles: 0,
	treasures: 0,
	boosts: 0,
	smashed: 0,
	geese: 0,
	dumped: 0,
	trees: 0,
});

/** Per-shift values. `mode` is left out: screens own it. */
const newShift = () => ({
	time: 0, // seconds into the shift
	score: 0,
	load: 0, // bags in the hopper
	hunger: 100,
	hangry: false,
	zoomT: 0, // seconds of coffee zoomies left
	hicT: 0, // seconds of hiccups left
	hicNext: 0,
	chompT: 0,
	snackCd: 0,
	honkCd: 0,
	/** @type {Grab[]} */
	grabs: [], // side-arm grabs in progress
	/** @type {Lift | null} */
	lift: null, // front-loader lift in progress
	binSpawnT: 0,
	driftCharge: 0,
	boostT: 0,
	goldenHour: false,
	spawnT: 0,
	streak: 0,
	lastCollect: -99,
	/** @type {Dumping | null} */
	dumping: null,
	quipT: 18,
	idleT: 0,
	beepT: 0,
	shake: 0,
	celebrateT: 0,
	warned: false,
	chaos: 0, // props smashed in the current combo
	lastSmash: -9,
	// Rate limiters, in shift time
	lastNarration: -99,
	lastBonk: -9,
	lastGooseHonk: -9,
	stats: newStats(),
});

export const state = {
	/** @type {Mode} */
	mode: 'title',
	...newShift(),
};

/** The truck's body: position, velocity and the springs that animate it. */
export const T = {
	pos: new THREE.Vector3(),
	vel: new THREE.Vector3(),
	heading: 0,
	y: 0,
	vy: 0,
	grounded: true,
	airTime: 0,
	steer: 0,
	fwd: 0,
	lat: 0,
	squash: 0,
	squashV: 0,
	pitch: 0,
	roll: 0,
};

/** Back to the start of a shift: fresh counters, truck parked at the depot corner. */
export function resetShiftState() {
	Object.assign(state, newShift());
	T.pos.set(roadCenter(3), 0, blockCenter(2));
	T.vel.set(0, 0, 0);
	T.heading = 0;
	T.y = ROAD_Y;
	T.vy = 0;
	T.grounded = true;
	T.airTime = 0;
	T.steer = 0;
}

/**
 * Add (or dock) points. Gains count double during Golden Hour.
 *
 * @param {number} n
 */
export function addScore(n) {
	if (n > 0 && state.goldenHour) n *= 2;
	state.score = Math.max(0, state.score + n);
}
