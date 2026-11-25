import { describe, expect, it } from 'vitest';

import { freshContest } from '../public/src/contest.js';
import {
	decodeEvent,
	decodeKeyframe,
	decodeSnap,
	encodeEvent,
	encodeKeyframe,
	encodeSnap,
	POS_MAX,
} from '../public/src/wire.js';
import { HALF } from '../public/src/world.js';

/** @type {import('../public/src/wire.js').Snap} */
const SNAP = {
	shift: 3,
	x: -101.25,
	z: 88.5,
	y: 4.2,
	heading: 2.5,
	vx: -12.5,
	vz: 20.25,
	steer: -0.5,
	load: 9,
	score: 1234,
	boosting: true,
	grounded: false,
};

describe('snapshots', () => {
	it('round-trip within a centimetre or so', () => {
		const s = decodeSnap(encodeSnap(SNAP));
		expect(s.shift).toBe(3);
		expect(s.x).toBeCloseTo(SNAP.x, 1);
		expect(s.z).toBeCloseTo(SNAP.z, 1);
		expect(s.y).toBeCloseTo(SNAP.y, 1);
		expect(s.heading).toBeCloseTo(SNAP.heading, 2);
		expect(s.vx).toBeCloseTo(SNAP.vx, 1);
		expect(s.vz).toBeCloseTo(SNAP.vz, 1);
		expect(s.steer).toBeCloseTo(SNAP.steer, 1);
		expect(s).toMatchObject({ load: 9, score: 1234, boosting: true, grounded: false });
	});

	it('are small', () => {
		expect(encodeSnap(SNAP).length).toBeLessThanOrEqual(20);
	});

	it('wrap a heading that has wound past a full turn', () => {
		const s = decodeSnap(encodeSnap({ ...SNAP, heading: Math.PI * 6 + 0.5 }));
		expect(s.heading).toBeCloseTo(0.5, 2);
	});

	it('clamp what will not fit instead of wrapping round', () => {
		const s = decodeSnap(encodeSnap({ ...SNAP, score: 1e9, load: 999, steer: 5 }));
		expect(s.score).toBe(65535);
		expect(s.load).toBe(255);
		expect(s.steer).toBe(1);
	});

	it('cover the whole town, with room for a truck that leaves it', () => {
		expect(POS_MAX).toBeGreaterThan(HALF + 60);
	});
});

describe('events', () => {
	it('round-trip a shift start', () => {
		const ev = { type: /** @type {const} */ ('shift'), shift: 7, startAt: 123456789 };
		expect(decodeEvent(encodeEvent(ev))).toEqual(ev);
	});

	it('round-trip every kind of claim', () => {
		for (const type of /** @type {const} */ (['out', 'can', 'binOut', 'bin', 'gem'])) {
			expect(decodeEvent(encodeEvent({ type, i: 300 }))).toEqual({ type, i: 300 });
		}
	});

	it('reject a type from a newer build', () => {
		expect(decodeEvent(new Uint8Array([99, 0, 0]))).toBeNull();
	});
});

describe('keyframes', () => {
	it('round-trip the shift and everything contested', () => {
		const contest = freshContest(70, 6, 10);
		contest.cans[3] = true;
		contest.cans[69] = true;
		contest.bins[5] = true;
		contest.gems[0] = 2;
		contest.gems[9] = 0;
		const k = { shift: 2, startAt: 987654, contest };
		expect(decodeKeyframe(encodeKeyframe(k))).toEqual(k);
	});
});
