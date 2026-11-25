// What goes over the relay, and how it is packed: a truck snapshot (~20 a
// second per player), the events that start a shift and settle contested
// things, and the keyframe a rejoining player is caught up from. Pure: no DOM,
// no three.js.
import { Reader, Writer } from './net/pack.js';

/** @typedef {import('./contest.js').Claim} Claim */
/** @typedef {import('./contest.js').Contest} Contest */

/** Positions on the wire cover this far from the middle of town (q16: ~1cm steps). */
export const POS_MAX = 320;
const Y_MIN = -5;
const Y_MAX = 60;
const VEL_MAX = 80;

/**
 * A truck on the wire.
 *
 * @typedef {object} Snap
 * @property {number} shift shift number this belongs to (0 = lobby)
 * @property {number} x
 * @property {number} z
 * @property {number} y
 * @property {number} heading radians
 * @property {number} vx
 * @property {number} vz
 * @property {number} steer -1..1 of full lock, for the front wheels
 * @property {number} load bags aboard
 * @property {number} score
 * @property {boolean} boosting
 * @property {boolean} grounded
 */

/** @param {number} a */
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * @param {Snap} s
 * @returns {Uint8Array}
 */
export function encodeSnap(s) {
	return new Writer(20)
		.u16(s.shift)
		.q16(s.x, -POS_MAX, POS_MAX)
		.q16(s.z, -POS_MAX, POS_MAX)
		.q16(s.y, Y_MIN, Y_MAX)
		.q16(wrap(s.heading), -Math.PI, Math.PI)
		.q16(s.vx, -VEL_MAX, VEL_MAX)
		.q16(s.vz, -VEL_MAX, VEL_MAX)
		.i8(Math.round(Math.max(-1, Math.min(1, s.steer)) * 127))
		.u8(Math.max(0, Math.min(255, s.load)))
		.u16(Math.max(0, Math.min(65535, Math.round(s.score))))
		.u8((s.boosting ? 1 : 0) | (s.grounded ? 2 : 0))
		.done();
}

/**
 * @param {Uint8Array} bytes
 * @returns {Snap}
 */
export function decodeSnap(bytes) {
	const r = new Reader(bytes);
	const shift = r.u16();
	const x = r.q16(-POS_MAX, POS_MAX);
	const z = r.q16(-POS_MAX, POS_MAX);
	const y = r.q16(Y_MIN, Y_MAX);
	const heading = r.q16(-Math.PI, Math.PI);
	const vx = r.q16(-VEL_MAX, VEL_MAX);
	const vz = r.q16(-VEL_MAX, VEL_MAX);
	const steer = r.i8() / 127;
	const load = r.u8();
	const score = r.u16();
	const flags = r.u8();
	return {
		shift,
		x,
		z,
		y,
		heading,
		vx,
		vz,
		steer,
		load,
		score,
		boosting: (flags & 1) !== 0,
		grounded: (flags & 2) !== 0,
	};
}

/**
 * A relay event: the start of a shift, or a claim on something contested.
 * The shift start is an event (not only a control message) because the relay
 * replays events to a player who reconnects.
 *
 * @typedef {{ type: 'shift', shift: number, startAt: number } | Claim} NetEvent
 */

const EV = /** @type {const} */ ({ shift: 1, out: 2, can: 3, binOut: 4, bin: 5, gem: 6 });
/** @type {Record<number, Claim['type']>} */
const CLAIM_BY_CODE = { 2: 'out', 3: 'can', 4: 'binOut', 5: 'bin', 6: 'gem' };

/**
 * @param {NetEvent} ev
 * @returns {Uint8Array}
 */
export function encodeEvent(ev) {
	const w = new Writer(8).u8(EV[ev.type]);
	if (ev.type === 'shift') return w.u16(ev.shift).u32(ev.startAt).done();
	return w.u16(ev.i).done();
}

/**
 * @param {Uint8Array} bytes
 * @returns {NetEvent | null}
 */
export function decodeEvent(bytes) {
	const r = new Reader(bytes);
	const code = r.u8();
	if (code === EV.shift) return { type: 'shift', shift: r.u16(), startAt: r.u32() };
	const type = CLAIM_BY_CODE[code];
	return type ? { type, i: r.u16() } : null;
}

/**
 * The room's confirmed state, for the relay to hand a rejoining player.
 *
 * @typedef {{ shift: number, startAt: number, contest: Contest }} Keyframe
 */

/**
 * @param {Keyframe} k
 * @returns {Uint8Array}
 */
export function encodeKeyframe(k) {
	const { cans, bins, gems } = k.contest;
	const w = new Writer(16 + cans.length + bins.length + gems.length)
		.u16(k.shift)
		.u32(k.startAt)
		.u16(cans.length)
		.u8(bins.length)
		.u8(gems.length);
	for (const c of cans) w.u8(c ? 1 : 0);
	for (const b of bins) w.u8(b ? 1 : 0);
	for (const g of gems) w.i8(g);
	return w.done();
}

/**
 * @param {Uint8Array} bytes
 * @returns {Keyframe}
 */
export function decodeKeyframe(bytes) {
	const r = new Reader(bytes);
	const shift = r.u16();
	const startAt = r.u32();
	const nCans = r.u16();
	const nBins = r.u8();
	const nGems = r.u8();
	/** @type {Contest} */
	const contest = { cans: [], bins: [], gems: [] };
	for (let i = 0; i < nCans; i++) contest.cans.push(r.u8() === 1);
	for (let i = 0; i < nBins; i++) contest.bins.push(r.u8() === 1);
	for (let i = 0; i < nGems; i++) contest.gems.push(r.i8());
	return { shift, startAt, contest };
}
